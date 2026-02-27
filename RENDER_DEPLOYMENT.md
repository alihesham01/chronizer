# 🚀 Render.com Deployment Guide (Free Tier - No Billing Required)

## 📋 Why Render.com?
- **Free tier** for web services (750 hours/month)
- **Free PostgreSQL** (up to 256MB)
- **No credit card** required for free tier
- **Simple deployment** from GitHub
- **Automatic SSL** certificates
- **Custom domains** supported

## 🛠️ Step 1: Prepare Your App

### 1.1 Update Next.js Config
```javascript
// frontend/next.config.js
const nextConfig = {
  transpilePackages: ['lucide-react'],
  images: {
    domains: ['your-app.onrender.com'],
  },
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://your-backend.onrender.com/api/:path*',
      },
    ];
  },
};
```

### 1.2 Create Render-specific Dockerfiles

**Backend Dockerfile** (already have `Dockerfile.prod`):
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

**Frontend Dockerfile** (already have `frontend/Dockerfile.prod`):
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

## 🐙 Step 2: Push to GitHub

### 2.1 Create GitHub Repository
```bash
# If not already a git repo
git init
git add .
git commit -m "Initial commit for Render deployment"

# Create repo on GitHub, then:
git remote add origin https://github.com/yourusername/chronizer.git
git branch -M main
git push -u origin main
```

## 🚀 Step 3: Deploy on Render

### 3.1 Sign Up for Render
1. Go to https://render.com
2. Click "Sign Up"
3. Choose "Sign up with GitHub"
4. Authorize Render to access your repositories

### 3.2 Deploy PostgreSQL Database
1. In Render Dashboard, click "New +"
2. Select "PostgreSQL"
3. Name: `chronizer-db`
4. Database Name: `chronizer`
5. User: `postgres`
6. Region: Choose closest to you
7. Plan: **Free** (256MB)
8. Click "Create Database"

### 3.3 Deploy Backend
1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Name: `chronizer-backend`
4. Root Directory: `/` (leave empty)
5. Runtime: **Docker**
6. Instance Type: **Free**
7. Add Environment Variables:
   ```
   NODE_ENV=production
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@host:5432/chronizer
   JWT_SECRET=your-super-secure-jwt-secret-here
   ALLOWED_ORIGINS=https://your-frontend.onrender.com
   ```
8. Click "Create Web Service"

### 3.4 Deploy Frontend
1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Name: `chronizer-frontend`
4. Root Directory: `frontend`
5. Runtime: **Docker**
6. Instance Type: **Free**
7. Add Environment Variables:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
   ```
8. Click "Create Web Service"

## 🔧 Step 4: Run Database Migrations

1. Once your database is ready, click on it in Render Dashboard
2. Go to "Connections" tab
3. Copy the external database URL
4. Use a database tool (like DBeaver) to connect and run:
   ```sql
   -- Run your admin-v2-setup.sql here
   ```

## 🌐 Step 5: Access Your App

Your apps will be available at:
- Frontend: `https://chronizer-frontend.onrender.com`
- Backend: `https://chronizer-backend.onrender.com`
- Admin: `https://chronizer-frontend.onrender.com/admin`

## 📊 Free Tier Limits
- **Web Services**: 750 hours/month (enough for 24/7 on one service)
- **PostgreSQL**: 256MB RAM, 10GB storage
- **Bandwidth**: 100GB/month

## 🔄 Auto-Deploy Setup

For automatic updates:
1. Go to your service settings
2. Enable "Auto-Deploy" 
3. Push to GitHub → Auto-deploys to Render

## 💡 Pro Tips

1. **Sleep Time**: Free tier services sleep after 15min inactivity
   - Wake up on next request (takes ~30 seconds)
   - Can upgrade to prevent sleep

2. **Environment Variables**
   - Never commit secrets to Git
   - Use Render's environment variables

3. **Custom Domain** (optional)
   - Go to service settings → "Custom Domains"
   - Add your domain
   - Update DNS as instructed

## 🎉 You're Live!

Your Chronizer app is now:
- ✅ Running on Render's free tier
- ✅ No credit card required
- ✅ Auto-SSL certificates
- ✅ Connected to PostgreSQL

## 📞 Troubleshooting

### Service Not Starting
1. Check the "Logs" tab in Render Dashboard
2. Verify environment variables
3. Check Dockerfile paths

### Database Connection Issues
1. Verify DATABASE_URL format
2. Check if database is "Ready" (not "Provisioning")
3. Ensure password matches

---

**Next Steps:**
1. Push to GitHub
2. Deploy on Render (5 minutes)
3. Run database migrations
4. Enjoy your live app! 🚀
