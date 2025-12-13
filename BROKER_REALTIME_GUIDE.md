# Broker Real-Time Signal Generation Guide

## How It Works

### Flow: Broker Config → Real-Time Data → Signals

```
1. Configure Broker
   ↓
2. Connect to Real-Time WebSocket
   ↓
3. Subscribe to Instruments
   ↓
4. Receive Tick Data
   ↓
5. Calculate EMA50 & EMA200
   ↓
6. Run Signal Detection
   ↓
7. Send Notifications
```

---

## Step-by-Step Setup

### 1. Configure Broker (Indian or Forex)

**Indian Brokers** (Zerodha, Upstox, Angel One):
- Go to **Broker Config** page
- Add API Key and API Secret
- Test connection: `POST /api/broker-configs/:id/test`
- If successful, broker status shows "Connected"

**Forex Brokers** (OANDA, Interactive Brokers, FXCM):
- Same process as Indian brokers
- Note: Real-time WebSocket only available for Indian brokers currently

### 2. Connect to Real-Time Feed

**API Endpoint**: `POST /api/broker-configs/:id/connect-realtime`

**Request**:
```json
{
  "id": "broker-config-id"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Connected to zerodha real-time feed"
}
```

**What Happens**:
- Opens WebSocket connection to broker
- Authenticates with API key and access token
- Starts listening for market data

### 3. Subscribe to Instruments

**API Endpoint**: `POST /api/broker-realtime/subscribe`

**Request**:
```json
{
  "broker": "zerodha",
  "instrumentTokens": [738561, 779521, 408065]
}
```

**Instrument Tokens**:
- **Zerodha**: Get from Kite API instruments list
- **Upstox**: Use instrument keys
- **Angel One**: Use exchange tokens

**Example Tokens**:
- RELIANCE: 738561
- TCS: 2953217
- NIFTY 50: 256265

### 4. Real-Time Tick Processing

When a tick arrives:

```typescript
// Tick data structure
{
  instrumentToken: 738561,
  lastPrice: 2450.50,
  open: 2440.00,
  high: 2455.00,
  low: 2438.50,
  close: 2450.50,
  volume: 1234567,
  timestamp: "2024-12-14T01:30:00Z"
}
```

**Automatic Processing**:
1. **EMA Calculation**: Calculates EMA50 and EMA200 on the fly
2. **Signal Detection**: Runs all enabled strategies
3. **WebSocket Broadcast**: Sends tick + EMAs to connected clients
4. **Notification**: Triggers alerts if signal detected

### 5. Signal Detection Strategies

**Available Strategies**:
- 15m Above 50 Bullish
- 5m Above 200 Reversal
- 5m Pullback to 200
- 5m Below 200 Bearish
- 5m Touch 200 Downtrend
- 15m Below 200 Breakdown
- Custom Formula (user-defined)

**Signal Generation**:
```typescript
if (ema50 > ema200 && previousEma50 <= previousEma200) {
  // Bullish crossover signal
  createSignal({
    type: "15m_above_50_bullish",
    price: currentPrice,
    ema50,
    ema200
  });
}
```

### 6. Notification Dispatch

When a signal is created:
- **Email**: SMTP notification
- **SMS**: Twilio message
- **Discord**: Webhook post
- **Telegram**: Bot message
- **Webhook**: Custom HTTP POST

All enabled channels receive the alert simultaneously.

---

## API Endpoints Reference

### Broker Real-Time Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/broker-configs/:id/connect-realtime` | POST | Connect to broker WebSocket |
| `/api/broker-realtime/status` | GET | Check connection status |
| `/api/broker-realtime/subscribe` | POST | Subscribe to instruments |

### Example: Full Setup

```bash
# 1. Connect to Zerodha real-time
curl -X POST http://localhost:5001/api/broker-configs/zerodha-id/connect-realtime \
  -H "Cookie: session=..." \
  -H "Content-Type: application/json"

# 2. Check status
curl http://localhost:5001/api/broker-realtime/status \
  -H "Cookie: session=..."

# Response:
# {
#   "status": {
#     "zerodha": true,
#     "upstox": false,
#     "angel": false
#   }
# }

# 3. Subscribe to instruments
curl -X POST http://localhost:5001/api/broker-realtime/subscribe \
  -H "Cookie: session=..." \
  -H "Content-Type: application/json" \
  -d '{
    "broker": "zerodha",
    "instrumentTokens": [738561, 2953217, 256265]
  }'
```

---

## WebSocket Client Integration

### Connect to WebSocket

```javascript
const ws = new WebSocket('ws://localhost:5001/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'tick') {
    // Real-time tick with EMA data
    console.log('Tick:', data.data);
    // {
    //   symbol: "RELIANCE",
    //   lastPrice: 2450.50,
    //   ema50: 2445.30,
    //   ema200: 2430.10
    // }
  }
  
  if (data.type === 'new_signal') {
    // New signal detected
    console.log('Signal:', data.data);
    // Show notification to user
  }
};

// Subscribe to instruments via WebSocket
ws.send(JSON.stringify({
  type: 'subscribe',
  broker: 'zerodha',
  tokens: [738561, 2953217]
}));
```

---

## Broker-Specific Details

### Zerodha Kite Connect

**WebSocket URL**: `wss://ws.kite.trade`

**Authentication**:
- Requires API key and access token
- Access token obtained via OAuth flow

**Data Format**: Binary (custom protocol)
- Mode: Full (all tick data)
- Includes OHLC, volume, timestamp

**Reconnection**: Automatic with exponential backoff

### Upstox

**WebSocket URL**: Market Data Feed V3

**Authentication**:
- API key + access token
- Protobuf streaming format

**Subscription**: 
- Full mode for complete data
- Supports multiple instruments

### Angel One

**WebSocket URL**: SmartSocket API

**Authentication**:
- Client code + auth token
- Binary data format

**Features**:
- Real-time quotes
- Market depth (optional)

---

## Troubleshooting

### Connection Issues

**Problem**: "Failed to connect to real-time feed"

**Solutions**:
1. Verify API key and secret are correct
2. Ensure access token is valid (not expired)
3. Check broker API status
4. Verify network connectivity

### No Signals Generated

**Problem**: Ticks received but no signals

**Solutions**:
1. Check if strategies are enabled
2. Verify EMA calculation has enough data (need 200+ candles)
3. Ensure signal conditions are met
4. Check logs for errors

### Missing EMA Values

**Problem**: Ticks have `null` for ema50/ema200

**Solutions**:
1. Need historical data first (200+ data points)
2. EMA calculator requires warm-up period
3. Wait for sufficient ticks to accumulate

---

## Production Considerations

### Rate Limits
- Zerodha: 3 requests/second
- Upstox: 10 requests/second
- Angel One: 5 requests/second

### Data Storage
- Store candle data in database for EMA calculation
- Keep last 200+ candles per instrument
- Prune old data periodically

### Monitoring
- Track WebSocket connection status
- Log reconnection attempts
- Monitor signal generation rate
- Alert on connection failures

### Security
- Never expose API keys in frontend
- Store access tokens securely
- Rotate tokens regularly
- Use HTTPS in production

---

## Testing

### Manual Test Flow

1. Login as admin: `admin@signalsage.cyborg` / `cyborg@1234`
2. Go to Broker Config
3. Add Zerodha API key and secret
4. Click "Test Connection"
5. Click "Connect Real-Time"
6. Subscribe to instruments (e.g., RELIANCE: 738561)
7. Watch Dashboard for live signals

### Verify Real-Time Working

```bash
# Check WebSocket connection
curl http://localhost:5001/api/broker-realtime/status

# Should return:
# { "status": { "zerodha": true } }
```

---

## Summary

✅ **Forex Brokers**: API integration for orders (no real-time WebSocket yet)  
✅ **Indian Brokers**: Full real-time WebSocket + signal generation  
✅ **EMA Calculation**: Automatic on incoming ticks  
✅ **Signal Detection**: All strategies run on real-time data  
✅ **Notifications**: Multi-channel alerts on signal creation  

**Next Steps**: Configure your broker, connect to real-time feed, and start receiving live trading signals!
