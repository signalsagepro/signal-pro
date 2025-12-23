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
  private latestTicks: Map<string, TickData> = new Map();
  private brokerConfigs: Map<string, BrokerWebSocketConfig> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  private readonly MAX_RECONNECT_ATTEMPTS = 10;  // Increased for long-running scenarios
  private readonly RECONNECT_DELAY = 5000;
  private readonly HEALTH_CHECK_INTERVAL = 60000; // Check every minute

  /**
   * Connect to Zerodha Kite WebSocket
   * Documentation: https://kite.trade/docs/connect/v3/websocket/
   */
  async connectZerodha(config: BrokerWebSocketConfig): Promise<boolean> {
    const wsUrl = `wss://ws.kite.trade?api_key=${config.apiKey}&access_token=${config.accessToken}`;
    console.log("[Zerodha WS] Attempting connection to:", wsUrl.replace(config.accessToken, '***TOKEN***'));
    
    // Store config for reconnection
    this.brokerConfigs.set("zerodha", config);
    
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(wsUrl);
        
        // Set a timeout for connection
        const connectionTimeout = setTimeout(() => {
          console.error("[Zerodha WS] Connection timeout after 10 seconds");
          ws.terminate();
          resolve(false);
        }, 10000);
        
        ws.on("open", () => {
          clearTimeout(connectionTimeout);
          console.log("[Zerodha WS] ✅ Connected successfully");
          this.connections.set("zerodha", ws);
          this.reconnectAttempts.set("zerodha", 0);
          this.emit("connected", { broker: "zerodha" });
          this.startHealthCheck();
          resolve(true);
        });

        ws.on("message", (data: Buffer) => {
          console.log("[Zerodha WS] Received message, length:", data.length);
          this.handleZerodhaMessage(data);
        });

        ws.on("close", (code, reason) => {
          clearTimeout(connectionTimeout);
          const reasonStr = reason.toString();
          console.log("[Zerodha WS] Disconnected with code:", code, "reason:", reasonStr);
          this.connections.delete("zerodha");
          this.emit("disconnected", { broker: "zerodha" });
          
          // Check if disconnection is due to authentication/token issues
          // Zerodha close codes: 403 = invalid token, 1006 = abnormal closure (often auth)
          if (code === 403 || (code === 1006 && reasonStr.toLowerCase().includes('auth'))) {
            console.error("[Zerodha WS] ❌ Token expired or invalid - stopping reconnection");
            this.emit("token_expired", { broker: "zerodha" });
            this.brokerConfigs.delete("zerodha");
            return;
          }
          
          this.attemptReconnect("zerodha", config);
        });

        ws.on("error", (error) => {
          clearTimeout(connectionTimeout);
          console.error("[Zerodha WS] ❌ Connection error:", error.message);
          console.error("[Zerodha WS] Error details:", error);
          
          // Check if error is related to authentication/token
          const errorMsg = error.message.toLowerCase();
          if (errorMsg.includes('401') || errorMsg.includes('403') || 
              errorMsg.includes('unauthorized') || errorMsg.includes('invalid token') ||
              errorMsg.includes('token expired')) {
            console.error("[Zerodha WS] ❌ Authentication failed - token may be expired");
            this.emit("token_expired", { broker: "zerodha" });
            this.brokerConfigs.delete("zerodha");
          }
          
          this.emit("error", { broker: "zerodha", error: error.message });
          resolve(false);
        });

      } catch (error) {
        console.error("[Zerodha WS] ❌ Exception during connection:", error);
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
   * Zerodha binary packet structure (Full mode - 44 bytes for stocks):
   * Bytes 0-3: Instrument token (int32)
   * Bytes 4-7: Last traded price (int32, divide by 100)
   * Bytes 8-11: Last traded quantity (int32)
   * Bytes 12-15: Average traded price (int32, divide by 100)
   * Bytes 16-19: Volume traded today (int32)
   * Bytes 20-23: Total buy quantity (int32)
   * Bytes 24-27: Total sell quantity (int32)
   * Bytes 28-31: Open price (int32, divide by 100)
   * Bytes 32-35: High price (int32, divide by 100)
   * Bytes 36-39: Low price (int32, divide by 100)
   * Bytes 40-43: Close price (int32, divide by 100)
   * Bytes 44-47: Last trade time (Unix timestamp)
   * Bytes 48-51: OI (int32)
   * Bytes 52-55: OI day high (int32)
   * Bytes 56-59: OI day low (int32)
   * Bytes 60-63: Exchange timestamp (Unix timestamp in seconds)
   */
  private parseZerodhaTick(packet: Buffer): TickData | null {
    if (packet.length < 8) return null;

    try {
      const instrumentToken = packet.readInt32BE(0);
      const lastPrice = packet.readInt32BE(4) / 100;

      // Full mode packet (44+ bytes for stocks/futures)
      if (packet.length >= 44) {
        // Extract exchange timestamp if available (bytes 60-63 for full mode with depth)
        // For 44-byte packets, use last trade time at bytes 44-47 if available
        let exchangeTimestamp: Date;
        
        if (packet.length >= 64) {
          // Full mode with market depth - exchange timestamp at bytes 60-63
          const unixTimestamp = packet.readUInt32BE(60);
          exchangeTimestamp = new Date(unixTimestamp * 1000);
        } else if (packet.length >= 48) {
          // Full mode - last trade time at bytes 44-47
          const unixTimestamp = packet.readUInt32BE(44);
          exchangeTimestamp = new Date(unixTimestamp * 1000);
        } else {
          exchangeTimestamp = new Date();
        }

        // Validate timestamp - if it seems invalid, use current time
        if (isNaN(exchangeTimestamp.getTime()) || exchangeTimestamp.getFullYear() < 2020) {
          exchangeTimestamp = new Date();
        }

        const open = packet.readInt32BE(28) / 100;
        const high = packet.readInt32BE(32) / 100;
        const low = packet.readInt32BE(36) / 100;
        const close = packet.readInt32BE(40) / 100;
        const volume = packet.readInt32BE(16);

        return {
          symbol: `TOKEN_${instrumentToken}`,
          instrumentToken,
          lastPrice,
          high: high > 0 ? high : lastPrice,
          low: low > 0 ? low : lastPrice,
          open: open > 0 ? open : lastPrice,
          close: close > 0 ? close : lastPrice,
          volume,
          change: lastPrice - close,
          changePercent: close > 0 ? ((lastPrice - close) / close) * 100 : 0,
          timestamp: exchangeTimestamp,
        };
      }

      // Quote mode (28 bytes) or LTP mode (8 bytes)
      if (packet.length >= 28) {
        const open = packet.readInt32BE(16) / 100;
        const high = packet.readInt32BE(20) / 100;
        const low = packet.readInt32BE(24) / 100;
        
        return {
          symbol: `TOKEN_${instrumentToken}`,
          instrumentToken,
          lastPrice,
          high: high > 0 ? high : lastPrice,
          low: low > 0 ? low : lastPrice,
          open: open > 0 ? open : lastPrice,
          close: lastPrice,
          volume: packet.readInt32BE(8),
          change: 0,
          changePercent: 0,
          timestamp: new Date(), // Quote mode doesn't include timestamp
        };
      }

      // LTP mode (8 bytes) - minimal data
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
        timestamp: new Date(), // LTP mode doesn't include timestamp
      };
    } catch (error) {
      console.error("[Zerodha WS] Error parsing tick packet:", error);
      return null;
    }
  }

  /**
   * Connect to Upstox WebSocket
   * Documentation: https://upstox.com/developer/api-documentation/websocket/
   */
  async connectUpstox(config: BrokerWebSocketConfig): Promise<boolean> {
    // Store config for reconnection
    this.brokerConfigs.set("upstox", config);
    
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
    // Store config for reconnection
    this.brokerConfigs.set("angel", config);
    
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
    
    // Store latest tick for live price display
    this.latestTicks.set(key, tick);
    
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
        // First subscribe to tokens
        subscribeMessage = JSON.stringify({
          a: "subscribe",
          v: instrumentTokens,
        });
        ws.send(subscribeMessage);
        
        // Then set mode to "full" for complete tick data with OHLC and timestamps
        // Modes: "ltp" (8 bytes), "quote" (28 bytes), "full" (44+ bytes with timestamp)
        const modeMessage = JSON.stringify({
          a: "mode",
          v: ["full", instrumentTokens],
        });
        ws.send(modeMessage);
        
        console.log(`[Zerodha WS] Subscribed to ${instrumentTokens.length} instruments in FULL mode`);
        
        if (!this.subscriptions.has(broker)) {
          this.subscriptions.set(broker, new Set());
        }
        instrumentTokens.forEach(t => this.subscriptions.get(broker)!.add(t));
        return true;

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
    console.log("[BrokerWS] getStatus - connections count:", this.connections.size);
    for (const [broker, ws] of entries) {
      const isOpen = ws.readyState === WebSocket.OPEN;
      console.log(`[BrokerWS] getStatus - ${broker}: readyState=${ws.readyState}, OPEN=${WebSocket.OPEN}, isOpen=${isOpen}`);
      status[broker] = isOpen;
    }
    return status;
  }

  /**
   * Get latest tick data for an instrument
   */
  getLatestTick(broker: string, symbol: string): TickData | null {
    const key = `${broker}:${symbol}`;
    return this.latestTicks.get(key) || null;
  }

  /**
   * Get all latest ticks
   */
  getAllLatestTicks(): Map<string, TickData> {
    return this.latestTicks;
  }

  /**
   * Start periodic health check for all broker connections
   * This ensures connections stay alive and reconnect if dropped
   */
  private startHealthCheck() {
    if (this.healthCheckInterval) {
      return; // Already running
    }

    console.log("[BrokerWS] Starting health check (every 60 seconds)");
    
    this.healthCheckInterval = setInterval(async () => {
      const brokers = Array.from(this.brokerConfigs.keys());
      
      for (const broker of brokers) {
        const ws = this.connections.get(broker);
        const config = this.brokerConfigs.get(broker);
        
        if (!config) continue;
        
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          console.log(`[BrokerWS] Health check: ${broker} disconnected, attempting reconnect...`);
          
          // Reset reconnect attempts for health check reconnection
          this.reconnectAttempts.set(broker, 0);
          
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
          
          // Re-subscribe to instruments after reconnection
          const subs = this.subscriptions.get(broker);
          if (subs && subs.size > 0) {
            this.subscribe(broker, Array.from(subs));
          }
        } else {
          console.log(`[BrokerWS] Health check: ${broker} connected ✓`);
        }
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop health check interval
   */
  private stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log("[BrokerWS] Health check stopped");
    }
  }
}

export const brokerWebSocket = new BrokerWebSocketManager();
