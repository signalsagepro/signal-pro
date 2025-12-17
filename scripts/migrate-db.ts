/**
 * Database Migration Script
 * 
 * This script helps migrate to a new database:
 * 1. Creates schema on new database
 * 2. Seeds initial data (assets, admin user)
 * 
 * Usage:
 * NEW_DATABASE_URL="postgresql://..." npx tsx scripts/migrate-db.ts
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { assets, users, strategies, notificationConfigs } from "../shared/schema";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const NEW_DATABASE_URL = process.env.NEW_DATABASE_URL;

if (!NEW_DATABASE_URL) {
  console.error("❌ NEW_DATABASE_URL environment variable is required");
  console.log("\nUsage:");
  console.log('  NEW_DATABASE_URL="postgresql://..." npx tsx scripts/migrate-db.ts');
  process.exit(1);
}

const client = neon(NEW_DATABASE_URL);
const db = drizzle(client);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

// Initial assets to seed
const initialAssets = [
  { symbol: "UPL", name: "UPL Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 2889473, enabled: true },
  { symbol: "POLICYBZR", name: "PB Fintech Limited (Policy Bazaar)", type: "indian_stock", exchange: "NSE", instrumentToken: 6856961, enabled: true },
  { symbol: "RELIANCE", name: "Reliance Industries Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 738561, enabled: true },
  { symbol: "BANKBARODA", name: "Bank of Baroda", type: "indian_stock", exchange: "NSE", instrumentToken: 1195009, enabled: true },
  { symbol: "CANBK", name: "Canara Bank", type: "indian_stock", exchange: "NSE", instrumentToken: 2763265, enabled: true },
  { symbol: "HAL", name: "Hindustan Aeronautics Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 2303745, enabled: true },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 2952193, enabled: true },
  { symbol: "PETRONET", name: "Petronet LNG Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 2905857, enabled: true },
  { symbol: "JUBLFOOD", name: "Jubilant FoodWorks Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 4632577, enabled: true },
  { symbol: "VEDL", name: "Vedanta Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 784129, enabled: true },
  { symbol: "EXIDEIND", name: "Exide Industries Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 173057, enabled: true },
  { symbol: "CIPLA", name: "Cipla Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 177665, enabled: true },
  { symbol: "TATACHEM", name: "Tata Chemicals Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 871681, enabled: true },
  { symbol: "TATASTEEL", name: "Tata Steel Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 895745, enabled: true },
  { symbol: "INFY", name: "Infosys Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 408065, enabled: true },
];

// Initial strategies
const initialStrategies = [
  {
    name: "EMA Crossover 50/200",
    description: "Classic EMA crossover strategy using 50 and 200 period EMAs",
    timeframe: "5m",
    type: "ema_crossover",
    enabled: true,
    formula: "EMA_50 > EMA_200",
    parameters: { ema_short: 50, ema_long: 200 },
    conditions: [],
  },
];

async function migrateDatabase() {
  console.log("🚀 Starting database migration...\n");

  try {
    // Step 1: Push schema (run drizzle-kit push separately)
    console.log("📋 Step 1: Schema");
    console.log("   Run this command first to create tables:");
    console.log(`   NEW_DATABASE_URL="${NEW_DATABASE_URL!.substring(0, 50)}..." npm run db:push\n`);

    // Step 2: Create admin user
    console.log("👤 Step 2: Creating admin user...");
    const adminEmail = "admin@signalpro.com";
    const adminPassword = "admin123";
    const hashedPassword = await hashPassword(adminPassword);

    try {
      await db.insert(users).values({
        email: adminEmail,
        password: hashedPassword,
        name: "Admin",
        role: "admin",
      });
      console.log(`   ✅ Admin user created: ${adminEmail} / ${adminPassword}\n`);
    } catch (e: any) {
      if (e.message?.includes("duplicate") || e.message?.includes("unique")) {
        console.log(`   ⚠️  Admin user already exists\n`);
      } else {
        throw e;
      }
    }

    // Step 3: Seed assets
    console.log("📊 Step 3: Seeding assets...");
    for (const asset of initialAssets) {
      try {
        await db.insert(assets).values(asset);
        console.log(`   ✅ ${asset.symbol} - ${asset.name}`);
      } catch (e: any) {
        if (e.message?.includes("duplicate") || e.message?.includes("unique")) {
          console.log(`   ⚠️  ${asset.symbol} already exists`);
        } else {
          console.log(`   ❌ ${asset.symbol} failed: ${e.message}`);
        }
      }
    }
    console.log();

    // Step 4: Seed strategies
    console.log("📈 Step 4: Seeding strategies...");
    for (const strategy of initialStrategies) {
      try {
        await db.insert(strategies).values(strategy);
        console.log(`   ✅ ${strategy.name}`);
      } catch (e: any) {
        if (e.message?.includes("duplicate") || e.message?.includes("unique")) {
          console.log(`   ⚠️  ${strategy.name} already exists`);
        } else {
          console.log(`   ❌ ${strategy.name} failed: ${e.message}`);
        }
      }
    }
    console.log();

    console.log("✅ Migration complete!\n");
    console.log("📝 Next steps:");
    console.log("   1. Update your .env or environment with the new DATABASE_URL");
    console.log("   2. Restart your server");
    console.log(`   3. Login with: ${adminEmail} / ${adminPassword}`);
    console.log("   4. Change your password after logging in!");

  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

migrateDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
