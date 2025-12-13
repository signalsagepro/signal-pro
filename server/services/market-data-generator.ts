import { storage } from "../storage";
import { emaCalculator } from "./ema-calculator";
import { signalDetector, type MarketData } from "./signal-detector";

export interface SignalBroadcastCallback {
  (signal: any): void;
}

export class MarketDataGenerator {
  private intervalId: NodeJS.Timeout | null = null;
  private candleHistory: Map<string, Array<{ price: number; high: number; low: number; open: number }>> = new Map();
  private broadcastCallback: SignalBroadcastCallback | null = null;

  setBroadcastCallback(callback: SignalBroadcastCallback) {
    this.broadcastCallback = callback;
  }

  start() {
    if (this.intervalId) return;

    console.log("Starting market data generator...");

    this.intervalId = setInterval(async () => {
      await this.generateAndProcessData();
    }, 30000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Market data generator stopped");
    }
  }

  private async generateAndProcessData() {
    try {
      const assets = await storage.getAssets();
      const enabledAssets = assets.filter(a => a.enabled);

      if (enabledAssets.length === 0) return;

      for (const asset of enabledAssets) {
        await this.processAsset(asset.id, "5m");
        await this.processAsset(asset.id, "15m");
      }
    } catch (error) {
      console.error("Error generating market data:", error);
    }
  }

  private async processAsset(assetId: string, timeframe: string) {
    const historyKey = `${assetId}-${timeframe}`;
    
    if (!this.candleHistory.has(historyKey)) {
      this.candleHistory.set(historyKey, this.generateInitialHistory());
    }

    const history = this.candleHistory.get(historyKey)!;
    
    const newCandle = this.generateNewCandle(history[history.length - 1]?.price || 100);
    history.push(newCandle);

    if (history.length > 250) {
      history.shift();
    }

    if (history.length < 200) return;

    const closePrices = history.map(c => c.price);
    const { ema50, ema200 } = emaCalculator.calculateEMA50And200(closePrices);

    // Skip if we don't have valid EMA values
    if (ema50 === null || ema200 === null) return;

    const currentEma50 = ema50;
    const currentEma200 = ema200;

    const marketData: MarketData = {
      assetId,
      timeframe,
      price: newCandle.price,
      high: newCandle.high,
      low: newCandle.low,
      open: newCandle.open,
      ema50: currentEma50,
      ema200: currentEma200,
    };

    const signals = await signalDetector.detectSignals(marketData);

    for (const signal of signals) {
      const createdSignal = await storage.createSignal(signal);
      console.log(`Signal generated: ${signal.type} for asset ${assetId} on ${timeframe}`);
      
      if (this.broadcastCallback) {
        this.broadcastCallback(createdSignal);
      }
    }
  }

  private generateInitialHistory(): Array<{ price: number; high: number; low: number; open: number }> {
    const history: Array<{ price: number; high: number; low: number; open: number }> = [];
    let basePrice = 100 + Math.random() * 100;

    for (let i = 0; i < 200; i++) {
      const candle = this.generateNewCandle(basePrice);
      history.push(candle);
      basePrice = candle.price;
    }

    return history;
  }

  private generateNewCandle(previousClose: number): { price: number; high: number; low: number; open: number } {
    const volatility = 0.02;
    const trend = (Math.random() - 0.5) * volatility;
    
    const open = previousClose;
    const change = previousClose * trend;
    const close = previousClose + change;
    
    const highChange = Math.abs(change) * (0.5 + Math.random() * 0.5);
    const lowChange = Math.abs(change) * (0.5 + Math.random() * 0.5);
    
    const high = Math.max(open, close) + highChange;
    const low = Math.min(open, close) - lowChange;

    return {
      price: close,
      high,
      low,
      open,
    };
  }
}

export const marketDataGenerator = new MarketDataGenerator();
