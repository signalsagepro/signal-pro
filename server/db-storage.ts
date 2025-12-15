import { eq, desc, and } from "drizzle-orm";
import { db } from "./db";
import {
  assets,
  strategies,
  signals,
  brokerConfigs,
  notificationConfigs,
  candleData,
  users,
  logs,
  dashboardConfigs,
  type Asset,
  type InsertAsset,
  type Strategy,
  type InsertStrategy,
  type Signal,
  type InsertSignal,
  type BrokerConfig,
  type InsertBrokerConfig,
  type NotificationConfig,
  type InsertNotificationConfig,
  type CandleData,
  type InsertCandleData,
  type User,
  type InsertUser,
  type Log,
  type InsertLog,
  type DashboardConfig,
  type InsertDashboardConfig,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { hashPassword, verifyPassword } from "./auth";
import { IStorage } from "./storage";

export interface IStorageWithLogs extends IStorage {
  // Log methods
  getLogs(limit?: number): Promise<Log[]>;
  getLogsByUser(userId: string): Promise<Log[]>;
  getLogsByEntity(entity: string, entityId?: string): Promise<Log[]>;
  createLog(log: InsertLog): Promise<Log>;
}

export class DatabaseStorage implements IStorageWithLogs {
  // ============ ASSETS ============
  async getAssets(): Promise<Asset[]> {
    return db.select().from(assets).orderBy(assets.symbol);
  }

  async getAsset(id: string): Promise<Asset | undefined> {
    const [asset] = await db.select().from(assets).where(eq(assets.id, id));
    return asset;
  }

  async createAsset(insertAsset: InsertAsset): Promise<Asset> {
    const [asset] = await db.insert(assets).values({
      ...insertAsset,
      id: randomUUID(),
    }).returning();
    return asset;
  }

  async updateAsset(id: string, data: Partial<Asset>): Promise<Asset | undefined> {
    const [updated] = await db.update(assets)
      .set(data)
      .where(eq(assets.id, id))
      .returning();
    return updated;
  }

  async deleteAsset(id: string): Promise<boolean> {
    const result = await db.delete(assets).where(eq(assets.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ============ STRATEGIES ============
  async getStrategies(): Promise<Strategy[]> {
    return db.select().from(strategies).orderBy(desc(strategies.createdAt));
  }

  async getStrategy(id: string): Promise<Strategy | undefined> {
    const [strategy] = await db.select().from(strategies).where(eq(strategies.id, id));
    return strategy;
  }

  async createStrategy(insertStrategy: InsertStrategy): Promise<Strategy> {
    const [strategy] = await db.insert(strategies).values({
      ...insertStrategy,
      id: randomUUID(),
      signalCount: 0,
    }).returning();
    return strategy;
  }

  async updateStrategy(id: string, data: Partial<Strategy>): Promise<Strategy | undefined> {
    const [updated] = await db.update(strategies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(strategies.id, id))
      .returning();
    return updated;
  }

  async deleteStrategy(id: string): Promise<boolean> {
    const result = await db.delete(strategies).where(eq(strategies.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async mergeStrategies(strategy1Id: string, strategy2Id: string, logic: "AND" | "OR", timeWindow?: number): Promise<Strategy | undefined> {
    const s1 = await this.getStrategy(strategy1Id);
    const s2 = await this.getStrategy(strategy2Id);
    
    if (!s1 || !s2) return undefined;

    const mergedName = `${s1.name} ${logic} ${s2.name}`;
    const mergedType = `merged_${logic.toLowerCase()}_${strategy1Id.slice(0, 8)}_${strategy2Id.slice(0, 8)}`;
    const mergedConditions = {
      logic,
      strategy1: s1.type,
      strategy1Conditions: s1.conditions,
      strategy2: s2.type,
      strategy2Conditions: s2.conditions,
    };

    const [mergedStrategy] = await db.insert(strategies).values({
      id: randomUUID(),
      name: mergedName,
      description: `Merged strategy: ${s1.name} ${logic} ${s2.name}`,
      type: mergedType,
      timeframe: s1.timeframe,
      enabled: true,
      conditions: mergedConditions,
      isCustom: true,
      signalCount: 0,
      mergeLogic: logic,
      mergeTimeWindow: timeWindow ?? 60,
      linkedStrategies: [strategy1Id, strategy2Id],
    }).returning();

    return mergedStrategy;
  }

  // ============ SIGNALS ============
  async getSignals(): Promise<Signal[]> {
    return db.select().from(signals).orderBy(desc(signals.createdAt));
  }

  async getSignal(id: string): Promise<Signal | undefined> {
    const [signal] = await db.select().from(signals).where(eq(signals.id, id));
    return signal;
  }

  async createSignal(insertSignal: InsertSignal): Promise<Signal> {
    const [signal] = await db.insert(signals).values({
      ...insertSignal,
      id: randomUUID(),
    }).returning();

    // Increment signal count for the strategy
    await db.update(strategies)
      .set({ signalCount: (await this.getStrategy(insertSignal.strategyId))?.signalCount ?? 0 + 1 })
      .where(eq(strategies.id, insertSignal.strategyId));

    return signal;
  }

  async updateSignal(id: string, data: Partial<Signal>): Promise<Signal | undefined> {
    const [updated] = await db.update(signals)
      .set(data)
      .where(eq(signals.id, id))
      .returning();
    return updated;
  }

  async deleteSignal(id: string): Promise<boolean> {
    const result = await db.delete(signals).where(eq(signals.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ============ BROKER CONFIGS ============
  async getBrokerConfigs(): Promise<BrokerConfig[]> {
    return db.select().from(brokerConfigs);
  }

  async getBrokerConfig(id: string): Promise<BrokerConfig | undefined> {
    const [config] = await db.select().from(brokerConfigs).where(eq(brokerConfigs.id, id));
    return config;
  }

  async createBrokerConfig(insertConfig: InsertBrokerConfig): Promise<BrokerConfig> {
    const [config] = await db.insert(brokerConfigs).values({
      ...insertConfig,
      id: randomUUID(),
      connected: false,
    }).returning();
    return config;
  }

  async updateBrokerConfig(id: string, data: Partial<BrokerConfig>): Promise<BrokerConfig | undefined> {
    const [updated] = await db.update(brokerConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(brokerConfigs.id, id))
      .returning();
    return updated;
  }

  async deleteBrokerConfig(id: string): Promise<boolean> {
    const result = await db.delete(brokerConfigs).where(eq(brokerConfigs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ============ NOTIFICATION CONFIGS ============
  async getNotificationConfigs(): Promise<NotificationConfig[]> {
    return db.select().from(notificationConfigs);
  }

  async getNotificationConfig(id: string): Promise<NotificationConfig | undefined> {
    const [config] = await db.select().from(notificationConfigs).where(eq(notificationConfigs.id, id));
    return config;
  }

  async createNotificationConfig(insertConfig: InsertNotificationConfig): Promise<NotificationConfig> {
    const [config] = await db.insert(notificationConfigs).values({
      ...insertConfig,
      id: randomUUID(),
    }).returning();
    return config;
  }

  async updateNotificationConfig(id: string, data: Partial<NotificationConfig>): Promise<NotificationConfig | undefined> {
    const [updated] = await db.update(notificationConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(notificationConfigs.id, id))
      .returning();
    return updated;
  }

  async deleteNotificationConfig(id: string): Promise<boolean> {
    const result = await db.delete(notificationConfigs).where(eq(notificationConfigs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ============ CANDLE DATA ============
  async getCandleData(assetId: string, timeframe: string): Promise<CandleData[]> {
    return db.select().from(candleData)
      .where(and(eq(candleData.assetId, assetId), eq(candleData.timeframe, timeframe)))
      .orderBy(candleData.timestamp);
  }

  async createCandleData(insertCandle: InsertCandleData): Promise<CandleData> {
    const [candle] = await db.insert(candleData).values({
      ...insertCandle,
      id: randomUUID(),
    }).returning();
    return candle;
  }

  // ============ USERS ============
  async getUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await hashPassword(insertUser.password);
    const [user] = await db.insert(users).values({
      ...insertUser,
      id: randomUUID(),
      password: hashedPassword,
      role: insertUser.role ?? "user",
    }).returning();
    return user;
  }

  async verifyUserPassword(email: string, password: string): Promise<User | undefined> {
    const user = await this.getUserByEmail(email);
    if (!user) return undefined;
    const isValid = await verifyPassword(password, user.password);
    return isValid ? user : undefined;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ============ LOGS ============
  async getLogs(limit: number = 100): Promise<Log[]> {
    return db.select().from(logs).orderBy(desc(logs.createdAt)).limit(limit);
  }

  async getLogsByUser(userId: string): Promise<Log[]> {
    return db.select().from(logs)
      .where(eq(logs.userId, userId))
      .orderBy(desc(logs.createdAt));
  }

  async getLogsByEntity(entity: string, entityId?: string): Promise<Log[]> {
    if (entityId) {
      return db.select().from(logs)
        .where(and(eq(logs.entity, entity), eq(logs.entityId, entityId)))
        .orderBy(desc(logs.createdAt));
    }
    return db.select().from(logs)
      .where(eq(logs.entity, entity))
      .orderBy(desc(logs.createdAt));
  }

  async createLog(log: InsertLog): Promise<Log> {
    const [newLog] = await db.insert(logs).values(log).returning();
    return newLog;
  }

  // ============ DASHBOARD CONFIG ============
  async getDashboardConfig(key: string = "global"): Promise<DashboardConfig | undefined> {
    try {
      console.log("[DB Storage] Getting dashboard config for key:", key);
      const [config] = await db.select().from(dashboardConfigs).where(eq(dashboardConfigs.key, key));
      console.log("[DB Storage] Dashboard config result:", !!config);
      return config;
    } catch (error) {
      console.error("[DB Storage] Error getting dashboard config:", error);
      throw error;
    }
  }

  async updateDashboardConfig(key: string, config: Record<string, any>): Promise<DashboardConfig> {
    const existing = await this.getDashboardConfig(key);
    
    if (existing) {
      const [updated] = await db
        .update(dashboardConfigs)
        .set({ 
          config,
          updatedAt: new Date(),
        })
        .where(eq(dashboardConfigs.key, key))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(dashboardConfigs)
        .values({ 
          key,
          config,
        })
        .returning();
      return created;
    }
  }

  // ============ INITIALIZATION ============
  async initializeDefaultData(): Promise<void> {
    // Check if data already exists
    const existingAssets = await this.getAssets();
    if (existingAssets.length > 0) {
      console.log("Database already initialized with data");
      return;
    }

    console.log("Initializing default data in database...");

    // Initialize broker configs
    const indianBrokers = ["zerodha", "upstox", "angel"];
    const forexBrokers = ["oanda", "ib", "fxcm"];

    for (const name of indianBrokers) {
      await this.createBrokerConfig({ name, type: "indian" });
    }

    for (const name of forexBrokers) {
      await this.createBrokerConfig({ name, type: "forex" });
    }

    // Initialize notification configs
    const notificationChannels = ["email", "sms", "webhook", "discord", "telegram"];
    for (const channel of notificationChannels) {
      await this.createNotificationConfig({ channel, enabled: false, config: {} });
    }

    // Initialize sample assets
    const sampleAssets = [
      { symbol: "RELIANCE", name: "Reliance Industries Ltd", type: "indian_stock", exchange: "NSE", enabled: true },
      { symbol: "TCS", name: "Tata Consultancy Services", type: "indian_stock", exchange: "NSE", enabled: true },
      { symbol: "HDFCBANK", name: "HDFC Bank", type: "indian_stock", exchange: "NSE", enabled: true },
      { symbol: "INFY", name: "Infosys Ltd", type: "indian_stock", exchange: "NSE", enabled: true },
      { symbol: "WIPRO", name: "Wipro Limited", type: "indian_stock", exchange: "NSE", enabled: true },
      { symbol: "HINDUNILVR", name: "Hindustan Unilever", type: "indian_stock", exchange: "NSE", enabled: true },
      { symbol: "MARUTI", name: "Maruti Suzuki India", type: "indian_stock", exchange: "NSE", enabled: true },
      { symbol: "BAJAJFINSV", name: "Bajaj Finserv", type: "indian_stock", exchange: "NSE", enabled: true },
      { symbol: "SBIN", name: "State Bank of India", type: "indian_stock", exchange: "NSE", enabled: true },
      { symbol: "ICICIBANK", name: "ICICI Bank", type: "indian_stock", exchange: "NSE", enabled: true },
      { symbol: "NIFTY50", name: "Nifty 50 Index", type: "indian_futures", exchange: "NSE", enabled: true },
      { symbol: "BANKNIFTY", name: "Bank Nifty Index", type: "indian_futures", exchange: "NSE", enabled: true },
      { symbol: "FINNIFTY", name: "Finnifty 50 Index", type: "indian_futures", exchange: "NSE", enabled: true },
      { symbol: "MIDCPNIFTY", name: "Mid Cap Nifty Index", type: "indian_futures", exchange: "NSE", enabled: true },
      { symbol: "NIFTYNXT50", name: "Nifty Next 50", type: "indian_futures", exchange: "NSE", enabled: true },
      { symbol: "GOLD", name: "Gold Futures", type: "indian_futures", exchange: "MCX", enabled: true },
      { symbol: "CRUDE", name: "Crude Oil Futures", type: "indian_futures", exchange: "MCX", enabled: true },
      { symbol: "NATURALGAS", name: "Natural Gas Futures", type: "indian_futures", exchange: "MCX", enabled: true },
      { symbol: "SILVER", name: "Silver Futures", type: "indian_futures", exchange: "MCX", enabled: true },
      { symbol: "COPPER", name: "Copper Futures", type: "indian_futures", exchange: "MCX", enabled: true },
      { symbol: "EURUSD", name: "EUR/USD", type: "forex", exchange: "Forex", enabled: true },
      { symbol: "GBPUSD", name: "GBP/USD", type: "forex", exchange: "Forex", enabled: true },
      { symbol: "USDJPY", name: "USD/JPY", type: "forex", exchange: "Forex", enabled: true },
      { symbol: "AUDUSD", name: "AUD/USD", type: "forex", exchange: "Forex", enabled: true },
      { symbol: "USDINR", name: "USD/INR", type: "forex", exchange: "Forex", enabled: true },
    ];

    for (const asset of sampleAssets) {
      await this.createAsset(asset);
    }

    console.log("Default data initialized successfully");
  }
}

export const dbStorage = new DatabaseStorage();
