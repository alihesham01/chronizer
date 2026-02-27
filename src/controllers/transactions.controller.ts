import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { db, withTransaction } from '../config/database.js';

function getBrandId(c: Context): string {
  const brandId = c.get('brandId');
  if (!brandId) throw new HTTPException(401, { message: 'Brand context required' });
  return brandId;
}

export class TransactionsController {
  static async getTransactions(c: Context) {
    const brandId = getBrandId(c);
    const { page = '1', limit = '50', search, status, store_id, start_date, end_date } = c.req.query();
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'WHERE t.brand_id = $1';
    const params: any[] = [brandId];
    let pi = 2;

    if (search)     { whereClause += ` AND (t.sku ILIKE $${pi} OR t.item_name ILIKE $${pi})`; params.push(`%${search}%`); pi++; }
    if (status)     { whereClause += ` AND t.status = $${pi}`; params.push(status); pi++; }
    if (store_id)   { whereClause += ` AND t.store_id = $${pi}`; params.push(store_id); pi++; }
    if (start_date) { whereClause += ` AND t.transaction_date >= $${pi}`; params.push(start_date); pi++; }
    if (end_date)   { whereClause += ` AND t.transaction_date <= $${pi}`; params.push(end_date); pi++; }

    const [countRes, dataRes] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM transactions t ${whereClause}`, params),
      db.query(
        `SELECT t.*, s.name AS store_name
         FROM transactions t LEFT JOIN stores s ON t.store_id = s.id
         ${whereClause}
         ORDER BY t.transaction_date DESC
         LIMIT $${pi} OFFSET $${pi + 1}`,
        [...params, limitNum, offset]
      )
    ]);

    const total = parseInt(countRes.rows[0].count);
    return c.json({
      data: dataRes.rows,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum), hasMore: pageNum < Math.ceil(total / limitNum) }
    });
  }

  static async getTransaction(c: Context) {
    const brandId = getBrandId(c);
    const { id } = c.req.param();

    const result = await db.query(
      `SELECT t.*, s.name AS store_name FROM transactions t LEFT JOIN stores s ON t.store_id = s.id
       WHERE t.id = $1 AND t.brand_id = $2`, [id, brandId]
    );
    if (result.rows.length === 0) throw new HTTPException(404, { message: 'Transaction not found' });
    return c.json({ data: result.rows[0] });
  }

  static async createTransaction(c: Context) {
    const brandId = getBrandId(c);
    const body = await c.req.json();
    const { transaction_date, store_id, sku, quantity_sold, selling_price, status = 'sale', customer_id, payment_method, notes } = body;

    if (!transaction_date || !sku || quantity_sold === undefined || !selling_price) {
      throw new HTTPException(400, { message: 'Required: transaction_date, sku, quantity_sold, selling_price' });
    }

    // Auto-populate product data
    const prod = await db.query('SELECT big_sku, name, colour, size FROM products WHERE brand_id = $1 AND sku = $2', [brandId, sku]);
    if (prod.rows.length === 0) throw new HTTPException(400, { message: `SKU '${sku}' not found` });
    const p = prod.rows[0];

    const result = await db.query(
      `INSERT INTO transactions (brand_id, transaction_date, store_id, sku, big_sku, item_name, colour, size, quantity_sold, selling_price, status, customer_id, payment_method, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [brandId, transaction_date, store_id, sku, p.big_sku, p.name, p.colour, p.size, quantity_sold, selling_price, status, customer_id, payment_method, notes]
    );
    return c.json({ data: result.rows[0] }, 201);
  }

  static async updateTransaction(c: Context) {
    const brandId = getBrandId(c);
    const { id } = c.req.param();
    const body = await c.req.json();

    const existing = await db.query('SELECT id FROM transactions WHERE id = $1 AND brand_id = $2', [id, brandId]);
    if (existing.rows.length === 0) throw new HTTPException(404, { message: 'Transaction not found' });

    // If SKU changed, re-populate product data
    let productCols = '';
    const params: any[] = [];
    let pi = 1;
    const sets: string[] = [];

    if (body.sku) {
      const prod = await db.query('SELECT big_sku, name, colour, size FROM products WHERE brand_id = $1 AND sku = $2', [brandId, body.sku]);
      if (prod.rows.length === 0) throw new HTTPException(400, { message: `SKU '${body.sku}' not found` });
      const p = prod.rows[0];
      body.big_sku = p.big_sku; body.item_name = p.name; body.colour = p.colour; body.size = p.size;
    }

    const allowed = ['transaction_date','store_id','sku','big_sku','item_name','colour','size','quantity_sold','selling_price','status','customer_id','payment_method','notes'];
    for (const col of allowed) {
      if (body[col] !== undefined) { sets.push(`${col} = $${pi}`); params.push(body[col]); pi++; }
    }

    if (sets.length === 0) throw new HTTPException(400, { message: 'No fields to update' });
    params.push(id, brandId);

    const result = await db.query(
      `UPDATE transactions SET ${sets.join(', ')} WHERE id = $${pi} AND brand_id = $${pi+1} RETURNING *`, params
    );
    return c.json({ data: result.rows[0] });
  }

  static async deleteTransaction(c: Context) {
    const brandId = getBrandId(c);
    const { id } = c.req.param();
    const result = await db.query('DELETE FROM transactions WHERE id = $1 AND brand_id = $2 RETURNING id', [id, brandId]);
    if (result.rows.length === 0) throw new HTTPException(404, { message: 'Transaction not found' });
    return c.json({ message: 'Deleted' });
  }

  static async bulkCreateTransactions(c: Context) {
    const brandId = getBrandId(c);
    const { transactions } = await c.req.json();
    if (!Array.isArray(transactions) || transactions.length === 0) {
      throw new HTTPException(400, { message: 'transactions array required' });
    }
    if (transactions.length > 5000) {
      throw new HTTPException(400, { message: 'Max 5000 transactions per batch' });
    }

    return await withTransaction(async (client) => {
      // Pre-fetch all product data for this brand in one query
      const skus = [...new Set(transactions.map((t: any) => t.sku).filter(Boolean))];
      const prodResult = await client.query(
        `SELECT sku, big_sku, name, colour, size FROM products WHERE brand_id = $1 AND sku = ANY($2)`,
        [brandId, skus]
      );
      const prodMap = new Map(prodResult.rows.map((p: any) => [p.sku, p]));

      const results: any[] = [];
      const errors: any[] = [];

      // Build multi-row INSERT for efficiency (batches of 500)
      const BATCH = 500;
      for (let start = 0; start < transactions.length; start += BATCH) {
        const batch = transactions.slice(start, start + BATCH);
        const values: any[] = [];
        const placeholders: string[] = [];
        let pi = 1;

        for (let i = 0; i < batch.length; i++) {
          const txn = batch[i];
          if (!txn.transaction_date || !txn.sku || txn.quantity_sold === undefined || !txn.selling_price) {
            errors.push({ row: start + i + 1, error: 'Missing required fields' }); continue;
          }
          const p = prodMap.get(txn.sku);
          if (!p) { errors.push({ row: start + i + 1, sku: txn.sku, error: 'SKU not found' }); continue; }

          placeholders.push(`($${pi},$${pi+1},$${pi+2},$${pi+3},$${pi+4},$${pi+5},$${pi+6},$${pi+7},$${pi+8},$${pi+9},$${pi+10},$${pi+11},$${pi+12})`);
          values.push(brandId, txn.transaction_date, txn.store_id || null, txn.sku, p.big_sku, p.name, p.colour, p.size,
                       txn.quantity_sold, txn.selling_price, txn.status || 'sale', txn.payment_method || null, txn.notes || null);
          pi += 13;
        }

        if (placeholders.length > 0) {
          const res = await client.query(
            `INSERT INTO transactions (brand_id, transaction_date, store_id, sku, big_sku, item_name, colour, size, quantity_sold, selling_price, status, payment_method, notes)
             VALUES ${placeholders.join(',')} RETURNING id, sku, quantity_sold, selling_price`, values
          );
          results.push(...res.rows);
        }
      }

      return c.json({ success: true, created: results.length, failed: errors.length, errors: errors.length > 0 ? errors : undefined });
    });
  }
}
