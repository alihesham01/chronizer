-- Full Migration: Run in pgAdmin Query Tool on your production database
-- This is idempotent — safe to run multiple times.

-- ─── 1. Missing columns on brand_owners ──────────────────────
ALTER TABLE brand_owners ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
ALTER TABLE brand_owners ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
ALTER TABLE brand_owners ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;

-- ─── 2. Missing column on stores ─────────────────────────────
ALTER TABLE stores ADD COLUMN IF NOT EXISTS location TEXT;

-- ─── 3. activity_log table (audit trail) ─────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES brand_owners(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_brand ON activity_log(brand_id, created_at DESC);

-- ─── 4. invite_links table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(255) NOT NULL UNIQUE,
  created_by UUID REFERENCES brand_owners(id) ON DELETE SET NULL,
  recipient_email VARCHAR(255),
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN DEFAULT false,
  used_by UUID REFERENCES brand_owners(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invite_token ON invite_links(token);

-- ─── 5. sku_store_map table (external SKU → internal product) ──
CREATE TABLE IF NOT EXISTS sku_store_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  store_group VARCHAR(255) NOT NULL,
  store_sku VARCHAR(255) NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(brand_id, store_group, store_sku)
);
CREATE INDEX IF NOT EXISTS idx_sku_map_brand ON sku_store_map(brand_id, store_group);

-- ─── 6. unmapped_skus table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS unmapped_skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  external_sku VARCHAR(255) NOT NULL,
  store_group VARCHAR(255),
  source VARCHAR(100),
  sample_data JSONB,
  occurrence_count INTEGER DEFAULT 1,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'mapped', 'ignored')),
  mapped_to_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES brand_owners(id) ON DELETE SET NULL,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(brand_id, external_sku, store_group)
);
CREATE INDEX IF NOT EXISTS idx_unmapped_brand ON unmapped_skus(brand_id, status);

-- ─── 7. notifications table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES brand_owners(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  type VARCHAR(50) DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  is_read BOOLEAN DEFAULT false,
  link VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_owner ON notifications(owner_id, is_read, created_at DESC);

-- ─── 8. Set admin account ────────────────────────────────────
UPDATE brand_owners SET is_admin = true WHERE email = 'admin@chronizer.com';

-- Done!
SELECT 'Migration completed successfully!' as result;
