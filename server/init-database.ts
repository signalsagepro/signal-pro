/**
 * Database Initialization Module
 * Automatically checks for required data and runs migration if needed
 */

import pg from "pg";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

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

const initialStrategies = [
  {
    name: "15m Bullish - Price Above 50 EMA (Uptrend)",
    description: "15 min timeframe: Candle closes above 50 EMA when EMA50 > EMA200. Confirms strong uptrend with Price >= 50 EMA > 200 EMA.",
    timeframe: "15m",
    type: "ema_crossover",
    enabled: true,
    formula: "CLOSE >= EMA_50 AND EMA_50 > EMA_200",
    conditions: JSON.stringify([
      { indicator: "CLOSE", comparison: ">=", value: "EMA_50" },
      { indicator: "EMA_50", comparison: ">", value: "EMA_200" }
    ]),
  },
  {
    name: "5m Bullish - Price Above 200 EMA (Reversal)",
    description: "5 min timeframe: Candle closes above or on 200 EMA when EMA200 > EMA50. Potential reversal with Price >= 200 EMA > 50 EMA.",
    timeframe: "5m",
    type: "ema_crossover",
    enabled: true,
    formula: "CLOSE >= EMA_200 AND EMA_200 > EMA_50",
    conditions: JSON.stringify([
      { indicator: "CLOSE", comparison: ">=", value: "EMA_200" },
      { indicator: "EMA_200", comparison: ">", value: "EMA_50" }
    ]),
  },
  {
    name: "5m Pullback - Price Touches 200 EMA (Uptrend)",
    description: "5 min timeframe: Price crosses below 50 EMA and touches/closes at 200 EMA in uptrend. Pullback opportunity with 50 EMA > Price >= 200 EMA.",
    timeframe: "5m",
    type: "ema_pullback",
    enabled: true,
    formula: "(LOW <= EMA_200 OR CLOSE >= EMA_200) AND EMA_50 > EMA_200",
    conditions: JSON.stringify([
      { indicator: "LOW", comparison: "<=", value: "EMA_200", logic: "OR" },
      { indicator: "CLOSE", comparison: ">=", value: "EMA_200" },
      { indicator: "EMA_50", comparison: ">", value: "EMA_200" }
    ]),
  },
  {
    name: "5m Bearish - Price Below 200 EMA (Uptrend Break)",
    description: "5 min timeframe: Candle closes on or below 200 EMA when 50 EMA > 200 EMA. Potential trend break with 50 EMA > 200 EMA >= Price.",
    timeframe: "5m",
    type: "ema_breakdown",
    enabled: true,
    formula: "CLOSE <= EMA_200 AND EMA_50 > EMA_200",
    conditions: JSON.stringify([
      { indicator: "CLOSE", comparison: "<=", value: "EMA_200" },
      { indicator: "EMA_50", comparison: ">", value: "EMA_200" }
    ]),
  },
  {
    name: "5m Bearish Pullback - Price Touches 200 EMA (Downtrend)",
    description: "5 min timeframe: Price touches/closes on 200 EMA in downtrend (EMA200 > EMA50 > Price). Bearish pullback with EMA 200 > EMA 50, Price touches 200.",
    timeframe: "5m",
    type: "ema_pullback",
    enabled: true,
    formula: "(LOW <= EMA_200 OR CLOSE >= EMA_200) AND EMA_200 > EMA_50",
    conditions: JSON.stringify([
      { indicator: "LOW", comparison: "<=", value: "EMA_200", logic: "OR" },
      { indicator: "CLOSE", comparison: ">=", value: "EMA_200" },
      { indicator: "EMA_200", comparison: ">", value: "EMA_50" }
    ]),
  },
  {
    name: "15m Bearish - Price Below 200 EMA (Downtrend)",
    description: "15 min timeframe: Candle closes below 200 EMA when 50 EMA > 200 EMA. Strong bearish signal with 50 EMA > 200 EMA > Price.",
    timeframe: "15m",
    type: "ema_breakdown",
    enabled: true,
    formula: "CLOSE < EMA_200 AND EMA_50 > EMA_200",
    conditions: JSON.stringify([
      { indicator: "CLOSE", comparison: "<", value: "EMA_200" },
      { indicator: "EMA_50", comparison: ">", value: "EMA_200" }
    ]),
  },
];

export async function initializeDatabase(databaseUrl: string): Promise<void> {
  console.log("[Init] Checking database initialization...");

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("render.com") || databaseUrl.includes("neon.tech") 
      ? { rejectUnauthorized: false } 
      : undefined,
  });

  const client = await pool.connect();

  try {
    // Check if admin user exists
    const userCheck = await client.query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
    const hasAdmin = parseInt(userCheck.rows[0].count) > 0;

    // Check if assets exist
    const assetCheck = await client.query("SELECT COUNT(*) FROM assets");
    const hasAssets = parseInt(assetCheck.rows[0].count) > 0;

    // Check if strategies exist
    const strategyCheck = await client.query("SELECT COUNT(*) FROM strategies");
    const hasStrategies = parseInt(strategyCheck.rows[0].count) > 0;

    // Check if broker configs exist
    const brokerCheck = await client.query("SELECT COUNT(*) FROM broker_configs");
    const hasBrokerConfigs = parseInt(brokerCheck.rows[0].count) > 0;

    if (hasAdmin && hasAssets && hasStrategies && hasBrokerConfigs) {
      console.log("[Init] ✅ Database already initialized");
      return;
    }

    console.log("[Init] 🔄 Running initial migration...\n");

    // Create admin user if missing
    if (!hasAdmin) {
      console.log("[Init] Creating admin user...");
      const adminEmail = "admin@signalpro.com";
      const adminPassword = "admin123";
      const hashedPassword = await hashPassword(adminPassword);

      await client.query(
        `INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING`,
        [adminEmail, hashedPassword, "Admin", "admin"]
      );
      console.log(`[Init] ✅ Admin: ${adminEmail} / ${adminPassword}`);
    }

    // Seed assets if missing
    if (!hasAssets) {
      console.log("[Init] Seeding assets...");
      for (const asset of initialAssets) {
        await client.query(
          `INSERT INTO assets (symbol, name, type, exchange, instrument_token, enabled) 
           VALUES ($1, $2, $3, $4, $5, true)
           ON CONFLICT (symbol) DO NOTHING`,
          [asset.symbol, asset.name, asset.type, asset.exchange, asset.instrumentToken]
        );
      }
      console.log(`[Init] ✅ Added ${initialAssets.length} assets`);
    }

    // Seed strategies if missing
    if (!hasStrategies) {
      console.log("[Init] Seeding strategies...");
      for (const strategy of initialStrategies) {
        await client.query(
          `INSERT INTO strategies (name, description, timeframe, type, enabled, formula, conditions) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            strategy.name,
            strategy.description,
            strategy.timeframe,
            strategy.type,
            strategy.enabled,
            strategy.formula,
            strategy.conditions,
          ]
        );
      }
      console.log(`[Init] ✅ Added ${initialStrategies.length} strategies`);
    }

    // Seed broker configs if missing
    if (!hasBrokerConfigs) {
      console.log("[Init] Seeding broker configs...");
      const brokers = [
        { name: "zerodha", type: "indian" },
        { name: "upstox", type: "indian" },
        { name: "angel", type: "indian" },
        { name: "finnhub", type: "finnhub" },
      ];
      
      for (const broker of brokers) {
        await client.query(
          `INSERT INTO broker_configs (name, type, enabled, connected) 
           VALUES ($1, $2, $3, $4)`,
          [broker.name, broker.type, false, false]
        );
      }
      console.log(`[Init] ✅ Added ${brokers.length} broker configs`);
    }

    console.log("[Init] ✅ Database initialization complete!\n");

  } catch (error) {
    console.error("[Init] ❌ Error during initialization:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
