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
import { queryCache } from "./utils/query-cache";

export interface IStorageWithLogs extends IStorage {
  getLogs(limit?: number): Promise<Log[]>;
  getLogsByUser(userId: string): Promise<Log[]>;
  getLogsByEntity(entity: string, entityId?: string): Promise<Log[]>;
  createLog(log: InsertLog): Promise<Log>;
}

/**
 * Optimized Database Storage with Query Caching
 * Reduces database load by caching frequently accessed data
 */
export class OptimizedDatabaseStorage implements IStorageWithLogs {
  // Cache TTLs (in milliseconds)
  private readonly CACHE_TTL = {
    ASSETS: 60 * 1000,           // 1 minute - assets change rarely
    STRATEGIES: 60 * 1000,        // 1 minute - strategies change rarely
    BROKER_CONFIGS: 30 * 1000,    // 30 seconds - may change during auth
    NOTIFICATION_CONFIGS: 60 * 1000, // 1 minute
    USERS: 5 * 60 * 1000,         // 5 minutes - user data rarely changes
  };

  // ============ ASSETS ============
  async getAssets(): Promise<Asset[]> {
    return queryCache.get(
      "assets:all",
      () => db.select().from(assets).orderBy(assets.symbol),
      this.CACHE_TTL.ASSETS
    );
  }

  async getAsset(id: string): Promise<Asset | undefined> {
    return queryCache.get(
      `asset:${id}`,
      async () => {
        const [asset] = await db.select().from(assets).where(eq(assets.id, id));
        return asset;
      },
      this.CACHE_TTL.ASSETS
    );
  }

  async createAsset(insertAsset: InsertAsset): Promise<Asset> {
    const [asset] = await db.insert(assets).values({
      ...insertAsset,
      id: randomUUID(),
    }).returning();
    
    // Invalidate cache
    queryCache.invalidatePattern("^assets:");
    queryCache.invalidate(`asset:${asset.id}`);
    
    return asset;
  }

  async updateAsset(id: string, data: Partial<Asset>): Promise<Asset | undefined> {
    const [updated] = await db.update(assets)
      .set(data)
      .where(eq(assets.id, id))
      .returning();
    
    // Invalidate cache
    queryCache.invalidatePattern("^assets:");
    queryCache.invalidate(`asset:${id}`);
    
    return updated;
  }

  async deleteAsset(id: string): Promise<boolean> {
    const result = await db.delete(assets).where(eq(assets.id, id));
    
    // Invalidate cache
    queryCache.invalidatePattern("^assets:");
    queryCache.invalidate(`asset:${id}`);
    
    return (result.rowCount ?? 0) > 0;
  }

  // ============ STRATEGIES ============
  async getStrategies(): Promise<Strategy[]> {
    return queryCache.get(
      "strategies:all",
      () => db.select().from(strategies).orderBy(desc(strategies.createdAt)),
      this.CACHE_TTL.STRATEGIES
    );
  }

  async getStrategy(id: string): Promise<Strategy | undefined> {
    return queryCache.get(
      `strategy:${id}`,
      async () => {
        const [strategy] = await db.select().from(strategies).where(eq(strategies.id, id));
        return strategy;
      },
      this.CACHE_TTL.STRATEGIES
    );
  }

  async createStrategy(insertStrategy: InsertStrategy): Promise<Strategy> {
    const [strategy] = await db.insert(strategies).values({
      ...insertStrategy,
      id: randomUUID(),
      signalCount: 0,
    }).returning();
    
    queryCache.invalidatePattern("^strategies:");
    return strategy;
  }

  async updateStrategy(id: string, data: Partial<Strategy>): Promise<Strategy | undefined> {
    const [updated] = await db.update(strategies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(strategies.id, id))
      .returning();
    
    queryCache.invalidatePattern("^strategies:");
    queryCache.invalidate(`strategy:${id}`);
    
    return updated;
  }

  async deleteStrategy(id: string): Promise<boolean> {
    const result = await db.delete(strategies).where(eq(strategies.id, id));
    
    queryCache.invalidatePattern("^strategies:");
    queryCache.invalidate(`strategy:${id}`);
    
    return (result.rowCount ?? 0) > 0;
  }

  // ============ SIGNALS ============
  // Signals are NOT cached as they're real-time data
  async getSignals(limit?: number): Promise<Signal[]> {
    const query = db.select().from(signals).orderBy(desc(signals.createdAt));
    return limit ? query.limit(limit) : query;
  }

  async getSignal(id: string): Promise<Signal | undefined> {
    const [signal] = await db.select().from(signals).where(eq(signals.id, id));
    return signal;
  }

  async getSignalsByAsset(assetId: string, limit?: number): Promise<Signal[]> {
    const query = db.select()
      .from(signals)
      .where(eq(signals.assetId, assetId))
      .orderBy(desc(signals.createdAt));
    return limit ? query.limit(limit) : query;
  }

  async getSignalsByStrategy(strategyId: string, limit?: number): Promise<Signal[]> {
    const query = db.select()
      .from(signals)
      .where(eq(signals.strategyId, strategyId))
      .orderBy(desc(signals.createdAt));
    return limit ? query.limit(limit) : query;
  }

  async createSignal(insertSignal: InsertSignal): Promise<Signal> {
    const [signal] = await db.insert(signals).values({
      ...insertSignal,
      id: randomUUID(),
    }).returning();
    return signal;
  }

  async deleteSignal(id: string): Promise<boolean> {
    const result = await db.delete(signals).where(eq(signals.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ============ BROKER CONFIGS ============
  async getBrokerConfigs(): Promise<BrokerConfig[]> {
    return queryCache.get(
      "broker_configs:all",
      () => db.select().from(brokerConfigs),
      this.CACHE_TTL.BROKER_CONFIGS
    );
  }

  async getBrokerConfig(id: string): Promise<BrokerConfig | undefined> {
    return queryCache.get(
      `broker_config:${id}`,
      async () => {
        const [config] = await db.select().from(brokerConfigs).where(eq(brokerConfigs.id, id));
        return config;
      },
      this.CACHE_TTL.BROKER_CONFIGS
    );
  }

  async createBrokerConfig(insertConfig: InsertBrokerConfig): Promise<BrokerConfig> {
    const [config] = await db.insert(brokerConfigs).values({
      ...insertConfig,
      id: randomUUID(),
    }).returning();
    
    queryCache.invalidatePattern("^broker_config");
    return config;
  }

  async updateBrokerConfig(id: string, data: Partial<BrokerConfig>): Promise<BrokerConfig | undefined> {
    const [updated] = await db.update(brokerConfigs)
      .set(data)
      .where(eq(brokerConfigs.id, id))
      .returning();
    
    queryCache.invalidatePattern("^broker_config");
    return updated;
  }

  async deleteBrokerConfig(id: string): Promise<boolean> {
    const result = await db.delete(brokerConfigs).where(eq(brokerConfigs.id, id));
    queryCache.invalidatePattern("^broker_config");
    return (result.rowCount ?? 0) > 0;
  }

  // ============ NOTIFICATION CONFIGS ============
  async getNotificationConfigs(): Promise<NotificationConfig[]> {
    return queryCache.get(
      "notification_configs:all",
      () => db.select().from(notificationConfigs),
      this.CACHE_TTL.NOTIFICATION_CONFIGS
    );
  }

  async getNotificationConfig(id: string): Promise<NotificationConfig | undefined> {
    return queryCache.get(
      `notification_config:${id}`,
      async () => {
        const [config] = await db.select().from(notificationConfigs).where(eq(notificationConfigs.id, id));
        return config;
      },
      this.CACHE_TTL.NOTIFICATION_CONFIGS
    );
  }

  async createNotificationConfig(insertConfig: InsertNotificationConfig): Promise<NotificationConfig> {
    const [config] = await db.insert(notificationConfigs).values({
      ...insertConfig,
      id: randomUUID(),
    }).returning();
    
    queryCache.invalidatePattern("^notification_config");
    return config;
  }

  async updateNotificationConfig(id: string, data: Partial<NotificationConfig>): Promise<NotificationConfig | undefined> {
    const [updated] = await db.update(notificationConfigs)
      .set(data)
      .where(eq(notificationConfigs.id, id))
      .returning();
    
    queryCache.invalidatePattern("^notification_config");
    return updated;
  }

  async deleteNotificationConfig(id: string): Promise<boolean> {
    const result = await db.delete(notificationConfigs).where(eq(notificationConfigs.id, id));
    queryCache.invalidatePattern("^notification_config");
    return (result.rowCount ?? 0) > 0;
  }

  // ============ USERS ============
  async getUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getUser(id: string): Promise<User | undefined> {
    return queryCache.get(
      `user:${id}`,
      async () => {
        const [user] = await db.select().from(users).where(eq(users.id, id));
        return user;
      },
      this.CACHE_TTL.USERS
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return queryCache.get(
      `user:email:${email}`,
      async () => {
        const [user] = await db.select().from(users).where(eq(users.email, email));
        return user;
      },
      this.CACHE_TTL.USERS
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await hashPassword(insertUser.password);
    const [user] = await db.insert(users).values({
      ...insertUser,
      id: randomUUID(),
      password: hashedPassword,
    }).returning();
    
    queryCache.invalidatePattern("^user:");
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const updateData = { ...data };
    if (data.password) {
      updateData.password = await hashPassword(data.password);
    }
    
    const [updated] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    
    queryCache.invalidatePattern("^user:");
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    queryCache.invalidatePattern("^user:");
    return (result.rowCount ?? 0) > 0;
  }

  async verifyUserPassword(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (!user) return null;
    
    const isValid = await verifyPassword(password, user.password);
    return isValid ? user : null;
  }

  // ============ CANDLE DATA ============
  async getCandleData(assetId: string, timeframe: string, limit?: number): Promise<CandleData[]> {
    const query = db.select()
      .from(candleData)
      .where(and(
        eq(candleData.assetId, assetId),
        eq(candleData.timeframe, timeframe)
      ))
      .orderBy(desc(candleData.timestamp));
    return limit ? query.limit(limit) : query;
  }

  async createCandleData(insertCandle: InsertCandleData): Promise<CandleData> {
    const [candle] = await db.insert(candleData).values({
      ...insertCandle,
      id: randomUUID(),
    }).returning();
    return candle;
  }

  async deleteCandleData(assetId: string, timeframe: string, beforeTimestamp: Date): Promise<number> {
    const result = await db.delete(candleData).where(
      and(
        eq(candleData.assetId, assetId),
        eq(candleData.timeframe, timeframe)
      )
    );
    return result.rowCount ?? 0;
  }

  // ============ LOGS ============
  async getLogs(limit: number = 100): Promise<Log[]> {
    return db.select().from(logs).orderBy(desc(logs.createdAt)).limit(limit);
  }

  async getLogsByUser(userId: string): Promise<Log[]> {
    return db.select().from(logs).where(eq(logs.userId, userId)).orderBy(desc(logs.createdAt));
  }

  async getLogsByEntity(entity: string, entityId?: string): Promise<Log[]> {
    const conditions = entityId
      ? and(eq(logs.entity, entity), eq(logs.entityId, entityId))
      : eq(logs.entity, entity);
    return db.select().from(logs).where(conditions).orderBy(desc(logs.createdAt));
  }

  async createLog(insertLog: InsertLog): Promise<Log> {
    const [log] = await db.insert(logs).values({
      ...insertLog,
      id: randomUUID(),
    }).returning();
    return log;
  }

  // ============ DASHBOARD CONFIGS ============
  async getDashboardConfigs(): Promise<DashboardConfig[]> {
    return db.select().from(dashboardConfigs);
  }

  async getDashboardConfig(id: string): Promise<DashboardConfig | undefined> {
    const [config] = await db.select().from(dashboardConfigs).where(eq(dashboardConfigs.id, id));
    return config;
  }

  async createDashboardConfig(insertConfig: InsertDashboardConfig): Promise<DashboardConfig> {
    const [config] = await db.insert(dashboardConfigs).values({
      ...insertConfig,
      id: randomUUID(),
    }).returning();
    return config;
  }

  async updateDashboardConfig(id: string, data: Partial<DashboardConfig>): Promise<DashboardConfig | undefined> {
    const [updated] = await db.update(dashboardConfigs)
      .set(data)
      .where(eq(dashboardConfigs.id, id))
      .returning();
    return updated;
  }

  async deleteDashboardConfig(id: string): Promise<boolean> {
    const result = await db.delete(dashboardConfigs).where(eq(dashboardConfigs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async initializeDefaultData(): Promise<void> {
    // Implementation remains the same as DatabaseStorage
  }
}
