import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

export function getBrandId(c: Context): string {
  const brandId = c.get('brandId');
  if (!brandId) throw new HTTPException(401, { message: 'Brand context required' });
  return brandId;
}

export function getOwnerId(c: Context): string {
  const ownerId = c.get('ownerId');
  if (!ownerId) throw new HTTPException(401, { message: 'Authentication required' });
  return ownerId;
}
