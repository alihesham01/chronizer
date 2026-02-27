import { redisManager } from './redis-manager.js';
import { logger } from '../lib/logger.js';

export type MessageHandler = (message: any) => void | Promise<void>;

export class PubSubService {
  private handlers = new Map<string, Set<MessageHandler>>();
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      const subscriber = redisManager.getSubscriber();

      // Handle incoming messages
      subscriber.on('message', async (channel: string, message: string) => {
        try {
          const handlers = this.handlers.get(channel);
          if (!handlers || handlers.size === 0) {
            return;
          }

          const parsed = JSON.parse(message);
          
          // Execute all handlers for this channel
          await Promise.all(
            Array.from(handlers).map(handler => 
              Promise.resolve(handler(parsed)).catch(err => {
                logger.error('PubSub handler error:', { channel, error: err });
              })
            )
          );
        } catch (error) {
          logger.error('PubSub message parse error:', { channel, error });
        }
      });

      // Handle pattern messages
      subscriber.on('pmessage', async (pattern: string, channel: string, message: string) => {
        try {
          const handlers = this.handlers.get(pattern);
          if (!handlers || handlers.size === 0) {
            return;
          }

          const parsed = JSON.parse(message);
          
          await Promise.all(
            Array.from(handlers).map(handler => 
              Promise.resolve(handler({ ...parsed, channel })).catch(err => {
                logger.error('PubSub pattern handler error:', { pattern, channel, error: err });
              })
            )
          );
        } catch (error) {
          logger.error('PubSub pattern message parse error:', { pattern, channel, error });
        }
      });

      this.isInitialized = true;
      logger.info('PubSub service initialized');
    } catch (error) {
      logger.error('Failed to initialize PubSub:', error);
    }
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    try {
      if (!this.handlers.has(channel)) {
        this.handlers.set(channel, new Set());
        
        // Subscribe to Redis channel
        const subscriber = redisManager.getSubscriber();
        await subscriber.subscribe(channel);
        logger.info(`Subscribed to channel: ${channel}`);
      }

      this.handlers.get(channel)!.add(handler);
    } catch (error) {
      logger.error('Subscribe error:', { channel, error });
      throw error;
    }
  }

  /**
   * Subscribe to a pattern
   */
  async psubscribe(pattern: string, handler: MessageHandler): Promise<void> {
    try {
      if (!this.handlers.has(pattern)) {
        this.handlers.set(pattern, new Set());
        
        // Subscribe to Redis pattern
        const subscriber = redisManager.getSubscriber();
        await subscriber.psubscribe(pattern);
        logger.info(`Subscribed to pattern: ${pattern}`);
      }

      this.handlers.get(pattern)!.add(handler);
    } catch (error) {
      logger.error('Pattern subscribe error:', { pattern, error });
      throw error;
    }
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: string, handler?: MessageHandler): Promise<void> {
    try {
      const handlers = this.handlers.get(channel);
      if (!handlers) {
        return;
      }

      if (handler) {
        handlers.delete(handler);
        
        // If no more handlers, unsubscribe from Redis
        if (handlers.size === 0) {
          const subscriber = redisManager.getSubscriber();
          await subscriber.unsubscribe(channel);
          this.handlers.delete(channel);
          logger.info(`Unsubscribed from channel: ${channel}`);
        }
      } else {
        // Remove all handlers
        const subscriber = redisManager.getSubscriber();
        await subscriber.unsubscribe(channel);
        this.handlers.delete(channel);
        logger.info(`Unsubscribed from channel: ${channel}`);
      }
    } catch (error) {
      logger.error('Unsubscribe error:', { channel, error });
    }
  }

  /**
   * Publish message to a channel
   */
  async publish(channel: string, message: any): Promise<number> {
    try {
      if (!redisManager.isConnected()) {
        logger.warn('Redis not connected, message not published');
        return 0;
      }

      const publisher = redisManager.getPublisher();
      const serialized = JSON.stringify(message);
      const receivers = await publisher.publish(channel, serialized);
      
      logger.debug(`Published to ${channel}:`, { receivers, message });
      return receivers;
    } catch (error) {
      logger.error('Publish error:', { channel, error });
      return 0;
    }
  }

  /**
   * Get active subscriptions
   */
  getSubscriptions(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get subscriber count for a channel
   */
  getHandlerCount(channel: string): number {
    return this.handlers.get(channel)?.size || 0;
  }

  /**
   * Cleanup all subscriptions
   */
  async cleanup(): Promise<void> {
    try {
      const subscriber = redisManager.getSubscriber();
      
      // Unsubscribe from all channels
      const channels = Array.from(this.handlers.keys());
      if (channels.length > 0) {
        await subscriber.unsubscribe(...channels);
      }

      this.handlers.clear();
      logger.info('PubSub cleanup complete');
    } catch (error) {
      logger.error('PubSub cleanup error:', error);
    }
  }
}

// Singleton instance - lazy loaded
let pubsubInstance: PubSubService | null = null;

export function getPubSub(): PubSubService {
  if (!pubsubInstance) {
    pubsubInstance = new PubSubService();
  }
  return pubsubInstance;
}

// For backward compatibility
export const pubsub = {
  get instance() {
    return getPubSub();
  }
};
