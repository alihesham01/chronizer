const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://chronizer_user:55np6F4VPEOYz8IIt9o4663s4rn6ktYk@dpg-d6gfo71drdic73c5morg-a.ohio-postgres.render.com/chronizer',
  ssl: { rejectUnauthorized: false }
});

async function setup() {
  console.log('Creating sku_store_map table...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sku_store_map (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      store_group VARCHAR(255) NOT NULL,
      store_sku VARCHAR(255) NOT NULL,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(brand_id, store_group, store_sku)
    )
  `);
  console.log('✅ sku_store_map table created');

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sku_map_brand ON sku_store_map(brand_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sku_map_group ON sku_store_map(brand_id, store_group)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sku_map_product ON sku_store_map(brand_id, product_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sku_map_store_sku ON sku_store_map(brand_id, store_group, store_sku)`);
  console.log('✅ Indexes created');

  console.log('\n🎉 SKU-Store Map table ready!');
  await pool.end();
}

setup().catch(e => { console.error('❌', e.message); pool.end(); });
