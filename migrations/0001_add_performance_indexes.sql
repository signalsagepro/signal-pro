-- Performance Optimization: Add indexes for frequently queried columns
-- This migration adds strategic indexes to improve query performance

-- Signals table indexes
CREATE INDEX IF NOT EXISTS idx_signals_asset_id ON signals(asset_id);
CREATE INDEX IF NOT EXISTS idx_signals_strategy_id ON signals(strategy_id);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(type);
CREATE INDEX IF NOT EXISTS idx_signals_asset_created ON signals(asset_id, created_at DESC);

-- Assets table indexes
CREATE INDEX IF NOT EXISTS idx_assets_enabled ON assets(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
CREATE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol);

-- Strategies table indexes
CREATE INDEX IF NOT EXISTS idx_strategies_enabled ON strategies(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_strategies_timeframe ON strategies(timeframe);
CREATE INDEX IF NOT EXISTS idx_strategies_type ON strategies(type);

-- Broker configs indexes
CREATE INDEX IF NOT EXISTS idx_broker_configs_name ON broker_configs(name);
CREATE INDEX IF NOT EXISTS idx_broker_configs_connected ON broker_configs(connected) WHERE connected = true;

-- Notification configs indexes
CREATE INDEX IF NOT EXISTS idx_notification_configs_enabled ON notification_configs(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_notification_configs_channel ON notification_configs(channel);

-- Candles table indexes (skip if table doesn't exist)
-- CREATE INDEX IF NOT EXISTS idx_candles_asset_timeframe ON candles(asset_id, timeframe, timestamp DESC);
-- CREATE INDEX IF NOT EXISTS idx_candles_timestamp ON candles(timestamp DESC);

-- Logs table indexes
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_signals_recent_by_asset ON signals(asset_id, created_at DESC, type);
CREATE INDEX IF NOT EXISTS idx_signals_recent_by_strategy ON signals(strategy_id, created_at DESC);

-- Analyze tables to update statistics for query planner
ANALYZE signals;
ANALYZE assets;
ANALYZE strategies;
ANALYZE broker_configs;
ANALYZE notification_configs;
ANALYZE users;
