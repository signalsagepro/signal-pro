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
 * Pullback state tracking for proper signal detection.
 * Tracks whether price has been away from EMA AND which direction (above/below).
 * 
 * IMPORTANT: Position states are mutually exclusive:
 * - lastCloseAboveEma: price > EMA + tolerance (strictly above)
 * - lastCloseAtEma: price within ± tolerance of EMA (touching)
 * - lastCloseBelowEma: price < EMA - tolerance (strictly below)
 */
interface PullbackState {
  // Was price previously ABOVE this EMA at sufficient distance? (for bullish pullback)
  wasAboveEma50: boolean;
  wasAboveEma200: boolean;
  // Was price previously BELOW this EMA at sufficient distance? (for bearish rejection)
  wasBelowEma50: boolean;
  wasBelowEma200: boolean;
  // Maximum distance seen ABOVE EMA since last touch (positive = above)
  maxDistanceAboveEma50: number;
  maxDistanceAboveEma200: number;
  // Maximum distance seen BELOW EMA since last touch (positive = below)
  maxDistanceBelowEma50: number;
  maxDistanceBelowEma200: number;
  // Last candle's close position relative to EMA (mutually exclusive states)
  lastCloseAboveEma50: boolean;
  lastCloseAboveEma200: boolean;
  lastCloseAtEma50: boolean;      // Price was AT/TOUCHING EMA (within tolerance)
  lastCloseAtEma200: boolean;
  lastCloseBelowEma50: boolean;   // Price was strictly BELOW EMA
  lastCloseBelowEma200: boolean;
  // Timestamp of last state update
  lastUpdate: number;
}

/**
 * Minimum percentage distance required for a valid "pullback" setup.
 * Price must have been at least this far from EMA before touching counts.
 * 0.3% = 30 basis points (e.g., if EMA=100, price must have been at 100.30 or above)
 */
const MIN_PULLBACK_DISTANCE_PERCENT = 0.3;

/**
 * Tolerance for considering price "at" EMA (not above/below).
 * 0.1% = price within 0.1% of EMA is considered "at" EMA.
 */
const EMA_TOUCH_TOLERANCE_PERCENT = 0.1;

/**
 * Check if price is strictly ABOVE EMA (accounting for tolerance).
 * Returns false if price is within tolerance (considered "at" EMA).
 */
export function isPriceAboveEMA(price: number, ema: number): boolean {
  const distancePercent = ((price - ema) / ema) * 100;
  // Must be above tolerance to be considered "above"
  return distancePercent > EMA_TOUCH_TOLERANCE_PERCENT;
}

/**
 * Check if price is strictly BELOW EMA (accounting for tolerance).
 * Returns false if price is within tolerance (considered "at" EMA).
 */
export function isPriceBelowEMA(price: number, ema: number): boolean {
  const distancePercent = ((price - ema) / ema) * 100;
  // Must be below negative tolerance to be considered "below"
  return distancePercent < -EMA_TOUCH_TOLERANCE_PERCENT;
}

/**
 * Check if price is AT or TOUCHING EMA (within tolerance).
 */
export function isPriceAtEMA(price: number, ema: number): boolean {
  const distancePercent = Math.abs(((price - ema) / ema) * 100);
  return distancePercent <= EMA_TOUCH_TOLERANCE_PERCENT;
}

/**
 * Check if price is at or above EMA (on or above).
 */
export function isPriceAtOrAboveEMA(price: number, ema: number): boolean {
  const distancePercent = ((price - ema) / ema) * 100;
  // At or above means >= -tolerance (not below by more than tolerance)
  return distancePercent >= -EMA_TOUCH_TOLERANCE_PERCENT;
}

/**
 * Check if price is at or below EMA (on or below).
 */
export function isPriceAtOrBelowEMA(price: number, ema: number): boolean {
  const distancePercent = ((price - ema) / ema) * 100;
  // At or below means <= tolerance (not above by more than tolerance)
  return distancePercent <= EMA_TOUCH_TOLERANCE_PERCENT;
}

/**
 * Global pullback state tracker.
 * Key: "assetId-timeframe"
 */
const pullbackStates: Map<string, PullbackState> = new Map();

/**
 * Get or create pullback state for an asset/timeframe
 */
export function getPullbackState(assetId: string, timeframe: string): PullbackState {
  const key = `${assetId}-${timeframe}`;
  if (!pullbackStates.has(key)) {
    pullbackStates.set(key, {
      wasAboveEma50: false,
      wasAboveEma200: false,
      wasBelowEma50: false,
      wasBelowEma200: false,
      maxDistanceAboveEma50: 0,
      maxDistanceAboveEma200: 0,
      maxDistanceBelowEma50: 0,
      maxDistanceBelowEma200: 0,
      lastCloseAboveEma50: false,
      lastCloseAboveEma200: false,
      lastCloseAtEma50: false,
      lastCloseAtEma200: false,
      lastCloseBelowEma50: false,
      lastCloseBelowEma200: false,
      lastUpdate: 0,
    });
  }
  return pullbackStates.get(key)!;
}

/**
 * Update pullback state after processing a candle.
 * This MUST be called after signal detection to track state properly.
 */
export function updatePullbackState(
  assetId: string,
  timeframe: string,
  price: number,
  ema50: number,
  ema200: number
): void {
  const state = getPullbackState(assetId, timeframe);
  
  // Calculate current distances (percentage) - positive = above EMA, negative = below
  const distanceFromEma50 = ((price - ema50) / ema50) * 100;
  const distanceFromEma200 = ((price - ema200) / ema200) * 100;
  
  // Check if price touched EMA (within tolerance = reset state for NEXT potential signal)
  const touchedEma50 = Math.abs(distanceFromEma50) < EMA_TOUCH_TOLERANCE_PERCENT;
  const touchedEma200 = Math.abs(distanceFromEma200) < EMA_TOUCH_TOLERANCE_PERCENT;
  
  // === EMA50 State Update ===
  // IMPORTANT: Only reset wasAbove/wasBelow when price TOUCHES EMA (signal complete)
  // Do NOT reset when price crosses to other side - that's part of the pullback!
  if (touchedEma50) {
    // Reset after touch - pullback cycle complete, start fresh
    state.wasAboveEma50 = false;
    state.wasBelowEma50 = false;
    state.maxDistanceAboveEma50 = 0;
    state.maxDistanceBelowEma50 = 0;
  } else if (distanceFromEma50 > 0) {
    // Price is ABOVE EMA50 - track max distance above
    state.maxDistanceAboveEma50 = Math.max(state.maxDistanceAboveEma50, distanceFromEma50);
    if (distanceFromEma50 >= MIN_PULLBACK_DISTANCE_PERCENT) {
      state.wasAboveEma50 = true;
    }
    // DON'T reset wasBelowEma50 here - price crossing above doesn't invalidate prior below state
  } else {
    // Price is BELOW EMA50 - track max distance below
    state.maxDistanceBelowEma50 = Math.max(state.maxDistanceBelowEma50, Math.abs(distanceFromEma50));
    if (Math.abs(distanceFromEma50) >= MIN_PULLBACK_DISTANCE_PERCENT) {
      state.wasBelowEma50 = true;
    }
    // DON'T reset wasAboveEma50 here - pullback may be in progress
  }
  
  // === EMA200 State Update ===
  if (touchedEma200) {
    state.wasAboveEma200 = false;
    state.wasBelowEma200 = false;
    state.maxDistanceAboveEma200 = 0;
    state.maxDistanceBelowEma200 = 0;
  } else if (distanceFromEma200 > 0) {
    // Price is ABOVE EMA200
    state.maxDistanceAboveEma200 = Math.max(state.maxDistanceAboveEma200, distanceFromEma200);
    if (distanceFromEma200 >= MIN_PULLBACK_DISTANCE_PERCENT) {
      state.wasAboveEma200 = true;
    }
  } else {
    // Price is BELOW EMA200
    state.maxDistanceBelowEma200 = Math.max(state.maxDistanceBelowEma200, Math.abs(distanceFromEma200));
    if (Math.abs(distanceFromEma200) >= MIN_PULLBACK_DISTANCE_PERCENT) {
      state.wasBelowEma200 = true;
    }
  }
  
  // Track close position for breakdown/breakout detection
  // Use tolerance-based comparison with mutually exclusive states:
  // - above: price > EMA + tolerance
  // - at: price within ± tolerance of EMA  
  // - below: price < EMA - tolerance
  
  // EMA50 position
  state.lastCloseAboveEma50 = isPriceAboveEMA(price, ema50);
  state.lastCloseAtEma50 = isPriceAtEMA(price, ema50);
  state.lastCloseBelowEma50 = isPriceBelowEMA(price, ema50);
  
  // EMA200 position
  state.lastCloseAboveEma200 = isPriceAboveEMA(price, ema200);
  state.lastCloseAtEma200 = isPriceAtEMA(price, ema200);
  state.lastCloseBelowEma200 = isPriceBelowEMA(price, ema200);
  
  state.lastUpdate = Date.now();
  
  // Debug logging for state tracking
  console.log(`[PullbackState] Updated: EMA50 pos=${state.lastCloseAboveEma50 ? 'ABOVE' : state.lastCloseBelowEma50 ? 'BELOW' : 'AT'}, EMA200 pos=${state.lastCloseAboveEma200 ? 'ABOVE' : state.lastCloseBelowEma200 ? 'BELOW' : 'AT'}, wasAbove50=${state.wasAboveEma50}, wasAbove200=${state.wasAboveEma200}`);
}

/**
 * Initialize pullback state from historical candles.
 * This is CRITICAL for accurate signals - without this, new assets start with empty state
 * and will miss signals or generate false ones.
 * 
 * Should be called after historical data is loaded for an asset.
 * 
 * @param assetId - Asset ID
 * @param timeframe - Timeframe (e.g., "5m", "15m")
 * @param candles - Array of historical candles with OHLC data
 * @param ema50Values - Array of EMA50 values (same length as candles)
 * @param ema200Values - Array of EMA200 values (same length as candles)
 */
export function initializePullbackStateFromHistory(
  assetId: string,
  timeframe: string,
  candles: { close: number; low: number; high: number }[],
  ema50Values: number[],
  ema200Values: number[]
): void {
  if (candles.length === 0 || ema50Values.length === 0 || ema200Values.length === 0) {
    console.log(`[PullbackState] Cannot initialize - no data for ${assetId} ${timeframe}`);
    return;
  }

  const state = getPullbackState(assetId, timeframe);
  
  // Process the last N candles to build up state (enough to capture pullback patterns)
  // We need to process enough candles to capture the "was away from EMA" state
  // 200 candles covers:
  //   - 5m timeframe: ~16.5 hours (full trading day+)
  //   - 15m timeframe: ~50 hours (~2 trading days)
  // This ensures we capture pullback patterns that may span several hours
  const LOOKBACK_CANDLES = Math.min(200, candles.length);
  const startIdx = Math.max(0, candles.length - LOOKBACK_CANDLES);
  
  console.log(`[PullbackState] Initializing ${assetId} ${timeframe} from ${LOOKBACK_CANDLES} historical candles`);
  
  // Reset state before initialization
  state.wasAboveEma50 = false;
  state.wasAboveEma200 = false;
  state.wasBelowEma50 = false;
  state.wasBelowEma200 = false;
  state.maxDistanceAboveEma50 = 0;
  state.maxDistanceAboveEma200 = 0;
  state.maxDistanceBelowEma50 = 0;
  state.maxDistanceBelowEma200 = 0;
  
  // Process historical candles to build state
  for (let i = startIdx; i < candles.length; i++) {
    const candle = candles[i];
    const ema50 = ema50Values[i];
    const ema200 = ema200Values[i];
    
    // Skip if EMA values are invalid (NaN during warm-up period)
    if (isNaN(ema50) || isNaN(ema200)) continue;
    
    const price = candle.close;
    const distanceFromEma50 = ((price - ema50) / ema50) * 100;
    const distanceFromEma200 = ((price - ema200) / ema200) * 100;
    
    const touchedEma50 = Math.abs(distanceFromEma50) < EMA_TOUCH_TOLERANCE_PERCENT;
    const touchedEma200 = Math.abs(distanceFromEma200) < EMA_TOUCH_TOLERANCE_PERCENT;
    
    // EMA50 state
    if (touchedEma50) {
      state.wasAboveEma50 = false;
      state.wasBelowEma50 = false;
      state.maxDistanceAboveEma50 = 0;
      state.maxDistanceBelowEma50 = 0;
    } else if (distanceFromEma50 > 0) {
      state.maxDistanceAboveEma50 = Math.max(state.maxDistanceAboveEma50, distanceFromEma50);
      if (distanceFromEma50 >= MIN_PULLBACK_DISTANCE_PERCENT) {
        state.wasAboveEma50 = true;
      }
    } else {
      state.maxDistanceBelowEma50 = Math.max(state.maxDistanceBelowEma50, Math.abs(distanceFromEma50));
      if (Math.abs(distanceFromEma50) >= MIN_PULLBACK_DISTANCE_PERCENT) {
        state.wasBelowEma50 = true;
      }
    }
    
    // EMA200 state
    if (touchedEma200) {
      state.wasAboveEma200 = false;
      state.wasBelowEma200 = false;
      state.maxDistanceAboveEma200 = 0;
      state.maxDistanceBelowEma200 = 0;
    } else if (distanceFromEma200 > 0) {
      state.maxDistanceAboveEma200 = Math.max(state.maxDistanceAboveEma200, distanceFromEma200);
      if (distanceFromEma200 >= MIN_PULLBACK_DISTANCE_PERCENT) {
        state.wasAboveEma200 = true;
      }
    } else {
      state.maxDistanceBelowEma200 = Math.max(state.maxDistanceBelowEma200, Math.abs(distanceFromEma200));
      if (Math.abs(distanceFromEma200) >= MIN_PULLBACK_DISTANCE_PERCENT) {
        state.wasBelowEma200 = true;
      }
    }
  }
  
  // Set final position from last candle
  const lastCandle = candles[candles.length - 1];
  const lastEma50 = ema50Values[ema50Values.length - 1];
  const lastEma200 = ema200Values[ema200Values.length - 1];
  
  if (!isNaN(lastEma50) && !isNaN(lastEma200)) {
    state.lastCloseAboveEma50 = isPriceAboveEMA(lastCandle.close, lastEma50);
    state.lastCloseAtEma50 = isPriceAtEMA(lastCandle.close, lastEma50);
    state.lastCloseBelowEma50 = isPriceBelowEMA(lastCandle.close, lastEma50);
    
    state.lastCloseAboveEma200 = isPriceAboveEMA(lastCandle.close, lastEma200);
    state.lastCloseAtEma200 = isPriceAtEMA(lastCandle.close, lastEma200);
    state.lastCloseBelowEma200 = isPriceBelowEMA(lastCandle.close, lastEma200);
  }
  
  state.lastUpdate = Date.now();
  
  console.log(`[PullbackState] ✅ Initialized ${assetId} ${timeframe}: EMA50 pos=${state.lastCloseAboveEma50 ? 'ABOVE' : state.lastCloseBelowEma50 ? 'BELOW' : 'AT'}, EMA200 pos=${state.lastCloseAboveEma200 ? 'ABOVE' : state.lastCloseBelowEma200 ? 'BELOW' : 'AT'}, wasAbove50=${state.wasAboveEma50}, wasAbove200=${state.wasAboveEma200}, wasBelow50=${state.wasBelowEma50}, wasBelow200=${state.wasBelowEma200}`);
}

/**
 * Check if candle "touches" EMA with proper validation.
 * 
 * A valid touch requires:
 * 1. Candle's wick actually crossed through EMA (low <= ema <= high)
 * 2. The touch is meaningful (not just random noise)
 * 
 * NOTE: This alone is NOT sufficient for a signal - pullback state must also be validated.
 */
function touchesEMA(price: number, low: number, high: number, ema: number): boolean {
  // Check if candle range crosses through EMA
  const candleCrossedEMA = low <= ema && high >= ema;
  
  // Calculate how close the close price is to EMA
  const distanceFromClose = Math.abs((price - ema) / ema * 100);
  
  // For a meaningful touch, either:
  // 1. Candle crossed through EMA, OR
  // 2. Close price is very close to EMA (within tolerance)
  const closeNearEMA = distanceFromClose <= EMA_TOUCH_TOLERANCE_PERCENT;
  
  return candleCrossedEMA || closeNearEMA;
}

/**
 * Check if there was a valid BULLISH pullback to EMA.
 * Requires:
 * 1. Price was previously ABOVE EMA (at sufficient distance)
 * 2. Price pulled back and touched EMA
 * 3. Price bounced (closed above EMA)
 */
function isValidBullishPullback(
  assetId: string,
  timeframe: string,
  price: number,
  low: number,
  high: number,
  ema: number,
  emaName: string
): boolean {
  const state = getPullbackState(assetId, timeframe);
  
  // Get the appropriate state based on which EMA we're checking
  // CRITICAL: Must check wasABOVE (not just "away") for bullish pullback
  const wasAbove = emaName === 'EMA50' ? state.wasAboveEma50 : state.wasAboveEma200;
  const maxDistanceAbove = emaName === 'EMA50' ? state.maxDistanceAboveEma50 : state.maxDistanceAboveEma200;
  
  // Condition 1: Price must have been ABOVE EMA at sufficient distance
  if (!wasAbove || maxDistanceAbove < MIN_PULLBACK_DISTANCE_PERCENT) {
    console.log(`[${emaName} Pullback] REJECTED: Price was not sufficiently ABOVE EMA (wasAbove=${wasAbove}, maxDistAbove=${maxDistanceAbove.toFixed(3)}%, required=${MIN_PULLBACK_DISTANCE_PERCENT}%)`);
    return false;
  }
  
  // Condition 2: Candle must touch EMA (wick crossed through or close is near)
  const touched = touchesEMA(price, low, high, ema);
  if (!touched) {
    console.log(`[${emaName} Pullback] REJECTED: Candle did not touch EMA (low=${low.toFixed(2)}, high=${high.toFixed(2)}, ema=${ema.toFixed(2)})`);
    return false;
  }
  
  // Condition 3: Price must bounce (close above EMA - using tolerance-based comparison)
  // Price must be strictly above EMA (not just touching/at EMA)
  const bounced = isPriceAboveEMA(price, ema);
  if (!bounced) {
    const atEMA = isPriceAtEMA(price, ema);
    console.log(`[${emaName} Pullback] REJECTED: Price did not bounce (close=${price.toFixed(2)}, ema=${ema.toFixed(2)}, atEMA=${atEMA})`);
    return false;
  }
  
  console.log(`[${emaName} Pullback] ✅ VALID BULLISH PULLBACK: wasAbove=true, maxDistAbove=${maxDistanceAbove.toFixed(3)}%, touched=true, bounced=true`);
  return true;
}

/**
 * Check if there was a valid BEARISH rejection at EMA.
 * Requires:
 * 1. Price was previously BELOW EMA (at sufficient distance)
 * 2. Price rallied up and touched EMA
 * 3. Price rejected (closed below EMA)
 */
function isValidBearishRejection(
  assetId: string,
  timeframe: string,
  price: number,
  low: number,
  high: number,
  ema: number,
  emaName: string
): boolean {
  const state = getPullbackState(assetId, timeframe);
  
  // CRITICAL: Must check wasBELOW (not just "away") for bearish rejection
  const wasBelow = emaName === 'EMA50' ? state.wasBelowEma50 : state.wasBelowEma200;
  const maxDistanceBelow = emaName === 'EMA50' ? state.maxDistanceBelowEma50 : state.maxDistanceBelowEma200;
  
  // Condition 1: Price must have been BELOW EMA at sufficient distance
  if (!wasBelow || maxDistanceBelow < MIN_PULLBACK_DISTANCE_PERCENT) {
    console.log(`[${emaName} Rejection] REJECTED: Price was not sufficiently BELOW EMA (wasBelow=${wasBelow}, maxDistBelow=${maxDistanceBelow.toFixed(3)}%, required=${MIN_PULLBACK_DISTANCE_PERCENT}%)`);
    return false;
  }
  
  // Condition 2: Candle must touch EMA
  const touched = touchesEMA(price, low, high, ema);
  if (!touched) {
    console.log(`[${emaName} Rejection] REJECTED: Candle did not touch EMA (low=${low.toFixed(2)}, high=${high.toFixed(2)}, ema=${ema.toFixed(2)})`);
    return false;
  }
  
  // Condition 3: Price must reject (close below EMA - using tolerance-based comparison)
  // Price must be strictly below EMA (not just touching/at EMA)
  const rejected = isPriceBelowEMA(price, ema);
  if (!rejected) {
    const atEMA = isPriceAtEMA(price, ema);
    console.log(`[${emaName} Rejection] REJECTED: Price did not reject (close=${price.toFixed(2)}, ema=${ema.toFixed(2)}, atEMA=${atEMA})`);
    return false;
  }
  
  console.log(`[${emaName} Rejection] ✅ VALID BEARISH REJECTION: wasBelow=true, maxDistBelow=${maxDistanceBelow.toFixed(3)}%, touched=true, rejected=true`);
  return true;
}

/**
 * Check if there was a valid breakdown through EMA.
 * Requires:
 * 1. Price was previously ABOVE EMA
 * 2. Price broke down through EMA
 * 3. Price closed BELOW EMA (breakdown confirmation)
 */
function isValidBreakdown(
  assetId: string,
  timeframe: string,
  price: number,
  low: number,
  high: number,
  ema: number,
  emaName: string
): boolean {
  const state = getPullbackState(assetId, timeframe);
  
  // Check if previous candle was above or at EMA (breakdown can start from AT the EMA too)
  const wasStrictlyAbove = emaName === 'EMA50' ? state.lastCloseAboveEma50 : state.lastCloseAboveEma200;
  const wasAtEma = emaName === 'EMA50' ? state.lastCloseAtEma50 : state.lastCloseAtEma200;
  const wasAboveOrAt = wasStrictlyAbove || wasAtEma;
  
  if (!wasAboveOrAt) {
    const wasBelow = emaName === 'EMA50' ? state.lastCloseBelowEma50 : state.lastCloseBelowEma200;
    console.log(`[${emaName} Breakdown] REJECTED: Previous close was below EMA (wasAbove=${wasStrictlyAbove}, wasAt=${wasAtEma}, wasBelow=${wasBelow})`);
    return false;
  }
  
  // Candle must cross through EMA
  const crossed = low <= ema && high >= ema;
  if (!crossed) {
    console.log(`[${emaName} Breakdown] REJECTED: Candle did not cross through EMA`);
    return false;
  }
  
  // Must close below EMA (using tolerance-based comparison)
  // Price must be strictly below EMA (not just touching/at EMA)
  const brokeDown = isPriceBelowEMA(price, ema);
  if (!brokeDown) {
    const atEMA = isPriceAtEMA(price, ema);
    console.log(`[${emaName} Breakdown] REJECTED: Price did not close below EMA (atEMA=${atEMA})`);
    return false;
  }
  
  console.log(`[${emaName} Breakdown] ✅ VALID: wasAbove=true, crossed=true, brokeDown=true`);
  return true;
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
    // Must be in uptrend (EMA50 > EMA200)
    const ema50Above200 = data.ema50 > data.ema200;
    if (!ema50Above200) {
      console.log(`[15m_above_50_bullish] SKIP: Not in uptrend (EMA50=${data.ema50.toFixed(2)} < EMA200=${data.ema200.toFixed(2)})`);
      return false;
    }
    
    // Check for valid bullish pullback to EMA50
    const validPullback = isValidBullishPullback(
      data.assetId,
      data.timeframe,
      data.price,
      data.low,
      data.high,
      data.ema50,
      'EMA50'
    );
    
    console.log(`[15m_above_50_bullish] uptrend=${ema50Above200}, validPullback=${validPullback}, price=${data.price.toFixed(2)}, ema50=${data.ema50.toFixed(2)}, ema200=${data.ema200.toFixed(2)}`);
    
    return validPullback;
  }
}

export class Strategy5MAbove200Reversal implements ISignalStrategy {
  getSignalType(): string {
    return "5m_above_200_reversal";
  }

  check(data: MarketData): boolean {
    // In a downtrend (EMA200 > EMA50) - reversal setup
    const ema200Above50 = data.ema200 > data.ema50;
    if (!ema200Above50) {
      console.log(`[5m_above_200_reversal] SKIP: Not in downtrend (EMA200=${data.ema200.toFixed(2)} < EMA50=${data.ema50.toFixed(2)})`);
      return false;
    }
    
    // For reversals, we need price to have been BELOW EMA200, then break above
    // This is a breakout, not a pullback - check if previous close was strictly BELOW (not just "at")
    // Use the new tri-state tracking for accurate detection
    const state = getPullbackState(data.assetId, data.timeframe);
    
    // wasBelow means previous candle closed STRICTLY below EMA (not at/touching)
    const wasStrictlyBelow = state.lastCloseBelowEma200;
    const wasAtOrBelow = state.lastCloseBelowEma200 || state.lastCloseAtEma200;
    const nowAbove = isPriceAboveEMA(data.price, data.ema200);
    const crossed = data.low <= data.ema200 && data.high >= data.ema200;
    
    // For a valid reversal: previous close was below (or at) EMA, now strictly above, and candle crossed
    const validReversal = wasAtOrBelow && nowAbove && crossed;
    
    console.log(`[5m_above_200_reversal] downtrend=${ema200Above50}, wasStrictlyBelow=${wasStrictlyBelow}, wasAtOrBelow=${wasAtOrBelow}, nowAbove=${nowAbove}, crossed=${crossed}, valid=${validReversal}`);
    
    return validReversal;
  }
}

export class Strategy5MPullbackTo200 implements ISignalStrategy {
  getSignalType(): string {
    return "5m_pullback_to_200";
  }

  check(data: MarketData): boolean {
    // In an uptrend (EMA50 > EMA200)
    const ema50Above200 = data.ema50 > data.ema200;
    if (!ema50Above200) {
      console.log(`[5m_pullback_to_200] SKIP: Not in uptrend (EMA50=${data.ema50.toFixed(2)} < EMA200=${data.ema200.toFixed(2)})`);
      return false;
    }
    
    // Check for valid bullish pullback to EMA200
    const validPullback = isValidBullishPullback(
      data.assetId,
      data.timeframe,
      data.price,
      data.low,
      data.high,
      data.ema200,
      'EMA200'
    );
    
    console.log(`[5m_pullback_to_200] uptrend=${ema50Above200}, validPullback=${validPullback}, price=${data.price.toFixed(2)}, ema200=${data.ema200.toFixed(2)}`);
    
    return validPullback;
  }
}

export class Strategy5MBelow200Bearish implements ISignalStrategy {
  getSignalType(): string {
    return "5m_below_200_bearish";
  }

  check(data: MarketData): boolean {
    // In an uptrend (EMA50 > EMA200) - breakdown setup
    const ema50Above200 = data.ema50 > data.ema200;
    if (!ema50Above200) {
      console.log(`[5m_below_200_bearish] SKIP: Not in uptrend (EMA50=${data.ema50.toFixed(2)} < EMA200=${data.ema200.toFixed(2)})`);
      return false;
    }
    
    // Check for valid breakdown through EMA200
    const validBreakdown = isValidBreakdown(
      data.assetId,
      data.timeframe,
      data.price,
      data.low,
      data.high,
      data.ema200,
      'EMA200'
    );
    
    console.log(`[5m_below_200_bearish] uptrend=${ema50Above200}, validBreakdown=${validBreakdown}, price=${data.price.toFixed(2)}, ema200=${data.ema200.toFixed(2)}`);
    
    return validBreakdown;
  }
}

export class Strategy5MTouch200Downtrend implements ISignalStrategy {
  getSignalType(): string {
    return "5m_touch_200_downtrend";
  }

  check(data: MarketData): boolean {
    // In a downtrend (EMA200 > EMA50)
    const ema200Above50 = data.ema200 > data.ema50;
    if (!ema200Above50) {
      console.log(`[5m_touch_200_downtrend] SKIP: Not in downtrend (EMA200=${data.ema200.toFixed(2)} < EMA50=${data.ema50.toFixed(2)})`);
      return false;
    }
    
    // Check for valid bearish rejection at EMA200
    const validRejection = isValidBearishRejection(
      data.assetId,
      data.timeframe,
      data.price,
      data.low,
      data.high,
      data.ema200,
      'EMA200'
    );
    
    console.log(`[5m_touch_200_downtrend] downtrend=${ema200Above50}, validRejection=${validRejection}, price=${data.price.toFixed(2)}, ema200=${data.ema200.toFixed(2)}`);
    
    return validRejection;
  }
}

export class Strategy15MBelow200Breakdown implements ISignalStrategy {
  getSignalType(): string {
    return "15m_below_200_breakdown";
  }

  check(data: MarketData): boolean {
    // Was in an uptrend (EMA50 > EMA200)
    const ema50Above200 = data.ema50 > data.ema200;
    if (!ema50Above200) {
      console.log(`[15m_below_200_breakdown] SKIP: Not in uptrend (EMA50=${data.ema50.toFixed(2)} < EMA200=${data.ema200.toFixed(2)})`);
      return false;
    }
    
    // Check for valid breakdown through EMA200
    const validBreakdown = isValidBreakdown(
      data.assetId,
      data.timeframe,
      data.price,
      data.low,
      data.high,
      data.ema200,
      'EMA200'
    );
    
    console.log(`[15m_below_200_breakdown] uptrend=${ema50Above200}, validBreakdown=${validBreakdown}, price=${data.price.toFixed(2)}, ema200=${data.ema200.toFixed(2)}`);
    
    return validBreakdown;
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
