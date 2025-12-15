import { storage } from "../storage";
import { signalDetector, type MarketData } from "./signal-detector";
import { brokerWebSocket } from "./broker-websocket";
import { emaCalculator } from "./ema-calculator";
import type { SignalBroadcastCallback } from "./market-data-generator";

/**
 * Candle data structure for aggregating ticks
 */
interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number; // Start of candle period
}

/**
 * Candle history for EMA calculation per asset per timeframe
 */
interface CandleHistory {
  candles: Candle[];
  currentCandle: Candle | null;
  lastCandleTime: number;
}

/**
 * Check if Indian stock market is currently open
 * Market hours: 9:15 AM - 3:30 PM IST (Monday to Friday)
 */
function isMarketOpen(): boolean {
  const now = new Date();
  
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60; // 5 hours 30 minutes in minutes
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMinutes = utcMinutes + istOffset;
  
  // Handle day overflow
  const istHours = Math.floor((istMinutes % 1440) / 60);
  const istMins = istMinutes % 60;
  
  // Get day of week in IST
  const istDate = new Date(now.getTime() + istOffset * 60 * 1000);
  const dayOfWeek = istDate.getUTCDay();
  
  // Market closed on weekends (Saturday = 6, Sunday = 0)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  
  // Market hours: 9:15 AM to 3:30 PM IST
  const marketOpenMinutes = 9 * 60 + 15;  // 9:15 AM = 555 minutes
  const marketCloseMinutes = 15 * 60 + 30; // 3:30 PM = 930 minutes
  
  const currentISTMinutes = istHours * 60 + istMins;
  
  return currentISTMinutes >= marketOpenMinutes && currentISTMinutes <= marketCloseMinutes;
}

/**
 * Get current IST time as string for logging
 */
function getISTTimeString(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
  const istTime = new Date(now.getTime() + istOffset);
  return istTime.toISOString().replace('T', ' ').substring(0, 19) + ' IST';
}

/**
 * Real-time Signal Generator using WebSocket tick data
 * Replaces simulated market data with actual broker feeds
 */
export class RealtimeSignalGenerator {
  private broadcastCallback: SignalBroadcastCallback | null = null;
  private assetTokenMap: Map<string, { symbol: string; assetId: string; exchange: string }> = new Map();
  private tokenToAssetMap: Map<number, string> = new Map(); // instrumentToken -> assetId
  private isInitialized = false;
  
  // Candle history for proper EMA calculation: key = "assetId-timeframe" (e.g., "asset1-5m")
  private candleHistories: Map<string, CandleHistory> = new Map();
  
  // Timeframe intervals in milliseconds
  private readonly TIMEFRAMES = {
    "5m": 5 * 60 * 1000,   // 5 minutes
    "15m": 15 * 60 * 1000, // 15 minutes
  };

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
   * Get the start timestamp for a candle period
   */
  private getCandlePeriodStart(timestamp: number, intervalMs: number): number {
    return Math.floor(timestamp / intervalMs) * intervalMs;
  }

  /**
   * Initialize or get candle history for an asset/timeframe combination
   */
  private getCandleHistory(assetId: string, timeframe: string): CandleHistory {
    const key = `${assetId}-${timeframe}`;
    if (!this.candleHistories.has(key)) {
      this.candleHistories.set(key, {
        candles: [],
        currentCandle: null,
        lastCandleTime: 0,
      });
    }
    return this.candleHistories.get(key)!;
  }

  /**
   * Update candle with new tick data
   * Returns true if a candle just closed (time to check signals)
   */
  private updateCandle(
    assetId: string,
    timeframe: string,
    price: number,
    high: number,
    low: number,
    timestamp: number
  ): { candleClosed: boolean; closedCandle: Candle | null } {
    const intervalMs = this.TIMEFRAMES[timeframe as keyof typeof this.TIMEFRAMES];
    const history = this.getCandleHistory(assetId, timeframe);
    const periodStart = this.getCandlePeriodStart(timestamp, intervalMs);

    let candleClosed = false;
    let closedCandle: Candle | null = null;

    // Check if we're in a new candle period
    if (history.currentCandle && periodStart > history.lastCandleTime) {
      // Close the current candle and add to history
      closedCandle = { ...history.currentCandle };
      history.candles.push(closedCandle);
      
      // Keep only last 250 candles for EMA calculation
      if (history.candles.length > 250) {
        history.candles.shift();
      }
      
      candleClosed = true;
      history.currentCandle = null;
    }

    // Create or update current candle
    if (!history.currentCandle) {
      history.currentCandle = {
        open: price,
        high: high,
        low: low,
        close: price,
        timestamp: periodStart,
      };
      history.lastCandleTime = periodStart;
    } else {
      // Update current candle with tick data
      history.currentCandle.high = Math.max(history.currentCandle.high, high);
      history.currentCandle.low = Math.min(history.currentCandle.low, low);
      history.currentCandle.close = price; // Latest price is the close
    }

    return { candleClosed, closedCandle };
  }

  /**
   * Calculate EMA from candle history
   * Returns { ema50, ema200 } or nulls if insufficient data
   */
  private calculateEMAFromCandles(assetId: string, timeframe: string): { ema50: number | null; ema200: number | null } {
    const history = this.getCandleHistory(assetId, timeframe);
    
    if (history.candles.length < 50) {
      return { ema50: null, ema200: null };
    }

    const closePrices = history.candles.map(c => c.close);
    return emaCalculator.calculateEMA50And200(closePrices);
  }

  /**
   * Process incoming tick data and generate signals
   * Now properly aggregates ticks into candles and calculates EMA on candle close prices
   */
  private async processTickData(tickData: any) {
    try {
      // Check if market is open before generating signals
      if (!isMarketOpen()) {
        return;
      }

      // Map instrument token to asset
      const assetInfo = this.assetTokenMap.get(tickData.symbol);
      if (!assetInfo) {
        return;
      }

      const timestamp = Date.now();
      const price = tickData.lastPrice;
      const high = tickData.high || price;
      const low = tickData.low || price;

      // Process for each timeframe
      for (const timeframe of ["5m", "15m"]) {
        const { candleClosed, closedCandle } = this.updateCandle(
          assetInfo.assetId,
          timeframe,
          price,
          high,
          low,
          timestamp
        );

        // Only check for signals when a candle closes (proper EMA calculation)
        if (candleClosed && closedCandle) {
          const { ema50, ema200 } = this.calculateEMAFromCandles(assetInfo.assetId, timeframe);

          if (ema50 === null || ema200 === null) {
            console.log(`[Realtime Signals] ${assetInfo.symbol} ${timeframe}: Insufficient data for EMA (need 200 candles, have ${this.getCandleHistory(assetInfo.assetId, timeframe).candles.length})`);
            continue;
          }

          console.log(`[Realtime Signals] ${assetInfo.symbol} ${timeframe} candle closed: ₹${closedCandle.close.toFixed(2)} (EMA50: ${ema50.toFixed(2)}, EMA200: ${ema200.toFixed(2)})`);

          const marketData: MarketData = {
            assetId: assetInfo.assetId,
            timeframe,
            price: closedCandle.close,
            high: closedCandle.high,
            low: closedCandle.low,
            open: closedCandle.open,
            ema50,
            ema200,
          };

          const signals = await signalDetector.detectSignals(marketData);

          for (const signal of signals) {
            const createdSignal = await storage.createSignal(signal);
            console.log(`[Realtime Signals] 🚨 Signal: ${signal.type} for ${assetInfo.symbol} at ₹${closedCandle.close.toFixed(2)}`);

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
