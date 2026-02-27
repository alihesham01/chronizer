-- Create stores table
CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    
    -- Store Information
    name VARCHAR(255) NOT NULL,
    "group" VARCHAR(100),
    commission DECIMAL(5, 2), -- Commission percentage (e.g., 15.50)
    rent DECIMAL(10, 2), -- Monthly rent amount
    activation_date DATE,
    deactivation_date DATE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_brand_store_name UNIQUE(brand_id, name)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_stores_brand_id ON stores(brand_id);
CREATE INDEX IF NOT EXISTS idx_stores_name ON stores(name);
CREATE INDEX IF NOT EXISTS idx_stores_group ON stores("group");
CREATE INDEX IF NOT EXISTS idx_stores_activation_date ON stores(activation_date);
CREATE INDEX IF NOT EXISTS idx_stores_deactivation_date ON stores(deactivation_date);

-- Insert sample data for demo brand
INSERT INTO stores (brand_id, name, "group", commission, rent, activation_date, deactivation_date) VALUES
    ((SELECT id FROM brands WHERE subdomain = 'demo'), 'Main Store', 'A', 15.00, 5000.00, '2024-01-01', NULL),
    ((SELECT id FROM brands WHERE subdomain = 'demo'), 'Downtown Branch', 'A', 12.50, 3500.00, '2024-02-15', NULL),
    ((SELECT id FROM brands WHERE subdomain = 'demo'), 'Mall Location', 'B', 18.00, 7500.00, '2024-03-01', NULL),
    ((SELECT id FROM brands WHERE subdomain = 'demo'), 'Airport Store', 'B', 20.00, 8000.00, '2024-01-15', '2024-12-31'),
    ((SELECT id FROM brands WHERE subdomain = 'demo'), 'Online Store', 'C', 10.00, 0.00, '2024-01-01', NULL);

-- Create trigger for updated_at
CREATE TRIGGER update_stores_updated_at 
    BEFORE UPDATE ON stores 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
