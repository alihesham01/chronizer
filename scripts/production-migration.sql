-- Production Migration Script
-- Run this in your Render PostgreSQL dashboard Query tab

-- 1. Create activity_log table for audit logging
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES brand_owners(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Composite indexes for performance
CREATE INDEX IF NOT EXISTS idx_txn_brand_date ON transactions(brand_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_txn_brand_store ON transactions(brand_id, store_id);
CREATE INDEX IF NOT EXISTS idx_txn_brand_sku ON transactions(brand_id, sku);
CREATE INDEX IF NOT EXISTS idx_txn_brand_status ON transactions(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_txn_brand_date_store ON transactions(brand_id, transaction_date DESC, store_id);

-- Stock movements indexes
CREATE INDEX IF NOT EXISTS idx_sm_brand_date ON stock_movements(brand_id, move_date DESC);
CREATE INDEX IF NOT EXISTS idx_sm_brand_sku ON stock_movements(brand_id, sku);

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_prod_brand_sku ON products(brand_id, sku);
CREATE INDEX IF NOT EXISTS idx_prod_brand_active ON products(brand_id, is_active);

-- Stores indexes
CREATE INDEX IF NOT EXISTS idx_store_brand_active ON stores(brand_id, is_active);
CREATE INDEX IF NOT EXISTS idx_store_brand_group ON stores(brand_id, group_name);

-- Activity log indexes
CREATE INDEX IF NOT EXISTS idx_activity_brand_date ON activity_log(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_owner ON activity_log(owner_id, created_at DESC);

-- 3. Updated_at trigger function
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Apply triggers to tables
DROP TRIGGER IF EXISTS set_updated_at ON brands;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON brand_owners;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON brand_owners FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON stores;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON products;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON transactions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON stock_movements;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON stock_movements FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON sku_store_map;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON sku_store_map FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Migration complete!
SELECT 'Migration completed successfully!' as result;
