import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const pool = new Pool({
  connectionString: 'postgres://woke_user:9b2bf7e48b4aa7da@localhost:5432/woke_portal'
});

async function setupProducts() {
  console.log('📦 Setting up products table...');
  
  try {
    const client = await pool.connect();
    
    // Read and execute SQL file
    const sqlPath = path.join(process.cwd(), 'scripts/create-products-table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await client.query(sql);
    
    // Verify table exists
    const result = await client.query(`
      SELECT COUNT(*) as count 
      FROM products 
      WHERE brand_id = (SELECT id FROM brands WHERE subdomain = 'demo')
    `);
    
    console.log(`✅ Products table created with ${result.rows[0].count} sample products`);
    
    client.release();
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

setupProducts();
