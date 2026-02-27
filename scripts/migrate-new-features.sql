-- New Features Migration
-- Run this in pgAdmin Query Tool on your production database

-- 1. invite_links table for admin invite system
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
CREATE INDEX IF NOT EXISTS idx_invite_created_by ON invite_links(created_by);

-- 2. unmapped_skus table for flagging unresolved SKUs during transaction imports
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
CREATE INDEX IF NOT EXISTS idx_unmapped_sku ON unmapped_skus(brand_id, external_sku);

-- Done!
SELECT 'New features migration completed!' as result;
