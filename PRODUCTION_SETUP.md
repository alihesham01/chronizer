# Production Setup Guide

## Step 1: Update Environment Variables

### Already Completed ✅
- JWT_SECRET: Set to strong 64-character hex
- INVITE_CODE: Set to secure unique code

### Manual Updates Required

1. **Update CORS_ORIGIN** for your domain:
   ```bash
   # Edit .env file
   CORS_ORIGIN=https://yourdomain.com
   ```

2. **Set secure database credentials**:
   ```bash
   DATABASE_URL=postgres://username:STRONG_PASSWORD@host:port/database
   DB_PASSWORD=STRONG_PASSWORD
   ```

## Step 2: Database Setup

### Option A: Using Docker (Recommended)
```bash
# Start PostgreSQL
docker-compose up -d postgres

# Wait for it to be ready
docker-compose logs postgres

# Initialize schema
npm run setup-db
```

### Option B: External PostgreSQL
```bash
# Create database
createdb woke_portal

# Run setup script
DATABASE_URL=postgres://user:pass@host:5432/woke_portal npm run setup-db
```

## Step 3: Connection Pooling (Production)

### Using PgBouncer (Recommended for high traffic)

1. **Install PgBouncer**:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install pgBouncer
   
   # Or with Docker
   docker run -d --name pgbouncer \
     -e DB_HOST=postgres \
     -e DB_PORT=5432 \
     -e DB_USER=woke_user \
     -e DB_PASSWORD=your_password \
     -e DB_NAME=woke_portal \
     -p 6432:6432 \
     edoburu/pgbouncer
   ```

2. **Update DATABASE_URL** to use PgBouncer:
   ```bash
   DATABASE_URL=postgres://woke_user:password@localhost:6432/woke_portal
   ```

3. **Increase pool size** in `.env`:
   ```bash
   DB_POOL_SIZE=50
   ```

### Without PgBouncer
- Keep `DB_POOL_SIZE=20` for moderate traffic
- Monitor connection count: `SELECT count(*) FROM pg_stat_activity;`

## Step 4: Security Hardening

1. **Generate new secrets**:
   ```bash
   # JWT Secret (already done)
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   
   # Database password
   openssl rand -base64 32
   ```

2. **Set environment variables**:
   ```bash
   NODE_ENV=production
   ENABLE_HELMET=true
   ```

3. **Firewall rules**:
   - Only allow ports 80, 443, 22
   - Block direct database access from outside

## Step 5: Deployment

### Using Docker Compose
```bash
# Build and start all services
docker-compose up -d

# Check logs
docker-compose logs -f
```

### Manual Deployment
```bash
# Install dependencies
npm ci --production

# Build application
npm run build

# Start with PM2
npm install -g pm2
pm2 start ecosystem.config.js
```

## Step 6: Monitoring

### Health Checks
```bash
# Application health
curl https://yourdomain.com/api/health

# Database connection
curl https://yourdomain.com/api/system/info
```

### Log Monitoring
```bash
# Docker logs
docker-compose logs -f backend

# PM2 logs
pm2 logs
```

## Step 7: Performance Tuning

### PostgreSQL Optimization
```sql
-- In postgresql.conf
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
```

### Node.js Optimization
```bash
# Increase memory limit
node --max-old-space-size=1024 dist/index.js

# Or in PM2 config
module.exports = {
  apps: [{
    name: 'woke-portal',
    script: 'dist/index.js',
    node_args: '--max-old-space-size=1024',
    instances: 'max',
    exec_mode: 'cluster'
  }]
}
```

## Step 8: Backup Strategy

### Database Backup
```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump woke_portal > backup_$DATE.sql
gzip backup_$DATE.sql

# Or with Docker
docker exec postgres pg_dump -U woke_user woke_portal | gzip > backup_$DATE.sql.gz
```

### Automated Backup
```bash
# Add to crontab
0 2 * * * /path/to/backup-script.sh
```

## Step 9: SSL Certificate

### Using Let's Encrypt
```bash
# Install certbot
sudo apt-get install certbot

# Get certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Step 10: Final Checklist

- [ ] JWT_SECRET is strong (64-char hex)
- [ ] INVITE_CODE is unique and secure
- [ ] CORS_ORIGIN matches your domain
- [ ] Database credentials are strong
- [ ] PgBouncer is configured (if needed)
- [ ] SSL certificate is installed
- [ ] Firewall is configured
- [ ] Backup strategy is in place
- [ ] Monitoring is set up
- [ ] All services are running

## Troubleshooting

### Database Connection Failed
```bash
# Check PostgreSQL status
docker-compose ps postgres

# View logs
docker-compose logs postgres

# Test connection
psql postgres://user:pass@localhost:5432/woke_portal
```

### High Memory Usage
```bash
# Check Node.js memory
pm2 monit

# Optimize pool size
DB_POOL_SIZE=10
```

### Slow Queries
```bash
# Enable slow query log
# In postgresql.conf
log_min_duration_statement = 1000
log_statement = 'all'
```

## Support

For issues:
1. Check logs: `docker-compose logs -f`
2. Verify environment variables
3. Test database connection
4. Check resource usage
