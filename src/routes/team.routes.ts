import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from '../config/database.js';
import { getEnv } from '../config/env.js';
import { sendTeamInviteEmail } from '../services/email-service.js';

const team = new Hono();

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

// GET /api/team — list team members
team.get('/', async (c) => {
  const brandId = getBrandId(c);
  const result = await db.query(
    `SELECT id, email, first_name, last_name, role, is_active, last_login, created_at
     FROM brand_owners WHERE brand_id = $1 ORDER BY created_at`,
    [brandId]
  );
  return c.json({ success: true, data: result.rows });
});

// POST /api/team/invite — invite a team member
team.post('/invite', async (c) => {
  const brandId = getBrandId(c);
  const ownerId = getOwnerId(c);
  const { email, role } = await c.req.json();

  if (!email) return c.json({ success: false, error: 'Email is required' }, 400);
  if (!['admin', 'manager', 'viewer'].includes(role || '')) {
    return c.json({ success: false, error: 'Role must be admin, manager, or viewer' }, 400);
  }

  // Check inviter is owner or admin
  const inviter = await db.query(
    'SELECT role, first_name, last_name FROM brand_owners WHERE id = $1 AND brand_id = $2',
    [ownerId, brandId]
  );
  if (inviter.rows.length === 0 || !['owner', 'admin'].includes(inviter.rows[0].role)) {
    return c.json({ success: false, error: 'Only owners and admins can invite team members' }, 403);
  }

  // Check if email already exists in this brand
  const existing = await db.query(
    'SELECT id FROM brand_owners WHERE email = $1 AND brand_id = $2',
    [email.toLowerCase(), brandId]
  );
  if (existing.rows.length > 0) {
    return c.json({ success: false, error: 'User already exists in this brand' }, 409);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.query(
    `INSERT INTO team_invites (brand_id, invited_by, email, role, token, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [brandId, ownerId, email.toLowerCase(), role, token, expiresAt]
  );

  // Get brand name
  const brandRes = await db.query('SELECT name FROM brands WHERE id = $1', [brandId]);
  const brandName = brandRes.rows[0]?.name || 'Chronizer';
  const inviterName = `${inviter.rows[0].first_name} ${inviter.rows[0].last_name}`;

  await sendTeamInviteEmail(email, inviterName, brandName, role, token);

  return c.json({ success: true, message: `Invitation sent to ${email}` });
});

// POST /api/team/accept — accept a team invitation (public route with token)
team.post('/accept', async (c) => {
  const { token, password, firstName, lastName } = await c.req.json();
  if (!token || !password || !firstName) {
    return c.json({ success: false, error: 'Token, password, and firstName are required' }, 400);
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const invite = await client.query(
      `SELECT id, brand_id, email, role FROM team_invites
       WHERE token = $1 AND accepted_at IS NULL AND expires_at > NOW()`,
      [token]
    );
    if (invite.rows.length === 0) {
      return c.json({ success: false, error: 'Invalid or expired invitation' }, 400);
    }

    const inv = invite.rows[0];

    // Check if email already registered for this brand
    const existCheck = await client.query(
      'SELECT id FROM brand_owners WHERE email = $1 AND brand_id = $2',
      [inv.email, inv.brand_id]
    );
    if (existCheck.rows.length > 0) {
      return c.json({ success: false, error: 'User already exists in this brand' }, 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const ownerRes = await client.query(
      `INSERT INTO brand_owners (brand_id, email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, first_name, last_name, role`,
      [inv.brand_id, inv.email, passwordHash, firstName, lastName || '', inv.role]
    );

    await client.query('UPDATE team_invites SET accepted_at = NOW() WHERE id = $1', [inv.id]);
    await client.query('COMMIT');

    const owner = ownerRes.rows[0];
    const env = getEnv();
    const jwtToken = jwt.sign(
      { brandId: inv.brand_id, ownerId: owner.id, email: owner.email },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as any }
    );

    return c.json({
      success: true,
      data: {
        token: jwtToken,
        owner: { id: owner.id, email: owner.email, firstName: owner.first_name, lastName: owner.last_name, role: owner.role },
      }
    }, 201);
  } catch (err: any) {
    await client.query('ROLLBACK');
    return c.json({ success: false, error: 'Failed to accept invitation' }, 500);
  } finally {
    client.release();
  }
});

// GET /api/team/invites — list pending invitations
team.get('/invites', async (c) => {
  const brandId = getBrandId(c);
  const result = await db.query(
    `SELECT ti.id, ti.email, ti.role, ti.expires_at, ti.created_at,
            bo.first_name || ' ' || bo.last_name AS invited_by_name
     FROM team_invites ti
     JOIN brand_owners bo ON bo.id = ti.invited_by
     WHERE ti.brand_id = $1 AND ti.accepted_at IS NULL
     ORDER BY ti.created_at DESC`,
    [brandId]
  );
  return c.json({ success: true, data: result.rows });
});

// PUT /api/team/:id/role — change a team member's role
team.put('/:id/role', async (c) => {
  const brandId = getBrandId(c);
  const ownerId = getOwnerId(c);
  const memberId = c.req.param('id');
  const { role } = await c.req.json();

  if (!['admin', 'manager', 'viewer'].includes(role)) {
    return c.json({ success: false, error: 'Invalid role' }, 400);
  }

  // Check requester is owner
  const requester = await db.query('SELECT role FROM brand_owners WHERE id = $1 AND brand_id = $2', [ownerId, brandId]);
  if (requester.rows[0]?.role !== 'owner') {
    return c.json({ success: false, error: 'Only the brand owner can change roles' }, 403);
  }

  // Can't change own role
  if (memberId === ownerId) {
    return c.json({ success: false, error: 'Cannot change your own role' }, 400);
  }

  await db.query('UPDATE brand_owners SET role = $1 WHERE id = $2 AND brand_id = $3', [role, memberId, brandId]);
  return c.json({ success: true, message: 'Role updated' });
});

// DELETE /api/team/:id — remove a team member
team.delete('/:id', async (c) => {
  const brandId = getBrandId(c);
  const ownerId = getOwnerId(c);
  const memberId = c.req.param('id');

  if (memberId === ownerId) {
    return c.json({ success: false, error: 'Cannot remove yourself' }, 400);
  }

  const requester = await db.query('SELECT role FROM brand_owners WHERE id = $1 AND brand_id = $2', [ownerId, brandId]);
  if (!['owner', 'admin'].includes(requester.rows[0]?.role)) {
    return c.json({ success: false, error: 'Insufficient permissions' }, 403);
  }

  await db.query('UPDATE brand_owners SET is_active = false WHERE id = $1 AND brand_id = $2 AND role != $3', [memberId, brandId, 'owner']);
  return c.json({ success: true, message: 'Team member removed' });
});

export { team as teamRoutes };
