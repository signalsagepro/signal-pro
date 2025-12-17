import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const client = neon(DATABASE_URL);
const db = drizzle(client);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function resetAdminUser() {
  const adminEmail = "admin@signalpro.com";
  const adminPassword = "admin123"; // Change this after first login!
  
  console.log("🔐 Resetting admin user...\n");
  
  try {
    // Check if admin exists
    const existingUsers = await db.select().from(users).where(eq(users.email, adminEmail));
    
    const hashedPassword = await hashPassword(adminPassword);
    
    if (existingUsers.length > 0) {
      // Update existing admin
      await db.update(users)
        .set({ password: hashedPassword })
        .where(eq(users.email, adminEmail));
      console.log("✅ Admin password reset successfully!");
    } else {
      // Create new admin
      await db.insert(users).values({
        email: adminEmail,
        password: hashedPassword,
        name: "Admin",
        role: "admin",
      });
      console.log("✅ Admin user created successfully!");
    }
    
    console.log("\n📧 Email:", adminEmail);
    console.log("🔑 Password:", adminPassword);
    console.log("\n⚠️  Please change your password after logging in!");
    
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

resetAdminUser()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
