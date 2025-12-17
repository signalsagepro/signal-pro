import fs from "node:fs";
import path from "node:path";
import { type Server } from "node:http";

import express, { type Express } from "express";
import runApp from "./app";
import { initializeDatabase } from "./init-database";

export async function serveStatic(app: Express, _server: Server) {
  // Auto-initialize database with migration if needed
  if (process.env.DATABASE_URL) {
    try {
      await initializeDatabase(process.env.DATABASE_URL);
    } catch (error) {
      console.error("[Init] Failed to initialize database:", error);
    }
  }

  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

(async () => {
  await runApp(serveStatic);
})();
