import { Hono } from 'hono';
import { db } from '../config/database.js';
import type { Context } from 'hono';

const notifications = new Hono();

// GET /api/notifications - Get current user's notifications
notifications.get('/', async (c: Context) => {
  const ownerId = c.get('ownerId');
  if (!ownerId) return c.json({ success: false, error: 'Not authenticated' }, 401);

  try {
    const result = await db.query(
      `SELECT * FROM notifications WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [ownerId]
    );
    const unreadCount = await db.query(
      `SELECT COUNT(*) as c FROM notifications WHERE owner_id = $1 AND is_read = false`,
      [ownerId]
    );
    return c.json({ success: true, data: result.rows, unreadCount: parseInt(unreadCount.rows[0].c) });
  } catch {
    return c.json({ success: true, data: [], unreadCount: 0 });
  }
});

// PUT /api/notifications/:id/read - Mark a notification as read
notifications.put('/:id/read', async (c: Context) => {
  const ownerId = c.get('ownerId');
  if (!ownerId) return c.json({ success: false, error: 'Not authenticated' }, 401);

  const { id } = c.req.param();
  try {
    await db.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND owner_id = $2`,
      [id, ownerId]
    );
    return c.json({ success: true });
  } catch {
    return c.json({ success: false, error: 'Failed to mark as read' }, 500);
  }
});

// PUT /api/notifications/read-all - Mark all notifications as read
notifications.put('/read-all', async (c: Context) => {
  const ownerId = c.get('ownerId');
  if (!ownerId) return c.json({ success: false, error: 'Not authenticated' }, 401);

  try {
    await db.query(
      `UPDATE notifications SET is_read = true WHERE owner_id = $1 AND is_read = false`,
      [ownerId]
    );
    return c.json({ success: true });
  } catch {
    return c.json({ success: false, error: 'Failed to mark all as read' }, 500);
  }
});

export { notifications as notificationsRoutes };
