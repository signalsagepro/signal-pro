/**
 * Complete Database Setup Script for Render PostgreSQL
 * Creates tables and seeds initial data with proper SSL handling
 */

import pg from "pg";
import bcrypt from "bcrypt";

const DATABASE_URL = "postgresql://ss_ren_user:qvajENVHM6sFBmfEluRUzDh9NKtStLHd@dpg-d5o6uek9c44c739dclag-a.oregon-postgres.render.com/ss_ren";

async function hashPassword(password: string): Promise<string> {
  const SALT_ROUNDS = 10;
  return bcrypt.hash(password, SALT_ROUNDS);
}

// SQL to create all tables
const createTablesSQL = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Assets table
CREATE TABLE IF NOT EXISTS assets (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  exchange TEXT,
  instrument_token INTEGER,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Strategies table
CREATE TABLE IF NOT EXISTS strategies (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  timeframe TEXT NOT NULL,
  type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  formula TEXT,
  parameters JSONB,
  conditions JSONB,
  signal_count INTEGER NOT NULL DEFAULT 0,
  merge_logic TEXT,
  merge_time_window INTEGER,
  linked_strategies JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Signals table
CREATE TABLE IF NOT EXISTS signals (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id VARCHAR NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  asset_id VARCHAR NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  timeframe TEXT NOT NULL,
  type TEXT NOT NULL,
  price REAL NOT NULL,
  ema50 REAL NOT NULL,
  ema200 REAL NOT NULL,
  metadata JSONB,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Broker configs table
CREATE TABLE IF NOT EXISTS broker_configs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  connected BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Notification configs table
CREATE TABLE IF NOT EXISTS notification_configs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL,
  test_status TEXT,
  last_tested TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Candle data table
CREATE TABLE IF NOT EXISTS candle_data (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id VARCHAR NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  timeframe TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  ema50 REAL,
  ema200 REAL
);

-- Logs table
CREATE TABLE IF NOT EXISTS logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id VARCHAR,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  level TEXT NOT NULL DEFAULT 'info',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Dashboard configs table
CREATE TABLE IF NOT EXISTS dashboard_configs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE DEFAULT 'global',
  config JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_signals_strategy_id ON signals(strategy_id);
CREATE INDEX IF NOT EXISTS idx_signals_asset_id ON signals(asset_id);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at);
CREATE INDEX IF NOT EXISTS idx_candle_data_asset_timeframe ON candle_data(asset_id, timeframe);
CREATE INDEX IF NOT EXISTS idx_candle_data_timestamp ON candle_data(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);
`;

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

// Initial strategies
const initialStrategies = [
  {
    name: "15m Bullish - Price Above 50 EMA (Uptrend)",
    description: "15 min timeframe: Candle closes above 50 EMA when EMA50 > EMA200. Confirms strong uptrend with Price >= 50 EMA > 200 EMA.",
    timeframe: "15m",
    type: "15m_above_50_bullish",
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
    type: "5m_above_200_reversal",
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
    type: "5m_pullback_to_200",
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
    type: "5m_below_200_bearish",
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
    type: "5m_touch_200_downtrend",
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
    type: "15m_below_200_breakdown",
    enabled: true,
    formula: "CLOSE < EMA_200 AND EMA_50 > EMA_200",
    conditions: JSON.stringify([
      { indicator: "CLOSE", comparison: "<", value: "EMA_200" },
      { indicator: "EMA_50", comparison: ">", value: "EMA_200" }
    ]),
  },
];

async function setupDatabase() {
  console.log("🚀 Setting up Render PostgreSQL database...\n");

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    // Step 1: Create all tables
    console.log("📋 Creating database tables...");
    await client.query(createTablesSQL);
    console.log("   ✅ All tables created successfully\n");

    // Step 2: Create admin user
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

    // Step 3: Seed assets
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

    // Step 4: Seed strategies
    console.log("📈 Creating strategies...");
    for (const strategy of initialStrategies) {
      try {
        await client.query(
          `INSERT INTO strategies (name, description, timeframe, type, enabled, formula, conditions) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
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
        console.log(`   ✅ ${strategy.name}`);
      } catch (e: any) {
        console.log(`   ❌ ${strategy.name}: ${e.message}`);
      }
    }
    console.log();

    // Step 5: Seed broker configs
    console.log("🔗 Creating broker configs...");
    const brokers = [
      { name: "zerodha", type: "indian" },
      { name: "upstox", type: "indian" },
      { name: "angel", type: "indian" },
      { name: "finnhub", type: "finnhub" },
    ];
    
    for (const broker of brokers) {
      try {
        await client.query(
          `INSERT INTO broker_configs (name, type, enabled, connected) 
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (name) DO NOTHING`,
          [broker.name, broker.type, false, false]
        );
        console.log(`   ✅ ${broker.name}`);
      } catch (e: any) {
        console.log(`   ❌ ${broker.name}: ${e.message}`);
      }
    }
    console.log();

    // Step 6: Seed notification configs
    console.log("📢 Creating notification configs...");
    const notifications = [
      { 
        channel: "telegram", 
        enabled: false,
        config: JSON.stringify({
          botToken: "",
          chatId: "",
          parseMode: "HTML"
        })
      },
      { 
        channel: "email", 
        enabled: false,
        config: JSON.stringify({
          smtpHost: "",
          smtpPort: 587,
          smtpUser: "",
          smtpPassword: "",
          fromEmail: "",
          toEmail: ""
        })
      },
      { 
        channel: "webhook", 
        enabled: false,
        config: JSON.stringify({
          url: "",
          method: "POST",
          headers: {}
        })
      },
      { 
        channel: "discord", 
        enabled: false,
        config: JSON.stringify({
          webhookUrl: ""
        })
      },
    ];
    
    for (const notification of notifications) {
      try {
        await client.query(
          `INSERT INTO notification_configs (channel, enabled, config) 
           VALUES ($1, $2, $3)
           ON CONFLICT (channel) DO NOTHING`,
          [notification.channel, notification.enabled, notification.config]
        );
        console.log(`   ✅ ${notification.channel}`);
      } catch (e: any) {
        console.log(`   ❌ ${notification.channel}: ${e.message}`);
      }
    }
    console.log();

    console.log("✅ Database setup complete!\n");
    console.log("📝 Your DATABASE_URL:");
    console.log(`   ${DATABASE_URL}\n`);
    console.log("🔐 Login credentials:");
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log("\n⚠️  Change your password after logging in!");
    console.log("\n📊 Database contains:");
    console.log(`   • ${initialAssets.length} stock assets`);
    console.log(`   • ${initialStrategies.length} trading strategies`);
    console.log(`   • ${brokers.length} broker configurations`);
    console.log(`   • ${notifications.length} notification channels`);

  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
