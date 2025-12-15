import {
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
import { dbStorage, type IStorageWithLogs } from "./db-storage";

export interface IStorage {
  getAssets(): Promise<Asset[]>;
  getAsset(id: string): Promise<Asset | undefined>;
  createAsset(asset: InsertAsset): Promise<Asset>;
  updateAsset(id: string, data: Partial<Asset>): Promise<Asset | undefined>;
  deleteAsset(id: string): Promise<boolean>;

  getStrategies(): Promise<Strategy[]>;
  getStrategy(id: string): Promise<Strategy | undefined>;
  createStrategy(strategy: InsertStrategy): Promise<Strategy>;
  updateStrategy(id: string, data: Partial<Strategy>): Promise<Strategy | undefined>;
  deleteStrategy(id: string): Promise<boolean>;
  mergeStrategies?(strategy1Id: string, strategy2Id: string, logic: "AND" | "OR", timeWindow?: number): Promise<Strategy | undefined>;

  getSignals(): Promise<Signal[]>;
  getSignal(id: string): Promise<Signal | undefined>;
  createSignal(signal: InsertSignal): Promise<Signal>;
  updateSignal(id: string, data: Partial<Signal>): Promise<Signal | undefined>;
  deleteSignal(id: string): Promise<boolean>;

  getBrokerConfigs(): Promise<BrokerConfig[]>;
  getBrokerConfig(id: string): Promise<BrokerConfig | undefined>;
  createBrokerConfig(config: InsertBrokerConfig): Promise<BrokerConfig>;
  updateBrokerConfig(id: string, data: Partial<BrokerConfig>): Promise<BrokerConfig | undefined>;
  deleteBrokerConfig(id: string): Promise<boolean>;

  getNotificationConfigs(): Promise<NotificationConfig[]>;
  getNotificationConfig(id: string): Promise<NotificationConfig | undefined>;
  createNotificationConfig(config: InsertNotificationConfig): Promise<NotificationConfig>;
  updateNotificationConfig(id: string, data: Partial<NotificationConfig>): Promise<NotificationConfig | undefined>;
  deleteNotificationConfig(id: string): Promise<boolean>;

  getCandleData(assetId: string, timeframe: string): Promise<CandleData[]>;
  createCandleData(candle: InsertCandleData): Promise<CandleData>;

  getUser(id: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  deleteUser(id: string): Promise<boolean>;
  verifyUserPassword(email: string, password: string): Promise<User | undefined>;

  getDashboardConfig(key?: string): Promise<DashboardConfig | undefined>;
  updateDashboardConfig(key: string, config: Record<string, any>): Promise<DashboardConfig>;
}

export class MemStorage implements IStorage {
  private assets: Map<string, Asset>;
  private strategies: Map<string, Strategy>;
  private signals: Map<string, Signal>;
  private brokerConfigs: Map<string, BrokerConfig>;
  private notificationConfigs: Map<string, NotificationConfig>;
  private candleData: Map<string, CandleData>;
  private users: Map<string, User>;

  constructor() {
    this.assets = new Map();
    this.strategies = new Map();
    this.signals = new Map();
    this.brokerConfigs = new Map();
    this.notificationConfigs = new Map();
    this.candleData = new Map();
    this.users = new Map();

    this.initializeDefaultData();
  }

  private initializeDefaultData() {
    const indianBrokers = ["zerodha", "upstox", "angel"];
    const forexBrokers = ["oanda", "ib", "fxcm"];
    const notificationChannels = ["email", "sms", "webhook", "discord", "telegram"];

    indianBrokers.forEach((name) => {
      const id = randomUUID();
      this.brokerConfigs.set(id, {
        id,
        name,
        type: "indian",
        apiKey: null,
        apiSecret: null,
        enabled: false,
        connected: false,
        lastConnected: null,
        metadata: null as unknown,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    forexBrokers.forEach((name) => {
      const id = randomUUID();
      this.brokerConfigs.set(id, {
        id,
        name,
        type: "forex",
        apiKey: null,
        apiSecret: null,
        enabled: false,
        connected: false,
        lastConnected: null,
        metadata: null as unknown,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    notificationChannels.forEach((channel) => {
      const id = randomUUID();
      this.notificationConfigs.set(id, {
        id,
        channel,
        enabled: false,
        config: {} as unknown,
        testStatus: null,
        lastTested: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    // NSE F&O Stocks - All stocks available for Futures & Options trading
    const sampleAssets = [
      // Index Futures (NSE)
      { symbol: "NIFTY50", name: "Nifty 50 Index", type: "indian_futures" as const, exchange: "NSE", enabled: true },
      { symbol: "BANKNIFTY", name: "Bank Nifty Index", type: "indian_futures" as const, exchange: "NSE", enabled: true },
      { symbol: "FINNIFTY", name: "Fin Nifty Index", type: "indian_futures" as const, exchange: "NSE", enabled: true },
      { symbol: "MIDCPNIFTY", name: "Mid Cap Nifty Index", type: "indian_futures" as const, exchange: "NSE", enabled: true },
      { symbol: "NIFTYNXT50", name: "Nifty Next 50", type: "indian_futures" as const, exchange: "NSE", enabled: true },
      
      // NSE F&O Stocks - NIFTY 50 Components
      { symbol: "RELIANCE", name: "Reliance Industries", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "TCS", name: "Tata Consultancy Services", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "HDFCBANK", name: "HDFC Bank", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "INFY", name: "Infosys", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "ICICIBANK", name: "ICICI Bank", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "HINDUNILVR", name: "Hindustan Unilever", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "SBIN", name: "State Bank of India", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "BHARTIARTL", name: "Bharti Airtel", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "ITC", name: "ITC Limited", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "LT", name: "Larsen & Toubro", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "AXISBANK", name: "Axis Bank", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "ASIANPAINT", name: "Asian Paints", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "MARUTI", name: "Maruti Suzuki", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "HCLTECH", name: "HCL Technologies", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "SUNPHARMA", name: "Sun Pharma", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "TITAN", name: "Titan Company", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "BAJFINANCE", name: "Bajaj Finance", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "WIPRO", name: "Wipro", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "ULTRACEMCO", name: "UltraTech Cement", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "TATAMOTORS", name: "Tata Motors", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "NTPC", name: "NTPC Limited", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "POWERGRID", name: "Power Grid Corp", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "M&M", name: "Mahindra & Mahindra", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "TATASTEEL", name: "Tata Steel", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "ONGC", name: "ONGC", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "JSWSTEEL", name: "JSW Steel", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "ADANIENT", name: "Adani Enterprises", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "ADANIPORTS", name: "Adani Ports", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "COALINDIA", name: "Coal India", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "BPCL", name: "BPCL", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "GRASIM", name: "Grasim Industries", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "DRREDDY", name: "Dr. Reddy's Labs", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "CIPLA", name: "Cipla", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "DIVISLAB", name: "Divi's Laboratories", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "APOLLOHOSP", name: "Apollo Hospitals", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "EICHERMOT", name: "Eicher Motors", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "HEROMOTOCO", name: "Hero MotoCorp", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "BAJAJ-AUTO", name: "Bajaj Auto", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "BAJAJFINSV", name: "Bajaj Finserv", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "BRITANNIA", name: "Britannia Industries", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "NESTLEIND", name: "Nestle India", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "TECHM", name: "Tech Mahindra", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "INDUSINDBK", name: "IndusInd Bank", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "SBILIFE", name: "SBI Life Insurance", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "HDFCLIFE", name: "HDFC Life", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "TATACONSUM", name: "Tata Consumer", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "HINDALCO", name: "Hindalco", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "VEDL", name: "Vedanta", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      
      // Bank Nifty F&O Stocks
      { symbol: "BANDHANBNK", name: "Bandhan Bank", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "FEDERALBNK", name: "Federal Bank", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "IDFCFIRSTB", name: "IDFC First Bank", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "PNB", name: "Punjab National Bank", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "BANKBARODA", name: "Bank of Baroda", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      
      // Popular F&O Stocks
      { symbol: "ZOMATO", name: "Zomato", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "PAYTM", name: "One97 Communications", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "NYKAA", name: "FSN E-Commerce", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "DELHIVERY", name: "Delhivery", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "POLICYBZR", name: "PB Fintech", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "IRCTC", name: "IRCTC", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "HAL", name: "Hindustan Aeronautics", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "BEL", name: "Bharat Electronics", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "DIXON", name: "Dixon Technologies", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      { symbol: "TRENT", name: "Trent", type: "indian_stock" as const, exchange: "NSE", enabled: true },
      
      // MCX Commodity Futures
      { symbol: "GOLD", name: "Gold Futures", type: "indian_futures" as const, exchange: "MCX", enabled: true },
      { symbol: "SILVER", name: "Silver Futures", type: "indian_futures" as const, exchange: "MCX", enabled: true },
      { symbol: "CRUDE", name: "Crude Oil Futures", type: "indian_futures" as const, exchange: "MCX", enabled: true },
      { symbol: "NATURALGAS", name: "Natural Gas Futures", type: "indian_futures" as const, exchange: "MCX", enabled: true },
      { symbol: "COPPER", name: "Copper Futures", type: "indian_futures" as const, exchange: "MCX", enabled: true },
      
      // Major Forex Pairs
      { symbol: "USDINR", name: "US Dollar / Indian Rupee", type: "forex" as const, exchange: "NSE", enabled: true },
      { symbol: "EURINR", name: "Euro / Indian Rupee", type: "forex" as const, exchange: "NSE", enabled: true },
      { symbol: "GBPINR", name: "British Pound / Indian Rupee", type: "forex" as const, exchange: "NSE", enabled: true },
      { symbol: "JPYINR", name: "Japanese Yen / Indian Rupee", type: "forex" as const, exchange: "NSE", enabled: true },
      { symbol: "EURUSD", name: "Euro / US Dollar", type: "forex" as const, exchange: "Forex", enabled: true },
      { symbol: "GBPUSD", name: "British Pound / US Dollar", type: "forex" as const, exchange: "Forex", enabled: true },
      { symbol: "USDJPY", name: "US Dollar / Japanese Yen", type: "forex" as const, exchange: "Forex", enabled: true },
      { symbol: "AUDUSD", name: "Australian Dollar / US Dollar", type: "forex" as const, exchange: "Forex", enabled: true },
      { symbol: "USDCAD", name: "US Dollar / Canadian Dollar", type: "forex" as const, exchange: "Forex", enabled: true },
      { symbol: "USDCHF", name: "US Dollar / Swiss Franc", type: "forex" as const, exchange: "Forex", enabled: true },
      { symbol: "NZDUSD", name: "New Zealand Dollar / US Dollar", type: "forex" as const, exchange: "Forex", enabled: true },
      { symbol: "EURGBP", name: "Euro / British Pound", type: "forex" as const, exchange: "Forex", enabled: true },
      { symbol: "EURJPY", name: "Euro / Japanese Yen", type: "forex" as const, exchange: "Forex", enabled: true },
      { symbol: "GBPJPY", name: "British Pound / Japanese Yen", type: "forex" as const, exchange: "Forex", enabled: true },
      { symbol: "XAUUSD", name: "Gold / US Dollar", type: "forex" as const, exchange: "Forex", enabled: true },
      { symbol: "XAGUSD", name: "Silver / US Dollar", type: "forex" as const, exchange: "Forex", enabled: true },
    ];

    sampleAssets.forEach((asset) => {
      const id = randomUUID();
      const fullAsset: Asset = {
        id,
        symbol: asset.symbol,
        name: asset.name,
        type: asset.type,
        exchange: asset.exchange || "NSE",
        enabled: asset.enabled,
        createdAt: new Date(),
      };
      this.assets.set(id, fullAsset);
    });
  }

  async getAssets(): Promise<Asset[]> {
    return Array.from(this.assets.values()).sort((a, b) =>
      a.symbol.localeCompare(b.symbol)
    );
  }

  async getAsset(id: string): Promise<Asset | undefined> {
    return this.assets.get(id);
  }

  async createAsset(insertAsset: InsertAsset): Promise<Asset> {
    const id = randomUUID();
    const asset: Asset = {
      ...insertAsset,
      id,
      exchange: insertAsset.exchange ?? null,
      enabled: insertAsset.enabled ?? true,
      createdAt: new Date(),
    };
    this.assets.set(id, asset);
    return asset;
  }

  async updateAsset(id: string, data: Partial<Asset>): Promise<Asset | undefined> {
    const asset = this.assets.get(id);
    if (!asset) return undefined;

    const updated: Asset = { ...asset, ...data };
    this.assets.set(id, updated);
    return updated;
  }

  async deleteAsset(id: string): Promise<boolean> {
    return this.assets.delete(id);
  }

  async getStrategies(): Promise<Strategy[]> {
    return Array.from(this.strategies.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  async getStrategy(id: string): Promise<Strategy | undefined> {
    return this.strategies.get(id);
  }

  async createStrategy(insertStrategy: InsertStrategy): Promise<Strategy> {
    const id = randomUUID();
    const strategy: Strategy = {
      ...insertStrategy,
      id,
      description: insertStrategy.description ?? null,
      enabled: insertStrategy.enabled ?? true,
      isCustom: insertStrategy.isCustom ?? false,
      formula: insertStrategy.formula ?? null,
      signalCount: 0,
      mergeLogic: null,
      mergeTimeWindow: null,
      linkedStrategies: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.strategies.set(id, strategy);
    return strategy;
  }

  async updateStrategy(id: string, data: Partial<Strategy>): Promise<Strategy | undefined> {
    const strategy = this.strategies.get(id);
    if (!strategy) return undefined;

    const updated: Strategy = { ...strategy, ...data, updatedAt: new Date() };
    this.strategies.set(id, updated);
    return updated;
  }

  async deleteStrategy(id: string): Promise<boolean> {
    return this.strategies.delete(id);
  }

  async mergeStrategies(strategy1Id: string, strategy2Id: string, logic: "AND" | "OR", timeWindow?: number): Promise<Strategy | undefined> {
    const s1 = this.strategies.get(strategy1Id);
    const s2 = this.strategies.get(strategy2Id);
    
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

    const mergedStrategy: Strategy = {
      id: randomUUID(),
      name: mergedName,
      description: `Merged strategy: ${s1.name} ${logic} ${s2.name}`,
      type: mergedType,
      timeframe: s1.timeframe,
      enabled: true,
      conditions: mergedConditions,
      isCustom: true,
      formula: null,
      signalCount: 0,
      mergeLogic: logic,
      mergeTimeWindow: timeWindow ?? 60,
      linkedStrategies: [strategy1Id, strategy2Id] as unknown,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.strategies.set(mergedStrategy.id, mergedStrategy);
    return mergedStrategy;
  }

  async getSignals(): Promise<Signal[]> {
    return Array.from(this.signals.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  async getSignal(id: string): Promise<Signal | undefined> {
    return this.signals.get(id);
  }

  async createSignal(insertSignal: InsertSignal): Promise<Signal> {
    const id = randomUUID();
    const signal: Signal = {
      ...insertSignal,
      id,
      metadata: insertSignal.metadata ?? null as unknown,
      dismissed: insertSignal.dismissed ?? false,
      createdAt: new Date(),
    };
    this.signals.set(id, signal);

    const strategy = this.strategies.get(insertSignal.strategyId);
    if (strategy) {
      strategy.signalCount += 1;
      this.strategies.set(strategy.id, strategy);
    }

    return signal;
  }

  async updateSignal(id: string, data: Partial<Signal>): Promise<Signal | undefined> {
    const signal = this.signals.get(id);
    if (!signal) return undefined;

    const updated: Signal = { ...signal, ...data };
    this.signals.set(id, updated);
    return updated;
  }

  async deleteSignal(id: string): Promise<boolean> {
    return this.signals.delete(id);
  }

  async getBrokerConfigs(): Promise<BrokerConfig[]> {
    return Array.from(this.brokerConfigs.values());
  }

  async getBrokerConfig(id: string): Promise<BrokerConfig | undefined> {
    return this.brokerConfigs.get(id);
  }

  async createBrokerConfig(insertConfig: InsertBrokerConfig): Promise<BrokerConfig> {
    const id = randomUUID();
    const config: BrokerConfig = {
      ...insertConfig,
      id,
      enabled: insertConfig.enabled ?? false,
      apiKey: insertConfig.apiKey ?? null,
      apiSecret: insertConfig.apiSecret ?? null,
      metadata: insertConfig.metadata ?? null as unknown,
      connected: false,
      lastConnected: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.brokerConfigs.set(id, config);
    return config;
  }

  async updateBrokerConfig(
    id: string,
    data: Partial<BrokerConfig>
  ): Promise<BrokerConfig | undefined> {
    const config = this.brokerConfigs.get(id);
    if (!config) return undefined;

    const updated: BrokerConfig = { ...config, ...data, updatedAt: new Date() };
    this.brokerConfigs.set(id, updated);
    return updated;
  }

  async deleteBrokerConfig(id: string): Promise<boolean> {
    return this.brokerConfigs.delete(id);
  }

  async getNotificationConfigs(): Promise<NotificationConfig[]> {
    return Array.from(this.notificationConfigs.values());
  }

  async getNotificationConfig(id: string): Promise<NotificationConfig | undefined> {
    return this.notificationConfigs.get(id);
  }

  async createNotificationConfig(
    insertConfig: InsertNotificationConfig
  ): Promise<NotificationConfig> {
    const id = randomUUID();
    const config: NotificationConfig = {
      ...insertConfig,
      id,
      enabled: insertConfig.enabled ?? false,
      testStatus: null,
      lastTested: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.notificationConfigs.set(id, config);
    return config;
  }

  async updateNotificationConfig(
    id: string,
    data: Partial<NotificationConfig>
  ): Promise<NotificationConfig | undefined> {
    const config = this.notificationConfigs.get(id);
    if (!config) return undefined;

    const updated: NotificationConfig = { ...config, ...data, updatedAt: new Date() };
    this.notificationConfigs.set(id, updated);
    return updated;
  }

  async deleteNotificationConfig(id: string): Promise<boolean> {
    return this.notificationConfigs.delete(id);
  }

  async getCandleData(assetId: string, timeframe: string): Promise<CandleData[]> {
    return Array.from(this.candleData.values())
      .filter((c) => c.assetId === assetId && c.timeframe === timeframe)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async createCandleData(insertCandle: InsertCandleData): Promise<CandleData> {
    const id = randomUUID();
    const candle: CandleData = {
      ...insertCandle,
      id,
      ema50: insertCandle.ema50 ?? null,
      ema200: insertCandle.ema200 ?? null,
    };
    this.candleData.set(id, candle);
    return candle;
  }

  async getUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const hashedPassword = await hashPassword(insertUser.password);
    const user: User = {
      ...insertUser,
      id,
      password: hashedPassword,
      role: insertUser.role ?? "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async verifyUserPassword(email: string, password: string): Promise<User | undefined> {
    const user = await this.getUserByEmail(email);
    if (!user) return undefined;
    const isValid = await verifyPassword(password, user.password);
    return isValid ? user : undefined;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  // Dashboard config (in-memory - won't persist)
  private dashboardConfig: DashboardConfig = {
    id: randomUUID(),
    key: "global",
    config: {
      showMetricCards: true,
      showNiftyChart: true,
      showSensexChart: true,
      showSignalsTable: true,
      showStrategiesTable: true,
      showAssetsTable: true,
      showRecentActivity: true,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  async getDashboardConfig(key: string = "global"): Promise<DashboardConfig | undefined> {
    return this.dashboardConfig;
  }

  async updateDashboardConfig(key: string, config: Record<string, any>): Promise<DashboardConfig> {
    this.dashboardConfig = {
      ...this.dashboardConfig,
      config,
      updatedAt: new Date(),
    };
    return this.dashboardConfig;
  }
}

// Use database storage if DATABASE_URL is set, otherwise fall back to memory storage
const USE_DATABASE = !!process.env.DATABASE_URL;

export const storage: IStorage = USE_DATABASE ? dbStorage : new MemStorage();

// Export the database storage with logs support for when you need logging functionality
export { dbStorage, type IStorageWithLogs };
