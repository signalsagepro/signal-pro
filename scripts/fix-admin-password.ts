/**
 * Fix Admin Password Script
 * Updates the admin user password to use bcrypt hashing (matching auth system)
 */

import pg from "pg";
import bcrypt from "bcrypt";

const DATABASE_URL = "postgresql://ss_ren_user:qvajENVHM6sFBmfEluRUzDh9NKtStLHd@dpg-d5o6uek9c44c739dclag-a.oregon-postgres.render.com/ss_ren";

async function hashPassword(password: string): Promise<string> {
  const SALT_ROUNDS = 10;
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function fixAdminPassword() {
  console.log("🔧 Fixing admin password with correct bcrypt hashing...\n");

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    const adminEmail = "admin@signalpro.com";
    const adminPassword = "admin123";
    const hashedPassword = await hashPassword(adminPassword);

    // Update the admin user with bcrypt-hashed password
    const result = await client.query(
      `UPDATE users SET password = $1, updated_at = NOW() WHERE email = $2`,
      [hashedPassword, adminEmail]
    );

    if (result.rowCount && result.rowCount > 0) {
      console.log(`✅ Admin password updated successfully!`);
      console.log(`📧 Email: ${adminEmail}`);
      console.log(`🔑 Password: ${adminPassword}`);
      console.log(`🔒 Hash method: bcrypt (matches auth system)`);
    } else {
      console.log(`❌ Admin user not found in database`);
    }

  } catch (error) {
    console.error("❌ Error updating admin password:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixAdminPassword()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
