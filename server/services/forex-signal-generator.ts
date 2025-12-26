import { storage } from "../storage";
import { signalDetector, type MarketData } from "./signal-detector";
import { finnhubForexWebSocket, FOREX_SYMBOL_MAP, FINNHUB_FOREX_PAIRS } from "./finnhub-forex-websocket";
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
  timestamp: number;
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
 * Forex Signal Generator using Finnhub WebSocket
 * Generates signals for forex pairs with proper candle aggregation and EMA calculation
 */
export class ForexSignalGenerator {
  private broadcastCallback: SignalBroadcastCallback | null = null;
  private forexAssetMap: Map<string, { symbol: string; assetId: string; name: string }> = new Map();
  private isInitialized = false;

  // Candle history for proper EMA calculation: key = "assetId-timeframe"
  private candleHistories: Map<string, CandleHistory> = new Map();

  // Timeframe intervals in milliseconds
  private readonly TIMEFRAMES = {
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
  };

  setBroadcastCallback(callback: SignalBroadcastCallback) {
    this.broadcastCallback = callback;
  }

  async initialize() {
    if (this.isInitialized) return;

    console.log("[Forex Signals] Initializing...");

    // Listen for WebSocket ticks
    finnhubForexWebSocket.on("tick", async (tickData: any) => {
      await this.processTickData(tickData);
    });

    // Listen for connection events
    finnhubForexWebSocket.on("connected", async () => {
      console.log("[Forex Signals] Finnhub WebSocket connected");
      await this.subscribeToForexPairs();
    });

    finnhubForexWebSocket.on("disconnected", () => {
      console.log("[Forex Signals] Finnhub WebSocket disconnected");
    });

    finnhubForexWebSocket.on("error", (data: any) => {
      console.error("[Forex Signals] Error:", data.error);
    });

    this.isInitialized = true;
    console.log("[Forex Signals] Initialized successfully");
  }

  /**
   * Start the forex signal generator
   */
  async start(): Promise<boolean> {
    try {
      // Get Finnhub broker config
      const brokerConfigs = await storage.getBrokerConfigs();
      const finnhubConfig = brokerConfigs.find(c => c.type === "finnhub" && c.enabled);

      if (!finnhubConfig || !finnhubConfig.apiKey) {
        console.log("[Forex Signals] Finnhub not configured or disabled");
        return false;
      }

      await this.initialize();

      // Connect to Finnhub WebSocket
      const connected = await finnhubForexWebSocket.connect(finnhubConfig.apiKey);
      
      if (connected) {
        console.log("[Forex Signals] ✅ Started successfully");
        return true;
      } else {
        console.error("[Forex Signals] Failed to connect to Finnhub");
        return false;
      }
    } catch (error) {
      console.error("[Forex Signals] Error starting:", error);
      return false;
    }
  }

  /**
   * Stop the forex signal generator
   */
  stop(): void {
    finnhubForexWebSocket.disconnect();
    console.log("[Forex Signals] Stopped");
  }

  /**
   * Subscribe to forex pairs that are enabled as assets
   */
  private async subscribeToForexPairs(): Promise<void> {
    try {
      const assets = await storage.getAssets();
      const forexAssets = assets.filter(a => a.enabled && a.type === "forex");

      if (forexAssets.length === 0) {
        console.log("[Forex Signals] No enabled forex assets found");
        return;
      }

      const symbolsToSubscribe: string[] = [];

      for (const asset of forexAssets) {
        // Find matching Finnhub symbol
        const finnhubSymbol = Object.keys(FOREX_SYMBOL_MAP).find(
          key => FOREX_SYMBOL_MAP[key].symbol === asset.symbol
        );

        if (finnhubSymbol) {
          symbolsToSubscribe.push(finnhubSymbol);
          this.forexAssetMap.set(finnhubSymbol, {
            symbol: asset.symbol,
            assetId: asset.id,
            name: asset.name,
          });
        } else {
          console.log(`[Forex Signals] No Finnhub mapping for ${asset.symbol}`);
        }
      }

      if (symbolsToSubscribe.length > 0) {
        finnhubForexWebSocket.subscribe(symbolsToSubscribe);
        console.log(`[Forex Signals] Subscribed to ${symbolsToSubscribe.length} forex pairs`);
      }
    } catch (error) {
      console.error("[Forex Signals] Error subscribing to forex pairs:", error);
    }
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
   */
  private updateCandle(
    assetId: string,
    timeframe: string,
    price: number,
    timestamp: number
  ): { candleClosed: boolean; closedCandle: Candle | null } {
    const intervalMs = this.TIMEFRAMES[timeframe as keyof typeof this.TIMEFRAMES];
    const history = this.getCandleHistory(assetId, timeframe);
    const periodStart = this.getCandlePeriodStart(timestamp, intervalMs);

    let candleClosed = false;
    let closedCandle: Candle | null = null;

    // Check if we're in a new candle period
    if (history.currentCandle && periodStart > history.lastCandleTime) {
      closedCandle = { ...history.currentCandle };
      history.candles.push(closedCandle);

      // Keep 500+ candles for accurate EMA calculation (TradingView compatible)
      if (history.candles.length > 500) {
        history.candles.shift();
      }

      candleClosed = true;
      history.currentCandle = null;
    }

    // Create or update current candle
    if (!history.currentCandle) {
      history.currentCandle = {
        open: price,
        high: price,
        low: price,
        close: price,
        timestamp: periodStart,
      };
      history.lastCandleTime = periodStart;
    } else {
      history.currentCandle.high = Math.max(history.currentCandle.high, price);
      history.currentCandle.low = Math.min(history.currentCandle.low, price);
      history.currentCandle.close = price;
    }

    return { candleClosed, closedCandle };
  }

  /**
   * Calculate EMA from candle history
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
   * Process incoming tick data
   */
  private async processTickData(tickData: any): Promise<void> {
    try {
      const assetInfo = this.forexAssetMap.get(tickData.symbol);
      if (!assetInfo) {
        return;
      }

      const timestamp = Date.now();
      const price = tickData.lastPrice;

      // Emit live price update for UI
      this.emit("livePrice", {
        assetId: assetInfo.assetId,
        symbol: assetInfo.symbol,
        price,
        timestamp,
      });

      // Process for each timeframe
      for (const timeframe of ["5m", "15m"]) {
        const { candleClosed, closedCandle } = this.updateCandle(
          assetInfo.assetId,
          timeframe,
          price,
          timestamp
        );

        if (candleClosed && closedCandle) {
          const { ema50, ema200 } = this.calculateEMAFromCandles(assetInfo.assetId, timeframe);

          if (ema50 === null || ema200 === null) {
            const candleCount = this.getCandleHistory(assetInfo.assetId, timeframe).candles.length;
            console.log(`[Forex Signals] ${assetInfo.symbol} ${timeframe}: Need more data (have ${candleCount} candles)`);
            continue;
          }

          console.log(`[Forex Signals] ${assetInfo.symbol} ${timeframe} candle closed: ${closedCandle.close.toFixed(5)} (EMA50: ${ema50.toFixed(5)}, EMA200: ${ema200.toFixed(5)})`);

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
            console.log(`[Forex Signals] 🚨 Signal: ${signal.type} for ${assetInfo.symbol} at ${closedCandle.close.toFixed(5)}`);

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
      console.error("[Forex Signals] Error processing tick:", error);
    }
  }

  /**
   * Get live prices for all subscribed forex pairs
   */
  getLivePrices(): Map<string, { symbol: string; price: number; timestamp: Date }> {
    const prices = new Map<string, { symbol: string; price: number; timestamp: Date }>();
    const ticks = finnhubForexWebSocket.getAllLatestTicks();

    Array.from(ticks.entries()).forEach(([finnhubSymbol, tick]) => {
      const assetInfo = this.forexAssetMap.get(finnhubSymbol);
      if (assetInfo) {
        prices.set(assetInfo.assetId, {
          symbol: assetInfo.symbol,
          price: tick.price,
          timestamp: tick.timestamp,
        });
      }
    });

    return prices;
  }

  /**
   * Emit events (for live price updates)
   */
  private emit(event: string, data: any): void {
    // This will be handled by the routes
  }
}

// Singleton instance
export const forexSignalGenerator = new ForexSignalGenerator();
