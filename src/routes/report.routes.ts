import { Hono } from 'hono';
import { reportService } from '../services/report-service.js';

const reports = new Hono();

function getBrandId(c: any): string {
  const id = c.get('brandId');
  if (!id) throw new Error('Brand context required');
  return id;
}

function getOwnerId(c: any): string {
  const id = c.get('ownerId');
  if (!id) throw new Error('Authentication required');
  return id;
}

// GET /api/reports — list scheduled reports
reports.get('/', async (c) => {
  const brandId = getBrandId(c);
  const data = await reportService.list(brandId);
  return c.json({ success: true, data });
});

// POST /api/reports — create scheduled report
reports.post('/', async (c) => {
  const brandId = getBrandId(c);
  const ownerId = getOwnerId(c);
  const body = await c.req.json();
  if (!body.name || !body.reportType || !body.schedule) {
    return c.json({ success: false, error: 'name, reportType, and schedule are required' }, 400);
  }
  const report = await reportService.create(brandId, ownerId, body);
  return c.json({ success: true, data: report }, 201);
});

// DELETE /api/reports/:id
reports.delete('/:id', async (c) => {
  const brandId = getBrandId(c);
  await reportService.delete(c.req.param('id'), brandId);
  return c.json({ success: true, message: 'Scheduled report deleted' });
});

// POST /api/reports/generate/daily — generate and download daily report now
reports.post('/generate/daily', async (c) => {
  const brandId = getBrandId(c);
  const { date } = await c.req.json().catch(() => ({ date: undefined }));
  const buffer = await reportService.generateDailySummary(brandId, date);
  const filename = `daily-summary-${date || new Date().toISOString().split('T')[0]}.xlsx`;

  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  return c.body(new Uint8Array(buffer));
});

// POST /api/reports/generate/weekly
reports.post('/generate/weekly', async (c) => {
  const brandId = getBrandId(c);
  const buffer = await reportService.generateWeeklySummary(brandId);
  const filename = `weekly-summary-${new Date().toISOString().split('T')[0]}.xlsx`;

  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  return c.body(new Uint8Array(buffer));
});

// POST /api/reports/generate/inventory
reports.post('/generate/inventory', async (c) => {
  const brandId = getBrandId(c);
  const buffer = await reportService.generateInventorySnapshot(brandId);
  const filename = `inventory-${new Date().toISOString().split('T')[0]}.xlsx`;

  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  return c.body(new Uint8Array(buffer));
});

export { reports as reportRoutes };
