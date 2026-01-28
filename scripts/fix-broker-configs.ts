/**
 * Fix Broker Configs Script
 * Updates broker configs to have proper structure and enables them
 */

import pg from "pg";

const DATABASE_URL = "postgresql://ss_ren_user:qvajENVHM6sFBmfEluRUzDh9NKtStLHd@dpg-d5o6uek9c44c739dclag-a.oregon-postgres.render.com/ss_ren";

async function fixBrokerConfigs() {
  console.log("🔧 Fixing broker configurations...\n");

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    // First, add missing columns if they don't exist
    console.log("🔧 Adding missing columns to broker_configs...");
    
    // Add api_key column
    try {
      await client.query(`ALTER TABLE broker_configs ADD COLUMN IF NOT EXISTS api_key TEXT`);
      console.log("   ✅ api_key column added/exists");
    } catch (e: any) {
      console.log(`   ⚠️ api_key: ${e.message}`);
    }
    
    // Add api_secret column
    try {
      await client.query(`ALTER TABLE broker_configs ADD COLUMN IF NOT EXISTS api_secret TEXT`);
      console.log("   ✅ api_secret column added/exists");
    } catch (e: any) {
      console.log(`   ⚠️ api_secret: ${e.message}`);
    }
    
    // Add metadata column
    try {
      await client.query(`ALTER TABLE broker_configs ADD COLUMN IF NOT EXISTS metadata JSONB`);
      console.log("   ✅ metadata column added/exists");
    } catch (e: any) {
      console.log(`   ⚠️ metadata: ${e.message}`);
    }
    
    // Add last_connected column
    try {
      await client.query(`ALTER TABLE broker_configs ADD COLUMN IF NOT EXISTS last_connected TIMESTAMP`);
      console.log("   ✅ last_connected column added/exists");
    } catch (e: any) {
      console.log(`   ⚠️ last_connected: ${e.message}`);
    }

    // Check current broker configs
    console.log("\n📋 Current broker configs:");
    const current = await client.query(`SELECT id, name, type, enabled, connected FROM broker_configs`);
    for (const row of current.rows) {
      console.log(`   - ${row.name}: enabled=${row.enabled}, connected=${row.connected}`);
    }

    // Enable Zerodha and set it up for OAuth
    console.log("\n🔧 Enabling Zerodha for OAuth connection...");
    await client.query(`
      UPDATE broker_configs 
      SET enabled = true, 
          updated_at = NOW()
      WHERE name = 'zerodha'
    `);
    console.log("   ✅ Zerodha enabled");

    // Enable other Indian brokers
    console.log("\n🔧 Enabling other brokers...");
    await client.query(`
      UPDATE broker_configs 
      SET enabled = true,
          updated_at = NOW()
      WHERE name IN ('upstox', 'angel', 'finnhub')
    `);
    console.log("   ✅ Upstox, Angel, Finnhub enabled");

    // Show updated configs
    console.log("\n📋 Updated broker configs:");
    const updated = await client.query(`SELECT id, name, type, enabled, connected, api_key, api_secret FROM broker_configs`);
    for (const row of updated.rows) {
      console.log(`   - ${row.name}: enabled=${row.enabled}, connected=${row.connected}`);
    }

    console.log("\n✅ Broker configs fixed!");
    console.log("\n📝 Next steps:");
    console.log("   1. Make sure DATABASE_URL is set in your .env file");
    console.log("   2. Run the app: npm run dev");
    console.log("   3. Go to Broker Config page");
    console.log("   4. For Zerodha: Enter API Key & API Secret, then click 'Connect'");
    console.log("   5. Complete the Zerodha OAuth login");

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixBrokerConfigs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
