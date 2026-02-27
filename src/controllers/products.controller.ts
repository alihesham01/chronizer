import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { db, withTransaction } from '../config/database.js';

function getBrandId(c: Context): string {
  const brandId = c.get('brandId');
  if (!brandId) throw new HTTPException(401, { message: 'Brand context required' });
  return brandId;
}

export class ProductsController {
  static async getProducts(c: Context) {
    const brandId = getBrandId(c);
    const { page = '1', limit = '50', search, category } = c.req.query();
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    let where = 'WHERE brand_id = $1';
    const params: any[] = [brandId];
    let pi = 2;

    if (search) { where += ` AND (sku ILIKE $${pi} OR name ILIKE $${pi} OR big_sku ILIKE $${pi})`; params.push(`%${search}%`); pi++; }
    if (category) { where += ` AND category = $${pi}`; params.push(category); pi++; }

    const [countRes, dataRes] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM products ${where}`, params),
      db.query(`SELECT * FROM products ${where} ORDER BY created_at DESC LIMIT $${pi} OFFSET $${pi+1}`, [...params, limitNum, offset])
    ]);

    const total = parseInt(countRes.rows[0].count);
    return c.json({
      success: true,
      data: dataRes.rows,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum), hasMore: pageNum < Math.ceil(total / limitNum) }
    });
  }

  static async getProduct(c: Context) {
    const brandId = getBrandId(c);
    const { id } = c.req.param();
    const result = await db.query('SELECT * FROM products WHERE id = $1 AND brand_id = $2', [id, brandId]);
    if (result.rows.length === 0) throw new HTTPException(404, { message: 'Product not found' });
    return c.json({ success: true, data: result.rows[0] });
  }

  static async createProduct(c: Context) {
    const brandId = getBrandId(c);
    const body = await c.req.json();
    const { sku, big_sku, name, colour, size, category, cost_price, selling_price } = body;

    if (!sku || !name) throw new HTTPException(400, { message: 'SKU and name are required' });

    const existing = await db.query('SELECT id FROM products WHERE brand_id = $1 AND sku = $2', [brandId, sku]);
    if (existing.rows.length > 0) throw new HTTPException(409, { message: 'SKU already exists for this brand' });

    const result = await db.query(
      `INSERT INTO products (brand_id, sku, big_sku, name, colour, size, category, cost_price, selling_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [brandId, sku, big_sku, name, colour, size, category, cost_price, selling_price]
    );
    return c.json({ success: true, data: result.rows[0] }, 201);
  }

  static async updateProduct(c: Context) {
    const brandId = getBrandId(c);
    const { id } = c.req.param();
    const body = await c.req.json();

    const existing = await db.query('SELECT id FROM products WHERE id = $1 AND brand_id = $2', [id, brandId]);
    if (existing.rows.length === 0) throw new HTTPException(404, { message: 'Product not found' });

    const allowed = ['sku','big_sku','name','colour','size','category','cost_price','selling_price','is_active'];
    const sets: string[] = [];
    const params: any[] = [];
    let pi = 1;

    for (const col of allowed) {
      if (body[col] !== undefined) { sets.push(`${col} = $${pi}`); params.push(body[col]); pi++; }
    }
    if (sets.length === 0) throw new HTTPException(400, { message: 'No valid fields to update' });

    params.push(id, brandId);
    const result = await db.query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = $${pi} AND brand_id = $${pi+1} RETURNING *`, params
    );
    return c.json({ success: true, data: result.rows[0] });
  }

  static async deleteProduct(c: Context) {
    const brandId = getBrandId(c);
    const { id } = c.req.param();
    const result = await db.query('DELETE FROM products WHERE id = $1 AND brand_id = $2 RETURNING id', [id, brandId]);
    if (result.rows.length === 0) throw new HTTPException(404, { message: 'Product not found' });
    return c.json({ success: true, message: 'Product deleted' });
  }

  static async bulkCreateProducts(c: Context) {
    const brandId = getBrandId(c);
    const { products } = await c.req.json();
    if (!Array.isArray(products) || products.length === 0) throw new HTTPException(400, { message: 'products array required' });
    if (products.length > 5000) throw new HTTPException(400, { message: 'Max 5000 products per batch' });

    return await withTransaction(async (client) => {
      const results: any[] = [];
      const errors: any[] = [];

      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        if (!p.sku || !p.name) { errors.push({ row: i+1, error: 'SKU and name required' }); continue; }
        try {
          const res = await client.query(
            `INSERT INTO products (brand_id, sku, big_sku, name, colour, size, category, cost_price, selling_price)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (brand_id, sku) DO UPDATE SET name=EXCLUDED.name, big_sku=EXCLUDED.big_sku, colour=EXCLUDED.colour, size=EXCLUDED.size, category=EXCLUDED.category, cost_price=EXCLUDED.cost_price, selling_price=EXCLUDED.selling_price
             RETURNING *`,
            [brandId, p.sku, p.big_sku, p.name, p.colour, p.size, p.category, p.cost_price, p.selling_price]
          );
          results.push(res.rows[0]);
        } catch (err: any) {
          errors.push({ row: i+1, sku: p.sku, error: err.message });
        }
      }

      return c.json({ success: true, created: results.length, failed: errors.length, errors: errors.length > 0 ? errors : undefined });
    });
  }
}
