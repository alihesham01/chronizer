import { db, brandQuery } from '../config/database.js';
import { sendNotificationEmail } from './email-service.js';
import { logger } from '../lib/logger.js';

export type NotificationType = 'scraper_failure' | 'low_stock' | 'sales_anomaly' | 'team_invite' | 'report_ready' | 'system' | 'info';

interface CreateNotificationOpts {
  brandId: string;
  ownerId?: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  sendEmail?: boolean;
}

export const notificationService = {
  async create(opts: CreateNotificationOpts): Promise<string> {
    const { brandId, ownerId, type, title, message, metadata, sendEmail: shouldEmail } = opts;

    const result = await db.query(
      `INSERT INTO notifications (brand_id, owner_id, type, title, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [brandId, ownerId || null, type, title, message, JSON.stringify(metadata || {})]
    );

    const notifId = result.rows[0].id;

    // Send email if requested
    if (shouldEmail !== false) {
      try {
        // Get recipient email(s)
        let emails: string[] = [];
        if (ownerId) {
          const ownerRes = await db.query('SELECT email FROM brand_owners WHERE id = $1', [ownerId]);
          if (ownerRes.rows.length > 0) emails.push(ownerRes.rows[0].email);
        } else {
          // Send to all owners of this brand
          const ownersRes = await db.query(
            `SELECT email FROM brand_owners WHERE brand_id = $1 AND is_active = true AND role IN ('owner', 'admin')`,
            [brandId]
          );
          emails = ownersRes.rows.map((r: any) => r.email);
        }

        // Get brand name
        const brandRes = await db.query('SELECT name FROM brands WHERE id = $1', [brandId]);
        const brandName = brandRes.rows[0]?.name || 'Chronizer';

        for (const email of emails) {
          const sent = await sendNotificationEmail(email, title, message, brandName);
          if (sent) {
            await db.query('UPDATE notifications SET email_sent = true WHERE id = $1', [notifId]);
          }
        }
      } catch (err: any) {
        logger.error(`[Notification] Email failed for notif ${notifId}: ${err.message}`);
      }
    }

    return notifId;
  },

  async getForOwner(ownerId: string, brandId: string, limit = 50, unreadOnly = false) {
    const unreadFilter = unreadOnly ? 'AND n.is_read = false' : '';
    const result = await brandQuery(brandId, `
      SELECT n.* FROM notifications n
      WHERE n.brand_id = $1 AND (n.owner_id = $2 OR n.owner_id IS NULL) ${unreadFilter}
      ORDER BY n.created_at DESC LIMIT $3
    `, [brandId, ownerId, limit]);
    return result.rows;
  },

  async markRead(notifId: string, ownerId: string) {
    await db.query('UPDATE notifications SET is_read = true WHERE id = $1 AND owner_id = $2', [notifId, ownerId]);
  },

  async markAllRead(ownerId: string, brandId: string) {
    await db.query(
      'UPDATE notifications SET is_read = true WHERE brand_id = $1 AND (owner_id = $2 OR owner_id IS NULL) AND is_read = false',
      [brandId, ownerId]
    );
  },

  async getUnreadCount(ownerId: string, brandId: string): Promise<number> {
    const result = await db.query(
      `SELECT COUNT(*) AS c FROM notifications
       WHERE brand_id = $1 AND (owner_id = $2 OR owner_id IS NULL) AND is_read = false`,
      [brandId, ownerId]
    );
    return parseInt(result.rows[0].c, 10);
  },

  // Notify about scraper failure
  async scraperFailure(brandId: string, groupName: string, errorMessage: string) {
    return this.create({
      brandId,
      type: 'scraper_failure',
      title: `Scraper Failed: ${groupName}`,
      message: `The daily scrape for <strong>${groupName}</strong> failed after all retry attempts.<br/><br/>Error: ${errorMessage}`,
      metadata: { groupName, error: errorMessage },
      sendEmail: true,
    });
  },

  // Notify about low stock
  async lowStock(brandId: string, sku: string, productName: string, currentStock: number, threshold: number) {
    return this.create({
      brandId,
      type: 'low_stock',
      title: `Low Stock Alert: ${productName}`,
      message: `<strong>${productName}</strong> (${sku}) has only <strong>${currentStock}</strong> units remaining, below your threshold of ${threshold}.`,
      metadata: { sku, productName, currentStock, threshold },
      sendEmail: true,
    });
  },
};
