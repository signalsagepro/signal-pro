# SignalPro Production Deployment Guide

## 1. Frontend-Backend Integration Status ✅

The frontend IS wired to the backend. Here's how:

| Frontend Page | Backend API | Status |
|--------------|-------------|--------|
| Dashboard | `/api/signals`, `/api/assets` | ✅ Connected |
| Strategies | `/api/strategies` | ✅ Connected |
| Assets | `/api/assets` | ✅ Connected |
| Signals | `/api/signals` | ✅ Connected |
| Broker Config | `/api/broker-configs` | ✅ Connected |
| Notifications | `/api/notification-configs` | ✅ Connected |
| Users | `/api/users` | ✅ Connected |
| Auth | `/api/auth/*` | ✅ Connected |

Real-time WebSocket is also wired at `/ws` for live signal updates.

---

## 2. Database Schema - What's Stored

### Tables Overview

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | User accounts | email, password (hashed), name, role |
| `assets` | Trading instruments | symbol, name, type, exchange, enabled |
| `strategies` | Signal detection rules | name, timeframe, conditions, formula |
| `signals` | Generated trading alerts | price, ema50, ema200, type, dismissed |
| `broker_configs` | Broker API credentials | apiKey, apiSecret, connected status |
| `notification_configs` | Alert channels | channel, config (SMTP/Twilio/etc), enabled |
| `candle_data` | Historical OHLCV data | open, high, low, close, volume, ema values |
| `logs` | Activity audit trail | action, entity, userId, ipAddress |

### Data Relationships
```
users ──┬── logs (user activities)
        └── (session management)

assets ──┬── signals (generated alerts)
         └── candle_data (price history)

strategies ── signals (which strategy triggered)

broker_configs ── (standalone, API credentials)

notification_configs ── (standalone, channel settings)
```

---

## 3. Setting Up Online PostgreSQL Database

### Option A: Neon (Recommended - Free Tier Available)

1. Go to https://neon.tech and sign up
2. Create a new project
3. Copy the connection string:
   ```
   postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
   ```
4. Set environment variable:
   ```bash
   DATABASE_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require"
   ```

### Option B: Supabase (Free Tier Available)

1. Go to https://supabase.com and sign up
2. Create a new project
3. Go to Settings > Database > Connection string
4. Copy the URI and set as `DATABASE_URL`

### Option C: Railway (Easy Deployment)

1. Go to https://railway.app
2. Create new project > Add PostgreSQL
3. Copy the `DATABASE_URL` from Variables tab

### After Setting DATABASE_URL

Run migrations to create tables:
```bash
npm run db:push
```

---

## 4. Production Deployment Options

### Option A: Railway (Recommended - Easiest)

**Pros**: One-click deploy, free tier, auto-SSL, includes PostgreSQL

1. Push code to GitHub
2. Go to https://railway.app
3. New Project > Deploy from GitHub
4. Add PostgreSQL service
5. Set environment variables:
   - `DATABASE_URL` (auto-set if using Railway PostgreSQL)
   - `SESSION_SECRET` (generate random 32-char string)
   - `NODE_ENV=production`
6. Deploy!

**Cost**: Free tier available, then ~$5/month

### Option B: Render

**Pros**: Free tier, easy setup, auto-deploys

1. Push code to GitHub
2. Go to https://render.com
3. New Web Service > Connect GitHub repo
4. Build Command: `npm run build`
5. Start Command: `npm run start`
6. Add PostgreSQL database from Render
7. Set environment variables

**Cost**: Free tier available

### Option C: Vercel + Neon (For Serverless)

**Pros**: Great for frontend, serverless backend

1. Frontend deploys to Vercel automatically
2. Backend needs adaptation for serverless (not recommended for WebSocket)

**Note**: WebSocket real-time features won't work on Vercel serverless

### Option D: DigitalOcean App Platform

**Pros**: Reliable, good for production

1. Create App from GitHub
2. Add managed PostgreSQL database
3. Set environment variables
4. Deploy

**Cost**: ~$12/month minimum

### Option E: VPS (Most Control)

**Pros**: Full control, cheapest long-term

1. Get VPS from DigitalOcean/Linode/Vultr (~$5/month)
2. Install Node.js, PostgreSQL, Nginx
3. Clone repo, set up PM2 for process management
4. Configure Nginx reverse proxy with SSL (Let's Encrypt)

---

## 5. Environment Variables for Production

Create a `.env` file (or set in your hosting platform):

```bash
# Database (REQUIRED)
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"

# Session (REQUIRED - generate a random 32-char string)
SESSION_SECRET="your-super-secret-session-key-here-32chars"

# Environment
NODE_ENV="production"
PORT=5000

# Optional: Twilio for SMS
TWILIO_ACCOUNT_SID="your-twilio-sid"
TWILIO_AUTH_TOKEN="your-twilio-token"
TWILIO_PHONE_NUMBER="+1234567890"
```

---

## 6. Production Checklist

### Security
- [x] Password hashing with bcrypt
- [x] Rate limiting on auth endpoints
- [x] Safe formula evaluator (no eval/new Function)
- [x] Session-based authentication
- [ ] Set strong `SESSION_SECRET`
- [ ] Enable HTTPS (handled by hosting platform)
- [ ] Set secure cookie options in production

### Database
- [ ] Set `DATABASE_URL`
- [ ] Run `npm run db:push` to create tables
- [ ] Verify tables created

### Monitoring
- [ ] Set up error logging (logs table captures activity)
- [ ] Monitor WebSocket connections

### Broker APIs
- [ ] Get API keys from Zerodha/Upstox/Angel (requires account)
- [ ] Configure in Broker Config page after login

### Notifications
- [ ] Set up SMTP for email (Gmail, SendGrid, etc.)
- [ ] Get Twilio credentials for SMS
- [ ] Create Discord webhook
- [ ] Create Telegram bot

---

## 7. Quick Start Commands

```bash
# Development
npm run dev

# Production build
npm run build

# Production start
npm run start

# Database migrations
npm run db:push

# Type checking
npm run check
```

---

## 8. Memory Storage vs Database Storage

The app automatically switches:
- **No DATABASE_URL**: Uses in-memory storage (data lost on restart)
- **With DATABASE_URL**: Uses PostgreSQL (data persists)

Current status: You're using **in-memory storage** since no DATABASE_URL is set.

---

## Recommended Deployment Path

For a quick production setup:

1. **Database**: Sign up for [Neon](https://neon.tech) (free)
2. **Hosting**: Deploy to [Railway](https://railway.app) (free tier)
3. **Steps**:
   ```bash
   # 1. Push to GitHub
   git add .
   git commit -m "Production ready"
   git push origin main
   
   # 2. Go to Railway, deploy from GitHub
   # 3. Add environment variables
   # 4. Done!
   ```

Total cost: **$0** (free tiers) or **~$5-10/month** for better performance
