# Google Cloud Platform (GCP) Deployment Guide

## GCP Deployment Options

### Option 1: Cloud Run + Cloud SQL (Serverless - RECOMMENDED) ⭐

**Best for**: Automatic scaling, pay-per-use, minimal management

**Services**:
- **Cloud Run**: Serverless containers (auto-scales to zero)
- **Cloud SQL**: Managed PostgreSQL database
- **Cloud Build**: Automatic Docker builds from GitHub

**Cost**: ~$15-30/month
- Cloud Run: $0.00002400/vCPU-second + $0.00000250/GiB-second (typically $5-10/month)
- Cloud SQL (db-f1-micro): ~$10/month
- Cloud Build: Free tier (120 build-minutes/day)

**Pros**:
- ✅ Auto-scales (0 to 1000+ instances)
- ✅ Pay only for actual usage
- ✅ Zero maintenance
- ✅ Built-in HTTPS/SSL
- ✅ Easy CI/CD from GitHub

---

### Option 2: Compute Engine + Cloud SQL (VM-based)

**Best for**: Full control, SSH access, traditional deployment

**Services**:
- **Compute Engine**: Virtual machine (e2-micro or e2-small)
- **Cloud SQL**: Managed PostgreSQL

**Cost**: ~$20-35/month
- e2-micro (free tier eligible): $0-7/month
- Cloud SQL: ~$10/month
- Static IP: $3/month

**Pros**:
- ✅ Full control (like Lightsail)
- ✅ SSH access
- ✅ Free tier available
- ✅ Similar to AWS EC2

---

### Option 3: App Engine + Cloud SQL (PaaS)

**Best for**: Simple deployment, no Docker needed

**Cost**: ~$20-40/month

**Pros**:
- ✅ Simple deployment
- ✅ Auto-scaling
- ✅ No container management

---

## RECOMMENDED: Cloud Run + Cloud SQL Deployment

---

## STEP 1: Set Up Google Cloud Project

**1.1 Create GCP Account**:
- Go to https://console.cloud.google.com
- Sign up (get $300 free credits for 90 days)
- Create billing account

**1.2 Create New Project**:
- Click "Select a project" → "New Project"
- Project name: `signalpro`
- Project ID: `signalpro-xxxxx` (auto-generated)
- Click "Create"

**1.3 Enable Required APIs**:
```bash
# Install gcloud CLI first (see below)
gcloud services enable \
  run.googleapis.com \
  sql-component.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

---

## STEP 2: Install Google Cloud CLI

### macOS
```bash
# Download and install
curl https://sdk.cloud.google.com | bash

# Restart terminal, then initialize
gcloud init

# Select your project: signalpro
# Select region: us-central1 (or closest to you)
```

### Linux
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init
```

### Windows
- Download installer: https://cloud.google.com/sdk/docs/install
- Run installer
- Open Cloud SDK Shell
- Run `gcloud init`

---

## STEP 3: Create Cloud SQL PostgreSQL Database

**3.1 Create Database Instance**:
```bash
gcloud sql instances create signalpro-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --root-password=YOUR_STRONG_PASSWORD \
  --storage-type=HDD \
  --storage-size=10GB
```

**Options explained**:
- `db-f1-micro`: Cheapest tier (0.6 GB RAM, shared CPU) - ~$10/month
- `db-g1-small`: Better performance (1.7 GB RAM) - ~$25/month
- Region: Choose closest to your users

**This takes 5-10 minutes to create**

**3.2 Create Database**:
```bash
gcloud sql databases create signalpro \
  --instance=signalpro-db
```

**3.3 Create Database User**:
```bash
gcloud sql users create signalpro \
  --instance=signalpro-db \
  --password=YOUR_DB_PASSWORD
```

**3.4 Get Connection Name**:
```bash
gcloud sql instances describe signalpro-db --format="value(connectionName)"
```

**Output example**: `signalpro-xxxxx:us-central1:signalpro-db`

**Save this connection name!**

---

## STEP 4: Prepare Application for Cloud Run

**4.1 Verify Dockerfile Exists**:

Your `Dockerfile` is already created. Let's verify it's optimized:

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/migrations ./migrations
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1
CMD ["node", "dist/index.js"]
```

**4.2 Create `.dockerignore`**:
```bash
cat > .dockerignore << 'EOF'
node_modules
.git
.env
.env.local
dist
*.log
.DS_Store
coverage
.vscode
.idea
EOF
```

**4.3 Update `server/app.ts` Port** (if needed):

Cloud Run requires port 8080 or uses `PORT` env variable. Your app already uses `process.env.PORT`, so it's ready!

---

## STEP 5: Build and Push Docker Image

**5.1 Configure Docker for GCP**:
```bash
gcloud auth configure-docker
```

**5.2 Build Docker Image**:
```bash
# Set project ID
export PROJECT_ID=$(gcloud config get-value project)

# Build image
docker build -t gcr.io/$PROJECT_ID/signalpro:latest .
```

**5.3 Push to Google Container Registry**:
```bash
docker push gcr.io/$PROJECT_ID/signalpro:latest
```

**Alternative: Use Cloud Build** (builds in cloud):
```bash
gcloud builds submit --tag gcr.io/$PROJECT_ID/signalpro:latest
```

---

## STEP 6: Deploy to Cloud Run

**6.1 Get Cloud SQL Connection Name**:
```bash
export CONNECTION_NAME=$(gcloud sql instances describe signalpro-db --format="value(connectionName)")
echo $CONNECTION_NAME
```

**6.2 Create Connection String**:
```
postgresql://signalpro:YOUR_DB_PASSWORD@localhost/signalpro?host=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME
```

**Example**:
```
postgresql://signalpro:mypassword@localhost/signalpro?host=/cloudsql/signalpro-xxxxx:us-central1:signalpro-db
```

**6.3 Deploy to Cloud Run**:
```bash
gcloud run deploy signalpro \
  --image gcr.io/$PROJECT_ID/signalpro:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --add-cloudsql-instances $CONNECTION_NAME \
  --set-env-vars "DATABASE_URL=postgresql://signalpro:YOUR_DB_PASSWORD@localhost/signalpro?host=/cloudsql/$CONNECTION_NAME" \
  --set-env-vars "SESSION_SECRET=your-random-32-character-secret" \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "DISABLE_SIMULATED_DATA=true" \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10 \
  --min-instances 0
```

**Options explained**:
- `--allow-unauthenticated`: Public access (your app handles auth)
- `--add-cloudsql-instances`: Connects to Cloud SQL via Unix socket
- `--memory 512Mi`: 512 MB RAM (can increase if needed)
- `--min-instances 0`: Scales to zero when not in use (saves money)
- `--max-instances 10`: Maximum concurrent instances

**6.4 Get Service URL**:

After deployment completes, you'll see:
```
Service [signalpro] revision [signalpro-00001-xxx] has been deployed and is serving 100 percent of traffic.
Service URL: https://signalpro-xxxxx-uc.a.run.app
```

**Save this URL!**

---

## STEP 7: Run Database Migrations

**7.1 Connect to Cloud SQL**:
```bash
gcloud sql connect signalpro-db --user=signalpro --quiet
```

**Enter password when prompted**

**7.2 Or use Cloud SQL Proxy** (recommended):
```bash
# Download Cloud SQL Proxy
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.amd64
chmod +x cloud-sql-proxy

# Start proxy
./cloud-sql-proxy $CONNECTION_NAME
```

**7.3 Run Migrations from Local**:

In a new terminal:
```bash
export DATABASE_URL="postgresql://signalpro:YOUR_PASSWORD@127.0.0.1:5432/signalpro"
npm run db:push
```

**Or run migrations in Cloud Run** (one-time job):
```bash
gcloud run jobs create signalpro-migrate \
  --image gcr.io/$PROJECT_ID/signalpro:latest \
  --region us-central1 \
  --add-cloudsql-instances $CONNECTION_NAME \
  --set-env-vars "DATABASE_URL=postgresql://signalpro:YOUR_PASSWORD@localhost/signalpro?host=/cloudsql/$CONNECTION_NAME" \
  --command "npm" \
  --args "run,db:push"

# Execute job
gcloud run jobs execute signalpro-migrate --region us-central1
```

---

## STEP 8: Test Deployment

**8.1 Open Your App**:
```
https://signalpro-xxxxx-uc.a.run.app
```

**8.2 Login**:
- Email: `admin@signalsage.cyborg`
- Password: `cyborg@1234`

**8.3 Verify**:
- ✅ Dashboard loads
- ✅ Can create strategies
- ✅ Can configure brokers
- ✅ WebSocket connections work

---

## STEP 9: Set Up Custom Domain (Optional)

**9.1 Verify Domain Ownership**:
- Go to Cloud Console → Cloud Run → Your service
- Click "Manage Custom Domains"
- Click "Add Mapping"
- Enter your domain: `app.yourdomain.com`
- Follow verification steps (add TXT record to DNS)

**9.2 Configure DNS**:
- Add CNAME record:
  - Name: `app`
  - Value: `ghs.googlehosted.com`
  - TTL: 300

**9.3 SSL Certificate**:
- Automatically provisioned by Google (free)
- Takes 15-60 minutes to activate

---

## STEP 10: Set Up Continuous Deployment (CI/CD)

**10.1 Connect GitHub Repository**:
```bash
# Install Cloud Build GitHub app
# Go to: https://github.com/apps/google-cloud-build
# Install on your repository
```

**10.2 Create `cloudbuild.yaml`**:
```yaml
steps:
  # Build Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/signalpro:$COMMIT_SHA', '.']
  
  # Push to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/signalpro:$COMMIT_SHA']
  
  # Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'signalpro'
      - '--image'
      - 'gcr.io/$PROJECT_ID/signalpro:$COMMIT_SHA'
      - '--region'
      - 'us-central1'
      - '--platform'
      - 'managed'

images:
  - 'gcr.io/$PROJECT_ID/signalpro:$COMMIT_SHA'
```

**10.3 Create Build Trigger**:
```bash
gcloud builds triggers create github \
  --repo-name=signal-pro \
  --repo-owner=signalsagepro \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml
```

**Now every push to `main` branch auto-deploys!**

---

## Alternative: Compute Engine Deployment

If you prefer VM-based deployment (like Lightsail):

### Create VM Instance
```bash
gcloud compute instances create signalpro-vm \
  --machine-type=e2-micro \
  --zone=us-central1-a \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --tags=http-server,https-server
```

### Configure Firewall
```bash
gcloud compute firewall-rules create allow-http \
  --allow tcp:80 \
  --target-tags http-server

gcloud compute firewall-rules create allow-https \
  --allow tcp:443 \
  --target-tags https-server
```

### SSH and Deploy
```bash
gcloud compute ssh signalpro-vm --zone=us-central1-a

# Then follow same steps as Lightsail guide:
# - Install Node.js, PM2, Nginx
# - Clone repo, build, configure
# - Use Cloud SQL connection string
```

---

## Cost Breakdown

### Cloud Run + Cloud SQL (Recommended)
| Service | Tier | Monthly Cost |
|---------|------|--------------|
| Cloud Run | 512 MB, 1 vCPU | $5-10 (pay-per-use) |
| Cloud SQL | db-f1-micro | $10 |
| Cloud Build | Free tier | $0 |
| Networking | 1 GB egress | $0.12 |
| **Total** | | **~$15-20/month** |

### Compute Engine + Cloud SQL
| Service | Tier | Monthly Cost |
|---------|------|--------------|
| Compute Engine | e2-micro | $7 (or free tier) |
| Cloud SQL | db-f1-micro | $10 |
| Static IP | Reserved | $3 |
| **Total** | | **~$20/month** |

### Free Tier Benefits
- **Compute Engine**: e2-micro free in us-central1, us-east1, us-west1
- **Cloud Build**: 120 build-minutes/day free
- **Cloud Run**: 2M requests/month free
- **$300 credits** for 90 days (new accounts)

---

## Environment Variables Management

### Using Secret Manager (Recommended)
```bash
# Create secret
echo -n "your-secret-value" | gcloud secrets create session-secret --data-file=-

# Grant Cloud Run access
gcloud secrets add-iam-policy-binding session-secret \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Deploy with secret
gcloud run deploy signalpro \
  --image gcr.io/$PROJECT_ID/signalpro:latest \
  --update-secrets SESSION_SECRET=session-secret:latest
```

---

## Monitoring and Logging

### View Logs
```bash
# Cloud Run logs
gcloud run services logs read signalpro --region us-central1 --limit 50

# Follow logs in real-time
gcloud run services logs tail signalpro --region us-central1
```

### Cloud Console
- Go to Cloud Console → Cloud Run → signalpro
- Click "Logs" tab
- View metrics, requests, errors

### Set Up Alerts
- Cloud Console → Monitoring → Alerting
- Create alert for:
  - High error rate
  - High latency
  - Instance count

---

## Scaling Configuration

### Auto-scaling Settings
```bash
gcloud run services update signalpro \
  --region us-central1 \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 80 \
  --cpu-throttling \
  --memory 512Mi
```

**Options**:
- `--min-instances 0`: Scale to zero (save money)
- `--min-instances 1`: Always-on (faster response)
- `--max-instances 10`: Limit concurrent instances
- `--concurrency 80`: Requests per instance

---

## Database Backup

### Automatic Backups (Enabled by Default)
```bash
# Configure backup window
gcloud sql instances patch signalpro-db \
  --backup-start-time=03:00
```

### Manual Backup
```bash
gcloud sql backups create --instance=signalpro-db
```

### List Backups
```bash
gcloud sql backups list --instance=signalpro-db
```

---

## Update Application

### Manual Update
```bash
# Build new image
gcloud builds submit --tag gcr.io/$PROJECT_ID/signalpro:latest

# Deploy new version
gcloud run deploy signalpro \
  --image gcr.io/$PROJECT_ID/signalpro:latest \
  --region us-central1
```

### Automatic (with CI/CD)
```bash
git add .
git commit -m "Update application"
git push origin main
# Automatically builds and deploys!
```

---

## Troubleshooting

### Container Fails to Start
```bash
# Check logs
gcloud run services logs read signalpro --region us-central1 --limit 100

# Common issues:
# - PORT not set to 8080
# - Database connection failed
# - Missing environment variables
```

### Database Connection Issues
```bash
# Test Cloud SQL connection
gcloud sql connect signalpro-db --user=signalpro

# Check Cloud SQL instances
gcloud sql instances list

# Verify connection name in Cloud Run
gcloud run services describe signalpro --region us-central1 --format="value(spec.template.spec.containers[0].env)"
```

### Out of Memory
```bash
# Increase memory
gcloud run services update signalpro \
  --region us-central1 \
  --memory 1Gi
```

---

## Security Best Practices

- [x] Use Secret Manager for sensitive data
- [x] Enable Cloud SQL SSL
- [x] Use IAM roles (not root user)
- [x] Enable Cloud Armor (DDoS protection)
- [x] Set up VPC connector (private network)
- [x] Regular backups
- [x] Monitor logs for suspicious activity

---

## Quick Reference Commands

### Deploy
```bash
gcloud run deploy signalpro --image gcr.io/$PROJECT_ID/signalpro:latest --region us-central1
```

### View Logs
```bash
gcloud run services logs tail signalpro --region us-central1
```

### Update Environment Variable
```bash
gcloud run services update signalpro --region us-central1 --set-env-vars "KEY=value"
```

### Scale
```bash
gcloud run services update signalpro --region us-central1 --min-instances 1 --max-instances 20
```

### Delete Service
```bash
gcloud run services delete signalpro --region us-central1
```

---

## Summary

✅ **Step 1**: Create GCP project and enable APIs  
✅ **Step 2**: Install gcloud CLI  
✅ **Step 3**: Create Cloud SQL PostgreSQL database  
✅ **Step 4**: Prepare Dockerfile  
✅ **Step 5**: Build and push Docker image  
✅ **Step 6**: Deploy to Cloud Run  
✅ **Step 7**: Run database migrations  
✅ **Step 8**: Test deployment  
✅ **Step 9**: (Optional) Add custom domain  
✅ **Step 10**: (Optional) Set up CI/CD  

**Total Time**: 45-60 minutes  
**Total Cost**: $15-20/month (or free with credits)  
**Free Credits**: $300 for 90 days  

**Cloud Run advantages**:
- Auto-scales to zero (pay only for usage)
- Built-in HTTPS/SSL
- No server management
- Easy CI/CD from GitHub

**Ready to deploy? Start with Step 1!** 🚀
