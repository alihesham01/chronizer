-- Migration for scraper functionality
-- Run this after migrate-safety.sql

-- Enable pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Store credentials table (encrypted passwords)
CREATE TABLE IF NOT EXISTS store_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    store_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash BYTEA NOT NULL, -- Encrypted with pgp_sym_encrypt
    api_key TEXT,
    api_url TEXT,
    is_active BOOLEAN DEFAULT true,
    last_scrape_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(brand_id, store_name)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_store_credentials_brand_store 
    ON store_credentials(brand_id, store_name);

-- Transaction items table (for detailed transaction data)
CREATE TABLE IF NOT EXISTS transaction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id 
    ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_sku 
    ON transaction_items(sku);

-- Inventory snapshots table (for tracking inventory over time)
CREATE TABLE IF NOT EXISTS inventory_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2),
    snapshot_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_brand_sku_date 
    ON inventory_snapshots(brand_id, sku, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_date 
    ON inventory_snapshots(snapshot_date);

-- Add external_id to transactions (for store transaction IDs)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);

-- Create unique index for external_id per brand
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_brand_external 
    ON transactions(brand_id, external_id) 
    WHERE external_id IS NOT NULL;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_store_credentials_updated_at
    BEFORE UPDATE ON store_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_snapshots_updated_at
    BEFORE UPDATE ON inventory_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS for store_credentials
ALTER TABLE store_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_credentials FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON store_credentials;
CREATE POLICY tenant_isolation ON store_credentials FOR ALL
  USING (
    brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    OR current_setting('app.is_admin', true) = 'true'
  )
  WITH CHECK (
    brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    OR current_setting('app.is_admin', true) = 'true'
  );

-- RLS for transaction_items (inherits from transactions)
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON transaction_items;
CREATE POLICY tenant_isolation ON transaction_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM transactions t 
      WHERE t.id = transaction_items.transaction_id 
      AND t.brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    )
    OR current_setting('app.is_admin', true) = 'true'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM transactions t 
      WHERE t.id = transaction_items.transaction_id 
      AND t.brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    )
    OR current_setting('app.is_admin', true) = 'true'
  );

-- RLS for inventory_snapshots
ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON inventory_snapshots;
CREATE POLICY tenant_isolation ON inventory_snapshots FOR ALL
  USING (
    brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    OR current_setting('app.is_admin', true) = 'true'
  )
  WITH CHECK (
    brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    OR current_setting('app.is_admin', true) = 'true'
  );

-- Success message
DO $$ BEGIN
  RAISE NOTICE 'Scraper migration completed:';
  RAISE NOTICE '  ✓ store_credentials table created with encrypted passwords';
  RAISE NOTICE '  ✓ transaction_items table created';
  RAISE NOTICE '  ✓ inventory_snapshots table created';
  RAISE NOTICE '  ✓ RLS policies applied';
END $$;

SELECT 'Scraper migration completed successfully!' AS result;
