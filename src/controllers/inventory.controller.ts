import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { db } from '../config/database.js';
import { getBrandId } from '../lib/brand-context.js';

export class InventoryController {
  static async getInventory(c: Context) {
    const brandId = getBrandId(c);
    const { page = '1', limit = '50', search, sort_by = 'sku', sort_order = 'asc', low_stock, negative_stock } = c.req.query();
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'WHERE iv.brand_id = $1';
    const params: any[] = [brandId];
    let pi = 2;

    if (search) { whereClause += ` AND (iv.sku ILIKE $${pi} OR iv.item_name ILIKE $${pi} OR iv.big_sku ILIKE $${pi})`; params.push(`%${search}%`); pi++; }
    if (low_stock === 'true') { whereClause += ` AND iv.available_stock > 0 AND iv.available_stock <= 10`; }
    if (negative_stock === 'true') { whereClause += ` AND iv.available_stock < 0`; }

    const validCols: Record<string, string> = { sku: 'iv.sku', item_name: 'iv.item_name', available_stock: 'iv.available_stock' };
    const sortCol = validCols[sort_by || ''] || 'iv.sku';
    const sortDir = sort_order === 'desc' ? 'DESC' : 'ASC';

    const [countRes, dataRes, summaryRes] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM inventory_view iv ${whereClause}`, params),
      db.query(
        `SELECT iv.*,
                iv.available_stock * COALESCE(iv.unit_selling_price, 0) AS inventory_value,
                CASE WHEN iv.available_stock > 0 THEN 'In Stock' WHEN iv.available_stock = 0 THEN 'Out of Stock' ELSE 'Negative Stock' END AS inventory_status
         FROM inventory_view iv ${whereClause}
         ORDER BY ${sortCol} ${sortDir}
         LIMIT $${pi} OFFSET $${pi + 1}`,
        [...params, limitNum, offset]
      ),
      db.query(
        `SELECT
           COUNT(*) AS total_items,
           COUNT(CASE WHEN iv.available_stock > 0 THEN 1 END) AS in_stock_count,
           COUNT(CASE WHEN iv.available_stock = 0 THEN 1 END) AS out_of_stock_count,
           COUNT(CASE WHEN iv.available_stock < 0 THEN 1 END) AS negative_stock_count,
           COALESCE(SUM(iv.available_stock * COALESCE(iv.unit_selling_price, 0)), 0) AS total_inventory_value
         FROM inventory_view iv WHERE iv.brand_id = $1`,
        [brandId]
      )
    ]);

    const total = parseInt(countRes.rows[0].count);
    return c.json({
      data: dataRes.rows,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum), hasMore: pageNum < Math.ceil(total / limitNum) },
      summary: summaryRes.rows[0]
    });
  }

  static async getInventoryItem(c: Context) {
    const brandId = getBrandId(c);
    const { sku } = c.req.param();

    const result = await db.query(
      `SELECT iv.*,
              iv.available_stock * COALESCE(iv.unit_selling_price, 0) AS inventory_value,
              CASE WHEN iv.available_stock > 0 THEN 'In Stock' WHEN iv.available_stock = 0 THEN 'Out of Stock' ELSE 'Negative Stock' END AS inventory_status
       FROM inventory_view iv WHERE iv.brand_id = $1 AND iv.sku = $2`,
      [brandId, sku]
    );
    if (result.rows.length === 0) throw new HTTPException(404, { message: 'Inventory item not found' });

    const history = await db.query(`
      (SELECT 'stock_move' AS type, move_date AS date, quantity, destination, notes, created_at
       FROM stock_movements WHERE brand_id = $1 AND sku = $2)
      UNION ALL
      (SELECT 'transaction' AS type, transaction_date AS date, quantity_sold AS quantity, COALESCE(s.name, '-') AS destination, t.notes, t.created_at
       FROM transactions t LEFT JOIN stores s ON t.store_id = s.id
       WHERE t.brand_id = $1 AND t.sku = $2)
      ORDER BY date DESC, created_at DESC LIMIT 50
    `, [brandId, sku]);

    return c.json({ data: result.rows[0], history: history.rows });
  }

  static async getLowStockItems(c: Context) {
    const brandId = getBrandId(c);
    const { threshold = '10' } = c.req.query();
    const result = await db.query(
      `SELECT iv.*, iv.available_stock * COALESCE(iv.unit_selling_price, 0) AS inventory_value
       FROM inventory_view iv WHERE iv.brand_id = $1 AND iv.available_stock > 0 AND iv.available_stock <= $2
       ORDER BY iv.available_stock ASC`,
      [brandId, Number(threshold)]
    );
    return c.json({ data: result.rows, threshold: Number(threshold), count: result.rows.length });
  }

  static async getNegativeStockItems(c: Context) {
    const brandId = getBrandId(c);
    const result = await db.query(
      `SELECT iv.*, iv.available_stock * COALESCE(iv.unit_selling_price, 0) AS inventory_value
       FROM inventory_view iv WHERE iv.brand_id = $1 AND iv.available_stock < 0 ORDER BY iv.available_stock ASC`,
      [brandId]
    );
    return c.json({ data: result.rows, count: result.rows.length });
  }

  static async getInventoryValueSummary(c: Context) {
    const brandId = getBrandId(c);
    const result = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN available_stock > 0 THEN available_stock * COALESCE(unit_selling_price, 0) ELSE 0 END), 0) AS positive_value,
         COALESCE(SUM(CASE WHEN available_stock < 0 THEN available_stock * COALESCE(unit_selling_price, 0) ELSE 0 END), 0) AS negative_value,
         COUNT(CASE WHEN available_stock > 0 THEN 1 END) AS items_in_stock,
         COUNT(CASE WHEN available_stock = 0 THEN 1 END) AS items_out_of_stock,
         COUNT(CASE WHEN available_stock < 0 THEN 1 END) AS items_negative
       FROM inventory_view WHERE brand_id = $1`,
      [brandId]
    );
    return c.json({ data: result.rows[0] });
  }

  static async getTopItemsByValue(c: Context) {
    const brandId = getBrandId(c);
    const { limit = '20' } = c.req.query();
    const result = await db.query(
      `SELECT iv.*, iv.available_stock * COALESCE(iv.unit_selling_price, 0) AS inventory_value
       FROM inventory_view iv WHERE iv.brand_id = $1 AND iv.available_stock > 0
       ORDER BY iv.available_stock * COALESCE(iv.unit_selling_price, 0) DESC LIMIT $2`,
      [brandId, Number(limit)]
    );
    return c.json({ data: result.rows, count: result.rows.length });
  }
}
