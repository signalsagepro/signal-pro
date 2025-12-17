/**
 * Database Migration Script for Render PostgreSQL
 */

import pg from "pg";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is required");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

// Initial assets to seed
const initialAssets = [
  { symbol: "UPL", name: "UPL Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 2889473 },
  { symbol: "POLICYBZR", name: "PB Fintech Limited (Policy Bazaar)", type: "indian_stock", exchange: "NSE", instrumentToken: 6856961 },
  { symbol: "RELIANCE", name: "Reliance Industries Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 738561 },
  { symbol: "BANKBARODA", name: "Bank of Baroda", type: "indian_stock", exchange: "NSE", instrumentToken: 1195009 },
  { symbol: "CANBK", name: "Canara Bank", type: "indian_stock", exchange: "NSE", instrumentToken: 2763265 },
  { symbol: "HAL", name: "Hindustan Aeronautics Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 2303745 },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 2952193 },
  { symbol: "PETRONET", name: "Petronet LNG Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 2905857 },
  { symbol: "JUBLFOOD", name: "Jubilant FoodWorks Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 4632577 },
  { symbol: "VEDL", name: "Vedanta Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 784129 },
  { symbol: "EXIDEIND", name: "Exide Industries Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 173057 },
  { symbol: "CIPLA", name: "Cipla Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 177665 },
  { symbol: "TATACHEM", name: "Tata Chemicals Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 871681 },
  { symbol: "TATASTEEL", name: "Tata Steel Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 895745 },
  { symbol: "INFY", name: "Infosys Limited", type: "indian_stock", exchange: "NSE", instrumentToken: 408065 },
];

async function migrateDatabase() {
  console.log("🚀 Starting database migration to Render...\n");

  const client = await pool.connect();

  try {
    // Step 1: Create admin user
    console.log("👤 Creating admin user...");
    const adminEmail = "admin@signalpro.com";
    const adminPassword = "admin123";
    const hashedPassword = await hashPassword(adminPassword);

    try {
      await client.query(
        `INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET password = $2`,
        [adminEmail, hashedPassword, "Admin", "admin"]
      );
      console.log(`   ✅ Admin: ${adminEmail} / ${adminPassword}\n`);
    } catch (e: any) {
      console.log(`   ⚠️  ${e.message}\n`);
    }

    // Step 2: Seed assets
    console.log("📊 Seeding assets...");
    for (const asset of initialAssets) {
      try {
        await client.query(
          `INSERT INTO assets (symbol, name, type, exchange, instrument_token, enabled) 
           VALUES ($1, $2, $3, $4, $5, true)
           ON CONFLICT (symbol) DO UPDATE SET instrument_token = $5`,
          [asset.symbol, asset.name, asset.type, asset.exchange, asset.instrumentToken]
        );
        console.log(`   ✅ ${asset.symbol}`);
      } catch (e: any) {
        console.log(`   ❌ ${asset.symbol}: ${e.message}`);
      }
    }
    console.log();

    // Step 3: Seed default strategy
    console.log("📈 Creating default strategy...");
    try {
      await client.query(
        `INSERT INTO strategies (name, description, timeframe, type, enabled, formula, parameters, conditions) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING`,
        [
          "EMA Crossover 50/200",
          "Classic EMA crossover strategy",
          "5m",
          "ema_crossover",
          true,
          "EMA_50 > EMA_200",
          JSON.stringify({ ema_short: 50, ema_long: 200 }),
          JSON.stringify([]),
        ]
      );
      console.log("   ✅ EMA Crossover 50/200\n");
    } catch (e: any) {
      console.log(`   ⚠️  ${e.message}\n`);
    }

    console.log("✅ Migration complete!\n");
    console.log("📝 Your new DATABASE_URL:");
    console.log(`   ${DATABASE_URL}\n`);
    console.log("🔐 Login credentials:");
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log("\n⚠️  Change your password after logging in!");

  } finally {
    client.release();
    await pool.end();
  }
}

migrateDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
