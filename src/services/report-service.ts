import ExcelJS from 'exceljs';
import { db, brandQuery } from '../config/database.js';
import { sendReportEmail } from './email-service.js';
import { logger } from '../lib/logger.js';

export const reportService = {
  async generateDailySummary(brandId: string, date?: string): Promise<Buffer> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const wb = new ExcelJS.Workbook();

    // Sheet 1: Transaction summary
    const txSheet = wb.addWorksheet('Transactions');
    txSheet.columns = [
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Product', key: 'item_name', width: 30 },
      { header: 'Store', key: 'store_name', width: 20 },
      { header: 'Qty Sold', key: 'quantity_sold', width: 12 },
      { header: 'Unit Price', key: 'selling_price', width: 12 },
      { header: 'Total', key: 'total_amount', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    const txRes = await brandQuery(brandId, `
      SELECT t.sku, t.item_name, s.name AS store_name, t.quantity_sold, t.selling_price, t.total_amount, t.status
      FROM transactions t
      LEFT JOIN stores s ON s.id = t.store_id
      WHERE t.brand_id = $1 AND DATE(t.transaction_date) = $2
      ORDER BY t.transaction_date DESC
    `, [brandId, targetDate]);

    txRes.rows.forEach((r: any) => txSheet.addRow(r));

    // Sheet 2: Inventory snapshot
    const invSheet = wb.addWorksheet('Inventory');
    invSheet.columns = [
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Product', key: 'item_name', width: 30 },
      { header: 'Stock In', key: 'total_stock_in', width: 12 },
      { header: 'Stock Out', key: 'total_stock_out', width: 12 },
      { header: 'Total Sold', key: 'total_sold', width: 12 },
      { header: 'Available', key: 'available_stock', width: 12 },
      { header: 'Unit Price', key: 'unit_selling_price', width: 12 },
    ];

    const invRes = await brandQuery(brandId, `
      SELECT sku, item_name, total_stock_in, total_stock_out, total_sold, available_stock, unit_selling_price
      FROM inventory_summary WHERE brand_id = $1 ORDER BY sku
    `, [brandId]);

    invRes.rows.forEach((r: any) => invSheet.addRow(r));

    // Style headers
    [txSheet, invSheet].forEach(sheet => {
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  },

  async generateWeeklySummary(brandId: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Weekly Summary');

    sheet.columns = [
      { header: 'Date', key: 'day', width: 15 },
      { header: 'Transactions', key: 'transaction_count', width: 15 },
      { header: 'Total Qty', key: 'total_quantity', width: 12 },
      { header: 'Revenue', key: 'total_revenue', width: 15 },
      { header: 'Avg Price', key: 'avg_price', width: 12 },
    ];

    const res = await brandQuery(brandId, `
      SELECT day::date, transaction_count, total_quantity, total_revenue, avg_price
      FROM daily_transaction_summary
      WHERE brand_id = $1 AND day >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY day DESC
    `, [brandId]);

    res.rows.forEach((r: any) => sheet.addRow(r));

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  },

  async generateInventorySnapshot(brandId: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Inventory Snapshot');

    sheet.columns = [
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Product', key: 'item_name', width: 30 },
      { header: 'Category', key: 'category', width: 15 },
      { header: 'Cost', key: 'cost_price', width: 12 },
      { header: 'Sell Price', key: 'unit_selling_price', width: 12 },
      { header: 'Stock In', key: 'total_stock_in', width: 12 },
      { header: 'Sold', key: 'total_sold', width: 12 },
      { header: 'Available', key: 'available_stock', width: 12 },
    ];

    const res = await brandQuery(brandId, `
      SELECT i.sku, i.item_name, p.category, p.cost_price, i.unit_selling_price,
             i.total_stock_in, i.total_sold, i.available_stock
      FROM inventory_summary i
      LEFT JOIN products p ON p.brand_id = i.brand_id AND p.sku = i.sku
      WHERE i.brand_id = $1 ORDER BY i.sku
    `, [brandId]);

    res.rows.forEach((r: any) => sheet.addRow(r));

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  },

  async processScheduledReports() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const dayOfMonth = now.getDate();

    try {
      // Get all active scheduled reports
      const reports = await db.query(
        `SELECT sr.*, b.name AS brand_name, bo.email AS owner_email
         FROM scheduled_reports sr
         JOIN brands b ON b.id = sr.brand_id AND b.is_active = true
         JOIN brand_owners bo ON bo.id = sr.owner_id AND bo.is_active = true
         WHERE sr.is_active = true`
      );

      for (const report of reports.rows) {
        // Check if this report should run today
        if (report.schedule === 'weekly' && dayOfWeek !== 1) continue; // Monday only
        if (report.schedule === 'monthly' && dayOfMonth !== 1) continue; // 1st only

        try {
          let buffer: Buffer;
          let filename: string;

          switch (report.report_type) {
            case 'daily_summary':
              buffer = await this.generateDailySummary(report.brand_id);
              filename = `daily-summary-${now.toISOString().split('T')[0]}.xlsx`;
              break;
            case 'weekly_summary':
              buffer = await this.generateWeeklySummary(report.brand_id);
              filename = `weekly-summary-${now.toISOString().split('T')[0]}.xlsx`;
              break;
            case 'inventory_snapshot':
              buffer = await this.generateInventorySnapshot(report.brand_id);
              filename = `inventory-${now.toISOString().split('T')[0]}.xlsx`;
              break;
            default:
              buffer = await this.generateDailySummary(report.brand_id);
              filename = `report-${now.toISOString().split('T')[0]}.xlsx`;
          }

          // Send to all recipients
          const recipients = report.recipients?.length > 0 ? report.recipients : [report.owner_email];
          for (const email of recipients) {
            await sendReportEmail(email, report.brand_name, report.name, buffer, filename);
          }

          await db.query('UPDATE scheduled_reports SET last_sent_at = NOW() WHERE id = $1', [report.id]);
          logger.info(`[Reports] Sent ${report.name} for brand ${report.brand_id}`);
        } catch (err: any) {
          logger.error(`[Reports] Failed to generate ${report.name}: ${err.message}`);
        }
      }
    } catch (err: any) {
      logger.error(`[Reports] Processing error: ${err.message}`);
    }
  },

  // CRUD
  async list(brandId: string) {
    const result = await db.query(
      'SELECT * FROM scheduled_reports WHERE brand_id = $1 ORDER BY created_at DESC',
      [brandId]
    );
    return result.rows;
  },

  async create(brandId: string, ownerId: string, data: { name: string; reportType: string; schedule: string; format?: string; recipients?: string[] }) {
    const result = await db.query(
      `INSERT INTO scheduled_reports (brand_id, owner_id, name, report_type, schedule, format, recipients)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [brandId, ownerId, data.name, data.reportType, data.schedule, data.format || 'xlsx', data.recipients || []]
    );
    return result.rows[0];
  },

  async delete(id: string, brandId: string) {
    await db.query('DELETE FROM scheduled_reports WHERE id = $1 AND brand_id = $2', [id, brandId]);
  },
};
