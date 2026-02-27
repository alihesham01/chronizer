import { Pool } from 'pg';
import { logger } from '../lib/logger.js';
import { getEnv } from '../config/env.js';

let pool: Pool | null = null;

export async function getConnection(): Promise<Pool> {
  if (!pool) {
    const config = getEnv();
    
    pool = new Pool({
      connectionString: config.DATABASE_URL || process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test the connection
    try {
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  return pool;
}

// Export db as alias for getConnection
export const db = {
  connect: async () => {
    const pool = await getConnection();
    return pool.connect();
  },
  query: async (text: string, params?: any[]) => {
    const pool = await getConnection();
    return pool.query(text, params);
  }
};

export async function closeConnection(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection closed');
  }
}

// Helper to execute queries
export async function query(text: string, params?: any[]): Promise<any> {
  const pool = await getConnection();
  const start = Date.now();
  
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      logger.warn(`Slow query (${duration}ms): ${text}`);
    }
    
    return res;
  } catch (error) {
    logger.error('Query error:', { text, params, error });
    throw error;
  }
}

// Transaction helper
export async function transaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const pool = await getConnection();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
