import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://woke_user:9b2bf7e48b4aa7da@localhost:5432/woke_portal'
});

/**
 * Script to refresh inventory snapshot
 * Can be run on a schedule (e.g., every 5 minutes)
 */
async function refreshInventory() {
  const client = await pool.connect();
  try {
    console.log(`[${new Date().toISOString}] Refreshing inventory snapshot...`);
    
    await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY inventory_snapshot');
    
    console.log(`[${new Date().toISOString}] ✅ Inventory snapshot refreshed successfully`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Failed to refresh inventory:`, error.message);
  } finally {
    client.release();
  }
}

// Run immediately if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  refreshInventory().then(() => process.exit(0));
}

// Export for use in other modules
export { refreshInventory };

// Optional: Set up interval for continuous refresh
// Uncomment below to refresh every 5 minutes
// setInterval(refreshInventory, 5 * 60 * 1000);
