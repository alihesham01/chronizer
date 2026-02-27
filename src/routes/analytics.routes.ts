import { Hono } from 'hono';
import { analyticsService } from '../services/analytics-service.js';
import { getBrandId } from '../lib/brand-context.js';

const app = new Hono();

app.get('/dashboard', async (c) => {
  const data = await analyticsService.getDashboardMetrics(getBrandId(c));
  return c.json(data);
});

app.get('/daily', async (c) => {
  const brandId = getBrandId(c);
  const { startDate, endDate, storeName } = c.req.query();
  const data = await analyticsService.getDailySummary(brandId, startDate, endDate, storeName);
  return c.json({ data });
});

app.get('/sku-performance', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const data = await analyticsService.getSKUPerformance(getBrandId(c), limit);
  return c.json({ data });
});

app.get('/store-performance', async (c) => {
  const data = await analyticsService.getStorePerformance(getBrandId(c));
  return c.json({ data });
});

app.get('/monthly-revenue', async (c) => {
  const months = parseInt(c.req.query('months') || '12');
  const data = await analyticsService.getMonthlyRevenue(getBrandId(c), months);
  return c.json({ data });
});

app.get('/top-skus', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');
  const data = await analyticsService.getTopSKUs(getBrandId(c), limit);
  return c.json({ data });
});

app.get('/sales-trends', async (c) => {
  const data = await analyticsService.getSalesTrends(getBrandId(c));
  return c.json({ data });
});

app.get('/summary', async (c) => {
  const data = await analyticsService.getAnalyticsSummary(getBrandId(c));
  return c.json({ data });
});

app.post('/refresh', async (c) => {
  const result = await analyticsService.refreshViews();
  return c.json(result);
});

export { app as analyticsRoutes };
