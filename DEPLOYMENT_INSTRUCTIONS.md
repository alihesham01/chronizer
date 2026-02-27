# Deployment Instructions - Required Environment Variables

## ⚠️ URGENT: Add these to your hosting provider

### 1. JWT_SECRET (REQUIRED - Deployment will fail without this)
```
JWT_SECRET=d5d6e98c1ab639dff51527dc808260edb0c9bc2789e1ca21b34393a31199e38f
```

### 2. Other new environment variables (have defaults but recommended)
```
FRONTEND_URL=https://your-frontend-domain.com
ALLOWED_ORIGINS=https://your-frontend-domain.com
JWT_EXPIRES_IN=7d
```

## Where to add these:

### If using Render.com:
1. Go to dashboard → Services → Your backend service
2. Click "Environment" tab
3. Add each variable above

### If using Railway:
1. Go to dashboard → Your project
2. Click "Variables" tab
3. Add each variable above

### If using Heroku:
```bash
heroku config:set JWT_SECRET=d5d6e98c1ab639dff51527dc808260edb0c9bc2789e1ca21b34393a31199e38f
```

### If using Vercel:
1. Go to dashboard → Project → Settings → Environment Variables
2. Add each variable

## After adding variables:
1. Redeploy your application
2. The deployment should succeed

## Why this is needed:
We added a security feature that refuses to start the app in production without a secure JWT_SECRET.
