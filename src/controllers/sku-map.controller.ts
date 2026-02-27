import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { db } from '../config/database.js';

function getBrandId(c: Context): string {
  const brandId = c.get('brandId');
  if (!brandId) throw new HTTPException(401, { message: 'Brand context required' });
  return brandId;
}

export class SkuMapController {
  // GET /api/sku-map - Get all mappings, grouped by store_group
  static async getMappings(c: Context) {
    const brandId = getBrandId(c);
    const { store_group, search, page = '1', limit = '100' } = c.req.query();
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(500, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    let where = 'WHERE m.brand_id = $1';
    const params: any[] = [brandId];
    let pi = 2;

    if (store_group) {
      where += ` AND m.store_group = $${pi}`;
      params.push(store_group);
      pi++;
    }
    if (search) {
      where += ` AND (m.store_sku ILIKE $${pi} OR p.sku ILIKE $${pi} OR p.name ILIKE $${pi})`;
      params.push(`%${search}%`);
      pi++;
    }

    const [countRes, dataRes] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM sku_store_map m JOIN products p ON p.id = m.product_id ${where}`, params),
      db.query(
        `SELECT m.*, p.sku AS product_sku, p.name AS product_name, p.size AS product_size, p.colour AS product_colour
         FROM sku_store_map m
         JOIN products p ON p.id = m.product_id
         ${where}
         ORDER BY m.store_group ASC, m.store_sku ASC
         LIMIT $${pi} OFFSET $${pi + 1}`,
        [...params, limitNum, offset]
      )
    ]);

    const total = parseInt(countRes.rows[0].count);
    return c.json({
      success: true,
      data: dataRes.rows,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum), hasMore: pageNum < Math.ceil(total / limitNum) }
    });
  }

  // GET /api/sku-map/groups - Get distinct store groups with mapping counts
  static async getGroups(c: Context) {
    const brandId = getBrandId(c);
    const result = await db.query(
      `SELECT m.store_group, COUNT(*) AS mapping_count
       FROM sku_store_map m
       WHERE m.brand_id = $1
       GROUP BY m.store_group
       ORDER BY m.store_group ASC`,
      [brandId]
    );
    return c.json({ success: true, data: result.rows });
  }

  // POST /api/sku-map - Create a single mapping
  static async createMapping(c: Context) {
    const brandId = getBrandId(c);
    const body = await c.req.json();
    const { store_group, store_sku, product_id, notes } = body;

    if (!store_group || !store_sku || !product_id) {
      throw new HTTPException(400, { message: 'store_group, store_sku, and product_id are required' });
    }

    // Verify product exists and belongs to brand
    const product = await db.query('SELECT id FROM products WHERE id = $1 AND brand_id = $2', [product_id, brandId]);
    if (product.rows.length === 0) throw new HTTPException(404, { message: 'Product not found' });

    // Check for duplicate
    const existing = await db.query(
      'SELECT id FROM sku_store_map WHERE brand_id = $1 AND store_group = $2 AND store_sku = $3',
      [brandId, store_group, store_sku]
    );
    if (existing.rows.length > 0) {
      throw new HTTPException(409, { message: `Store SKU "${store_sku}" is already mapped for "${store_group}"` });
    }

    const result = await db.query(
      `INSERT INTO sku_store_map (brand_id, store_group, store_sku, product_id, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [brandId, store_group, store_sku, product_id, notes || null]
    );

    return c.json({ success: true, data: result.rows[0] }, 201);
  }

  // POST /api/sku-map/bulk - Bulk create mappings
  static async bulkCreateMappings(c: Context) {
    const brandId = getBrandId(c);
    const body = await c.req.json();
    const { mappings } = body;

    if (!Array.isArray(mappings) || mappings.length === 0) {
      throw new HTTPException(400, { message: 'mappings array is required' });
    }

    const created: any[] = [];
    const errors: { row: number; store_sku: string; error: string }[] = [];

    for (let i = 0; i < mappings.length; i++) {
      const { store_group, store_sku, product_id, notes } = mappings[i];
      try {
        if (!store_group || !store_sku || !product_id) {
          errors.push({ row: i + 1, store_sku: store_sku || '', error: 'Missing required fields' });
          continue;
        }

        const result = await db.query(
          `INSERT INTO sku_store_map (brand_id, store_group, store_sku, product_id, notes)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (brand_id, store_group, store_sku) DO NOTHING
           RETURNING *`,
          [brandId, store_group, store_sku, product_id, notes || null]
        );

        if (result.rows.length > 0) {
          created.push(result.rows[0]);
        } else {
          errors.push({ row: i + 1, store_sku, error: 'Already mapped' });
        }
      } catch (err: any) {
        errors.push({ row: i + 1, store_sku: store_sku || '', error: err.message });
      }
    }

    return c.json({ success: true, created: created.length, data: created, errors });
  }

  // PUT /api/sku-map/:id - Update a mapping
  static async updateMapping(c: Context) {
    const brandId = getBrandId(c);
    const { id } = c.req.param();
    const body = await c.req.json();

    const existing = await db.query('SELECT id FROM sku_store_map WHERE id = $1 AND brand_id = $2', [id, brandId]);
    if (existing.rows.length === 0) throw new HTTPException(404, { message: 'Mapping not found' });

    const allowed = ['store_group', 'store_sku', 'product_id', 'notes'];
    const sets: string[] = [];
    const params: any[] = [];
    let pi = 1;

    for (const key of allowed) {
      if (body[key] !== undefined) {
        sets.push(`${key} = $${pi}`);
        params.push(body[key]);
        pi++;
      }
    }

    if (sets.length === 0) throw new HTTPException(400, { message: 'No fields to update' });

    sets.push(`updated_at = NOW()`);
    params.push(id, brandId);

    const result = await db.query(
      `UPDATE sku_store_map SET ${sets.join(', ')} WHERE id = $${pi} AND brand_id = $${pi + 1} RETURNING *`,
      params
    );

    return c.json({ success: true, data: result.rows[0] });
  }

  // DELETE /api/sku-map/:id - Delete a mapping
  static async deleteMapping(c: Context) {
    const brandId = getBrandId(c);
    const { id } = c.req.param();

    const result = await db.query(
      'DELETE FROM sku_store_map WHERE id = $1 AND brand_id = $2 RETURNING id',
      [id, brandId]
    );

    if (result.rows.length === 0) throw new HTTPException(404, { message: 'Mapping not found' });
    return c.json({ success: true, message: 'Mapping deleted' });
  }

  // DELETE /api/sku-map/group/:group - Delete all mappings for a store group
  static async deleteGroup(c: Context) {
    const brandId = getBrandId(c);
    const group = decodeURIComponent(c.req.param('group'));

    const result = await db.query(
      'DELETE FROM sku_store_map WHERE brand_id = $1 AND store_group = $2',
      [brandId, group]
    );

    return c.json({ success: true, message: `Deleted ${result.rowCount} mappings for "${group}"` });
  }

  // GET /api/sku-map/lookup/:storeGroup/:storeSku - Resolve a store SKU to internal product
  static async lookupSku(c: Context) {
    const brandId = getBrandId(c);
    const storeGroup = decodeURIComponent(c.req.param('storeGroup'));
    const storeSku = decodeURIComponent(c.req.param('storeSku'));

    const result = await db.query(
      `SELECT m.*, p.sku AS product_sku, p.name AS product_name
       FROM sku_store_map m
       JOIN products p ON p.id = m.product_id
       WHERE m.brand_id = $1 AND m.store_group = $2 AND m.store_sku = $3`,
      [brandId, storeGroup, storeSku]
    );

    if (result.rows.length === 0) {
      throw new HTTPException(404, { message: `No mapping found for "${storeSku}" in "${storeGroup}"` });
    }

    return c.json({ success: true, data: result.rows[0] });
  }
}
