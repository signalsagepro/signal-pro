export interface CandleDataPoint {
  close: number;
  high: number;
  low: number;
  open: number;
  timestamp: Date;
}

export class EMACalculator {
  calculateEMA(data: number[], period: number): number[] {
    if (data.length < period) {
      return [];
    }

    const emaValues: number[] = [];
    const multiplier = 2 / (period + 1);

    const sma = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    emaValues.push(sma);

    for (let i = period; i < data.length; i++) {
      const ema = (data[i] - emaValues[emaValues.length - 1]) * multiplier + emaValues[emaValues.length - 1];
      emaValues.push(ema);
    }

    return emaValues;
  }

  calculateEMAForCandles(candles: CandleDataPoint[], period: number): number | null {
    const closePrices = candles.map(c => c.close);
    const emaValues = this.calculateEMA(closePrices, period);
    
    if (emaValues.length === 0) {
      return null;
    }

    return emaValues[emaValues.length - 1];
  }

  calculateCurrentEMA(currentPrice: number, previousEMA: number, period: number): number {
    const multiplier = 2 / (period + 1);
    return (currentPrice - previousEMA) * multiplier + previousEMA;
  }
}

export const emaCalculator = new EMACalculator();
