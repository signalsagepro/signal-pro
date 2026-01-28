/**
 * Check Database Configurations Script
 * Verifies broker configs, notification configs, and strategies in the database
 */

import pg from "pg";

const DATABASE_URL = "postgresql://ss_ren_user:qvajENVHM6sFBmfEluRUzDh9NKtStLHd@dpg-d5o6uek9c44c739dclag-a.oregon-postgres.render.com/ss_ren";

async function checkConfigs() {
  console.log("🔍 Checking database configurations...\n");

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    // Check broker configs
    console.log("═══════════════════════════════════════════════════════════");
    console.log("📡 BROKER CONFIGS:");
    console.log("═══════════════════════════════════════════════════════════");
    const brokers = await client.query(`SELECT * FROM broker_configs ORDER BY name`);
    if (brokers.rows.length === 0) {
      console.log("   ❌ No broker configs found!");
    } else {
      for (const b of brokers.rows) {
        console.log(`\n   📌 ${b.name.toUpperCase()}`);
        console.log(`      ID: ${b.id}`);
        console.log(`      Type: ${b.type}`);
        console.log(`      Enabled: ${b.enabled}`);
        console.log(`      Connected: ${b.connected}`);
        console.log(`      Config: ${JSON.stringify(b.config)}`);
      }
    }

    // Check notification configs
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("🔔 NOTIFICATION CONFIGS:");
    console.log("═══════════════════════════════════════════════════════════");
    const notifications = await client.query(`SELECT * FROM notification_configs ORDER BY channel`);
    if (notifications.rows.length === 0) {
      console.log("   ❌ No notification configs found!");
    } else {
      for (const n of notifications.rows) {
        console.log(`\n   📌 ${n.channel.toUpperCase()}`);
        console.log(`      ID: ${n.id}`);
        console.log(`      Enabled: ${n.enabled}`);
        console.log(`      Test Status: ${n.test_status || 'N/A'}`);
        console.log(`      Config: ${JSON.stringify(n.config)}`);
      }
    }

    // Check strategies
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("📈 STRATEGIES:");
    console.log("═══════════════════════════════════════════════════════════");
    const strategies = await client.query(`SELECT * FROM strategies ORDER BY name`);
    if (strategies.rows.length === 0) {
      console.log("   ❌ No strategies found!");
    } else {
      for (const s of strategies.rows) {
        console.log(`\n   📌 ${s.name}`);
        console.log(`      ID: ${s.id}`);
        console.log(`      Type: ${s.type}`);
        console.log(`      Timeframe: ${s.timeframe}`);
        console.log(`      Enabled: ${s.enabled}`);
        console.log(`      Formula: ${s.formula}`);
      }
    }

    // Check assets
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("💹 ASSETS:");
    console.log("═══════════════════════════════════════════════════════════");
    const assets = await client.query(`SELECT * FROM assets ORDER BY symbol`);
    if (assets.rows.length === 0) {
      console.log("   ❌ No assets found!");
    } else {
      console.log(`   Total: ${assets.rows.length} assets`);
      for (const a of assets.rows) {
        console.log(`   - ${a.symbol}: ${a.name} (${a.exchange}, token: ${a.instrument_token}, enabled: ${a.enabled})`);
      }
    }

    // Summary
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("📊 SUMMARY:");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`   Broker Configs: ${brokers.rows.length}`);
    console.log(`   Notification Configs: ${notifications.rows.length}`);
    console.log(`   Strategies: ${strategies.rows.length}`);
    console.log(`   Assets: ${assets.rows.length}`);

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkConfigs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
