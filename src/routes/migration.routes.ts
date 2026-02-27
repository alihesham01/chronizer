import { Hono } from 'hono';
import { db } from '../config/database.js';

const migration = new Hono();

// TEMPORARY: Run migration endpoint - REMOVE AFTER USE!
migration.post('/run-migration', async (c) => {
  // Simple security check - you might want to add a key
  const key = c.req.header('X-Migration-Key');
  if (key !== 'temp-migration-key-2024') {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    // Create activity_log table
    await db.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        owner_id UUID REFERENCES brand_owners(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_txn_brand_date ON transactions(brand_id, transaction_date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_txn_brand_store ON transactions(brand_id, store_id)',
      'CREATE INDEX IF NOT EXISTS idx_txn_brand_sku ON transactions(brand_id, sku)',
      'CREATE INDEX IF NOT EXISTS idx_txn_brand_status ON transactions(brand_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_txn_brand_date_store ON transactions(brand_id, transaction_date DESC, store_id)',
      'CREATE INDEX IF NOT EXISTS idx_sm_brand_date ON stock_movements(brand_id, move_date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_sm_brand_sku ON stock_movements(brand_id, sku)',
      'CREATE INDEX IF NOT EXISTS idx_prod_brand_sku ON products(brand_id, sku)',
      'CREATE INDEX IF NOT EXISTS idx_prod_brand_active ON products(brand_id, is_active)',
      'CREATE INDEX IF NOT EXISTS idx_store_brand_active ON stores(brand_id, is_active)',
      'CREATE INDEX IF NOT EXISTS idx_store_brand_group ON stores(brand_id, group_name)',
      'CREATE INDEX IF NOT EXISTS idx_activity_brand_date ON activity_log(brand_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_activity_owner ON activity_log(owner_id, created_at DESC)'
    ];

    for (const sql of indexes) {
      await db.query(sql);
    }

    // Create trigger function
    await db.query(`
      CREATE OR REPLACE FUNCTION trigger_set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Apply triggers
    const tables = ['brands', 'brand_owners', 'stores', 'products', 'transactions', 'stock_movements', 'sku_store_map'];
    for (const table of tables) {
      await db.query(`
        DROP TRIGGER IF EXISTS set_updated_at ON ${table};
        CREATE TRIGGER set_updated_at
          BEFORE UPDATE ON ${table}
          FOR EACH ROW
          EXECUTE FUNCTION trigger_set_updated_at()
      `);
    }

    return c.json({ 
      success: true, 
      message: 'Migration completed successfully!',
      indexes: indexes.length,
      triggers: tables.length 
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    return c.json({ 
      success: false, 
      error: error.message 
    }, 500);
  }
});

export { migration as migrationRoutes };
