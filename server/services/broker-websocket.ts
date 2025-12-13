import { WebSocket } from "ws";
import { EventEmitter } from "events";
import { emaCalculator } from "./ema-calculator";
import type { BrokerConfig } from "@shared/schema";

export interface TickData {
  symbol: string;
  instrumentToken: number;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
  change: number;
  changePercent: number;
}

export interface BrokerWebSocketConfig {
  apiKey: string;
  accessToken: string;
  broker: string;
}

/**
 * Real-time WebSocket streaming for broker data
 * Supports Zerodha, Upstox, and Angel One
 */
export class BrokerWebSocketManager extends EventEmitter {
  private connections: Map<string, WebSocket> = new Map();
  private subscriptions: Map<string, Set<number>> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private priceHistory: Map<string, number[]> = new Map();
  
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 5000;

  /**
   * Connect to Zerodha Kite WebSocket
   * Documentation: https://kite.trade/docs/connect/v3/websocket/
   */
  async connectZerodha(config: BrokerWebSocketConfig): Promise<boolean> {
    const wsUrl = `wss://ws.kite.trade?api_key=${config.apiKey}&access_token=${config.accessToken}`;
    
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(wsUrl);
        
        ws.on("open", () => {
          console.log("[Zerodha WS] Connected");
          this.connections.set("zerodha", ws);
          this.reconnectAttempts.set("zerodha", 0);
          this.emit("connected", { broker: "zerodha" });
          resolve(true);
        });

        ws.on("message", (data: Buffer) => {
          this.handleZerodhaMessage(data);
        });

        ws.on("close", () => {
          console.log("[Zerodha WS] Disconnected");
          this.connections.delete("zerodha");
          this.emit("disconnected", { broker: "zerodha" });
          this.attemptReconnect("zerodha", config);
        });

        ws.on("error", (error) => {
          console.error("[Zerodha WS] Error:", error.message);
          this.emit("error", { broker: "zerodha", error: error.message });
          resolve(false);
        });

      } catch (error) {
        console.error("[Zerodha WS] Connection failed:", error);
        resolve(false);
      }
    });
  }

  /**
   * Parse Zerodha binary WebSocket message
   * Zerodha sends binary packets with specific structure
   */
  private handleZerodhaMessage(data: Buffer) {
    try {
      // Check if it's a text message (JSON)
      const text = data.toString();
      if (text.startsWith("{")) {
        const json = JSON.parse(text);
        this.emit("message", { broker: "zerodha", type: json.type, data: json });
        return;
      }

      // Binary market data parsing
      // Packet structure: number of packets (2 bytes) + packets
      if (data.length < 2) return;

      const numberOfPackets = data.readInt16BE(0);
      let offset = 2;

      for (let i = 0; i < numberOfPackets; i++) {
        if (offset + 2 > data.length) break;
        
        const packetLength = data.readInt16BE(offset);
        offset += 2;

        if (offset + packetLength > data.length) break;

        const packet = data.slice(offset, offset + packetLength);
        offset += packetLength;

        const tick = this.parseZerodhaTick(packet);
        if (tick) {
          this.processTick("zerodha", tick);
        }
      }
    } catch (error) {
      console.error("[Zerodha WS] Parse error:", error);
    }
  }

  /**
   * Parse individual Zerodha tick packet
   */
  private parseZerodhaTick(packet: Buffer): TickData | null {
    if (packet.length < 8) return null;

    try {
      const instrumentToken = packet.readInt32BE(0);
      const lastPrice = packet.readInt32BE(4) / 100;

      // Full mode packet (44 bytes for stocks, 32 for indices)
      if (packet.length >= 44) {
        return {
          symbol: `TOKEN_${instrumentToken}`,
          instrumentToken,
          lastPrice,
          high: packet.readInt32BE(8) / 100,
          low: packet.readInt32BE(12) / 100,
          open: packet.readInt32BE(16) / 100,
          close: packet.readInt32BE(20) / 100,
          volume: packet.readInt32BE(28),
          change: 0,
          changePercent: 0,
          timestamp: new Date(),
        };
      }

      // LTP mode (8 bytes)
      return {
        symbol: `TOKEN_${instrumentToken}`,
        instrumentToken,
        lastPrice,
        high: lastPrice,
        low: lastPrice,
        open: lastPrice,
        close: lastPrice,
        volume: 0,
        change: 0,
        changePercent: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Connect to Upstox WebSocket
   * Documentation: https://upstox.com/developer/api-documentation/websocket/
   */
  async connectUpstox(config: BrokerWebSocketConfig): Promise<boolean> {
    // First get the authorized WebSocket URL
    try {
      const authResponse = await fetch(
        "https://api.upstox.com/v2/feed/market-data-feed/authorize",
        {
          headers: {
            "Authorization": `Bearer ${config.accessToken}`,
            "Accept": "application/json",
          },
        }
      );

      if (!authResponse.ok) {
        console.error("[Upstox WS] Failed to get authorized URL");
        return false;
      }

      const authData = await authResponse.json();
      const wsUrl = authData.data?.authorizedRedirectUri;

      if (!wsUrl) {
        console.error("[Upstox WS] No WebSocket URL in response");
        return false;
      }

      return new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);

        ws.on("open", () => {
          console.log("[Upstox WS] Connected");
          this.connections.set("upstox", ws);
          this.reconnectAttempts.set("upstox", 0);
          this.emit("connected", { broker: "upstox" });
          resolve(true);
        });

        ws.on("message", (data: Buffer) => {
          this.handleUpstoxMessage(data);
        });

        ws.on("close", () => {
          console.log("[Upstox WS] Disconnected");
          this.connections.delete("upstox");
          this.emit("disconnected", { broker: "upstox" });
          this.attemptReconnect("upstox", config);
        });

        ws.on("error", (error) => {
          console.error("[Upstox WS] Error:", error.message);
          resolve(false);
        });
      });
    } catch (error) {
      console.error("[Upstox WS] Connection failed:", error);
      return false;
    }
  }

  /**
   * Handle Upstox WebSocket message (Protobuf format)
   */
  private handleUpstoxMessage(data: Buffer) {
    try {
      // Upstox uses protobuf, for now emit raw data
      // In production, use proper protobuf decoder
      const text = data.toString();
      if (text.startsWith("{")) {
        const json = JSON.parse(text);
        this.emit("message", { broker: "upstox", data: json });
        
        // Extract tick data if available
        if (json.feeds) {
          for (const [symbol, feed] of Object.entries(json.feeds as Record<string, any>)) {
            const ff = feed.ff || feed.ltpc;
            if (ff) {
              const tick: TickData = {
                symbol,
                instrumentToken: 0,
                lastPrice: ff.ltp || ff.ltpc?.ltp || 0,
                open: ff.ohlc?.open || 0,
                high: ff.ohlc?.high || 0,
                low: ff.ohlc?.low || 0,
                close: ff.ohlc?.close || 0,
                volume: ff.volume || 0,
                change: ff.ch || 0,
                changePercent: ff.chp || 0,
                timestamp: new Date(),
              };
              this.processTick("upstox", tick);
            }
          }
        }
      }
    } catch (error) {
      console.error("[Upstox WS] Parse error:", error);
    }
  }

  /**
   * Connect to Angel One WebSocket
   * Documentation: https://smartapi.angelbroking.com/docs/WebSocket
   */
  async connectAngel(config: BrokerWebSocketConfig): Promise<boolean> {
    const wsUrl = `wss://smartapisocket.angelone.in/smart-stream?clientCode=${config.apiKey}&feedToken=${config.accessToken}`;

    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(wsUrl);

        ws.on("open", () => {
          console.log("[Angel WS] Connected");
          this.connections.set("angel", ws);
          this.reconnectAttempts.set("angel", 0);
          this.emit("connected", { broker: "angel" });
          resolve(true);
        });

        ws.on("message", (data: Buffer) => {
          this.handleAngelMessage(data);
        });

        ws.on("close", () => {
          console.log("[Angel WS] Disconnected");
          this.connections.delete("angel");
          this.emit("disconnected", { broker: "angel" });
          this.attemptReconnect("angel", config);
        });

        ws.on("error", (error) => {
          console.error("[Angel WS] Error:", error.message);
          resolve(false);
        });
      } catch (error) {
        console.error("[Angel WS] Connection failed:", error);
        resolve(false);
      }
    });
  }

  /**
   * Handle Angel One WebSocket message
   */
  private handleAngelMessage(data: Buffer) {
    try {
      // Angel sends binary data similar to Zerodha
      if (data.length < 8) return;

      // Parse binary format
      const token = data.slice(0, 25).toString().trim();
      const ltp = data.readFloatLE(43) || 0;
      const open = data.readFloatLE(51) || 0;
      const high = data.readFloatLE(55) || 0;
      const low = data.readFloatLE(59) || 0;
      const close = data.readFloatLE(47) || 0;
      const volume = data.readInt32LE(35) || 0;

      const tick: TickData = {
        symbol: token,
        instrumentToken: 0,
        lastPrice: ltp,
        open,
        high,
        low,
        close,
        volume,
        change: ltp - close,
        changePercent: close > 0 ? ((ltp - close) / close) * 100 : 0,
        timestamp: new Date(),
      };

      this.processTick("angel", tick);
    } catch (error) {
      console.error("[Angel WS] Parse error:", error);
    }
  }

  /**
   * Process incoming tick and calculate EMA
   */
  private processTick(broker: string, tick: TickData) {
    const key = `${broker}:${tick.symbol}`;
    
    // Store price history for EMA calculation
    if (!this.priceHistory.has(key)) {
      this.priceHistory.set(key, []);
    }
    
    const history = this.priceHistory.get(key)!;
    history.push(tick.lastPrice);
    
    // Keep only last 250 prices
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
      broker,
      ...tick,
      ema50,
      ema200,
      historyLength: history.length,
    });
  }

  /**
   * Subscribe to instruments
   */
  subscribe(broker: string, instrumentTokens: number[]) {
    const ws = this.connections.get(broker);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error(`[${broker} WS] Not connected`);
      return false;
    }

    let subscribeMessage: any;

    switch (broker) {
      case "zerodha":
        // Zerodha subscription: {"a": "subscribe", "v": [tokens]}
        subscribeMessage = JSON.stringify({
          a: "subscribe",
          v: instrumentTokens,
        });
        break;

      case "upstox":
        // Upstox subscription format
        subscribeMessage = JSON.stringify({
          guid: "signalpro",
          method: "sub",
          data: {
            mode: "full",
            instrumentKeys: instrumentTokens.map(t => `NSE_EQ|${t}`),
          },
        });
        break;

      case "angel":
        // Angel One subscription format
        subscribeMessage = JSON.stringify({
          correlationID: "signalpro",
          action: 1, // 1 = subscribe
          params: {
            mode: 3, // Full mode
            tokenList: [{ exchangeType: 1, tokens: instrumentTokens.map(String) }],
          },
        });
        break;
    }

    if (subscribeMessage) {
      ws.send(subscribeMessage);
      
      if (!this.subscriptions.has(broker)) {
        this.subscriptions.set(broker, new Set());
      }
      instrumentTokens.forEach(t => this.subscriptions.get(broker)!.add(t));
      
      console.log(`[${broker} WS] Subscribed to ${instrumentTokens.length} instruments`);
      return true;
    }

    return false;
  }

  /**
   * Unsubscribe from instruments
   */
  unsubscribe(broker: string, instrumentTokens: number[]) {
    const ws = this.connections.get(broker);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    let unsubscribeMessage: any;

    switch (broker) {
      case "zerodha":
        unsubscribeMessage = JSON.stringify({
          a: "unsubscribe",
          v: instrumentTokens,
        });
        break;

      case "upstox":
        unsubscribeMessage = JSON.stringify({
          guid: "signalpro",
          method: "unsub",
          data: {
            instrumentKeys: instrumentTokens.map(t => `NSE_EQ|${t}`),
          },
        });
        break;

      case "angel":
        unsubscribeMessage = JSON.stringify({
          correlationID: "signalpro",
          action: 0, // 0 = unsubscribe
          params: {
            mode: 3,
            tokenList: [{ exchangeType: 1, tokens: instrumentTokens.map(String) }],
          },
        });
        break;
    }

    if (unsubscribeMessage) {
      ws.send(unsubscribeMessage);
      instrumentTokens.forEach(t => this.subscriptions.get(broker)?.delete(t));
      return true;
    }

    return false;
  }

  /**
   * Disconnect from broker
   */
  disconnect(broker: string) {
    const ws = this.connections.get(broker);
    if (ws) {
      ws.close();
      this.connections.delete(broker);
      this.subscriptions.delete(broker);
    }
  }

  /**
   * Disconnect from all brokers
   */
  disconnectAll() {
    const brokers = Array.from(this.connections.keys());
    for (const broker of brokers) {
      this.disconnect(broker);
    }
  }

  /**
   * Attempt reconnection with exponential backoff
   */
  private async attemptReconnect(broker: string, config: BrokerWebSocketConfig) {
    const attempts = this.reconnectAttempts.get(broker) || 0;
    
    if (attempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error(`[${broker} WS] Max reconnect attempts reached`);
      this.emit("reconnect_failed", { broker });
      return;
    }

    this.reconnectAttempts.set(broker, attempts + 1);
    const delay = this.RECONNECT_DELAY * Math.pow(2, attempts);
    
    console.log(`[${broker} WS] Reconnecting in ${delay}ms (attempt ${attempts + 1})`);
    
    await new Promise(resolve => setTimeout(resolve, delay));

    switch (broker) {
      case "zerodha":
        await this.connectZerodha(config);
        break;
      case "upstox":
        await this.connectUpstox(config);
        break;
      case "angel":
        await this.connectAngel(config);
        break;
    }

    // Re-subscribe to previous instruments
    const subs = this.subscriptions.get(broker);
    if (subs && subs.size > 0) {
      this.subscribe(broker, Array.from(subs));
    }
  }

  /**
   * Check if connected to broker
   */
  isConnected(broker: string): boolean {
    const ws = this.connections.get(broker);
    return ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection status for all brokers
   */
  getStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    const entries = Array.from(this.connections.entries());
    for (const [broker, ws] of entries) {
      status[broker] = ws.readyState === WebSocket.OPEN;
    }
    return status;
  }
}

export const brokerWebSocket = new BrokerWebSocketManager();
