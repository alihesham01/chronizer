import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { query, brandQuery, withBrandTransaction } from '../config/database.js';
import { getBrandId } from '../lib/brand-context.js';
import { auditLog } from '../lib/audit.js';
import { scrapeTransactions, scrapeInventory, hasScraper } from '../scrapers/index.js';
import { logger } from '../lib/logger.js';
import { encrypt, decrypt } from '../lib/crypto.js';

const scrapers = new Hono();

// ─── Save portal credentials (called when user adds a store) ───
scrapers.post('/credentials', async (c) => {
  const brandId = getBrandId(c);
  const { group_name, portal_email, portal_password } = await c.req.json();

  if (!group_name || !portal_email || !portal_password) {
    throw new HTTPException(400, { message: 'group_name, portal_email, and portal_password are required' });
  }

  if (!hasScraper(group_name)) {
    throw new HTTPException(400, { message: `No scraper available for "${group_name}"` });
  }

  const encryptedPassword = encrypt(portal_password);

  await brandQuery(brandId, `
    INSERT INTO store_portal_creds (brand_id, group_name, portal_email, portal_password)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (brand_id, group_name) DO UPDATE SET
      portal_email = EXCLUDED.portal_email,
      portal_password = EXCLUDED.portal_password,
      updated_at = NOW()
  `, [brandId, group_name, portal_email, encryptedPassword]);

  return c.json({ success: true, message: 'Portal credentials saved' });
});

// ─── Get portal credential status (no passwords returned) ───
scrapers.get('/credentials', async (c) => {
  const brandId = getBrandId(c);
  const result = await brandQuery(brandId, `
    SELECT group_name, portal_email, first_scrape_done, last_scraped_at, created_at
    FROM store_portal_creds WHERE brand_id = $1 ORDER BY group_name
  `, [brandId]);
  return c.json({ success: true, data: result.rows });
});

// ─── Helper: find or create a product by SKU ───
async function findOrCreateProduct(client: any, brandId: string, sku: string, name: string, price?: number): Promise<string> {
  const productSku = sku || name; // fallback to name if no SKU
  const existing = await client.query(
    `SELECT id FROM products WHERE brand_id = $1 AND sku = $2`,
    [brandId, productSku]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const inserted = await client.query(
    `INSERT INTO products (brand_id, sku, name, selling_price)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (brand_id, sku) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [brandId, productSku, name, price || null]
  );
  return inserted.rows[0].id;
}

// ─── Initial scrape: fetch ALL transactions → default branch ───
scrapers.post('/scrape/initial/:groupName', async (c) => {
  const brandId = getBrandId(c);
  const groupName = c.req.param('groupName');

  // Get credentials
  const credRes = await brandQuery(brandId, `
    SELECT portal_email, portal_password, first_scrape_done
    FROM store_portal_creds WHERE brand_id = $1 AND group_name = $2
  `, [brandId, groupName]);

  if (credRes.rows.length === 0) {
    throw new HTTPException(404, { message: 'No portal credentials for this store' });
  }

  const { portal_email, portal_password: encrypted_password } = credRes.rows[0];
  const portal_password = decrypt(encrypted_password);

  // Find the 'General' branch for this group (special placeholder for unassigned transactions)
  const storeRes = await brandQuery(brandId, `
    SELECT id FROM stores WHERE brand_id = $1 AND group_name = $2 AND name ILIKE 'General' AND is_active = true
  `, [brandId, groupName]);

  if (storeRes.rows.length === 0) {
    throw new HTTPException(404, { message: 'General branch not found for this store group. Please create a branch named "General".' });
  }
  const generalStoreId = storeRes.rows[0].id;

  // Create scrape job tracking row
  const jobRes = await query(`
    INSERT INTO scrape_jobs (brand_id, group_name, job_type, status, triggered_by)
    VALUES ($1, $2, 'initial', 'running', 'user') RETURNING id
  `, [brandId, groupName]);
  const jobId = jobRes.rows[0].id;

  try {
    // Fetch ALL transactions (no date filter for initial scrape)
    logger.info(`[Scraper] Initial scrape for ${groupName} (brand ${brandId})`);
    const transactions = await scrapeTransactions(groupName, { email: portal_email, password: portal_password });
    logger.info(`[Scraper] Fetched ${transactions.length} transactions from ${groupName}`);

    // Insert transactions into DB, all assigned to default branch
    let inserted = 0;
    if (transactions.length > 0) {
      await withBrandTransaction(brandId, async (client) => {
        for (const trx of transactions) {
          if (trx.quantity === 0) continue;

          // Find or create the product
          const productId = await findOrCreateProduct(client, brandId, trx.sku, trx.product_name, trx.unit_price);

          // Create a transaction row (one per line-item for simplicity)
          const trxType = trx.quantity < 0 ? 'adjustment' : 'sale';
          const txRes = await client.query(`
            INSERT INTO transactions (brand_id, store_id, transaction_type, total_amount, transaction_date, reference_number, external_id)
            VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7)
            ON CONFLICT (brand_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
            RETURNING id
          `, [
            brandId,
            generalStoreId,
            trxType,
            trx.total,
            trx.date,
            trx.sku || null,
            trx.external_order_id || `${groupName}-${trx.date}-${trx.sku || trx.product_name}-${trx.quantity}`,
          ]);

          if (txRes.rows.length > 0) {
            // Create transaction_item linking to the product
            await client.query(`
              INSERT INTO transaction_items (transaction_id, product_id, quantity, unit_price, total_price)
              VALUES ($1, $2, $3, $4, $5)
            `, [txRes.rows[0].id, productId, Math.abs(trx.quantity), trx.unit_price, Math.abs(trx.total)]);
            inserted++;
          }
        }
      });
    }

    // Fetch inventory snapshot
    const inventory = await scrapeInventory(groupName, { email: portal_email, password: portal_password });
    logger.info(`[Scraper] Fetched ${inventory.length} inventory items from ${groupName}`);

    // Insert stock_movements for current inventory (snapshot as 'in' movements)
    let invCount = 0;
    if (inventory.length > 0) {
      await withBrandTransaction(brandId, async (client) => {
        for (const item of inventory) {
          if (item.quantity === 0) continue;
          const productId = await findOrCreateProduct(client, brandId, item.sku, item.product_name, item.price);
          await client.query(`
            INSERT INTO stock_movements (brand_id, product_id, store_id, movement_type, quantity, reference_type, notes, movement_date)
            VALUES ($1, $2, $3, 'in', $4, 'scrape', $5, NOW())
          `, [brandId, productId, generalStoreId, Math.abs(item.quantity), `Initial snapshot from ${groupName}`]);
          invCount++;
        }
      });
    }

    // Mark first scrape as done
    await brandQuery(brandId, `
      UPDATE store_portal_creds
      SET first_scrape_done = true, last_scraped_at = NOW()
      WHERE brand_id = $1 AND group_name = $2
    `, [brandId, groupName]);

    await auditLog(brandId, c.get('ownerId'), 'initial_scrape', {
      store: groupName, transactions: inserted, inventory: invCount,
    });

    // Update scrape job with results
    await query(`
      UPDATE scrape_jobs SET status = 'success', transactions_inserted = $2, inventory_items = $3, completed_at = NOW()
      WHERE id = $1
    `, [jobId, inserted, invCount]);

    return c.json({
      success: true,
      message: `Initial scrape complete`,
      data: { transactions_inserted: inserted, inventory_items: invCount, job_id: jobId },
    });
  } catch (error: any) {
    await query(`
      UPDATE scrape_jobs SET status = 'failed', error_message = $2, completed_at = NOW()
      WHERE id = $1
    `, [jobId, error.message]);
    logger.error(`[Scraper] Initial scrape failed for ${groupName}:`, error);
    await auditLog(brandId, c.get('ownerId'), 'scrape_failed', { store: groupName, error: error.message });
    throw new HTTPException(500, { message: `Scrape failed: ${error.message}` });
  }
});

// ─── Daily scrape: yesterday's transactions + inventory ───
scrapers.post('/scrape/daily/:groupName', async (c) => {
  const brandId = getBrandId(c);
  const groupName = c.req.param('groupName');

  const credRes = await brandQuery(brandId, `
    SELECT portal_email, portal_password
    FROM store_portal_creds WHERE brand_id = $1 AND group_name = $2
  `, [brandId, groupName]);

  if (credRes.rows.length === 0) {
    throw new HTTPException(404, { message: 'No portal credentials for this store' });
  }

  const { portal_email, portal_password: encrypted_password_daily } = credRes.rows[0];
  const portal_password = decrypt(encrypted_password_daily);

  // Find the 'General' branch for this group
  const storeRes = await brandQuery(brandId, `
    SELECT id FROM stores WHERE brand_id = $1 AND group_name = $2 AND name ILIKE 'General' AND is_active = true
  `, [brandId, groupName]);

  if (storeRes.rows.length === 0) {
    throw new HTTPException(404, { message: 'General branch not found for this store group' });
  }
  const generalStoreId = storeRes.rows[0].id;

  // Yesterday's date range
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateFrom = yesterday.toISOString().split('T')[0];
  const dateTo = dateFrom; // same day

  // Create scrape job tracking row
  const dailyJobRes = await query(`
    INSERT INTO scrape_jobs (brand_id, group_name, job_type, status, triggered_by)
    VALUES ($1, $2, 'manual', 'running', 'user') RETURNING id
  `, [brandId, groupName]);
  const dailyJobId = dailyJobRes.rows[0].id;

  try {
    logger.info(`[Scraper] Daily scrape for ${groupName}: ${dateFrom}`);

    // Transactions
    const transactions = await scrapeTransactions(groupName, { email: portal_email, password: portal_password }, dateFrom, dateTo);
    let inserted = 0;

    if (transactions.length > 0) {
      await withBrandTransaction(brandId, async (client) => {
        for (const trx of transactions) {
          if (trx.quantity === 0) continue;

          const productId = await findOrCreateProduct(client, brandId, trx.sku, trx.product_name, trx.unit_price);
          const trxType = trx.quantity < 0 ? 'adjustment' : 'sale';
          const externalId = trx.external_order_id || `${groupName}-${trx.date}-${trx.sku || trx.product_name}-${trx.quantity}`;

          const txRes = await client.query(`
            INSERT INTO transactions (brand_id, store_id, transaction_type, total_amount, transaction_date, reference_number, external_id)
            VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7)
            ON CONFLICT (brand_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
            RETURNING id
          `, [brandId, generalStoreId, trxType, trx.total, trx.date, trx.sku || null, externalId]);

          if (txRes.rows.length > 0) {
            await client.query(`
              INSERT INTO transaction_items (transaction_id, product_id, quantity, unit_price, total_price)
              VALUES ($1, $2, $3, $4, $5)
            `, [txRes.rows[0].id, productId, Math.abs(trx.quantity), trx.unit_price, Math.abs(trx.total)]);
            inserted++;
          }
        }
      });
    }

    // Inventory snapshot — update stock for each product at this store
    const inventory = await scrapeInventory(groupName, { email: portal_email, password: portal_password });
    let invCount = 0;

    if (inventory.length > 0) {
      await withBrandTransaction(brandId, async (client) => {
        for (const item of inventory) {
          if (item.quantity === 0) continue;
          const productId = await findOrCreateProduct(client, brandId, item.sku, item.product_name, item.price);
          await client.query(`
            INSERT INTO stock_movements (brand_id, product_id, store_id, movement_type, quantity, reference_type, notes, movement_date)
            VALUES ($1, $2, $3, 'in', $4, 'scrape', $5, NOW())
          `, [brandId, productId, generalStoreId, Math.abs(item.quantity), `Daily snapshot ${dateFrom} from ${groupName}`]);
          invCount++;
        }
      });
    }

    await brandQuery(brandId, `
      UPDATE store_portal_creds SET last_scraped_at = NOW() WHERE brand_id = $1 AND group_name = $2
    `, [brandId, groupName]);

    await auditLog(brandId, c.get('ownerId'), 'daily_scrape', {
      store: groupName, date: dateFrom, transactions: inserted, inventory: invCount,
    });

    // Update scrape job with results
    await query(`
      UPDATE scrape_jobs SET status = 'success', transactions_inserted = $2, inventory_items = $3, completed_at = NOW()
      WHERE id = $1
    `, [dailyJobId, inserted, invCount]);

    return c.json({
      success: true,
      data: { date: dateFrom, transactions_inserted: inserted, inventory_items: invCount, job_id: dailyJobId },
    });
  } catch (error: any) {
    await query(`
      UPDATE scrape_jobs SET status = 'failed', error_message = $2, completed_at = NOW()
      WHERE id = $1
    `, [dailyJobId, error.message]);
    logger.error(`[Scraper] Daily scrape failed for ${groupName}:`, error);
    throw new HTTPException(500, { message: `Daily scrape failed: ${error.message}` });
  }
});

// ─── List scrape jobs for this brand ───
scrapers.get('/jobs', async (c) => {
  const brandId = getBrandId(c);
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const result = await brandQuery(brandId, `
    SELECT id, group_name, job_type, status, transactions_inserted, inventory_items,
           error_message, started_at, completed_at, triggered_by
    FROM scrape_jobs WHERE brand_id = $1
    ORDER BY started_at DESC
    LIMIT $2 OFFSET $3
  `, [brandId, limit, offset]);

  const countRes = await brandQuery(brandId, `
    SELECT COUNT(*) AS total FROM scrape_jobs WHERE brand_id = $1
  `, [brandId]);

  return c.json({
    success: true,
    data: result.rows,
    pagination: { total: parseInt(countRes.rows[0].total), limit, offset }
  });
});

export { scrapers as scraperRoutes };
