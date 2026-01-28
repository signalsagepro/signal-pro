/**
 * Debug Login Script
 * Checks the database user and tests password verification
 */

import pg from "pg";
import bcrypt from "bcrypt";

const DATABASE_URL = "postgresql://ss_ren_user:qvajENVHM6sFBmfEluRUzDh9NKtStLHd@dpg-d5o6uek9c44c739dclag-a.oregon-postgres.render.com/ss_ren";

async function debugLogin() {
  console.log("🔍 Debugging login issue...\n");

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    // Step 1: Check if user exists
    console.log("1️⃣ Checking if admin user exists...");
    const result = await client.query(
      `SELECT id, email, password, name, role FROM users WHERE email = $1`,
      ["admin@signalpro.com"]
    );

    if (result.rows.length === 0) {
      console.log("   ❌ Admin user NOT FOUND in database!");
      console.log("   Creating admin user now...\n");
      
      // Create the user
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await client.query(
        `INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4)`,
        ["admin@signalpro.com", hashedPassword, "Admin", "admin"]
      );
      console.log("   ✅ Admin user created!");
    } else {
      const user = result.rows[0];
      console.log(`   ✅ User found: ${user.email}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Password hash (first 20 chars): ${user.password.substring(0, 20)}...`);
      console.log(`   Password hash length: ${user.password.length}`);
      
      // Check if it's bcrypt format
      const isBcrypt = user.password.startsWith('$2');
      console.log(`   Is bcrypt format: ${isBcrypt}`);
      
      if (!isBcrypt) {
        console.log("\n   ⚠️ Password is NOT in bcrypt format! Updating...");
        const hashedPassword = await bcrypt.hash("admin123", 10);
        await client.query(
          `UPDATE users SET password = $1 WHERE email = $2`,
          [hashedPassword, "admin@signalpro.com"]
        );
        console.log("   ✅ Password updated to bcrypt format!");
      }

      // Step 2: Test password verification
      console.log("\n2️⃣ Testing password verification...");
      const testPassword = "admin123";
      
      // Re-fetch the user to get the latest password
      const freshResult = await client.query(
        `SELECT password FROM users WHERE email = $1`,
        ["admin@signalpro.com"]
      );
      const freshPassword = freshResult.rows[0].password;
      
      console.log(`   Testing password: "${testPassword}"`);
      console.log(`   Against hash: ${freshPassword.substring(0, 30)}...`);
      
      try {
        const isValid = await bcrypt.compare(testPassword, freshPassword);
        console.log(`   Verification result: ${isValid ? '✅ SUCCESS' : '❌ FAILED'}`);
        
        if (!isValid) {
          console.log("\n   🔧 Re-hashing password...");
          const newHash = await bcrypt.hash(testPassword, 10);
          await client.query(
            `UPDATE users SET password = $1 WHERE email = $2`,
            [newHash, "admin@signalpro.com"]
          );
          
          // Test again
          const verifyAgain = await bcrypt.compare(testPassword, newHash);
          console.log(`   New verification result: ${verifyAgain ? '✅ SUCCESS' : '❌ FAILED'}`);
        }
      } catch (e: any) {
        console.log(`   ❌ bcrypt.compare error: ${e.message}`);
        console.log("   🔧 Re-creating password hash...");
        const newHash = await bcrypt.hash(testPassword, 10);
        await client.query(
          `UPDATE users SET password = $1 WHERE email = $2`,
          [newHash, "admin@signalpro.com"]
        );
        console.log("   ✅ Password hash recreated!");
      }
    }

    // Step 3: Show all users
    console.log("\n3️⃣ All users in database:");
    const allUsers = await client.query(`SELECT id, email, name, role FROM users`);
    for (const u of allUsers.rows) {
      console.log(`   - ${u.email} (${u.role})`);
    }

    console.log("\n✅ Debug complete!");
    console.log("\n🔐 Login credentials:");
    console.log("   Email: admin@signalpro.com");
    console.log("   Password: admin123");

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

debugLogin()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
