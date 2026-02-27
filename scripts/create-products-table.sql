-- Create products table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    sku VARCHAR(50) NOT NULL,
    big_sku VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    size VARCHAR(50),
    colour VARCHAR(50),
    unit_production_cost DECIMAL(10, 2),
    unit_selling_price DECIMAL(10, 2),
    type VARCHAR(50),
    lead_time_days INTEGER,
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_brand_sku UNIQUE(brand_id, sku)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_products_updated_at 
    BEFORE UPDATE ON products 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add sample products for demo brand
INSERT INTO products (
    brand_id, sku, big_sku, name, size, colour, 
    unit_production_cost, unit_selling_price, type, lead_time_days
) SELECT 
    b.id,
    'DEMO-001',
    'DEMO-BIG-001',
    'Demo Product 1',
    'M',
    'Blue',
    10.50,
    25.99,
    'Electronics',
    7
FROM brands b WHERE b.subdomain = 'demo'
ON CONFLICT (brand_id, sku) DO NOTHING;

INSERT INTO products (
    brand_id, sku, big_sku, name, size, colour, 
    unit_production_cost, unit_selling_price, type, lead_time_days
) SELECT 
    b.id,
    'DEMO-002',
    'DEMO-BIG-002',
    'Demo Product 2',
    'L',
    'Red',
    15.75,
    35.99,
    'Clothing',
    14
FROM brands b WHERE b.subdomain = 'demo'
ON CONFLICT (brand_id, sku) DO NOTHING;

INSERT INTO products (
    brand_id, sku, big_sku, name, size, colour, 
    unit_production_cost, unit_selling_price, type, lead_time_days
) SELECT 
    b.id,
    'DEMO-003',
    'DEMO-BIG-003',
    'Demo Product 3',
    'S',
    'Green',
    8.25,
    19.99,
    'Accessories',
    5
FROM brands b WHERE b.subdomain = 'demo'
ON CONFLICT (brand_id, sku) DO NOTHING;
