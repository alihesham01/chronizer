# 🚀 Production Deployment Guide

## 📋 Prerequisites

Before deploying to production, ensure you have:

1. ✅ Generated a secure JWT secret
2. ✅ Fixed all npm vulnerabilities (`npm audit fix`)
3. ✅ Set up proper environment variables
4. ✅ Configured database and Redis
5. ✅ Set up monitoring and logging

## 🔐 Security Setup

### 1. Generate Secure Secrets

```bash
# Generate JWT secret
node scripts/generate-jwt-secret.js

# Generate database password
openssl rand -base64 32

# Generate Redis password (if using Redis auth)
openssl rand -base64 32
```

### 2. Environment Variables

Create a production `.env` file:

```bash
# Database
DATABASE_URL=postgresql://username:password@host:5432/woke_portal
DB_PASSWORD=your_secure_password

# Redis
REDIS_URL=redis://username:password@host:6379

# JWT
JWT_SECRET=your_generated_256_bit_secret

# CORS
CORS_ORIGIN=https://yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Security
ENABLE_HELMET=true
NODE_ENV=production
```

## 🐳 Docker Deployment

### 1. Build Images

```bash
# Build backend
docker build -t woke-backend:latest .

# Build frontend
docker build -t woke-frontend:latest ./frontend
```

### 2. Run with Docker Compose

```bash
# Copy environment file
cp .env.example .env
# Edit .env with production values

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f
```

### 3. Production Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always
    networks:
      - internal

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: always
    networks:
      - internal

  backend:
    image: woke-backend:latest
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      - postgres
      - redis
    restart: always
    networks:
      - internal
      - external

  frontend:
    image: woke-frontend:latest
    environment:
      NEXT_PUBLIC_API_URL: https://api.yourdomain.com
    restart: always
    networks:
      - external

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - frontend
      - backend
    restart: always
    networks:
      - external

volumes:
  postgres_data:
  redis_data:

networks:
  internal:
    driver: bridge
    internal: true
  external:
    driver: bridge
```

## 🌐 Nginx Configuration

Create `nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:3000;
    }

    upstream frontend {
        server frontend:3000;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=general:10m rate=30r/s;

    server {
        listen 80;
        server_name yourdomain.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name yourdomain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

        # Frontend
        location / {
            limit_req zone=general burst=50 nodelay;
            proxy_pass http://frontend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Backend API
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

## ☸️ Kubernetes Deployment

### 1. Create Secrets

```bash
kubectl create secret generic woke-secrets \
  --from-literal=jwt-secret=your_jwt_secret \
  --from-literal=db-password=your_db_password \
  --from-literal=redis-password=your_redis_password
```

### 2. Deploy Database

```yaml
# postgres-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15
        env:
        - name: POSTGRES_DB
          value: woke_portal
        - name: POSTGRES_USER
          value: woke_user
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: woke-secrets
              key: db-password
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: postgres-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
```

## 📊 Monitoring Setup

### 1. Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'woke-backend'
    static_configs:
      - targets: ['backend:3000']
    metrics_path: '/api/metrics'
```

### 2. Grafana Dashboard

Import the pre-configured dashboard from `monitoring/grafana-dashboard.json`

## 🔍 Health Checks

### Backend Health Check

```bash
curl https://api.yourdomain.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-02-24T16:00:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "queue": "running"
  }
}
```

### Frontend Health Check

```bash
curl https://yourdomain.com/api/health
```

## 🚨 Deployment Checklist

Before deploying to production:

- [ ] JWT secret is generated and secure
- [ ] All environment variables are set
- [ ] Database is backed up
- [ ] SSL certificates are configured
- [ ] Rate limiting is enabled
- [ ] Security headers are configured
- [ ] Monitoring is set up
- [ ] Log aggregation is configured
- [ ] Error tracking (Sentry) is configured
- [ ] Health checks are working
- [ ] Load testing has been performed
- [ ] Rollback plan is documented

## 🔄 Rollback Procedure

If something goes wrong:

1. **Quick rollback (Docker)**:
   ```bash
   docker-compose down
   docker-compose up -d --force-recreate
   ```

2. **Kubernetes rollback**:
   ```bash
   kubectl rollout undo deployment/woke-backend
   kubectl rollout undo deployment/woke-frontend
   ```

3. **Database rollback**:
   - Restore from latest backup
   - Run migrations to previous version if needed

## 📞 Support

For production issues:

1. Check logs: `docker-compose logs -f`
2. Check metrics: Grafana dashboard
3. Check errors: Sentry dashboard
4. Run health checks

---

Remember: Always test in staging before deploying to production!
