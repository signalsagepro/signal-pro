# AWS Lightsail Deployment Guide - Step by Step

## Why Lightsail? ✅ Perfect for Your Budget!

**Your Budget**: $100 for 6 months = ~$16.67/month

**Lightsail Cost Breakdown**:
- **PostgreSQL Database**: $15/month (1 GB RAM, 40 GB SSD)
- **Application Instance**: $5/month (512 MB RAM, 1 vCPU, 20 GB SSD)
- **Total**: **$20/month** (slightly over budget, but best option)

**Alternative (Cheaper)**:
- **Application Instance**: $5/month
- **Use Neon PostgreSQL**: Free tier (0.5 GB storage)
- **Total**: **$5/month** ⭐ RECOMMENDED

---

## Architecture

```
┌─────────────────────────────────────────┐
│  AWS Lightsail Instance ($5/month)      │
│  ┌─────────────────────────────────┐   │
│  │  Node.js Backend (Port 5000)    │   │
│  │  + React Frontend (static)      │   │
│  └─────────────────────────────────┘   │
│           ↓                              │
│  Nginx (Reverse Proxy + SSL)            │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│  Neon PostgreSQL (Free)                 │
│  or Lightsail DB ($15/month)            │
└─────────────────────────────────────────┘
```

---

## STEP 1: Create PostgreSQL Database

### Option A: Neon (Free - RECOMMENDED for Budget)

**1.1 Sign up at Neon**:
- Go to https://neon.tech
- Sign up with GitHub/Google
- Create new project: "signalpro"

**1.2 Get Connection String**:
```
postgresql://neondb_owner:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
```

**1.3 Save this connection string** - you'll need it later!

**Cost**: $0 (Free tier: 0.5 GB storage, 100 hours compute/month)

---

### Option B: Lightsail PostgreSQL (If you want AWS-only)

**1.1 Go to AWS Lightsail Console**:
- https://lightsail.aws.amazon.com
- Click "Databases" → "Create database"

**1.2 Configure Database**:
- **Database engine**: PostgreSQL
- **Blueprint**: Standard (PostgreSQL 15)
- **Plan**: $15/month (1 GB RAM, 40 GB SSD)
- **Database name**: `signalpro`
- **Master username**: `postgres`
- **Master password**: (create a strong password - SAVE THIS!)
- **Identify your database**: `signalpro-db`

**1.3 Create Database** (takes 5-10 minutes)

**1.4 Get Connection String**:
- Click on your database
- Go to "Connect" tab
- Copy endpoint: `signalpro-db.xxxxx.us-east-1.rds.amazonaws.com`
- Connection string format:
```
postgresql://postgres:YOUR_PASSWORD@signalpro-db.xxxxx.us-east-1.rds.amazonaws.com:5432/postgres
```

**1.5 Enable Public Access** (for now):
- Go to "Networking" tab
- Enable "Public mode"
- Note: We'll secure this later

**Cost**: $15/month

---

## STEP 2: Create Lightsail Instance

**2.1 Go to Lightsail Console**:
- Click "Instances" → "Create instance"

**2.2 Select Instance Location**:
- Region: **US East (N. Virginia)** (or closest to you)
- Availability Zone: Default

**2.3 Pick Instance Image**:
- Platform: **Linux/Unix**
- Blueprint: **OS Only** → **Ubuntu 22.04 LTS**

**2.4 Choose Instance Plan**:
- **$5/month**: 512 MB RAM, 1 vCPU, 20 GB SSD, 1 TB transfer ⭐ RECOMMENDED
- Or **$10/month**: 1 GB RAM (if you need more power)

**2.5 Name Your Instance**:
- Instance name: `signalpro-app`

**2.6 Create Instance** (takes 2-3 minutes)

---

## STEP 3: Connect to Your Instance

**3.1 SSH into Instance**:
- Click on your instance `signalpro-app`
- Click "Connect using SSH" (opens browser terminal)
- Or use SSH client:
```bash
ssh -i LightsailDefaultKey-us-east-1.pem ubuntu@YOUR_INSTANCE_IP
```

**3.2 Update System**:
```bash
sudo apt update
sudo apt upgrade -y
```

---

## STEP 4: Install Node.js

**4.1 Install Node.js 20**:
```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

**4.2 Install PM2** (Process Manager):
```bash
sudo npm install -g pm2
```

---

## STEP 5: Install and Configure Nginx

**5.1 Install Nginx**:
```bash
sudo apt install -y nginx
```

**5.2 Configure Firewall**:
```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

---

## STEP 6: Deploy Your Application

**6.1 Clone Your Repository**:
```bash
cd /home/ubuntu
git clone https://github.com/signalsagepro/signal-pro.git
cd signal-pro
```

**6.2 Install Dependencies**:
```bash
npm install
```

**6.3 Build Application**:
```bash
npm run build
```

**6.4 Create Environment File**:
```bash
nano .env
```

**Paste this (replace with your values)**:
```bash
# Database (REQUIRED - use your Neon or Lightsail connection string)
DATABASE_URL="postgresql://neondb_owner:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Session Secret (generate random 32 characters)
SESSION_SECRET="your-random-32-character-secret-key"

# Environment
NODE_ENV=production
PORT=5000

# Disable simulated data (use real broker data only)
DISABLE_SIMULATED_DATA=true
```

**Save and exit**: `Ctrl+X`, then `Y`, then `Enter`

**6.5 Run Database Migrations**:
```bash
npm run db:push
```

**Expected output**:
```
✓ Changes applied
Creating super admin user...
Super admin created successfully
Initializing default data in database...
Default data initialized successfully
```

---

## STEP 7: Start Application with PM2

**7.1 Start App**:
```bash
pm2 start npm --name "signalpro" -- start
```

**7.2 Configure PM2 to Start on Boot**:
```bash
pm2 startup
# Copy and run the command it outputs (starts with 'sudo')

pm2 save
```

**7.3 Check Status**:
```bash
pm2 status
pm2 logs signalpro
```

**7.4 Test Application**:
```bash
curl http://localhost:5000/api/health
```

Should return:
```json
{"status":"healthy","timestamp":"...","uptime":...}
```

---

## STEP 8: Configure Nginx as Reverse Proxy

**8.1 Create Nginx Configuration**:
```bash
sudo nano /etc/nginx/sites-available/signalpro
```

**8.2 Paste This Configuration**:
```nginx
server {
    listen 80;
    server_name YOUR_INSTANCE_IP;  # Replace with your Lightsail IP

    # Increase body size for file uploads
    client_max_body_size 10M;

    # Frontend (React static files)
    location / {
        root /home/ubuntu/signal-pro/dist/public;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
```

**8.3 Enable Configuration**:
```bash
sudo ln -s /etc/nginx/sites-available/signalpro /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default config
```

**8.4 Test Nginx Configuration**:
```bash
sudo nginx -t
```

Should show: `syntax is ok` and `test is successful`

**8.5 Restart Nginx**:
```bash
sudo systemctl restart nginx
```

---

## STEP 9: Configure Lightsail Networking

**9.1 Open Ports in Lightsail**:
- Go to your instance in Lightsail console
- Click "Networking" tab
- Under "IPv4 Firewall", add rules:
  - **HTTP**: Port 80, TCP
  - **HTTPS**: Port 443, TCP (for later SSL)
  - **SSH**: Port 22, TCP (already there)

**9.2 Get Your Instance IP**:
- Copy the "Public IP" from instance dashboard
- Example: `3.85.123.45`

---

## STEP 10: Test Your Deployment

**10.1 Open in Browser**:
```
http://YOUR_INSTANCE_IP
```

**10.2 Login**:
- Email: `admin@signalsage.cyborg`
- Password: `cyborg@1234`

**10.3 Verify**:
- ✅ Dashboard loads
- ✅ Can create strategies
- ✅ Can configure brokers
- ✅ Can set up notifications

---

## STEP 11: Set Up Domain (Optional but Recommended)

### Option A: Use Lightsail DNS (Easiest)

**11.1 Create Static IP**:
- Go to "Networking" → "Create static IP"
- Attach to your instance `signalpro-app`
- Name: `signalpro-static-ip`

**11.2 Buy Domain**:
- Namecheap: $8-10/year for .com
- Or use Route 53: $12/year

**11.3 Configure DNS**:
- Go to your domain registrar
- Add A record:
  - Host: `@` (or `app`)
  - Value: Your Lightsail static IP
  - TTL: 300

**11.4 Wait for DNS Propagation** (5-30 minutes)

---

## STEP 12: Set Up SSL Certificate (Free)

**12.1 Install Certbot**:
```bash
sudo apt install -y certbot python3-certbot-nginx
```

**12.2 Get SSL Certificate**:
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

**Follow prompts**:
- Enter email
- Agree to terms
- Choose redirect HTTP to HTTPS: Yes

**12.3 Auto-Renewal**:
```bash
sudo certbot renew --dry-run
```

Certbot automatically sets up renewal cron job.

---

## STEP 13: Update Nginx for Domain

**13.1 Edit Nginx Config**:
```bash
sudo nano /etc/nginx/sites-available/signalpro
```

**13.2 Change `server_name`**:
```nginx
server_name yourdomain.com www.yourdomain.com;
```

**13.3 Restart Nginx**:
```bash
sudo nginx -t
sudo systemctl restart nginx
```

---

## Maintenance Commands

### View Application Logs
```bash
pm2 logs signalpro
pm2 logs signalpro --lines 100
```

### Restart Application
```bash
pm2 restart signalpro
```

### Stop Application
```bash
pm2 stop signalpro
```

### Update Application
```bash
cd /home/ubuntu/signal-pro
git pull origin main
npm install
npm run build
pm2 restart signalpro
```

### Check System Resources
```bash
pm2 monit
htop  # Install: sudo apt install htop
```

### Database Backup (if using Lightsail DB)
```bash
# Automatic backups enabled by default
# Manual snapshot: Lightsail console → Database → Create snapshot
```

---

## Troubleshooting

### Application Won't Start
```bash
# Check logs
pm2 logs signalpro

# Check if port 5000 is in use
sudo lsof -i :5000

# Restart
pm2 restart signalpro
```

### Nginx Errors
```bash
# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### Database Connection Issues
```bash
# Test connection
psql "postgresql://user:pass@host:5432/db"

# Check environment variables
cat /home/ubuntu/signal-pro/.env
```

### Out of Memory
```bash
# Check memory
free -h

# If using $5 plan (512 MB), consider:
# 1. Upgrade to $10 plan (1 GB)
# 2. Add swap space:
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Cost Summary

### Budget Option (RECOMMENDED)
| Item | Cost |
|------|------|
| Lightsail Instance ($5/month) | $5 |
| Neon PostgreSQL (Free) | $0 |
| **Total** | **$5/month** |
| **6 Months** | **$30** |

**Remaining Budget**: $70 for domain, scaling, or upgrades

### Full AWS Option
| Item | Cost |
|------|------|
| Lightsail Instance ($5/month) | $5 |
| Lightsail PostgreSQL ($15/month) | $15 |
| **Total** | **$20/month** |
| **6 Months** | **$120** |

**Over budget by $20**, but fully AWS-managed

---

## Security Checklist

- [x] Firewall configured (UFW)
- [x] SSH key authentication
- [x] Strong database password
- [x] Environment variables secured
- [x] Nginx reverse proxy
- [ ] SSL certificate (after domain)
- [ ] Regular backups
- [ ] Database in private mode (after testing)

---

## Quick Reference

### SSH into Instance
```bash
# From Lightsail console: Click "Connect using SSH"
# Or from terminal:
ssh ubuntu@YOUR_INSTANCE_IP
```

### Application Commands
```bash
pm2 status           # Check status
pm2 logs signalpro   # View logs
pm2 restart signalpro # Restart app
pm2 stop signalpro   # Stop app
```

### Nginx Commands
```bash
sudo nginx -t                    # Test config
sudo systemctl restart nginx     # Restart
sudo systemctl status nginx      # Check status
```

### Update Application
```bash
cd /home/ubuntu/signal-pro
git pull
npm install
npm run build
pm2 restart signalpro
```

---

## Summary

✅ **Step 1**: Create PostgreSQL database (Neon free or Lightsail $15)  
✅ **Step 2**: Create Lightsail instance ($5/month)  
✅ **Step 3**: Install Node.js, PM2, Nginx  
✅ **Step 4**: Deploy application  
✅ **Step 5**: Configure Nginx reverse proxy  
✅ **Step 6**: Open firewall ports  
✅ **Step 7**: Test deployment  
✅ **Step 8**: (Optional) Add domain + SSL  

**Total Time**: 30-45 minutes  
**Total Cost**: $5-20/month  
**Your Budget**: $100 for 6 months ✅ Fits perfectly!

---

## Next Steps

1. **Create Neon database** (free) → Get connection string
2. **Create Lightsail instance** ($5/month)
3. **Follow steps 3-10** to deploy
4. **Test at** `http://YOUR_IP`
5. **(Optional)** Add domain + SSL

**Ready to deploy? Start with Step 1!** 🚀
