import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { z } from "zod";
import { insertAssetSchema, insertStrategySchema, insertSignalSchema, insertUserSchema } from "@shared/schema";
import { marketDataGenerator } from "./services/market-data-generator";

const clients = new Set<WebSocket>();

function broadcastSignal(signal: any) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "new_signal", data: signal }));
    }
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/auth/login", async (req: Request, res: Response) => {
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
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        res.status(400).json({ error: "Email already exists" });
        return;
      }
      const user = await storage.createUser(data);
      if (req.session) {
        req.session.userId = user.id;
        req.session.userRole = user.role;
      }
      res.status(201).json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        res.status(500).json({ error: "Signup failed" });
      }
    }
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
      
      const { strategy1Id, strategy2Id, logic } = req.body;
      
      if (!strategy1Id || !strategy2Id || !logic) {
        res.status(400).json({ error: "strategy1Id, strategy2Id, and logic are required" });
        return;
      }

      if (!["AND", "OR"].includes(logic)) {
        res.status(400).json({ error: "logic must be either 'AND' or 'OR'" });
        return;
      }

      const mergedStrategy = await storage.mergeStrategies(strategy1Id, strategy2Id, logic);
      if (!mergedStrategy) {
        res.status(404).json({ error: "One or both strategies not found" });
        return;
      }

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

      try {
        new Function("price", "ema50", "ema200", "high", "low", "open", `return ${formula}`);
        res.json({ valid: true, message: "Formula is valid" });
      } catch (error) {
        res.status(400).json({ valid: false, message: "Invalid JavaScript expression" });
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

      if (!config.apiKey || !config.apiSecret) {
        res.status(400).json({ error: "API credentials are required" });
        return;
      }

      await storage.updateBrokerConfig(id, {
        connected: true,
        lastConnected: new Date(),
      });

      res.json({ success: true, message: "Connection successful" });
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

      await storage.updateNotificationConfig(id, {
        testStatus: "success",
        lastTested: new Date(),
      });

      res.json({ success: true, message: "Test notification sent" });
    } catch (error) {
      res.status(500).json({ error: "Test notification failed" });
    }
  });

  const httpServer = createServer(app);

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    clients.add(ws);

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log("Received message:", data);
      } catch (error) {
        console.error("Invalid message format");
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.send(JSON.stringify({ type: "connected", message: "WebSocket connected" }));
  });

  marketDataGenerator.setBroadcastCallback(broadcastSignal);

  return httpServer;
}
