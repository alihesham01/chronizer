import { logger } from '../lib/logger.js';
import { multiCache } from './multi-level-cache.js';

class CacheWarmer {
  private warming = false;
  private interval: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    if (this.warming) {
      return;
    }

    this.warming = true;
    logger.info('Cache warmer started');

    // Warm cache every 10 minutes
    this.interval = setInterval(() => {
      this.warmCache();
    }, 10 * 60 * 1000);

    // Initial warm up
    await this.warmCache();
  }

  async startAutoWarming(): Promise<void> {
    return this.start();
  }

  async warmCache(): Promise<void> {
    try {
      logger.info('Warming up cache...');

      // Warm up frequently accessed data
      // This is where you would pre-load common queries
      const commonQueries = [
        'brands:list',
        'stores:list',
        'products:featured',
        'analytics:summary'
      ];

      for (const query of commonQueries) {
        // Check if already cached
        const cached = await multiCache.get(query);
        if (cached === null) {
          // In a real implementation, you would fetch actual data
          // For now, just set placeholder data
          await multiCache.set(query, { data: 'placeholder', timestamp: Date.now() });
        }
      }

      logger.info('Cache warmed up successfully');
    } catch (error) {
      logger.error('Failed to warm cache:', error);
    }
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.warming = false;
    logger.info('Cache warmer stopped');
  }

  async warmKey(key: string, fetcher: () => Promise<any>): Promise<void> {
    try {
      await multiCache.getOrSet(key, fetcher);
      logger.info(`Warmed cache key: ${key}`);
    } catch (error) {
      logger.error(`Failed to warm cache key ${key}:`, error);
    }
  }
}

export const cacheWarmer = new CacheWarmer();
