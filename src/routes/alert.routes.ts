import { Hono } from 'hono';
import { alertService } from '../services/alert-service.js';

const alerts = new Hono();

function getBrandId(c: any): string {
  const id = c.get('brandId');
  if (!id) throw new Error('Brand context required');
  return id;
}

// GET /api/alerts — list alert thresholds
alerts.get('/', async (c) => {
  const brandId = getBrandId(c);
  const data = await alertService.list(brandId);
  return c.json({ success: true, data });
});

// POST /api/alerts — create alert threshold
alerts.post('/', async (c) => {
  const brandId = getBrandId(c);
  const body = await c.req.json();
  if (!body.type || body.thresholdValue == null) {
    return c.json({ success: false, error: 'type and thresholdValue are required' }, 400);
  }
  const alert = await alertService.create(brandId, body);
  return c.json({ success: true, data: alert }, 201);
});

// DELETE /api/alerts/:id
alerts.delete('/:id', async (c) => {
  const brandId = getBrandId(c);
  await alertService.delete(c.req.param('id'), brandId);
  return c.json({ success: true, message: 'Alert threshold deleted' });
});

export { alerts as alertRoutes };
