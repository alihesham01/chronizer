# 🚀 Google Cloud Platform Deployment Guide

## 📋 Prerequisites

1. **Google Cloud Account** with billing enabled (free tier available)
2. **gcloud CLI** installed locally
3. **Docker** installed locally
4. **Domain name** (optional, for custom domain)

## 🎯 Free Tier Limits (Google Cloud)

- **Cloud Run**: 180,000 vCPU-seconds/month, 360,000 GiB-seconds/month
- **Cloud SQL**: 1 f1-micro instance (up to 30 GB storage) FREE
- **Cloud Storage**: 5 GB standard storage FREE
- **Load Balancer**: Not free (~$18/month) - we'll use Cloud Run's built-in URL

## 🛠️ Step 1: Prepare Your Project

### 1.1 Install Google Cloud SDK
```bash
# Windows (using Chocolatey)
choco install gcloudsdk

# Or download from: https://cloud.google.com/sdk/docs/install
```

### 1.2 Initialize gcloud
```bash
gcloud init
gcloud auth login
```

### 1.3 Set Your Project
```bash
# Create a new project
gcloud projects create chronizer-prod --name="Chronizer Production"

# Set as active project
gcloud config set project chronizer-prod

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable sql-component.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

## 🗄️ Step 2: Set Up Cloud SQL Database

### 2.1 Create PostgreSQL Instance
```bash
# Create a PostgreSQL instance (f1-micro is free tier)
gcloud sql instances create chronizer-db \
    --database-version=POSTGRES_14 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --storage-size=10GB \
    --storage-type=SSD \
    --backup-start-time=02:00
```

### 2.2 Create Database and User
```bash
# Set password (replace with strong password)
gcloud sql users set-password postgres \
    --instance=chronizer-db \
    --password=YOUR_STRONG_PASSWORD

# Create database
gcloud sql databases create chronizer --instance=chronizer-db
```

### 2.3 Get Connection Details
```bash
# Get instance connection name
gcloud sql instances describe chronizer-db --format='value(connectionName)'

# Save this for later - it will be like: chronizer-prod:us-central1:chronizer-db
```

## 🐳 Step 3: Prepare Docker Images

### 3.1 Create Production Dockerfiles

**Backend Dockerfile** (`Dockerfile.prod`):
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:18-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 backend
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=backend:nodejs . .
RUN npm run build
USER backend
EXPOSE 3000
CMD ["npm", "start"]
```

**Frontend Dockerfile** (`frontend/Dockerfile.prod`):
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

### 3.2 Update Next.js Config for Production
```javascript
// frontend/next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['lucide-react'],
  images: {
    domains: ['your-domain.com'], // Update with your domain
  },
  output: 'standalone', // Keep this for production
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://backend:3000/api/:path*', // Internal service name
      },
    ];
  },
};
```

## 🔧 Step 4: Create Production Environment

Create `.env.production`:
```env
# Database
DATABASE_URL=postgresql://postgres:YOUR_STRONG_PASSWORD@10.0.0.3:5432/chronizer

# JWT
JWT_SECRET=your-super-secure-jwt-secret-here-min-32-chars

# CORS
ALLOWED_ORIGINS=https://your-domain.run.app,https://your-custom-domain.com

# Other settings
NODE_ENV=production
PORT=3000
```

## 🚀 Step 5: Deploy to Cloud Run

### 5.1 Build and Push Backend
```bash
# Set project
export PROJECT_ID=$(gcloud config get-value project)

# Build backend image
docker build -f Dockerfile.prod -t gcr.io/${PROJECT_ID}/chronizer-backend:latest .

# Push to Google Container Registry
docker push gcr.io/${PROJECT_ID}/chronizer-backend:latest
```

### 5.2 Deploy Backend Service
```bash
gcloud run deploy chronizer-backend \
    --image=gcr.io/${PROJECT_ID}/chronizer-backend:latest \
    --platform=managed \
    --region=us-central1 \
    --allow-unauthenticated \
    --memory=512Mi \
    --cpu=1 \
    --set-env-vars="NODE_ENV=production" \
    --set-cloudsql-instances="chronizer-prod:us-central1:chronizer-db" \
    --add-cloudsql-instances="chronizer-prod:us-central1:chronizer-db"
```

### 5.3 Build and Push Frontend
```bash
# Build frontend image
cd frontend
docker build -f Dockerfile.prod -t gcr.io/${PROJECT_ID}/chronizer-frontend:latest .

# Push to registry
docker push gcr.io/${PROJECT_ID}/chronizer-frontend:latest
cd ..
```

### 5.4 Deploy Frontend Service
```bash
gcloud run deploy chronizer-frontend \
    --image=gcr.io/${PROJECT_ID}/chronizer-frontend:latest \
    --platform=managed \
    --region=us-central1 \
    --allow-unauthenticated \
    --memory=512Mi \
    --cpu=1
```

## 🔗 Step 6: Set Up Database and Test

### 6.1 Connect to Database and Run Migrations
```bash
# Connect using Cloud SQL proxy
gcloud sql connect chronizer-db --user=postgres

# In the SQL shell, run your migrations
\i /path/to/your/admin-v2-setup.sql
```

### 6.2 Get Service URLs
```bash
# Get URLs
gcloud run services describe chronizer-backend --region=us-central1 --format='value(status.url)'
gcloud run services describe chronizer-frontend --region=us-central1 --format='value(status.url)'
```

### 6.3 Update Frontend Environment
In Google Cloud Console:
1. Go to Cloud Run → chronizer-frontend
2. Click "Edit & Deploy New Revision"
3. Add environment variable: `NEXT_PUBLIC_API_URL=https://your-backend-url.run.app`

## 🌐 Step 7: Custom Domain (Optional)

### 7.1 Verify Domain
```bash
gcloud domains verify your-domain.com
```

### 7.2 Map Domain to Services
```bash
# Map domain to frontend
gcloud run domain-mappings create \
    --service=chronizer-frontend \
    --domain=your-domain.com

# Map subdomain to backend
gcloud run domain-mappings create \
    --service=chronizer-backend \
    --domain=api.your-domain.com
```

## 📊 Step 8: Monitoring and Logs

### View Logs
```bash
# Backend logs
gcloud logs read "resource.type=cloud_run_revision AND resource.labels.service_name=chronizer-backend"

# Frontend logs
gcloud logs read "resource.type=cloud_run_revision AND resource.labels.service_name=chronizer-frontend"
```

### Set Up Monitoring
```bash
# Create alert for high error rates
gcloud alpha monitoring policies create --policy-from-file=monitoring.yaml
```

## 💰 Cost Optimization

### Free Tier Usage Tips
1. **Use us-central1** region (often cheaper)
2. **Set minimum instances to 0** to save costs
3. **Use f1-micro** for database (free tier)
4. **Monitor usage** in Cloud Console

### Update Services for Cost Savings
```bash
# Set minimum instances to 0
gcloud run services update chronizer-backend --region=us-central1 --set-min-instances=0
gcloud run services update chronizer-frontend --region=us-central1 --set-min-instances=0
```

## 🔄 CI/CD with Cloud Build

Create `cloudbuild.yaml`:
```yaml
steps:
  # Build and deploy backend
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-f', 'Dockerfile.prod', '-t', 'gcr.io/$PROJECT_ID/chronizer-backend:$COMMIT_SHA', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/chronizer-backend:$COMMIT_SHA']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: 'gcloud'
    args: ['run', 'deploy', 'chronizer-backend', '--image', 'gcr.io/$PROJECT_ID/chronizer-backend:$COMMIT_SHA', '--region', 'us-central1', '--set-env-vars', 'NODE_ENV=production']
  
  # Build and deploy frontend
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-f', 'frontend/Dockerfile.prod', '-t', 'gcr.io/$PROJECT_ID/chronizer-frontend:$COMMIT_SHA', 'frontend/']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/chronizer-frontend:$COMMIT_SHA']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: 'gcloud'
    args: ['run', 'deploy', 'chronizer-frontend', '--image', 'gcr.io/$PROJECT_ID/chronizer-frontend:$COMMIT_SHA', '--region', 'us-central1']

images:
  - 'gcr.io/$PROJECT_ID/chronizer-backend:$COMMIT_SHA'
  - 'gcr.io/$PROJECT_ID/chronizer-frontend:$COMMIT_SHA'
```

## 🚨 Important Security Notes

1. **Change all default passwords**
2. **Use strong JWT secrets**
3. **Enable IAM restrictions**
4. **Use HTTPS only** (Cloud Run provides this)
5. **Regularly update dependencies**
6. **Set up backup for Cloud SQL**

## 📞 Troubleshooting

### Service Not Starting
```bash
# Check logs
gcloud logs read "resource.type=cloud_run_revision"

# Check configuration
gcloud run services describe chronizer-backend --region=us-central1
```

### Database Connection Issues
```bash
# Check Cloud SQL instance
gcloud sql instances describe chronizer-db

# Test connection
gcloud sql connect chronizer-db --user=postgres
```

## 🎉 You're Live!

Your Chronizer application is now running on Google Cloud Platform with:
- ✅ Auto-scaling
- ✅ HTTPS included
- ✅ Managed database
- ✅ Pay-per-use pricing
- ✅ Global CDN

**Access URLs:**
- Frontend: https://your-service-url.run.app
- Backend: https://your-backend-url.run.app
- Admin: https://your-service-url.run.app/admin

---

**Next Steps:**
1. Set up custom domain
2. Configure monitoring alerts
3. Set up automated backups
4. Review security settings
