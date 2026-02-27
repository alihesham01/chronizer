import type { MiddlewareHandler } from 'hono';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

function createStore(): RateLimitStore {
  return {};
}

export const rateLimit = (options: {
  windowMs: number;
  max: number;
  message?: string;
  keyPrefix?: string;
}): MiddlewareHandler => {
  const { windowMs, max, message = 'Too many requests', keyPrefix = '' } = options;
  const store = createStore();

  return async (c, next) => {
    const ip = c.req.header('x-forwarded-for') || 
               c.req.header('x-real-ip') || 
               'unknown';
    const key = keyPrefix ? `${keyPrefix}:${ip}` : ip;
    
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old entries
    for (const k in store) {
      if (store[k].resetTime < windowStart) {
        delete store[k];
      }
    }

    // Check current key
    if (!store[key]) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs
      };
    } else {
      if (store[key].resetTime < windowStart) {
        store[key] = {
          count: 1,
          resetTime: now + windowMs
        };
      } else {
        store[key].count++;
      }
    }

    // Set rate limit headers
    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, max - store[key].count).toString());
    c.header('X-RateLimit-Reset', new Date(store[key].resetTime).toISOString());

    // Check if limit exceeded
    if (store[key].count > max) {
      return c.json({
        success: false,
        error: message,
        retryAfter: Math.ceil((store[key].resetTime - now) / 1000)
      }, 429);
    }

    await next();
  };
};

// Pre-configured login rate limiter: 10 attempts per 15 minutes
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts, please try again later.',
  keyPrefix: 'login'
});
