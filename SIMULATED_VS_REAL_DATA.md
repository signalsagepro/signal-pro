# Simulated vs Real Market Data

## Why You're Getting Signals When Market is Closed

**You're seeing signals because the app is running a SIMULATED market data generator for testing purposes.**

### What's Happening

```typescript
// server/services/market-data-generator.ts
// Runs every 30 seconds, generates fake price data
setInterval(async () => {
  await this.generateAndProcessData();
}, 30000);
```

**This is for DEVELOPMENT/TESTING only** - it allows you to:
- Test signal detection without waiting for market hours
- Verify EMA calculations work correctly
- Test notification channels
- Debug the application

---

## Two Data Sources

### 1. Simulated Data (Currently Active)
- **Purpose**: Testing and development
- **How**: Generates random OHLC candles every 30 seconds
- **When**: Runs 24/7, regardless of market hours
- **Assets**: All enabled assets (RELIANCE, TCS, NIFTY, etc.)
- **Signals**: Generated from fake price movements

### 2. Real Broker Data (Production)
- **Purpose**: Live trading signals
- **How**: WebSocket connection to broker (Zerodha/Upstox/Angel)
- **When**: Only during market hours (9:15 AM - 3:30 PM IST)
- **Assets**: Only subscribed instruments
- **Signals**: Generated from real market ticks

---

## How to Disable Simulated Data

### Option 1: Environment Variable (Recommended)

Set `DISABLE_SIMULATED_DATA=true` in your environment:

```bash
# .env file or Railway environment variables
DISABLE_SIMULATED_DATA=true
```

### Option 2: Manual Stop

After app starts, the generator can be stopped programmatically:

```typescript
import { marketDataGenerator } from "./services/market-data-generator";
marketDataGenerator.stop();
```

---

## Production Setup

For production deployment, you should:

1. **Disable simulated data**:
   ```bash
   DISABLE_SIMULATED_DATA=true
   ```

2. **Connect to real broker**:
   - Configure broker API keys
   - Connect to real-time WebSocket
   - Subscribe to instruments

3. **Market hours only**:
   - Signals will only generate during trading hours
   - No data when market is closed

---

## Current Behavior

| Mode | Simulated Data | Real Broker Data | Signals 24/7 |
|------|---------------|------------------|--------------|
| **Development** (now) | ✅ Enabled | ⚠️ Optional | ✅ Yes |
| **Production** (should be) | ❌ Disabled | ✅ Required | ❌ Market hours only |

---

## Testing Real Broker Data

To test with real data while keeping simulated data:

1. **Keep simulated running** (for testing other assets)
2. **Connect broker WebSocket** (for specific instruments)
3. **Both sources work simultaneously**:
   - Simulated: RELIANCE, TCS, NIFTY (fake data)
   - Real: Subscribed instruments (live data)

The app will generate signals from both sources.

---

## Recommendation

**For Development**: Keep simulated data enabled
- Test anytime, no need to wait for market hours
- Verify all features work correctly

**For Production**: Disable simulated data
- Set `DISABLE_SIMULATED_DATA=true`
- Only use real broker WebSocket data
- Signals only during market hours

---

## Summary

You're getting signals now because:
1. ✅ Simulated data generator is running (for testing)
2. ✅ Generates fake price movements every 30 seconds
3. ✅ Works 24/7, even when market is closed

To get ONLY real signals:
1. Set `DISABLE_SIMULATED_DATA=true`
2. Connect to broker real-time feed
3. Signals will only appear during market hours
