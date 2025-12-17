import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { assets } from "../shared/schema";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const client = neon(DATABASE_URL);
const db = drizzle(client);

// Verified NSE stocks with correct symbols and instrument tokens
const stocksToAdd = [
  {
    symbol: "UPL",
    name: "UPL Limited",
    type: "indian_stock",
    exchange: "NSE",
    instrumentToken: 2889473,
    enabled: true,
  },
  {
    symbol: "POLICYBZR",
    name: "PB Fintech Limited (Policy Bazaar)",
    type: "indian_stock",
    exchange: "NSE",
    instrumentToken: 6856961,
    enabled: true,
  },
  {
    symbol: "RELIANCE",
    name: "Reliance Industries Limited",
    type: "indian_stock",
    exchange: "NSE",
    instrumentToken: 738561,
    enabled: true,
  },
  {
    symbol: "BANKBARODA",
    name: "Bank of Baroda",
    type: "indian_stock",
    exchange: "NSE",
    instrumentToken: 1195009,
    enabled: true,
  },
  {
    symbol: "CANBK",
    name: "Canara Bank",
    type: "indian_stock",
    exchange: "NSE",
    instrumentToken: 2763265,
    enabled: true,
  },
  {
    symbol: "HAL",
    name: "Hindustan Aeronautics Limited",
    type: "indian_stock",
    exchange: "NSE",
    instrumentToken: 2303745,
    enabled: true,
  },
  {
    symbol: "ULTRACEMCO",
    name: "UltraTech Cement Limited",
    type: "indian_stock",
    exchange: "NSE",
    instrumentToken: 2952193,
    enabled: true,
  },
  {
    symbol: "PETRONET",
    name: "Petronet LNG Limited",
    type: "indian_stock",
    exchange: "NSE",
    instrumentToken: 2905857,
    enabled: true,
  },
  {
    symbol: "JUBLFOOD",
    name: "Jubilant FoodWorks Limited",
    type: "indian_stock",
    exchange: "NSE",
    instrumentToken: 4632577,
    enabled: true,
  },
  {
    symbol: "VEDL",
    name: "Vedanta Limited",
    type: "indian_stock",
    exchange: "NSE",
    instrumentToken: 784129,
    enabled: true,
  },
  {
    symbol: "EXIDEIND",
    name: "Exide Industries Limited",
    type: "indian_stock",
    exchange: "NSE",
    instrumentToken: 173057,
    enabled: true,
  },
  {
    symbol: "CIPLA",
    name: "Cipla Limited",
    type: "indian_stock",
    exchange: "NSE",
    instrumentToken: 177665,
    enabled: true,
  },
  {
    symbol: "TATACHEM",
    name: "Tata Chemicals Limited",
    type: "indian_stock",
    exchange: "NSE",
    instrumentToken: 871681,
    enabled: true,
  },
  {
    symbol: "TATASTEEL",
    name: "Tata Steel Limited",
    type: "indian_stock",
    exchange: "NSE",
    instrumentToken: 895745,
    enabled: true,
  },
  {
    symbol: "INFY",
    name: "Infosys Limited",
    type: "indian_stock",
    exchange: "NSE",
    instrumentToken: 408065,
    enabled: true,
  },
];

async function seedAssets() {
  console.log("🗑️  Clearing existing assets...");
  
  // Delete all existing assets
  await db.delete(assets);
  
  console.log("📝 Inserting new assets...");
  
  // Insert new assets
  for (const stock of stocksToAdd) {
    await db.insert(assets).values(stock);
    console.log(`  ✅ ${stock.symbol} - ${stock.name}`);
  }
  
  console.log(`\n✅ Successfully added ${stocksToAdd.length} assets!`);
}

seedAssets()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error seeding assets:", error);
    process.exit(1);
  });
