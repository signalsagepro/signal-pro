import type { BrokerConfig } from "@shared/schema";

export interface BrokerCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken?: string;
  userId?: string;
  totp?: string;
}

export interface BrokerConnectionResult {
  success: boolean;
  message: string;
  accessToken?: string;
  userId?: string;
  expiresAt?: Date;
}

export interface MarketQuote {
  symbol: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

export interface OrderRequest {
  symbol: string;
  exchange: string;
  transactionType: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "SL" | "SL-M";
  quantity: number;
  price?: number;
  triggerPrice?: number;
  product?: "CNC" | "MIS" | "NRML";
}

export interface OrderResponse {
  success: boolean;
  orderId?: string;
  message: string;
  status?: string;
}

export interface IBrokerAdapter {
  name: string;
  type: "indian" | "forex";
  
  connect(credentials: BrokerCredentials): Promise<BrokerConnectionResult>;
  disconnect(): Promise<boolean>;
  testConnection(): Promise<boolean>;
  
  getQuote(symbol: string, exchange?: string): Promise<MarketQuote | null>;
  getQuotes(symbols: string[], exchange?: string): Promise<MarketQuote[]>;
  
  placeOrder(order: OrderRequest): Promise<OrderResponse>;
  cancelOrder(orderId: string): Promise<boolean>;
  getOrderStatus(orderId: string): Promise<OrderResponse>;
}

/**
 * Zerodha Kite Connect Adapter
 * API Documentation: https://kite.trade/docs/connect/v3/
 */
export class ZerodhaAdapter implements IBrokerAdapter {
  name = "zerodha";
  type: "indian" = "indian";
  
  private apiKey: string = "";
  private accessToken: string = "";
  private baseUrl = "https://api.kite.trade";

  async connect(credentials: BrokerCredentials): Promise<BrokerConnectionResult> {
    try {
      this.apiKey = credentials.apiKey;
      
      // Step 1: Generate login URL for user to authenticate
      // In production, user would be redirected to Zerodha login page
      // After login, Zerodha redirects back with a request_token
      
      if (!credentials.accessToken) {
        // If no access token, need to generate session
        // This requires the request_token from OAuth flow
        return {
          success: false,
          message: "Please complete OAuth login flow. Redirect user to: " +
            `https://kite.zerodha.com/connect/login?v=3&api_key=${this.apiKey}`,
        };
      }

      this.accessToken = credentials.accessToken;

      // Validate the session
      const response = await fetch(`${this.baseUrl}/user/profile`, {
        headers: {
          "X-Kite-Version": "3",
          "Authorization": `token ${this.apiKey}:${this.accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          message: "Connected to Zerodha successfully",
          accessToken: this.accessToken,
          userId: data.data?.user_id,
        };
      } else {
        const error = await response.json();
        return {
          success: false,
          message: error.message || "Failed to connect to Zerodha",
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Zerodha connection error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  async disconnect(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/session/token`, {
        method: "DELETE",
        headers: {
          "X-Kite-Version": "3",
          "Authorization": `token ${this.apiKey}:${this.accessToken}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/user/profile`, {
        headers: {
          "X-Kite-Version": "3",
          "Authorization": `token ${this.apiKey}:${this.accessToken}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getQuote(symbol: string, exchange: string = "NSE"): Promise<MarketQuote | null> {
    try {
      const instrument = `${exchange}:${symbol}`;
      const response = await fetch(`${this.baseUrl}/quote?i=${instrument}`, {
        headers: {
          "X-Kite-Version": "3",
          "Authorization": `token ${this.apiKey}:${this.accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const quote = data.data?.[instrument];
        if (quote) {
          return {
            symbol,
            lastPrice: quote.last_price,
            open: quote.ohlc.open,
            high: quote.ohlc.high,
            low: quote.ohlc.low,
            close: quote.ohlc.close,
            volume: quote.volume,
            timestamp: new Date(quote.timestamp),
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async getQuotes(symbols: string[], exchange: string = "NSE"): Promise<MarketQuote[]> {
    const quotes: MarketQuote[] = [];
    for (const symbol of symbols) {
      const quote = await this.getQuote(symbol, exchange);
      if (quote) quotes.push(quote);
    }
    return quotes;
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/orders/regular`, {
        method: "POST",
        headers: {
          "X-Kite-Version": "3",
          "Authorization": `token ${this.apiKey}:${this.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          tradingsymbol: order.symbol,
          exchange: order.exchange,
          transaction_type: order.transactionType,
          order_type: order.orderType,
          quantity: order.quantity.toString(),
          product: order.product || "CNC",
          ...(order.price && { price: order.price.toString() }),
          ...(order.triggerPrice && { trigger_price: order.triggerPrice.toString() }),
        }),
      });

      const data = await response.json();
      if (response.ok) {
        return {
          success: true,
          orderId: data.data?.order_id,
          message: "Order placed successfully",
          status: "OPEN",
        };
      } else {
        return {
          success: false,
          message: data.message || "Order placement failed",
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Order error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/orders/regular/${orderId}`, {
        method: "DELETE",
        headers: {
          "X-Kite-Version": "3",
          "Authorization": `token ${this.apiKey}:${this.accessToken}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getOrderStatus(orderId: string): Promise<OrderResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/orders/${orderId}`, {
        headers: {
          "X-Kite-Version": "3",
          "Authorization": `token ${this.apiKey}:${this.accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          orderId,
          message: "Order status retrieved",
          status: data.data?.[0]?.status,
        };
      }
      return { success: false, message: "Failed to get order status" };
    } catch {
      return { success: false, message: "Error getting order status" };
    }
  }
}

/**
 * Upstox API Adapter
 * API Documentation: https://upstox.com/developer/api-documentation/
 */
export class UpstoxAdapter implements IBrokerAdapter {
  name = "upstox";
  type: "indian" = "indian";
  
  private apiKey: string = "";
  private accessToken: string = "";
  private baseUrl = "https://api.upstox.com/v2";

  async connect(credentials: BrokerCredentials): Promise<BrokerConnectionResult> {
    try {
      this.apiKey = credentials.apiKey;
      
      if (!credentials.accessToken) {
        return {
          success: false,
          message: "Please complete OAuth login flow. Redirect user to Upstox login page.",
        };
      }

      this.accessToken = credentials.accessToken;

      const response = await fetch(`${this.baseUrl}/user/profile`, {
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Accept": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          message: "Connected to Upstox successfully",
          accessToken: this.accessToken,
          userId: data.data?.user_id,
        };
      } else {
        return { success: false, message: "Failed to connect to Upstox" };
      }
    } catch (error) {
      return {
        success: false,
        message: `Upstox connection error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  async disconnect(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/logout`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${this.accessToken}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/user/profile`, {
        headers: { "Authorization": `Bearer ${this.accessToken}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getQuote(symbol: string, exchange: string = "NSE_EQ"): Promise<MarketQuote | null> {
    try {
      const instrumentKey = `${exchange}|${symbol}`;
      const response = await fetch(
        `${this.baseUrl}/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKey)}`,
        { headers: { "Authorization": `Bearer ${this.accessToken}` } }
      );

      if (response.ok) {
        const data = await response.json();
        const quote = data.data?.[instrumentKey];
        if (quote) {
          return {
            symbol,
            lastPrice: quote.last_price,
            open: quote.ohlc.open,
            high: quote.ohlc.high,
            low: quote.ohlc.low,
            close: quote.ohlc.close,
            volume: quote.volume,
            timestamp: new Date(),
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async getQuotes(symbols: string[], exchange: string = "NSE_EQ"): Promise<MarketQuote[]> {
    const quotes: MarketQuote[] = [];
    for (const symbol of symbols) {
      const quote = await this.getQuote(symbol, exchange);
      if (quote) quotes.push(quote);
    }
    return quotes;
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/order/place`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instrument_token: `${order.exchange}|${order.symbol}`,
          transaction_type: order.transactionType,
          order_type: order.orderType,
          quantity: order.quantity,
          product: order.product || "D",
          price: order.price || 0,
          trigger_price: order.triggerPrice || 0,
        }),
      });

      const data = await response.json();
      return {
        success: response.ok,
        orderId: data.data?.order_id,
        message: response.ok ? "Order placed successfully" : data.message,
      };
    } catch (error) {
      return { success: false, message: `Order error: ${error}` };
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/order/cancel?order_id=${orderId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${this.accessToken}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getOrderStatus(orderId: string): Promise<OrderResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/order/details?order_id=${orderId}`, {
        headers: { "Authorization": `Bearer ${this.accessToken}` },
      });
      const data = await response.json();
      return {
        success: response.ok,
        orderId,
        message: "Order status retrieved",
        status: data.data?.status,
      };
    } catch {
      return { success: false, message: "Error getting order status" };
    }
  }
}

/**
 * Angel One (Angel Broking) Smart API Adapter
 * API Documentation: https://smartapi.angelbroking.com/docs
 */
export class AngelOneAdapter implements IBrokerAdapter {
  name = "angel";
  type: "indian" = "indian";
  
  private apiKey: string = "";
  private accessToken: string = "";
  private baseUrl = "https://apiconnect.angelbroking.com";

  async connect(credentials: BrokerCredentials): Promise<BrokerConnectionResult> {
    try {
      this.apiKey = credentials.apiKey;

      const response = await fetch(`${this.baseUrl}/rest/auth/angelbroking/user/v1/loginByPassword`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-UserType": "USER",
          "X-SourceID": "WEB",
          "X-ClientLocalIP": "127.0.0.1",
          "X-ClientPublicIP": "127.0.0.1",
          "X-MACAddress": "00:00:00:00:00:00",
          "X-PrivateKey": this.apiKey,
        },
        body: JSON.stringify({
          clientcode: credentials.userId,
          password: credentials.apiSecret,
          totp: credentials.totp,
        }),
      });

      const data = await response.json();
      if (data.status && data.data?.jwtToken) {
        this.accessToken = data.data.jwtToken;
        return {
          success: true,
          message: "Connected to Angel One successfully",
          accessToken: this.accessToken,
          userId: credentials.userId,
        };
      }
      return { success: false, message: data.message || "Login failed" };
    } catch (error) {
      return { success: false, message: `Angel connection error: ${error}` };
    }
  }

  async disconnect(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/rest/secure/angelbroking/user/v1/logout`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "X-PrivateKey": this.apiKey,
        },
        body: JSON.stringify({ clientcode: "" }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/rest/secure/angelbroking/user/v1/getProfile`, {
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "X-PrivateKey": this.apiKey,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getQuote(symbol: string): Promise<MarketQuote | null> {
    try {
      const response = await fetch(`${this.baseUrl}/rest/secure/angelbroking/market/v1/quote`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "X-PrivateKey": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "FULL",
          exchangeTokens: { NSE: [symbol] },
        }),
      });

      const data = await response.json();
      const quote = data.data?.fetched?.[0];
      if (quote) {
        return {
          symbol,
          lastPrice: quote.ltp,
          open: quote.open,
          high: quote.high,
          low: quote.low,
          close: quote.close,
          volume: quote.tradeVolume,
          timestamp: new Date(),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async getQuotes(symbols: string[]): Promise<MarketQuote[]> {
    const quotes: MarketQuote[] = [];
    for (const symbol of symbols) {
      const quote = await this.getQuote(symbol);
      if (quote) quotes.push(quote);
    }
    return quotes;
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/rest/secure/angelbroking/order/v1/placeOrder`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "X-PrivateKey": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          variety: "NORMAL",
          tradingsymbol: order.symbol,
          symboltoken: "",
          transactiontype: order.transactionType,
          exchange: order.exchange,
          ordertype: order.orderType,
          producttype: order.product || "DELIVERY",
          quantity: order.quantity.toString(),
          price: order.price?.toString() || "0",
          triggerprice: order.triggerPrice?.toString() || "0",
        }),
      });

      const data = await response.json();
      return {
        success: data.status,
        orderId: data.data?.orderid,
        message: data.message || (data.status ? "Order placed" : "Order failed"),
      };
    } catch (error) {
      return { success: false, message: `Order error: ${error}` };
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/rest/secure/angelbroking/order/v1/cancelOrder`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "X-PrivateKey": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ variety: "NORMAL", orderid: orderId }),
      });
      const data = await response.json();
      return data.status;
    } catch {
      return false;
    }
  }

  async getOrderStatus(orderId: string): Promise<OrderResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/rest/secure/angelbroking/order/v1/details/${orderId}`, {
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "X-PrivateKey": this.apiKey,
        },
      });
      const data = await response.json();
      return {
        success: data.status,
        orderId,
        status: data.data?.status,
        message: "Order status retrieved",
      };
    } catch {
      return { success: false, message: "Error getting order status" };
    }
  }
}

/**
 * OANDA Forex Broker Adapter
 * API Documentation: https://developer.oanda.com/rest-live-v20/introduction/
 */
export class OANDAAdapter implements IBrokerAdapter {
  name = "oanda";
  type: "forex" = "forex";
  
  private apiKey: string = "";
  private accountId: string = "";
  private baseUrl = "https://api-fxtrade.oanda.com/v3"; // Use api-fxpractice.oanda.com for practice

  async connect(credentials: BrokerCredentials): Promise<BrokerConnectionResult> {
    try {
      this.apiKey = credentials.apiKey;
      this.accountId = credentials.userId || "";

      const response = await fetch(`${this.baseUrl}/accounts`, {
        headers: { "Authorization": `Bearer ${this.apiKey}` },
      });

      if (response.ok) {
        const data = await response.json();
        const account = data.accounts?.[0];
        if (account) {
          this.accountId = this.accountId || account.id;
          return {
            success: true,
            message: "Connected to OANDA successfully",
            userId: this.accountId,
          };
        }
      }
      return { success: false, message: "Failed to connect to OANDA" };
    } catch (error) {
      return { success: false, message: `OANDA connection error: ${error}` };
    }
  }

  async disconnect(): Promise<boolean> {
    this.apiKey = "";
    this.accountId = "";
    return true;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/accounts/${this.accountId}/summary`, {
        headers: { "Authorization": `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getQuote(symbol: string): Promise<MarketQuote | null> {
    try {
      const instrument = symbol.replace("/", "_");
      const response = await fetch(
        `${this.baseUrl}/accounts/${this.accountId}/pricing?instruments=${instrument}`,
        { headers: { "Authorization": `Bearer ${this.apiKey}` } }
      );

      if (response.ok) {
        const data = await response.json();
        const price = data.prices?.[0];
        if (price) {
          const bid = parseFloat(price.bids?.[0]?.price || "0");
          const ask = parseFloat(price.asks?.[0]?.price || "0");
          const mid = (bid + ask) / 2;
          return {
            symbol,
            lastPrice: mid,
            open: mid,
            high: mid,
            low: mid,
            close: mid,
            volume: 0,
            timestamp: new Date(price.time),
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async getQuotes(symbols: string[]): Promise<MarketQuote[]> {
    const quotes: MarketQuote[] = [];
    for (const symbol of symbols) {
      const quote = await this.getQuote(symbol);
      if (quote) quotes.push(quote);
    }
    return quotes;
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    try {
      const instrument = order.symbol.replace("/", "_");
      const units = order.transactionType === "BUY" ? order.quantity : -order.quantity;

      const orderData: any = {
        order: {
          instrument,
          units: units.toString(),
          type: order.orderType === "MARKET" ? "MARKET" : "LIMIT",
          timeInForce: order.orderType === "MARKET" ? "FOK" : "GTC",
        },
      };

      if (order.orderType === "LIMIT" && order.price) {
        orderData.order.price = order.price.toString();
      }

      const response = await fetch(`${this.baseUrl}/accounts/${this.accountId}/orders`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderData),
      });

      const data = await response.json();
      if (response.ok) {
        return {
          success: true,
          orderId: data.orderCreateTransaction?.id || data.orderFillTransaction?.id,
          message: "Order placed successfully",
          status: data.orderFillTransaction ? "FILLED" : "PENDING",
        };
      }
      return { success: false, message: data.errorMessage || "Order failed" };
    } catch (error) {
      return { success: false, message: `Order error: ${error}` };
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/accounts/${this.accountId}/orders/${orderId}/cancel`,
        {
          method: "PUT",
          headers: { "Authorization": `Bearer ${this.apiKey}` },
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async getOrderStatus(orderId: string): Promise<OrderResponse> {
    try {
      const response = await fetch(
        `${this.baseUrl}/accounts/${this.accountId}/orders/${orderId}`,
        { headers: { "Authorization": `Bearer ${this.apiKey}` } }
      );
      const data = await response.json();
      return {
        success: response.ok,
        orderId,
        status: data.order?.state,
        message: "Order status retrieved",
      };
    } catch {
      return { success: false, message: "Error getting order status" };
    }
  }
}

/**
 * Interactive Brokers Adapter (via Client Portal API)
 * API Documentation: https://interactivebrokers.github.io/cpwebapi/
 */
export class InteractiveBrokersAdapter implements IBrokerAdapter {
  name = "ib";
  type: "forex" = "forex";
  
  private baseUrl = "https://localhost:5000/v1/api"; // IB Gateway runs locally

  async connect(credentials: BrokerCredentials): Promise<BrokerConnectionResult> {
    try {
      // IB uses session-based auth via their gateway
      const response = await fetch(`${this.baseUrl}/iserver/auth/status`, {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.authenticated) {
          return { success: true, message: "Connected to Interactive Brokers" };
        }
      }
      return {
        success: false,
        message: "Please authenticate via IB Gateway web interface at https://localhost:5000",
      };
    } catch (error) {
      return {
        success: false,
        message: "IB Gateway not running. Please start the IB Gateway application.",
      };
    }
  }

  async disconnect(): Promise<boolean> {
    try {
      await fetch(`${this.baseUrl}/logout`, { method: "POST" });
      return true;
    } catch {
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/iserver/auth/status`, {
        method: "POST",
      });
      const data = await response.json();
      return data.authenticated === true;
    } catch {
      return false;
    }
  }

  async getQuote(symbol: string): Promise<MarketQuote | null> {
    try {
      // First, search for the contract
      const searchResponse = await fetch(
        `${this.baseUrl}/iserver/secdef/search?symbol=${symbol}`
      );
      const contracts = await searchResponse.json();
      const conid = contracts?.[0]?.conid;

      if (!conid) return null;

      const response = await fetch(
        `${this.baseUrl}/iserver/marketdata/snapshot?conids=${conid}&fields=31,84,85,86,87,88`
      );
      const data = await response.json();
      const quote = data?.[0];

      if (quote) {
        return {
          symbol,
          lastPrice: quote["31"] || 0,
          open: quote["84"] || 0,
          high: quote["85"] || 0,
          low: quote["86"] || 0,
          close: quote["87"] || 0,
          volume: quote["88"] || 0,
          timestamp: new Date(),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async getQuotes(symbols: string[]): Promise<MarketQuote[]> {
    const quotes: MarketQuote[] = [];
    for (const symbol of symbols) {
      const quote = await this.getQuote(symbol);
      if (quote) quotes.push(quote);
    }
    return quotes;
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    try {
      // Search for contract ID first
      const searchResponse = await fetch(
        `${this.baseUrl}/iserver/secdef/search?symbol=${order.symbol}`
      );
      const contracts = await searchResponse.json();
      const conid = contracts?.[0]?.conid;

      if (!conid) {
        return { success: false, message: "Contract not found" };
      }

      const response = await fetch(`${this.baseUrl}/iserver/account/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orders: [{
            conid,
            orderType: order.orderType === "MARKET" ? "MKT" : "LMT",
            side: order.transactionType,
            quantity: order.quantity,
            price: order.price,
            tif: "DAY",
          }],
        }),
      });

      const data = await response.json();
      return {
        success: !data.error,
        orderId: data?.[0]?.order_id,
        message: data.error || "Order submitted",
      };
    } catch (error) {
      return { success: false, message: `Order error: ${error}` };
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/iserver/account/order/${orderId}`,
        { method: "DELETE" }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async getOrderStatus(orderId: string): Promise<OrderResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/iserver/account/orders`);
      const orders = await response.json();
      const order = orders?.find((o: any) => o.orderId === orderId);
      return {
        success: !!order,
        orderId,
        status: order?.status,
        message: order ? "Order found" : "Order not found",
      };
    } catch {
      return { success: false, message: "Error getting order status" };
    }
  }
}

/**
 * FXCM Forex Broker Adapter
 * API Documentation: https://fxcm.github.io/rest-api-docs/
 */
export class FXCMAdapter implements IBrokerAdapter {
  name = "fxcm";
  type: "forex" = "forex";
  
  private accessToken: string = "";
  private baseUrl = "https://api-demo.fxcm.com"; // Use https://api.fxcm.com for live

  async connect(credentials: BrokerCredentials): Promise<BrokerConnectionResult> {
    try {
      this.accessToken = credentials.apiKey;

      const response = await fetch(`${this.baseUrl}/trading/get_model/?models=Account`, {
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Accept": "application/json",
        },
      });

      if (response.ok) {
        return { success: true, message: "Connected to FXCM successfully" };
      }
      return { success: false, message: "Failed to connect to FXCM" };
    } catch (error) {
      return { success: false, message: `FXCM connection error: ${error}` };
    }
  }

  async disconnect(): Promise<boolean> {
    this.accessToken = "";
    return true;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/trading/get_model/?models=Account`, {
        headers: { "Authorization": `Bearer ${this.accessToken}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getQuote(symbol: string): Promise<MarketQuote | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/trading/get_model/?models=Offer&instrument=${symbol}`,
        { headers: { "Authorization": `Bearer ${this.accessToken}` } }
      );

      if (response.ok) {
        const data = await response.json();
        const offer = data.offers?.[0];
        if (offer) {
          return {
            symbol,
            lastPrice: (offer.bid + offer.ask) / 2,
            open: offer.open || 0,
            high: offer.high || 0,
            low: offer.low || 0,
            close: offer.close || 0,
            volume: 0,
            timestamp: new Date(),
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async getQuotes(symbols: string[]): Promise<MarketQuote[]> {
    const quotes: MarketQuote[] = [];
    for (const symbol of symbols) {
      const quote = await this.getQuote(symbol);
      if (quote) quotes.push(quote);
    }
    return quotes;
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/trading/open_trade`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          symbol: order.symbol,
          is_buy: order.transactionType === "BUY" ? "true" : "false",
          amount: order.quantity.toString(),
          at_market: order.orderType === "MARKET" ? "0" : "1",
          order_type: order.orderType === "MARKET" ? "AtMarket" : "Limit",
          ...(order.price && { rate: order.price.toString() }),
        }),
      });

      const data = await response.json();
      return {
        success: data.executed,
        orderId: data.data?.orderId,
        message: data.executed ? "Order placed" : "Order failed",
      };
    } catch (error) {
      return { success: false, message: `Order error: ${error}` };
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/trading/delete_order`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ order_id: orderId }),
      });
      const data = await response.json();
      return data.executed;
    } catch {
      return false;
    }
  }

  async getOrderStatus(orderId: string): Promise<OrderResponse> {
    try {
      const response = await fetch(
        `${this.baseUrl}/trading/get_model/?models=Order`,
        { headers: { "Authorization": `Bearer ${this.accessToken}` } }
      );
      const data = await response.json();
      const order = data.orders?.find((o: any) => o.orderId === orderId);
      return {
        success: !!order,
        orderId,
        status: order?.status,
        message: order ? "Order found" : "Order not found",
      };
    } catch {
      return { success: false, message: "Error getting order status" };
    }
  }
}

/**
 * Broker Service - Factory and Manager for broker adapters
 */
export class BrokerService {
  private adapters: Map<string, IBrokerAdapter> = new Map();

  constructor() {
    // Initialize all broker adapters
    this.adapters.set("zerodha", new ZerodhaAdapter());
    this.adapters.set("upstox", new UpstoxAdapter());
    this.adapters.set("angel", new AngelOneAdapter());
    this.adapters.set("oanda", new OANDAAdapter());
    this.adapters.set("ib", new InteractiveBrokersAdapter());
    this.adapters.set("fxcm", new FXCMAdapter());
  }

  getAdapter(brokerName: string): IBrokerAdapter | undefined {
    return this.adapters.get(brokerName.toLowerCase());
  }

  async connectBroker(config: BrokerConfig): Promise<BrokerConnectionResult> {
    const adapter = this.getAdapter(config.name);
    if (!adapter) {
      return { success: false, message: `Unknown broker: ${config.name}` };
    }

    if (!config.apiKey) {
      return { success: false, message: "API key is required" };
    }

    return adapter.connect({
      apiKey: config.apiKey,
      apiSecret: config.apiSecret || "",
      accessToken: (config.metadata as any)?.accessToken,
      userId: (config.metadata as any)?.userId,
      totp: (config.metadata as any)?.totp,
    });
  }

  async testConnection(config: BrokerConfig): Promise<boolean> {
    const adapter = this.getAdapter(config.name);
    if (!adapter) return false;

    // First connect, then test
    const connectResult = await this.connectBroker(config);
    if (!connectResult.success) return false;

    return adapter.testConnection();
  }

  async getQuote(brokerName: string, symbol: string, exchange?: string): Promise<MarketQuote | null> {
    const adapter = this.getAdapter(brokerName);
    if (!adapter) return null;
    return adapter.getQuote(symbol, exchange);
  }

  async placeOrder(brokerName: string, order: OrderRequest): Promise<OrderResponse> {
    const adapter = this.getAdapter(brokerName);
    if (!adapter) {
      return { success: false, message: `Unknown broker: ${brokerName}` };
    }
    return adapter.placeOrder(order);
  }

  getSupportedBrokers(): { name: string; type: "indian" | "forex" }[] {
    return Array.from(this.adapters.entries()).map(([name, adapter]) => ({
      name,
      type: adapter.type,
    }));
  }
}

export const brokerService = new BrokerService();
