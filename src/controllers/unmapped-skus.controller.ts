import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { db } from '../config/database.js';
import { getBrandId } from '../lib/brand-context.js';
import { auditLog } from '../lib/audit.js';

export class UnmappedSkusController {
  // List all unmapped SKUs for the brand, grouped and sorted by occurrence
  static async list(c: Context) {
    const brandId = getBrandId(c);
    const status = c.req.query('status') || 'pending';

    const result = await db.query(
      `SELECT u.*, p.name as mapped_product_name, p.sku as mapped_product_sku
       FROM unmapped_skus u
       LEFT JOIN products p ON p.id = u.mapped_to_product_id
       WHERE u.brand_id = $1 AND u.status = $2
       ORDER BY u.occurrence_count DESC, u.last_seen DESC`,
      [brandId, status]
    );

    const counts = await db.query(
      `SELECT status, COUNT(*) as count FROM unmapped_skus WHERE brand_id = $1 GROUP BY status`,
      [brandId]
    );

    return c.json({
      success: true,
      data: result.rows,
      summary: {
        pending: parseInt(counts.rows.find((r: any) => r.status === 'pending')?.count || '0'),
        mapped: parseInt(counts.rows.find((r: any) => r.status === 'mapped')?.count || '0'),
        ignored: parseInt(counts.rows.find((r: any) => r.status === 'ignored')?.count || '0'),
      }
    });
  }

  // Flag an external SKU as unmapped (called during transaction import)
  static async flag(brandId: string, externalSku: string, storeGroup: string | null, source: string, sampleData?: any) {
    await db.query(
      `INSERT INTO unmapped_skus (brand_id, external_sku, store_group, source, sample_data, occurrence_count, first_seen, last_seen)
       VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())
       ON CONFLICT (brand_id, external_sku, store_group)
       DO UPDATE SET
         occurrence_count = unmapped_skus.occurrence_count + 1,
         last_seen = NOW(),
         sample_data = COALESCE($5, unmapped_skus.sample_data)`,
      [brandId, externalSku, storeGroup, source, sampleData ? JSON.stringify(sampleData) : null]
    );
  }

  // Map an unmapped SKU to a product (creates sku_store_map entry)
  static async resolve(c: Context) {
    const brandId = getBrandId(c);
    const { id } = c.req.param();
    const body = await c.req.json();
    const { productId, action } = body; // action: 'map' | 'ignore'

    const unmapped = await db.query(
      'SELECT * FROM unmapped_skus WHERE id = $1 AND brand_id = $2',
      [id, brandId]
    );
    if (unmapped.rows.length === 0) throw new HTTPException(404, { message: 'Unmapped SKU not found' });

    const sku = unmapped.rows[0];

    if (action === 'map') {
      if (!productId) throw new HTTPException(400, { message: 'productId required when mapping' });

      // Verify product exists
      const product = await db.query('SELECT id, sku FROM products WHERE id = $1 AND brand_id = $2', [productId, brandId]);
      if (product.rows.length === 0) throw new HTTPException(404, { message: 'Product not found' });

      // Create the sku_store_map entry
      await db.query(
        `INSERT INTO sku_store_map (brand_id, store_group, store_sku, product_id, notes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (brand_id, store_group, store_sku) DO UPDATE SET product_id = $4`,
        [brandId, sku.store_group || 'default', sku.external_sku, productId, `Auto-mapped from unmapped SKU resolution`]
      );

      // Mark as mapped
      await db.query(
        `UPDATE unmapped_skus SET status = 'mapped', mapped_to_product_id = $1, resolved_at = NOW(), resolved_by = $2 WHERE id = $3`,
        [productId, c.get('ownerId'), id]
      );

      await auditLog(brandId, c.get('ownerId'), 'unmapped_sku_resolved', {
        externalSku: sku.external_sku,
        productId,
        storeGroup: sku.store_group
      });

      return c.json({ success: true, message: 'SKU mapped successfully' });
    } else if (action === 'ignore') {
      await db.query(
        `UPDATE unmapped_skus SET status = 'ignored', resolved_at = NOW(), resolved_by = $1 WHERE id = $2`,
        [c.get('ownerId'), id]
      );
      return c.json({ success: true, message: 'SKU ignored' });
    } else {
      throw new HTTPException(400, { message: 'action must be "map" or "ignore"' });
    }
  }

  // Bulk resolve: map multiple unmapped SKUs at once
  static async bulkResolve(c: Context) {
    const brandId = getBrandId(c);
    const { mappings } = await c.req.json();
    // mappings: [{ unmappedId, productId, action }]

    if (!Array.isArray(mappings) || mappings.length === 0) {
      throw new HTTPException(400, { message: 'mappings array required' });
    }

    let mapped = 0;
    let ignored = 0;
    const errors: any[] = [];

    for (const m of mappings) {
      try {
        if (m.action === 'ignore') {
          await db.query(
            `UPDATE unmapped_skus SET status = 'ignored', resolved_at = NOW(), resolved_by = $1 WHERE id = $2 AND brand_id = $3`,
            [c.get('ownerId'), m.unmappedId, brandId]
          );
          ignored++;
        } else if (m.action === 'map' && m.productId) {
          const unmapped = await db.query('SELECT * FROM unmapped_skus WHERE id = $1 AND brand_id = $2', [m.unmappedId, brandId]);
          if (unmapped.rows.length === 0) { errors.push({ id: m.unmappedId, error: 'not found' }); continue; }

          const sku = unmapped.rows[0];
          await db.query(
            `INSERT INTO sku_store_map (brand_id, store_group, store_sku, product_id, notes)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (brand_id, store_group, store_sku) DO UPDATE SET product_id = $4`,
            [brandId, sku.store_group || 'default', sku.external_sku, m.productId, 'Bulk mapped from unmapped SKU resolution']
          );

          await db.query(
            `UPDATE unmapped_skus SET status = 'mapped', mapped_to_product_id = $1, resolved_at = NOW(), resolved_by = $2 WHERE id = $3`,
            [m.productId, c.get('ownerId'), m.unmappedId]
          );
          mapped++;
        }
      } catch (err: any) {
        errors.push({ id: m.unmappedId, error: err.message });
      }
    }

    return c.json({ success: true, data: { mapped, ignored, errors: errors.length > 0 ? errors : undefined } });
  }
}
