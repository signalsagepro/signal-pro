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

async function checkBrokerConfigs() {
  console.log("🔍 Checking broker configurations...\n");

  const client = await pool.connect();

  try {
    const result = await client.query("SELECT * FROM broker_configs ORDER BY name");
    
    if (result.rows.length === 0) {
      console.log("⚠️  No broker configs found in database!");
      console.log("\nCreating default broker configs...\n");
      
      // Create Zerodha config
      await client.query(
        `INSERT INTO broker_configs (name, type, enabled, connected) 
         VALUES ($1, $2, $3, $4)`,
        ["zerodha", "indian", false, false]
      );
      console.log("✅ Created Zerodha config");
      
      // Create Upstox config
      await client.query(
        `INSERT INTO broker_configs (name, type, enabled, connected) 
         VALUES ($1, $2, $3, $4)`,
        ["upstox", "indian", false, false]
      );
      console.log("✅ Created Upstox config");
      
      // Create Angel config
      await client.query(
        `INSERT INTO broker_configs (name, type, enabled, connected) 
         VALUES ($1, $2, $3, $4)`,
        ["angel", "indian", false, false]
      );
      console.log("✅ Created Angel config");
      
      // Create Finnhub config
      await client.query(
        `INSERT INTO broker_configs (name, type, enabled, connected) 
         VALUES ($1, $2, $3, $4)`,
        ["finnhub", "finnhub", false, false]
      );
      console.log("✅ Created Finnhub config");
      
      console.log("\n✅ All broker configs created!");
    } else {
      console.log(`Found ${result.rows.length} broker config(s):\n`);
      
      for (const row of result.rows) {
        console.log(`📊 ${row.name} (${row.type})`);
        console.log(`   ID: ${row.id}`);
        console.log(`   Enabled: ${row.enabled}`);
        console.log(`   Connected: ${row.connected}`);
        console.log(`   API Key: ${row.api_key ? '✓ Set' : '✗ Not set'}`);
        console.log(`   API Secret: ${row.api_secret ? '✓ Set' : '✗ Not set'}`);
        console.log(`   Metadata: ${row.metadata ? JSON.stringify(row.metadata) : 'null'}`);
        console.log();
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

checkBrokerConfigs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
