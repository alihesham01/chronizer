import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../config/database.js';

const auth = new Hono();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function signToken(payload: { brandId: string; ownerId: string; email: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Login schema
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

// Register schema
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  brandName: z.string().min(2),
  subdomain: z.string().min(3).max(63).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Subdomain must be lowercase alphanumeric with hyphens')
});

// POST /api/auth/login
auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const ownerResult = await db.query(
    `SELECT bo.id, bo.brand_id, bo.email, bo.password_hash, bo.first_name, bo.last_name,
            b.name AS brand_name, b.subdomain, b.primary_color, b.secondary_color, b.is_active AS brand_active
     FROM brand_owners bo
     JOIN brands b ON b.id = bo.brand_id
     WHERE bo.email = $1 AND bo.is_active = true`,
    [email.toLowerCase()]
  );

  if (ownerResult.rows.length === 0) {
    return c.json({ success: false, error: 'Invalid email or password' }, 401);
  }

  const owner = ownerResult.rows[0];

  if (!owner.brand_active) {
    return c.json({ success: false, error: 'Brand is deactivated' }, 403);
  }

  const valid = await bcrypt.compare(password, owner.password_hash);
  if (!valid) {
    return c.json({ success: false, error: 'Invalid email or password' }, 401);
  }

  // Update last_login
  await db.query('UPDATE brand_owners SET last_login = NOW() WHERE id = $1', [owner.id]);

  const token = signToken({ brandId: owner.brand_id, ownerId: owner.id, email: owner.email });

  // Check if user is admin
  const adminCheck = await db.query('SELECT is_admin FROM brand_owners WHERE id = $1', [owner.id]);
  const isAdmin = adminCheck.rows[0]?.is_admin || false;

  return c.json({
    success: true,
    data: {
      token,
      isAdmin,
      owner: {
        id: owner.id,
        email: owner.email,
        firstName: owner.first_name,
        lastName: owner.last_name
      },
      brand: {
        id: owner.brand_id,
        name: owner.brand_name,
        subdomain: owner.subdomain,
        primaryColor: owner.primary_color,
        secondaryColor: owner.secondary_color
      }
    }
  });
});

// POST /api/auth/verify-invite — validates invite token from URL
auth.post('/verify-invite', async (c) => {
  const { token: inviteToken } = await c.req.json();
  if (!inviteToken) {
    return c.json({ success: false, error: 'Invite token is required' }, 400);
  }

  const result = await db.query(
    `SELECT id, token, expires_at, is_used, recipient_email
     FROM invite_links
     WHERE token = $1`,
    [inviteToken.trim()]
  );

  if (result.rows.length === 0) {
    return c.json({ success: false, error: 'Invalid invite link' }, 400);
  }

  const invite = result.rows[0];
  if (invite.is_used) {
    return c.json({ success: false, error: 'This invite link has already been used' }, 400);
  }
  if (new Date(invite.expires_at) < new Date()) {
    return c.json({ success: false, error: 'This invite link has expired. Ask admin for a new one.' }, 400);
  }

  return c.json({ success: true, data: { valid: true, recipientEmail: invite.recipient_email } });
});

// POST /api/auth/register
const registerSchemaWithInvite = registerSchema.extend({
  inviteToken: z.string().min(1, 'Invite token is required')
});

auth.post('/register', zValidator('json', registerSchemaWithInvite), async (c) => {
  const { email, password, firstName, lastName, brandName, subdomain, inviteToken } = c.req.valid('json');
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Validate invite link token
    const inviteResult = await client.query(
      `SELECT id, expires_at, is_used, recipient_email
       FROM invite_links WHERE token = $1`,
      [inviteToken.trim()]
    );
    if (inviteResult.rows.length === 0) {
      return c.json({ success: false, error: 'Invalid invite link' }, 400);
    }
    const invite = inviteResult.rows[0];
    if (invite.is_used) {
      return c.json({ success: false, error: 'This invite link has already been used' }, 400);
    }
    if (new Date(invite.expires_at) < new Date()) {
      return c.json({ success: false, error: 'This invite link has expired. Ask admin for a new one.' }, 400);
    }
    // If recipient email was specified, enforce it
    if (invite.recipient_email && invite.recipient_email.toLowerCase() !== email.toLowerCase()) {
      return c.json({ success: false, error: 'This invite link was issued for a different email address' }, 400);
    }

    // Check subdomain
    const subCheck = await client.query('SELECT id FROM brands WHERE subdomain = $1', [subdomain]);
    if (subCheck.rows.length > 0) {
      return c.json({ success: false, error: 'Subdomain already taken' }, 409);
    }

    // Check email
    const emailCheck = await client.query('SELECT id FROM brand_owners WHERE email = $1', [email.toLowerCase()]);
    if (emailCheck.rows.length > 0) {
      return c.json({ success: false, error: 'Email already registered' }, 409);
    }

    // Create brand
    const brandResult = await client.query(
      `INSERT INTO brands (name, subdomain) VALUES ($1, $2) RETURNING id, name, subdomain, primary_color, secondary_color`,
      [brandName, subdomain]
    );
    const brand = brandResult.rows[0];

    // Create owner
    const passwordHash = await bcrypt.hash(password, 10);
    const ownerResult = await client.query(
      `INSERT INTO brand_owners (brand_id, email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, email, first_name, last_name`,
      [brand.id, email.toLowerCase(), passwordHash, firstName, lastName]
    );
    const owner = ownerResult.rows[0];

    // Mark invite link as used (one-time use)
    await client.query(
      'UPDATE invite_links SET is_used = true, used_by = $1, used_at = NOW() WHERE id = $2',
      [owner.id, invite.id]
    );

    // Log activity
    await client.query(
      `INSERT INTO activity_log (brand_id, owner_id, action, details)
       VALUES ($1, $2, 'account_created', $3)`,
      [brand.id, owner.id, JSON.stringify({ brandName, subdomain, email: email.toLowerCase() })]
    );

    await client.query('COMMIT');

    const token = signToken({ brandId: brand.id, ownerId: owner.id, email: owner.email });

    return c.json({
      success: true,
      data: {
        token,
        owner: {
          id: owner.id,
          email: owner.email,
          firstName: owner.first_name,
          lastName: owner.last_name
        },
        brand: {
          id: brand.id,
          name: brand.name,
          subdomain: brand.subdomain,
          primaryColor: brand.primary_color,
          secondaryColor: brand.secondary_color
        }
      }
    }, 201);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Registration error:', error);
    return c.json({ success: false, error: 'Registration failed' }, 500);
  } finally {
    client.release();
  }
});

// POST /api/auth/verify
auth.post('/verify', async (c) => {
  const authHeader = c.req.header('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'No token provided' }, 401);
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { brandId: string; ownerId: string; email: string };

    const result = await db.query(
      `SELECT bo.id, bo.email, bo.first_name, bo.last_name,
              b.id AS brand_id, b.name AS brand_name, b.subdomain
       FROM brand_owners bo
       JOIN brands b ON b.id = bo.brand_id
       WHERE bo.id = $1 AND bo.brand_id = $2 AND bo.is_active = true AND b.is_active = true`,
      [decoded.ownerId, decoded.brandId]
    );

    if (result.rows.length === 0) {
      return c.json({ success: false, error: 'Invalid token' }, 401);
    }

    const row = result.rows[0];
    return c.json({
      success: true,
      data: {
        owner: { id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name },
        brand: { id: row.brand_id, name: row.brand_name, subdomain: row.subdomain }
      }
    });
  } catch {
    return c.json({ success: false, error: 'Invalid or expired token' }, 401);
  }
});

// GET /api/auth/me - Get current user info
auth.get('/me', async (c) => {
  const authHeader = c.req.header('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { brandId: string; ownerId: string };

    const result = await db.query(
      `SELECT bo.id, bo.email, bo.first_name, bo.last_name, bo.role,
              b.id AS brand_id, b.name AS brand_name, b.subdomain, b.primary_color, b.secondary_color, b.settings
       FROM brand_owners bo
       JOIN brands b ON b.id = bo.brand_id
       WHERE bo.id = $1 AND bo.brand_id = $2 AND bo.is_active = true AND b.is_active = true`,
      [decoded.ownerId, decoded.brandId]
    );

    if (result.rows.length === 0) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    const row = result.rows[0];
    return c.json({
      success: true,
      data: {
        owner: { id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name, role: row.role },
        brand: { id: row.brand_id, name: row.brand_name, subdomain: row.subdomain, primaryColor: row.primary_color, secondaryColor: row.secondary_color, settings: row.settings }
      }
    });
  } catch {
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }
});

export { auth as authRoutes };
