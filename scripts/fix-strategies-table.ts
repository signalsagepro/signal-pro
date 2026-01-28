/**
 * Fix Strategies Table Script
 * Adds missing is_custom column and fixes conditions column constraint
 */

import pg from "pg";

const DATABASE_URL = "postgresql://ss_ren_user:qvajENVHM6sFBmfEluRUzDh9NKtStLHd@dpg-d5o6uek9c44c739dclag-a.oregon-postgres.render.com/ss_ren";

async function fixStrategiesTable() {
  console.log("🔧 Fixing strategies table...\n");

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    // Add is_custom column
    console.log("📋 Adding is_custom column...");
    try {
      await client.query(`
        ALTER TABLE strategies 
        ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT false
      `);
      console.log("   ✅ is_custom column added");
    } catch (e: any) {
      console.log(`   ⚠️ ${e.message}`);
    }

    // Update existing strategies to set is_custom = false
    console.log("\n🔧 Updating existing strategies...");
    await client.query(`UPDATE strategies SET is_custom = false WHERE is_custom IS NULL`);
    console.log("   ✅ Existing strategies updated");

    // Fix conditions column - make it NOT NULL with default empty object
    console.log("\n🔧 Fixing conditions column...");
    try {
      // First, set any NULL conditions to empty JSON object
      await client.query(`UPDATE strategies SET conditions = '{}' WHERE conditions IS NULL`);
      console.log("   ✅ NULL conditions updated to {}");
      
      // Then alter the column to NOT NULL
      await client.query(`ALTER TABLE strategies ALTER COLUMN conditions SET NOT NULL`);
      console.log("   ✅ conditions column set to NOT NULL");
      
      // Set default value
      await client.query(`ALTER TABLE strategies ALTER COLUMN conditions SET DEFAULT '{}'`);
      console.log("   ✅ conditions default set to {}");
    } catch (e: any) {
      console.log(`   ⚠️ ${e.message}`);
    }

    // Verify the changes
    console.log("\n📋 Verifying table structure:");
    const tableInfo = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'strategies' AND column_name IN ('is_custom', 'conditions')
      ORDER BY column_name
    `);
    
    for (const col of tableInfo.rows) {
      console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}, default: ${col.column_default || 'none'})`);
    }

    // Test creating a strategy
    console.log("\n🧪 Testing strategy creation...");
    try {
      const result = await client.query(`
        INSERT INTO strategies (name, description, type, timeframe, enabled, conditions, is_custom, formula)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, name, is_custom
      `, [
        "Test Custom Strategy",
        "Test strategy to verify table fix",
        "custom_test",
        "5m",
        true,
        JSON.stringify({ price_above_ema50: true }),
        true,
        "price > ema50"
      ]);

      console.log(`   ✅ Test strategy created successfully!`);
      console.log(`   ID: ${result.rows[0].id}`);
      console.log(`   Name: ${result.rows[0].name}`);
      console.log(`   Is Custom: ${result.rows[0].is_custom}`);

      // Delete test strategy
      await client.query(`DELETE FROM strategies WHERE id = $1`, [result.rows[0].id]);
      console.log(`   🗑️  Test strategy deleted`);

    } catch (error: any) {
      console.log(`   ❌ Test failed: ${error.message}`);
    }

    console.log("\n✅ Strategies table fixed!");
    console.log("\n📝 You can now:");
    console.log("   1. Add custom strategies from the UI");
    console.log("   2. Use the Advanced Strategy Builder");
    console.log("   3. Add preset strategies");

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixStrategiesTable()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
