import { redisManager } from './redis-manager.js';
import { logger } from '../lib/logger.js';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

export class CacheService {
  private defaultTTL = 300; // 5 minutes
  private prefix = 'cache:';

  /**
   * Get value from cache
   * Handles Redis unavailability gracefully
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!redisManager.isConnected()) {
        logger.warn('Redis not connected, cache miss');
        return null;
      }

      const client = redisManager.getClient();
      const fullKey = this.prefix + key;
      const value = await client.get(fullKey);

      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Cache get error:', { key, error });
      return null; // Fail gracefully
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key: string, value: any, options?: CacheOptions): Promise<void> {
    try {
      if (!redisManager.isConnected()) {
        logger.warn('Redis not connected, skipping cache set');
        return;
      }

      const client = redisManager.getClient();
      const fullKey = this.prefix + key;
      const ttl = options?.ttl || this.defaultTTL;
      const serialized = JSON.stringify(value);

      await client.setex(fullKey, ttl, serialized);
    } catch (error) {
      logger.error('Cache set error:', { key, error });
      // Don't throw - cache failures shouldn't break the app
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<void> {
    try {
      if (!redisManager.isConnected()) {
        return;
      }

      const client = redisManager.getClient();
      const fullKey = this.prefix + key;
      await client.del(fullKey);
    } catch (error) {
      logger.error('Cache delete error:', { key, error });
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern: string): Promise<void> {
    try {
      if (!redisManager.isConnected()) {
        return;
      }

      const client = redisManager.getClient();
      const fullPattern = this.prefix + pattern;
      
      // Use SCAN for safe pattern deletion (doesn't block Redis)
      let cursor = '0';
      do {
        const [newCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          fullPattern,
          'COUNT',
          100
        );
        cursor = newCursor;

        if (keys.length > 0) {
          await client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      logger.error('Cache delete pattern error:', { pattern, error });
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (!redisManager.isConnected()) {
        return false;
      }

      const client = redisManager.getClient();
      const fullKey = this.prefix + key;
      const result = await client.exists(fullKey);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', { key, error });
      return false;
    }
  }

  /**
   * Get or set pattern - fetch from cache or compute and cache
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const fresh = await fetcher();
    
    // Cache it
    await this.set(key, fresh, options);
    
    return fresh;
  }

  /**
   * Increment counter (for rate limiting, etc.)
   */
  async incr(key: string, ttl?: number): Promise<number> {
    try {
      if (!redisManager.isConnected()) {
        return 0;
      }

      const client = redisManager.getClient();
      const fullKey = this.prefix + key;
      const value = await client.incr(fullKey);

      // Set TTL on first increment
      if (value === 1 && ttl) {
        await client.expire(fullKey, ttl);
      }

      return value;
    } catch (error) {
      logger.error('Cache incr error:', { key, error });
      return 0;
    }
  }

  /**
   * Get TTL of a key
   */
  async ttl(key: string): Promise<number> {
    try {
      if (!redisManager.isConnected()) {
        return -1;
      }

      const client = redisManager.getClient();
      const fullKey = this.prefix + key;
      return await client.ttl(fullKey);
    } catch (error) {
      logger.error('Cache TTL error:', { key, error });
      return -1;
    }
  }

  /**
   * Clear all cache (use with caution)
   */
  async clear(): Promise<void> {
    try {
      if (!redisManager.isConnected()) {
        return;
      }

      await this.delPattern('*');
      logger.info('Cache cleared');
    } catch (error) {
      logger.error('Cache clear error:', error);
    }
  }
}

// Singleton instance
export const cache = new CacheService();
