import fs from "node:fs";
import path from "node:path";
import { type Server } from "node:http";

import { nanoid } from "nanoid";
import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";

import viteConfig from "../vite.config";
import runApp from "./app";
import { storage, dbStorage } from "./storage";

export async function setupVite(app: Express, server: Server) {
  const viteLogger = createLogger();
  const serverOptions = {
    middlewareMode: true,
    hmr: false,
    allowedHosts: true as const,
  };

  // Initialize database with default data if using database storage
  async function initializeDatabase() {
    if (process.env.DATABASE_URL) {
      try {
        await dbStorage.initializeDefaultData();
      } catch (error) {
        console.error("Failed to initialize database data:", error);
      }
    }
  }

  // Initialize default admin user for testing
  async function initializeDefaultUser() {
    try {
      const existing = await storage.getUserByEmail("admin@test.com");
      if (!existing) {
        await storage.createUser({
          email: "admin@test.com",
          password: "password123",
          name: "Admin User",
          role: "admin",
        });
        console.log("Default admin user created: admin@test.com / password123");
      }
    } catch (error) {
      console.error("Failed to create default user:", error);
    }
  }

  await initializeDatabase();
  await initializeDefaultUser();

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

// Set the port explicitly
process.env.PORT = '5001';

(async () => {
  await runApp(setupVite);
})();
