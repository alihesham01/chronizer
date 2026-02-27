# 🚀 Railway.app Deployment Guide (100% Free - No Card Required)

## 📋 Why Railway.app?
- **$5 credit** for new users (no card needed)
- **Free tier** after credit expires
- **PostgreSQL** included
- **Simple GitHub deployment**
- **No credit card** required for free tier

## 🛠️ Step 1: Sign Up

1. Go to https://railway.app
2. Click "Login with GitHub"
3. Authorize Railway
4. You'll get $5 free credit (enough for months of usage)

## 🐙 Step 2: Deploy from GitHub

### 2.1 Deploy Backend
1. In Railway Dashboard, click "New Project"
2. Click "Deploy from GitHub repo"
3. Select your `alihesham01/chronizer` repository
4. Railway will auto-detect Node.js
5. Click "Add Variables" and set:
   ```
   NODE_ENV=production
   DATABASE_URL=postgresql://postgres:password@localhost:5432/chronizer
   JWT_SECRET=chronizer-super-secure-jwt-secret-2024
   ALLOWED_ORIGINS=https://your-frontend-url.railway.app
   ```
6. Click "Deploy"

### 2.2 Add PostgreSQL
1. In your project, click "+ New"
2. Select "PostgreSQL"
3. Click "Add PostgreSQL"
4. Once ready, click on it → "Connect" → Copy the DATABASE_URL
5. Go back to your backend service → "Variables" → Update DATABASE_URL

### 2.3 Deploy Frontend
1. Click "New Service" → "GitHub repo"
2. Same repository (`alihesham01/chronizer`)
3. Set Root Directory: `frontend`
4. Click "Add Variables":
   ```
   NEXT_PUBLIC_API_URL=https://your-backend-url.railway.app
   ```
5. Click "Deploy"

## 🔧 Step 3: Configure Domains

1. Each service gets a `.railway.app` domain
2. Go to service settings → "Settings"
3. Your URLs will be like:
   - Backend: `chronizer-backend-production.up.railway.app`
   - Frontend: `chronizer-frontend-production.up.railway.app`

## 🗄️ Step 4: Run Database Migrations

1. Go to your PostgreSQL service in Railway
2. Click "Query" tab
3. Paste and run your `admin-v2-setup.sql` content

## 🌐 Access Your App

- Frontend: `https://chronizer-frontend-production.up.railway.app`
- Backend: `https://chronizer-backend-production.up.railway.app`
- Admin: `https://chronizer-frontend-production.up.railway.app/admin`

## 💰 Pricing After $5 Credit

- **$0.000617/hour** per service (~$0.45/month)
- **PostgreSQL**: Starts at $0/month (hobby plan)
- **Total**: ~$1-2/month after credit expires

## ✅ Benefits

- No credit card needed initially
- $5 free credit = 8+ months free
- Automatic deployments from GitHub
- Built-in monitoring
- Easy to use

## 📞 Quick Steps Summary

1. Go to https://railway.app
2. Login with GitHub
3. New Project → Deploy from GitHub → Select `chronizer`
4. Add PostgreSQL service
5. Update DATABASE_URL
6. Deploy frontend as separate service
7. Run migrations in PostgreSQL Query tab
8. Enjoy your live app! 🎉
