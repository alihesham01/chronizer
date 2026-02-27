-- Activity log table for audit logging
-- Run this on your database after deployment

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES brand_owners(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for activity_log (will be created by migrate-indexes-triggers.ts)
-- CREATE INDEX IF NOT EXISTS idx_activity_brand_date ON activity_log(brand_id, created_at DESC);
-- CREATE INDEX IF NOT EXISTS idx_activity_owner ON activity_log(owner_id, created_at DESC);
