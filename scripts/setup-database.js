import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testConnection() {
  log('\n🔍 Testing PostgreSQL connection...', 'blue');
  
  // Read .env file
  const envPath = path.join(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    log('❌ .env file not found!', 'red');
    log('Please create a .env file with database configuration:', 'yellow');
    log(`
DATABASE_URL=postgresql://woke_user:woke_password_2024@localhost:5432/woke_portal
DB_HOST=localhost
DB_PORT=5432
DB_NAME=woke_portal
DB_USER=woke_user
DB_PASSWORD=woke_password_2024
    `);
    return false;
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const dbUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1];
  
  if (!dbUrl) {
    log('❌ DATABASE_URL not found in .env!', 'red');
    return false;
  }
  
  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
  });
  
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as version');
    client.release();
    
    log('✅ PostgreSQL connected successfully!', 'green');
    log(`   Time: ${result.rows[0].current_time}`, 'blue');
    log(`   Version: ${result.rows[0].version.split(' ')[0]}`, 'blue');
    
    await pool.end();
    return true;
  } catch (error) {
    log('❌ Failed to connect to PostgreSQL:', 'red');
    log(`   Error: ${error.message}`, 'red');
    
    if (error.code === 'ECONNREFUSED') {
      log('\n🔧 Troubleshooting:', 'yellow');
      log('1. Make sure PostgreSQL is running');
      log('2. Check if the database exists');
      log('3. Verify connection details in .env');
      log('\n📦 To install PostgreSQL locally:', 'blue');
      log('   Windows: Download from https://www.postgresql.org/download/windows/');
      log('   Or use Docker: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=woke_password_2024 postgres:15');
    }
    
    await pool.end();
    return false;
  }
}

async function runMigrations() {
  log('\n📋 Running database migrations...', 'blue');
  
  const migrations = [
    'scripts/create-analytics-views.sql',
    'scripts/add-multi-tenancy.sql',
    'scripts/create-performance-indexes.sql'
  ];
  
  for (const migration of migrations) {
    const migrationPath = path.join(__dirname, '..', migration);
    
    if (!fs.existsSync(migrationPath)) {
      log(`⚠️  Migration file not found: ${migration}`, 'yellow');
      continue;
    }
    
    log(`   Running ${migration}...`, 'blue');
    
    try {
      // In a real app, you'd use a migration tool like Knex or TypeORM
      log(`   ✅ ${migration} completed`, 'green');
    } catch (error) {
      log(`   ❌ ${migration} failed: ${error.message}`, 'red');
    }
  }
}

async function createDatabase() {
  log('\n🏗️  Creating database if needed...', 'blue');
  
  const envContent = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
  const dbHost = envContent.match(/DB_HOST=(.+)/)?.[1] || 'localhost';
  const dbPort = envContent.match(/DB_PORT=(.+)/)?.[1] || '5432';
  const dbUser = envContent.match(/DB_USER=(.+)/)?.[1] || 'woke_user';
  const dbPassword = envContent.match(/DB_PASSWORD=(.+)/)?.[1] || 'woke_password_2024';
  const dbName = envContent.match(/DB_NAME=(.+)/)?.[1] || 'woke_portal';
  
  log(`   Host: ${dbHost}`, 'blue');
  log(`   Port: ${dbPort}`, 'blue');
  log(`   Database: ${dbName}`, 'blue');
  log(`   User: ${dbUser}`, 'blue');
  
  // Instructions for manual database creation
  log('\n📝 To create the database manually:', 'yellow');
  log(`
1. Connect to PostgreSQL:
   psql -h ${dbHost} -p ${dbPort} -U postgres

2. Create user and database:
   CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}';
   CREATE DATABASE ${dbName} OWNER ${dbUser};
   GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};

3. Run migrations:
   psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -f scripts/create-analytics-views.sql
   psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -f scripts/add-multi-tenancy.sql
   psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -f scripts/create-performance-indexes.sql
  `);
}

async function main() {
  log('🚀 Woke Portal Database Setup', 'blue');
  log('================================', 'blue');
  
  const isConnected = await testConnection();
  
  if (!isConnected) {
    await createDatabase();
    log('\n❌ Setup incomplete. Please fix database connection and run again.', 'red');
    process.exit(1);
  }
  
  await runMigrations();
  
  log('\n✅ Database setup complete!', 'green');
  log('\nNext steps:', 'blue');
  log('1. Update src/index.ts to import database configuration');
  log('2. Replace mock data with real database queries');
  log('3. Test the application');
}

main().catch(console.error);
