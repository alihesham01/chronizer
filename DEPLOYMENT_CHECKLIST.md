# Pre-Deployment Checklist

## 🔐 Security
- [ ] Change invite code from `ADMIN-INVITE-2024`
- [ ] Update CORS origin to your domain
- [ ] Move database password to secret manager
- [ ] Enable SSL on database connection

## 🗄️ Database
- [ ] Create PostgreSQL instance
- [ ] Create `woke_portal` database
- [ ] Run migrations/seeds
- [ ] Test connection from app

## 🌍 Environment
- [ ] Set NODE_ENV=production
- [ ] Configure all environment variables
- [ ] Test locally with production settings
- [ ] Remove any development dependencies

## 📊 Performance
- [ ] Enable Redis for caching
- [ ] Configure connection pooling
- [ ] Set up monitoring
- [ ] Test with sample data

## 🚀 Deployment
- [ ] Choose hosting provider
- [ ] Set up CI/CD (optional)
- [ ] Configure domain/SSL
- [ ] Set up backups

## ✅ Testing
- [ ] Test authentication flow
- [ ] Test all CRUD operations
- [ ] Test bulk operations
- [ ] Test with multiple users
- [ ] Load test if possible

## 📈 Post-Deployment
- [ ] Monitor error logs
- [ ] Set up alerts
- [ ] Check performance metrics
- [ ] Verify backups working
