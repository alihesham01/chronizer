import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

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

async function seedDatabase() {
  log('\n🌱 Seeding Database with Test Data', 'blue');
  log('================================', 'blue');
  
  // Read .env file
  const envPath = path.join(__dirname, '../.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const dbUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1];
  
  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
  });
  
  try {
    // Create demo brand
    log('\n1. Creating Demo Brand...', 'yellow');
    const brandQuery = `
      INSERT INTO brands (name, subdomain, primary_color, secondary_color, settings)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (subdomain) DO UPDATE SET
        name = EXCLUDED.name,
        primary_color = EXCLUDED.primary_color,
        secondary_color = EXCLUDED.secondary_color
      RETURNING id, name, subdomain
    `;
    const brandResult = await pool.query(brandQuery, [
      'Demo Corporation',
      'demo',
      '#3b82f6',
      '#64748b',
      JSON.stringify({ theme: 'dark', currency: 'USD' })
    ]);
    
    const brand = brandResult.rows[0];
    log(`   Created brand: ${brand.name} (${brand.subdomain})`, 'green');
    const brandId = brand.id;
    
    // Create brand owner
    log('\n2. Creating Brand Owner...', 'yellow');
    const passwordHash = await bcrypt.hash('demo123', 10);
    const ownerQuery = `
      INSERT INTO brand_owners (brand_id, email, password_hash, first_name, last_name)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name
      RETURNING id, email
    `;
    const ownerResult = await pool.query(ownerQuery, [
      brandId,
      'demo@wokeportal.com',
      passwordHash,
      'Demo',
      'User'
    ]);
    
    const owner = ownerResult.rows[0];
    log(`   Created owner: ${owner.email}`, 'green');
    
    // Create sample transactions
    log('\n3. Creating Sample Transactions...', 'yellow');
    const transactions = [];
    const customers = [
      'john@example.com',
      'jane@example.com',
      'bob@example.com',
      'alice@example.com',
      'charlie@example.com'
    ];
    
    const descriptions = [
      'Premium Subscription',
      'Basic Plan',
      'Add-on Service',
      'Enterprise License',
      'Support Package',
      'Training Session',
      'Consulting Hours',
      'Product License'
    ];
    
    for (let i = 0; i < 100; i++) {
      const amount = Math.floor(Math.random() * 1000) + 10;
      const description = descriptions[Math.floor(Math.random() * descriptions.length)];
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const status = Math.random() > 0.1 ? 'completed' : 'pending';
      const date = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000); // Last 30 days
      
      const transactionQuery = `
        INSERT INTO transactions (brand_id, amount, description, status, customer_email, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `;
      
      const result = await pool.query(transactionQuery, [
        brandId,
        amount,
        description,
        status,
        customer,
        JSON.stringify({ 
          source: 'web',
          campaign: `campaign_${Math.floor(Math.random() * 5) + 1}`,
          region: ['US', 'EU', 'APAC'][Math.floor(Math.random() * 3)]
        }),
        date
      ]);
      
      transactions.push(result.rows[0].id);
    }
    
    log(`   Created ${transactions.length} transactions`, 'green');
    
    // Create analytics data
    log('\n4. Generating Analytics Data...', 'yellow');
    const analyticsQuery = `
      INSERT INTO analytics (brand_id, date, type, metrics)
      VALUES ($1, $2, $3, $4)
    `;
    
    // Generate daily analytics for last 30 days
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dailyTransactions = Math.floor(Math.random() * 20) + 5;
      const dailyRevenue = dailyTransactions * (Math.random() * 200 + 50);
      
      await pool.query(analyticsQuery, [
        brandId,
        dateStr,
        'daily',
        JSON.stringify({
          transactions: dailyTransactions,
          revenue: dailyRevenue,
          averageOrderValue: dailyRevenue / dailyTransactions,
          uniqueCustomers: Math.floor(dailyTransactions * 0.8),
          conversionRate: Math.random() * 0.05 + 0.02
        })
      ]);
    }
    
    log('   Generated 30 days of analytics', 'green');
    
    // Display summary
    log('\n✅ Database seeded successfully!', 'green');
    log('\n📊 Summary:', 'blue');
    log(`   Brand: ${brand.name} (${brand.subdomain}.wokeportal.com)`, 'blue');
    log(`   Owner: demo@wokeportal.com / demo123`, 'blue');
    log(`   Transactions: ${transactions.length}`, 'blue');
    log(`   Analytics: 30 days`, 'blue');
    
    log('\n🚀 You can now test the application!', 'green');
    log('   1. Start the backend: npm run dev', 'yellow');
    log('   2. Start the frontend: cd frontend && npm run dev', 'yellow');
    log('   3. Visit: http://localhost:3002', 'yellow');
    log('   4. Login with: demo@wokeportal.com / demo123', 'yellow');
    
  } catch (error) {
    log('\n❌ Seeding failed:', 'red');
    log(`   Error: ${error.message}`, 'red');
  } finally {
    await pool.end();
  }
}

seedDatabase().catch(console.error);
