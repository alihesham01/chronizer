-- ============================================================
-- Migration 001: Phase 3 Features
-- Password reset, multi-user roles, notifications, webhooks,
-- alert thresholds, timezone/currency, scheduled reports,
-- data archiving support
-- ============================================================

-- 1. PASSWORD RESET TOKENS
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES brand_owners(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens (token) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prt_owner ON password_reset_tokens (owner_id);

-- 2. MULTI-USER: Add role enum constraint + team invite table
-- brand_owners.role already exists as VARCHAR(50) DEFAULT 'owner'
-- Add a CHECK constraint for valid roles
DO $$ BEGIN
    ALTER TABLE brand_owners DROP CONSTRAINT IF EXISTS chk_owner_role;
    ALTER TABLE brand_owners ADD CONSTRAINT chk_owner_role 
        CHECK (role IN ('owner', 'admin', 'manager', 'viewer'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Team invitations (brand owner invites team members)
CREATE TABLE IF NOT EXISTS team_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES brand_owners(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'viewer')),
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_team_invites_token ON team_invites (token) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_invites_brand ON team_invites (brand_id);

-- 3. NOTIFICATIONS (enhance existing table or create)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES brand_owners(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('scraper_failure', 'low_stock', 'sales_anomaly', 'team_invite', 'report_ready', 'system', 'info')),
    title VARCHAR(255) NOT NULL,
    message TEXT,
    metadata JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT false,
    email_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_brand ON notifications (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_owner ON notifications (owner_id, is_read, created_at DESC);

-- 4. TIMEZONE & CURRENCY on brands
DO $$ BEGIN
    ALTER TABLE brands ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Africa/Cairo';
    ALTER TABLE brands ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'EGP';
    ALTER TABLE brands ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(5) DEFAULT 'E£';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 5. WEBHOOKS
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    secret VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    last_status_code INTEGER,
    failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhooks_brand ON webhooks (brand_id) WHERE is_active = true;

-- Webhook delivery log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    delivered_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries (webhook_id, delivered_at DESC);

-- 6. ALERT THRESHOLDS
CREATE TABLE IF NOT EXISTS alert_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('low_stock', 'sales_drop', 'sales_spike', 'scraper_failure')),
    sku VARCHAR(100),
    store_id UUID REFERENCES stores(id),
    threshold_value DECIMAL(12,2) NOT NULL,
    comparison VARCHAR(10) NOT NULL DEFAULT 'lt' CHECK (comparison IN ('lt', 'lte', 'gt', 'gte', 'eq')),
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alert_thresholds_brand ON alert_thresholds (brand_id) WHERE is_active = true;

-- 7. SCHEDULED REPORTS
CREATE TABLE IF NOT EXISTS scheduled_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES brand_owners(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('daily_summary', 'weekly_summary', 'monthly_summary', 'inventory_snapshot', 'custom')),
    schedule VARCHAR(20) NOT NULL DEFAULT 'daily' CHECK (schedule IN ('daily', 'weekly', 'monthly')),
    format VARCHAR(10) NOT NULL DEFAULT 'xlsx' CHECK (format IN ('xlsx', 'csv', 'pdf')),
    filters JSONB DEFAULT '{}',
    recipients TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_brand ON scheduled_reports (brand_id) WHERE is_active = true;

-- 8. MIGRATION TRACKING
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- Record this migration
INSERT INTO schema_migrations (name) VALUES ('001_phase3_features')
ON CONFLICT (name) DO NOTHING;
