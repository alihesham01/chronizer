import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { db, withTransaction } from '../config/database.js';

function getBrandId(c: Context): string {
  const brandId = c.get('brandId');
  if (!brandId) throw new HTTPException(401, { message: 'Brand context required' });
  return brandId;
}

export class StockMovesController {
  static async getStockMoves(c: Context) {
    const brandId = getBrandId(c);
    const { page = '1', limit = '50', search, destination, start_date, end_date } = c.req.query();
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    let where = 'WHERE sm.brand_id = $1';
    const params: any[] = [brandId];
    let pi = 2;

    if (search) { where += ` AND sm.sku ILIKE $${pi}`; params.push(`%${search}%`); pi++; }
    if (destination) { where += ` AND sm.destination = $${pi}`; params.push(destination); pi++; }
    if (start_date) { where += ` AND sm.move_date >= $${pi}`; params.push(start_date); pi++; }
    if (end_date) { where += ` AND sm.move_date <= $${pi}`; params.push(end_date); pi++; }

    const [countRes, dataRes] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM stock_movements sm ${where}`, params),
      db.query(
        `SELECT sm.*, s.name AS store_name
         FROM stock_movements sm LEFT JOIN stores s ON sm.store_id = s.id
         ${where} ORDER BY sm.move_date DESC LIMIT $${pi} OFFSET $${pi+1}`,
        [...params, limitNum, offset]
      )
    ]);

    const total = parseInt(countRes.rows[0].count);
    return c.json({
      data: dataRes.rows,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum), hasMore: pageNum < Math.ceil(total / limitNum) }
    });
  }

  static async getStockMove(c: Context) {
    const brandId = getBrandId(c);
    const { id } = c.req.param();
    const result = await db.query(
      `SELECT sm.*, s.name AS store_name FROM stock_movements sm LEFT JOIN stores s ON sm.store_id = s.id
       WHERE sm.id = $1 AND sm.brand_id = $2`, [id, brandId]
    );
    if (result.rows.length === 0) throw new HTTPException(404, { message: 'Stock move not found' });
    return c.json({ data: result.rows[0] });
  }

  static async createStockMove(c: Context) {
    const brandId = getBrandId(c);
    const body = await c.req.json();
    const { move_date, store_id, sku, quantity, destination, reference_type, reference_number, notes } = body;

    if (!move_date || !sku || quantity === undefined) throw new HTTPException(400, { message: 'Required: move_date, sku, quantity' });
    if (quantity === 0) throw new HTTPException(400, { message: 'Quantity cannot be zero' });

    // Verify SKU exists
    const prod = await db.query('SELECT id FROM products WHERE brand_id = $1 AND sku = $2', [brandId, sku]);
    if (prod.rows.length === 0) throw new HTTPException(400, { message: `SKU '${sku}' not found` });

    const result = await db.query(
      `INSERT INTO stock_movements (brand_id, move_date, store_id, sku, quantity, destination, reference_type, reference_number, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [brandId, move_date, store_id, sku, quantity, destination, reference_type, reference_number, notes]
    );
    return c.json({ data: result.rows[0] }, 201);
  }

  static async updateStockMove(c: Context) {
    const brandId = getBrandId(c);
    const { id } = c.req.param();
    const body = await c.req.json();

    const existing = await db.query('SELECT id FROM stock_movements WHERE id = $1 AND brand_id = $2', [id, brandId]);
    if (existing.rows.length === 0) throw new HTTPException(404, { message: 'Stock move not found' });

    const allowed = ['move_date','store_id','sku','quantity','destination','reference_type','reference_number','notes'];
    const sets: string[] = [];
    const params: any[] = [];
    let pi = 1;

    for (const col of allowed) {
      if (body[col] !== undefined) { sets.push(`${col} = $${pi}`); params.push(body[col]); pi++; }
    }
    if (sets.length === 0) throw new HTTPException(400, { message: 'No fields to update' });

    params.push(id, brandId);
    const result = await db.query(
      `UPDATE stock_movements SET ${sets.join(', ')} WHERE id = $${pi} AND brand_id = $${pi+1} RETURNING *`, params
    );
    return c.json({ data: result.rows[0] });
  }

  static async deleteStockMove(c: Context) {
    const brandId = getBrandId(c);
    const { id } = c.req.param();
    const result = await db.query('DELETE FROM stock_movements WHERE id = $1 AND brand_id = $2 RETURNING id', [id, brandId]);
    if (result.rows.length === 0) throw new HTTPException(404, { message: 'Stock move not found' });
    return c.json({ message: 'Deleted' });
  }

  static async bulkCreateStockMoves(c: Context) {
    const brandId = getBrandId(c);
    const { stock_moves } = await c.req.json();
    if (!Array.isArray(stock_moves) || stock_moves.length === 0) throw new HTTPException(400, { message: 'stock_moves array required' });
    if (stock_moves.length > 5000) throw new HTTPException(400, { message: 'Max 5000 per batch' });

    return await withTransaction(async (client) => {
      const results: any[] = [];
      const errors: any[] = [];

      for (let i = 0; i < stock_moves.length; i++) {
        const m = stock_moves[i];
        if (!m.move_date || !m.sku || m.quantity === undefined) { errors.push({ row: i+1, error: 'Missing required fields' }); continue; }
        if (m.quantity === 0) { errors.push({ row: i+1, error: 'Quantity cannot be zero' }); continue; }
        try {
          const res = await client.query(
            `INSERT INTO stock_movements (brand_id, move_date, store_id, sku, quantity, destination, reference_type, reference_number, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [brandId, m.move_date, m.store_id, m.sku, m.quantity, m.destination, m.reference_type, m.reference_number, m.notes]
          );
          results.push(res.rows[0]);
        } catch (err: any) {
          errors.push({ row: i+1, sku: m.sku, error: err.message });
        }
      }

      return c.json({ success: true, created: results.length, failed: errors.length, errors: errors.length > 0 ? errors : undefined });
    });
  }

  static async getStockSummary(c: Context) {
    const brandId = getBrandId(c);
    const { sku } = c.req.query();

    let where = 'WHERE brand_id = $1';
    const params: any[] = [brandId];
    if (sku) { where += ' AND sku = $2'; params.push(sku); }

    const result = await db.query(
      `SELECT sku,
              SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END) AS total_in,
              SUM(CASE WHEN quantity < 0 THEN ABS(quantity) ELSE 0 END) AS total_out,
              SUM(quantity) AS net_quantity,
              COUNT(*) AS total_moves
       FROM stock_movements ${where}
       GROUP BY sku ORDER BY sku`, params
    );
    return c.json({ data: result.rows });
  }
}
