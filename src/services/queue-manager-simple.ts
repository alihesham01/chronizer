import { logger } from '../lib/logger.js';

interface QueueJob {
  id: string;
  type: string;
  data: any;
  attempts?: number;
  delay?: number;
}

class SimpleQueueManager {
  private queues: Map<string, QueueJob[]> = new Map();
  private processing: Map<string, boolean> = new Map();

  async add(queueName: string, job: QueueJob): Promise<void> {
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
    }
    
    const queue = this.queues.get(queueName)!;
    job.id = job.id || this.generateId();
    job.attempts = 0;
    
    queue.push(job);
    logger.info(`Added job ${job.id} to queue ${queueName}`);
    
    // Process queue immediately
    this.processQueue(queueName);
  }

  async process(queueName: string, processor: (job: QueueJob) => Promise<void>): Promise<void> {
    if (this.processing.get(queueName)) {
      return;
    }

    this.processing.set(queueName, true);
    const queue = this.queues.get(queueName) || [];

    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) continue;

      try {
        logger.info(`Processing job ${job.id} from queue ${queueName}`);
        await processor(job);
        logger.info(`Completed job ${job.id}`);
      } catch (error) {
        logger.error(`Failed job ${job.id}:`, error);
        
        // Retry logic
        if (job.attempts && job.attempts < 3) {
          job.attempts++;
          queue.push(job);
          logger.info(`Retrying job ${job.id}, attempt ${job.attempts}`);
        }
      }
    }

    this.processing.set(queueName, false);
  }

  private async processQueue(queueName: string): Promise<void> {
    // This would be implemented with actual job processors
    // For now, just log that we have jobs
    const queue = this.queues.get(queueName);
    if (queue && queue.length > 0) {
      logger.info(`Queue ${queueName} has ${queue.length} jobs pending`);
    }
  }

  getQueueStatus(queueName: string): { pending: number; processing: boolean } {
    const queue = this.queues.get(queueName) || [];
    return {
      pending: queue.length,
      processing: this.processing.get(queueName) || false
    };
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  async close(): Promise<void> {
    // Close all connections if any
    logger.info('Queue manager closed');
  }
}

export const queueManager = new SimpleQueueManager();
