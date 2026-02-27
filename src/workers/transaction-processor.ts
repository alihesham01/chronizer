import { Job } from 'bullmq';
import { db, transactions } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { cache } from '../services/cache.js';
import { pubsub } from '../services/pubsub.js';
import type { JobData, JobResult } from '../services/queue-manager.js';
import type { NewTransaction } from '../db/schema.js';

/**
 * Process single transaction creation
 */
export async function processCreateTransaction(job: Job<JobData>): Promise<JobResult> {
  const { payload } = job.data;
  
  try {
    logger.info(`Processing transaction creation: ${job.id}`);
    
    // Validate payload
    if (!payload.sku || !payload.storeName || !payload.quantity || !payload.sellingPrice) {
      return {
        success: false,
        error: 'Missing required fields'
      };
    }

    // Create transaction
    const [newTransaction] = await db
      .insert(transactions)
      .values({
        ...payload,
        date: new Date(payload.date)
      })
      .returning();

    // Invalidate cache
    await cache.delPattern('transactions:list:*');

    // Publish event
    await pubsub.publish('transactions:created', {
      transaction: newTransaction,
      timestamp: Date.now(),
      jobId: job.id
    });

    logger.info(`Transaction created: ${newTransaction.id}`);

    return {
      success: true,
      data: newTransaction
    };
  } catch (error) {
    logger.error(`Failed to create transaction:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Process bulk transaction creation
 */
export async function processBulkTransactions(job: Job<JobData>): Promise<JobResult> {
  const { payload } = job.data;
  const { transactions: transactionList, batchId } = payload;

  if (!Array.isArray(transactionList) || transactionList.length === 0) {
    return {
      success: false,
      error: 'Invalid transaction list'
    };
  }

  try {
    logger.info(`Processing bulk transactions: ${transactionList.length} items`);

    const BATCH_SIZE = 500;
    const results = [];
    let processed = 0;

    for (let i = 0; i < transactionList.length; i += BATCH_SIZE) {
      const batch = transactionList.slice(i, i + BATCH_SIZE);

      // Process batch
      const processedBatch = batch.map((tx: NewTransaction) => ({
        ...tx,
        date: new Date(tx.date as any)
      }));

      const batchResults = await db
        .insert(transactions)
        .values(processedBatch)
        .returning();

      results.push(...batchResults);
      processed += batchResults.length;

      // Update progress
      const progress = Math.min((processed / transactionList.length) * 100, 100);
      await job.updateProgress(progress);

      // Publish progress event
      await pubsub.publish('transactions:bulk', {
        batchId,
        jobId: job.id,
        progress,
        processed,
        total: transactionList.length,
        status: 'processing'
      });

      logger.info(`Bulk progress: ${processed}/${transactionList.length}`);
    }

    // Invalidate cache
    await cache.delPattern('transactions:list:*');

    // Publish completion
    await pubsub.publish('transactions:bulk', {
      batchId,
      jobId: job.id,
      progress: 100,
      processed: results.length,
      total: transactionList.length,
      status: 'completed'
    });

    logger.info(`Bulk transaction creation completed: ${results.length} items`);

    return {
      success: true,
      data: {
        count: results.length,
        batchId
      }
    };
  } catch (error) {
    logger.error(`Bulk transaction processing failed:`, error);

    // Publish failure event
    await pubsub.publish('transactions:bulk', {
      batchId,
      jobId: job.id,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Process transaction update
 */
export async function processUpdateTransaction(job: Job<JobData>): Promise<JobResult> {
  const { payload } = job.data;
  const { id, updates } = payload;

  try {
    logger.info(`Processing transaction update: ${id}`);

    const [updatedTransaction] = await db
      .update(transactions)
      .set({
        ...updates,
        ...(updates.date && { date: new Date(updates.date) })
      })
      .where(eq(transactions.id, id))
      .returning();

    if (!updatedTransaction) {
      return {
        success: false,
        error: 'Transaction not found'
      };
    }

    // Invalidate cache
    await cache.delPattern('transactions:list:*');
    await cache.del(`transaction:${id}`);

    // Publish event
    await pubsub.publish('transactions:updated', {
      transaction: updatedTransaction,
      timestamp: Date.now(),
      jobId: job.id
    });

    logger.info(`Transaction updated: ${id}`);

    return {
      success: true,
      data: updatedTransaction
    };
  } catch (error) {
    logger.error(`Failed to update transaction:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Process transaction deletion
 */
export async function processDeleteTransaction(job: Job<JobData>): Promise<JobResult> {
  const { payload } = job.data;
  const { id } = payload;

  try {
    logger.info(`Processing transaction deletion: ${id}`);

    const [deletedTransaction] = await db
      .delete(transactions)
      .where(eq(transactions.id, id))
      .returning();

    if (!deletedTransaction) {
      return {
        success: false,
        error: 'Transaction not found'
      };
    }

    // Invalidate cache
    await cache.delPattern('transactions:list:*');
    await cache.del(`transaction:${id}`);

    // Publish event
    await pubsub.publish('transactions:deleted', {
      transactionId: id,
      timestamp: Date.now(),
      jobId: job.id
    });

    logger.info(`Transaction deleted: ${id}`);

    return {
      success: true,
      data: { id }
    };
  } catch (error) {
    logger.error(`Failed to delete transaction:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Process analytics aggregation
 */
export async function processAnalytics(job: Job<JobData>): Promise<JobResult> {
  const { payload } = job.data;
  const { type, dateRange } = payload;

  try {
    logger.info(`Processing analytics: ${type}`);

    // This is a placeholder for analytics processing
    // In production, this would query the database and generate aggregations
    
    await job.updateProgress(50);

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));

    await job.updateProgress(100);

    return {
      success: true,
      data: {
        type,
        dateRange,
        processed: true
      }
    };
  } catch (error) {
    logger.error(`Analytics processing failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Main transaction processor - routes to specific handlers
 */
export async function transactionProcessor(job: Job<JobData>): Promise<JobResult> {
  const { type } = job.data;

  logger.info(`Processing job type: ${type}`, {
    jobId: job.id,
    attempts: job.attemptsMade
  });

  switch (type) {
    case 'create-transaction':
      return processCreateTransaction(job);
    
    case 'bulk-transactions':
      return processBulkTransactions(job);
    
    case 'update-transaction':
      return processUpdateTransaction(job);
    
    case 'delete-transaction':
      return processDeleteTransaction(job);
    
    case 'analytics':
      return processAnalytics(job);
    
    default:
      logger.warn(`Unknown job type: ${type}`);
      return {
        success: false,
        error: `Unknown job type: ${type}`
      };
  }
}

// Export processors for queue manager
export const transactionProcessors = {
  'create-transaction': processCreateTransaction,
  'bulk-transactions': processBulkTransactions,
  'update-transaction': processUpdateTransaction,
  'delete-transaction': processDeleteTransaction,
  'analytics': processAnalytics,
};

// Import eq for database queries
import { eq } from 'drizzle-orm';
