import type { MiddlewareHandler } from 'hono';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

export const rateLimit = (options: {
  windowMs: number;
  max: number;
  message?: string;
}): MiddlewareHandler => {
  const { windowMs, max, message = 'Too many requests' } = options;

  return async (c, next) => {
    const ip = c.req.header('x-forwarded-for') || 
               c.req.header('x-real-ip') || 
               'unknown';
    
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old entries
    for (const key in store) {
      if (store[key].resetTime < windowStart) {
        delete store[key];
      }
    }

    // Check current IP
    if (!store[ip]) {
      store[ip] = {
        count: 1,
        resetTime: now + windowMs
      };
    } else {
      if (store[ip].resetTime < windowStart) {
        store[ip] = {
          count: 1,
          resetTime: now + windowMs
        };
      } else {
        store[ip].count++;
      }
    }

    // Set rate limit headers
    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, max - store[ip].count).toString());
    c.header('X-RateLimit-Reset', new Date(store[ip].resetTime).toISOString());

    // Check if limit exceeded
    if (store[ip].count > max) {
      return c.json({
        error: {
          message,
          retryAfter: Math.ceil((store[ip].resetTime - now) / 1000)
        }
      }, 429);
    }

    await next();
  };
};
