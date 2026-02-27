import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { withTransaction } from '../config/database.js';

function getBrandId(c: Context): string {
  const brandId = c.get('brandId');
  if (!brandId) throw new HTTPException(401, { message: 'Brand context required' });
  return brandId;
}

export class BulkController {
  static async bulkCreateTransactions(c: Context) {
    const brandId = getBrandId(c);
    const { transactions, batchSize = 1000 } = await c.req.json();

    if (!Array.isArray(transactions) || transactions.length === 0) {
      throw new HTTPException(400, { message: 'transactions array required' });
    }
    if (transactions.length > 100000) {
      throw new HTTPException(400, { message: 'Max 100,000 per request' });
    }

    return await withTransaction(async (client) => {
      let processedCount = 0;
      const errors: any[] = [];

      // Process in chunks
      for (let i = 0; i < transactions.length; i += batchSize) {
        const chunk = transactions.slice(i, i + batchSize);
        for (let j = 0; j < chunk.length; j++) {
          const t = chunk[j];
          const row = i + j + 1;
          if (!t.sku) { errors.push({ row, error: 'SKU required' }); continue; }
          try {
            await client.query(
              `INSERT INTO transactions (brand_id, store_id, sku, item_name, big_sku, colour, size,
                quantity_sold, selling_price, transaction_date, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
              [brandId, t.store_id, t.sku, t.item_name, t.big_sku, t.colour, t.size,
               t.quantity_sold || t.quantity || 1, t.selling_price || t.unit_price || 0,
               t.transaction_date || new Date().toISOString().split('T')[0], t.notes]
            );
            processedCount++;
          } catch (err: any) {
            errors.push({ row, sku: t.sku, error: err.message });
          }
        }
      }

      return c.json({
        success: true,
        processed: processedCount,
        total: transactions.length,
        failed: errors.length,
        errors: errors.length > 0 ? errors.slice(0, 100) : undefined
      });
    });
  }
}
