import { Pool, PoolClient } from 'pg';
import { config } from 'dotenv';

// Ensure environment is loaded
config();

let pool: Pool | null = null;

export function getDatabase(): Pool {
  if (!pool) {
    const connStr = process.env.DATABASE_URL;
    
    if (connStr) {
      console.log('Using DATABASE_URL:', connStr.replace(/:[^:]*@/, ':***@'));
      pool = new Pool({
        connectionString: connStr,
        max: parseInt(process.env.DB_POOL_SIZE || '20'),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
    } else {
      console.log('Using individual DB params:');
      console.log('DB_HOST:', process.env.DB_HOST);
      console.log('DB_USER:', process.env.DB_USER);
      console.log('DB_PASSWORD type:', typeof process.env.DB_PASSWORD);
      console.log('DB_PASSWORD value:', process.env.DB_PASSWORD ? '***' : 'undefined');
      pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'chronizer',
        user: process.env.DB_USER || 'chronizer_user',
        password: process.env.DB_PASSWORD,
        max: parseInt(process.env.DB_POOL_SIZE || '20'),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
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
