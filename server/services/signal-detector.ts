import type { Strategy, Asset, InsertSignal } from "@shared/schema";
import { storage } from "../storage";
import { formulaEvaluator } from "./formula-evaluator";

export interface MarketData {
  assetId: string;
  timeframe: string;
  price: number;
  high: number;
  low: number;
  open: number;
  ema50: number;
  ema200: number;
  // Previous candle data for crossover detection
  prevClose?: number;
  prevEma50?: number;
  prevEma200?: number;
}

/**
 * Check if price "touches" EMA
 * STRICT: Candle low/high must actually cross through EMA, OR close within 0.05%
 */
function touchesEMA(price: number, low: number, high: number, ema: number): boolean {
  // Candle range crossed through EMA (low went below, high went above)
  const candleCrossedEMA = low <= ema && high >= ema;
  
  // Close is very close to EMA (within 0.05% - stricter tolerance)
  const tolerance = ema * 0.0005; // 0.05% tolerance (was 0.1%)
  const closeNearEMA = Math.abs(price - ema) <= tolerance;
  
  // Calculate distance from price to EMA for logging
  const distancePercent = ((price - ema) / ema * 100).toFixed(3);
  
  console.log(`[touchesEMA] price=${price.toFixed(2)}, low=${low.toFixed(2)}, high=${high.toFixed(2)}, ema=${ema.toFixed(2)}, distance=${distancePercent}%, candleCrossed=${candleCrossedEMA}, closeNear=${closeNearEMA}`);
  
  return candleCrossedEMA || closeNearEMA;
}

/**
 * Check if there was a bullish crossover (EMA50 crossed above EMA200)
 */
function bullishCrossover(ema50: number, ema200: number, prevEma50?: number, prevEma200?: number): boolean {
  if (prevEma50 === undefined || prevEma200 === undefined) return false;
  return prevEma50 <= prevEma200 && ema50 > ema200;
}

/**
 * Check if there was a bearish crossover (EMA50 crossed below EMA200)
 */
function bearishCrossover(ema50: number, ema200: number, prevEma50?: number, prevEma200?: number): boolean {
  if (prevEma50 === undefined || prevEma200 === undefined) return false;
  return prevEma50 >= prevEma200 && ema50 < ema200;
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
    // Price must touch or be near EMA50 (pullback to EMA50 in uptrend)
    const touchesEma50 = touchesEMA(data.price, data.low, data.high, data.ema50);
    
    // Must be in uptrend (EMA50 > EMA200)
    const ema50Above200 = data.ema50 > data.ema200;
    
    // Price bounced off EMA50 (closed above it)
    const bouncedUp = data.price > data.ema50;
    
    console.log(`[15m_above_50_bullish] touchesEma50=${touchesEma50}, ema50Above200=${ema50Above200}, bouncedUp=${bouncedUp}, price=${data.price.toFixed(2)}, ema50=${data.ema50.toFixed(2)}, ema200=${data.ema200.toFixed(2)}, low=${data.low.toFixed(2)}`);
    
    return touchesEma50 && ema50Above200 && bouncedUp;
  }
}

export class Strategy5MAbove200Reversal implements ISignalStrategy {
  getSignalType(): string {
    return "5m_above_200_reversal";
  }

  check(data: MarketData): boolean {
    // Price must touch EMA200 from below (potential reversal)
    const touches200 = touchesEMA(data.price, data.low, data.high, data.ema200);
    
    // In a downtrend (EMA200 > EMA50) - reversal setup
    const ema200Above50 = data.ema200 > data.ema50;
    
    // Price closed above EMA200 (reversal confirmation)
    const closedAbove200 = data.price > data.ema200;
    
    console.log(`[5m_above_200_reversal] touches200=${touches200}, ema200Above50=${ema200Above50}, closedAbove200=${closedAbove200}, price=${data.price.toFixed(2)}, ema200=${data.ema200.toFixed(2)}, ema50=${data.ema50.toFixed(2)}`);
    
    return touches200 && ema200Above50 && closedAbove200;
  }
}

export class Strategy5MPullbackTo200 implements ISignalStrategy {
  getSignalType(): string {
    return "5m_pullback_to_200";
  }

  check(data: MarketData): boolean {
    // Price must actually touch or be very close to EMA200
    const touches200 = touchesEMA(data.price, data.low, data.high, data.ema200);
    
    // In an uptrend (EMA50 > EMA200)
    const ema50Above200 = data.ema50 > data.ema200;
    
    // Price bounced (closed above EMA200 after touching)
    const bouncedUp = data.price > data.ema200;
    
    console.log(`[5m_pullback_to_200] touches200=${touches200}, ema50Above200=${ema50Above200}, bouncedUp=${bouncedUp}, price=${data.price}, ema200=${data.ema200}, low=${data.low}`);
    
    return touches200 && ema50Above200 && bouncedUp;
  }
}

export class Strategy5MBelow200Bearish implements ISignalStrategy {
  getSignalType(): string {
    return "5m_below_200_bearish";
  }

  check(data: MarketData): boolean {
    // Price must touch EMA200 from above and close below (breakdown)
    const touches200 = touchesEMA(data.price, data.low, data.high, data.ema200);
    
    // Was in an uptrend (EMA50 > EMA200) - breakdown setup
    const ema50Above200 = data.ema50 > data.ema200;
    
    // Price closed below EMA200 (breakdown confirmation)
    const closedBelow200 = data.price < data.ema200;
    
    console.log(`[5m_below_200_bearish] touches200=${touches200}, ema50Above200=${ema50Above200}, closedBelow200=${closedBelow200}, price=${data.price.toFixed(2)}, ema200=${data.ema200.toFixed(2)}, high=${data.high.toFixed(2)}`);
    
    return touches200 && ema50Above200 && closedBelow200;
  }
}

export class Strategy5MTouch200Downtrend implements ISignalStrategy {
  getSignalType(): string {
    return "5m_touch_200_downtrend";
  }

  check(data: MarketData): boolean {
    // Price must actually touch EMA200 from below
    const touches200 = touchesEMA(data.price, data.low, data.high, data.ema200);
    
    // In a downtrend (EMA200 > EMA50)
    const ema200Above50 = data.ema200 > data.ema50;
    
    // Price rejected (closed below EMA200 after touching)
    const rejectedDown = data.price < data.ema200;
    
    console.log(`[5m_touch_200_downtrend] touches200=${touches200}, ema200Above50=${ema200Above50}, rejectedDown=${rejectedDown}, price=${data.price}, ema200=${data.ema200}, high=${data.high}`);
    
    return touches200 && ema200Above50 && rejectedDown;
  }
}

export class Strategy15MBelow200Breakdown implements ISignalStrategy {
  getSignalType(): string {
    return "15m_below_200_breakdown";
  }

  check(data: MarketData): boolean {
    // Price must touch EMA200 from above (breakdown setup)
    const touches200 = touchesEMA(data.price, data.low, data.high, data.ema200);
    
    // Was in an uptrend (EMA50 > EMA200)
    const ema50Above200 = data.ema50 > data.ema200;
    
    // Price broke down (closed below EMA200)
    const brokeDown = data.price < data.ema200;
    
    console.log(`[15m_below_200_breakdown] touches200=${touches200}, ema50Above200=${ema50Above200}, brokeDown=${brokeDown}, price=${data.price.toFixed(2)}, ema200=${data.ema200.toFixed(2)}, high=${data.high.toFixed(2)}`);
    
    return touches200 && ema50Above200 && brokeDown;
  }
}

export class CustomFormulaStrategy implements ISignalStrategy {
  constructor(private formula: string, private type: string) {
    // Validate formula on construction
    const validation = formulaEvaluator.validate(formula);
    if (!validation.valid) {
      throw new Error(`Invalid formula: ${validation.errors.join(', ')}`);
    }
  }

  getSignalType(): string {
    return this.type;
  }

  check(data: MarketData): boolean {
    try {
      // Use safe formula evaluator instead of new Function()
      return formulaEvaluator.evaluate(this.formula, {
        price: data.price,
        close: data.price,
        ema50: data.ema50,
        ema200: data.ema200,
        high: data.high,
        low: data.low,
        open: data.open,
      });
    } catch (error) {
      console.error("Error evaluating custom formula:", error);
      return false;
    }
  }
}

export class SignalDetector {
  private strategies: Map<string, ISignalStrategy> = new Map();
  
  // Track recent signals to prevent duplicates
  // Key: "assetId-strategyId-timeframe", Value: timestamp of last signal
  private recentSignals: Map<string, number> = new Map();
  
  // Cooldown period in milliseconds (default: 30 minutes for same signal)
  private readonly SIGNAL_COOLDOWN_MS = 30 * 60 * 1000;

  constructor() {
    this.strategies.set("15m_above_50_bullish", new Strategy15MAbove50Bullish());
    this.strategies.set("5m_above_200_reversal", new Strategy5MAbove200Reversal());
    this.strategies.set("5m_pullback_to_200", new Strategy5MPullbackTo200());
    this.strategies.set("5m_below_200_bearish", new Strategy5MBelow200Bearish());
    this.strategies.set("5m_touch_200_downtrend", new Strategy5MTouch200Downtrend());
    this.strategies.set("15m_below_200_breakdown", new Strategy15MBelow200Breakdown());
    
    // Clean up old signal entries every hour
    setInterval(() => this.cleanupOldSignals(), 60 * 60 * 1000);
  }

  addCustomStrategy(type: string, formula: string) {
    this.strategies.set(type, new CustomFormulaStrategy(formula, type));
  }
  
  /**
   * Check if a signal was recently generated (within cooldown period)
   */
  private isSignalOnCooldown(assetId: string, strategyId: string, timeframe: string): boolean {
    const key = `${assetId}-${strategyId}-${timeframe}`;
    const lastSignalTime = this.recentSignals.get(key);
    
    if (!lastSignalTime) return false;
    
    const elapsed = Date.now() - lastSignalTime;
    return elapsed < this.SIGNAL_COOLDOWN_MS;
  }
  
  /**
   * Record that a signal was generated
   */
  private recordSignal(assetId: string, strategyId: string, timeframe: string) {
    const key = `${assetId}-${strategyId}-${timeframe}`;
    this.recentSignals.set(key, Date.now());
  }
  
  /**
   * Clean up old signal entries to prevent memory leaks
   */
  private cleanupOldSignals() {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, timestamp] of Array.from(this.recentSignals.entries())) {
      if (now - timestamp > this.SIGNAL_COOLDOWN_MS * 2) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.recentSignals.delete(key);
    }
    
    if (keysToDelete.length > 0) {
      console.log(`[Signal Detector] Cleaned up ${keysToDelete.length} old signal entries`);
    }
  }

  async detectSignals(data: MarketData): Promise<InsertSignal[]> {
    const signals: InsertSignal[] = [];
    const dbStrategies = await storage.getStrategies();

    console.log(`[Signal Detector] Checking ${dbStrategies.length} strategies for ${data.assetId} (${data.timeframe}) | Price: ${data.price.toFixed(2)}, EMA50: ${data.ema50.toFixed(2)}, EMA200: ${data.ema200.toFixed(2)}`);

    for (const dbStrategy of dbStrategies) {
      if (!dbStrategy.enabled) {
        continue;
      }
      if (dbStrategy.timeframe !== data.timeframe) {
        continue;
      }

      let strategyImpl = this.strategies.get(dbStrategy.type);

      if (dbStrategy.formula) {
        strategyImpl = new CustomFormulaStrategy(dbStrategy.formula, dbStrategy.type);
      }

      if (!strategyImpl) {
        console.log(`[Signal Detector] No implementation found for strategy type: ${dbStrategy.type}`);
        continue;
      }

      try {
        const shouldSignal = strategyImpl.check(data);
        
        if (shouldSignal) {
          // Check cooldown to prevent duplicate signals
          if (this.isSignalOnCooldown(data.assetId, dbStrategy.id, data.timeframe)) {
            console.log(`[Signal Detector] ⏳ ${dbStrategy.name}: Signal on cooldown (duplicate prevention)`);
            continue;
          }
          
          console.log(`[Signal Detector] ✅ ${dbStrategy.name} (${dbStrategy.type}): TRIGGERED`);
          
          // Record this signal to prevent duplicates
          this.recordSignal(data.assetId, dbStrategy.id, data.timeframe);
          
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

    if (signals.length > 0) {
      console.log(`[Signal Detector] Generated ${signals.length} new signals`);
    }
    return signals;
  }
}

export const signalDetector = new SignalDetector();
