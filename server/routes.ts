import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage, dbStorage } from "./storage";
import { z } from "zod";
import { insertAssetSchema, insertStrategySchema, insertSignalSchema, insertUserSchema, insertLogSchema } from "@shared/schema";
import { marketDataGenerator } from "./services/market-data-generator";
import { notificationService } from "./services/notification-service";
import { brokerService } from "./services/broker-service";
import { brokerWebSocket } from "./services/broker-websocket";
import { formulaEvaluator } from "./services/formula-evaluator";
import { signalDetector } from "./services/signal-detector";
import { requireAuth, requireAdmin, loginRateLimit, apiRateLimit, strictRateLimit } from "./middleware/auth";

// Helper function to create activity logs
async function createActivityLog(
  action: string,
  entity?: string,
  entityId?: string,
  userId?: string,
  details?: Record<string, any>,
  req?: Request
) {
  if (process.env.DATABASE_URL) {
    try {
      await dbStorage.createLog({
        action,
        entity,
        entityId,
        userId: userId || null,
        details: details || null,
        ipAddress: req?.ip || req?.socket?.remoteAddress || null,
        userAgent: req?.headers?.["user-agent"] || null,
        level: "info",
      });
    } catch (error) {
      console.error("Failed to create activity log:", error);
    }
  }
}

const clients = new Set<WebSocket>();

function broadcastSignal(signal: any) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "new_signal", data: signal }));
    }
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/auth/login", loginRateLimit, async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const user = await storage.verifyUserPassword(email, password);
      if (!user) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      if (req.session) {
        req.session.userId = user.id;
        req.session.userRole = user.role;
      }
      await createActivityLog("login", "user", user.id, user.id, { email: user.email }, req);
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/signup", loginRateLimit, async (req: Request, res: Response) => {
    // Signup is disabled - only admins can create users via /api/users endpoint
    res.status(403).json({ error: "Signup is disabled. Contact administrator for account creation." });
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    if (req.session) {
      req.session.destroy((err: Error | null) => {
        if (err) {
          res.status(500).json({ error: "Logout failed" });
        } else {
          res.json({ success: true });
        }
      });
    } else {
      res.json({ success: true });
    }
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      if (!req.session?.userId) {
        res.json(null);
        return;
      }
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        res.json(null);
        return;
      }
      // Ensure session has the latest role
      if (req.session) {
        req.session.userRole = user.role;
      }
      res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
    } catch (error) {
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  app.get("/api/users", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const users = await storage.getUsers();
      res.json(users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
      })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/users", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const data = insertUserSchema.parse(req.body);
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        res.status(400).json({ error: "Email already exists" });
        return;
      }
      const newUser = await storage.createUser(data);
      res.status(201).json({
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create user" });
      }
    }
  });

  app.delete("/api/users/:id", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const { id } = req.params;
      
      // Prevent admin from deleting themselves
      if (id === req.session.userId) {
        res.status(400).json({ error: "Cannot delete your own account" });
        return;
      }
      
      const deleted = await storage.deleteUser(id);
      if (!deleted) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  app.get("/api/assets", async (req, res) => {
    try {
      const assets = await storage.getAssets();
      res.json(assets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });

  app.post("/api/assets", async (req, res) => {
    try {
      const data = insertAssetSchema.parse(req.body);
      const asset = await storage.createAsset(data);
      res.status(201).json(asset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create asset" });
      }
    }
  });

  app.patch("/api/assets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const asset = await storage.updateAsset(id, req.body);
      if (!asset) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }
      res.json(asset);
    } catch (error) {
      res.status(500).json({ error: "Failed to update asset" });
    }
  });

  app.delete("/api/assets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteAsset(id);
      if (!deleted) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete asset" });
    }
  });

  app.get("/api/strategies", async (req, res) => {
    try {
      const strategies = await storage.getStrategies();
      res.json(strategies);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch strategies" });
    }
  });

  app.post("/api/strategies", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (req.session.userRole !== "admin") {
        res.status(403).json({ error: "Forbidden - admin access required" });
        return;
      }
      const data = insertStrategySchema.parse(req.body);
      const strategy = await storage.createStrategy(data);
      res.status(201).json(strategy);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create strategy" });
      }
    }
  });

  app.patch("/api/strategies/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (req.session.userRole !== "admin") {
        res.status(403).json({ error: "Forbidden - admin access required" });
        return;
      }
      const { id } = req.params;
      const strategy = await storage.updateStrategy(id, req.body);
      if (!strategy) {
        res.status(404).json({ error: "Strategy not found" });
        return;
      }
      res.json(strategy);
    } catch (error) {
      res.status(500).json({ error: "Failed to update strategy" });
    }
  });

  app.delete("/api/strategies/:id", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (req.session.userRole !== "admin") {
        res.status(403).json({ error: "Forbidden - admin access required" });
        return;
      }
      const { id } = req.params;
      const deleted = await storage.deleteStrategy(id);
      if (!deleted) {
        res.status(404).json({ error: "Strategy not found" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete strategy" });
    }
  });

  app.post("/api/strategies/merge", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (req.session.userRole !== "admin") {
        res.status(403).json({ error: "Forbidden - admin access required" });
        return;
      }
      
      const { strategy1Id, strategy2Id, logic, timeWindow = 60 } = req.body;
      
      if (!strategy1Id || !strategy2Id || !logic) {
        res.status(400).json({ error: "strategy1Id, strategy2Id, and logic are required" });
        return;
      }

      if (!["AND", "OR"].includes(logic)) {
        res.status(400).json({ error: "logic must be either 'AND' or 'OR'" });
        return;
      }

      if (!storage.mergeStrategies) {
        res.status(501).json({ error: "Strategy merging not supported with current storage" });
        return;
      }

      const mergedStrategy = await storage.mergeStrategies(strategy1Id, strategy2Id, logic, timeWindow);
      if (!mergedStrategy) {
        res.status(404).json({ error: "One or both strategies not found" });
        return;
      }

      await createActivityLog("merge_strategies", "strategy", mergedStrategy.id, req.session?.userId, { strategy1Id, strategy2Id, logic }, req);
      res.status(201).json(mergedStrategy);
    } catch (error) {
      res.status(500).json({ error: "Failed to merge strategies" });
    }
  });

  app.post("/api/strategies/validate", async (req, res) => {
    try {
      const { formula } = req.body;
      if (!formula || typeof formula !== "string") {
        res.status(400).json({ error: "Formula is required" });
        return;
      }

      // Use safe formula evaluator instead of new Function()
      const validation = formulaEvaluator.validate(formula);
      
      if (validation.valid) {
        res.json({ 
          valid: true, 
          message: "Formula is valid",
          warnings: validation.warnings,
          allowedVariables: formulaEvaluator.getAllowedVariables(),
          allowedFunctions: formulaEvaluator.getAllowedFunctions(),
        });
      } else {
        res.status(400).json({ 
          valid: false, 
          message: "Invalid formula",
          errors: validation.errors,
        });
      }
    } catch (error) {
      res.status(500).json({ error: "Validation failed" });
    }
  });

  app.get("/api/signals", async (req, res) => {
    try {
      const signals = await storage.getSignals();
      res.json(signals);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch signals" });
    }
  });

  app.post("/api/signals", async (req, res) => {
    try {
      const data = insertSignalSchema.parse(req.body);
      const signal = await storage.createSignal(data);
      broadcastSignal(signal);

      // Send notifications to all enabled channels
      const asset = await storage.getAsset(signal.assetId);
      const strategy = await storage.getStrategy(signal.strategyId);
      
      if (asset && strategy) {
        const notificationConfigs = await storage.getNotificationConfigs();
        notificationService.sendToAllEnabled(
          { signal, asset, strategy },
          notificationConfigs
        ).catch((error: Error) => console.error("Failed to send notifications:", error));
      }

      res.status(201).json(signal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create signal" });
      }
    }
  });

  app.patch("/api/signals/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const signal = await storage.updateSignal(id, req.body);
      if (!signal) {
        res.status(404).json({ error: "Signal not found" });
        return;
      }
      res.json(signal);
    } catch (error) {
      res.status(500).json({ error: "Failed to update signal" });
    }
  });

  app.get("/api/broker-configs", async (req, res) => {
    try {
      const configs = await storage.getBrokerConfigs();
      res.json(configs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch broker configs" });
    }
  });

  app.patch("/api/broker-configs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const config = await storage.updateBrokerConfig(id, req.body);
      if (!config) {
        res.status(404).json({ error: "Broker config not found" });
        return;
      }
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to update broker config" });
    }
  });

  app.post("/api/broker-configs/:id/test", async (req, res) => {
    try {
      const { id } = req.params;
      const config = await storage.getBrokerConfig(id);
      if (!config) {
        res.status(404).json({ error: "Broker config not found" });
        return;
      }

      if (!config.apiKey) {
        res.status(400).json({ error: "API key is required" });
        return;
      }

      // Use the new broker service for real connection testing
      const result = await brokerService.connectBroker(config);

      await storage.updateBrokerConfig(id, {
        connected: result.success,
        lastConnected: result.success ? new Date() : config.lastConnected,
        metadata: result.accessToken ? { 
          ...(config.metadata as Record<string, unknown> || {}),
          accessToken: result.accessToken,
          userId: result.userId,
        } : config.metadata,
      });

      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, error: result.message });
      }
    } catch (error) {
      res.status(500).json({ error: "Connection test failed" });
    }
  });

  app.get("/api/notification-configs", async (req, res) => {
    try {
      const configs = await storage.getNotificationConfigs();
      res.json(configs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notification configs" });
    }
  });

  app.patch("/api/notification-configs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const config = await storage.updateNotificationConfig(id, req.body);
      if (!config) {
        res.status(404).json({ error: "Notification config not found" });
        return;
      }
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to update notification config" });
    }
  });

  app.post("/api/notification-configs/:id/test", async (req, res) => {
    try {
      const { id } = req.params;
      const config = await storage.getNotificationConfig(id);
      if (!config) {
        res.status(404).json({ error: "Notification config not found" });
        return;
      }

      // Use the new notification service for testing
      const result = await notificationService.testChannel(config);

      await storage.updateNotificationConfig(id, {
        testStatus: result.success ? "success" : "failed",
        lastTested: new Date(),
      });

      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, error: result.message });
      }
    } catch (error) {
      res.status(500).json({ error: "Test notification failed" });
    }
  });

  // ============ LOGS API ============
  app.get("/api/logs", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Forbidden - admin access required" });
        return;
      }

      if (!process.env.DATABASE_URL) {
        res.status(501).json({ error: "Logs require database storage" });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await dbStorage.getLogs(limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  });

  app.get("/api/logs/user/:userId", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Forbidden - admin access required" });
        return;
      }

      if (!process.env.DATABASE_URL) {
        res.status(501).json({ error: "Logs require database storage" });
        return;
      }

      const { userId } = req.params;
      const logs = await dbStorage.getLogsByUser(userId);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user logs" });
    }
  });

  app.get("/api/logs/entity/:entity", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Forbidden - admin access required" });
        return;
      }

      if (!process.env.DATABASE_URL) {
        res.status(501).json({ error: "Logs require database storage" });
        return;
      }

      const { entity } = req.params;
      const entityId = req.query.entityId as string | undefined;
      const logs = await dbStorage.getLogsByEntity(entity, entityId);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch entity logs" });
    }
  });

  // ============ DASHBOARD CONFIG API ============
  // Global dashboard configuration that applies to all users
  let globalDashboardConfig: Record<string, any> = {
    // Dashboard component visibility
    showMetricCards: true,
    showNiftyChart: true,
    showSensexChart: true,
    showRecentSignals: true,
    showActiveStrategies: true,
    showConnectedAssets: true,
    // Role-based visibility for dashboard
    adminOnlyMetrics: false,
    adminOnlyCharts: false,
    adminOnlySignals: false,
    adminOnlyStrategies: false,
    adminOnlyAssets: false,
    // Sidebar section visibility
    showDashboardSection: true,
    showStrategiesSection: true,
    showAssetsSection: true,
    showSignalsSection: true,
    showChartsSection: true,
    // Admin-only sidebar sections
    adminOnlyStrategiesSection: false,
    adminOnlyAssetsSection: false,
    adminOnlySignalsSection: false,
    adminOnlyChartsSection: false,
  };

  // Get global dashboard config (accessible to all authenticated users)
  app.get("/api/dashboard-config", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      res.json(globalDashboardConfig);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard config" });
    }
  });

  // Update global dashboard config (admin only)
  app.put("/api/dashboard-config", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (req.session.userRole !== "admin") {
        res.status(403).json({ error: "Forbidden - admin access required" });
        return;
      }

      globalDashboardConfig = { ...globalDashboardConfig, ...req.body };
      
      await createActivityLog(
        "update_dashboard_config",
        "dashboard_config",
        undefined,
        req.session.userId,
        { config: globalDashboardConfig },
        req
      );

      res.json(globalDashboardConfig);
    } catch (error) {
      res.status(500).json({ error: "Failed to update dashboard config" });
    }
  });

  // Reset dashboard config to defaults (admin only)
  app.post("/api/dashboard-config/reset", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (req.session.userRole !== "admin") {
        res.status(403).json({ error: "Forbidden - admin access required" });
        return;
      }

      globalDashboardConfig = {
        showMetricCards: true,
        showNiftyChart: true,
        showSensexChart: true,
        showRecentSignals: true,
        showActiveStrategies: true,
        showConnectedAssets: true,
        adminOnlyMetrics: false,
        adminOnlyCharts: false,
        adminOnlySignals: false,
        adminOnlyStrategies: false,
        adminOnlyAssets: false,
        showDashboardSection: true,
        showStrategiesSection: true,
        showAssetsSection: true,
        showSignalsSection: true,
        showChartsSection: true,
        adminOnlyStrategiesSection: false,
        adminOnlyAssetsSection: false,
        adminOnlySignalsSection: false,
        adminOnlyChartsSection: false,
      };

      await createActivityLog(
        "reset_dashboard_config",
        "dashboard_config",
        undefined,
        req.session.userId,
        { config: globalDashboardConfig },
        req
      );

      res.json(globalDashboardConfig);
    } catch (error) {
      res.status(500).json({ error: "Failed to reset dashboard config" });
    }
  });

  // ============ ADMIN CLEANUP API ============
  app.get("/api/admin/cleanup-stats", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (req.session.userRole !== "admin") {
        res.status(403).json({ error: "Forbidden - admin access required" });
        return;
      }

      if (!process.env.DATABASE_URL) {
        res.status(501).json({ error: "Cleanup stats require database storage" });
        return;
      }

      const { getCleanupStats } = await import("./jobs/database-cleanup");
      const stats = await getCleanupStats();
      
      if (!stats) {
        res.status(500).json({ error: "Failed to get cleanup stats" });
        return;
      }

      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to get cleanup stats" });
    }
  });

  app.post("/api/admin/cleanup-now", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (req.session.userRole !== "admin") {
        res.status(403).json({ error: "Forbidden - admin access required" });
        return;
      }

      if (!process.env.DATABASE_URL) {
        res.status(501).json({ error: "Manual cleanup requires database storage" });
        return;
      }

      const { cleanupOldData } = await import("./jobs/database-cleanup");
      const result = await cleanupOldData();
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Cleanup failed" });
    }
  });

  // ============ BROKER REAL-TIME API ============
  app.post("/api/broker-configs/:id/connect-realtime", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { id } = req.params;
      const config = await storage.getBrokerConfig(id);
      if (!config) {
        res.status(404).json({ error: "Broker config not found" });
        return;
      }

      if (!config.apiKey) {
        res.status(400).json({ error: "API key is required" });
        return;
      }

      const metadata = config.metadata as Record<string, any> || {};
      let connected = false;

      switch (config.name.toLowerCase()) {
        case "zerodha":
          connected = await brokerWebSocket.connectZerodha({
            apiKey: config.apiKey,
            accessToken: metadata.accessToken || config.apiSecret || "",
            broker: "zerodha",
          });
          break;
        case "upstox":
          connected = await brokerWebSocket.connectUpstox({
            apiKey: config.apiKey,
            accessToken: metadata.accessToken || config.apiSecret || "",
            broker: "upstox",
          });
          break;
        case "angel":
          connected = await brokerWebSocket.connectAngel({
            apiKey: config.apiKey,
            accessToken: metadata.accessToken || config.apiSecret || "",
            broker: "angel",
          });
          break;
        default:
          res.status(400).json({ error: `Real-time not supported for ${config.name}` });
          return;
      }

      if (connected) {
        await storage.updateBrokerConfig(id, { connected: true, lastConnected: new Date() });
        res.json({ success: true, message: `Connected to ${config.name} real-time feed` });
      } else {
        res.status(400).json({ success: false, error: "Failed to connect to real-time feed" });
      }
    } catch (error) {
      res.status(500).json({ error: "Real-time connection failed" });
    }
  });

  app.get("/api/broker-realtime/status", async (req, res) => {
    try {
      const status = brokerWebSocket.getStatus();
      res.json({ status });
    } catch (error) {
      res.status(500).json({ error: "Failed to get status" });
    }
  });

  app.post("/api/broker-realtime/subscribe", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { broker, instrumentTokens } = req.body;
      if (!broker || !instrumentTokens || !Array.isArray(instrumentTokens)) {
        res.status(400).json({ error: "broker and instrumentTokens array required" });
        return;
      }

      const success = brokerWebSocket.subscribe(broker, instrumentTokens);
      if (success) {
        res.json({ success: true, message: `Subscribed to ${instrumentTokens.length} instruments` });
      } else {
        res.status(400).json({ success: false, error: "Subscription failed - check connection" });
      }
    } catch (error) {
      res.status(500).json({ error: "Subscription failed" });
    }
  });

  // ============ EMA VALIDATION API ============
  app.post("/api/ema/validate", async (req, res) => {
    try {
      const { data, period } = req.body;
      if (!data || !Array.isArray(data) || !period) {
        res.status(400).json({ error: "data array and period required" });
        return;
      }

      const { emaCalculator } = await import("./services/ema-calculator");
      const validation = emaCalculator.validateEMACalculation(data, period);
      res.json(validation);
    } catch (error) {
      res.status(500).json({ error: "Validation failed" });
    }
  });

  app.post("/api/ema/calculate", async (req, res) => {
    try {
      const { data, period } = req.body;
      if (!data || !Array.isArray(data) || !period) {
        res.status(400).json({ error: "data array and period required" });
        return;
      }

      const { emaCalculator } = await import("./services/ema-calculator");
      const emaValues = emaCalculator.calculateEMA(data, period);
      const validValues = emaValues.filter(v => !isNaN(v));
      
      res.json({
        period,
        inputLength: data.length,
        emaLength: validValues.length,
        latestEMA: validValues.length > 0 ? validValues[validValues.length - 1] : null,
        allValues: validValues,
      });
    } catch (error) {
      res.status(500).json({ error: "Calculation failed" });
    }
  });

  const httpServer = createServer(app);

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    clients.add(ws);

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === "subscribe" && data.broker && data.tokens) {
          brokerWebSocket.subscribe(data.broker, data.tokens);
        }
      } catch (error) {
        console.error("Invalid message format");
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.send(JSON.stringify({ type: "connected", message: "WebSocket connected" }));
  });

  // Setup broker WebSocket to broadcast ticks and generate signals
  brokerWebSocket.on("tick", async (tickData) => {
    // Broadcast raw tick to connected clients
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "tick", data: tickData }));
      }
    });

    // Generate signals if we have EMA data
    if (tickData.ema50 && tickData.ema200) {
      try {
        const signals = await signalDetector.detectSignals({
          assetId: tickData.symbol,
          timeframe: "5m",
          price: tickData.lastPrice,
          high: tickData.high,
          low: tickData.low,
          open: tickData.open,
          ema50: tickData.ema50,
          ema200: tickData.ema200,
        });

        for (const signal of signals) {
          const createdSignal = await storage.createSignal(signal);
          broadcastSignal(createdSignal);

          // Send notifications
          const asset = await storage.getAsset(signal.assetId);
          const strategy = await storage.getStrategy(signal.strategyId);
          if (asset && strategy) {
            const configs = await storage.getNotificationConfigs();
            notificationService.sendToAllEnabled({ signal: createdSignal, asset, strategy }, configs);
          }
        }
      } catch (error) {
        console.error("Signal detection error:", error);
      }
    }
  });

  marketDataGenerator.setBroadcastCallback(broadcastSignal);

  return httpServer;
}
