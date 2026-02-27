import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { db } from '../config/database.js';

// Extend Hono context to include tenant info
declare module 'hono' {
  interface ContextVariableMap {
    brandId: string;
    brand: any;
    brandOwner: any;
  }
}

export interface TenantInfo {
  id: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  settings?: Record<string, any>;
}

/**
 * Extract tenant from subdomain or custom domain
 */
export function extractTenantFromHost(host: string): string | null {
  // Remove port if present
  const hostname = host.split(':')[0];
  
  // Check for custom domain first
  if (hostname !== 'localhost' && !hostname.endsWith('.chronizer.com')) {
    return hostname; // Custom domain
  }
  
  // Extract subdomain
  const parts = hostname.split('.');
  if (parts.length > 2 && parts[parts.length - 2] === 'chronizer' && parts[parts.length - 1] === 'com') {
    return parts[0]; // Subdomain
  }
  
  // For local development, check for brand.localhost
  if (parts.length === 2 && parts[1] === 'localhost') {
    return parts[0];
  }
  
  return null;
}

/**
 * Tenant identification middleware
 */
export const tenantMiddleware = async (c: Context, next: Next) => {
  const host = c.req.header('host') || '';
  const tenantIdentifier = extractTenantFromHost(host);
  
  // For public routes like /api/brand/login, don't require tenant
  const path = c.req.path;
  if (path.includes('/api/brand/login') || path.includes('/api/brand/register')) {
    await next();
    return;
  }
  
  if (!tenantIdentifier) {
    // For now, allow requests without tenant (for setup/admin)
    await next();
    return;
  }
  
  // Look up brand by subdomain or custom domain
  const brand = await getBrandByIdentifier(tenantIdentifier);
  
  if (!brand || !brand.is_active) {
    throw new HTTPException(404, { message: 'Brand not found' });
  }
  
  // Set tenant context
  c.set('brandId', brand.id);
  c.set('brand', brand);
  
  // Set database context for row-level security
  if (c.get('db')) {
    await c.get('db')`SELECT set_brand_context(${brand.id})`;
  }
  
  await next();
};

/**
 * Brand authentication middleware
 */
export const brandAuthMiddleware = async (c: Context, next: Next) => {
  const brandId = c.get('brandId');
  
  if (!brandId) {
    throw new HTTPException(401, { message: 'Brand authentication required' });
  }
  
  const authHeader = c.req.header('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Authorization token required' });
  }
  
  const token = authHeader.substring(7);
  
  // Verify JWT token and extract brand owner info
  const brandOwner = await verifyBrandToken(token, brandId);
  
  if (!brandOwner) {
    throw new HTTPException(401, { message: 'Invalid or expired token' });
  }
  
  c.set('brandOwner', brandOwner);
  
  // Update last login
  await updateLastLogin(brandOwner.id);
  
  await next();
};

/**
 * Get brand by subdomain or custom domain
 */
async function getBrandByIdentifier(identifier: string): Promise<TenantInfo | null> {
  const client = await db.connect();
  try {
    // Try subdomain first, then custom domain
    const result = await client.query(
      'SELECT id, name, subdomain, custom_domain, primary_color, secondary_color, settings, is_active FROM brands WHERE (subdomain = $1 OR custom_domain = $1) AND is_active = true',
      [identifier]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      subdomain: row.subdomain,
      customDomain: row.custom_domain,
      primaryColor: row.primary_color,
      secondaryColor: row.secondary_color,
      settings: row.settings
    };
  } finally {
    client.release();
  }
}

/**
 * Verify JWT token for brand owner
 */
async function verifyBrandToken(token: string, brandId: string): Promise<any> {
  try {
    // Verify JWT token
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    // Verify the token matches the current brand
    if (decoded.brandId !== brandId) {
      return null;
    }
    
    // Get brand owner from database
    const client = await db.connect();
    try {
      const result = await client.query(
        'SELECT id, brand_id, email, first_name, last_name FROM brand_owners WHERE id = $1 AND brand_id = $2 AND is_active = true',
        [decoded.ownerId, brandId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      return {
        id: row.id,
        brandId: row.brand_id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name
      };
    } finally {
      client.release();
    }
  } catch {
    return null;
  }
}

/**
 * Update last login timestamp
 */
async function updateLastLogin(ownerId: string): Promise<void> {
  const client = await db.connect();
  try {
    await client.query(
      'UPDATE brand_owners SET last_login = NOW() WHERE id = $1',
      [ownerId]
    );
  } catch (error) {
    console.error('Failed to update last login:', error);
  } finally {
    client.release();
  }
}

/**
 * Get current tenant from context
 */
export function getCurrentTenant(c: Context): TenantInfo | null {
  return c.get('brand') || null;
}

/**
 * Get current brand owner from context
 */
export function getCurrentBrandOwner(c: Context): any {
  return c.get('brandOwner') || null;
}

/**
 * Check if user has access to current brand
 */
export function hasBrandAccess(c: Context, brandId: string): boolean {
  const currentBrandId = c.get('brandId');
  return currentBrandId === brandId;
}
