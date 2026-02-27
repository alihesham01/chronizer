import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { db } from '../config/database.js';
import { getBrandId } from '../lib/brand-context.js';

export class BrandController {
  static async getProfile(c: Context) {
    const brandId = getBrandId(c);
    const result = await db.query(
      `SELECT b.id, b.name, b.subdomain, b.custom_domain, b.logo_url, b.primary_color, b.secondary_color, b.settings, b.created_at
       FROM brands b WHERE b.id = $1 AND b.is_active = true`,
      [brandId]
    );
    if (result.rows.length === 0) throw new HTTPException(404, { message: 'Brand not found' });
    return c.json({ success: true, data: { brand: result.rows[0] } });
  }

  static async updateSettings(c: Context) {
    const brandId = getBrandId(c);
    const body = await c.req.json();

    const allowed: Record<string, string> = { name: 'name', logoUrl: 'logo_url', primaryColor: 'primary_color', secondaryColor: 'secondary_color', settings: 'settings' };
    const sets: string[] = [];
    const params: any[] = [];
    let pi = 1;

    for (const [key, col] of Object.entries(allowed)) {
      if (body[key] !== undefined) {
        sets.push(`${col} = $${pi}`);
        params.push(col === 'settings' ? JSON.stringify(body[key]) : body[key]);
        pi++;
      }
    }

    if (sets.length === 0) throw new HTTPException(400, { message: 'No valid fields to update' });
    params.push(brandId);

    const result = await db.query(
      `UPDATE brands SET ${sets.join(', ')} WHERE id = $${pi} AND is_active = true
       RETURNING id, name, subdomain, logo_url, primary_color, secondary_color, settings`,
      params
    );
    return c.json({ success: true, data: result.rows[0] });
  }

  static async getAnalytics(c: Context) {
    const brandId = getBrandId(c);
    const { period = '30d' } = c.req.query();

    // Parse period
    let days = 30;
    const match = period.match(/^(\d+)d$/);
    if (match) days = parseInt(match[1]);

    const [summary, topProducts, topStores] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*) AS total_transactions,
           COALESCE(SUM(quantity_sold * selling_price), 0) AS total_revenue,
           COALESCE(AVG(selling_price), 0) AS avg_order_value,
           COUNT(DISTINCT sku) AS unique_products,
           COUNT(DISTINCT store_id) AS active_stores
         FROM transactions
         WHERE brand_id = $1 AND transaction_date >= NOW() - ($2 || ' days')::interval`,
        [brandId, days]
      ),
      db.query(
        `SELECT sku, item_name, SUM(quantity_sold) AS total_qty, SUM(quantity_sold * selling_price) AS total_revenue
         FROM transactions WHERE brand_id = $1 AND transaction_date >= NOW() - ($2 || ' days')::interval
         GROUP BY sku, item_name ORDER BY total_revenue DESC LIMIT 10`,
        [brandId, days]
      ),
      db.query(
        `SELECT s.name AS store_name, COUNT(*) AS txn_count, SUM(t.quantity_sold * t.selling_price) AS revenue
         FROM transactions t JOIN stores s ON t.store_id = s.id
         WHERE t.brand_id = $1 AND t.transaction_date >= NOW() - ($2 || ' days')::interval
         GROUP BY s.name ORDER BY revenue DESC LIMIT 10`,
        [brandId, days]
      )
    ]);

    return c.json({
      success: true,
      data: {
        period,
        ...summary.rows[0],
        topProducts: topProducts.rows,
        topStores: topStores.rows
      }
    });
  }

  static async getDashboardStats(c: Context) {
    const brandId = getBrandId(c);

    const [today, month, storeCount, productCount] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS txn_count, COALESCE(SUM(quantity_sold * selling_price), 0) AS revenue
         FROM transactions WHERE brand_id = $1 AND transaction_date::date = CURRENT_DATE`,
        [brandId]
      ),
      db.query(
        `SELECT COUNT(*) AS txn_count, COALESCE(SUM(quantity_sold * selling_price), 0) AS revenue
         FROM transactions WHERE brand_id = $1 AND transaction_date >= date_trunc('month', CURRENT_DATE)`,
        [brandId]
      ),
      db.query('SELECT COUNT(*) AS c FROM stores WHERE brand_id = $1 AND is_active = true', [brandId]),
      db.query('SELECT COUNT(*) AS c FROM products WHERE brand_id = $1 AND is_active = true', [brandId])
    ]);

    return c.json({
      success: true,
      data: {
        today: today.rows[0],
        month: month.rows[0],
        stores: parseInt(storeCount.rows[0].c),
        products: parseInt(productCount.rows[0].c)
      }
    });
  }
}
