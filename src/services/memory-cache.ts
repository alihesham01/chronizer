import { logger } from '../lib/logger.js';

interface CacheItem {
  value: any;
  expiry: number;
  hits: number;
}

const MAX_CACHE_SIZE = 1000;

class MemoryCache {
  private cache: Map<string, CacheItem> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0
  };

  async get(key: string): Promise<any | null> {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    item.hits++;
    this.stats.hits++;
    return item.value;
  }

  async set(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
    // LRU eviction: if at capacity, remove the least-recently-hit entry
    if (this.cache.size >= MAX_CACHE_SIZE && !this.cache.has(key)) {
      this.evictLRU();
    }

    const expiry = Date.now() + (ttlSeconds * 1000);
    
    this.cache.set(key, {
      value,
      expiry,
      hits: 0
    });
    
    this.stats.sets++;
  }

  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruHits = Infinity;

    for (const [key, item] of this.cache.entries()) {
      // Prefer expired items first
      if (Date.now() > item.expiry) {
        this.cache.delete(key);
        this.stats.evictions++;
        return;
      }
      if (item.hits < lruHits) {
        lruHits = item.hits;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
    }
  }

  async del(key: string): Promise<boolean> {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  async exists(key: string): Promise<boolean> {
    const item = this.cache.get(key);
    
    if (!item) {
      return false;
    }
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  async clear(): Promise<void> {
    const size = this.cache.size;
    this.cache.clear();
    logger.info(`Cleared ${size} items from memory cache`);
  }

  async ttl(key: string): Promise<number> {
    const item = this.cache.get(key);
    
    if (!item) {
      return -1;
    }
    
    const remaining = Math.ceil((item.expiry - Date.now()) / 1000);
    return remaining > 0 ? remaining : -1;
  }

  // Get multiple keys
  async mget(keys: string[]): Promise<Array<any | null>> {
    return Promise.all(keys.map(key => this.get(key)));
  }

  // Set multiple keys
  async mset(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    await Promise.all(
      entries.map(entry => this.set(entry.key, entry.value, entry.ttl))
    );
  }

  // Get all matching keys
  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.cache.keys()).filter(key => regex.test(key));
  }

  // Clean up expired entries
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} expired cache entries`);
    }
    
    return cleaned;
  }

  // Get cache statistics
  getStats(): any {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
      : 0;
    
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryUsage: this.getMemoryUsage()
    };
  }

  // Estimate memory usage
  private getMemoryUsage(): string {
    let totalSize = 0;
    for (const [key, item] of this.cache.entries()) {
      totalSize += key.length * 2; // UTF-16
      totalSize += JSON.stringify(item.value).length * 2;
    }
    
    if (totalSize < 1024) {
      return `${totalSize} bytes`;
    } else if (totalSize < 1024 * 1024) {
      return `${Math.round(totalSize / 1024)} KB`;
    } else {
      return `${Math.round(totalSize / (1024 * 1024))} MB`;
    }
  }

  // Get top keys by hit count
  getTopKeys(limit: number = 10): Array<{ key: string; hits: number }> {
    return Array.from(this.cache.entries())
      .map(([key, item]) => ({ key, hits: item.hits }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit);
  }
}

export const memoryCache = new MemoryCache();

// Auto cleanup every 5 minutes
setInterval(() => {
  memoryCache.cleanup();
}, 5 * 60 * 1000);
