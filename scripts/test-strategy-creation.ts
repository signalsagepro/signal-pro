/**
 * Test Strategy Creation Script
 * Tests creating a strategy directly in the database to identify issues
 */

import pg from "pg";

const DATABASE_URL = "postgresql://ss_ren_user:qvajENVHM6sFBmfEluRUzDh9NKtStLHd@dpg-d5o6uek9c44c739dclag-a.oregon-postgres.render.com/ss_ren";

async function testStrategyCreation() {
  console.log("🧪 Testing strategy creation...\n");

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    // Check current strategies
    console.log("📋 Current strategies:");
    const current = await client.query(`SELECT id, name, type, timeframe, enabled FROM strategies ORDER BY name`);
    console.log(`   Total: ${current.rows.length} strategies`);
    for (const row of current.rows) {
      console.log(`   - ${row.name} (${row.type}, ${row.timeframe})`);
    }

    // Check table structure
    console.log("\n🔍 Checking strategies table structure:");
    const tableInfo = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'strategies'
      ORDER BY ordinal_position
    `);
    
    console.log("   Columns:");
    for (const col of tableInfo.rows) {
      console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}, default: ${col.column_default || 'none'})`);
    }

    // Try to create a test strategy
    console.log("\n🧪 Attempting to create test strategy...");
    try {
      const testStrategy = {
        name: "Test Strategy - Custom",
        description: "Test strategy created by script",
        type: "custom_test",
        timeframe: "5m",
        enabled: true,
        conditions: JSON.stringify({ price_above_ema50: true }),
        is_custom: true,
        formula: "price > ema50",
        signal_count: 0,
      };

      const result = await client.query(`
        INSERT INTO strategies (name, description, type, timeframe, enabled, conditions, is_custom, formula, signal_count)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, name, type
      `, [
        testStrategy.name,
        testStrategy.description,
        testStrategy.type,
        testStrategy.timeframe,
        testStrategy.enabled,
        testStrategy.conditions,
        testStrategy.is_custom,
        testStrategy.formula,
        testStrategy.signal_count,
      ]);

      console.log(`   ✅ Strategy created successfully!`);
      console.log(`   ID: ${result.rows[0].id}`);
      console.log(`   Name: ${result.rows[0].name}`);
      console.log(`   Type: ${result.rows[0].type}`);

      // Delete the test strategy
      await client.query(`DELETE FROM strategies WHERE id = $1`, [result.rows[0].id]);
      console.log(`   🗑️  Test strategy deleted`);

    } catch (error: any) {
      console.log(`   ❌ Failed to create strategy: ${error.message}`);
      console.log(`   Error code: ${error.code}`);
      console.log(`   Detail: ${error.detail || 'N/A'}`);
    }

    // Check for any constraints or triggers
    console.log("\n🔍 Checking constraints:");
    const constraints = await client.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'strategies'
    `);
    
    for (const c of constraints.rows) {
      console.log(`   - ${c.constraint_name}: ${c.constraint_type}`);
    }

    console.log("\n✅ Test complete!");

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

testStrategyCreation()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
