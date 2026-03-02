import postgres from 'postgres';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

config({ path: '.env' });

const connectionString = process.env.DATABASE_URL ||
  'postgres://woke_user:woke_password_2024@localhost:5432/woke_portal';

async function runMigrations() {
  console.log('=== Running Database Migrations ===\n');

  const sql = postgres(connectionString, { max: 1 });

  try {
    // Ensure schema_migrations table exists
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Get already-applied migrations
    const applied = await sql`SELECT name FROM schema_migrations ORDER BY id`;
    const appliedSet = new Set(applied.map((r: any) => r.name));

    // Read migration files
    const migrationsDir = path.join(process.cwd(), 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found.');
      await sql.end();
      process.exit(0);
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let ran = 0;
    for (const file of files) {
      const name = file.replace('.sql', '');
      if (appliedSet.has(name)) {
        console.log(`  [SKIP] ${name} (already applied)`);
        continue;
      }

      console.log(`  [RUN]  ${name}...`);
      const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await sql.unsafe(sqlContent);
      console.log(`         Done.`);
      ran++;
    }

    console.log(`\n=== Migrations complete (${ran} applied, ${appliedSet.size} previously applied) ===`);
    await sql.end();
    process.exit(0);
  } catch (error: any) {
    console.error('Migration failed:', error.message || error);
    await sql.end();
    process.exit(1);
  }
}

runMigrations();
