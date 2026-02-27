-- Create inventory summary view
CREATE OR REPLACE VIEW inventory_summary AS
WITH stock_movements AS (
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
  SELECT 
    brand_id,
    sku,
    SUM(quantity_sold) as total_sold
  FROM transactions
  GROUP BY brand_id, sku
)
SELECT 
  p.brand_id,
  p.sku,
  p.big_sku,
  p.name as item_name,
  p.colour,
  p.size,
  p.unit_selling_price,
  COALESCE(sm.warehouse_in, 0) as warehouse_in,
  COALESCE(sm.stores_in, 0) as stores_in,
  COALESCE(sm.stock_out, 0) as stock_out,
  COALESCE(ts.total_sold, 0) as total_sold,
  (COALESCE(sm.warehouse_in, 0) + COALESCE(sm.stores_in, 0) + COALESCE(sm.stock_out, 0) - COALESCE(ts.total_sold, 0)) as current_inventory,
  (COALESCE(sm.warehouse_in, 0) + COALESCE(sm.stores_in, 0) + COALESCE(sm.stock_out, 0) - COALESCE(ts.total_sold, 0)) * p.unit_selling_price as inventory_value,
  CASE 
    WHEN (COALESCE(sm.warehouse_in, 0) + COALESCE(sm.stores_in, 0) + COALESCE(sm.stock_out, 0) - COALESCE(ts.total_sold, 0)) > 0 THEN 'In Stock'
    WHEN (COALESCE(sm.warehouse_in, 0) + COALESCE(sm.stores_in, 0) + COALESCE(sm.stock_out, 0) - COALESCE(ts.total_sold, 0)) = 0 THEN 'Out of Stock'
    ELSE 'Negative Stock'
  END as inventory_status,
  (SELECT MAX(move_date) FROM stock_moves WHERE sku = p.sku AND brand_id = p.brand_id) as last_stock_move,
  (SELECT MAX(transaction_date) FROM transactions WHERE sku = p.sku AND brand_id = p.brand_id) as last_transaction
FROM products p
LEFT JOIN stock_movements sm ON p.sku = sm.sku AND p.brand_id = sm.brand_id
LEFT JOIN transaction_sales ts ON p.sku = ts.sku AND p.brand_id = ts.brand_id
WHERE p.brand_id = (SELECT id FROM brands WHERE subdomain = 'demo');

-- Create materialized view for performance
DROP MATERIALIZED VIEW IF EXISTS inventory_snapshot;
CREATE MATERIALIZED VIEW inventory_snapshot AS
SELECT * FROM inventory_summary;

-- Create indexes
CREATE INDEX idx_inventory_snapshot_brand_sku ON inventory_snapshot(brand_id, sku);
CREATE INDEX idx_inventory_snapshot_status ON inventory_snapshot(inventory_status);

-- Grant permissions
GRANT SELECT ON inventory_summary TO chronizer_user;
GRANT SELECT ON inventory_snapshot TO chronizer_user;

-- Refresh materialized view
REFRESH MATERIALIZED VIEW inventory_snapshot;
