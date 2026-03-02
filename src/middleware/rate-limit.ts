import type { MiddlewareHandler } from 'hono';
import { getRedis } from '../config/redis.js';
import { logger } from '../lib/logger.js';

/**
 * Redis-backed rate limiter.
 * - Works across multiple server instances (shared state)
 * - Supports per-IP and per-brand keys
 * - Uses Redis INCR + EXPIRE for atomic, race-free counting
 */
export const rateLimit = (options: {
  windowMs: number;
  max: number;
  message?: string;
  keyPrefix?: string;
  /** If true, also rate-limit per brandId (from JWT context) */
  perBrand?: boolean;
}): MiddlewareHandler => {
  const { windowMs, max, message = 'Too many requests', keyPrefix = 'rl', perBrand = false } = options;
  const windowSec = Math.ceil(windowMs / 1000);

  return async (c, next) => {
    const ip = c.req.header('x-forwarded-for') ||
               c.req.header('x-real-ip') ||
               'unknown';
    const brandId = perBrand ? (c.get('brandId') as string | undefined) : undefined;

    // Build key: "rl:<prefix>:<ip>" or "rl:<prefix>:brand:<brandId>"
    const keyParts = [keyPrefix, ip];
    if (brandId) keyParts.push('brand', brandId);
    const redisKey = keyParts.join(':');

    try {
      const redis = getRedis();
      const count = await redis.incr(redisKey);

      // Set TTL only on first request in window
      if (count === 1) {
        await redis.expire(redisKey, windowSec);
      }

      const ttl = await redis.ttl(redisKey);
      const resetTime = new Date(Date.now() + ttl * 1000).toISOString();

      // Set rate limit headers
      c.header('X-RateLimit-Limit', max.toString());
      c.header('X-RateLimit-Remaining', Math.max(0, max - count).toString());
      c.header('X-RateLimit-Reset', resetTime);

      if (count > max) {
        return c.json({
          success: false,
          error: message,
          retryAfter: ttl
        }, 429);
      }
    } catch (err: any) {
      // If Redis is down, allow the request (fail-open) but log warning
      logger.warn('[RateLimit] Redis error, allowing request:', err.message);
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
