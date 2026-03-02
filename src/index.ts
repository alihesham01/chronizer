import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { config } from 'dotenv';

// Load environment variables FIRST
config();

import { loadEnv, getEnv } from './config/env.js';
loadEnv();
const env = getEnv();

// Database (single source of truth)
import { db } from './config/database.js';

// Routes
import { authRoutes } from './routes/auth.routes.js';
import { brandRoutes } from './routes/brand.routes.js';
import { transactionsRoutes } from './routes/transactions.routes.js';
import { stockMovesRoutes } from './routes/stock-moves.routes.js';
import { inventoryRoutes } from './routes/inventory.routes.js';
import { analyticsRoutes } from './routes/analytics.routes.js';
import { systemRoutes } from './routes/system.routes.js';
import { productsRoutes } from './routes/products.routes.js';
import { storesRoutes } from './routes/stores.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { skuMapRoutes } from './routes/sku-map.routes.js';
import { unmappedSkusRoutes } from './routes/unmapped-skus.routes.js';
import { notificationsRoutes } from './routes/notifications.routes.js';
import { scraperRoutes } from './routes/scrapers.routes.js';
// Scheduler moved to worker process (src/worker.ts)

// Middleware
import { errorHandler } from './middleware/error.js';
import { rateLimit } from './middleware/rate-limit.js';
import { securityHeaders } from './middleware/security.js';
import { logger } from './lib/logger.js';

// Redis-backed cache (shared across instances)
import { memoryCache } from './services/memory-cache.js';
import { closeRedis, getRedis } from './config/redis.js';

// JWT verification for extracting brand context
import jwt from 'jsonwebtoken';

const app = new Hono();

// Extend Hono context types
declare module 'hono' {
  interface ContextVariableMap {
    db: any;
    brandId: string;
    ownerId: string;
    brand: any;
    brandOwner: any;
  }
}

// Global error handler
app.onError(errorHandler);

// Security headers
app.use('*', securityHeaders());

// Request logging
app.use('*', honoLogger());

// CORS
app.use('*', cors({
  origin: env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3001'])
    : '*',
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
app.use('/api/*', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // 500 req/15min — enough for 100K txn/month
  message: 'Too many requests, please try again later.'
}));

// ── Tenant context middleware ──
// Extracts brandId from JWT token in Authorization header.
// Public routes (auth, health) skip this.
app.use('/api/*', async (c, next) => {
  const path = c.req.path;

  // Public routes — no brand context needed
  if (path.startsWith('/api/auth') || path === '/api/health' || path === '/api/test') {
    await next();
    return;
  }

  // Admin routes have their own auth check, but still need token parsing
  const authHeader = c.req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    // No token on a non-public route → reject
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;

    // Always set ownerId if present (needed for admin routes)
    if (decoded.ownerId) {
      c.set('ownerId', decoded.ownerId);
      c.set('brandOwner', { id: decoded.ownerId, email: decoded.email });
    }

    if (decoded.brandId) {
      c.set('brandId', decoded.brandId);

      // Optionally load brand details (cached in memory)
      const cacheKey = `brand:${decoded.brandId}`;
      let brand = await memoryCache.get(cacheKey);
      if (!brand) {
        const result = await db.query(
          'SELECT id, name, subdomain, primary_color, secondary_color, settings, is_active FROM brands WHERE id = $1 AND is_active = true',
          [decoded.brandId]
        );
        if (result.rows.length > 0) {
          brand = result.rows[0];
          await memoryCache.set(cacheKey, brand, 300); // 5 min TTL (seconds)
        }
      }
      if (brand) c.set('brand', brand);
    }
  } catch {
    // Invalid token — continue without context, individual routes will reject if needed
  }

  await next();
});

// ── Root ──
app.get('/', (c) => {
  return c.json({
    name: 'Chronizer API',
    version: '2.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      transactions: '/api/transactions',
      transactionsExport: '/api/transactions/export',
      products: '/api/products',
      stores: '/api/stores',
      inventory: '/api/inventory',
      analytics: '/api/analytics',
      stockMoves: '/api/stock-moves',
      admin: '/api/admin',
      skuMap: '/api/sku-map'
    }
  });
});

// ── Health check ──
app.get('/api/health', async (c) => {
  try {
    const dbResult = await db.query('SELECT NOW()');
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      services: {
        database: dbResult.rows.length > 0 ? 'connected' : 'disconnected',
        cache: 'redis',
        redis: await getRedis().ping() === 'PONG' ? 'connected' : 'disconnected'
      }
    });
  } catch (error: any) {
    return c.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message || 'Unknown error'
    }, 500);
  }
});

// ── Test ──
app.get('/api/test', (c) => {
  return c.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
});

// ── API routes ──
app.route('/api/auth', authRoutes);
app.route('/api/brand', brandRoutes);
app.route('/api/transactions', transactionsRoutes);
app.route('/api/stock-moves', stockMovesRoutes);
app.route('/api/inventory', inventoryRoutes);
app.route('/api/analytics', analyticsRoutes);
app.route('/api/system', systemRoutes);
app.route('/api/products', productsRoutes);
app.route('/api/stores', storesRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/sku-map', skuMapRoutes);
app.route('/api/unmapped-skus', unmappedSkusRoutes);
app.route('/api/notifications', notificationsRoutes);
app.route('/api/scrapers', scraperRoutes);

// ── Cache stats (in-memory) — require authentication ──
app.get('/api/cache/stats', (c) => {
  const ownerId = c.get('ownerId');
  if (!ownerId) return c.json({ success: false, error: 'Authentication required' }, 401);
  return c.json(memoryCache.getStats());
});

app.post('/api/cache/clear', (c) => {
  const ownerId = c.get('ownerId');
  if (!ownerId) return c.json({ success: false, error: 'Authentication required' }, 401);
  memoryCache.clear();
  return c.json({ message: 'Cache cleared' });
});

// ── Start server ──
const PORT = env.PORT || 3000;
logger.info(`Starting server on port ${PORT}...`);

serve({
  fetch: app.fetch,
  port: PORT
}, (info) => {
  logger.info(`Server running at http://localhost:${info.port}`);
  logger.info(`Health: http://localhost:${info.port}/api/health`);

  logger.info('Scraper scheduler runs in separate worker process (src/worker.ts)');
});

// ── Graceful shutdown ──
const shutdown = async () => {
  logger.info('Shutting down...');
  try {
    await closeRedis();
    await db.end();
    logger.info('Database pool and Redis closed');
  } catch (error) {
    logger.error('Shutdown error:', error);
  }
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
