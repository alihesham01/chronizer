import { queueManager } from '../services/queue-manager-simple.js';
import { transactionProcessors } from './transaction-processor.js';
import { logger } from '../lib/logger.js';

/**
 * Initialize all workers
 */
export async function initializeWorkers() {
  try {
    logger.info('Initializing workers...');

    // Register transaction queue worker
    queueManager.registerProcessor('transactions', transactionProcessor);
    logger.info('Transaction worker registered');

    // Register analytics queue worker (future)
    // queueManager.registerProcessor('analytics', analyticsProcessor);

    logger.info('All workers initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize workers:', error);
    throw error;
  }
}

/**
 * Shutdown all workers
 */
export async function shutdownWorkers() {
  try {
    logger.info('Shutting down workers...');
    await queueManager.shutdown();
    logger.info('Workers shut down successfully');
  } catch (error) {
    logger.error('Error shutting down workers:', error);
  }
}

/**
 * Get worker stats
 */
export async function getWorkerStats() {
  return {
    activeQueues: queueManager.getActiveQueues(),
    activeWorkers: queueManager.getActiveWorkers(),
    queueStats: await queueManager.getAllStats()
  };
}
