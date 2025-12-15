import { storage } from "../storage";
import { signalDetector, type MarketData } from "./signal-detector";
import { brokerWebSocket } from "./broker-websocket";
import type { SignalBroadcastCallback } from "./market-data-generator";

/**
 * Real-time Signal Generator using WebSocket tick data
 * Replaces simulated market data with actual broker feeds
 */
export class RealtimeSignalGenerator {
  private broadcastCallback: SignalBroadcastCallback | null = null;
  private assetTokenMap: Map<string, { symbol: string; assetId: string; exchange: string }> = new Map();
  private tokenToAssetMap: Map<number, string> = new Map(); // instrumentToken -> assetId
  private isInitialized = false;

  setBroadcastCallback(callback: SignalBroadcastCallback) {
    this.broadcastCallback = callback;
  }

  getAssetTokenMap() {
    return this.assetTokenMap;
  }

  getTokenToAssetMap() {
    return this.tokenToAssetMap;
  }

  async initialize() {
    if (this.isInitialized) return;

    console.log("[Realtime Signals] Initializing...");

    // Listen for WebSocket ticks
    brokerWebSocket.on("tick", async (tickData: any) => {
      await this.processTickData(tickData);
    });

    // Listen for connection events
    brokerWebSocket.on("connected", async (data: any) => {
      console.log(`[Realtime Signals] ${data.broker} WebSocket connected`);
      await this.subscribeToAssets(data.broker);
    });

    brokerWebSocket.on("disconnected", (data: any) => {
      console.log(`[Realtime Signals] ${data.broker} WebSocket disconnected`);
    });

    brokerWebSocket.on("error", (data: any) => {
      console.error(`[Realtime Signals] ${data.broker} error:`, data.error);
    });

    this.isInitialized = true;
    console.log("[Realtime Signals] Initialized successfully");
  }

  /**
   * Subscribe to all enabled assets on the broker
   */
  private async subscribeToAssets(broker: string) {
    try {
      const assets = await storage.getAssets();
      // Filter to only enabled futures assets
      const enabledFutures = assets.filter(a => a.enabled && a.type === "indian_futures");

      if (enabledFutures.length === 0) {
        console.log("[Realtime Signals] No enabled futures assets to subscribe");
        return;
      }

      // For Zerodha, we need instrument tokens
      const instrumentTokens = this.getInstrumentTokens(enabledFutures);

      if (instrumentTokens.length > 0) {
        const success = brokerWebSocket.subscribe(broker, instrumentTokens);
        if (success) {
          console.log(`[Realtime Signals] Subscribed to ${instrumentTokens.length} futures instruments on ${broker}`);
        }
      }
    } catch (error) {
      console.error("[Realtime Signals] Error subscribing to assets:", error);
    }
  }

  /**
   * Get instrument tokens for assets
   * TODO: Fetch from Zerodha instruments API
   */
  private getInstrumentTokens(assets: any[]): number[] {
    // Instrument tokens for Indian futures and indices
    // Note: These are example tokens - in production, fetch from Zerodha instruments CSV
    const knownTokens: Record<string, number> = {
      // Index Futures (NSE)
      "NIFTY50": 256265,      // Nifty 50 Index
      "BANKNIFTY": 260105,    // Bank Nifty Index
      "FINNIFTY": 257801,     // Finnifty Index
      "MIDCPNIFTY": 288009,   // Midcap Nifty Index
      "NIFTYNXT50": 261897,   // Nifty Next 50
      
      // Commodity Futures (MCX)
      "GOLD": 261441,         // Gold Futures
      "SILVER": 261449,       // Silver Futures
      "CRUDEOIL": 261633,     // Crude Oil Futures
      "NATURALGAS": 261641,   // Natural Gas Futures
      
      // Stock Futures (NSE) - Popular stocks
      "RELIANCE": 738561,
      "TCS": 2953217,
      "INFY": 408065,
      "HDFCBANK": 341249,
      "ICICIBANK": 1270529,
      "SBIN": 779521,
      "BHARTIARTL": 2714625,
      "ITC": 424961,
      "KOTAKBANK": 492033,
      "LT": 2939649,
      "AXISBANK": 1510401,
      "HINDUNILVR": 356865,
      "MARUTI": 2815745,
      "BAJFINANCE": 81153,
      "ASIANPAINT": 60417,
      "BAJAJFINSV": 4268801,
      "WIPRO": 969473,
    };

    const tokens: number[] = [];
    
    for (const asset of assets) {
      const token = knownTokens[asset.symbol];
      if (token) {
        tokens.push(token);
        this.assetTokenMap.set(`TOKEN_${token}`, {
          symbol: asset.symbol,
          assetId: asset.id,
          exchange: asset.exchange || "NSE",
        });
        this.tokenToAssetMap.set(token, asset.id);
      } else {
        console.log(`[Realtime Signals] No instrument token found for ${asset.symbol}`);
      }
    }

    return tokens;
  }

  /**
   * Process incoming tick data and generate signals
   */
  private async processTickData(tickData: any) {
    try {
      // Map instrument token to asset
      const assetInfo = this.assetTokenMap.get(tickData.symbol);
      if (!assetInfo) {
        // Unknown instrument - skip
        return;
      }

      // Only process if we have enough EMA data
      if (!tickData.ema50 || !tickData.ema200) {
        return;
      }

      console.log(`[Realtime Signals] ${assetInfo.symbol}: ₹${tickData.lastPrice} (EMA50: ${tickData.ema50?.toFixed(2)}, EMA200: ${tickData.ema200?.toFixed(2)})`);

      // Create market data for signal detection - try both 5m and 15m timeframes
      const marketData5m: MarketData = {
        assetId: assetInfo.assetId,
        timeframe: "5m",
        price: tickData.lastPrice,
        high: tickData.high,
        low: tickData.low,
        open: tickData.open,
        ema50: tickData.ema50,
        ema200: tickData.ema200,
      };

      const marketData15m: MarketData = {
        assetId: assetInfo.assetId,
        timeframe: "15m",
        price: tickData.lastPrice,
        high: tickData.high,
        low: tickData.low,
        open: tickData.open,
        ema50: tickData.ema50,
        ema200: tickData.ema200,
      };

      // Detect signals for both timeframes
      const signals5m = await signalDetector.detectSignals(marketData5m);
      const signals15m = await signalDetector.detectSignals(marketData15m);
      const signals = [...signals5m, ...signals15m];

      // Debug logging
      if (signals.length === 0) {
        console.log(`[Realtime Signals] No signals detected for ${assetInfo.symbol} - Price: ₹${tickData.lastPrice}, EMA50: ${tickData.ema50?.toFixed(2)}, EMA200: ${tickData.ema200?.toFixed(2)}`);
      }

      // Broadcast signals
      for (const signal of signals) {
        const createdSignal = await storage.createSignal(signal);
        console.log(`[Realtime Signals] 🚨 Signal: ${signal.type} for ${assetInfo.symbol} at ₹${tickData.lastPrice}`);
        
        if (this.broadcastCallback) {
          this.broadcastCallback(createdSignal);
        }

        // Send notifications
        const asset = await storage.getAsset(assetInfo.assetId);
        const strategy = await storage.getStrategy(signal.strategyId);
        if (asset && strategy) {
          const configs = await storage.getNotificationConfigs();
          const { notificationService } = await import("./notification-service");
          notificationService.sendToAllEnabled({ signal: createdSignal, asset, strategy }, configs);
        }
      }
    } catch (error) {
      console.error("[Realtime Signals] Error processing tick:", error);
    }
  }

  /**
   * Connect to Zerodha WebSocket
   */
  async connectZerodha() {
    try {
      console.log("[Realtime Signals] Starting Zerodha connection...");
      const configs = await storage.getBrokerConfigs();
      console.log("[Realtime Signals] Found", configs.length, "broker configs");
      
      const zerodhaConfig = configs.find(c => c.name === "zerodha" && c.connected);
      console.log("[Realtime Signals] Zerodha config found:", !!zerodhaConfig);
      
      if (!zerodhaConfig) {
        console.error("[Realtime Signals] Zerodha not connected or not found");
        console.log("[Realtime Signals] Available configs:", configs.map(c => ({ name: c.name, connected: c.connected })));
        return false;
      }

      console.log("[Realtime Signals] Zerodha config details:", {
        name: zerodhaConfig.name,
        connected: zerodhaConfig.connected,
        hasApiKey: !!zerodhaConfig.apiKey,
        hasMetadata: !!zerodhaConfig.metadata
      });

      const metadata = zerodhaConfig.metadata as Record<string, any> || {};
      console.log("[Realtime Signals] Metadata keys:", Object.keys(metadata));
      
      if (!metadata.accessToken) {
        console.error("[Realtime Signals] No access token found in metadata");
        console.log("[Realtime Signals] Available metadata:", metadata);
        return false;
      }

      console.log("[Realtime Signals] Access token found, connecting to WebSocket...");
      const connected = await brokerWebSocket.connectZerodha({
        apiKey: zerodhaConfig.apiKey!,
        accessToken: metadata.accessToken,
        broker: "zerodha",
      });

      if (connected) {
        console.log("[Realtime Signals] ✅ Connected to Zerodha WebSocket successfully");
        return true;
      } else {
        console.error("[Realtime Signals] ❌ Failed to connect to Zerodha WebSocket");
        return false;
      }
    } catch (error) {
      console.error("[Realtime Signals] ❌ Exception connecting to Zerodha:", error);
      return false;
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    brokerWebSocket.disconnectAll();
    console.log("[Realtime Signals] Disconnected from all brokers");
  }
}

export const realtimeSignalGenerator = new RealtimeSignalGenerator();
