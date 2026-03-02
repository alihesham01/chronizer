import { Hono } from 'hono';
import { webhookService } from '../services/webhook-service.js';

const webhooks = new Hono();

function getBrandId(c: any): string {
  const id = c.get('brandId');
  if (!id) throw new Error('Brand context required');
  return id;
}

// GET /api/webhooks — list webhooks
webhooks.get('/', async (c) => {
  const brandId = getBrandId(c);
  const data = await webhookService.listForBrand(brandId);
  return c.json({ success: true, data });
});

// POST /api/webhooks — create webhook
webhooks.post('/', async (c) => {
  const brandId = getBrandId(c);
  const { url, events } = await c.req.json();
  if (!url || !events?.length) {
    return c.json({ success: false, error: 'url and events[] are required' }, 400);
  }
  const hook = await webhookService.create(brandId, url, events);
  return c.json({ success: true, data: hook }, 201);
});

// DELETE /api/webhooks/:id
webhooks.delete('/:id', async (c) => {
  const brandId = getBrandId(c);
  await webhookService.delete(c.req.param('id'), brandId);
  return c.json({ success: true, message: 'Webhook deleted' });
});

// GET /api/webhooks/:id/deliveries
webhooks.get('/:id/deliveries', async (c) => {
  const data = await webhookService.getDeliveries(c.req.param('id'));
  return c.json({ success: true, data });
});

export { webhooks as webhookRoutes };
