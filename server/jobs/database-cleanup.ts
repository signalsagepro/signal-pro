import { db } from "../db";
import { signals, logs, candleData } from "@shared/schema";
import { lt, sql } from "drizzle-orm";

/**
 * Database Cleanup Job
 * 
 * Runs every 24 hours to clean up old data while preserving:
 * - Last 250 candles per asset/timeframe (required for EMA200 calculation)
 * - All users, assets, strategies, broker configs, notification configs
 * 
 * Deletes:
 * - Signals older than 24 hours
 * - Logs older than 24 hours
 * - Candle data beyond last 250 per asset/timeframe
 */

export async function cleanupOldData() {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  console.log(`[Cleanup] Starting database cleanup at ${now.toISOString()}`);

  try {
    // 1. Delete signals older than 24 hours
    const deletedSignals = await db
      .delete(signals)
      .where(lt(signals.createdAt, twentyFourHoursAgo))
      .returning();
    
    console.log(`[Cleanup] Deleted ${deletedSignals.length} old signals`);

    // 2. Delete logs older than 24 hours
    const deletedLogs = await db
      .delete(logs)
      .where(lt(logs.createdAt, twentyFourHoursAgo))
      .returning();
    
    console.log(`[Cleanup] Deleted ${deletedLogs.length} old logs`);

    // 3. Keep only last 250 candles per asset/timeframe
    // This ensures we have enough data for EMA200 calculation (needs 200+ points)
    // Plus 50 buffer for accuracy
    await db.execute(sql`
      DELETE FROM candle_data
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, 
                 ROW_NUMBER() OVER (
                   PARTITION BY asset_id, timeframe 
                   ORDER BY timestamp DESC
                 ) as rn
          FROM candle_data
        ) ranked
        WHERE rn <= 250
      )
    `);

    console.log(`[Cleanup] Cleaned up old candle data (kept last 250 per asset/timeframe)`);
    console.log(`[Cleanup] Cleanup completed successfully at ${new Date().toISOString()}`);
    
    return {
      success: true,
      deletedSignals: deletedSignals.length,
      deletedLogs: deletedLogs.length,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error(`[Cleanup] Error during cleanup:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Start the cleanup job scheduler
 * Runs cleanup immediately on startup, then every 24 hours
 */
export function startCleanupJob() {
  console.log("[Cleanup] Initializing database cleanup job...");

  // Run immediately on startup (after a short delay to ensure DB is ready)
  setTimeout(() => {
    console.log("[Cleanup] Running initial cleanup...");
    cleanupOldData();
  }, 5000); // 5 second delay

  // Then run every 24 hours
  const intervalId = setInterval(() => {
    cleanupOldData();
  }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds

  console.log("[Cleanup] Database cleanup job scheduled (runs every 24 hours)");

  // Return interval ID so it can be cleared if needed
  return intervalId;
}

/**
 * Stop the cleanup job (useful for testing or graceful shutdown)
 */
export function stopCleanupJob(intervalId: NodeJS.Timeout) {
  clearInterval(intervalId);
  console.log("[Cleanup] Database cleanup job stopped");
}

/**
 * Get cleanup statistics (for monitoring/dashboard)
 */
export async function getCleanupStats() {
  try {
    const signalCount = await db.select({ count: sql<number>`count(*)` }).from(signals);
    const logCount = await db.select({ count: sql<number>`count(*)` }).from(logs);
    const candleCount = await db.select({ count: sql<number>`count(*)` }).from(candleData);

    return {
      signals: signalCount[0]?.count || 0,
      logs: logCount[0]?.count || 0,
      candles: candleCount[0]?.count || 0,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error("[Cleanup] Error getting stats:", error);
    return null;
  }
}
