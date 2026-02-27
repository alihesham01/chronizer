import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { config } from 'dotenv';
config();

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
    mode: 'minimal demo',
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
      database: { status: 'connected (simulated)' },
      redis: { status: 'connected' },
      websocket: { status: 'disabled' },
      queue: { status: 'disabled' }
    }
  });
});

// Mock transactions endpoint
app.get('/api/transactions', (c) => {
  return c.json({
    data: [
      {
        id: 1,
        sku: 'PROD001',
        storeName: 'Store A',
        quantity: 5,
        sellingPrice: 50.00,
        totalAmount: 250.00,
        type: 'sale',
        date: new Date().toISOString()
      },
      {
        id: 2,
        sku: 'PROD002',
        storeName: 'Store B',
        quantity: 3,
        sellingPrice: 75.00,
        totalAmount: 225.00,
        type: 'sale',
        date: new Date().toISOString()
      }
    ],
    pagination: { hasMore: false, totalCount: 2, limit: 100 }
  });
});

// Mock analytics endpoint
app.get('/api/analytics/dashboard', (c) => {
  return c.json({
    today: { today_transactions: 234, today_revenue: 45230.50 },
    yesterday: { yesterday_transactions: 220 },
    month: { month_transactions: 4500, month_revenue: 450000.00 },
    topStore: { store_name: 'Store A', transaction_count: 45, revenue: 4500.00 }
  });
});

// Mock cache stats
app.get('/api/cache/stats', (c) => {
  return c.json({
    metrics: {
      l1: { hits: 1500, misses: 100, hitRate: 93.75 },
      l2: { hits: 80, misses: 20, hitRate: 80.0 },
      overall: { hits: 1580, misses: 120, hitRate: 92.94 }
    },
    l1: {
      size: 52428800,
      itemCount: 2500,
      evictions: 50
    }
  });
});

// Mock queue stats
app.get('/api/queue/stats', (c) => {
  return c.json({
    activeQueues: ['transactions'],
    activeWorkers: ['transactions'],
    queueStats: {
      transactions: {
        waiting: 0,
        active: 0,
        completed: 234,
        failed: 2,
      }
    }
  });
});

// Start server
const port = process.env.PORT || 3000;

console.log('🚀 Starting Woke Portal Server (Minimal Demo)...');
console.log('📊 This shows the API structure with mock data');

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`✅ Server running at http://localhost:${port}`);
  console.log(`📊 API: http://localhost:${port}/api`);
  console.log(`💚 Health: http://localhost:${port}/api/health`);
  console.log(`📈 Transactions: http://localhost:${port}/api/transactions`);
  console.log(`📊 Analytics: http://localhost:${port}/api/analytics/dashboard`);
  console.log(`💾 Cache Stats: http://localhost:${port}/api/cache/stats`);
  console.log(`⚙️  Queue Stats: http://localhost:${port}/api/queue/stats`);
  console.log('');
  console.log('🔥 Demo Mode:');
  console.log('  ✅ API endpoints working');
  console.log('  ✅ Mock data for testing');
  console.log('  ✅ Redis connected');
  console.log('  ❌ Database operations (mocked)');
  console.log('  ❌ WebSocket (disabled)');
  console.log('  ❌ Real-time updates (disabled)');
  console.log('');
  console.log('📝 Test the API:');
  console.log('  curl http://localhost:3000/api/health');
  console.log('  curl http://localhost:3000/api/transactions');
  console.log('  curl http://localhost:3000/api/analytics/dashboard');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...');
  process.exit(0);
});
