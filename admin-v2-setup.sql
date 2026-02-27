-- ══════════════════════════════════════════════════════════
-- Admin V2 Setup: Proper admin account + secure invite links
-- ══════════════════════════════════════════════════════════

-- 1. Remove is_admin from demo account
UPDATE brand_owners SET is_admin = false WHERE email = 'demo@chronizer.com';

-- 2. Create "Chronizer System" brand for admin
INSERT INTO brands (id, name, subdomain, primary_color, secondary_color)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Chronizer System',
  'admin',
  '#1e293b',
  '#475569'
) ON CONFLICT (id) DO UPDATE SET name = 'Chronizer System', subdomain = 'admin';

-- 3. Create admin account (password will be set via script)
-- Placeholder hash — will be replaced by Node script
INSERT INTO brand_owners (id, brand_id, email, password_hash, first_name, last_name, is_admin)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'admin@chronizer.com',
  '$2b$10$placeholder',
  'System',
  'Admin',
  true
) ON CONFLICT (id) DO UPDATE SET email = 'admin@chronizer.com', is_admin = true, first_name = 'System', last_name = 'Admin';

-- 4. Drop old invite_codes table and recreate for secure invite links
DROP TABLE IF EXISTS invite_code_uses CASCADE;
DROP TABLE IF EXISTS invite_codes CASCADE;

-- 5. Create invite_links table (one-time use, 10 min expiry)
CREATE TABLE IF NOT EXISTS invite_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(128) NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES brand_owners(id) ON DELETE CASCADE,
    recipient_email VARCHAR(255),
    is_used BOOLEAN DEFAULT false,
    used_by UUID REFERENCES brand_owners(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invite_links_token ON invite_links (token) WHERE is_used = false;
CREATE INDEX IF NOT EXISTS idx_invite_links_expires ON invite_links (expires_at);

-- 6. Activity log for admin visibility
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES brand_owners(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_brand ON activity_log (brand_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log (action);

-- 7. Add last_active column to brand_owners if not exists
ALTER TABLE brand_owners ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;
