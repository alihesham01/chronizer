-- Create stock_moves table
CREATE TABLE IF NOT EXISTS stock_moves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    
    -- Movement Details
    move_date DATE NOT NULL,
    sku VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL, -- Positive = to destination, Negative = from destination
    destination VARCHAR(255) NOT NULL DEFAULT 'warehouse',
    
    -- Reference Fields
    reference_type VARCHAR(50), -- 'supplier', 'store', 'adjustment', 'return'
    reference_id UUID, -- Reference to store, supplier, etc.
    notes TEXT,
    
    -- Auto-populated from Products
    big_sku VARCHAR(255),
    item_name VARCHAR(255),
    colour VARCHAR(100),
    size VARCHAR(50),
    
    -- Calculated Fields
    movement_type VARCHAR(20) GENERATED ALWAYS AS (
      CASE 
        WHEN destination = 'warehouse' AND quantity > 0 THEN 'inbound'
        WHEN destination = 'warehouse' AND quantity < 0 THEN 'outbound'
        WHEN destination != 'warehouse' AND quantity > 0 THEN 'transfer_to'
        WHEN destination != 'warehouse' AND quantity < 0 THEN 'transfer_from'
        ELSE 'adjustment'
      END
    ) STORED,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_stock_move UNIQUE(brand_id, move_date, sku, destination, created_at)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_stock_moves_brand_id ON stock_moves(brand_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_date ON stock_moves(move_date);
CREATE INDEX IF NOT EXISTS idx_stock_moves_sku ON stock_moves(sku);
CREATE INDEX IF NOT EXISTS idx_stock_moves_destination ON stock_moves(destination);
CREATE INDEX IF NOT EXISTS idx_stock_moves_movement_type ON stock_moves(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_moves_date_sku ON stock_moves(move_date, sku);

-- Create trigger for updated_at
CREATE TRIGGER update_stock_moves_updated_at 
    BEFORE UPDATE ON stock_moves 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to auto-populate product data
CREATE OR REPLACE FUNCTION populate_stock_move_product_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-populate product data from products table
  UPDATE stock_moves sm SET
    big_sku = p.big_sku,
    item_name = p.name,
    colour = p.colour,
    size = p.size
  FROM products p
  WHERE sm.sku = p.sku 
    AND sm.brand_id = p.brand_id
    AND (sm.big_sku IS NULL OR sm.item_name IS NULL);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-populate on insert or update
CREATE TRIGGER trigger_populate_stock_move_product_data
  AFTER INSERT OR UPDATE OF sku ON stock_moves
  FOR EACH ROW
  EXECUTE FUNCTION populate_stock_move_product_data();

-- Create a stock summary view
CREATE OR REPLACE VIEW stock_summary AS
SELECT 
  brand_id,
  sku,
  big_sku,
  item_name,
  colour,
  size,
  SUM(CASE 
    WHEN destination = 'warehouse' THEN quantity
    ELSE 0
  END) as warehouse_quantity,
  SUM(CASE 
    WHEN destination != 'warehouse' THEN quantity
    ELSE 0
  END) as stores_quantity,
  SUM(CASE 
    WHEN destination != 'warehouse' THEN quantity
    ELSE 0
  END) * -1 as total_in_stores, -- Negative because sending to store reduces warehouse stock
  SUM(quantity) as net_quantity,
  COUNT(*) as total_moves
FROM stock_moves
GROUP BY brand_id, sku, big_sku, item_name, colour, size;

-- Create a stock balance by destination view
CREATE OR REPLACE VIEW stock_balance_by_destination AS
SELECT 
  brand_id,
  sku,
  destination,
  SUM(quantity) as balance,
  COUNT(*) as move_count,
  MAX(move_date) as last_move_date
FROM stock_moves
GROUP BY brand_id, sku, destination;

-- Insert sample data
INSERT INTO stock_moves (brand_id, move_date, sku, quantity, destination, notes) VALUES
  ((SELECT id FROM brands WHERE subdomain = 'demo'), '2024-01-10', 'WIN-001', 100, 'warehouse', 'Initial stock from supplier'),
  ((SELECT id FROM brands WHERE subdomain = 'demo'), '2024-01-15', 'WIN-001', 20, 'Main Store', 'Transfer to main store'),
  ((SELECT id FROM brands WHERE subdomain = 'demo'), '2024-01-16', 'WIN-002', 50, 'warehouse', 'New stock from supplier'),
  ((SELECT id FROM brands WHERE subdomain = 'demo'), '2024-01-17', 'WIN-001', -5, 'Main Store', 'Return to warehouse'),
  ((SELECT id FROM brands WHERE subdomain = 'demo'), '2024-01-18', 'WIN-002', 15, 'Downtown Branch', 'Transfer to downtown'),
  ((SELECT id FROM brands WHERE subdomain = 'demo'), '2024-01-20', 'WIN-001', -10, 'Downtown Branch', 'Return from downtown');
