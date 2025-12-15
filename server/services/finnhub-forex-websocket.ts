import { WebSocket } from "ws";
import { EventEmitter } from "events";
import { emaCalculator } from "./ema-calculator";

/**
 * Finnhub Forex WebSocket Service
 * FREE tier includes real-time forex WebSocket for major pairs
 * Documentation: https://finnhub.io/docs/api/websocket-trades
 */

export interface ForexTickData {
  symbol: string;       // e.g., "OANDA:EUR_USD"
  price: number;        // Last price
  timestamp: Date;
  volume?: number;
  bid?: number;
  ask?: number;
}

interface FinnhubForexMessage {
  type: string;
  data?: Array<{
    s: string;    // Symbol
    p: number;    // Price
    t: number;    // Timestamp (ms)
    v: number;    // Volume
  }>;
}

// Common forex pairs available on Finnhub free tier
export const FINNHUB_FOREX_PAIRS = [
  "OANDA:EUR_USD",
  "OANDA:GBP_USD", 
  "OANDA:USD_JPY",
  "OANDA:USD_CHF",
  "OANDA:AUD_USD",
  "OANDA:USD_CAD",
  "OANDA:NZD_USD",
  "OANDA:EUR_GBP",
  "OANDA:EUR_JPY",
  "OANDA:GBP_JPY",
  "OANDA:EUR_CHF",
  "OANDA:AUD_JPY",
  "OANDA:USD_INR",
  "OANDA:EUR_INR",
  "OANDA:GBP_INR",
];

// User-friendly symbol mapping
export const FOREX_SYMBOL_MAP: Record<string, { symbol: string; name: string }> = {
  "OANDA:EUR_USD": { symbol: "EUR/USD", name: "Euro / US Dollar" },
  "OANDA:GBP_USD": { symbol: "GBP/USD", name: "British Pound / US Dollar" },
  "OANDA:USD_JPY": { symbol: "USD/JPY", name: "US Dollar / Japanese Yen" },
  "OANDA:USD_CHF": { symbol: "USD/CHF", name: "US Dollar / Swiss Franc" },
  "OANDA:AUD_USD": { symbol: "AUD/USD", name: "Australian Dollar / US Dollar" },
  "OANDA:USD_CAD": { symbol: "USD/CAD", name: "US Dollar / Canadian Dollar" },
  "OANDA:NZD_USD": { symbol: "NZD/USD", name: "New Zealand Dollar / US Dollar" },
  "OANDA:EUR_GBP": { symbol: "EUR/GBP", name: "Euro / British Pound" },
  "OANDA:EUR_JPY": { symbol: "EUR/JPY", name: "Euro / Japanese Yen" },
  "OANDA:GBP_JPY": { symbol: "GBP/JPY", name: "British Pound / Japanese Yen" },
  "OANDA:EUR_CHF": { symbol: "EUR/CHF", name: "Euro / Swiss Franc" },
  "OANDA:AUD_JPY": { symbol: "AUD/JPY", name: "Australian Dollar / Japanese Yen" },
  "OANDA:USD_INR": { symbol: "USD/INR", name: "US Dollar / Indian Rupee" },
  "OANDA:EUR_INR": { symbol: "EUR/INR", name: "Euro / Indian Rupee" },
  "OANDA:GBP_INR": { symbol: "GBP/INR", name: "British Pound / Indian Rupee" },
};

export class FinnhubForexWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private apiKey: string = "";
  private subscriptions: Set<string> = new Set();
  private reconnectAttempts: number = 0;
  private priceHistory: Map<string, number[]> = new Map();
  private latestTicks: Map<string, ForexTickData> = new Map();
  private isConnected: boolean = false;
  private pingInterval: NodeJS.Timeout | null = null;

  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 5000;
  private readonly WS_URL = "wss://ws.finnhub.io";

  /**
   * Connect to Finnhub WebSocket
   */
  async connect(apiKey: string): Promise<boolean> {
    this.apiKey = apiKey;
    const wsUrl = `${this.WS_URL}?token=${apiKey}`;
    
    console.log("[Finnhub Forex] Connecting to WebSocket...");

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(wsUrl);

        const connectionTimeout = setTimeout(() => {
          console.error("[Finnhub Forex] Connection timeout after 10 seconds");
          this.ws?.terminate();
          resolve(false);
        }, 10000);

        this.ws.on("open", () => {
          clearTimeout(connectionTimeout);
          console.log("[Finnhub Forex] ✅ Connected successfully");
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.emit("connected", { broker: "finnhub_forex" });
          
          // Start ping to keep connection alive
          this.startPing();
          
          // Resubscribe if we had previous subscriptions
          this.resubscribe();
          
          resolve(true);
        });

        this.ws.on("message", (data: Buffer) => {
          this.handleMessage(data.toString());
        });

        this.ws.on("close", (code, reason) => {
          clearTimeout(connectionTimeout);
          console.log("[Finnhub Forex] Disconnected:", code, reason.toString());
          this.isConnected = false;
          this.stopPing();
          this.emit("disconnected", { broker: "finnhub_forex" });
          this.attemptReconnect();
        });

        this.ws.on("error", (error) => {
          clearTimeout(connectionTimeout);
          console.error("[Finnhub Forex] WebSocket error:", error.message);
          this.emit("error", { broker: "finnhub_forex", error: error.message });
        });

      } catch (error) {
        console.error("[Finnhub Forex] Connection error:", error);
        resolve(false);
      }
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.subscriptions.clear();
    console.log("[Finnhub Forex] Disconnected");
  }

  /**
   * Subscribe to forex pairs
   */
  subscribe(symbols: string[]): void {
    if (!this.ws || !this.isConnected) {
      console.warn("[Finnhub Forex] Cannot subscribe - not connected");
      return;
    }

    for (const symbol of symbols) {
      if (!this.subscriptions.has(symbol)) {
        const message = JSON.stringify({ type: "subscribe", symbol });
        this.ws.send(message);
        this.subscriptions.add(symbol);
        console.log(`[Finnhub Forex] Subscribed to ${symbol}`);
      }
    }
  }

  /**
   * Unsubscribe from forex pairs
   */
  unsubscribe(symbols: string[]): void {
    if (!this.ws || !this.isConnected) return;

    for (const symbol of symbols) {
      if (this.subscriptions.has(symbol)) {
        const message = JSON.stringify({ type: "unsubscribe", symbol });
        this.ws.send(message);
        this.subscriptions.delete(symbol);
        console.log(`[Finnhub Forex] Unsubscribed from ${symbol}`);
      }
    }
  }

  /**
   * Get latest tick for a symbol
   */
  getLatestTick(symbol: string): ForexTickData | undefined {
    return this.latestTicks.get(symbol);
  }

  /**
   * Get all latest ticks
   */
  getAllLatestTicks(): Map<string, ForexTickData> {
    return this.latestTicks;
  }

  /**
   * Check if connected
   */
  isConnectedStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const message: FinnhubForexMessage = JSON.parse(data);

      if (message.type === "trade" && message.data) {
        for (const trade of message.data) {
          const tickData: ForexTickData = {
            symbol: trade.s,
            price: trade.p,
            timestamp: new Date(trade.t),
            volume: trade.v,
          };

          // Store latest tick
          this.latestTicks.set(trade.s, tickData);

          // Update price history for EMA calculation
          const historyKey = trade.s;
          if (!this.priceHistory.has(historyKey)) {
            this.priceHistory.set(historyKey, []);
          }
          const history = this.priceHistory.get(historyKey)!;
          history.push(trade.p);
          if (history.length > 250) {
            history.shift();
          }

          // Calculate EMAs if we have enough data
          let ema50 = null;
          let ema200 = null;

          if (history.length >= 50) {
            const ema50Values = emaCalculator.calculateEMA(history, 50);
            ema50 = ema50Values[ema50Values.length - 1];
            if (isNaN(ema50)) ema50 = null;
          }

          if (history.length >= 200) {
            const ema200Values = emaCalculator.calculateEMA(history, 200);
            ema200 = ema200Values[ema200Values.length - 1];
            if (isNaN(ema200)) ema200 = null;
          }

          // Emit tick with EMA data
          this.emit("tick", {
            broker: "finnhub_forex",
            symbol: trade.s,
            lastPrice: trade.p,
            open: trade.p,
            high: trade.p,
            low: trade.p,
            close: trade.p,
            volume: trade.v,
            timestamp: new Date(trade.t),
            ema50,
            ema200,
            historyLength: history.length,
          });
        }
      } else if (message.type === "ping") {
        // Respond to server ping
        if (this.ws && this.isConnected) {
          this.ws.send(JSON.stringify({ type: "pong" }));
        }
      }
    } catch (error) {
      console.error("[Finnhub Forex] Error parsing message:", error);
    }
  }

  /**
   * Resubscribe to all symbols after reconnection
   */
  private resubscribe(): void {
    if (this.subscriptions.size > 0) {
      const symbols = Array.from(this.subscriptions);
      this.subscriptions.clear(); // Clear so subscribe() will re-add them
      this.subscribe(symbols);
    }
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.isConnected) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Attempt to reconnect after disconnection
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error("[Finnhub Forex] Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    console.log(`[Finnhub Forex] Attempting reconnection ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}`);

    setTimeout(() => {
      if (this.apiKey) {
        this.connect(this.apiKey);
      }
    }, this.RECONNECT_DELAY);
  }
}

// Singleton instance
export const finnhubForexWebSocket = new FinnhubForexWebSocket();
