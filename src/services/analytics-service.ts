import { db } from '../config/database.js';
import { memoryCache } from './memory-cache.js';

class AnalyticsService {
  private readonly TTL = 900; // 15 min in seconds

  async getDailySummary(brandId: string, startDate?: string, endDate?: string, storeName?: string) {
    let where = 'WHERE t.brand_id = $1';
    const params: any[] = [brandId];
    let pi = 2;

    if (startDate) { where += ` AND t.transaction_date >= $${pi}::date`; params.push(startDate); pi++; }
    if (endDate) { where += ` AND t.transaction_date <= $${pi}::date`; params.push(endDate); pi++; }
    if (storeName) { where += ` AND s.name = $${pi}`; params.push(storeName); pi++; }

    const result = await db.query(`
      SELECT t.transaction_date::date AS date, s.name AS store_name,
             COUNT(*) AS transactions, SUM(t.quantity_sold) AS total_qty,
             SUM(t.quantity_sold * t.selling_price) AS revenue
      FROM transactions t LEFT JOIN stores s ON t.store_id = s.id
      ${where}
      GROUP BY t.transaction_date::date, s.name
      ORDER BY date DESC LIMIT 100`, params);
    return result.rows;
  }

  async getSKUPerformance(brandId: string, limit = 50) {
    const result = await db.query(`
      SELECT sku, item_name, SUM(quantity_sold) AS total_qty,
             SUM(quantity_sold * selling_price) AS total_revenue,
             COUNT(*) AS transaction_count
      FROM transactions WHERE brand_id = $1
      GROUP BY sku, item_name ORDER BY total_revenue DESC LIMIT $2`, [brandId, limit]);
    return result.rows;
  }

  async getStorePerformance(brandId: string) {
    const result = await db.query(`
      SELECT s.name AS store_name, COUNT(*) AS transactions,
             SUM(t.quantity_sold * t.selling_price) AS revenue,
             SUM(t.quantity_sold) AS total_qty
      FROM transactions t JOIN stores s ON t.store_id = s.id
      WHERE t.brand_id = $1
      GROUP BY s.name ORDER BY revenue DESC`, [brandId]);
    return result.rows;
  }

  async getMonthlyRevenue(brandId: string, months = 12) {
    const result = await db.query(`
      SELECT date_trunc('month', transaction_date)::date AS month,
             COUNT(*) AS transactions, SUM(quantity_sold * selling_price) AS revenue
      FROM transactions WHERE brand_id = $1
      GROUP BY month ORDER BY month DESC LIMIT $2`, [brandId, months]);
    return result.rows;
  }

  async getTopSKUs(brandId: string, limit = 20) {
    const result = await db.query(`
      SELECT sku, item_name, SUM(quantity_sold) AS total_qty,
             SUM(quantity_sold * selling_price) AS revenue
      FROM transactions WHERE brand_id = $1 AND transaction_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY sku, item_name ORDER BY revenue DESC LIMIT $2`, [brandId, limit]);
    return result.rows;
  }

  async getDashboardMetrics(brandId: string) {
    const [today, yesterday, month] = await Promise.all([
      db.query(`SELECT COUNT(*) AS txn, COALESCE(SUM(quantity_sold * selling_price),0) AS rev
                FROM transactions WHERE brand_id = $1 AND transaction_date::date = CURRENT_DATE`, [brandId]),
      db.query(`SELECT COUNT(*) AS txn, COALESCE(SUM(quantity_sold * selling_price),0) AS rev
                FROM transactions WHERE brand_id = $1 AND transaction_date::date = CURRENT_DATE - 1`, [brandId]),
      db.query(`SELECT COUNT(*) AS txn, COALESCE(SUM(quantity_sold * selling_price),0) AS rev,
                       COUNT(DISTINCT store_id) AS stores, COUNT(DISTINCT sku) AS skus
                FROM transactions WHERE brand_id = $1 AND transaction_date >= date_trunc('month', CURRENT_DATE)`, [brandId])
    ]);
    return { today: today.rows[0], yesterday: yesterday.rows[0], month: month.rows[0] };
  }

  async getSalesTrends(brandId: string) {
    const result = await db.query(`
      SELECT transaction_date::date AS date, COUNT(*) AS transactions,
             SUM(quantity_sold * selling_price) AS revenue, SUM(quantity_sold) AS qty
      FROM transactions WHERE brand_id = $1 AND transaction_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY date ORDER BY date DESC`, [brandId]);
    return result.rows;
  }

  async getAnalyticsSummary(brandId: string) {
    const result = await db.query(`
      SELECT COUNT(*) AS total_transactions,
             COALESCE(SUM(quantity_sold * selling_price),0) AS total_revenue,
             COALESCE(AVG(selling_price),0) AS avg_price,
             COUNT(DISTINCT store_id) AS total_stores,
             COUNT(DISTINCT sku) AS total_skus,
             MIN(transaction_date) AS first_transaction,
             MAX(transaction_date) AS last_transaction
      FROM transactions WHERE brand_id = $1`, [brandId]);
    return result.rows[0];
  }

  async refreshViews() {
    try {
      await db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY daily_transaction_summary');
      return { success: true, refreshed_at: new Date().toISOString() };
    } catch {
      return { success: false, message: 'Materialized view may not exist yet' };
    }
  }
}

export const analyticsService = new AnalyticsService();
