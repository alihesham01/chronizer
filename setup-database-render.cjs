const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://chronizer_user:55np6F4VPEOYz8IIt9o4663s4rn6ktYk@dpg-d6gfo71drdic73c5morg-a.ohio-postgres.render.com/chronizer',
  ssl: {
    rejectUnauthorized: false
  }
});

async function setupDatabase() {
  console.log('🚀 Setting up Chronizer database...');
  
  try {
    // Create basic tables first
    await pool.query(`
      CREATE TABLE IF NOT EXISTS brands (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        subdomain VARCHAR(100) UNIQUE NOT NULL,
        primary_color VARCHAR(7),
        secondary_color VARCHAR(7),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS brand_owners (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        is_admin BOOLEAN DEFAULT false,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        location TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(100),
        description TEXT,
        price DECIMAL(10,2),
        cost DECIMAL(10,2),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
        store_id UUID REFERENCES stores(id),
        type VARCHAR(20) NOT NULL CHECK (type IN ('sale', 'purchase', 'adjustment')),
        total_amount DECIMAL(10,2) NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        store_id UUID REFERENCES stores(id),
        transaction_id UUID REFERENCES transactions(id),
        type VARCHAR(20) NOT NULL CHECK (type IN ('in', 'out')),
        quantity INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Basic tables created');

    // Create dedicated admin brand
    await pool.query(`
      INSERT INTO brands (id, name, subdomain, is_active, created_at, updated_at) VALUES 
      ('00000000-0000-0000-0000-000000000001', 'Chronizer System', 'admin', true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('✅ Admin brand created');

    // Create admin owner with is_admin flag
    await pool.query(`
      INSERT INTO brand_owners (id, brand_id, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at) VALUES 
      ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'admin@chronizer.com', '$2b$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQ', 'System', 'Admin', true, true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('✅ Admin user created');

    // Drop old invite codes table if exists
    await pool.query(`DROP TABLE IF EXISTS invite_codes CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS invite_code_uses CASCADE`);
    console.log('✅ Old invite tables dropped');

    // Create invite_links table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invite_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token VARCHAR(255) UNIQUE NOT NULL,
        recipient_email VARCHAR(255),
        is_used BOOLEAN DEFAULT false,
        used_by UUID REFERENCES brand_owners(id),
        used_at TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by UUID REFERENCES brand_owners(id)
      )
    `);
    console.log('✅ invite_links table created');

    // Create activity_log table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id UUID REFERENCES brands(id),
        owner_id UUID REFERENCES brand_owners(id),
        action VARCHAR(100) NOT NULL,
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ activity_log table created');

    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invite_links_token ON invite_links(token)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invite_links_expires ON invite_links(expires_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_log_brand ON activity_log(brand_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at)`);
    console.log('✅ Indexes created');

    // Remove admin rights from demo user
    await pool.query(`UPDATE brand_owners SET is_admin = false WHERE email = 'demo@chronizer.com'`);
    console.log('✅ Demo user admin rights removed');

    console.log('\n🎉 Database setup complete!');
    console.log('📧 Admin login: admin@chronizer.com');
    console.log('🔑 Password: Admin@Chronizer2024!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

setupDatabase();
