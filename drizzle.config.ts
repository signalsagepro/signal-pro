import { defineConfig } from "drizzle-kit";

const DATABASE_URL = process.env.DATABASE_URL || process.env.NEW_DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL or NEW_DATABASE_URL must be provided");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL,
  },
  // Force SSL for Render and Neon
  ...(DATABASE_URL.includes("render.com") || DATABASE_URL.includes("neon.tech") ? {
    ssl: true
  } : {}),
});
