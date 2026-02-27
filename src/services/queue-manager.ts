import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { redisManager } from './redis-manager.js';
import { logger } from '../lib/logger.js';

export interface JobData {
  type: string;
  payload: any;
  metadata?: {
    userId?: string;
    timestamp: number;
    retryCount?: number;
  };
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
}

export type JobProcessor = (job: Job<JobData>) => Promise<JobResult>;

class QueueManager {
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();
  private queueEvents = new Map<string, QueueEvents>();
  private processors = new Map<string, JobProcessor>();
  private isShuttingDown = false;

  // Default options
  private readonly DEFAULT_JOB_OPTIONS = {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000, // 2 seconds
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 1000, // Keep max 1000 completed jobs
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
    },
  };

  private readonly WORKER_OPTIONS = {
    concurrency: 10, // Process 10 jobs concurrently
    limiter: {
      max: 100, // Max 100 jobs
      duration: 1000, // Per second
    },
  };

  /**
   * Create a new queue
   */
  createQueue(name: string): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    try {
      const connection = redisManager.getClient();
      
      const queue = new Queue(name, {
        connection: connection as any,
        defaultJobOptions: this.DEFAULT_JOB_OPTIONS,
      });

      // Setup queue events
      const queueEvents = new QueueEvents(name, {
        connection: connection as any,
      });

      // Event handlers
      queueEvents.on('completed', ({ jobId, returnvalue }) => {
        logger.info(`Job completed: ${jobId} in queue ${name}`, { returnvalue });
      });

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        logger.error(`Job failed: ${jobId} in queue ${name}`, { failedReason });
      });

      queueEvents.on('progress', ({ jobId, data }) => {
        logger.debug(`Job progress: ${jobId} in queue ${name}`, { data });
      });

      queueEvents.on('stalled', ({ jobId }) => {
        logger.warn(`Job stalled: ${jobId} in queue ${name}`);
      });

      this.queues.set(name, queue);
      this.queueEvents.set(name, queueEvents);

      logger.info(`Queue created: ${name}`);
      return queue;
    } catch (error) {
      logger.error(`Failed to create queue ${name}:`, error);
      throw error;
    }
  }

  /**
   * Register a job processor
   */
  registerProcessor(queueName: string, processor: JobProcessor): Worker {
    if (this.workers.has(queueName)) {
      logger.warn(`Worker already exists for queue: ${queueName}`);
      return this.workers.get(queueName)!;
    }

    try {
      const connection = redisManager.getClient();

      const worker = new Worker(
        queueName,
        async (job: Job<JobData>) => {
          if (this.isShuttingDown) {
            throw new Error('Worker is shutting down');
          }

          logger.info(`Processing job: ${job.id} in queue ${queueName}`, {
            type: job.data.type,
            attempts: job.attemptsMade,
          });

          try {
            const result = await processor(job);
            
            if (!result.success) {
              throw new Error(result.error || 'Job processing failed');
            }

            return result;
          } catch (error) {
            logger.error(`Job processing error: ${job.id}`, error);
            throw error;
          }
        },
        {
          connection: connection as any,
          ...this.WORKER_OPTIONS,
        }
      );

      // Worker event handlers
      worker.on('completed', (job: Job) => {
        logger.info(`Worker completed job: ${job.id}`);
      });

      worker.on('failed', (job: Job | undefined, error: Error) => {
        logger.error(`Worker failed job: ${job?.id}`, { error: error.message });
      });

      worker.on('error', (error: Error) => {
        logger.error(`Worker error in queue ${queueName}:`, error);
      });

      worker.on('stalled', (jobId: string) => {
        logger.warn(`Worker detected stalled job: ${jobId}`);
      });

      this.workers.set(queueName, worker);
      this.processors.set(queueName, processor);

      logger.info(`Worker registered for queue: ${queueName}`);
      return worker;
    } catch (error) {
      logger.error(`Failed to register worker for ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Add job to queue
   */
  async addJob(
    queueName: string,
    data: JobData,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
      jobId?: string;
    }
  ): Promise<Job<JobData>> {
    const queue = this.queues.get(queueName) || this.createQueue(queueName);

    try {
      const job = await queue.add(
        data.type,
        {
          ...data,
          metadata: {
            ...data.metadata,
            timestamp: Date.now(),
          },
        },
        {
          ...options,
          jobId: options?.jobId,
        }
      );

      logger.debug(`Job added to queue ${queueName}:`, {
        jobId: job.id,
        type: data.type,
      });

      return job;
    } catch (error) {
      logger.error(`Failed to add job to queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Add multiple jobs in bulk
   */
  async addBulk(
    queueName: string,
    jobs: Array<{
      name: string;
      data: JobData;
      opts?: any;
    }>
  ): Promise<Job<JobData>[]> {
    const queue = this.queues.get(queueName) || this.createQueue(queueName);

    try {
      const bulkJobs = await queue.addBulk(jobs);
      logger.info(`Added ${bulkJobs.length} jobs to queue ${queueName}`);
      return bulkJobs;
    } catch (error) {
      logger.error(`Failed to add bulk jobs to queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Get job by ID
   */
  async getJob(queueName: string, jobId: string): Promise<Job<JobData> | undefined> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return undefined;
    }

    return queue.getJob(jobId);
  }

  /**
   * Get queue stats
   */
  async getQueueStats(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return null;
    }

    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
      };
    } catch (error) {
      logger.error(`Failed to get stats for queue ${queueName}:`, error);
      return null;
    }
  }

  /**
   * Get all queue stats
   */
  async getAllStats() {
    const stats: Record<string, any> = {};

    for (const [name, queue] of this.queues) {
      stats[name] = await this.getQueueStats(name);
    }

    return stats;
  }

  /**
   * Pause queue
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.pause();
      logger.info(`Queue paused: ${queueName}`);
    }
  }

  /**
   * Resume queue
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.resume();
      logger.info(`Queue resumed: ${queueName}`);
    }
  }

  /**
   * Clean old jobs
   */
  async cleanQueue(
    queueName: string,
    grace: number = 3600000, // 1 hour
    status: 'completed' | 'failed' = 'completed'
  ): Promise<string[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return [];
    }

    try {
      const jobs = await queue.clean(grace, 1000, status);
      logger.info(`Cleaned ${jobs.length} ${status} jobs from queue ${queueName}`);
      return jobs;
    } catch (error) {
      logger.error(`Failed to clean queue ${queueName}:`, error);
      return [];
    }
  }

  /**
   * Retry failed jobs
   */
  async retryFailed(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return;
    }

    try {
      const failedJobs = await queue.getFailed();
      
      for (const job of failedJobs) {
        await job.retry();
      }

      logger.info(`Retried ${failedJobs.length} failed jobs in queue ${queueName}`);
    } catch (error) {
      logger.error(`Failed to retry jobs in queue ${queueName}:`, error);
    }
  }

  /**
   * Get failed jobs
   */
  async getFailedJobs(queueName: string, start = 0, end = 10): Promise<Job<JobData>[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return [];
    }

    return queue.getFailed(start, end);
  }

  /**
   * Obliterate queue (remove all jobs and data)
   */
  async obliterateQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return;
    }

    try {
      await queue.obliterate({ force: true });
      logger.warn(`Queue obliterated: ${queueName}`);
    } catch (error) {
      logger.error(`Failed to obliterate queue ${queueName}:`, error);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    logger.info('Shutting down queue manager...');

    // Close all workers first
    const workerPromises = Array.from(this.workers.values()).map(async (worker) => {
      try {
        await worker.close();
      } catch (error) {
        logger.error('Error closing worker:', error);
      }
    });

    await Promise.all(workerPromises);
    this.workers.clear();

    // Close queue events
    const eventPromises = Array.from(this.queueEvents.values()).map(async (events) => {
      try {
        await events.close();
      } catch (error) {
        logger.error('Error closing queue events:', error);
      }
    });

    await Promise.all(eventPromises);
    this.queueEvents.clear();

    // Close all queues
    const queuePromises = Array.from(this.queues.values()).map(async (queue) => {
      try {
        await queue.close();
      } catch (error) {
        logger.error('Error closing queue:', error);
      }
    });

    await Promise.all(queuePromises);
    this.queues.clear();

    logger.info('Queue manager shut down');
  }

  /**
   * Get active queues
   */
  getActiveQueues(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Get active workers
   */
  getActiveWorkers(): string[] {
    return Array.from(this.workers.keys());
  }
}

// Singleton instance
export const queueManager = new QueueManager();
