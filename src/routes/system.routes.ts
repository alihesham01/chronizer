import { Hono } from 'hono';

const system = new Hono();

// GET /api/system/health - System health check
system.get('/health', async (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '2.0.0'
  });
});

// GET /api/system/info - System information
system.get('/info', async (c) => {
  return c.json({
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    environment: process.env.NODE_ENV || 'development'
  });
});

export { system as systemRoutes };
