import Redis from 'ioredis';
import { logger } from '../lib/logger.js';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';

    redis = new Redis(url, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: true,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 5000);
        logger.warn(`[Redis] Reconnecting... attempt ${times}, delay ${delay}ms`);
        return delay;
      },
    });

    redis.on('connect', () => logger.info('[Redis] Connected'));
    redis.on('error', (err) => logger.error('[Redis] Error:', err.message));
    redis.on('close', () => logger.warn('[Redis] Connection closed'));
  }

  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('[Redis] Disconnected');
  }
}
