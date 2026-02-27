import { db } from '../config/database.js';

export async function auditLog(
  brandId: string,
  ownerId: string | undefined,
  action: string,
  details?: Record<string, any>
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO activity_log (brand_id, owner_id, action, details)
       VALUES ($1, $2, $3, $4)`,
      [brandId, ownerId || null, action, details ? JSON.stringify(details) : null]
    );
  } catch {
    // Audit logging should never break the main flow
    console.error(`Audit log failed: ${action}`);
  }
}
