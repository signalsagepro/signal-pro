export interface CandleDataPoint {
  close: number;
  high: number;
  low: number;
  open: number;
  timestamp: Date;
}

export interface EMAResult {
  values: number[];
  currentEMA: number;
  period: number;
}

/**
 * EMA Calculator implementing the standard Exponential Moving Average formula.
 * 
 * Formula: EMA = (Close - Previous EMA) × Multiplier + Previous EMA
 * Multiplier = 2 / (Period + 1)
 * 
 * The first EMA value is initialized using a Simple Moving Average (SMA)
 * of the first `period` data points.
 */
export class EMACalculator {
  /**
   * Calculate EMA for an array of prices.
   * Returns an array of EMA values aligned with the input data.
   * The first (period - 1) values will be NaN as there's insufficient data.
   * 
   * @param data - Array of closing prices
   * @param period - EMA period (e.g., 50, 200)
   * @returns Array of EMA values, same length as input
   */
  calculateEMA(data: number[], period: number): number[] {
    if (!data || data.length === 0) {
      return [];
    }

    if (period <= 0) {
      throw new Error('EMA period must be greater than 0');
    }

    if (data.length < period) {
      // Return array of NaN with same length as input
      return data.map(() => NaN);
    }

    const emaValues: number[] = new Array(data.length);
    const multiplier = 2 / (period + 1);

    // Fill initial values with NaN (insufficient data for EMA)
    for (let i = 0; i < period - 1; i++) {
      emaValues[i] = NaN;
    }

    // Calculate initial SMA as the first EMA value
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i];
    }
    const sma = sum / period;
    emaValues[period - 1] = sma;

    // Calculate subsequent EMA values
    for (let i = period; i < data.length; i++) {
      const previousEMA = emaValues[i - 1];
      const currentPrice = data[i];
      // EMA = (Current Price - Previous EMA) × Multiplier + Previous EMA
      emaValues[i] = (currentPrice - previousEMA) * multiplier + previousEMA;
    }

    return emaValues;
  }

  /**
   * Calculate EMA and return only valid (non-NaN) values.
   * Useful when you only need the computed EMA values.
   * 
   * @param data - Array of closing prices
   * @param period - EMA period
   * @returns Array of valid EMA values
   */
  calculateEMACompact(data: number[], period: number): number[] {
    const emaValues = this.calculateEMA(data, period);
    return emaValues.filter(v => !isNaN(v));
  }

  /**
   * Calculate the current/latest EMA value from candle data.
   * 
   * @param candles - Array of candle data points
   * @param period - EMA period
   * @returns The latest EMA value or null if insufficient data
   */
  calculateEMAForCandles(candles: CandleDataPoint[], period: number): number | null {
    if (!candles || candles.length < period) {
      return null;
    }

    const closePrices = candles.map(c => c.close);
    const emaValues = this.calculateEMA(closePrices, period);
    
    const lastEMA = emaValues[emaValues.length - 1];
    if (isNaN(lastEMA)) {
      return null;
    }

    return lastEMA;
  }

  /**
   * Calculate the next EMA value given a new price and previous EMA.
   * Used for real-time streaming updates.
   * 
   * @param currentPrice - The new closing price
   * @param previousEMA - The previous EMA value
   * @param period - EMA period
   * @returns The new EMA value
   */
  calculateCurrentEMA(currentPrice: number, previousEMA: number, period: number): number {
    if (period <= 0) {
      throw new Error('EMA period must be greater than 0');
    }
    const multiplier = 2 / (period + 1);
    return (currentPrice - previousEMA) * multiplier + previousEMA;
  }

  /**
   * Calculate both EMA50 and EMA200 in a single pass for efficiency.
   * 
   * @param data - Array of closing prices
   * @returns Object containing both EMA50 and EMA200 latest values
   */
  calculateEMA50And200(data: number[]): { ema50: number | null; ema200: number | null } {
    const ema50Values = this.calculateEMA(data, 50);
    const ema200Values = this.calculateEMA(data, 200);

    const ema50 = ema50Values.length > 0 ? ema50Values[ema50Values.length - 1] : null;
    const ema200 = ema200Values.length > 0 ? ema200Values[ema200Values.length - 1] : null;

    return {
      ema50: ema50 !== null && !isNaN(ema50) ? ema50 : null,
      ema200: ema200 !== null && !isNaN(ema200) ? ema200 : null,
    };
  }

  /**
   * Validate that the EMA calculation is mathematically correct.
   * Used for testing and verification.
   * 
   * @param data - Test data array
   * @param period - EMA period
   * @returns Validation result with details
   */
  validateEMACalculation(data: number[], period: number): { valid: boolean; details: string } {
    try {
      const emaValues = this.calculateEMA(data, period);
      
      // Check array length matches
      if (emaValues.length !== data.length) {
        return { valid: false, details: 'EMA array length mismatch' };
      }

      // Check first (period-1) values are NaN
      for (let i = 0; i < period - 1; i++) {
        if (!isNaN(emaValues[i])) {
          return { valid: false, details: `Expected NaN at index ${i}` };
        }
      }

      // Check SMA calculation at index (period-1)
      let sum = 0;
      for (let i = 0; i < period; i++) {
        sum += data[i];
      }
      const expectedSMA = sum / period;
      if (Math.abs(emaValues[period - 1] - expectedSMA) > 0.0001) {
        return { valid: false, details: 'SMA calculation incorrect' };
      }

      // Verify EMA formula for subsequent values
      const multiplier = 2 / (period + 1);
      for (let i = period; i < data.length; i++) {
        const expectedEMA = (data[i] - emaValues[i - 1]) * multiplier + emaValues[i - 1];
        if (Math.abs(emaValues[i] - expectedEMA) > 0.0001) {
          return { valid: false, details: `EMA formula incorrect at index ${i}` };
        }
      }

      return { valid: true, details: 'EMA calculation verified successfully' };
    } catch (error) {
      return { valid: false, details: `Validation error: ${error}` };
    }
  }
}

export const emaCalculator = new EMACalculator();
