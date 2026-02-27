import { config } from 'dotenv';
config();

// Mock Redis for testing without Redis server
const mockRedis = {
  get: async () => null,
  set: async () => 'OK',
  del: async () => 1,
  exists: async () => 0,
  quit: async () => 'OK',
  disconnect: async () => {},
  on: () => {},
  status: 'ready'
};

// Mock WebSocket
const mockWebSocket = {
  getClientCount: () => 0,
  getStats: () => ({ connectedClients: 0 }),
  shutdown: async () => {}
};

// Mock queue manager
const mockQueueManager = {
  addJob: async () => ({ id: 'mock-job-id' }),
  getJob: async () => null,
  getStats: async () => ({ activeQueues: [], activeWorkers: [] }),
  shutdown: async () => {}
};

// Mock cache
const mockCache = {
  get: async () => null,
  set: async () => {},
  delete: async () => {},
  clear: async () => {},
  getStats: async () => ({ l1: { hits: 0, misses: 0 }, l2: { hits: 0, misses: 0 } }),
  shutdown: () => {}
};

// Mock analytics
const mockAnalytics = {
  getDashboardMetrics: async () => ({
    today: { today_transactions: 0, today_revenue: 0 },
    yesterday: { yesterday_transactions: 0 },
    month: { month_transactions: 0, month_revenue: 0 },
    topStore: null
  }),
  refreshViews: async () => ({ success: true })
};

console.log('🚀 Starting Woke Portal Server (Demo Mode - No Redis)');
console.log('📊 This demo shows the API structure without Redis/Queue/Analytics');
console.log('');

// Start a simple server
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';

const app = new Hono();

// CORS
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Woke Portal API',
    version: '2.0.0',
    status: 'running',
    mode: 'demo (no Redis)',
    endpoints: {
      health: '/api/health',
      transactions: '/api/transactions',
      analytics: '/api/analytics',
    }
  });
});

// Health check
app.get('/api/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    services: {
      database: { status: 'connected' },
      redis: { status: 'disconnected (demo mode)' },
      websocket: { status: 'disabled (demo mode)' },
      queue: { status: 'disabled (demo mode)' }
    }
  });
});

// Mock transactions endpoint
app.get('/api/transactions', (c) => {
  return c.json({
    data: [],
    pagination: { hasMore: false, totalCount: 0, limit: 100 },
    message: 'Demo mode - No database connection'
  });
});

// Mock analytics endpoint
app.get('/api/analytics/dashboard', (c) => {
  return c.json({
    today: { today_transactions: 0, today_revenue: 0 },
    yesterday: { yesterday_transactions: 0 },
    month: { month_transactions: 0, month_revenue: 0 },
    topStore: null
  });
});

// Start server
const port = process.env.PORT || 3000;

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`✅ Server running at http://localhost:${port}`);
  console.log(`📊 API: http://localhost:${port}/api`);
  console.log(`💚 Health: http://localhost:${port}/api/health`);
  console.log('');
  console.log('🔥 Demo Mode Active:');
  console.log('  - No Redis (caching disabled)');
  console.log('  - No WebSocket (real-time disabled)');
  console.log('  - No Queue (async jobs disabled)');
  console.log('  - Database connection simulated');
  console.log('');
  console.log('📝 To run full system:');
  console.log('  1. Install Redis: choco install redis-64');
  console.log('  2. Start Redis: redis-server');
  console.log('  3. Run: npm run dev');
});
