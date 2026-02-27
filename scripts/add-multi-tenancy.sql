-- Multi-tenancy migration for Chronizer
-- Run this script to add brand support

-- Create brands table
CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(100) UNIQUE NOT NULL,
    custom_domain VARCHAR(255) UNIQUE,
    logo_url VARCHAR(500),
    primary_color VARCHAR(7) DEFAULT '#3b82f6',
    secondary_color VARCHAR(7) DEFAULT '#64748b',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}'::jsonb
);

-- Create brand_owners table
CREATE TABLE IF NOT EXISTS brand_owners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Create brand_sessions table for authentication
CREATE TABLE IF NOT EXISTS brand_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_owner_id UUID NOT NULL REFERENCES brand_owners(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used TIMESTAMP DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- Add brand_id to existing tables
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id);

ALTER TABLE analytics 
ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_brands_subdomain ON brands(subdomain);
CREATE INDEX IF NOT EXISTS idx_brands_custom_domain ON brands(custom_domain);
CREATE INDEX IF NOT EXISTS idx_brand_owners_email ON brand_owners(email);
CREATE INDEX IF NOT EXISTS idx_brand_owners_brand_id ON brand_owners(brand_id);
CREATE INDEX IF NOT EXISTS idx_transactions_brand_id ON transactions(brand_id);
CREATE INDEX IF NOT EXISTS idx_analytics_brand_id ON analytics(brand_id);

-- Create default brand for demo purposes
INSERT INTO brands (name, subdomain, primary_color, secondary_color) 
VALUES (
    'Demo Brand',
    'demo',
    '#3b82f6',
    '#64748b'
) ON CONFLICT (subdomain) DO NOTHING;

-- Create default brand owner (password: demo123)
INSERT INTO brand_owners (brand_id, email, password_hash, first_name, last_name)
SELECT 
    b.id,
    'demo@chronizer.com',
    '$2b$10$rQZ8ZHWgQZQZQZQZQZQZQuOQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQ',
    'Demo',
    'User'
FROM brands b 
WHERE b.subdomain = 'demo'
ON CONFLICT (email) DO NOTHING;

-- Create row-level security policy (PostgreSQL)
-- This ensures users can only access their own brand's data

-- Enable RLS on tables
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY brand_isolation_transactions ON transactions
    FOR ALL
    TO application_user
    USING (brand_id = current_setting('app.current_brand_id')::UUID);

CREATE POLICY brand_isolation_analytics ON analytics
    FOR ALL
    TO application_user
    USING (brand_id = current_setting('app.current_brand_id')::UUID);

-- Function to set brand context
CREATE OR REPLACE FUNCTION set_brand_context(brand_uuid UUID)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_brand_id', brand_uuid::text, true);
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically set brand_id for new records
CREATE OR REPLACE FUNCTION set_brand_id()
RETURNS trigger AS $$
BEGIN
    IF NEW.brand_id IS NULL THEN
        NEW.brand_id := current_setting('app.current_brand_id')::UUID;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables
CREATE TRIGGER set_transaction_brand_id
    BEFORE INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION set_brand_id();

CREATE TRIGGER set_analytics_brand_id
    BEFORE INSERT ON analytics
    FOR EACH ROW
    EXECUTE FUNCTION set_brand_id();
