import { storage } from "../storage";
import { signalDetector, type MarketData } from "./signal-detector";
import { brokerWebSocket } from "./broker-websocket";
import { emaCalculator } from "./ema-calculator";
import { ZerodhaAdapter, type HistoricalCandle } from "./broker-service";
import type { SignalBroadcastCallback } from "./market-data-generator";

// Minimum candles required for accurate EMA matching TradingView
// TradingView uses ALL historical data, so we need enough for EMA 200 to converge
// For EMA200 to be accurate, we need ~3-5x the period = 600-1000 candles
// We'll store up to 2000 candles for best accuracy
const MIN_CANDLES_FOR_EMA = 2000;

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
 * Get today's market open time (9:15 AM IST) in UTC milliseconds
 * IST = UTC + 5:30, so 9:15 AM IST = 3:45 AM UTC
 */
function getMarketOpenMs(): number {
  const now = Date.now();
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5:30
  
  // Get today's date in IST
  const nowInIST = new Date(now + IST_OFFSET_MS);
  const year = nowInIST.getUTCFullYear();
  const month = nowInIST.getUTCMonth();
  const date = nowInIST.getUTCDate();
  
  // 9:15 AM IST = 3:45 AM UTC
  // Create UTC timestamp for 3:45 AM UTC on today's IST date
  const marketOpenUTC = Date.UTC(year, month, date, 3, 45, 0, 0);
  
  return marketOpenUTC;
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
  private tokenValidationInterval: NodeJS.Timeout | null = null;
  private candleCloseTimer: NodeJS.Timeout | null = null;
  
  // Candle history for proper EMA calculation: key = "assetId-timeframe" (e.g., "asset1-5m")
  private candleHistories: Map<string, CandleHistory> = new Map();
  
  // Track previous EMA values for crossover detection
  private previousEMA: Map<string, { ema50: number; ema200: number }> = new Map();
  
  // Timeframe intervals in milliseconds
  private readonly TIMEFRAMES = {
    "5m": 5 * 60 * 1000,   // 5 minutes
    "15m": 15 * 60 * 1000, // 15 minutes
  };

  setBroadcastCallback(callback: SignalBroadcastCallback) {
    this.broadcastCallback = callback;
  }

  /**
   * Auto-connect to Zerodha on server startup if already configured
   */
  private async autoConnectOnStartup() {
    try {
      // Wait a bit for server to fully initialize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log("[Realtime Signals] 🚀 Auto-connect: Checking for configured brokers...");
      
      const configs = await storage.getBrokerConfigs();
      const zerodhaConfig = configs.find(c => c.name === "zerodha" && c.connected);
      
      if (!zerodhaConfig) {
        console.log("[Realtime Signals] Auto-connect: No connected Zerodha config found");
        return;
      }
      
      const metadata = zerodhaConfig.metadata as Record<string, any> || {};
      if (!metadata.accessToken) {
        console.log("[Realtime Signals] Auto-connect: No access token found");
        return;
      }
      
      console.log("[Realtime Signals] 🚀 Auto-connect: Found Zerodha config, connecting...");
      const connected = await this.connectZerodha();
      
      if (connected) {
        console.log("[Realtime Signals] ✅ Auto-connect: Successfully connected to Zerodha!");
        console.log("[Realtime Signals] 📊 Historical data will be fetched automatically...");
      }
    } catch (error) {
      console.error("[Realtime Signals] Auto-connect error:", error);
    }
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

    // Start candle close timer for real-time signal generation
    // This ensures signals fire exactly at candle close, not waiting for next tick
    this.startCandleCloseTimer();

    // Listen for connection events
    brokerWebSocket.on("connected", async (data: any) => {
      console.log(`[Realtime Signals] ${data.broker} WebSocket connected`);
      await this.subscribeToAssets(data.broker);
    });

    // AUTO-START: Try to connect to Zerodha if already configured
    this.autoConnectOnStartup();

    brokerWebSocket.on("disconnected", (data: any) => {
      console.log(`[Realtime Signals] ${data.broker} WebSocket disconnected`);
    });

    brokerWebSocket.on("error", (data: any) => {
      console.error(`[Realtime Signals] ${data.broker} error:`, data.error);
    });

    brokerWebSocket.on("token_expired", async (data: any) => {
      console.error(`[Realtime Signals] ${data.broker} token expired - clearing credentials`);
      try {
        // Clear the expired token from database
        const configs = await storage.getBrokerConfigs();
        const brokerConfig = configs.find(c => c.name === data.broker);
        if (brokerConfig) {
          await storage.updateBrokerConfig(brokerConfig.id, {
            connected: false,
            metadata: {
              ...(brokerConfig.metadata as Record<string, unknown> || {}),
              accessToken: null,
              userId: null,
              tokenDate: null,
            },
          });
          console.log(`[Realtime Signals] ✅ Cleared expired token for ${data.broker}`);
          console.log(`[Realtime Signals] ⚠️ Please re-authenticate via the broker configuration page`);
        }
      } catch (error) {
        console.error(`[Realtime Signals] Failed to clear expired token:`, error);
      }
    });

    // Start periodic token validation (every 30 minutes)
    this.startTokenValidation();

    this.isInitialized = true;
    console.log("[Realtime Signals] Initialized successfully");
  }

  /**
   * Start periodic token validation to detect expiration before WebSocket failures
   */
  private startTokenValidation() {
    if (this.tokenValidationInterval) {
      return; // Already running
    }

    console.log("[Realtime Signals] Starting token validation (every 30 minutes)");
    
    this.tokenValidationInterval = setInterval(async () => {
      try {
        const configs = await storage.getBrokerConfigs();
        const zerodhaConfig = configs.find(c => c.name === "zerodha" && c.connected);
        
        if (!zerodhaConfig) {
          return;
        }

        const metadata = zerodhaConfig.metadata as Record<string, any> || {};
        if (!metadata.accessToken) {
          return;
        }

        // Test the token by making a lightweight API call
        const { ZerodhaAdapter } = await import("./broker-service");
        const adapter = new ZerodhaAdapter();
        const result = await adapter.connect({
          apiKey: zerodhaConfig.apiKey!,
          apiSecret: zerodhaConfig.apiSecret || "",
          accessToken: metadata.accessToken,
        });

        if (!result.success) {
          console.error("[Realtime Signals] Token validation failed:", result.message);
          
          // Check if it's a token expiration issue
          if (result.message.toLowerCase().includes('token') || 
              result.message.toLowerCase().includes('session') ||
              result.message.toLowerCase().includes('expired')) {
            console.error("[Realtime Signals] ❌ Token expired - clearing credentials");
            
            // Clear expired token
            await storage.updateBrokerConfig(zerodhaConfig.id, {
              connected: false,
              metadata: {
                ...(metadata || {}),
                accessToken: null,
                userId: null,
                tokenDate: null,
              },
            });
            
            // Disconnect WebSocket
            brokerWebSocket.disconnect("zerodha");
            
            console.log("[Realtime Signals] ⚠️ Please re-authenticate via the broker configuration page");
          }
        } else {
          console.log("[Realtime Signals] Token validation passed ✓");
        }
      } catch (error) {
        console.error("[Realtime Signals] Token validation error:", error);
      }
    }, 30 * 60 * 1000); // Every 30 minutes
  }

  /**
   * Stop token validation interval
   */
  private stopTokenValidation() {
    if (this.tokenValidationInterval) {
      clearInterval(this.tokenValidationInterval);
      this.tokenValidationInterval = null;
      console.log("[Realtime Signals] Token validation stopped");
    }
  }

  /**
   * Subscribe to all enabled assets on the broker
   */
  private async subscribeToAssets(broker: string) {
    try {
      const assets = await storage.getAssets();
      // Filter to all enabled Indian assets (stocks and futures)
      const enabledAssets = assets.filter(a => 
        a.enabled && (a.type === "indian_futures" || a.type === "indian_stock")
      );

      if (enabledAssets.length === 0) {
        console.log("[Realtime Signals] No enabled Indian assets to subscribe");
        return;
      }

      console.log(`[Realtime Signals] Found ${enabledAssets.length} enabled assets to subscribe`);

      // For Zerodha, we need instrument tokens
      const instrumentTokens = this.getInstrumentTokens(enabledAssets);

      if (instrumentTokens.length > 0) {
        const success = brokerWebSocket.subscribe(broker, instrumentTokens);
        if (success) {
          console.log(`[Realtime Signals] ✅ Subscribed to ${instrumentTokens.length}/${enabledAssets.length} instruments on ${broker}`);
          
          // Fetch historical data to warm up EMA calculation (TradingView compatible)
          if (broker === "zerodha") {
            await this.fetchHistoricalDataForAssets(enabledAssets, instrumentTokens);
          }
        }
      } else {
        console.log("[Realtime Signals] ⚠️ No valid instrument tokens found for any assets");
      }
    } catch (error) {
      console.error("[Realtime Signals] Error subscribing to assets:", error);
    }
  }

  /**
   * Fetch historical candle data from Zerodha to warm up EMA calculation.
   * This is essential for matching TradingView's EMA values.
   * TradingView uses ALL historical data, so we fetch 500+ candles.
   * 
   * Optimized for 200+ assets:
   * - Runs in background (non-blocking)
   * - Processes in batches with rate limiting
   * - Zerodha rate limit: ~3 requests/second
   */
  private async fetchHistoricalDataForAssets(assets: any[], instrumentTokens: number[]) {
    // Run in background - don't block WebSocket subscription
    this.fetchHistoricalDataInBackground(assets, instrumentTokens).catch(err => {
      console.error("[Realtime Signals] Background historical fetch error:", err);
    });
  }

  /**
   * Detect and fill gaps in candle data with historical data
   * Public so it can be called from API routes
   */
  public async backfillMissingData(assetId: string, timeframe: string) {
    const history = this.getCandleHistory(assetId, timeframe);
    
    if (history.candles.length === 0) return;
    
    const now = Date.now();
    const lastCandle = history.candles[history.candles.length - 1];
    const intervalMs = this.TIMEFRAMES[timeframe as keyof typeof this.TIMEFRAMES];
    
    // Calculate expected next candle time after last candle
    const expectedNextCandleTime = lastCandle.timestamp + intervalMs;
    const timeSinceLastCandle = now - lastCandle.timestamp;
    
    // If gap is more than 2 intervals, backfill
    // Backfill should work even when market is closed to fill gaps from earlier
    const gapThreshold = intervalMs * 2;
    
    if (timeSinceLastCandle > gapThreshold) {
      console.log(`[Backfill] Detected ${Math.floor(timeSinceLastCandle / intervalMs)} missing candles for ${assetId} ${timeframe}`);
      
      // Calculate proper end time - either now or market close (whichever is earlier)
      const marketCloseToday = getMarketOpenMs() + (6 * 60 + 15) * 60 * 1000; // 3:30 PM IST = 6h15m after 9:15 AM
      const backfillEndTime = Math.min(now, marketCloseToday);
      
      await this.backfillAssetData(assetId, timeframe, lastCandle.timestamp, backfillEndTime);
    }
  }

  /**
   * Backfill historical data for a specific asset and timeframe
   */
  private async backfillAssetData(assetId: string, timeframe: string, fromTime: number, toTime: number) {
    try {
      const configs = await storage.getBrokerConfigs();
      const zerodhaConfig = configs.find(c => c.name === "zerodha" && c.connected);
      
      if (!zerodhaConfig) return;
      
      const metadata = zerodhaConfig.metadata as Record<string, any> || {};
      if (!metadata.accessToken) return;
      
      const { ZerodhaAdapter } = await import("./broker-service");
      const adapter = new ZerodhaAdapter();
      
      await adapter.connect({
        apiKey: zerodhaConfig.apiKey!,
        apiSecret: zerodhaConfig.apiSecret || "",
        accessToken: metadata.accessToken,
      });
      
      // Find instrument token for this asset
      const instrumentTokenEntry = Array.from(this.assetTokenMap.entries())
        .find(([_, info]) => info.assetId === assetId);
      
      if (!instrumentTokenEntry) {
        console.log(`[Backfill] No instrument token found for asset ${assetId}`);
        return;
      }
      
      const instrumentToken = parseInt(instrumentTokenEntry[0]);
      const zerodhaTimeframe = timeframe === "5m" ? "5minute" : "15minute";
      const from = new Date(fromTime);
      const to = new Date(toTime);
      
      console.log(`[Backfill] Fetching ${zerodhaTimeframe} data for asset ${assetId} from ${from.toISOString()} to ${to.toISOString()}`);
      
      const candles = await adapter.getHistoricalCandles(instrumentToken, zerodhaTimeframe, from, to);
      
      if (candles.length > 0) {
        console.log(`[Backfill] Retrieved ${candles.length} candles`);
        this.loadHistoricalCandles(assetId, timeframe, candles);
      }
    } catch (error) {
      console.error(`[Backfill] Error backfilling data for ${assetId}:`, error);
    }
  }

  /**
   * Background historical data fetcher with optimized batching (public for API access)
   * Processes assets in parallel batches while respecting rate limits
   */
  public async fetchHistoricalDataInBackground(assets: any[], instrumentTokens: number[]) {
    try {
      const configs = await storage.getBrokerConfigs();
      const zerodhaConfig = configs.find(c => c.name === "zerodha" && c.connected);
      
      if (!zerodhaConfig) {
        console.log("[Realtime Signals] Zerodha not connected, skipping historical data fetch");
        return;
      }

      const metadata = zerodhaConfig.metadata as Record<string, any> || {};
      if (!metadata.accessToken) {
        console.log("[Realtime Signals] No access token, skipping historical data fetch");
        return;
      }

      const adapter = new ZerodhaAdapter();
      await adapter.connect({
        apiKey: zerodhaConfig.apiKey!,
        apiSecret: zerodhaConfig.apiSecret || "",
        accessToken: metadata.accessToken,
      });

      const totalAssets = instrumentTokens.length;
      console.log(`[Realtime Signals] 📊 Starting background historical data fetch for ${totalAssets} assets...`);

      // Calculate date range for historical data
      // Zerodha allows up to 60 days for intraday data
      // For accurate EMA200, we need ~1000+ data points for proper convergence
      const to = new Date();
      // 5m candles: 60 days = ~4500 candles (75 candles/day * 60 days)
      const from5m = new Date(to.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days back for 5m
      // 15m candles: 100 days = ~2500 candles (25 candles/day * 100 days)
      const from15m = new Date(to.getTime() - 100 * 24 * 60 * 60 * 1000); // 100 days back for 15m

      let successCount = 0;
      let failCount = 0;
      let processed = 0;

      // Process in batches of 3 (Zerodha allows ~3 requests/second)
      const BATCH_SIZE = 3;
      const BATCH_DELAY_MS = 1100; // Slightly over 1 second for safety

      for (let i = 0; i < instrumentTokens.length; i += BATCH_SIZE) {
        const batch = instrumentTokens.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (token) => {
          const assetId = this.tokenToAssetMap.get(token);
          if (!assetId) return { success: false, symbol: 'unknown' };

          const asset = assets.find(a => a.id === assetId);
          if (!asset) return { success: false, symbol: 'unknown' };

          try {
            // Fetch both timeframes
            const [candles5m, candles15m] = await Promise.all([
              adapter.getHistoricalCandles(token, "5minute", from5m, to),
              adapter.getHistoricalCandles(token, "15minute", from15m, to),
            ]);

            if (candles5m.length > 0) {
              this.loadHistoricalCandles(assetId, "5m", candles5m);
            }
            if (candles15m.length > 0) {
              this.loadHistoricalCandles(assetId, "15m", candles15m);
            }

            return { 
              success: candles5m.length > 0 || candles15m.length > 0, 
              symbol: asset.symbol,
              candles5m: candles5m.length,
              candles15m: candles15m.length,
            };
          } catch (error) {
            return { success: false, symbol: asset.symbol, error };
          }
        });

        const results = await Promise.all(batchPromises);
        
        for (const result of results) {
          processed++;
          if (result.success) {
            successCount++;
          } else if (result.symbol !== 'unknown') {
            failCount++;
          }
        }

        // Progress update every 10% or every 20 assets
        if (processed % Math.max(20, Math.floor(totalAssets / 10)) === 0 || processed === totalAssets) {
          const percent = Math.round((processed / totalAssets) * 100);
          console.log(`[Realtime Signals] 📊 Historical data: ${percent}% (${successCount}/${processed} loaded)`);
        }

        // Rate limit delay between batches (only if more batches remaining)
        if (i + BATCH_SIZE < instrumentTokens.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      console.log(`[Realtime Signals] ✅ Historical data fetch complete: ${successCount} success, ${failCount} failed out of ${totalAssets} assets`);
    } catch (error) {
      console.error("[Realtime Signals] Error in background historical fetch:", error);
    }
  }

  /**
   * Load historical candles into candle history for EMA calculation
   * Properly merges new candles avoiding duplicates and sorting by timestamp
   */
  private loadHistoricalCandles(assetId: string, timeframe: string, candles: HistoricalCandle[]) {
    const history = this.getCandleHistory(assetId, timeframe);
    
    // Create a map of existing candles by timestamp for deduplication
    const existingTimestamps = new Set(history.candles.map(c => c.timestamp));
    
    // Convert and add only new candles (avoid duplicates)
    let addedCount = 0;
    for (const candle of candles) {
      const timestamp = candle.timestamp.getTime();
      if (!existingTimestamps.has(timestamp)) {
        history.candles.push({
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          timestamp,
        });
        existingTimestamps.add(timestamp);
        addedCount++;
      }
    }
    
    console.log(`[LoadHistorical] Added ${addedCount} new candles (${candles.length - addedCount} duplicates skipped)`);
    
    // Sort candles by timestamp (important for proper EMA calculation)
    history.candles.sort((a, b) => a.timestamp - b.timestamp);

    // Keep only the most recent candles (matching TradingView's calculation window)
    if (history.candles.length > MIN_CANDLES_FOR_EMA) {
      history.candles = history.candles.slice(-MIN_CANDLES_FOR_EMA);
    }

    // Update last candle time
    if (history.candles.length > 0) {
      history.lastCandleTime = history.candles[history.candles.length - 1].timestamp;
    }
    
    console.log(`[LoadHistorical] Total candles now: ${history.candles.length}, Last candle: ${new Date(history.lastCandleTime).toISOString()}`);
  }

  /**
   * Get instrument tokens for assets (public for API access)
   * Priority: 1) Asset's instrumentToken field, 2) Known tokens lookup, 3) Skip
   */
  public getInstrumentTokens(assets: any[]): number[] {
    // Comprehensive instrument tokens for Indian markets
    // These are NSE/BSE equity and index tokens - NOT futures tokens
    const knownTokens: Record<string, number> = {
      // NSE Indices
      "NIFTY": 256265,
      "NIFTY50": 256265,
      "NIFTY 50": 256265,
      "BANKNIFTY": 260105,
      "BANK NIFTY": 260105,
      "FINNIFTY": 257801,
      "NIFTY FIN SERVICE": 257801,
      "MIDCPNIFTY": 288009,
      "NIFTY MIDCAP 50": 288009,
      "NIFTYNXT50": 270857,
      "NIFTY NEXT 50": 270857,
      "SENSEX": 265,
      
      // Nifty 50 Stocks (NSE)
      "ADANIENT": 6401,
      "ADANIPORTS": 3861249,
      "APOLLOHOSP": 40193,
      "ASIANPAINT": 60417,
      "AXISBANK": 1510401,
      "BAJAJ-AUTO": 4267265,
      "BAJFINANCE": 81153,
      "BAJAJFINSV": 4268801,
      "BPCL": 134657,
      "BHARTIARTL": 2714625,
      "BRITANNIA": 140033,
      "CIPLA": 177665,
      "COALINDIA": 5215745,
      "DIVISLAB": 2800641,
      "DRREDDY": 225537,
      "EICHERMOT": 232961,
      "GRASIM": 315393,
      "HCLTECH": 1850625,
      "HDFCBANK": 341249,
      "HDFCLIFE": 119553,
      "HEROMOTOCO": 345089,
      "HINDALCO": 348929,
      "HINDUNILVR": 356865,
      "ICICIBANK": 1270529,
      "ITC": 424961,
      "INDUSINDBK": 1346049,
      "INFY": 408065,
      "INFOSYS": 408065,
      "JSWSTEEL": 3001089,
      "KOTAKBANK": 492033,
      "LT": 2939649,
      "M&M": 519937,
      "MARUTI": 2815745,
      "NESTLEIND": 4598529,
      "NTPC": 2977281,
      "ONGC": 633601,
      "POWERGRID": 3834113,
      "RELIANCE": 738561,
      "SBILIFE": 5582849,
      "SBIN": 779521,
      "SUNPHARMA": 857857,
      "TCS": 2953217,
      "TATACONSUM": 878593,
      "TATAMOTORS": 884737,
      "TATASTEEL": 895745,
      "TECHM": 3465729,
      "TITAN": 897537,
      "ULTRACEMCO": 2952193,
      "UPL": 2889473,
      "WIPRO": 969473,
      
      // Bank Nifty Stocks
      "AUBANK": 5436929,
      "BANDHANBNK": 579329,
      "FEDERALBNK": 261889,
      "IDFCFIRSTB": 2863105,
      "PNB": 2730497,
      
      // Other Popular Stocks
      "ADANIGREEN": 912129,
      "ADANIPOWER": 11536385,
      "AMBUJACEM": 325121,
      "AUROPHARMA": 70401,
      "BAJAJHLDNG": 82945,
      "BANKBARODA": 1195009,
      "BEL": 98049,
      "BERGEPAINT": 103425,
      "BIOCON": 2911489,
      "BOSCHLTD": 2181889,
      "CADILAHC": 2029825,
      "CHOLAFIN": 175361,
      "COLPAL": 3876097,
      "CONCOR": 1215745,
      "CUMMINSIND": 486657,
      "DLF": 3771393,
      "DABUR": 197633,
      "GAIL": 1207553,
      "GODREJCP": 2585345,
      "GODREJPROP": 4576001,
      "HAVELLS": 2513665,
      "HDFC": 340481,
      "HINDZINC": 4323585,
      "ICICIGI": 5573121,
      "ICICIPRULI": 4774913,
      "IDEA": 3677697,
      "IPCALAB": 418049,
      "JINDALSTEL": 1723649,
      "JUBLFOOD": 4632577,
      "L&TFH": 6386689,
      "LICHSGFIN": 511233,
      "LUPIN": 2672641,
      "MGL": 4488705,
      "MPHASIS": 4503297,
      "MRF": 562689,
      "MUTHOOTFIN": 6054401,
      "NMDC": 3924993,
      "OFSS": 2748929,
      "PAGEIND": 3689729,
      "PEL": 617473,
      "PETRONET": 2905857,
      "PFC": 3405569,
      "PIDILITIND": 681985,
      "PIIND": 2402561,
      "PVR": 3365633,
      "RAMCOCEM": 523009,
      "RECLTD": 3930881,
      "SAIL": 758529,
      "SHREECEM": 794369,
      "SIEMENS": 806401,
      "SRF": 837889,
      "TATAELXSI": 3465217,
      "TATAPOWER": 877057,
      "TORNTPHARM": 900609,
      "TORNTPOWER": 3529217,
      "TVSMOTOR": 2170625,
      "UBL": 4278529,
      "VEDL": 784129,
      "VOLTAS": 951809,
      "ZEEL": 975873,
      
      // MCX Commodities (spot)
      "GOLD": 53505799,
      "SILVER": 53506055,
      "CRUDEOIL": 53496327,
      "NATURALGAS": 53496583,
      "COPPER": 53505031,
      "ALUMINIUM": 53504519,
      "ZINC": 53506311,
      "LEAD": 53505543,
      "NICKEL": 53505287,
    };

    const tokens: number[] = [];
    const unmappedAssets: string[] = [];
    
    for (const asset of assets) {
      let token: number | undefined;
      
      // Priority 1: Use instrumentToken from database if set
      if (asset.instrumentToken) {
        token = asset.instrumentToken;
      } else {
        // Priority 2: Look up in known tokens (try various symbol formats)
        const symbolVariants = [
          asset.symbol,
          asset.symbol.toUpperCase(),
          asset.symbol.replace(/\s+/g, ""),
          asset.symbol.replace(/-/g, ""),
        ];
        
        for (const variant of symbolVariants) {
          if (knownTokens[variant]) {
            token = knownTokens[variant];
            break;
          }
        }
      }
      
      if (token) {
        tokens.push(token);
        this.assetTokenMap.set(`TOKEN_${token}`, {
          symbol: asset.symbol,
          assetId: asset.id,
          exchange: asset.exchange || "NSE",
        });
        this.tokenToAssetMap.set(token, asset.id);
      } else {
        unmappedAssets.push(asset.symbol);
      }
    }
    
    if (unmappedAssets.length > 0) {
      console.log(`[Realtime Signals] ⚠️ No instrument token for ${unmappedAssets.length} assets: ${unmappedAssets.slice(0, 10).join(", ")}${unmappedAssets.length > 10 ? "..." : ""}`);
      console.log(`[Realtime Signals] 💡 Set instrumentToken in asset config or add to knownTokens list`);
    }

    return tokens;
  }

  /**
   * Get the start timestamp for a candle period
   * Aligns to market open time (9:15 AM IST) for accurate candle boundaries
   * 
   * For 5m candles: 9:15, 9:20, 9:25...
   * For 15m candles: 9:15, 9:30, 9:45...
   */
  private getCandlePeriodStart(timestamp: number, intervalMs: number): number {
    const marketOpenMs = getMarketOpenMs();
    
    // Calculate elapsed time since market open
    const elapsedMs = timestamp - marketOpenMs;
    
    // If before market open, use the previous day's alignment
    if (elapsedMs < 0) {
      // Fall back to standard alignment for pre-market
      return Math.floor(timestamp / intervalMs) * intervalMs;
    }
    
    // Calculate candle period aligned to market open
    const periodsSinceOpen = Math.floor(elapsedMs / intervalMs);
    return marketOpenMs + (periodsSinceOpen * intervalMs);
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
      
      // Keep enough candles for accurate EMA calculation (TradingView compatible)
      // Need 500+ candles for EMA 200 to converge properly
      if (history.candles.length > MIN_CANDLES_FOR_EMA) {
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
   * Start timer-based candle close detection
   * This ensures signals fire EXACTLY at candle close time, not waiting for next tick
   * Checks every second for candle boundaries
   */
  private startCandleCloseTimer() {
    if (this.candleCloseTimer) {
      clearInterval(this.candleCloseTimer);
    }

    console.log("[Realtime Signals] ⏱️ Starting candle close timer for real-time signals");

    // Check every second for candle closes
    this.candleCloseTimer = setInterval(() => {
      this.checkCandleCloses();
    }, 1000);
  }

  /**
   * Check if any candles should close and process them
   * Called every second by the timer
   */
  private async checkCandleCloses() {
    if (!isMarketOpen()) return;

    const now = Date.now();

    for (const [key, history] of Array.from(this.candleHistories.entries())) {
      if (!history.currentCandle) continue;

      const [assetId, timeframe] = key.split('-');
      const intervalMs = this.TIMEFRAMES[timeframe as keyof typeof this.TIMEFRAMES];
      if (!intervalMs) continue;

      const currentPeriodStart = this.getCandlePeriodStart(now, intervalMs);

      // Check if we've moved to a new period (candle should close)
      if (currentPeriodStart > history.lastCandleTime && history.currentCandle) {
        // Close the current candle
        const closedCandle = { ...history.currentCandle };
        history.candles.push(closedCandle);

        if (history.candles.length > MIN_CANDLES_FOR_EMA) {
          history.candles.shift();
        }

        // Get asset info
        const assetInfo = Array.from(this.assetTokenMap.values()).find(a => a.assetId === assetId);
        if (assetInfo) {
          await this.processClosedCandle(assetInfo, timeframe, closedCandle);
        }

        // Reset for new candle
        history.currentCandle = null;
      }
    }
  }

  /**
   * Process a closed candle and generate signals
   * Separated to be called both by tick processing and timer
   */
  private async processClosedCandle(
    assetInfo: { symbol: string; assetId: string; exchange: string },
    timeframe: string,
    closedCandle: Candle
  ) {
    try {
      const { ema50, ema200 } = this.calculateEMAFromCandles(assetInfo.assetId, timeframe);

      if (ema50 === null || ema200 === null) {
        return;
      }

      // Check if we have enough candles for accurate EMA
      const history = this.getCandleHistory(assetInfo.assetId, timeframe);
      const candleCount = history.candles.length;
      const MIN_CANDLES_FOR_SIGNALS = 500; // Need at least 500 candles for EMA200 to stabilize properly
      
      if (candleCount < MIN_CANDLES_FOR_SIGNALS) {
        console.log(`[Realtime Signals] ⚠️ ${assetInfo.symbol} ${timeframe}: Skipping signals - only ${candleCount}/${MIN_CANDLES_FOR_SIGNALS} candles (EMA not yet accurate)`);
        return;
      }

      // Get previous EMA for crossover detection
      const emaKey = `${assetInfo.assetId}-${timeframe}`;
      const prevEMA = this.previousEMA.get(emaKey);

      // Log candle close with timestamp
      const closeTime = new Date(closedCandle.timestamp + this.TIMEFRAMES[timeframe as keyof typeof this.TIMEFRAMES]);
      console.log(`[Realtime Signals] 🕐 ${assetInfo.symbol} ${timeframe} candle closed at ${closeTime.toISOString()}: ₹${closedCandle.close.toFixed(2)} (EMA50: ${ema50.toFixed(2)}, EMA200: ${ema200.toFixed(2)})`);

      // Detect EMA crossover
      if (prevEMA) {
        const wasEma50Below = prevEMA.ema50 < prevEMA.ema200;
        const isEma50Above = ema50 > ema200;
        const wasEma50Above = prevEMA.ema50 > prevEMA.ema200;
        const isEma50Below = ema50 < ema200;

        if (wasEma50Below && isEma50Above) {
          console.log(`[Realtime Signals] 📈 BULLISH CROSSOVER: ${assetInfo.symbol} ${timeframe} - EMA50 crossed ABOVE EMA200`);
        } else if (wasEma50Above && isEma50Below) {
          console.log(`[Realtime Signals] 📉 BEARISH CROSSOVER: ${assetInfo.symbol} ${timeframe} - EMA50 crossed BELOW EMA200`);
        }
      }

      // Store current EMA for next comparison
      this.previousEMA.set(emaKey, { ema50, ema200 });

      const marketData: MarketData = {
        assetId: assetInfo.assetId,
        timeframe,
        price: closedCandle.close,
        high: closedCandle.high,
        low: closedCandle.low,
        open: closedCandle.open,
        ema50,
        ema200,
        // Pass previous EMA for crossover detection
        prevEma50: prevEMA?.ema50,
        prevEma200: prevEMA?.ema200,
      };

      const signals = await signalDetector.detectSignals(marketData);

      for (const signal of signals) {
        const createdSignal = await storage.createSignal(signal);
        console.log(`[Realtime Signals] 🚨 Signal: ${signal.type} for ${assetInfo.symbol} at ₹${closedCandle.close.toFixed(2)} [${getISTTimeString()}]`);

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
      console.error(`[Realtime Signals] Error processing closed candle for ${assetInfo.symbol}:`, error);
    }
  }

  /**
   * Process incoming tick data
   * Updates candles with tick data - signal generation happens via timer or on candle close
   */
  private async processTickData(tickData: any) {
    try {
      // Log all ticks for debugging (even when market closed)
      const isOpen = isMarketOpen();
      console.log(`[Realtime Signals] 🔸 Tick received: ${tickData.symbol} = ₹${tickData.lastPrice} [${getISTTimeString()}] Market: ${isOpen ? 'OPEN' : 'CLOSED'}`);
      
      // Check if market is open
      if (!isOpen) {
        return;
      }

      // Map instrument token to asset
      const assetInfo = this.assetTokenMap.get(tickData.symbol);
      if (!assetInfo) {
        console.log(`[Realtime Signals] ⚠️ No asset mapping for ${tickData.symbol}`);
        return;
      }

      const timestamp = Date.now();
      const price = tickData.lastPrice;
      
      // IMPORTANT: tickData.high/low are DAY's high/low, NOT candle high/low!
      // We must track candle high/low ourselves based on price movements
      // Only use the current price to update candle's high/low

      // Process for each timeframe - just update candles
      // Signal generation is handled by the timer for precise timing
      for (const timeframe of ["5m", "15m"]) {
        const { candleClosed, closedCandle } = this.updateCandle(
          assetInfo.assetId,
          timeframe,
          price,
          price,  // Use price as high (will be tracked per-candle)
          price,  // Use price as low (will be tracked per-candle)
          timestamp
        );

        // If tick caused candle close, process immediately (backup to timer)
        if (candleClosed && closedCandle) {
          await this.processClosedCandle(assetInfo, timeframe, closedCandle);
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
    this.stopTokenValidation();
    brokerWebSocket.disconnectAll();
    console.log("[Realtime Signals] Disconnected from all brokers");
  }
}

export const realtimeSignalGenerator = new RealtimeSignalGenerator();
