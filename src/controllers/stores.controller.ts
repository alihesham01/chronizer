import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { db, withTransaction } from '../config/database.js';
import { getBrandId } from '../lib/brand-context.js';
import { auditLog } from '../lib/audit.js';

export class StoresController {
  static async getStores(c: Context) {
    const brandId = getBrandId(c);
    const { page = '1', limit = '50', search, group_name, status } = c.req.query();
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    let where = 'WHERE brand_id = $1';
    const params: any[] = [brandId];
    let pi = 2;

    if (search) { where += ` AND (name ILIKE $${pi} OR code ILIKE $${pi} OR display_name ILIKE $${pi})`; params.push(`%${search}%`); pi++; }
    if (group_name) { where += ` AND group_name = $${pi}`; params.push(group_name); pi++; }
    if (status === 'active') { where += ` AND is_active = true`; }
    else if (status === 'inactive') { where += ` AND is_active = false`; }

    const [countRes, dataRes] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM stores ${where}`, params),
      db.query(`SELECT * FROM stores ${where} ORDER BY name ASC LIMIT $${pi} OFFSET $${pi+1}`, [...params, limitNum, offset])
    ]);

    const total = parseInt(countRes.rows[0].count);
    return c.json({
      success: true,
      data: dataRes.rows,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum), hasMore: pageNum < Math.ceil(total / limitNum) }
    });
  }

  static async getStore(c: Context) {
    const brandId = getBrandId(c);
    const { id } = c.req.param();
    const result = await db.query('SELECT * FROM stores WHERE id = $1 AND brand_id = $2', [id, brandId]);
    if (result.rows.length === 0) throw new HTTPException(404, { message: 'Store not found' });
    return c.json({ success: true, data: result.rows[0] });
  }

  static async createStore(c: Context) {
    const brandId = getBrandId(c);
    const body = await c.req.json();
    const { name, display_name, code, group_name, commission, rent, activation_date } = body;

    if (!name) throw new HTTPException(400, { message: 'Store name is required' });

    if (code) {
      const existing = await db.query('SELECT id FROM stores WHERE brand_id = $1 AND code = $2', [brandId, code]);
      if (existing.rows.length > 0) throw new HTTPException(409, { message: 'Store code already exists' });
    }

    const result = await db.query(
      `INSERT INTO stores (brand_id, name, display_name, code, group_name, commission, rent, activation_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [brandId, name, display_name || name, code, group_name, commission, rent, activation_date || new Date().toISOString()]
    );
    await auditLog(brandId, c.get('ownerId'), 'store_created', { id: result.rows[0].id, name });
    return c.json({ success: true, data: result.rows[0] }, 201);
  }

  static async updateStore(c: Context) {
    const brandId = getBrandId(c);
    const { id } = c.req.param();
    const body = await c.req.json();

    const existing = await db.query('SELECT id FROM stores WHERE id = $1 AND brand_id = $2', [id, brandId]);
    if (existing.rows.length === 0) throw new HTTPException(404, { message: 'Store not found' });

    const allowed = ['name','display_name','code','group_name','commission','rent','activation_date','deactivation_date','is_active'];
    const sets: string[] = [];
    const params: any[] = [];
    let pi = 1;

    for (const col of allowed) {
      if (body[col] !== undefined) { sets.push(`${col} = $${pi}`); params.push(body[col]); pi++; }
    }
    if (sets.length === 0) throw new HTTPException(400, { message: 'No valid fields to update' });

    params.push(id, brandId);
    const result = await db.query(
      `UPDATE stores SET ${sets.join(', ')} WHERE id = $${pi} AND brand_id = $${pi+1} RETURNING *`, params
    );
    await auditLog(brandId, c.get('ownerId'), 'store_updated', { id });
    return c.json({ success: true, data: result.rows[0] });
  }

  static async deleteStore(c: Context) {
    const brandId = getBrandId(c);
    const { id } = c.req.param();
    // Soft delete: deactivate instead of removing
    const result = await db.query(
      'UPDATE stores SET is_active = false, deactivation_date = NOW() WHERE id = $1 AND brand_id = $2 AND is_active = true RETURNING id',
      [id, brandId]
    );
    if (result.rows.length === 0) throw new HTTPException(404, { message: 'Store not found' });
    await auditLog(brandId, c.get('ownerId'), 'store_deleted', { id });
    return c.json({ success: true, message: 'Store deactivated' });
  }

  static async bulkCreateStores(c: Context) {
    const brandId = getBrandId(c);
    const { stores } = await c.req.json();
    if (!Array.isArray(stores) || stores.length === 0) throw new HTTPException(400, { message: 'stores array required' });

    return await withTransaction(async (client) => {
      const results: any[] = [];
      const errors: any[] = [];

      for (let i = 0; i < stores.length; i++) {
        const s = stores[i];
        if (!s.name) { errors.push({ row: i+1, error: 'name required' }); continue; }
        try {
          const res = await client.query(
            `INSERT INTO stores (brand_id, name, display_name, code, group_name, commission, rent, activation_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [brandId, s.name, s.display_name || s.name, s.code, s.group_name, s.commission, s.rent, s.activation_date || new Date().toISOString()]
          );
          results.push(res.rows[0]);
        } catch (err: any) {
          errors.push({ row: i+1, name: s.name, error: err.message });
        }
      }

      return c.json({ success: true, created: results.length, failed: errors.length, errors: errors.length > 0 ? errors : undefined });
    });
  }
}
