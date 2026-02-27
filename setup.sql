-- Brand Owners
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
CREATE INDEX IF NOT EXISTS idx_brand_owners_brand_id ON brand_owners (brand_id) WHERE is_active = true;

-- Stores
CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    location TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    manager_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stores_brand_id ON stores (brand_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_stores_name ON stores (brand_id, name) WHERE is_active = true;

-- Products
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    cost_price DECIMAL(10,2),
    selling_price DECIMAL(10,2),
    reorder_level INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products (brand_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_sku ON products (brand_id, sku) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_category ON products (brand_id, category) WHERE is_active = true;

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('sale', 'purchase', 'adjustment')),
    total_amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(50),
    reference_number VARCHAR(100),
    notes TEXT,
    transaction_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_brand_id ON transactions (brand_id);
CREATE INDEX IF NOT EXISTS idx_transactions_store_id ON transactions (brand_id, store_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (brand_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (brand_id, transaction_type);

-- Stock Movements
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('in', 'out')),
    quantity INTEGER NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    notes TEXT,
    movement_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_brand_id ON stock_movements (brand_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements (brand_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_store_id ON stock_movements (brand_id, store_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements (brand_id, movement_date);

-- Transaction Items
CREATE TABLE IF NOT EXISTS transaction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON transaction_items (transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_product_id ON transaction_items (product_id);

-- Inventory View
CREATE OR REPLACE VIEW inventory_view AS
SELECT 
    p.brand_id,
    p.id as product_id,
    p.sku,
    p.name as product_name,
    p.category,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'in' THEN sm.quantity ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN sm.movement_type = 'out' THEN sm.quantity ELSE 0 END), 0) as quantity,
    p.reorder_level,
    p.cost_price,
    p.selling_price,
    p.updated_at
FROM products p
LEFT JOIN stock_movements sm ON p.id = sm.product_id
WHERE p.is_active = true
GROUP BY p.id, p.brand_id, p.sku, p.name, p.category, p.reorder_level, p.cost_price, p.selling_price, p.updated_at;

-- Updated At Trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_brands_updated_at BEFORE UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_brand_owners_updated_at BEFORE UPDATE ON brand_owners FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
