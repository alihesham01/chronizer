import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { withTransaction } from '../config/database.js';

const app = new Hono();

function getBrandId(c: any): string {
  const brandId = c.get('brandId');
  if (!brandId) throw new HTTPException(401, { message: 'Brand context required' });
  return brandId;
}

// Bulk create transactions (synchronous, replaces old queue-based approach)
app.post('/bulk', async (c) => {
  const brandId = getBrandId(c);
  const { transactions } = await c.req.json();

  if (!Array.isArray(transactions) || transactions.length === 0) {
    throw new HTTPException(400, { message: 'transactions array required' });
  }
  if (transactions.length > 10000) {
    throw new HTTPException(400, { message: 'Max 10,000 per batch' });
  }

  return await withTransaction(async (client) => {
    let created = 0;
    const errors: any[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];
      if (!t.sku) { errors.push({ row: i + 1, error: 'SKU required' }); continue; }
      try {
        await client.query(
          `INSERT INTO transactions (brand_id, store_id, sku, item_name, big_sku, colour, size,
            quantity_sold, selling_price, transaction_date, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [brandId, t.store_id, t.sku, t.item_name, t.big_sku, t.colour, t.size,
           t.quantity_sold || 1, t.selling_price || 0,
           t.transaction_date || new Date().toISOString().split('T')[0], t.notes]
        );
        created++;
      } catch (err: any) {
        errors.push({ row: i + 1, sku: t.sku, error: err.message });
      }
    }

    return c.json({
      success: true,
      created,
      total: transactions.length,
      failed: errors.length,
      errors: errors.length > 0 ? errors.slice(0, 100) : undefined
    });
  });
});

export { app as transactionsAsyncRoutes };
