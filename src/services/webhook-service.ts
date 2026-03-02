import crypto from 'crypto';
import { db } from '../config/database.js';
import { logger } from '../lib/logger.js';

export type WebhookEvent = 'transaction.created' | 'stock_movement.created' | 'scraper.completed' | 'scraper.failed' | 'alert.triggered' | 'report.generated';

export const webhookService = {
  async fire(brandId: string, event: WebhookEvent, payload: Record<string, any>) {
    try {
      const hooks = await db.query(
        `SELECT id, url, secret FROM webhooks WHERE brand_id = $1 AND is_active = true AND $2 = ANY(events)`,
        [brandId, event]
      );

      for (const hook of hooks.rows) {
        this.deliver(hook.id, hook.url, hook.secret, event, payload).catch((err) => {
          logger.error(`[Webhook] Delivery failed for hook ${hook.id}: ${err.message}`);
        });
      }
    } catch (err: any) {
      logger.error(`[Webhook] Fire error: ${err.message}`);
    }
  },

  async deliver(webhookId: string, url: string, secret: string | null, event: string, payload: Record<string, any>) {
    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (secret) {
      const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
      headers['X-Chronizer-Signature'] = `sha256=${sig}`;
    }

    try {
      const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });

      await db.query(
        `INSERT INTO webhook_deliveries (webhook_id, event, payload, response_status)
         VALUES ($1, $2, $3, $4)`,
        [webhookId, event, JSON.stringify(payload), res.status]
      );

      await db.query(
        `UPDATE webhooks SET last_triggered_at = NOW(), last_status_code = $2, failure_count = CASE WHEN $2 < 400 THEN 0 ELSE failure_count + 1 END WHERE id = $1`,
        [webhookId, res.status]
      );

      // Disable webhook after 10 consecutive failures
      if (res.status >= 400) {
        const hook = await db.query('SELECT failure_count FROM webhooks WHERE id = $1', [webhookId]);
        if (hook.rows[0]?.failure_count >= 10) {
          await db.query('UPDATE webhooks SET is_active = false WHERE id = $1', [webhookId]);
          logger.warn(`[Webhook] Disabled webhook ${webhookId} after 10 failures`);
        }
      }
    } catch (err: any) {
      await db.query(
        `INSERT INTO webhook_deliveries (webhook_id, event, payload, response_status, response_body)
         VALUES ($1, $2, $3, 0, $4)`,
        [webhookId, event, JSON.stringify(payload), err.message]
      );
      await db.query(
        `UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = $1`,
        [webhookId]
      );
    }
  },

  async listForBrand(brandId: string) {
    const result = await db.query(
      'SELECT id, url, events, is_active, last_triggered_at, last_status_code, failure_count, created_at FROM webhooks WHERE brand_id = $1 ORDER BY created_at DESC',
      [brandId]
    );
    return result.rows;
  },

  async create(brandId: string, url: string, events: string[]) {
    const secret = crypto.randomBytes(32).toString('hex');
    const result = await db.query(
      `INSERT INTO webhooks (brand_id, url, events, secret) VALUES ($1, $2, $3, $4) RETURNING id, url, events, secret, is_active, created_at`,
      [brandId, url, events, secret]
    );
    return result.rows[0];
  },

  async delete(webhookId: string, brandId: string) {
    await db.query('DELETE FROM webhooks WHERE id = $1 AND brand_id = $2', [webhookId, brandId]);
  },

  async getDeliveries(webhookId: string, limit = 20) {
    const result = await db.query(
      'SELECT id, event, response_status, delivered_at FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY delivered_at DESC LIMIT $2',
      [webhookId, limit]
    );
    return result.rows;
  },
};
