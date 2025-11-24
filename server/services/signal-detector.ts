import type { Strategy, Asset, InsertSignal } from "@shared/schema";
import { storage } from "../storage";

export interface MarketData {
  assetId: string;
  timeframe: string;
  price: number;
  high: number;
  low: number;
  open: number;
  ema50: number;
  ema200: number;
}

export interface ISignalStrategy {
  check(data: MarketData): boolean;
  getSignalType(): string;
}

export class Strategy15MAbove50Bullish implements ISignalStrategy {
  getSignalType(): string {
    return "15m_above_50_bullish";
  }

  check(data: MarketData): boolean {
    return data.price >= data.ema50 && data.ema50 > data.ema200;
  }
}

export class Strategy5MAbove200Reversal implements ISignalStrategy {
  getSignalType(): string {
    return "5m_above_200_reversal";
  }

  check(data: MarketData): boolean {
    return data.price >= data.ema200 && data.ema200 > data.ema50;
  }
}

export class Strategy5MPullbackTo200 implements ISignalStrategy {
  getSignalType(): string {
    return "5m_pullback_to_200";
  }

  check(data: MarketData): boolean {
    const touchesEma200 = data.low <= data.ema200 && data.price >= data.ema200;
    const priceAbove50 = data.price > data.ema50;
    const ema50Above200 = data.ema50 > data.ema200;
    
    return (touchesEma200 || Math.abs(data.price - data.ema200) < 0.01) && 
           priceAbove50 && 
           ema50Above200;
  }
}

export class Strategy5MBelow200Bearish implements ISignalStrategy {
  getSignalType(): string {
    return "5m_below_200_bearish";
  }

  check(data: MarketData): boolean {
    return data.price <= data.ema200 && data.ema50 > data.ema200;
  }
}

export class Strategy5MTouch200Downtrend implements ISignalStrategy {
  getSignalType(): string {
    return "5m_touch_200_downtrend";
  }

  check(data: MarketData): boolean {
    const touchesEma200 = data.low <= data.ema200 && data.price >= data.ema200;
    const ema200Above50 = data.ema200 > data.ema50;
    const ema50AbovePrice = data.ema50 > data.price;
    
    return (touchesEma200 || Math.abs(data.price - data.ema200) < 0.01) && 
           ema200Above50 && 
           ema50AbovePrice;
  }
}

export class Strategy15MBelow200Breakdown implements ISignalStrategy {
  getSignalType(): string {
    return "15m_below_200_breakdown";
  }

  check(data: MarketData): boolean {
    return data.ema50 > data.ema200 && data.ema200 > data.price;
  }
}

export class CustomFormulaStrategy implements ISignalStrategy {
  constructor(private formula: string, private type: string) {}

  getSignalType(): string {
    return this.type;
  }

  check(data: MarketData): boolean {
    try {
      const fn = new Function(
        "price",
        "ema50",
        "ema200",
        "high",
        "low",
        "open",
        `return ${this.formula}`
      );
      return !!fn(data.price, data.ema50, data.ema200, data.high, data.low, data.open);
    } catch (error) {
      console.error("Error evaluating custom formula:", error);
      return false;
    }
  }
}

export class SignalDetector {
  private strategies: Map<string, ISignalStrategy> = new Map();

  constructor() {
    this.strategies.set("15m_above_50_bullish", new Strategy15MAbove50Bullish());
    this.strategies.set("5m_above_200_reversal", new Strategy5MAbove200Reversal());
    this.strategies.set("5m_pullback_to_200", new Strategy5MPullbackTo200());
    this.strategies.set("5m_below_200_bearish", new Strategy5MBelow200Bearish());
    this.strategies.set("5m_touch_200_downtrend", new Strategy5MTouch200Downtrend());
    this.strategies.set("15m_below_200_breakdown", new Strategy15MBelow200Breakdown());
  }

  addCustomStrategy(type: string, formula: string) {
    this.strategies.set(type, new CustomFormulaStrategy(formula, type));
  }

  async detectSignals(data: MarketData): Promise<InsertSignal[]> {
    const signals: InsertSignal[] = [];
    const dbStrategies = await storage.getStrategies();

    for (const dbStrategy of dbStrategies) {
      if (!dbStrategy.enabled) continue;
      if (dbStrategy.timeframe !== data.timeframe) continue;

      let strategyImpl = this.strategies.get(dbStrategy.type);

      if (dbStrategy.isCustom && dbStrategy.formula) {
        strategyImpl = new CustomFormulaStrategy(dbStrategy.formula, dbStrategy.type);
      }

      if (!strategyImpl) continue;

      try {
        const shouldSignal = strategyImpl.check(data);

        if (shouldSignal) {
          signals.push({
            strategyId: dbStrategy.id,
            assetId: data.assetId,
            timeframe: data.timeframe,
            type: strategyImpl.getSignalType(),
            price: data.price,
            ema50: data.ema50,
            ema200: data.ema200,
            metadata: null,
            dismissed: false,
          });
        }
      } catch (error) {
        console.error(`Error checking strategy ${dbStrategy.name}:`, error);
      }
    }

    return signals;
  }
}

export const signalDetector = new SignalDetector();
