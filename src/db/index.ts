import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// Connection pool configuration
const connectionString = process.env.DATABASE_URL || 
  'postgres://chronizer_user:chronizer_pass@localhost:5432/chronizer';

// Create postgres client with connection pooling
const client = postgres(connectionString, {
  max: Number(process.env.DB_POOL_SIZE) || 20,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Create Drizzle instance
export const db = drizzle(client, { schema });

// Export schema for use in routes
export * from './schema.js';
export { schema };

// Health check function
export async function checkDbHealth() {
  try {
    await client`SELECT 1`;
    return { status: 'healthy', timestamp: new Date().toISOString() };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await client.end();
});
