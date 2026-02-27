# 🚀 Production Quick Start Guide

## ⚡ Immediate Actions (Do These First!)

### 1. 🔐 Fix Security Issues

```bash
# Generate a secure JWT secret
npm run generate:jwt

# Fix npm vulnerabilities
npm run security:fix

# Update your .env file with the new JWT secret
```

### 2. 📦 Install Production Dependencies

```bash
# Install new security and monitoring packages
npm install express-rate-limit helmet pino pino-pretty
```

### 3. 🐳 Deploy with Docker

1. **Backend redis-manager.js**: The SWC compiler is not including this file in the build. Temporary workaround needed.
2. **Database Schema**: Tables need to be created/seeded.
3. **Environment Variables**: Update for production before deployment.

## 📝 Next Steps

1. **Immediate**: Fix redis-manager.js issue
2. **Today**: Test all endpoints and frontend connection
3. **This Week**: Set up production database
4. **Next Week**: Deploy to production

## 📞 Troubleshooting

If backend fails to start:
```bash
# Check logs
docker logs woke-backend

# Rebuild completely
docker-compose down
docker system prune -f
docker-compose up --build -d
```

## 🎯 Production Checklist Before Deploy

- [ ] Change default passwords
- [ ] Update CORS origin to production domain
- [ ] Set up production database
- [ ] Configure SSL certificates
- [ ] Set up monitoring
- [ ] Test all functionality
- [ ] Configure backups
- All scripts are in the `scripts/` folder

---

**Remember**: Security first! Always change default secrets before production! 🛡️
