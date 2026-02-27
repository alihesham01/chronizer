-- CORRECT Migration based on actual database columns
-- Run this in pgAdmin Query Tool

-- ============================================
-- 1. Add missing columns to STORES
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'display_name') THEN
        ALTER TABLE stores ADD COLUMN display_name VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'code') THEN
        ALTER TABLE stores ADD COLUMN code VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'group_name') THEN
        ALTER TABLE stores ADD COLUMN group_name VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'commission') THEN
        ALTER TABLE stores ADD COLUMN commission DECIMAL(5,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'rent') THEN
        ALTER TABLE stores ADD COLUMN rent DECIMAL(10,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'activation_date') THEN
        ALTER TABLE stores ADD COLUMN activation_date TIMESTAMPTZ DEFAULT NOW();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'deactivation_date') THEN
        ALTER TABLE stores ADD COLUMN deactivation_date TIMESTAMPTZ;
    END IF;
END $$;

-- ============================================
-- 2. Add missing columns to PRODUCTS
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'big_sku') THEN
        ALTER TABLE products ADD COLUMN big_sku VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'colour') THEN
        ALTER TABLE products ADD COLUMN colour VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'size') THEN
        ALTER TABLE products ADD COLUMN size VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'category') THEN
        ALTER TABLE products ADD COLUMN category VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'cost_price') THEN
        ALTER TABLE products ADD COLUMN cost_price DECIMAL(10,2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'selling_price') THEN
        ALTER TABLE products ADD COLUMN selling_price DECIMAL(10,2);
    END IF;
END $$;

-- ============================================
-- 3. Add missing columns to STOCK_MOVEMENTS
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_movements' AND column_name = 'move_date') THEN
        ALTER TABLE stock_movements ADD COLUMN move_date TIMESTAMPTZ DEFAULT NOW();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_movements' AND column_name = 'sku') THEN
        ALTER TABLE stock_movements ADD COLUMN sku VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_movements' AND column_name = 'destination') THEN
        ALTER TABLE stock_movements ADD COLUMN destination VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_movements' AND column_name = 'reference_type') THEN
        ALTER TABLE stock_movements ADD COLUMN reference_type VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_movements' AND column_name = 'reference_number') THEN
        ALTER TABLE stock_movements ADD COLUMN reference_number VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_movements' AND column_name = 'notes') THEN
        ALTER TABLE stock_movements ADD COLUMN notes TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_movements' AND column_name = 'updated_at') THEN
        ALTER TABLE stock_movements ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- ============================================
-- 4. Add missing columns to BRAND_OWNERS
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brand_owners' AND column_name = 'role') THEN
        ALTER TABLE brand_owners ADD COLUMN role VARCHAR(50) DEFAULT 'owner';
    END IF;
END $$;

-- ============================================
-- 5. Create indexes (using actual column names)
-- ============================================

-- Transactions indexes (these columns exist)
CREATE INDEX IF NOT EXISTS idx_txn_brand_date ON transactions(brand_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_txn_brand_store ON transactions(brand_id, store_id);
CREATE INDEX IF NOT EXISTS idx_txn_brand_sku ON transactions(brand_id, sku);
CREATE INDEX IF NOT EXISTS idx_txn_brand_status ON transactions(brand_id, status);

-- Products indexes (sku exists, is_active exists)
CREATE INDEX IF NOT EXISTS idx_prod_brand_sku ON products(brand_id, sku);
CREATE INDEX IF NOT EXISTS idx_prod_brand_active ON products(brand_id, is_active);

-- Stores indexes (is_active exists, group_name just added)
CREATE INDEX IF NOT EXISTS idx_store_brand_active ON stores(brand_id, is_active);
CREATE INDEX IF NOT EXISTS idx_store_brand_group ON stores(brand_id, group_name);

-- Stock movements indexes (move_date and sku just added)
CREATE INDEX IF NOT EXISTS idx_sm_brand_date ON stock_movements(brand_id, move_date);
CREATE INDEX IF NOT EXISTS idx_sm_brand_sku ON stock_movements(brand_id, sku);

-- Activity log indexes
CREATE INDEX IF NOT EXISTS idx_activity_brand_date ON activity_log(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_owner ON activity_log(owner_id, created_at DESC);

-- ============================================
-- 6. Updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. Apply triggers (only to tables with updated_at)
-- ============================================
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

-- ============================================
-- DONE!
-- ============================================
SELECT 'Migration completed successfully!' as result;
