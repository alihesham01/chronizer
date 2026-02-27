import Redis, { type RedisOptions } from 'ioredis';
import { logger } from '../lib/logger.js';
import { getEnv } from '../config/env.js';

class RedisManager {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;
  private isShuttingDown = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_DELAY_MS = 1000;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initialize();
  }

  private getConfig(): RedisOptions {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    return {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      retryStrategy: (times: number) => {
        if (this.isShuttingDown) {
          return null; // Stop retrying during shutdown
        }
        
        if (times > this.MAX_RECONNECT_ATTEMPTS) {
          logger.error('Redis max reconnection attempts reached');
          return null;
        }
        
        const delay = Math.min(times * this.RECONNECT_DELAY_MS, 10000);
        logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
        return delay;
      },
      reconnectOnError: (err: Error) => {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        if (targetErrors.some(e => err.message.includes(e))) {
          logger.warn('Redis reconnecting due to error:', err.message);
          return 1; // Reconnect
        }
        return false;
      },
      lazyConnect: false,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
      ...(redisUrl.startsWith('redis://') ? {} : { host: 'localhost', port: 6379 })
    };
  }

  private initialize() {
    try {
      const config = this.getConfig();
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

      // Main client for commands
      this.client = new Redis(redisUrl, config);
      
      // Separate clients for pub/sub (required by Redis)
      this.subscriber = new Redis(redisUrl, config);
      this.publisher = new Redis(redisUrl, config);

      this.setupEventHandlers(this.client, 'main');
      this.setupEventHandlers(this.subscriber, 'subscriber');
      this.setupEventHandlers(this.publisher, 'publisher');

      this.startHealthCheck();
      
      logger.info('Redis manager initialized');
    } catch (error) {
      logger.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  private setupEventHandlers(client: Redis, name: string) {
    client.on('connect', () => {
      logger.info(`Redis ${name} connecting...`);
      this.reconnectAttempts = 0;
    });

    client.on('ready', () => {
      logger.info(`Redis ${name} ready`);
    });

    client.on('error', (err) => {
      logger.error(`Redis ${name} error:`, err);
    });

    client.on('close', () => {
      logger.warn(`Redis ${name} connection closed`);
    });

    client.on('reconnecting', (delay: number) => {
      this.reconnectAttempts++;
      logger.info(`Redis ${name} reconnecting (attempt ${this.reconnectAttempts}, delay: ${delay}ms)`);
    });

    client.on('end', () => {
      logger.warn(`Redis ${name} connection ended`);
    });
  }

  private startHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        if (this.client) {
          await this.client.ping();
        }
      } catch (error) {
        logger.error('Redis health check failed:', error);
      }
    }, 30000); // Every 30 seconds
  }

  // Get main client
  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client;
  }

  // Get subscriber client
  getSubscriber(): Redis {
    if (!this.subscriber) {
      throw new Error('Redis subscriber not initialized');
    }
    return this.subscriber;
  }

  // Get publisher client
  getPublisher(): Redis {
    if (!this.publisher) {
      throw new Error('Redis publisher not initialized');
    }
    return this.publisher;
  }

  // Check if Redis is connected
  isConnected(): boolean {
    return this.client?.status === 'ready';
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    logger.info('Shutting down Redis connections...');

    const shutdownPromises: Promise<void>[] = [];

    if (this.client) {
      shutdownPromises.push(
        this.client.quit().catch(err => {
          logger.error('Error closing Redis client:', err);
          return this.client!.disconnect();
        }).then(() => undefined) // Convert void | "OK" to void
      );
    }

    if (this.subscriber) {
      shutdownPromises.push(
        this.subscriber.quit().catch(err => {
          logger.error('Error closing Redis subscriber:', err);
          return this.subscriber!.disconnect();
        }).then(() => undefined) // Convert void | "OK" to void
      );
    }

    if (this.publisher) {
      shutdownPromises.push(
        this.publisher.quit().catch(err => {
          logger.error('Error closing Redis publisher:', err);
          return this.publisher!.disconnect();
        }).then(() => undefined) // Convert void | "OK" to void
      );
    }

    await Promise.all(shutdownPromises);
    logger.info('Redis connections closed');
  }

  // Health check
  async healthCheck(): Promise<{ status: string; latency?: number; error?: string }> {
    try {
      const start = Date.now();
      await this.client?.ping();
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        latency
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Singleton instance
export const redisManager = new RedisManager();
