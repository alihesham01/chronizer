-- Create optimized inventory view
-- This view calculates current inventory levels efficiently
CREATE OR REPLACE VIEW inventory_summary AS
WITH stock_movements AS (
  -- Calculate net stock movements
  SELECT 
    brand_id,
    sku,
    SUM(CASE 
      WHEN destination = 'warehouse' THEN quantity
      ELSE 0
    END) as warehouse_in,
    SUM(CASE 
      WHEN destination = 'warehouse' THEN 0
      ELSE quantity
    END) as stores_in,
    SUM(CASE 
      WHEN quantity < 0 THEN quantity
      ELSE 0
    END) as stock_out
  FROM stock_moves
  GROUP BY brand_id, sku
),
transaction_sales AS (
  -- Calculate total sold from transactions
  SELECT 
    brand_id,
    sku,
    SUM(quantity_sold) as total_sold
  FROM transactions
  GROUP BY brand_id, sku
),
product_info AS (
  -- Get product information
  SELECT 
    id as brand_id,
    sku,
    big_sku,
    name as item_name,
    colour,
    size,
    unit_selling_price
  FROM products
)
SELECT 
  p.brand_id,
  p.sku,
  p.big_sku,
  p.item_name,
  p.colour,
  p.size,
  p.unit_selling_price,
  COALESCE(sm.warehouse_in, 0) as warehouse_in,
  COALESCE(sm.stores_in, 0) as stores_in,
  COALESCE(sm.stock_out, 0) as stock_out,
  COALESCE(ts.total_sold, 0) as total_sold,
  -- Calculate current inventory
  (COALESCE(sm.warehouse_in, 0) + COALESCE(sm.stores_in, 0) + COALESCE(sm.stock_out, 0) - COALESCE(ts.total_sold, 0)) as current_inventory,
  -- Calculate inventory value
  (COALESCE(sm.warehouse_in, 0) + COALESCE(sm.stores_in, 0) + COALESCE(sm.stock_out, 0) - COALESCE(ts.total_sold, 0)) * p.unit_selling_price as inventory_value,
  -- Status based on inventory level
  CASE 
    WHEN (COALESCE(sm.warehouse_in, 0) + COALESCE(sm.stores_in, 0) + COALESCE(sm.stock_out, 0) - COALESCE(ts.total_sold, 0)) > 0 THEN 'In Stock'
    WHEN (COALESCE(sm.warehouse_in, 0) + COALESCE(sm.stores_in, 0) + COALESCE(sm.stock_out, 0) - COALESCE(ts.total_sold, 0)) = 0 THEN 'Out of Stock'
    ELSE 'Negative Stock'
  END as inventory_status,
  -- Last activity dates
  (SELECT MAX(move_date) FROM stock_moves WHERE sku = p.sku AND brand_id = p.brand_id) as last_stock_move,
  (SELECT MAX(transaction_date) FROM transactions WHERE sku = p.sku AND brand_id = p.brand_id) as last_transaction
FROM product_info p
LEFT JOIN stock_movements sm ON p.sku = sm.sku AND p.brand_id = sm.brand_id
LEFT JOIN transaction_sales ts ON p.sku = ts.sku AND p.brand_id = ts.brand_id
WHERE p.brand_id = (SELECT id FROM brands WHERE subdomain = 'demo');

-- Create indexes for inventory view performance
CREATE INDEX IF NOT EXISTS idx_inventory_brand_sku ON inventory_summary(brand_id, sku);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory_summary(inventory_status);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory_summary(item_name);

-- Create inventory by location view (more detailed breakdown)
CREATE OR REPLACE VIEW inventory_by_location AS
WITH warehouse_stock AS (
  SELECT 
    sm.brand_id,
    sm.sku,
    SUM(CASE 
      WHEN sm.destination = 'warehouse' THEN sm.quantity
      ELSE 0
    END) as warehouse_quantity
  FROM stock_moves sm
  GROUP BY sm.brand_id, sm.sku
),
store_stock AS (
  SELECT 
    sm.brand_id,
    sm.sku,
    sm.destination,
    SUM(sm.quantity) as store_quantity
  FROM stock_moves sm
  WHERE sm.destination != 'warehouse'
  GROUP BY sm.brand_id, sm.sku, sm.destination
),
transactions_sold AS (
  SELECT 
    t.brand_id,
    t.sku,
    COALESCE(s.name, 'warehouse') as location,
    SUM(t.quantity_sold) as quantity_sold
  FROM transactions t
  LEFT JOIN stores s ON t.store_id = s.id
  GROUP BY t.brand_id, t.sku, s.name
)
SELECT 
  p.brand_id,
  p.sku,
  p.big_sku,
  p.item_name,
  COALESCE(ws.warehouse_quantity, 0) as warehouse_quantity,
  COALESCE(ss.store_quantity, 0) as store_quantity,
  COALESCE(ts.quantity_sold, 0) as quantity_sold,
  COALESCE(ws.warehouse_quantity, 0) + COALESCE(ss.store_quantity, 0) - COALESCE(ts.quantity_sold, 0) as available_quantity,
  COALESCE(ss.destination, 'warehouse') as location
FROM products p
LEFT JOIN warehouse_stock ws ON p.sku = ws.sku AND p.brand_id = ws.brand_id
LEFT JOIN store_stock ss ON p.sku = ss.sku AND p.brand_id = ss.brand_id
LEFT JOIN transactions_sold ts ON p.sku = ts.sku AND p.brand_id = ts.brand_id AND COALESCE(ss.destination, 'warehouse') = ts.location
WHERE p.brand_id = (SELECT id FROM brands WHERE subdomain = 'demo');

-- Create a materialized view for even better performance (refresh periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS inventory_snapshot AS
SELECT * FROM inventory_summary;

-- Create function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_inventory_snapshot()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY inventory_snapshot;
END;
$$ LANGUAGE plpgsql;

-- Create index for materialized view
CREATE INDEX IF NOT EXISTS idx_inventory_snapshot_brand_sku ON inventory_snapshot(brand_id, sku);
CREATE INDEX IF NOT EXISTS idx_inventory_snapshot_status ON inventory_snapshot(inventory_status);

-- Grant permissions
GRANT SELECT ON inventory_summary TO chronizer_user;
GRANT SELECT ON inventory_by_location TO chronizer_user;
GRANT SELECT ON inventory_snapshot TO chronizer_user;

-- Initial refresh of materialized view
REFRESH MATERIALIZED VIEW inventory_snapshot;
