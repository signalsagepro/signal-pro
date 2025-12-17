import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage, dbStorage } from "./storage";
import { z } from "zod";
import { insertAssetSchema, insertStrategySchema, insertSignalSchema, insertUserSchema, insertLogSchema } from "@shared/schema";
import { realtimeSignalGenerator } from "./services/realtime-signal-generator";
import { forexSignalGenerator } from "./services/forex-signal-generator";
import { finnhubForexWebSocket, FOREX_SYMBOL_MAP, FINNHUB_FOREX_PAIRS } from "./services/finnhub-forex-websocket";
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

  // Sync instrument tokens from Zerodha
  app.post("/api/assets/sync-tokens", async (req, res) => {
    try {
      console.log("[Sync Tokens] Starting instrument token sync...");
      
      // Fetch Zerodha NSE instruments CSV
      const nseResponse = await fetch("https://api.kite.trade/instruments/NSE");
      if (!nseResponse.ok) {
        throw new Error(`Failed to fetch NSE instruments: ${nseResponse.status}`);
      }
      const nseCsv = await nseResponse.text();
      
      // Parse CSV - format: instrument_token,exchange_token,tradingsymbol,name,...
      const lines = nseCsv.split("\n");
      const headers = lines[0].split(",");
      const tokenIndex = headers.indexOf("instrument_token");
      const symbolIndex = headers.indexOf("tradingsymbol");
      const nameIndex = headers.indexOf("name");
      
      // Build symbol to token map
      const symbolTokenMap: Record<string, { token: number; name: string }> = {};
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length > Math.max(tokenIndex, symbolIndex, nameIndex)) {
          const symbol = cols[symbolIndex]?.trim();
          const token = parseInt(cols[tokenIndex]?.trim(), 10);
          const name = cols[nameIndex]?.trim().replace(/"/g, "");
          if (symbol && !isNaN(token)) {
            symbolTokenMap[symbol] = { token, name };
          }
        }
      }
      
      console.log(`[Sync Tokens] Loaded ${Object.keys(symbolTokenMap).length} instruments from Zerodha`);
      
      // Get all assets and update their tokens
      const assets = await storage.getAssets();
      const results: { symbol: string; status: string; token?: number }[] = [];
      
      for (const asset of assets) {
        const symbolUpper = asset.symbol.toUpperCase();
        const match = symbolTokenMap[symbolUpper];
        
        if (match) {
          await storage.updateAsset(asset.id, { instrumentToken: match.token });
          results.push({ symbol: asset.symbol, status: "updated", token: match.token });
          console.log(`[Sync Tokens] ✅ ${asset.symbol} -> token ${match.token}`);
        } else {
          results.push({ symbol: asset.symbol, status: "not_found" });
          console.log(`[Sync Tokens] ⚠️ ${asset.symbol} - not found in Zerodha instruments`);
        }
      }
      
      const updated = results.filter(r => r.status === "updated").length;
      const notFound = results.filter(r => r.status === "not_found").length;
      
      res.json({
        success: true,
        message: `Synced ${updated} assets, ${notFound} not found`,
        totalInstruments: Object.keys(symbolTokenMap).length,
        results,
      });
    } catch (error) {
      console.error("[Sync Tokens] Error:", error);
      res.status(500).json({ error: "Failed to sync instrument tokens" });
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

  // ============ INCOMING WEBHOOK (NO AUTH REQUIRED) ============
  // This endpoint allows external services to trigger signals and notifications
  // without requiring user authentication. Useful for TradingView alerts, 
  // custom scripts, or any external system that needs to send signals.
  app.post("/api/webhook/signal", async (req, res) => {
    try {
      const { 
        symbol,           // Asset symbol (e.g., "NIFTY50", "EUR/USD")
        signalType,       // Signal type (e.g., "bullish_crossover", "bearish_crossover")
        price,            // Current price
        timeframe = "5m", // Timeframe (default: 5m)
        strategyName,     // Strategy name to match
        secret,           // Optional: webhook secret for security
        ema50,            // Optional: EMA 50 value
        ema200,           // Optional: EMA 200 value
        message,          // Optional: Custom message
      } = req.body;

      // Validate webhook secret if configured
      const webhookSecret = process.env.WEBHOOK_SECRET;
      if (webhookSecret && secret !== webhookSecret) {
        console.log("[Webhook] Invalid or missing webhook secret");
        res.status(401).json({ error: "Invalid webhook secret" });
        return;
      }

      // Validate required fields
      if (!symbol || !signalType || price === undefined) {
        res.status(400).json({ 
          error: "Missing required fields", 
          required: ["symbol", "signalType", "price"],
          received: { symbol, signalType, price }
        });
        return;
      }

      console.log(`[Webhook] Received signal: ${symbol} - ${signalType} @ ${price}`);

      // Find matching asset
      const assets = await storage.getAssets();
      const asset = assets.find(a => 
        a.symbol.toLowerCase() === symbol.toLowerCase() ||
        a.symbol.replace("/", "").toLowerCase() === symbol.replace("/", "").toLowerCase()
      );

      if (!asset) {
        console.log(`[Webhook] Asset not found: ${symbol}`);
        res.status(404).json({ error: `Asset not found: ${symbol}` });
        return;
      }

      // Find matching strategy or use first enabled strategy
      const strategies = await storage.getStrategies();
      let strategy = strategyName 
        ? strategies.find(s => s.name.toLowerCase().includes(strategyName.toLowerCase()))
        : strategies.find(s => s.enabled);

      if (!strategy) {
        // Create a default webhook strategy if none exists
        strategy = strategies[0];
        if (!strategy) {
          console.log("[Webhook] No strategies configured");
          res.status(400).json({ error: "No strategies configured" });
          return;
        }
      }

      // Create the signal
      const signalData = {
        assetId: asset.id,
        strategyId: strategy.id,
        type: signalType,
        timeframe,
        price: parseFloat(String(price)),
        ema50: ema50 ? parseFloat(String(ema50)) : parseFloat(String(price)),
        ema200: ema200 ? parseFloat(String(ema200)) : parseFloat(String(price)),
      };

      const createdSignal = await storage.createSignal(signalData);
      console.log(`[Webhook] Signal created: ${createdSignal.id}`);

      // Broadcast to connected WebSocket clients
      broadcastSignal({
        ...createdSignal,
        asset: { symbol: asset.symbol, name: asset.name },
        strategy: { name: strategy.name }
      });

      // Send notifications to all enabled channels (works without user login)
      const notificationConfigs = await storage.getNotificationConfigs();
      const enabledConfigs = notificationConfigs.filter(c => c.enabled);
      
      console.log(`[Webhook] Sending to ${enabledConfigs.length} notification channels`);
      
      const notificationResults = await notificationService.sendToAllEnabled(
        { signal: createdSignal, asset, strategy },
        notificationConfigs
      );

      const successCount = notificationResults.filter(r => r.success).length;
      const failCount = notificationResults.filter(r => !r.success).length;

      console.log(`[Webhook] Notifications sent: ${successCount} success, ${failCount} failed`);

      res.status(201).json({ 
        success: true,
        message: `Signal created and ${successCount} notification(s) sent`,
        signal: createdSignal,
        notifications: {
          sent: successCount,
          failed: failCount,
          details: notificationResults.map(r => ({
            channel: r.channel,
            success: r.success,
            message: r.message
          }))
        }
      });
    } catch (error) {
      console.error("[Webhook] Error processing webhook:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });

  // Simple webhook endpoint for quick notifications (no signal creation)
  app.post("/api/webhook/notify", async (req, res) => {
    try {
      const { 
        title,
        message,
        type = "info",  // info, success, warning, error
        secret,
      } = req.body;

      // Validate webhook secret if configured
      const webhookSecret = process.env.WEBHOOK_SECRET;
      if (webhookSecret && secret !== webhookSecret) {
        res.status(401).json({ error: "Invalid webhook secret" });
        return;
      }

      if (!message) {
        res.status(400).json({ error: "Message is required" });
        return;
      }

      console.log(`[Webhook Notify] ${title || 'Notification'}: ${message}`);

      // Get notification configs and send to all enabled
      const notificationConfigs = await storage.getNotificationConfigs();
      const enabledConfigs = notificationConfigs.filter(c => c.enabled);
      
      // Create a mock signal/asset/strategy for the notification
      const mockPayload = {
        signal: {
          id: `webhook-${Date.now()}`,
          type: type,
          timeframe: "webhook",
          price: 0,
          ema50: 0,
          ema200: 0,
          createdAt: new Date(),
          assetId: "webhook",
          strategyId: "webhook",
        },
        asset: {
          id: "webhook",
          symbol: title || "WEBHOOK",
          name: message,
          type: "webhook",
          exchange: null,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        strategy: {
          id: "webhook",
          name: "Webhook Alert",
          type: "webhook",
          timeframe: "webhook",
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          description: null,
          formula: null,
          parameters: null,
          mergedFrom: null,
          mergeLogic: null,
          mergeTimeWindow: null,
        },
      };

      let successCount = 0;
      let failCount = 0;

      for (const config of enabledConfigs) {
        try {
          const result = await notificationService.sendNotification(
            mockPayload as any,
            config
          );
          if (result.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          failCount++;
        }
      }

      res.json({
        success: true,
        message: `Notification sent to ${successCount} channel(s)`,
        sent: successCount,
        failed: failCount,
      });
    } catch (error) {
      console.error("[Webhook Notify] Error:", error);
      res.status(500).json({ error: "Failed to send notification" });
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
      const existingMetadata = config.metadata as Record<string, unknown> | null;

      if (result.success) {
        await storage.updateBrokerConfig(id, {
          connected: true,
          lastConnected: new Date(),
          metadata: result.accessToken ? { 
            ...(existingMetadata || {}),
            accessToken: result.accessToken,
            userId: result.userId,
          } : existingMetadata,
        });
        res.json({ success: true, message: result.message });
      } else {
        // Connection failed - if there was an existing token, clear it so user can re-authenticate
        if (existingMetadata?.accessToken) {
          await storage.updateBrokerConfig(id, {
            connected: false,
            metadata: {
              ...(existingMetadata || {}),
              accessToken: null,
              userId: null,
              tokenDate: null,
            },
          });
        } else {
          await storage.updateBrokerConfig(id, { connected: false });
        }
        res.status(400).json({ success: false, error: result.message, needsReauth: !!existingMetadata?.accessToken });
      }
    } catch (error) {
      res.status(500).json({ error: "Connection test failed" });
    }
  });

  // Verify Zerodha connection by fetching a live quote
  app.get("/api/broker-configs/:id/verify", async (req, res) => {
    try {
      const { id } = req.params;
      const config = await storage.getBrokerConfig(id);
      
      if (!config) {
        res.status(404).json({ error: "Broker config not found" });
        return;
      }

      if (!config.apiKey) {
        res.status(400).json({ error: "API key not configured" });
        return;
      }

      const metadata = config.metadata as Record<string, unknown> | null;
      if (!metadata?.accessToken) {
        res.status(400).json({ error: "Not connected - please complete OAuth login first" });
        return;
      }

      if (config.name === "zerodha") {
        const { ZerodhaAdapter } = await import("./services/broker-service");
        const adapter = new ZerodhaAdapter();
        
        // Connect with stored credentials
        const connectResult = await adapter.connect({
          apiKey: config.apiKey,
          apiSecret: config.apiSecret || "",
          accessToken: metadata.accessToken as string,
        });

        if (!connectResult.success) {
          // Token is invalid/expired - clear it so user can re-authenticate
          await storage.updateBrokerConfig(id, { 
            connected: false,
            metadata: {
              ...(metadata as Record<string, unknown> || {}),
              accessToken: null,
              userId: null,
              tokenDate: null,
            },
          });
          res.status(400).json({ 
            error: "Connection expired", 
            message: connectResult.message,
            needsReauth: true 
          });
          return;
        }

        // Try to fetch a live quote to verify API is working
        const quote = await adapter.getQuote("RELIANCE", "NSE");
        
        if (quote) {
          res.json({
            success: true,
            connected: true,
            userId: metadata.userId,
            tokenDate: metadata.tokenDate,
            testQuote: {
              symbol: quote.symbol,
              lastPrice: quote.lastPrice,
              timestamp: quote.timestamp,
            },
            message: "Zerodha API is working! Successfully fetched live quote.",
          });
        } else {
          res.json({
            success: true,
            connected: true,
            userId: metadata.userId,
            tokenDate: metadata.tokenDate,
            message: "Connected to Zerodha but could not fetch quote (market may be closed).",
          });
        }
      } else {
        res.status(400).json({ error: "Verification not supported for this broker" });
      }
    } catch (error) {
      console.error("Broker verification error:", error);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  // OAuth callback for Zerodha Kite - handles redirect after user login
  app.get("/api/broker-configs/zerodha/callback", async (req, res) => {
    try {
      const { request_token, status } = req.query;
      
      if (status === "cancelled") {
        res.redirect("/?broker_error=cancelled");
        return;
      }

      if (!request_token || typeof request_token !== "string") {
        res.redirect("/?broker_error=missing_token");
        return;
      }

      // Find the Zerodha broker config (name is "zerodha", type is "indian")
      const configs = await storage.getBrokerConfigs();
      const zerodhaConfig = configs.find(c => c.name === "zerodha");
      
      if (!zerodhaConfig || !zerodhaConfig.apiKey || !zerodhaConfig.apiSecret) {
        res.redirect("/?broker_error=config_missing");
        return;
      }

      // Exchange request_token for access_token
      const adapter = new (await import("./services/broker-service")).ZerodhaAdapter();
      const result = await adapter.exchangeToken(
        request_token,
        zerodhaConfig.apiKey,
        zerodhaConfig.apiSecret
      );

      if (result.success && result.accessToken) {
        // Save the access token to broker config
        await storage.updateBrokerConfig(zerodhaConfig.id, {
          connected: true,
          lastConnected: new Date(),
          metadata: {
            ...(zerodhaConfig.metadata as Record<string, unknown> || {}),
            accessToken: result.accessToken,
            userId: result.userId,
            tokenDate: new Date().toISOString(),
          },
        });
        
        // Send HTML that closes the popup and notifies parent window
        res.send(`
          <!DOCTYPE html>
          <html>
          <head><title>Zerodha Connected</title></head>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'zerodha_connected', success: true }, '*');
                window.close();
              } else {
                window.location.href = '/config/brokers?broker_connected=zerodha';
              }
            </script>
            <p>Connection successful! This window will close automatically...</p>
          </body>
          </html>
        `);
      } else {
        res.send(`
          <!DOCTYPE html>
          <html>
          <head><title>Connection Failed</title></head>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'zerodha_connected', success: false, error: '${result.message}' }, '*');
                window.close();
              } else {
                window.location.href = '/config/brokers?broker_error=${encodeURIComponent(result.message || "token_exchange_failed")}';
              }
            </script>
            <p>Connection failed. This window will close automatically...</p>
          </body>
          </html>
        `);
      }
    } catch (error) {
      console.error("Zerodha OAuth callback error:", error);
      res.redirect("/settings?broker_error=callback_failed");
    }
  });

  // Exchange Zerodha request_token for access_token (called from frontend)
  app.post("/api/broker-configs/zerodha/exchange-token", async (req, res) => {
    try {
      const { request_token } = req.body;
      
      if (!request_token) {
        res.status(400).json({ success: false, error: "Missing request_token" });
        return;
      }

      // Find the Zerodha broker config
      const configs = await storage.getBrokerConfigs();
      const zerodhaConfig = configs.find(c => c.name === "zerodha");
      
      if (!zerodhaConfig || !zerodhaConfig.apiKey || !zerodhaConfig.apiSecret) {
        res.status(400).json({ success: false, error: "Zerodha not configured. Please add API key and secret first." });
        return;
      }

      // Exchange request_token for access_token
      const adapter = new (await import("./services/broker-service")).ZerodhaAdapter();
      const result = await adapter.exchangeToken(
        request_token,
        zerodhaConfig.apiKey,
        zerodhaConfig.apiSecret
      );

      if (result.success && result.accessToken) {
        // Save the access token to broker config
        await storage.updateBrokerConfig(zerodhaConfig.id, {
          connected: true,
          lastConnected: new Date(),
          metadata: {
            ...(zerodhaConfig.metadata as Record<string, unknown> || {}),
            accessToken: result.accessToken,
            userId: result.userId,
            tokenDate: new Date().toISOString(),
          },
        });
        
        res.json({ success: true, message: "Connected to Zerodha successfully" });
      } else {
        res.status(400).json({ success: false, error: result.message || "Token exchange failed" });
      }
    } catch (error) {
      console.error("Zerodha token exchange error:", error);
      res.status(500).json({ success: false, error: "Failed to exchange token" });
    }
  });

  // Get Zerodha OAuth login URL
  app.get("/api/broker-configs/:id/oauth-url", async (req, res) => {
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

      if (config.name === "zerodha") {
        const oauthUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${config.apiKey}`;
        res.json({ url: oauthUrl });
      } else {
        res.status(400).json({ error: "OAuth not supported for this broker" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to generate OAuth URL" });
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
  // Global dashboard configuration that applies to all users (now persisted in database)
  const DEFAULT_DASHBOARD_CONFIG = {
    // Dashboard component visibility
    showMetricCards: true,
    showNiftyChart: true,
    showSensexChart: true,
    showSignalsTable: true,
    showStrategiesTable: true,
    showAssetsTable: true,
    showRecentActivity: true,

    // Chart settings
    niftyChartHeight: 300,
    sensexChartHeight: 300,

    // Table settings
    signalsTablePageSize: 10,
    strategiesTablePageSize: 10,
    assetsTablePageSize: 10,

    // Refresh intervals (in seconds)
    signalsRefreshInterval: 30,
    chartsRefreshInterval: 60,
  };

  app.get("/api/dashboard-config", async (req, res) => {
    try {
      console.log("[Dashboard Config API] GET request received");
      console.log("[Dashboard Config API] Session userId:", req.session?.userId);
      
      if (!req.session?.userId) {
        console.log("[Dashboard Config API] Unauthorized - no session userId");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      
      console.log("[Dashboard Config API] Fetching dashboard config...");
      const config = await storage.getDashboardConfig("global");
      console.log("[Dashboard Config API] Config fetched:", !!config);
      
      const responseConfig = config?.config || DEFAULT_DASHBOARD_CONFIG;
      console.log("[Dashboard Config API] Responding with config keys:", Object.keys(responseConfig));
      res.json(responseConfig);
    } catch (error) {
      console.error("[Dashboard Config API] Error fetching config:", error);
      res.status(500).json({ error: "Failed to fetch dashboard config" });
    }
  });

  app.put("/api/dashboard-config", async (req, res) => {
    try {
      console.log("[Dashboard Config API] PUT request received");
      console.log("[Dashboard Config API] Session userId:", req.session?.userId);
      console.log("[Dashboard Config API] Request body:", req.body);
      
      if (!req.session?.userId) {
        console.log("[Dashboard Config API] Unauthorized - no session userId");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Allow all authenticated users to update dashboard config
      const currentConfig = await storage.getDashboardConfig("global");
      console.log("[Dashboard Config API] Current config:", currentConfig?.config);
      
      const updatedConfig = { ...(currentConfig?.config || DEFAULT_DASHBOARD_CONFIG), ...req.body };
      console.log("[Dashboard Config API] Updated config:", updatedConfig);
      
      const saved = await storage.updateDashboardConfig("global", updatedConfig);
      console.log("[Dashboard Config API] Saved config:", saved.config);
      
      await createActivityLog(
        "update_dashboard_config",
        "dashboard_config",
        undefined,
        req.session.userId,
        { config: saved.config },
        req
      );

      console.log("[Dashboard Config API] Responding with saved config");
      res.json(saved.config);
    } catch (error) {
      console.error("[Dashboard Config API] Error:", error);
      res.status(500).json({ error: "Failed to update dashboard config" });
    }
  });

  app.post("/api/dashboard-config/reset", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Allow all authenticated users to reset dashboard config

      const saved = await storage.updateDashboardConfig("global", DEFAULT_DASHBOARD_CONFIG);

      await createActivityLog(
        "reset_dashboard_config",
        "dashboard_config",
        undefined,
        req.session.userId,
        { config: saved.config },
        req
      );

      res.json(saved.config);
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
        // Get asset ID from token mapping
        const assetTokenMap = realtimeSignalGenerator.getAssetTokenMap();
        const assetInfo = assetTokenMap.get(tickData.symbol);
        
        if (!assetInfo) {
          console.log(`[Routes] No asset mapping found for ${tickData.symbol}`);
          return;
        }

        const signals = await signalDetector.detectSignals({
          assetId: assetInfo.assetId,
          timeframe: "5m", // Match strategy timeframes
          price: tickData.lastPrice,
          high: tickData.high,
          low: tickData.low,
          open: tickData.open,
          ema50: tickData.ema50,
          ema200: tickData.ema200,
        });

        for (const signal of signals) {
          const createdSignal = await storage.createSignal(signal);
          
          // Get asset and strategy info for broadcasting
          const asset = await storage.getAsset(signal.assetId);
          const strategy = await storage.getStrategy(signal.strategyId);
          
          // Broadcast signal with asset info for better flash messages
          broadcastSignal({
            ...createdSignal,
            asset: asset ? { symbol: asset.symbol, name: asset.name } : null,
            strategy: strategy ? { name: strategy.name } : null
          });

          // Send notifications
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

  // Start real-time WebSocket connection for Zerodha
  app.post("/api/realtime/start", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      await realtimeSignalGenerator.initialize();
      const connected = await realtimeSignalGenerator.connectZerodha();

      if (connected) {
        res.json({ 
          success: true, 
          message: "Real-time signal generation started with Zerodha WebSocket"
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: "Failed to connect to Zerodha WebSocket. Ensure Zerodha is connected."
        });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to start real-time signals" });
    }
  });

  // Stop real-time WebSocket connection
  app.post("/api/realtime/stop", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      realtimeSignalGenerator.disconnect();

      res.json({ 
        success: true, 
        message: "Real-time signal generation stopped"
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to stop real-time signals" });
    }
  });

  // Get real-time connection status
  app.get("/api/realtime/status", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const configs = await storage.getBrokerConfigs();
      const zerodhaConnected = configs.some(c => c.name === "zerodha" && c.connected);
      const wsStatus = brokerWebSocket.getStatus();
      const assetTokenMap = realtimeSignalGenerator.getAssetTokenMap();
      const allTicks = brokerWebSocket.getAllLatestTicks();

      // Get sample tick keys for debugging
      const tickKeys = Array.from(allTicks.keys()).slice(0, 5);
      const tokenMapKeys = Array.from(assetTokenMap.keys()).slice(0, 5);

      console.log("[Realtime Status] WebSocket status:", wsStatus);
      console.log("[Realtime Status] zerodhaConnected:", zerodhaConnected);

      res.json({ 
        zerodhaConnected,
        websocketStatus: wsStatus,
        mode: "realtime",
        debug: {
          assetTokenMapSize: assetTokenMap.size,
          allTicksSize: allTicks.size,
          sampleTickKeys: tickKeys,
          sampleTokenMapKeys: tokenMapKeys,
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get status" });
    }
  });

  // Get live prices for all assets
  app.get("/api/realtime/prices", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const assetTokenMap = realtimeSignalGenerator.getAssetTokenMap();
      const allTicks = brokerWebSocket.getAllLatestTicks();
      
      console.log(`[Live Prices] Asset token map size: ${assetTokenMap.size}`);
      console.log(`[Live Prices] All ticks size: ${allTicks.size}`);
      
      const livePrices: Record<string, any> = {};

      // Map ticks to assets using TOKEN_${instrumentToken} format
      const tickEntries = Array.from(allTicks.entries());
      for (const [key, tick] of tickEntries) {
        // tick.symbol is in format "TOKEN_12345" or "zerodha:TOKEN_12345"
        const assetInfo = assetTokenMap.get(tick.symbol);
        
        if (assetInfo) {
          // Calculate change percentage if we have open price
          let changePercent = tick.changePercent || 0;
          if (tick.open && tick.open > 0 && changePercent === 0) {
            changePercent = ((tick.lastPrice - tick.open) / tick.open) * 100;
          }

          livePrices[assetInfo.assetId] = {
            symbol: assetInfo.symbol,
            lastPrice: tick.lastPrice,
            open: tick.open,
            high: tick.high,
            low: tick.low,
            change: tick.change || (tick.lastPrice - tick.open),
            changePercent: changePercent,
            timestamp: tick.timestamp,
          };
        } else {
          console.log(`[Live Prices] No asset info for tick symbol: ${tick.symbol}`);
        }
      }

      console.log(`[Live Prices] Returning ${Object.keys(livePrices).length} prices`);
      res.json({ prices: livePrices });
    } catch (error) {
      console.error("Error fetching live prices:", error);
      res.status(500).json({ error: "Failed to fetch live prices" });
    }
  });

  realtimeSignalGenerator.setBroadcastCallback(broadcastSignal);
  forexSignalGenerator.setBroadcastCallback(broadcastSignal);

  // ==================== FOREX ROUTES ====================

  // Start Finnhub Forex WebSocket connection
  app.post("/api/forex/start", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      const started = await forexSignalGenerator.start();

      if (started) {
        res.json({ 
          success: true, 
          message: "Forex signal generation started with Finnhub WebSocket"
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: "Failed to start Forex signals. Ensure Finnhub is configured with API key."
        });
      }
    } catch (error) {
      console.error("Error starting forex signals:", error);
      res.status(500).json({ error: "Failed to start forex signals" });
    }
  });

  // Stop Finnhub Forex WebSocket connection
  app.post("/api/forex/stop", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      forexSignalGenerator.stop();
      res.json({ success: true, message: "Forex signal generation stopped" });
    } catch (error) {
      res.status(500).json({ error: "Failed to stop forex signals" });
    }
  });

  // Get Forex connection status
  app.get("/api/forex/status", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const configs = await storage.getBrokerConfigs();
      const finnhubConfig = configs.find(c => c.type === "finnhub" && c.enabled);
      const isConnected = finnhubForexWebSocket.isConnectedStatus();

      res.json({ 
        finnhubConfigured: !!finnhubConfig,
        finnhubConnected: isConnected,
        mode: "forex",
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get forex status" });
    }
  });

  // Get live forex prices
  app.get("/api/forex/prices", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const livePrices = forexSignalGenerator.getLivePrices();
      const pricesObject: Record<string, any> = {};

      Array.from(livePrices.entries()).forEach(([assetId, data]) => {
        pricesObject[assetId] = data;
      });

      res.json({ prices: pricesObject });
    } catch (error) {
      console.error("Error fetching forex prices:", error);
      res.status(500).json({ error: "Failed to fetch forex prices" });
    }
  });

  // Get available Finnhub forex pairs
  app.get("/api/forex/pairs", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const pairs = Object.entries(FOREX_SYMBOL_MAP).map(([finnhubSymbol, info]) => ({
        finnhubSymbol,
        symbol: info.symbol,
        name: info.name,
      }));

      res.json({ pairs });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch forex pairs" });
    }
  });

  // Add forex pairs as assets
  app.post("/api/forex/add-pairs", async (req, res) => {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const user = await storage.getUser(req.session.userId);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      const { pairs } = req.body;
      if (!pairs || !Array.isArray(pairs)) {
        res.status(400).json({ error: "Invalid pairs array" });
        return;
      }

      const addedAssets = [];
      for (const finnhubSymbol of pairs) {
        const info = FOREX_SYMBOL_MAP[finnhubSymbol];
        if (info) {
          // Check if asset already exists
          const existingAssets = await storage.getAssets();
          const exists = existingAssets.some(a => a.symbol === info.symbol);
          
          if (!exists) {
            const asset = await storage.createAsset({
              symbol: info.symbol,
              name: info.name,
              type: "forex",
              exchange: "FOREX",
              enabled: true,
            });
            addedAssets.push(asset);
          }
        }
      }

      res.json({ success: true, addedAssets, count: addedAssets.length });
    } catch (error) {
      console.error("Error adding forex pairs:", error);
      res.status(500).json({ error: "Failed to add forex pairs" });
    }
  });

  // Auto-connect to Zerodha WebSocket on startup if configured
  // Use setImmediate to ensure all routes are registered first
  setImmediate(async () => {
    try {
      console.log("[Startup] Checking for Zerodha configuration...");
      const configs = await storage.getBrokerConfigs();
      const zerodhaConfig = configs.find(c => c.name === "zerodha" && c.connected);
      
      if (zerodhaConfig) {
        console.log("[Startup] ✅ Zerodha is configured and connected");
        console.log("[Startup] Initializing real-time signal generator...");
        await realtimeSignalGenerator.initialize();
        
        console.log("[Startup] Connecting to Zerodha WebSocket...");
        const connected = await realtimeSignalGenerator.connectZerodha();
        
        if (connected) {
          console.log("[Startup] ✅ Zerodha WebSocket auto-connected successfully");
          console.log("[Startup] 🔄 Real-time signals are now active");
        } else {
          console.log("[Startup] ⚠️  Failed to auto-connect Zerodha WebSocket");
          console.log("[Startup] Please check your Zerodha access token is valid");
        }
      } else {
        console.log("[Startup] ⚠️  Zerodha not configured or not connected");
        console.log("[Startup] Please configure Zerodha in Broker Settings to enable WebSocket");
      }

      // Check for Finnhub Forex configuration
      console.log("[Startup] Checking for Finnhub Forex configuration...");
      const finnhubConfig = configs.find(c => c.type === "finnhub" && c.enabled);
      
      if (finnhubConfig && finnhubConfig.apiKey) {
        console.log("[Startup] ✅ Finnhub is configured");
        console.log("[Startup] Starting Forex signal generator...");
        const forexStarted = await forexSignalGenerator.start();
        
        if (forexStarted) {
          console.log("[Startup] ✅ Finnhub Forex WebSocket auto-connected successfully");
          console.log("[Startup] 🔄 Forex signals are now active");
        } else {
          console.log("[Startup] ⚠️  Failed to auto-connect Finnhub Forex WebSocket");
        }
      } else {
        console.log("[Startup] ⚠️  Finnhub not configured or disabled");
        console.log("[Startup] Configure Finnhub in Broker Settings to enable Forex signals");
      }
    } catch (error) {
      console.error("[Startup] ❌ Error auto-connecting WebSocket:", error);
    }
  });

  return httpServer;
}
