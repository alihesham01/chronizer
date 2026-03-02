import { Pool, PoolClient } from 'pg';
import { config } from 'dotenv';

// Ensure environment is loaded
config();

let pool: Pool | null = null;

export function getDatabase(): Pool {
  if (!pool) {
    const connStr = process.env.DATABASE_URL;
    
    if (connStr) {
      pool = new Pool({
        connectionString: connStr,
        max: parseInt(process.env.DB_POOL_SIZE || '50'),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        statement_timeout: parseInt(process.env.QUERY_TIMEOUT || '30000'),
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
    } else {
      pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'chronizer',
        user: process.env.DB_USER || 'chronizer_user',
        password: process.env.DB_PASSWORD,
        max: parseInt(process.env.DB_POOL_SIZE || '50'),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        statement_timeout: parseInt(process.env.QUERY_TIMEOUT || '30000'),
      });
    }

    pool.on('error', (err) => {
      console.error('Database pool error:', err);
    });

    pool.query('SELECT NOW()')
      .then(() => console.log('Database connected'))
      .catch((err) => console.error('Database connection failed:', err.message));
  }

  return pool;
}

// Singleton pool
export const db = getDatabase();

// Helper: run a query directly on the pool
export async function query(text: string, params?: any[]) {
  return db.query(text, params);
}

// Helper: get a client for transactions
export async function getClient(): Promise<PoolClient> {
  return db.connect();
}

// Helper: run inside a transaction
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── RLS-aware helpers ──────────────────────────────────────────────
// Every query touching an RLS-enabled table MUST go through one of these
// so that SET LOCAL sets the brand context inside a transaction.

// Single query scoped to a brand (auto-wrapped in BEGIN/COMMIT)
export async function brandQuery(brandId: string, text: string, params?: any[]) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_brand_id', $1, true)", [brandId]);
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Single query with admin privileges (sees all brands)
export async function adminQuery(text: string, params?: any[]) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.is_admin', 'true', true)");
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Multi-query transaction scoped to a brand
export async function withBrandTransaction<T>(
  brandId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_brand_id', $1, true)", [brandId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Multi-query transaction with admin privileges
export async function withAdminTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.is_admin', 'true', true)");
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
