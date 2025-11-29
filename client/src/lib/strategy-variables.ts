export const STRATEGY_VARIABLES = {
  "price": {
    type: "number",
    description: "Current market price of the asset",
    example: "100.50",
  },
  "ema50": {
    type: "number",
    description: "50-period Exponential Moving Average",
    example: "99.75",
  },
  "ema200": {
    type: "number",
    description: "200-period Exponential Moving Average",
    example: "98.20",
  },
  "high": {
    type: "number",
    description: "Highest price in the current candle",
    example: "102.00",
  },
  "low": {
    type: "number",
    description: "Lowest price in the current candle",
    example: "99.00",
  },
  "open": {
    type: "number",
    description: "Opening price of the current candle",
    example: "100.00",
  },
  "close": {
    type: "number",
    description: "Closing price of the current candle",
    example: "100.50",
  },
  "volume": {
    type: "number",
    description: "Trading volume for the current candle",
    example: "1500000",
  },
  "timestamp": {
    type: "Date",
    description: "Current candle timestamp",
    example: "2024-01-15T10:30:00Z",
  },
};

export const STRATEGY_OPERATORS = {
  ">": "Greater than",
  "<": "Less than",
  ">=": "Greater than or equal to",
  "<=": "Less than or equal to",
  "==": "Equal to",
  "!=": "Not equal to",
  "&&": "AND logical operator",
  "||": "OR logical operator",
};

export const STRATEGY_FUNCTIONS = {
  "abs(value)": "Absolute value",
  "Math.min(a, b)": "Minimum of two values",
  "Math.max(a, b)": "Maximum of two values",
  "Math.round(value)": "Round to nearest integer",
  "Math.floor(value)": "Round down",
  "Math.ceil(value)": "Round up",
  "((a - b) / b * 100)": "Percentage change",
};

export type StrategyVariable = keyof typeof STRATEGY_VARIABLES;
