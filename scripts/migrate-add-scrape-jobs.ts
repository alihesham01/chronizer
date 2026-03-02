import postgres from 'postgres';
import { config } from 'dotenv';

config({ path: '.env' });

const connectionString = process.env.DATABASE_URL ||
  'postgres://woke_user:woke_password_2024@localhost:5432/woke_portal';

async function migrate() {
  console.log('=== Add scrape_jobs Table Migration ===\n');

  const sql = postgres(connectionString, { max: 1 });

  try {
    // Check if table already exists
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'scrape_jobs'
      ) AS exists
    `;

    if (tableCheck[0].exists) {
      console.log('scrape_jobs table already exists. Nothing to do.');
      await sql.end();
      process.exit(0);
    }

    console.log('Creating scrape_jobs table...');
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS scrape_jobs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
          group_name VARCHAR(100) NOT NULL,
          job_type VARCHAR(20) NOT NULL CHECK (job_type IN ('initial', 'daily', 'manual')),
          status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
          transactions_inserted INTEGER DEFAULT 0,
          inventory_items INTEGER DEFAULT 0,
          error_message TEXT,
          started_at TIMESTAMPTZ DEFAULT NOW(),
          completed_at TIMESTAMPTZ,
          triggered_by VARCHAR(50) DEFAULT 'scheduler'
      );
      CREATE INDEX IF NOT EXISTS idx_scrape_jobs_brand ON scrape_jobs (brand_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs (brand_id, status);
    `);

    console.log('Done.\n');
    console.log('=== Migration complete ===\n');

    await sql.end();
    process.exit(0);
  } catch (error: any) {
    console.error('Migration failed:', error.message || error);
    await sql.end();
    process.exit(1);
  }
}

migrate();
