import { db } from '../src/config/database.js';

async function migrate() {
  console.log('Running migration: composite indexes + updated_at triggers...\n');

  // ── Composite indexes for transactions ──
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_txn_brand_date ON transactions(brand_id, transaction_date DESC)',
    'CREATE INDEX IF NOT EXISTS idx_txn_brand_store ON transactions(brand_id, store_id)',
    'CREATE INDEX IF NOT EXISTS idx_txn_brand_sku ON transactions(brand_id, sku)',
    'CREATE INDEX IF NOT EXISTS idx_txn_brand_status ON transactions(brand_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_txn_brand_date_store ON transactions(brand_id, transaction_date DESC, store_id)',
    // Stock movements
    'CREATE INDEX IF NOT EXISTS idx_sm_brand_date ON stock_movements(brand_id, move_date DESC)',
    'CREATE INDEX IF NOT EXISTS idx_sm_brand_sku ON stock_movements(brand_id, sku)',
    // Products
    'CREATE INDEX IF NOT EXISTS idx_prod_brand_sku ON products(brand_id, sku)',
    'CREATE INDEX IF NOT EXISTS idx_prod_brand_active ON products(brand_id, is_active)',
    // Stores
    'CREATE INDEX IF NOT EXISTS idx_store_brand_active ON stores(brand_id, is_active)',
    'CREATE INDEX IF NOT EXISTS idx_store_brand_group ON stores(brand_id, group_name)',
    // Activity log
    'CREATE INDEX IF NOT EXISTS idx_activity_brand_date ON activity_log(brand_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_activity_owner ON activity_log(owner_id, created_at DESC)',
  ];

  for (const sql of indexes) {
    try {
      await db.query(sql);
      const name = sql.match(/idx_\w+/)?.[0] || 'unknown';
      console.log(`  ✅ ${name}`);
    } catch (err: any) {
      console.error(`  ❌ ${sql.slice(0, 60)}... — ${err.message}`);
    }
  }

  // ── updated_at trigger function ──
  console.log('\nCreating updated_at trigger function...');
  await db.query(`
    CREATE OR REPLACE FUNCTION trigger_set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  console.log('  ✅ trigger_set_updated_at()');

  // ── Apply trigger to tables with updated_at column ──
  const tables = ['brands', 'brand_owners', 'stores', 'products', 'transactions', 'stock_movements', 'sku_store_map'];
  for (const table of tables) {
    try {
      await db.query(`
        DROP TRIGGER IF EXISTS set_updated_at ON ${table};
        CREATE TRIGGER set_updated_at
          BEFORE UPDATE ON ${table}
          FOR EACH ROW
          EXECUTE FUNCTION trigger_set_updated_at();
      `);
      console.log(`  ✅ ${table}.set_updated_at`);
    } catch (err: any) {
      console.error(`  ❌ ${table} — ${err.message}`);
    }
  }

  console.log('\n🎉 Migration complete!');
  await db.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  db.end();
  process.exit(1);
});
