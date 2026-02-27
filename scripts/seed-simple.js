import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: 'postgres://woke_user:9b2bf7e48b4aa7da@localhost:5432/woke_portal'
});

async function seedSimple() {
  const client = await pool.connect();
  try {
    console.log('🌱 Seeding Database with Demo Data...');
    
    // Create demo brand
    const brandResult = await client.query(`
      INSERT INTO brands (name, subdomain, primary_color, secondary_color, settings)
      VALUES ('Demo Corporation', 'demo', '#3b82f6', '#64748b', '{"theme": "dark", "currency": "USD"}')
      ON CONFLICT (subdomain) DO NOTHING
      RETURNING id, name, subdomain
    `);
    
    let brandId;
    if (brandResult.rows.length > 0) {
      brandId = brandResult.rows[0].id;
      console.log(`✅ Created brand: ${brandResult.rows[0].name}`);
    } else {
      // Get existing brand
      const existing = await client.query('SELECT id FROM brands WHERE subdomain = $1', ['demo']);
      brandId = existing.rows[0].id;
    }
    
    // Create brand owner
    const passwordHash = await bcrypt.hash('demo123', 10);
    await client.query(`
      INSERT INTO brand_owners (brand_id, email, password_hash, first_name, last_name)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO NOTHING
    `, [brandId, 'demo@wokeportal.com', passwordHash, 'Demo', 'User']);
    console.log('✅ Created user: demo@wokeportal.com');
    
    // Create sample stores
    const stores = [
      ['Main Store', 'Downtown', 5.00, 2000.00, '2024-01-01', null],
      ['Downtown Branch', 'Downtown', 4.50, 1500.00, '2024-01-15', null],
      ['Mall Location', 'Shopping', 6.00, 3000.00, '2024-02-01', null]
    ];
    
    for (const [name, group, commission, rent, activation] of stores) {
      await client.query(`
        INSERT INTO stores (brand_id, name, "group", commission, rent, activation_date)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `, [brandId, name, group, commission, rent, activation]);
    }
    console.log('✅ Created sample stores');
    
    // Create sample products
    const products = [
      ['WIN-001', 'BIG-001', 'Winter Jacket', 'Red', 'M', 50.00, 150.00, 'Clothing', 7],
      ['WIN-002', 'BIG-001', 'Winter Jacket', 'Blue', 'L', 50.00, 150.00, 'Clothing', 7],
      ['WIN-003', 'BIG-002', 'Winter Boots', 'Black', '9', 75.00, 200.00, 'Footwear', 10],
      ['SUM-001', 'BIG-003', 'Summer T-Shirt', 'White', 'M', 10.00, 30.00, 'Clothing', 3],
      ['SUM-002', 'BIG-003', 'Summer Shorts', 'Khaki', '32', 15.00, 45.00, 'Clothing', 3]
    ];
    
    for (const [sku, bigSku, name, colour, size, cost, price, type, leadTime] of products) {
      await client.query(`
        INSERT INTO products (brand_id, sku, big_sku, name, colour, size, unit_production_cost, unit_selling_price, type, lead_time_days, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Active')
        ON CONFLICT DO NOTHING
      `, [brandId, sku, bigSku, name, colour, size, cost, price, type, leadTime]);
    }
    console.log('✅ Created sample products');
    
    // Create sample stock moves
    const stockMoves = [
      ['2024-01-10', 'WIN-001', 100, 'warehouse', 'Initial stock from supplier'],
      ['2024-01-15', 'WIN-001', 20, 'Main Store', 'Transfer to main store'],
      ['2024-01-16', 'WIN-002', 50, 'warehouse', 'New stock from supplier'],
      ['2024-01-17', 'WIN-001', -5, 'Main Store', 'Return to warehouse'],
      ['2024-01-18', 'WIN-003', 30, 'warehouse', 'New stock from supplier'],
      ['2024-01-20', 'WIN-002', 15, 'Downtown Branch', 'Transfer to downtown']
    ];
    
    for (const [date, sku, qty, dest, notes] of stockMoves) {
      await client.query(`
        INSERT INTO stock_moves (brand_id, move_date, sku, quantity, destination, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `, [brandId, date, sku, qty, dest, notes]);
    }
    console.log('✅ Created sample stock moves');
    
    // Create sample transactions
    const transactions = [
      ['2024-01-15', 'Main Store', 'WIN-001', 5, 150.00],
      ['2024-01-15', 'Downtown Branch', 'WIN-002', 3, 150.00],
      ['2024-01-16', 'Main Store', 'WIN-001', -1, 150.00],
      ['2024-01-16', 'Mall Location', 'WIN-003', 10, 200.00],
      ['2024-01-17', 'Main Store', 'WIN-002', 2, 150.00]
    ];
    
    // Get store IDs
    const storeMap = new Map();
    const storeRows = await client.query('SELECT id, name FROM stores WHERE brand_id = $1', [brandId]);
    storeRows.rows.forEach(row => storeMap.set(row.name, row.id));
    
    for (const [date, store, sku, qty, price] of transactions) {
      const storeId = storeMap.get(store) || null;
      await client.query(`
        INSERT INTO transactions (brand_id, transaction_date, store_id, sku, quantity_sold, selling_price)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `, [brandId, date, storeId, sku, qty, price]);
    }
    console.log('✅ Created sample transactions');
    
    // Refresh inventory
    await client.query('REFRESH MATERIALIZED VIEW inventory_snapshot');
    console.log('✅ Refreshed inventory snapshot');
    
    console.log('\n🎉 Database seeded successfully!');
    console.log('\nLogin credentials:');
    console.log('Email: demo@wokeportal.com');
    console.log('Password: demo123');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seedSimple();
