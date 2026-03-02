import { logger } from '../lib/logger.js';
import { getRedis } from '../config/redis.js';

/**
 * Redis-backed cache that replaces the old 1,000-item in-memory cache.
 * - No size limit (Redis manages memory via maxmemory / eviction policy)
 * - Shared across all server instances (no stale-data problem)
 * - Same async interface so callers don't need to change
 */
class RedisCache {
  private prefix = 'cache:';
  private stats = { hits: 0, misses: 0, sets: 0, deletes: 0 };

  private k(key: string) { return this.prefix + key; }

  async get(key: string): Promise<any | null> {
    try {
      const raw = await getRedis().get(this.k(key));
      if (raw === null) { this.stats.misses++; return null; }
      this.stats.hits++;
      return JSON.parse(raw);
    } catch (err: any) {
      logger.error('[Cache] get error:', err.message);
      this.stats.misses++;
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
    try {
      await getRedis().set(this.k(key), JSON.stringify(value), 'EX', ttlSeconds);
      this.stats.sets++;
    } catch (err: any) {
      logger.error('[Cache] set error:', err.message);
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const result = await getRedis().del(this.k(key));
      if (result > 0) this.stats.deletes++;
      return result > 0;
    } catch (err: any) {
      logger.error('[Cache] del error:', err.message);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await getRedis().exists(this.k(key))) === 1;
    } catch { return false; }
  }

  async clear(): Promise<void> {
    try {
      const redis = getRedis();
      let cursor = '0';
      let totalDeleted = 0;
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', this.prefix + '*', 'COUNT', 200);
        cursor = next;
        if (keys.length > 0) {
          await redis.del(...keys);
          totalDeleted += keys.length;
        }
      } while (cursor !== '0');
      logger.info(`[Cache] Cleared ${totalDeleted} items`);
    } catch (err: any) {
      logger.error('[Cache] clear error:', err.message);
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await getRedis().ttl(this.k(key));
    } catch { return -1; }
  }

  async mget(keys: string[]): Promise<Array<any | null>> {
    if (keys.length === 0) return [];
    try {
      const rKeys = keys.map(k => this.k(k));
      const results = await getRedis().mget(...rKeys);
      return results.map(r => {
        if (r === null) { this.stats.misses++; return null; }
        this.stats.hits++;
        return JSON.parse(r);
      });
    } catch { return keys.map(() => null); }
  }

  async mset(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    try {
      const pipeline = getRedis().pipeline();
      for (const e of entries) {
        pipeline.set(this.k(e.key), JSON.stringify(e.value), 'EX', e.ttl || 300);
      }
      await pipeline.exec();
      this.stats.sets += entries.length;
    } catch (err: any) {
      logger.error('[Cache] mset error:', err.message);
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      const redisPattern = this.prefix + pattern.replace(/\*/g, '*');
      const redis = getRedis();
      const allKeys: string[] = [];
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', redisPattern, 'COUNT', 200);
        cursor = next;
        allKeys.push(...keys.map(k => k.slice(this.prefix.length)));
      } while (cursor !== '0');
      return allKeys;
    } catch { return []; }
  }

  getStats(): any {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
      backend: 'redis',
    };
  }

  getTopKeys(_limit: number = 10): Array<{ key: string; hits: number }> {
    // Redis doesn't track per-key hits; return empty for compatibility
    return [];
  }
}

export const memoryCache = new RedisCache();
