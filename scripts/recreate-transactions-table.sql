-- Drop existing transactions table and recreate with new structure
DROP TABLE IF EXISTS transactions CASCADE;

-- Create new transactions table with required columns
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    
    -- Transaction Details
    transaction_date DATE NOT NULL,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    sku VARCHAR(255) NOT NULL,
    quantity_sold INTEGER NOT NULL,
    selling_price DECIMAL(10, 2) NOT NULL,
    
    -- Auto-populated from Products
    big_sku VARCHAR(255),
    item_name VARCHAR(255),
    colour VARCHAR(100),
    size VARCHAR(50),
    
    -- Status: sale (>0), return (<0), adjustment (=0)
    status VARCHAR(20) GENERATED ALWAYS AS (
      CASE 
        WHEN quantity_sold < 0 THEN 'return'
        WHEN quantity_sold > 0 THEN 'sale'
        ELSE 'adjustment'
      END
    ) STORED,
    
    -- Metadata
    customer_id VARCHAR(255),
    payment_method VARCHAR(50),
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_transaction UNIQUE(brand_id, transaction_date, store_id, sku, created_at)
);

-- Create indexes for performance
CREATE INDEX idx_transactions_brand_id ON transactions(brand_id);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_store_id ON transactions(store_id);
CREATE INDEX idx_transactions_sku ON transactions(sku);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_date_store ON transactions(transaction_date, store_id);

-- Create trigger for updated_at
CREATE TRIGGER update_transactions_updated_at 
    BEFORE UPDATE ON transactions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to auto-populate product data
CREATE OR REPLACE FUNCTION populate_transaction_product_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-populate product data from products table
  UPDATE transactions t SET
    big_sku = p.big_sku,
    item_name = p.name,
    colour = p.colour,
    size = p.size
  FROM products p
  WHERE t.sku = p.sku 
    AND t.brand_id = p.brand_id
    AND (t.big_sku IS NULL OR t.item_name IS NULL);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-populate on insert or update
CREATE TRIGGER trigger_populate_product_data
  AFTER INSERT OR UPDATE OF sku ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION populate_transaction_product_data();

-- Insert sample data
INSERT INTO transactions (brand_id, transaction_date, store_id, sku, quantity_sold, selling_price) VALUES
  ((SELECT id FROM brands WHERE subdomain = 'demo'), '2024-01-15', (SELECT id FROM stores WHERE name = 'Main Store' LIMIT 1), 'WIN-001', 5, 150.00),
  ((SELECT id FROM brands WHERE subdomain = 'demo'), '2024-01-15', (SELECT id FROM stores WHERE name = 'Main Store' LIMIT 1), 'WIN-002', 3, 200.00),
  ((SELECT id FROM brands WHERE subdomain = 'demo'), '2024-01-16', (SELECT id FROM stores WHERE name = 'Downtown Branch' LIMIT 1), 'WIN-001', -1, 150.00),
  ((SELECT id FROM brands WHERE subdomain = 'demo'), '2024-01-16', (SELECT id FROM stores WHERE name = 'Mall Location' LIMIT 1), 'WIN-003', 10, 75.00);
