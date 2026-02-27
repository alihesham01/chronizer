import { Context } from 'hono';
import pino from 'pino';

// Configure logger for production
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  } : undefined,
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || 'unknown',
    service: 'chronizer-api',
  },
});

// Request logging middleware
export const requestLogger = async (c: Context, next: () => Promise<void>) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(2, 15);
  
  // Add request ID to context
  c.set('requestId', requestId);
  
  // Log request
  logger.info({
    requestId,
    method: c.req.method,
    path: c.req.path,
    query: c.req.query(),
    userAgent: c.req.header('user-agent'),
    ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
  }, 'Request started');
  
  await next();
  
  // Log response
  const duration = Date.now() - start;
  logger.info({
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration,
  }, 'Request completed');
};

// Performance monitoring
export const performanceMonitor = (name: string) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const start = Date.now();
      const requestId = this.get?.('requestId') || 'unknown';
      
      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - start;
        
        logger.info({
          requestId,
          method: name,
          duration,
          success: true,
        }, 'Method completed');
        
        return result;
      } catch (error: unknown) {
        const duration = Date.now() - start;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        logger.error({
          requestId,
          method: name,
          duration,
          success: false,
          error: errorMessage,
          stack: errorStack,
        }, 'Method failed');
        
        throw error;
      }
    };
    
    return descriptor;
  };
};

// Metrics collection
export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: Map<string, number> = new Map();
  
  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }
  
  increment(name: string, value: number = 1): void {
    const current = this.metrics.get(name) || 0;
    this.metrics.set(name, current + value);
  }
  
  gauge(name: string, value: number): void {
    this.metrics.set(name, value);
  }
  
  timer(name: string, duration: number): void {
    const key = `${name}_duration`;
    const count = this.metrics.get(`${key}_count`) || 0;
    const total = this.metrics.get(`${key}_total`) || 0;
    
    this.metrics.set(`${key}_count`, count + 1);
    this.metrics.set(`${key}_total`, total + duration);
    this.metrics.set(`${key}_avg`, total / (count + 1));
  }
  
  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }
  
  reset(): void {
    this.metrics.clear();
  }
}

// Error tracking
export class ErrorTracker {
  static track(error: unknown, context?: Record<string, any>): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : 'Unknown';
    
    const errorInfo = {
      message: errorMessage,
      stack: errorStack,
      name: errorName,
      timestamp: new Date().toISOString(),
      context,
      service: 'chronizer-api',
    };
    
    logger.error(errorInfo, 'Unhandled error');
    
    // In production, send to error tracking service
    if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
      // Integration with Sentry would go here
      // Sentry.captureException(error, { extra: context });
    }
  }
}

// Health check metrics
export const healthMetrics = {
  databaseConnections: 0,
  redisConnections: 0,
  activeJobs: 0,
  failedJobs: 0,
  lastHealthCheck: new Date(),
};
