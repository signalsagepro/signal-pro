import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const assets = pgTable("assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  exchange: text("exchange"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAssetSchema = createInsertSchema(assets).omit({
  id: true,
  createdAt: true,
});

export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

export const strategies = pgTable("strategies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  timeframe: text("timeframe").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  type: text("type").notNull(),
  conditions: jsonb("conditions").notNull(),
  isCustom: boolean("is_custom").notNull().default(false),
  formula: text("formula"),
  signalCount: integer("signal_count").notNull().default(0),
  mergeLogic: text("merge_logic"), // "AND" or "OR"
  mergeTimeWindow: integer("merge_time_window"), // time window in seconds for merging
  linkedStrategies: jsonb("linked_strategies"), // array of strategy IDs that are merged
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertStrategySchema = createInsertSchema(strategies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  signalCount: true,
  mergeLogic: true,
  mergeTimeWindow: true,
  linkedStrategies: true,
});

export type InsertStrategy = z.infer<typeof insertStrategySchema>;
export type Strategy = typeof strategies.$inferSelect;

export const signals = pgTable("signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  strategyId: varchar("strategy_id").notNull().references(() => strategies.id, { onDelete: 'cascade' }),
  assetId: varchar("asset_id").notNull().references(() => assets.id, { onDelete: 'cascade' }),
  timeframe: text("timeframe").notNull(),
  type: text("type").notNull(),
  price: real("price").notNull(),
  ema50: real("ema50").notNull(),
  ema200: real("ema200").notNull(),
  metadata: jsonb("metadata"),
  dismissed: boolean("dismissed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSignalSchema = createInsertSchema(signals).omit({
  id: true,
  createdAt: true,
});

export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Signal = typeof signals.$inferSelect;

export const brokerConfigs = pgTable("broker_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  type: text("type").notNull(),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  enabled: boolean("enabled").notNull().default(false),
  connected: boolean("connected").notNull().default(false),
  lastConnected: timestamp("last_connected"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBrokerConfigSchema = createInsertSchema(brokerConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  connected: true,
  lastConnected: true,
});

export type InsertBrokerConfig = z.infer<typeof insertBrokerConfigSchema>;
export type BrokerConfig = typeof brokerConfigs.$inferSelect;

export const notificationConfigs = pgTable("notification_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  channel: text("channel").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  config: jsonb("config").notNull(),
  testStatus: text("test_status"),
  lastTested: timestamp("last_tested"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertNotificationConfigSchema = createInsertSchema(notificationConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  testStatus: true,
  lastTested: true,
});

export type InsertNotificationConfig = z.infer<typeof insertNotificationConfigSchema>;
export type NotificationConfig = typeof notificationConfigs.$inferSelect;

export const candleData = pgTable("candle_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull().references(() => assets.id, { onDelete: 'cascade' }),
  timeframe: text("timeframe").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  open: real("open").notNull(),
  high: real("high").notNull(),
  low: real("low").notNull(),
  close: real("close").notNull(),
  volume: real("volume").notNull(),
  ema50: real("ema50"),
  ema200: real("ema200"),
});

export const insertCandleDataSchema = createInsertSchema(candleData).omit({
  id: true,
});

export type InsertCandleData = z.infer<typeof insertCandleDataSchema>;
export type CandleData = typeof candleData.$inferSelect;

export type SignalType = 
  | "15m_above_50_bullish"
  | "5m_above_200_reversal"
  | "5m_pullback_to_200"
  | "5m_below_200_bearish"
  | "5m_touch_200_downtrend"
  | "15m_below_200_breakdown";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type AssetType = "indian_stock" | "indian_futures" | "forex";
export type Timeframe = "5m" | "15m";
export type BrokerType = "indian" | "forex";
export type NotificationChannel = "email" | "sms" | "webhook" | "discord" | "telegram";
