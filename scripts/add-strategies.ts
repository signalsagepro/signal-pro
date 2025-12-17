import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is required");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const strategies = [
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

async function addStrategies() {
  console.log("📈 Adding default strategies...\n");

  const client = await pool.connect();

  try {
    for (const strategy of strategies) {
      try {
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
        console.log(`   ✅ ${strategy.name}`);
      } catch (e: any) {
        console.log(`   ❌ ${strategy.name}: ${e.message}`);
      }
    }

    console.log(`\n✅ Successfully added ${strategies.length} strategies!`);
  } finally {
    client.release();
    await pool.end();
  }
}

addStrategies()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
