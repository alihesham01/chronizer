import { logger } from '../lib/logger.js';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
}

class SimpleMemoryCache {
  private cache: Map<string, { value: any; expiry: number }> = new Map();

  async get(key: string): Promise<any | null> {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  async set(key: string, value: any, options: CacheOptions = {}): Promise<void> {
    const ttl = options.ttl || 300; // Default 5 minutes
    const expiry = Date.now() + (ttl * 1000);
    
    this.cache.set(key, { value, expiry });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async has(key: string): Promise<boolean> {
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

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

class MultiLevelCache {
  private l1Cache = new SimpleMemoryCache(); // Memory cache
  private l2Cache = new SimpleMemoryCache(); // Could be Redis in production

  async get(key: string): Promise<any | null> {
    // Try L1 cache first
    let value = await this.l1Cache.get(key);
    if (value !== null) {
      return value;
    }

    // Try L2 cache
    value = await this.l2Cache.get(key);
    if (value !== null) {
      // Promote to L1
      await this.l1Cache.set(key, value);
      return value;
    }

    return null;
  }

  async set(key: string, value: any, options: CacheOptions = {}): Promise<void> {
    // Set in both levels
    await this.l1Cache.set(key, value, options);
    await this.l2Cache.set(key, value, options);
  }

  async del(key: string): Promise<void> {
    await this.l1Cache.del(key);
    await this.l2Cache.del(key);
  }

  async clear(): Promise<void> {
    await this.l1Cache.clear();
    await this.l2Cache.clear();
  }

  // Cache wrapper with function
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    let value = await this.get(key);
    
    if (value === null) {
      value = await fetcher();
      await this.set(key, value, options);
    }
    
    return value as T;
  }

  // Statistics
  getStats(): { l1Size: number; l2Size: number } {
    return {
      l1Size: (this.l1Cache as any).cache.size,
      l2Size: (this.l2Cache as any).cache.size
    };
  }
}

// Export singleton instance
export const multiCache = new MultiLevelCache();

// Clean up expired entries every 5 minutes
setInterval(() => {
  (multiCache as any).l1Cache.cleanup();
  (multiCache as any).l2Cache.cleanup();
}, 5 * 60 * 1000);
