import { db } from '../config/database.js';
import { notificationService } from './notification-service.js';
import { logger } from '../lib/logger.js';

export const alertService = {
  async checkLowStockAlerts(brandId: string) {
    try {
      const thresholds = await db.query(
        `SELECT at.id, at.sku, at.threshold_value, at.comparison, p.name AS product_name
         FROM alert_thresholds at
         LEFT JOIN products p ON p.brand_id = at.brand_id AND p.sku = at.sku
         WHERE at.brand_id = $1 AND at.type = 'low_stock' AND at.is_active = true`,
        [brandId]
      );

      for (const t of thresholds.rows) {
        const inv = await db.query(
          `SELECT available_stock FROM inventory_summary WHERE brand_id = $1 AND sku = $2`,
          [brandId, t.sku]
        );

        if (inv.rows.length === 0) continue;
        const stock = parseFloat(inv.rows[0].available_stock);
        const threshold = parseFloat(t.threshold_value);

        let triggered = false;
        switch (t.comparison) {
          case 'lt': triggered = stock < threshold; break;
          case 'lte': triggered = stock <= threshold; break;
          case 'gt': triggered = stock > threshold; break;
          case 'gte': triggered = stock >= threshold; break;
          case 'eq': triggered = stock === threshold; break;
        }

        if (triggered) {
          await notificationService.lowStock(brandId, t.sku, t.product_name || t.sku, stock, threshold);
          await db.query('UPDATE alert_thresholds SET last_triggered_at = NOW() WHERE id = $1', [t.id]);
        }
      }
    } catch (err: any) {
      logger.error(`[AlertService] Low stock check failed for brand ${brandId}: ${err.message}`);
    }
  },

  async checkSalesAnomalies(brandId: string) {
    try {
      const thresholds = await db.query(
        `SELECT id, threshold_value, comparison, store_id
         FROM alert_thresholds
         WHERE brand_id = $1 AND type = 'sales_drop' AND is_active = true`,
        [brandId]
      );

      for (const t of thresholds.rows) {
        const storeFilter = t.store_id ? 'AND store_id = $2' : '';
        const params: any[] = [brandId];
        if (t.store_id) params.push(t.store_id);

        // Compare today's revenue with 7-day average
        const todayRes = await db.query(
          `SELECT COALESCE(SUM(quantity_sold * selling_price), 0) AS revenue
           FROM transactions WHERE brand_id = $1 ${storeFilter}
           AND transaction_date >= CURRENT_DATE`,
          params
        );

        const avgRes = await db.query(
          `SELECT COALESCE(AVG(daily_rev), 0) AS avg_revenue FROM (
             SELECT DATE(transaction_date) AS d, SUM(quantity_sold * selling_price) AS daily_rev
             FROM transactions WHERE brand_id = $1 ${storeFilter}
             AND transaction_date >= CURRENT_DATE - INTERVAL '7 days' AND transaction_date < CURRENT_DATE
             GROUP BY DATE(transaction_date)
           ) sub`,
          params
        );

        const todayRev = parseFloat(todayRes.rows[0].revenue);
        const avgRev = parseFloat(avgRes.rows[0].avg_revenue);

        if (avgRev > 0) {
          const dropPct = ((avgRev - todayRev) / avgRev) * 100;
          const thresholdPct = parseFloat(t.threshold_value);

          if (dropPct >= thresholdPct) {
            await notificationService.create({
              brandId,
              type: 'sales_anomaly',
              title: 'Sales Drop Detected',
              message: `Today's revenue (${todayRev.toFixed(2)}) is ${dropPct.toFixed(1)}% below the 7-day average (${avgRev.toFixed(2)}). Threshold: ${thresholdPct}%.`,
              metadata: { todayRev, avgRev, dropPct, thresholdPct },
              sendEmail: true,
            });
            await db.query('UPDATE alert_thresholds SET last_triggered_at = NOW() WHERE id = $1', [t.id]);
          }
        }
      }
    } catch (err: any) {
      logger.error(`[AlertService] Sales anomaly check failed for brand ${brandId}: ${err.message}`);
    }
  },

  async checkAllBrands() {
    const brands = await db.query('SELECT id FROM brands WHERE is_active = true');
    for (const brand of brands.rows) {
      await this.checkLowStockAlerts(brand.id);
      await this.checkSalesAnomalies(brand.id);
    }
  },

  // CRUD for thresholds
  async list(brandId: string) {
    const result = await db.query(
      `SELECT at.*, p.name AS product_name
       FROM alert_thresholds at
       LEFT JOIN products p ON p.brand_id = at.brand_id AND p.sku = at.sku
       WHERE at.brand_id = $1 ORDER BY at.created_at DESC`,
      [brandId]
    );
    return result.rows;
  },

  async create(brandId: string, data: { type: string; sku?: string; storeId?: string; thresholdValue: number; comparison?: string }) {
    const result = await db.query(
      `INSERT INTO alert_thresholds (brand_id, type, sku, store_id, threshold_value, comparison)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [brandId, data.type, data.sku || null, data.storeId || null, data.thresholdValue, data.comparison || 'lt']
    );
    return result.rows[0];
  },

  async delete(id: string, brandId: string) {
    await db.query('DELETE FROM alert_thresholds WHERE id = $1 AND brand_id = $2', [id, brandId]);
  },
};
