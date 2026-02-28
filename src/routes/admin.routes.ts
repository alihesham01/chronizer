import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { db } from '../config/database.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { Context } from 'hono';

const admin = new Hono();
const INVITE_EXPIRY_MINUTES = 10;

// ─── Admin Middleware ────────────────────────────────────────────
async function requireAdmin(c: Context, next: () => Promise<void>) {
  const ownerId = c.get('ownerId');
  if (!ownerId) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const result = await db.query(
    'SELECT is_admin FROM brand_owners WHERE id = $1 AND is_active = true',
    [ownerId]
  );

  if (result.rows.length === 0 || !result.rows[0].is_admin) {
    throw new HTTPException(403, { message: 'Admin access required' });
  }

  await next();
}

admin.use('/*', requireAdmin);

// ═══════════════════════════════════════════════════════════════
// SYSTEM STATS — cross-account totals + activity
// ═══════════════════════════════════════════════════════════════
admin.get('/stats', async (c) => {
  try {
    const [brands, owners, transactions, products, stores, stockMoves] = await Promise.all([
      db.query("SELECT COUNT(*) as count FROM brands WHERE is_active = true AND subdomain != 'admin'"),
      db.query("SELECT COUNT(*) as count FROM brand_owners WHERE is_active = true AND is_admin = false"),
      db.query('SELECT COUNT(*) as count FROM transactions'),
      db.query('SELECT COUNT(*) as count FROM products WHERE is_active = true'),
      db.query('SELECT COUNT(*) as count FROM stores WHERE is_active = true'),
      db.query('SELECT COUNT(*) as count FROM stock_movements'),
    ]);

    const recentTxns = await db.query(`
      SELECT DATE(transaction_date) as date, COUNT(*) as count, COALESCE(SUM(total_amount),0) as total
      FROM transactions
      WHERE transaction_date >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(transaction_date)
      ORDER BY date DESC
    `);

    const topBrands = await db.query(`
      SELECT b.name, b.subdomain, COUNT(t.id) as transaction_count,
             COALESCE(SUM(t.total_amount), 0) as total_revenue
      FROM brands b
      LEFT JOIN transactions t ON t.brand_id = b.id
      WHERE b.is_active = true AND b.subdomain != 'admin'
      GROUP BY b.id, b.name, b.subdomain
      ORDER BY transaction_count DESC
      LIMIT 10
    `);

    const activeAccounts = await db.query(`
      SELECT bo.email, bo.first_name, bo.last_name, bo.created_at,
             b.name as brand_name, b.subdomain
      FROM brand_owners bo
      JOIN brands b ON b.id = bo.brand_id
      WHERE bo.is_active = true AND bo.is_admin = false
      ORDER BY bo.created_at DESC
      LIMIT 20
    `);

    // activity_log may not exist yet
    let recentActivity = { rows: [] as any[] };
    try {
      recentActivity = await db.query(`
        SELECT al.action, al.details, al.created_at,
               bo.email, bo.first_name, b.name as brand_name
        FROM activity_log al
        LEFT JOIN brand_owners bo ON bo.id = al.owner_id
        LEFT JOIN brands b ON b.id = al.brand_id
        ORDER BY al.created_at DESC
        LIMIT 30
      `);
    } catch { /* table may not exist */ }

    return c.json({
      success: true,
      data: {
        totals: {
          brands: parseInt(brands.rows[0].count),
          owners: parseInt(owners.rows[0].count),
          transactions: parseInt(transactions.rows[0].count),
          products: parseInt(products.rows[0].count),
          stores: parseInt(stores.rows[0].count),
          stockMovements: parseInt(stockMoves.rows[0].count),
        },
        recentTransactions: recentTxns.rows,
        topBrands: topBrands.rows,
        activeAccounts: activeAccounts.rows,
        recentActivity: recentActivity.rows,
      }
    });
  } catch (error: any) {
    console.error('Admin stats error:', error.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// SYSTEM STATUS — server health, DB stats
// ═══════════════════════════════════════════════════════════════
admin.get('/system', async (c) => {
  const dbStart = Date.now();
  await db.query('SELECT 1');
  const dbLatency = Date.now() - dbStart;

  const dbSize = await db.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`);
  const dbConnections = await db.query(`SELECT count(*) as active FROM pg_stat_activity WHERE state = 'active'`);

  const tableStats = await db.query(`
    SELECT relname as table_name,
           n_live_tup as row_count,
           pg_size_pretty(pg_total_relation_size(relid)) as total_size
    FROM pg_stat_user_tables
    ORDER BY n_live_tup DESC
  `);

  return c.json({
    success: true,
    data: {
      server: {
        uptime: process.uptime(),
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
        platform: process.platform,
        arch: process.arch,
      },
      database: {
        latencyMs: dbLatency,
        size: dbSize.rows[0].size,
        activeConnections: parseInt(dbConnections.rows[0].active),
        tables: tableStats.rows,
      },
      timestamp: new Date().toISOString(),
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// INVITE LINKS — one-time use, 10 minute expiry
// ═══════════════════════════════════════════════════════════════

// List all invite links
admin.get('/invite-links', async (c) => {
  try {
    const result = await db.query(`
      SELECT il.*,
             creator.email as created_by_email,
             used_owner.email as used_by_email,
             used_owner.first_name as used_by_name
      FROM invite_links il
      LEFT JOIN brand_owners creator ON creator.id = il.created_by
      LEFT JOIN brand_owners used_owner ON used_owner.id = il.used_by
      ORDER BY il.created_at DESC
      LIMIT 50
    `);

    return c.json({ success: true, data: result.rows });
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      return c.json({ success: true, data: [] });
    }
    throw error;
  }
});

// Generate a new invite link (one-time use, expires in 10 minutes)
admin.post('/invite-links', async (c) => {
  try {
    const ownerId = c.get('ownerId');
    const body = await c.req.json().catch(() => ({}));
    const { recipientEmail, notes } = body as { recipientEmail?: string; notes?: string };

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MINUTES * 60 * 1000).toISOString();

    const result = await db.query(
      `INSERT INTO invite_links (token, created_by, recipient_email, expires_at, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [token, ownerId, recipientEmail || null, expiresAt, notes || null]
    );

    const origin = process.env.FRONTEND_URL || 'http://localhost:3001';
    const inviteUrl = `${origin}/register?invite=${token}`;

    return c.json({
      success: true,
      data: {
        ...result.rows[0],
        inviteUrl,
        expiresInMinutes: INVITE_EXPIRY_MINUTES,
      }
    }, 201);
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      throw new HTTPException(503, { message: 'Invite system not initialized. Please run database migrations.' });
    }
    throw error;
  }
});

// Revoke an invite link
admin.delete('/invite-links/:id', async (c) => {
  try {
    const { id } = c.req.param();

    const result = await db.query(
      `UPDATE invite_links SET is_used = true, used_at = NOW()
       WHERE id = $1 AND is_used = false
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new HTTPException(404, { message: 'Invite link not found or already used' });
    }

    return c.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      throw new HTTPException(503, { message: 'Invite system not initialized. Please run database migrations.' });
    }
    throw error;
  }
});

// ═══════════════════════════════════════════════════════════════
// BRAND MANAGEMENT — all brands with detailed stats
// ═══════════════════════════════════════════════════════════════
admin.get('/brands', async (c) => {
  const result = await db.query(`
    SELECT b.*,
           (SELECT COUNT(*) FROM brand_owners WHERE brand_id = b.id AND is_active = true) as owner_count,
           (SELECT COUNT(*) FROM transactions WHERE brand_id = b.id) as transaction_count,
           (SELECT COALESCE(SUM(total_amount),0) FROM transactions WHERE brand_id = b.id) as total_revenue,
           (SELECT COUNT(*) FROM products WHERE brand_id = b.id AND is_active = true) as product_count,
           (SELECT COUNT(*) FROM stores WHERE brand_id = b.id AND is_active = true) as store_count
    FROM brands b
    WHERE b.subdomain != 'admin'
    ORDER BY b.created_at DESC
  `);

  return c.json({ success: true, data: result.rows });
});

// ═══════════════════════════════════════════════════════════════
// CROSS-ACCOUNT DATA — admin sees ALL data across ALL brands
// ═══════════════════════════════════════════════════════════════

// All transactions across all brands
admin.get('/all-transactions', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
  const offset = (page - 1) * limit;

  const [countResult, dataResult] = await Promise.all([
    db.query('SELECT COUNT(*) as total FROM transactions'),
    db.query(`
      SELECT t.*, b.name as brand_name, b.subdomain,
             s.name as store_name
      FROM transactions t
      JOIN brands b ON b.id = t.brand_id
      LEFT JOIN stores s ON s.id = t.store_id
      ORDER BY t.transaction_date DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset])
  ]);

  return c.json({
    success: true,
    data: dataResult.rows,
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].total),
      totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
    }
  });
});

// All products across all brands
admin.get('/all-products', async (c) => {
  const result = await db.query(`
    SELECT p.*, b.name as brand_name, b.subdomain
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.is_active = true
    ORDER BY p.created_at DESC
    LIMIT 200
  `);

  return c.json({ success: true, data: result.rows });
});

// All stores across all brands
admin.get('/all-stores', async (c) => {
  const result = await db.query(`
    SELECT s.*, b.name as brand_name, b.subdomain
    FROM stores s
    JOIN brands b ON b.id = s.brand_id
    WHERE s.is_active = true
    ORDER BY s.created_at DESC
    LIMIT 200
  `);

  return c.json({ success: true, data: result.rows });
});

// All users/owners across all brands
admin.get('/all-users', async (c) => {
  const result = await db.query(`
    SELECT bo.id, bo.email, bo.first_name, bo.last_name, bo.is_active,
           bo.last_login, bo.last_active, bo.created_at, bo.is_admin,
           b.name as brand_name, b.subdomain
    FROM brand_owners bo
    JOIN brands b ON b.id = bo.brand_id
    WHERE bo.is_admin = false
    ORDER BY bo.created_at DESC
  `);

  return c.json({ success: true, data: result.rows });
});

// ═══════════════════════════════════════════════════════════════
// BRAND DRILL-DOWN — view a specific brand's full data
// ═══════════════════════════════════════════════════════════════

// Get single brand details
admin.get('/brands/:brandId', async (c) => {
  const { brandId } = c.req.param();
  const result = await db.query(
    `SELECT b.*,
           (SELECT COUNT(*) FROM brand_owners WHERE brand_id = b.id AND is_active = true) as owner_count,
           (SELECT COUNT(*) FROM transactions WHERE brand_id = b.id) as transaction_count,
           (SELECT COALESCE(SUM(total_amount),0) FROM transactions WHERE brand_id = b.id) as total_revenue,
           (SELECT COUNT(*) FROM products WHERE brand_id = b.id AND is_active = true) as product_count,
           (SELECT COUNT(*) FROM stores WHERE brand_id = b.id AND is_active = true) as store_count,
           (SELECT COUNT(*) FROM stock_movements WHERE brand_id = b.id) as stock_move_count
    FROM brands b WHERE b.id = $1`,
    [brandId]
  );
  if (result.rows.length === 0) throw new HTTPException(404, { message: 'Brand not found' });
  return c.json({ success: true, data: result.rows[0] });
});

// Get a brand's products
admin.get('/brands/:brandId/products', async (c) => {
  const { brandId } = c.req.param();
  const result = await db.query(
    `SELECT * FROM products WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 500`,
    [brandId]
  );
  return c.json({ success: true, data: result.rows });
});

// Get a brand's stores
admin.get('/brands/:brandId/stores', async (c) => {
  const { brandId } = c.req.param();
  const result = await db.query(
    `SELECT * FROM stores WHERE brand_id = $1 ORDER BY created_at DESC`,
    [brandId]
  );
  return c.json({ success: true, data: result.rows });
});

// Get a brand's transactions (paginated)
admin.get('/brands/:brandId/transactions', async (c) => {
  const { brandId } = c.req.param();
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
  const offset = (page - 1) * limit;

  const [countResult, dataResult] = await Promise.all([
    db.query('SELECT COUNT(*) as total FROM transactions WHERE brand_id = $1', [brandId]),
    db.query(
      `SELECT t.*, s.name as store_name
       FROM transactions t
       LEFT JOIN stores s ON s.id = t.store_id
       WHERE t.brand_id = $1
       ORDER BY t.transaction_date DESC
       LIMIT $2 OFFSET $3`,
      [brandId, limit, offset]
    )
  ]);

  return c.json({
    success: true,
    data: dataResult.rows,
    pagination: {
      page, limit,
      total: parseInt(countResult.rows[0].total),
      totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
    }
  });
});

// Get a brand's inventory
admin.get('/brands/:brandId/inventory', async (c) => {
  const { brandId } = c.req.param();
  try {
    const result = await db.query(
      `SELECT * FROM inventory_view WHERE brand_id = $1 ORDER BY item_name`,
      [brandId]
    );
    return c.json({ success: true, data: result.rows });
  } catch {
    return c.json({ success: true, data: [], message: 'Inventory view not available' });
  }
});

// Get a brand's owners
admin.get('/brands/:brandId/users', async (c) => {
  const { brandId } = c.req.param();
  const result = await db.query(
    `SELECT id, email, first_name, last_name, role, is_active, last_login, created_at
     FROM brand_owners WHERE brand_id = $1 ORDER BY created_at DESC`,
    [brandId]
  );
  return c.json({ success: true, data: result.rows });
});

// Toggle brand active/inactive
admin.put('/brands/:brandId/toggle', async (c) => {
  const { brandId } = c.req.param();
  const result = await db.query(
    `UPDATE brands SET is_active = NOT is_active WHERE id = $1 RETURNING id, name, is_active`,
    [brandId]
  );
  if (result.rows.length === 0) throw new HTTPException(404, { message: 'Brand not found' });
  return c.json({ success: true, data: result.rows[0] });
});

// ═══════════════════════════════════════════════════════════════
// ADMIN PASSWORD RESET — reset any user's password
// ═══════════════════════════════════════════════════════════════
admin.post('/reset-password', async (c) => {
  const body = await c.req.json();
  const { userId, newPassword } = body;

  if (!userId || !newPassword) throw new HTTPException(400, { message: 'userId and newPassword required' });
  if (newPassword.length < 8) throw new HTTPException(400, { message: 'Password must be at least 8 characters' });

  const user = await db.query('SELECT id, email FROM brand_owners WHERE id = $1', [userId]);
  if (user.rows.length === 0) throw new HTTPException(404, { message: 'User not found' });

  const hash = await bcrypt.hash(newPassword, 10);
  await db.query('UPDATE brand_owners SET password_hash = $1 WHERE id = $2', [hash, userId]);

  try {
    await db.query(
      `INSERT INTO activity_log (owner_id, action, details) VALUES ($1, 'admin_password_reset', $2)`,
      [c.get('ownerId'), JSON.stringify({ targetUser: user.rows[0].email })]
    );
  } catch { /* activity_log may not exist */ }

  return c.json({ success: true, message: `Password reset for ${user.rows[0].email}` });
});

// ═══════════════════════════════════════════════════════════════
// ACTIVITY LOG — audit trail viewer
// ═══════════════════════════════════════════════════════════════
admin.get('/activity-log', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
  const offset = (page - 1) * limit;

  try {
    const [countResult, dataResult] = await Promise.all([
      db.query('SELECT COUNT(*) as total FROM activity_log'),
      db.query(
        `SELECT al.*, bo.email, bo.first_name, bo.last_name, b.name as brand_name
         FROM activity_log al
         LEFT JOIN brand_owners bo ON bo.id = al.owner_id
         LEFT JOIN brands b ON b.id = al.brand_id
         ORDER BY al.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      )
    ]);

    return c.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        page, limit,
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
      }
    });
  } catch {
    return c.json({ success: true, data: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } });
  }
});

// ═══════════════════════════════════════════════════════════════
// DATA INTEGRITY CHECK — verify DB consistency
// ═══════════════════════════════════════════════════════════════
admin.get('/integrity-check', async (c) => {
  const issues: string[] = [];

  // 1. Orphaned transactions (brand_id doesn't exist)
  const orphanTxn = await db.query(
    `SELECT COUNT(*) as c FROM transactions t LEFT JOIN brands b ON b.id = t.brand_id WHERE b.id IS NULL`
  );
  if (parseInt(orphanTxn.rows[0].c) > 0) issues.push(`${orphanTxn.rows[0].c} orphaned transactions (missing brand)`);

  // 2. Orphaned products
  const orphanProd = await db.query(
    `SELECT COUNT(*) as c FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE b.id IS NULL`
  );
  if (parseInt(orphanProd.rows[0].c) > 0) issues.push(`${orphanProd.rows[0].c} orphaned products (missing brand)`);

  // 3. Orphaned stores
  const orphanStore = await db.query(
    `SELECT COUNT(*) as c FROM stores s LEFT JOIN brands b ON b.id = s.brand_id WHERE b.id IS NULL`
  );
  if (parseInt(orphanStore.rows[0].c) > 0) issues.push(`${orphanStore.rows[0].c} orphaned stores (missing brand)`);

  // 4. Transactions referencing non-existent stores
  const badStoreTxn = await db.query(
    `SELECT COUNT(*) as c FROM transactions t WHERE t.store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM stores s WHERE s.id = t.store_id)`
  );
  if (parseInt(badStoreTxn.rows[0].c) > 0) issues.push(`${badStoreTxn.rows[0].c} transactions referencing deleted stores`);

  // 5. Brand owners with no brand
  const orphanOwners = await db.query(
    `SELECT COUNT(*) as c FROM brand_owners bo LEFT JOIN brands b ON b.id = bo.brand_id WHERE b.id IS NULL`
  );
  if (parseInt(orphanOwners.rows[0].c) > 0) issues.push(`${orphanOwners.rows[0].c} orphaned brand owners (missing brand)`);

  // 6. Duplicate SKUs within same brand
  const dupSkus = await db.query(
    `SELECT brand_id, sku, COUNT(*) as c FROM products GROUP BY brand_id, sku HAVING COUNT(*) > 1`
  );
  if (dupSkus.rows.length > 0) issues.push(`${dupSkus.rows.length} duplicate SKU entries across brands`);

  // 7. DB size + table counts
  const dbSize = await db.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`);
  const tableCounts = await db.query(
    `SELECT relname as name, n_live_tup as rows FROM pg_stat_user_tables ORDER BY n_live_tup DESC`
  );

  return c.json({
    success: true,
    data: {
      healthy: issues.length === 0,
      issues,
      dbSize: dbSize.rows[0].size,
      tables: tableCounts.rows,
      checkedAt: new Date().toISOString()
    }
  });
});

export { admin as adminRoutes };
