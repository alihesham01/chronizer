import postgres from 'postgres';
import { config } from 'dotenv';
import bcrypt from 'bcryptjs';

config({ path: '.env' });

const connectionString = process.env.DATABASE_URL ||
  'postgres://woke_user:woke_password_2024@localhost:5432/woke_portal';

// ============================================================
// Multi-Tenant Schema — Optimized for 1M+ transactions
// ============================================================
// Every data table has brand_id as the FIRST column in composite
// indexes so PostgreSQL can efficiently filter by tenant first.
// ============================================================

const schemaSQL = `
-- 1. BRANDS (tenant table)
CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(100) NOT NULL UNIQUE,
    custom_domain VARCHAR(255) UNIQUE,
    logo_url TEXT,
    primary_color VARCHAR(7) DEFAULT '#3b82f6',
    secondary_color VARCHAR(7) DEFAULT '#64748b',
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brands_subdomain ON brands (subdomain) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_brands_custom_domain ON brands (custom_domain) WHERE custom_domain IS NOT NULL AND is_active = true;

-- 2. BRAND OWNERS (auth table)
CREATE TABLE IF NOT EXISTS brand_owners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) DEFAULT 'owner',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email)
);
CREATE INDEX IF NOT EXISTS idx_brand_owners_email ON brand_owners (email) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_brand_owners_brand ON brand_owners (brand_id);

-- 3. STORES (per-brand)
CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    code VARCHAR(50),
    group_name VARCHAR(100),
    commission DECIMAL(5,2),
    rent DECIMAL(10,2),
    activation_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivation_date TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand_id, code)
);
CREATE INDEX IF NOT EXISTS idx_stores_brand ON stores (brand_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_stores_brand_code ON stores (brand_id, code);

-- 4. PRODUCTS (per-brand)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    big_sku VARCHAR(100),
    name VARCHAR(255),
    colour VARCHAR(100),
    size VARCHAR(50),
    category VARCHAR(100),
    cost_price DECIMAL(10,2),
    selling_price DECIMAL(10,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products (brand_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_sku ON products (brand_id, sku);
CREATE INDEX IF NOT EXISTS idx_products_brand_category ON products (brand_id, category);

-- 5. TRANSACTIONS (per-brand, high-volume — designed for 1M+ rows)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    transaction_date TIMESTAMPTZ NOT NULL,
    store_id UUID REFERENCES stores(id),
    sku VARCHAR(100) NOT NULL,
    big_sku VARCHAR(100),
    item_name VARCHAR(255),
    colour VARCHAR(100),
    size VARCHAR(50),
    quantity_sold INTEGER NOT NULL,
    selling_price DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(12,2) GENERATED ALWAYS AS (quantity_sold * selling_price) STORED,
    status VARCHAR(20) NOT NULL DEFAULT 'sale' CHECK (status IN ('sale', 'return', 'adjustment')),
    customer_id VARCHAR(100),
    payment_method VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- brand_id is FIRST in every composite index for tenant isolation
CREATE INDEX IF NOT EXISTS idx_txn_brand_date ON transactions (brand_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_txn_brand_sku ON transactions (brand_id, sku);
CREATE INDEX IF NOT EXISTS idx_txn_brand_store ON transactions (brand_id, store_id);
CREATE INDEX IF NOT EXISTS idx_txn_brand_status ON transactions (brand_id, status);
CREATE INDEX IF NOT EXISTS idx_txn_brand_date_store ON transactions (brand_id, transaction_date DESC, store_id);
-- Covering index for common dashboard query (avoids heap lookup)
CREATE INDEX IF NOT EXISTS idx_txn_dashboard ON transactions (brand_id, transaction_date DESC)
    INCLUDE (quantity_sold, selling_price, store_id, status);

-- 6. STOCK MOVEMENTS (per-brand)
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    move_date TIMESTAMPTZ NOT NULL,
    store_id UUID REFERENCES stores(id),
    sku VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL,
    destination VARCHAR(255),
    reference_type VARCHAR(50),
    reference_number VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sm_brand_date ON stock_movements (brand_id, move_date DESC);
CREATE INDEX IF NOT EXISTS idx_sm_brand_sku ON stock_movements (brand_id, sku);
CREATE INDEX IF NOT EXISTS idx_sm_brand_store ON stock_movements (brand_id, store_id);

-- 7. MATERIALIZED VIEW for fast daily analytics (per-brand)
DROP MATERIALIZED VIEW IF EXISTS daily_transaction_summary;
CREATE MATERIALIZED VIEW daily_transaction_summary AS
SELECT
    brand_id,
    date_trunc('day', transaction_date) AS day,
    store_id,
    COUNT(*) AS transaction_count,
    SUM(quantity_sold) AS total_quantity,
    SUM(quantity_sold * selling_price) AS total_revenue,
    AVG(selling_price) AS avg_price
FROM transactions
GROUP BY brand_id, date_trunc('day', transaction_date), store_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_summary_unique
    ON daily_transaction_summary (brand_id, day, store_id);

-- 8. INVENTORY VIEW (computed, per-brand)
CREATE OR REPLACE VIEW inventory_view AS
SELECT
    p.brand_id,
    p.sku,
    p.big_sku,
    p.name AS item_name,
    p.colour,
    p.size,
    p.cost_price,
    p.selling_price AS unit_selling_price,
    COALESCE(sm_in.qty, 0) AS total_stock_in,
    COALESCE(sm_out.qty, 0) AS total_stock_out,
    COALESCE(tx_sold.qty, 0) AS total_sold,
    COALESCE(sm_in.qty, 0) - COALESCE(sm_out.qty, 0) - COALESCE(tx_sold.qty, 0) AS available_stock
FROM products p
LEFT JOIN LATERAL (
    SELECT SUM(quantity) AS qty FROM stock_movements
    WHERE brand_id = p.brand_id AND sku = p.sku AND quantity > 0
) sm_in ON true
LEFT JOIN LATERAL (
    SELECT SUM(ABS(quantity)) AS qty FROM stock_movements
    WHERE brand_id = p.brand_id AND sku = p.sku AND quantity < 0
) sm_out ON true
LEFT JOIN LATERAL (
    SELECT SUM(quantity_sold) AS qty FROM transactions
    WHERE brand_id = p.brand_id AND sku = p.sku AND status = 'sale'
) tx_sold ON true
WHERE p.is_active = true;

-- 9. Helper function for tenant context (used by RLS if enabled)
CREATE OR REPLACE FUNCTION set_brand_context(p_brand_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_brand_id', p_brand_id::TEXT, true);
END;
$$ LANGUAGE plpgsql;

-- 10. Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_brands_updated') THEN
        CREATE TRIGGER trg_brands_updated BEFORE UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_brand_owners_updated') THEN
        CREATE TRIGGER trg_brand_owners_updated BEFORE UPDATE ON brand_owners FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_stores_updated') THEN
        CREATE TRIGGER trg_stores_updated BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_products_updated') THEN
        CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_transactions_updated') THEN
        CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_stock_movements_updated') THEN
        CREATE TRIGGER trg_stock_movements_updated BEFORE UPDATE ON stock_movements FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;
`;

async function setupDatabase() {
  console.log('=== Woke Portal Database Setup ===');
  console.log('Multi-tenant schema, optimized for 1M+ transactions\n');

  const sql = postgres(connectionString, { max: 1 });

  try {
    // 1. Create schema
    console.log('[1/4] Creating tables, indexes, views, triggers...');
    await sql.unsafe(schemaSQL);
    console.log('      Done.\n');

    // 2. Seed a demo brand + owner
    console.log('[2/4] Seeding demo brand...');
    const existing = await sql`SELECT id FROM brands WHERE subdomain = 'demo'`;
    let brandId: string;

    if (existing.length > 0) {
      brandId = existing[0].id;
      console.log(`      Demo brand already exists (${brandId})`);
    } else {
      const [brand] = await sql`
        INSERT INTO brands (name, subdomain, primary_color, secondary_color)
        VALUES ('Demo Brand', 'demo', '#3b82f6', '#64748b')
        RETURNING id
      `;
      brandId = brand.id;
      console.log(`      Created demo brand (${brandId})`);
    }

    // 3. Seed demo owner
    console.log('[3/4] Seeding demo owner...');
    const existingOwner = await sql`SELECT id FROM brand_owners WHERE email = 'demo@wokeportal.com'`;
    if (existingOwner.length > 0) {
      console.log('      Demo owner already exists');
    } else {
      const passwordHash = await bcrypt.hash('demo123', 10);
      await sql`
        INSERT INTO brand_owners (brand_id, email, password_hash, first_name, last_name, role)
        VALUES (${brandId}, 'demo@wokeportal.com', ${passwordHash}, 'Demo', 'User', 'owner')
      `;
      console.log('      Created demo owner (demo@wokeportal.com / demo123)');
    }

    // 4. Seed sample data for demo brand
    console.log('[4/4] Seeding sample stores & products...');

    await sql`
      INSERT INTO stores (brand_id, name, display_name, code, activation_date)
      VALUES
        (${brandId}, 'Main Store', 'Main Store', 'MAIN', NOW()),
        (${brandId}, 'Branch A', 'Branch A', 'BR-A', NOW()),
        (${brandId}, 'Branch B', 'Branch B', 'BR-B', NOW())
      ON CONFLICT (brand_id, code) DO NOTHING
    `;

    await sql`
      INSERT INTO products (brand_id, sku, big_sku, name, category, cost_price, selling_price)
      VALUES
        (${brandId}, 'SKU001', 'BSKU-A', 'Product Alpha', 'Electronics', 50.00, 99.99),
        (${brandId}, 'SKU002', 'BSKU-A', 'Product Beta', 'Clothing', 20.00, 49.99),
        (${brandId}, 'SKU003', 'BSKU-B', 'Product Gamma', 'Food', 8.00, 19.99),
        (${brandId}, 'SKU004', 'BSKU-B', 'Product Delta', 'Electronics', 120.00, 249.99),
        (${brandId}, 'SKU005', 'BSKU-C', 'Product Epsilon', 'Clothing', 35.00, 79.99)
      ON CONFLICT (brand_id, sku) DO NOTHING
    `;

    // Verify
    const storeCount = await sql`SELECT COUNT(*) AS c FROM stores WHERE brand_id = ${brandId}`;
    const productCount = await sql`SELECT COUNT(*) AS c FROM products WHERE brand_id = ${brandId}`;
    console.log(`      ${storeCount[0].c} stores, ${productCount[0].c} products\n`);

    // Refresh materialized view
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY daily_transaction_summary`;

    console.log('=== Setup complete ===');
    console.log('Login: demo@wokeportal.com / demo123\n');

    await sql.end();
    process.exit(0);
  } catch (error: any) {
    console.error('Setup failed:', error.message || error);
    if (error.message?.includes('CONCURRENTLY')) {
      // First run, no data yet — refresh without CONCURRENTLY
      try { await sql`REFRESH MATERIALIZED VIEW daily_transaction_summary`; } catch {}
      console.log('\n=== Setup complete (first run) ===');
      console.log('Login: demo@wokeportal.com / demo123\n');
      await sql.end();
      process.exit(0);
    }
    await sql.end();
    process.exit(1);
  }
}

setupDatabase();
