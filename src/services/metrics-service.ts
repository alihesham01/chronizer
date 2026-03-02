import client from 'prom-client';

// Create a Registry
const register = new client.Registry();
register.setDefaultLabels({ app: 'chronizer' });

// Collect default Node.js metrics (CPU, memory, GC, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const activeConnections = new client.Gauge({
  name: 'db_active_connections',
  help: 'Number of active database connections',
  registers: [register],
});

export const scraperJobsTotal = new client.Counter({
  name: 'scraper_jobs_total',
  help: 'Total number of scraper jobs',
  labelNames: ['status', 'group_name'],
  registers: [register],
});

export const scraperJobDuration = new client.Histogram({
  name: 'scraper_job_duration_seconds',
  help: 'Duration of scraper jobs in seconds',
  labelNames: ['group_name'],
  buckets: [10, 30, 60, 120, 300, 600],
  registers: [register],
});

export const cacheHits = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  registers: [register],
});

export const cacheMisses = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  registers: [register],
});

export const notificationsSent = new client.Counter({
  name: 'notifications_sent_total',
  help: 'Total notifications sent',
  labelNames: ['type', 'channel'],
  registers: [register],
});

export async function getMetrics(): Promise<string> {
  return register.metrics();
}

export function getContentType(): string {
  return register.contentType;
}
