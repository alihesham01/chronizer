import cron from 'node-cron';
import { query, brandQuery, withBrandTransaction } from '../config/database.js';
import { scrapeTransactions, scrapeInventory } from './store-scraper.js';
import { logger } from '../lib/logger.js';
import { decrypt } from '../lib/crypto.js';

/**
 * Runs daily at 1:00 AM — scrapes yesterday's transactions + current inventory
 * for every store chain that has saved portal credentials.
 */
export function startScrapeScheduler() {
  // "0 1 * * *" = every day at 01:00
  cron.schedule('0 1 * * *', async () => {
    logger.info('[Scheduler] Starting daily scrape job...');

    try {
      // Get all store portal credentials (across all brands)
      const credRes = await query(`
        SELECT spc.brand_id, spc.group_name, spc.portal_email, spc.portal_password
        FROM store_portal_creds spc
        WHERE spc.first_scrape_done = true
      `);

      if (credRes.rows.length === 0) {
        logger.info('[Scheduler] No stores to scrape');
        return;
      }

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateFrom = yesterday.toISOString().split('T')[0];

      for (const row of credRes.rows) {
        const { brand_id, group_name, portal_email, portal_password: encrypted_pw } = row;
        const portal_password = decrypt(encrypted_pw);

        // Create scrape_jobs tracking row
        const jobRes = await query(`
          INSERT INTO scrape_jobs (brand_id, group_name, job_type, status, triggered_by)
          VALUES ($1, $2, 'daily', 'running', 'scheduler') RETURNING id
        `, [brand_id, group_name]);
        const jobId = jobRes.rows[0].id;

        try {
          logger.info(`[Scheduler] Scraping ${group_name} for brand ${brand_id}...`);

          // Find 'General' branch for this group (placeholder for unassigned transactions)
          const storeRes = await brandQuery(brand_id, `
            SELECT id FROM stores WHERE brand_id = $1 AND group_name = $2 AND name ILIKE 'General' AND is_active = true
          `, [brand_id, group_name]);

          if (storeRes.rows.length === 0) {
            logger.warn(`[Scheduler] General branch not found for ${group_name}, skipping`);
            await query(`UPDATE scrape_jobs SET status = 'failed', error_message = 'General branch not found', completed_at = NOW() WHERE id = $1`, [jobId]);
            continue;
          }
          const storeId = storeRes.rows[0].id;

          // Scrape yesterday's transactions
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

              const trxType = trx.quantity < 0 ? 'adjustment' : 'sale';
              const externalId = trx.external_order_id || `${group_name}-${trx.date}-${productSku}-${trx.quantity}`;

              const txRes = await client.query(`
                INSERT INTO transactions (brand_id, store_id, transaction_type, total_amount, transaction_date, reference_number, external_id)
                VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7)
                ON CONFLICT (brand_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
                RETURNING id
                `, [brand_id, storeId, trxType, trx.total, trx.date, trx.sku || null, externalId]);

              if (txRes.rows.length > 0) {
                await client.query(`
                  INSERT INTO transaction_items (transaction_id, product_id, quantity, unit_price, total_price)
                  VALUES ($1, $2, $3, $4, $5)
                `, [txRes.rows[0].id, productId, Math.abs(trx.quantity), trx.unit_price, Math.abs(trx.total)]);
                inserted++;
              }
            }
          });

          // Scrape current inventory
          const inventory = await scrapeInventory(group_name, { email: portal_email, password: portal_password });
          let invCount = 0;

          await withBrandTransaction(brand_id, async (client) => {
            for (const item of inventory) {
              if (item.quantity === 0) continue;
              const productSku = item.sku || item.product_name;
              let productRes = await client.query(`SELECT id FROM products WHERE brand_id = $1 AND sku = $2`, [brand_id, productSku]);
              if (productRes.rows.length === 0) {
                productRes = await client.query(
                  `INSERT INTO products (brand_id, sku, name, selling_price) VALUES ($1, $2, $3, $4)
                   ON CONFLICT (brand_id, sku) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
                  [brand_id, productSku, item.product_name, item.price || null]
                );
              }
              const productId = productRes.rows[0].id;

              await client.query(`
                INSERT INTO stock_movements (brand_id, product_id, store_id, movement_type, quantity, reference_type, notes, movement_date)
                VALUES ($1, $2, $3, 'in', $4, 'scrape', $5, NOW())
              `, [brand_id, productId, storeId, Math.abs(item.quantity), `Daily snapshot ${dateFrom}`]);
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
          `, [jobId, inserted, invCount]);

          logger.info(`[Scheduler] ${group_name}: ${inserted} trx, ${invCount} inventory items`);
        } catch (err: any) {
          await query(`
            UPDATE scrape_jobs SET status = 'failed', error_message = $2, completed_at = NOW()
            WHERE id = $1
          `, [jobId, err.message]);
          logger.error(`[Scheduler] Failed to scrape ${group_name} for brand ${brand_id}:`, err.message);
        }
      }

      logger.info('[Scheduler] Daily scrape job complete');
    } catch (err: any) {
      logger.error('[Scheduler] Fatal error in daily scrape job:', err.message);
    }
  });

  logger.info('[Scheduler] Daily scrape cron scheduled at 1:00 AM');
}
