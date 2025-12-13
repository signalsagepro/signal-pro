# AWS Deployment Guide for SignalPro

## Recommended AWS Architecture

### Option 1: AWS Elastic Beanstalk (Easiest) ⭐ RECOMMENDED

**Best for**: Quick deployment, managed infrastructure, auto-scaling

**Services Used**:
- **Elastic Beanstalk**: Application hosting (Node.js)
- **RDS PostgreSQL**: Managed database
- **Route 53**: Domain management (optional)
- **Certificate Manager**: Free SSL certificates

**Cost**: ~$20-40/month
- Elastic Beanstalk: Free (pay for EC2)
- t3.micro EC2: ~$7.50/month
- RDS db.t3.micro: ~$15/month
- Route 53: ~$0.50/month (if using domain)

**Pros**:
- ✅ Easiest deployment
- ✅ Auto-scaling
- ✅ Load balancing included
- ✅ Health monitoring
- ✅ Easy rollbacks

---

### Option 2: AWS ECS Fargate (Containerized)

**Best for**: Docker expertise, serverless containers

**Services Used**:
- **ECS Fargate**: Serverless containers
- **RDS PostgreSQL**: Managed database
- **Application Load Balancer**: Traffic distribution
- **Route 53**: Domain management

**Cost**: ~$25-50/month
- Fargate: ~$15-30/month
- RDS: ~$15/month
- ALB: ~$16/month

**Pros**:
- ✅ Uses your Dockerfile
- ✅ No server management
- ✅ Better isolation
- ✅ Easy scaling

---

### Option 3: AWS EC2 + RDS (Full Control)

**Best for**: Maximum control, custom configuration

**Services Used**:
- **EC2**: Virtual server (t3.small or t3.medium)
- **RDS PostgreSQL**: Managed database
- **Elastic IP**: Static IP address
- **Route 53**: Domain management

**Cost**: ~$25-50/month
- EC2 t3.small: ~$15/month
- RDS: ~$15/month
- Elastic IP: Free (if attached)

**Pros**:
- ✅ Full control
- ✅ SSH access
- ✅ Custom configurations
- ✅ Can install anything

---

## Domain Name - Do You Need One?

### Without Domain (Free)
- ✅ Use AWS-provided URLs
- ✅ Elastic Beanstalk: `signalpro.us-east-1.elasticbeanstalk.com`
- ✅ ALB: `signalpro-alb-123456.us-east-1.elb.amazonaws.com`
- ⚠️ URLs are long and not branded

### With Domain (Recommended)
- ✅ Professional: `signalpro.com` or `app.signalpro.com`
- ✅ Easy to remember
- ✅ Free SSL certificate via AWS Certificate Manager
- 💰 Cost: $10-15/year (domain registration)

**Where to Buy Domain**:
1. **AWS Route 53**: $12/year for .com (integrated)
2. **Namecheap**: $8-10/year
3. **Google Domains**: $12/year
4. **GoDaddy**: $10-15/year

---

## Step-by-Step: AWS Elastic Beanstalk Deployment

### Prerequisites
1. AWS Account
2. AWS CLI installed
3. EB CLI installed: `pip install awsebcli`

### Step 1: Prepare Application

**1.1 Create `.ebextensions/` folder**:
```bash
mkdir .ebextensions
```

**1.2 Create `.ebextensions/nodecommand.config`**:
```yaml
option_settings:
  aws:elasticbeanstalk:container:nodejs:
    NodeCommand: "npm start"
  aws:elasticbeanstalk:application:environment:
    NODE_ENV: production
    PORT: 8080
```

**1.3 Update `package.json` scripts**:
```json
{
  "scripts": {
    "start": "node dist/index.js",
    "build": "tsc",
    "postinstall": "npm run build"
  }
}
```

### Step 2: Create RDS PostgreSQL Database

**2.1 Go to AWS RDS Console**:
- Create database → PostgreSQL
- Template: Free tier (or Production)
- DB instance: `db.t3.micro`
- Master username: `postgres`
- Master password: (save this!)
- Public access: Yes (for now)
- Create database

**2.2 Get Connection String**:
```
postgresql://postgres:YOUR_PASSWORD@signalpro-db.xxxxx.us-east-1.rds.amazonaws.com:5432/postgres
```

### Step 3: Initialize Elastic Beanstalk

```bash
# Initialize EB
eb init

# Select:
# - Region: us-east-1 (or closest to you)
# - Application name: signalpro
# - Platform: Node.js
# - SSH: Yes (recommended)

# Create environment
eb create signalpro-prod

# This will:
# - Create EC2 instance
# - Set up load balancer
# - Configure auto-scaling
# - Deploy your app
```

### Step 4: Set Environment Variables

```bash
# Set environment variables
eb setenv \
  DATABASE_URL="postgresql://postgres:PASSWORD@your-rds-endpoint:5432/postgres" \
  SESSION_SECRET="your-random-32-char-secret" \
  NODE_ENV="production" \
  DISABLE_SIMULATED_DATA="true"

# Optional: Notification configs
eb setenv \
  TWILIO_ACCOUNT_SID="your-sid" \
  TWILIO_AUTH_TOKEN="your-token"
```

### Step 5: Deploy

```bash
# Deploy application
eb deploy

# Check status
eb status

# View logs
eb logs

# Open in browser
eb open
```

### Step 6: Run Database Migrations

```bash
# SSH into instance
eb ssh

# Run migrations
cd /var/app/current
DATABASE_URL="your-connection-string" npm run db:push

# Exit
exit
```

---

## Domain Setup (Optional but Recommended)

### Option A: Using Route 53 (AWS Domain)

**1. Register Domain in Route 53**:
- Go to Route 53 → Register domain
- Search for `signalpro.com` (or your choice)
- Register (~$12/year)

**2. Create SSL Certificate**:
- Go to Certificate Manager
- Request certificate
- Domain: `signalpro.com` and `*.signalpro.com`
- Validation: DNS (automatic if using Route 53)

**3. Configure Elastic Beanstalk**:
```bash
# Add HTTPS listener
eb config

# In the editor, add:
aws:elbv2:listener:443:
  Protocol: HTTPS
  SSLCertificateArns: arn:aws:acm:region:account:certificate/xxx
```

**4. Point Domain to Elastic Beanstalk**:
- Route 53 → Hosted zones → Your domain
- Create record:
  - Name: `app` (for app.signalpro.com) or leave blank
  - Type: A - Alias
  - Alias target: Your Elastic Beanstalk environment

### Option B: Using External Domain (Namecheap, etc.)

**1. Buy domain from Namecheap/GoDaddy**

**2. Get Elastic Beanstalk URL**:
```bash
eb status
# Copy the CNAME (e.g., signalpro-prod.us-east-1.elasticbeanstalk.com)
```

**3. Configure DNS**:
- Go to your domain registrar
- Add CNAME record:
  - Host: `app` (or `@` for root)
  - Value: Your EB CNAME
  - TTL: 300

**4. Wait for DNS propagation** (5-30 minutes)

---

## Database Cleanup - 24 Hour Data Retention

### What Data to Keep vs Delete

**KEEP (Required for EMA calculation)**:
- ✅ `candle_data`: Last 200+ candles per asset (for EMA200)
- ✅ `users`: All user accounts
- ✅ `assets`: All trading instruments
- ✅ `strategies`: All strategies
- ✅ `broker_configs`: Broker configurations
- ✅ `notification_configs`: Notification settings

**DELETE (After 24 hours)**:
- ❌ `signals`: Old trading signals (keep last 24h)
- ❌ `logs`: Activity logs (keep last 24h)
- ❌ Old `candle_data`: Keep only last 250 candles per asset/timeframe

### Implementation: Cleanup Job

Create `server/jobs/database-cleanup.ts`:

```typescript
import { db } from "../db";
import { signals, logs, candleData } from "@shared/schema";
import { lt, sql } from "drizzle-orm";

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
    // This query keeps the most recent 250 candles for each asset-timeframe combination
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
    console.log(`[Cleanup] Cleanup completed successfully`);
  } catch (error) {
    console.error(`[Cleanup] Error during cleanup:`, error);
  }
}

// Run cleanup every 24 hours
export function startCleanupJob() {
  // Run immediately on startup
  cleanupOldData();

  // Then run every 24 hours
  setInterval(() => {
    cleanupOldData();
  }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds

  console.log("[Cleanup] Database cleanup job scheduled (every 24 hours)");
}
```

### Integrate Cleanup Job

Update `server/app.ts`:

```typescript
import { startCleanupJob } from "./jobs/database-cleanup";

// In the server.listen callback:
server.listen(port, "0.0.0.0", () => {
  log(`serving on port ${port}`);
  
  // Start cleanup job (only if using database)
  if (process.env.DATABASE_URL) {
    startCleanupJob();
  }
  
  // ... rest of startup code
});
```

---

## Why Keep 250 Candles?

**EMA Calculation Requirements**:
- EMA200 needs at least 200 data points
- Buffer of 50 extra candles for accuracy
- Total: 250 candles per asset per timeframe

**Storage Impact**:
- 25 assets × 2 timeframes × 250 candles = 12,500 records
- Each record: ~100 bytes
- Total: ~1.25 MB (negligible)

---

## Cost Breakdown

### AWS Elastic Beanstalk Setup

| Service | Tier | Monthly Cost |
|---------|------|--------------|
| EC2 t3.micro | 1 instance | $7.50 |
| RDS db.t3.micro | PostgreSQL | $15.00 |
| Elastic Beanstalk | Free | $0.00 |
| Data Transfer | 10 GB/month | $1.00 |
| **Total** | | **~$23.50/month** |

### With Domain

| Item | Cost |
|------|------|
| Domain (.com) | $12/year |
| Route 53 Hosted Zone | $0.50/month |
| SSL Certificate | Free (AWS) |
| **Total Additional** | **~$12.50/year** |

**Grand Total**: ~$25/month + $12/year for domain

---

## Deployment Checklist

### Pre-Deployment
- [ ] AWS account created
- [ ] AWS CLI installed
- [ ] EB CLI installed
- [ ] Application tested locally
- [ ] Environment variables documented

### Database
- [ ] RDS PostgreSQL created
- [ ] Connection string saved
- [ ] Database migrations ready
- [ ] Cleanup job implemented

### Application
- [ ] `DISABLE_SIMULATED_DATA=true` set
- [ ] Session secret generated
- [ ] Broker API keys ready
- [ ] Notification channels configured

### Domain (Optional)
- [ ] Domain purchased
- [ ] DNS configured
- [ ] SSL certificate created
- [ ] HTTPS enabled

### Post-Deployment
- [ ] Run database migrations
- [ ] Test login/signup
- [ ] Test broker connections
- [ ] Test notifications
- [ ] Monitor logs
- [ ] Set up CloudWatch alarms

---

## Alternative: Deploy to Railway (Easier)

If AWS seems complex, **Railway** is simpler:

**Pros**:
- ✅ One-click deploy from GitHub
- ✅ Automatic PostgreSQL database
- ✅ Free SSL certificates
- ✅ Custom domains supported
- ✅ No AWS expertise needed

**Cost**: ~$10-20/month

**Steps**:
1. Push to GitHub
2. Connect Railway to GitHub
3. Add environment variables
4. Deploy!

---

## Recommendation

**For Production**:
1. **Start with Railway** ($10-20/month) - Easiest
2. **Move to AWS Elastic Beanstalk** when scaling ($25/month)
3. **Consider ECS Fargate** for enterprise ($50+/month)

**Domain**: Buy a domain ($12/year) - worth it for professionalism

**Database Cleanup**: Implemented above - keeps last 24h of signals/logs, 250 candles for EMA

---

## Summary

✅ **AWS Elastic Beanstalk**: Best AWS option, ~$25/month  
✅ **Domain**: Optional but recommended, $12/year  
✅ **Database Cleanup**: Automated job, runs every 24 hours  
✅ **EMA Data**: Keeps 250 candles per asset (required)  
✅ **Signals/Logs**: Deleted after 24 hours  

**Next Steps**: Choose deployment platform, implement cleanup job, deploy!
