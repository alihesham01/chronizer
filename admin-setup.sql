-- Add is_admin column to brand_owners
ALTER TABLE brand_owners ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Make demo user an admin
UPDATE brand_owners SET is_admin = true WHERE email = 'demo@woke.com';

-- Invite codes table
CREATE TABLE IF NOT EXISTS invite_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE,
    created_by UUID REFERENCES brand_owners(id) ON DELETE SET NULL,
    max_uses INTEGER DEFAULT 1,
    used_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes (code) WHERE is_active = true;
CREATE TRIGGER update_invite_codes_updated_at BEFORE UPDATE ON invite_codes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Invite code usage tracking
CREATE TABLE IF NOT EXISTS invite_code_uses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code_id UUID NOT NULL REFERENCES invite_codes(id) ON DELETE CASCADE,
    used_by UUID NOT NULL REFERENCES brand_owners(id) ON DELETE CASCADE,
    used_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invite_code_uses_code_id ON invite_code_uses (invite_code_id);

-- Seed a default invite code
INSERT INTO invite_codes (code, max_uses, notes)
VALUES ('WP-621DBF5DF52CBD6CA55010B6B8126E9B', 100, 'Default admin invite code')
ON CONFLICT (code) DO NOTHING;
