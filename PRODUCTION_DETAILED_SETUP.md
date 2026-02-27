# 🚀 Production Setup - Detailed Step-by-Step Guide

## 📋 Table of Contents
1. [Environment Configuration](#1-environment-configuration)
2. [Database Setup](#2-database-setup)
3. [Docker Deployment](#3-docker-deployment)
4. [SSL Certificate Setup](#4-ssl-certificate-setup)
5. [Performance Optimization](#5-performance-optimization)
6. [Monitoring & Logging](#6-monitoring--logging)
7. [Backup Strategy](#7-backup-strategy)
8. [Security Hardening](#8-security-hardening)

---

## 1. Environment Configuration

### 1.1 Locate Your Environment File
```
📁 File Location: /woke-portal/.env
```

### 1.2 Update CORS_ORIGIN
1. Open the `.env` file:
   - **VS Code**: Click on `.env` in the file explorer
   - **Command Line**: `code .env` or `nano .env`

2. Find line 35:
   ```env
   # OLD VALUE (for development)
   CORS_ORIGIN=http://localhost:3001
   ```

3. Replace with your domain:
   ```env
   # NEW VALUE (for production)
   CORS_ORIGIN=https://yourdomain.com
   ```

### 1.3 Verify Security Settings
Your `.env` should have these values (already set):
```env
# Line 15 - JWT Secret (64-character hex)
JWT_SECRET=68a3dd5eca28ef0e1532a5c5be2c372ce4aed12bbe6e82b0bdefb6421b2b183e

# Line 45 - Invite Code (unique)
INVITE_CODE=WP-621DBF5DF52CBD6CA55010B6B8126E9B

# Line 20 - Environment
NODE_ENV=production
```

### 1.4 Database Credentials (Optional but Recommended)
If you want to change the database password:
1. Generate a strong password:
   ```bash
   openssl rand -base64 32
   ```

2. Update in `.env` (lines 2 and 7):
   ```env
   DATABASE_URL=postgres://woke_user:NEW_PASSWORD@localhost:5432/woke_portal
   DB_PASSWORD=NEW_PASSWORD
   ```

---

## 2. Database Setup

### 2.1 Option A: Docker PostgreSQL (Recommended)

#### Step 1: Check Docker Compose File
```
📁 File Location: /woke-portal/docker-compose.yml
```

#### Step 2: Remove Redis Reference (if exists)
If you get an error about Redis, edit `docker-compose.yml`:
1. Find and remove the entire `redis` service block
2. Remove `redis` from `depends_on` in backend service

#### Step 3: Start PostgreSQL
```bash
# Navigate to project directory
cd /woke-portal

# Start only PostgreSQL
docker-compose up -d postgres

# Verify it's running
docker-compose ps
```

#### Step 4: Wait for Database to Be Ready
```bash
# Check logs to see when it's ready
docker-compose logs postgres

# You should see: "database system is ready to accept connections"
```

#### Step 5: Initialize Database Schema
```bash
# Run the setup script
npm run setup-db

# Alternative: Run directly
node scripts/setup-db.js
```

### 2.2 Option B: External PostgreSQL

#### Step 1: Create Database
```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE woke_portal;
CREATE USER woke_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE woke_portal TO woke_user;
\q
```

#### Step 2: Update Environment
In `.env`, update:
```env
DATABASE_URL=postgres://woke_user:your_password@your-host:5432/woke_portal
```

#### Step 3: Run Setup Script
```bash
DATABASE_URL=postgres://woke_user:your_password@your-host:5432/woke_portal npm run setup-db
```

---

## 3. Docker Deployment

### 3.1 Build and Start All Services

#### Step 1: Build Docker Images
```bash
# Build all services
docker-compose build

# Or build individually
docker-compose build backend
docker-compose build frontend
```

#### Step 2: Start All Services
```bash
# Start all services in background
docker-compose up -d

# Start with logs visible
docker-compose up
```

#### Step 3: Verify Services
```bash
# Check all services status
docker-compose ps

# Expected output:
# NAME              COMMAND                  SERVICE             STATUS              PORTS
# backend           "docker-entrypoint.s…"   backend             running             0.0.0.0:3000->3000/tcp
# frontend          "docker-entrypoint.s…"   frontend            running             0.0.0.0:3001->3000/tcp
# postgres          "docker-entrypoint.s…"   postgres            running             0.0.0.0:5432/tcp
```

### 3.2 Using Nginx Reverse Proxy (Recommended)

#### Step 1: Create Nginx Config
```
📁 Create File: /woke-portal/nginx/nginx.conf
```

```nginx
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:3000;
    }
    
    upstream frontend {
        server frontend:3001;
    }

    server {
        listen 80;
        server_name yourdomain.com;

        # Frontend
        location / {
            proxy_pass http://frontend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # Backend API
        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
    }
}
```

#### Step 2: Add Nginx to Docker Compose
Add to `docker-compose.yml`:
```yaml
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on:
      - backend
      - frontend
```

---

## 4. SSL Certificate Setup

### 4.1 Using Let's Encrypt (Recommended)

#### Step 1: Install Certbot
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install certbot python3-certbot-nginx
```

#### Step 2: Generate Certificate
```bash
# Replace yourdomain.com with your actual domain
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

#### Step 3: Auto-renewal Setup
```bash
# Test auto-renewal
sudo certbot renew --dry-run

# Add to crontab
sudo crontab -e
# Add this line:
0 12 * * * /usr/bin/certbot renew --quiet
```

### 4.2 Manual SSL (For Testing)

#### Step 1: Create SSL Directory
```bash
mkdir -p nginx/ssl
cd nginx/ssl
```

#### Step 2: Generate Self-Signed Certificate
```bash
# Generate private key
openssl genrsa -out private.key 2048

# Generate certificate
openssl req -new -x509 -key private.key -out certificate.crt -days 365
```

#### Step 3: Update Nginx Config
Add to `nginx.conf`:
```nginx
    server {
        listen 443 ssl;
        server_name yourdomain.com;

        ssl_certificate /etc/nginx/ssl/certificate.crt;
        ssl_certificate_key /etc/nginx/ssl/private.key;
        
        # ... rest of config
    }
```

---

## 5. Performance Optimization

### 5.1 Connection Pooling with PgBouncer

#### Step 1: Install PgBouncer
```bash
# Ubuntu/Debian
sudo apt-get install pgBouncer

# Docker Alternative
docker run -d --name pgbouncer \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_USER=woke_user \
  -e DB_PASSWORD=your_password \
  -e DB_NAME=woke_portal \
  -e POOL_MODE=transaction \
  -p 6432:6432 \
  edoburu/pgbouncer
```

#### Step 2: Configure PgBouncer
```
📁 File Location: /etc/pgbouncer/pgbouncer.ini
```

```ini
[databases]
woke_portal = host=localhost port=5432 dbname=woke_portal

[pgbouncer]
listen_port = 6432
listen_addr = 127.0.0.1
auth_type = md5
pool_mode = transaction
max_client_conn = 100
default_pool_size = 20
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 5
max_db_connections = 50
max_user_connections = 50
server_reset_query = DISCARD ALL
ignore_startup_parameters = extra_float_digits
```

#### Step 3: Update Application to Use PgBouncer
In `.env`:
```env
# Old (direct PostgreSQL)
DATABASE_URL=postgres://woke_user:password@localhost:5432/woke_portal

# New (via PgBouncer)
DATABASE_URL=postgres://woke_user:password@localhost:6432/woke_portal
DB_POOL_SIZE=50
```

### 5.2 PostgreSQL Optimization

#### Step 1: Locate PostgreSQL Config
```
📁 Docker: Check with: docker exec postgres psql -U postgres -c 'SHOW config_file;'
📁 Local: /etc/postgresql/14/main/postgresql.conf
```

#### Step 2: Update Configuration
Add to `postgresql.conf`:
```sql
# Memory Settings
shared_buffers = 256MB          # 25% of RAM
effective_cache_size = 1GB      # 75% of RAM
work_mem = 4MB
maintenance_work_mem = 64MB

# Connection Settings
max_connections = 100
superuser_reserved_connections = 3

# WAL Settings
wal_buffers = 16MB
checkpoint_completion_target = 0.9
wal_writer_delay = 200ms

# Query Planner
random_page_cost = 1.1          # For SSD
effective_io_concurrency = 200  # For SSD

# Logging
log_min_duration_statement = 1000
log_checkpoints = on
log_connections = on
log_disconnections = on
```

#### Step 3: Restart PostgreSQL
```bash
# Docker
docker-compose restart postgres

# Systemd
sudo systemctl restart postgresql
```

---

## 6. Monitoring & Logging

### 6.1 Application Health Checks

#### Step 1: Test Health Endpoints
```bash
# Basic health
curl https://yourdomain.com/api/health

# System info
curl https://yourdomain.com/api/system/info

# Expected response:
# {"status":"ok","timestamp":"...","uptime":...}
```

#### Step 2: Monitor Docker Containers
```bash
# Real-time logs
docker-compose logs -f

# Specific service logs
docker-compose logs -f backend
docker-compose logs -f postgres

# Resource usage
docker stats
```

### 6.2 Set Up PM2 Monitoring (Non-Docker)

#### Step 1: Create PM2 Config
```
📁 File Location: /woke-portal/ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'woke-portal',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

#### Step 2: Start with PM2
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Save PM2 config
pm2 save
pm2 startup
```

---

## 7. Backup Strategy

### 7.1 Database Backup Script

#### Step 1: Create Backup Script
```
📁 Create File: /woke-portal/scripts/backup.sh
```

```bash
#!/bin/bash

# Configuration
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="woke_portal"
DB_USER="woke_user"
RETENTION_DAYS=30

# Create backup directory
mkdir -p $BACKUP_DIR

# Perform backup
if command -v docker &> /dev/null; then
    # Docker backup
    docker exec postgres pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_DIR/backup_$DATE.sql.gz
else
    # Direct backup
    pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_DIR/backup_$DATE.sql.gz
fi

# Remove old backups
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Log
echo "Backup completed: backup_$DATE.sql.gz"
```

#### Step 2: Make Script Executable
```bash
chmod +x scripts/backup.sh
```

#### Step 3: Set Up Cron Job
```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /path/to/woke-portal/scripts/backup.sh >> /var/log/backup.log 2>&1
```

### 7.2 Application Backup

#### Step 1: Create App Backup Script
```
📁 Create File: /woke-portal/scripts/backup-app.sh
```

```bash
#!/bin/bash

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
APP_DIR="/woke-portal"

# Backup application code
tar -czf $BACKUP_DIR/app_backup_$DATE.tar.gz \
    --exclude=node_modules \
    --exclude=dist \
    --exclude=.git \
    --exclude=logs \
    $APP_DIR

# Backup environment file
cp $APP_DIR/.env $BACKUP_DIR/env_backup_$DATE

echo "Application backup completed: app_backup_$DATE.tar.gz"
```

---

## 8. Security Hardening

### 8.1 Firewall Configuration

#### Step 1: UFW Setup (Ubuntu)
```bash
# Enable firewall
sudo ufw enable

# Allow SSH
sudo ufw allow ssh

# Allow web traffic
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Block database port from external
sudo ufw deny 5432/tcp

# Check status
sudo ufw status
```

#### Step 2: iptables Rules (Advanced)
```bash
# Allow established connections
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow SSH
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow web traffic
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Drop everything else
iptables -A INPUT -j DROP

# Save rules
iptables-save > /etc/iptables/rules.v4
```

### 8.2 Security Headers

#### Step 1: Verify Security Headers
In `.env`, ensure:
```env
ENABLE_HELMET=true
```

#### Step 2: Custom Headers (Optional)
Add to your backend code:
```javascript
// In src/index.ts after helmet middleware
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  await next();
});
```

### 8.3 Rate Limiting

#### Step 1: Configure Rate Limits
In `.env`, adjust:
```env
# Current settings
RATE_LIMIT_WINDOW_MS=900000    # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100    # Per IP

# For stricter limits:
RATE_LIMIT_WINDOW_MS=300000    # 5 minutes
RATE_LIMIT_MAX_REQUESTS=50     # Per IP
```

#### Step 2: Advanced Rate Limiting
```
📁 File Location: /woke-portal/src/middleware/rate-limit.ts
```

```typescript
// Add different limits for different routes
const limits = {
  '/api/auth/login': { requests: 5, window: 900000 },  // 5 per 15 min
  '/api/auth/register': { requests: 3, window: 3600000 }, // 3 per hour
  default: { requests: 100, window: 900000 }
};
```

---

## 🎯 Final Deployment Checklist

### Pre-Deployment Checklist
- [ ] JWT_SECRET is 64-character hex
- [ ] INVITE_CODE is unique and secure
- [ ] CORS_ORIGIN matches production domain
- [ ] Database password is strong
- [ ] All environment variables are set
- [ ] SSL certificate is installed
- [ ] Firewall is configured

### Post-Deployment Checklist
- [ ] All services are running: `docker-compose ps`
- [ ] Health endpoint responds: `curl /api/health`
- [ ] Database is accessible: Check logs
- [ ] SSL certificate is valid: Visit https://
- [ ] Backups are running: Check /backups folder
- [ ] Monitoring is active: Check logs/metrics

### Performance Checklist
- [ ] PgBouncer is running (if using)
- [ ] PostgreSQL is optimized
- [ ] Connection pool size is appropriate
- [ ] Memory usage is within limits
- [ ] Response times are acceptable

---

## 🆘 Troubleshooting Guide

### Common Issues and Solutions

#### Issue 1: "Database connection failed"
```bash
# Check PostgreSQL status
docker-compose logs postgres

# Test connection manually
docker exec -it postgres psql -U woke_user -d woke_portal

# Common fixes:
# - Check DATABASE_URL in .env
# - Verify PostgreSQL is running
# - Check network connectivity
```

#### Issue 2: "Service has neither an image nor a build context"
```bash
# This means docker-compose.yml has invalid service
# Fix: Remove redis service from docker-compose.yml
# Or add proper image: redis:alpine
```

#### Issue 3: High memory usage
```bash
# Check memory usage
docker stats

# Solutions:
# - Reduce DB_POOL_SIZE in .env
# - Add memory limits to docker-compose.yml
# - Enable PgBouncer connection pooling
```

#### Issue 4: CORS errors
```bash
# Check CORS_ORIGIN in .env
# Should be: https://yourdomain.com
# Not: http://localhost:3001
```

#### Issue 5: SSL certificate errors
```bash
# Check certificate expiry
openssl x509 -in /etc/letsencrypt/live/yourdomain.com/cert.pem -text -noout

# Renew manually
sudo certbot renew

# Check Nginx config
nginx -t
```

---

## 📞 Support Resources

### Documentation Files
- `PRODUCTION_DETAILED_SETUP.md` - This file
- `PRODUCTION_SETUP.md` - Quick reference
- `.env.production.example` - Environment template

### Useful Commands
```bash
# Quick restart all services
docker-compose restart

# View real-time logs
docker-compose logs -f --tail=100

# Enter container for debugging
docker exec -it backend sh

# Database backup on demand
./scripts/backup.sh

# Check SSL certificate
curl -I https://yourdomain.com
```

### Monitoring Commands
```bash
# System resources
htop
df -h
free -h

# Docker resources
docker stats --no-stream

# PostgreSQL connections
docker exec postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
```

---

Remember: This guide covers everything from basic setup to production optimization. Start with the essential steps (1-3) and gradually implement advanced features as your traffic grows.
