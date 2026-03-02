import { config } from 'dotenv';
config();

import { loadEnv, getEnv } from './config/env.js';
loadEnv();
const env = getEnv();

import { Queue, Worker, Job } from 'bullmq';
import cron from 'node-cron';
import { query, brandQuery, withBrandTransaction, db } from './config/database.js';
import { scrapeTransactions, scrapeInventory } from './scrapers/store-scraper.js';
import { logger } from './lib/logger.js';
import { decrypt } from './lib/crypto.js';
import { getRedis, closeRedis } from './config/redis.js';
import { analyticsService } from './services/analytics-service.js';

// ═══════════════════════════════════════════════════════════════════
// BullMQ Queue + Worker — Scraper Jobs
// ═══════════════════════════════════════════════════════════════════

const QUEUE_NAME = 'scraper-jobs';
const connection = getRedis();

export const scraperQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60_000, // 1 min → 2 min → 4 min
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

// ── Process a single scrape job ──────────────────────────────────
async function processScrapeJob(job: Job) {
  const { brand_id, group_name, portal_email, portal_password: encrypted_pw, job_type } = job.data;
  const portal_password = decrypt(encrypted_pw);

  logger.info(`[Worker] Processing ${group_name} for brand ${brand_id} (attempt ${job.attemptsMade + 1}/${job.opts.attempts})`);

  // Create scrape_jobs tracking row
  const jobRes = await query(`
    INSERT INTO scrape_jobs (brand_id, group_name, job_type, status, triggered_by)
    VALUES ($1, $2, $3, 'running', 'worker') RETURNING id
  `, [brand_id, group_name, job_type || 'daily']);
  const scrapeJobId = jobRes.rows[0].id;

  try {
    // Check brand is still active
    const brandCheck = await query(`SELECT is_active FROM brands WHERE id = $1`, [brand_id]);
    if (brandCheck.rows.length === 0 || !brandCheck.rows[0].is_active) {
      logger.warn(`[Worker] Brand ${brand_id} is inactive, skipping`);
      await query(`UPDATE scrape_jobs SET status = 'failed', error_message = 'Brand inactive', completed_at = NOW() WHERE id = $1`, [scrapeJobId]);
      return { skipped: true, reason: 'brand_inactive' };
    }

    // Find 'General' branch for this group
    const storeRes = await brandQuery(brand_id, `
      SELECT id FROM stores WHERE brand_id = $1 AND group_name = $2 AND name ILIKE 'General' AND is_active = true
    `, [brand_id, group_name]);

    if (storeRes.rows.length === 0) {
      await query(`UPDATE scrape_jobs SET status = 'failed', error_message = 'General branch not found', completed_at = NOW() WHERE id = $1`, [scrapeJobId]);
      throw new Error(`General branch not found for ${group_name}`);
    }
    const storeId = storeRes.rows[0].id;

    // Calculate date range
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateFrom = yesterday.toISOString().split('T')[0];

    // ── Scrape transactions ──
    const transactions = await scrapeTransactions(group_name, { email: portal_email, password: portal_password }, dateFrom, dateFrom);
    let inserted = 0;

    await withBrandTransaction(brand_id, async (client) => {
      for (const trx of transactions) {
        if (trx.quantity === 0) continue;

        // Find or create product
        const productSku = trx.sku || trx.product_name;
        let productRes = await client.query(`SELECT id FROM products WHERE brand_id = $1 AND sku = $2`, [brand_id, productSku]);
        if (productRes.rows.length === 0) {
          productRes = await client.query(
            `INSERT INTO products (brand_id, sku, name, selling_price) VALUES ($1, $2, $3, $4)
             ON CONFLICT (brand_id, sku) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
            [brand_id, productSku, trx.product_name, trx.unit_price || null]
          );
        }
        const productId = productRes.rows[0].id;

        const status = trx.quantity < 0 ? 'adjustment' : 'sale';
        const externalId = trx.external_order_id || `${group_name}-${trx.date}-${productSku}-${trx.quantity}-${inserted}`;

        const txRes = await client.query(`
          INSERT INTO transactions (brand_id, store_id, status, transaction_date, sku, item_name, quantity_sold, selling_price)
          VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7, $8)
          ON CONFLICT DO NOTHING
          RETURNING id
        `, [brand_id, storeId, status, trx.date, productSku, trx.product_name, Math.abs(trx.quantity), trx.unit_price]);

        if (txRes.rows.length > 0) inserted++;
      }
    });

    // ── Scrape inventory (update product records, no stock_movements) ──
    const inventory = await scrapeInventory(group_name, { email: portal_email, password: portal_password });
    let invCount = 0;

    await withBrandTransaction(brand_id, async (client) => {
      for (const item of inventory) {
        const productSku = item.sku || item.product_name;

        // Upsert product with latest inventory data
        await client.query(`
          INSERT INTO products (brand_id, sku, name, selling_price)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (brand_id, sku) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, products.name),
            selling_price = COALESCE(EXCLUDED.selling_price, products.selling_price),
            updated_at = NOW()
        `, [brand_id, productSku, item.product_name, item.price || null]);

        invCount++;
      }
    });

    // Update last_scraped_at
    await brandQuery(brand_id, `
      UPDATE store_portal_creds SET last_scraped_at = NOW() WHERE brand_id = $1 AND group_name = $2
    `, [brand_id, group_name]);

    // Update scrape_jobs with results
    await query(`
      UPDATE scrape_jobs SET status = 'success', transactions_inserted = $2, inventory_items = $3, completed_at = NOW()
      WHERE id = $1
    `, [scrapeJobId, inserted, invCount]);

    logger.info(`[Worker] ${group_name} (brand ${brand_id}): ${inserted} trx, ${invCount} inventory`);
    return { inserted, invCount };

  } catch (err: any) {
    await query(`
      UPDATE scrape_jobs SET status = 'failed', error_message = $2, completed_at = NOW()
      WHERE id = $1
    `, [scrapeJobId, err.message]);
    logger.error(`[Worker] Failed ${group_name} for brand ${brand_id}:`, err.message);
    throw err; // Re-throw so BullMQ triggers retry
  }
}

// ── Start the BullMQ Worker ─────────────────────────────────────
const concurrency = env.SCRAPER_CONCURRENCY || 5;

const worker = new Worker(QUEUE_NAME, processScrapeJob, {
  connection,
  concurrency,
  limiter: {
    max: concurrency,
    duration: 1000, // max N jobs per second
  },
});

worker.on('completed', (job) => {
  logger.info(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  if (job) {
    const remaining = (job.opts.attempts || 3) - job.attemptsMade;
    if (remaining > 0) {
      logger.warn(`[Worker] Job ${job.id} failed, ${remaining} retries left: ${err.message}`);
    } else {
      logger.error(`[Worker] Job ${job.id} permanently failed: ${err.message}`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
// Cron Schedulers
// ═══════════════════════════════════════════════════════════════════

// Daily at 1:00 AM — enqueue scrape jobs for all active credentials
cron.schedule('0 1 * * *', async () => {
  logger.info('[Scheduler] Enqueueing daily scrape jobs...');

  try {
    const credRes = await query(`
      SELECT spc.brand_id, spc.group_name, spc.portal_email, spc.portal_password
      FROM store_portal_creds spc
      JOIN brands b ON b.id = spc.brand_id AND b.is_active = true
      WHERE spc.first_scrape_done = true
    `);

    if (credRes.rows.length === 0) {
      logger.info('[Scheduler] No stores to scrape');
      return;
    }

    for (const row of credRes.rows) {
      await scraperQueue.add('daily-scrape', {
        ...row,
        job_type: 'daily',
      }, {
        jobId: `daily-${row.brand_id}-${row.group_name}-${new Date().toISOString().split('T')[0]}`,
      });
    }

    logger.info(`[Scheduler] Enqueued ${credRes.rows.length} scrape jobs`);
  } catch (err: any) {
    logger.error('[Scheduler] Failed to enqueue jobs:', err.message);
  }
});

// Every hour — refresh materialized views
cron.schedule('0 * * * *', async () => {
  logger.info('[Scheduler] Refreshing materialized views...');
  try {
    await analyticsService.refreshViews();
    // Also refresh inventory materialized view
    await db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY inventory_summary');
    logger.info('[Scheduler] Materialized views refreshed');
  } catch (err: any) {
    logger.error('[Scheduler] View refresh error:', err.message);
  }
});

// On startup — clean up stuck jobs from previous runs
async function cleanupStuckJobs() {
  try {
    const result = await query(`
      UPDATE scrape_jobs
      SET status = 'failed', error_message = 'Stale job: worker restarted', completed_at = NOW()
      WHERE status = 'running' AND started_at < NOW() - INTERVAL '1 hour'
    `);
    if (result.rowCount && result.rowCount > 0) {
      logger.info(`[Worker] Cleaned up ${result.rowCount} stuck scrape jobs`);
    }
  } catch (err: any) {
    logger.error('[Worker] Stuck job cleanup error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Start
// ═══════════════════════════════════════════════════════════════════

logger.info(`[Worker] Starting scraper worker (concurrency: ${concurrency})...`);
cleanupStuckJobs();

logger.info('[Worker] Daily scrape cron scheduled at 1:00 AM');
logger.info('[Worker] Materialized view refresh scheduled hourly');

// Graceful shutdown
const shutdown = async () => {
  logger.info('[Worker] Shutting down...');
  await worker.close();
  await scraperQueue.close();
  await closeRedis();
  await db.end();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
