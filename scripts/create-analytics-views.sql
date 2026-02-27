-- Analytics Materialized Views for Fast Aggregations
-- Run this after setup-db.ts

-- 1. Daily Transaction Summary
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_transaction_summary AS
SELECT 
  DATE(date) as transaction_date,
  store_name,
  COUNT(*) as transaction_count,
  SUM(quantity) as total_quantity,
  SUM(total_amount) as total_revenue,
  AVG(selling_price) as avg_price,
  COUNT(DISTINCT sku) as unique_skus
FROM transactions
GROUP BY DATE(date), store_name
ORDER BY transaction_date DESC, store_name;

CREATE INDEX idx_daily_summary_date ON daily_transaction_summary(transaction_date);
CREATE INDEX idx_daily_summary_store ON daily_transaction_summary(store_name);

-- 2. SKU Performance Summary
CREATE MATERIALIZED VIEW IF NOT EXISTS sku_performance AS
SELECT 
  sku,
  COUNT(*) as transaction_count,
  SUM(quantity) as total_quantity_sold,
  SUM(total_amount) as total_revenue,
  AVG(selling_price) as avg_selling_price,
  MIN(selling_price) as min_price,
  MAX(selling_price) as max_price,
  COUNT(DISTINCT store_name) as stores_count,
  MAX(date) as last_transaction_date
FROM transactions
GROUP BY sku
ORDER BY total_revenue DESC;

CREATE INDEX idx_sku_perf_sku ON sku_performance(sku);
CREATE INDEX idx_sku_perf_revenue ON sku_performance(total_revenue DESC);

-- 3. Store Performance Summary
CREATE MATERIALIZED VIEW IF NOT EXISTS store_performance AS
SELECT 
  store_name,
  COUNT(*) as transaction_count,
  SUM(quantity) as total_quantity,
  SUM(total_amount) as total_revenue,
  AVG(total_amount) as avg_transaction_value,
  COUNT(DISTINCT sku) as unique_skus,
  COUNT(DISTINCT DATE(date)) as active_days,
  MAX(date) as last_transaction_date,
  MIN(date) as first_transaction_date
FROM transactions
GROUP BY store_name
ORDER BY total_revenue DESC;

CREATE INDEX idx_store_perf_name ON store_performance(store_name);
CREATE INDEX idx_store_perf_revenue ON store_performance(total_revenue DESC);

-- 4. Hourly Transaction Trends
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_trends AS
SELECT 
  DATE(date) as transaction_date,
  EXTRACT(HOUR FROM date) as hour,
  COUNT(*) as transaction_count,
  SUM(total_amount) as total_revenue,
  AVG(total_amount) as avg_transaction_value
FROM transactions
GROUP BY DATE(date), EXTRACT(HOUR FROM date)
ORDER BY transaction_date DESC, hour;

CREATE INDEX idx_hourly_date ON hourly_trends(transaction_date);
CREATE INDEX idx_hourly_hour ON hourly_trends(hour);

-- 5. Product Category Performance (if categories exist)
CREATE MATERIALIZED VIEW IF NOT EXISTS category_performance AS
SELECT 
  SUBSTRING(sku, 1, 3) as category, -- First 3 chars as category
  COUNT(*) as transaction_count,
  SUM(quantity) as total_quantity,
  SUM(total_amount) as total_revenue,
  AVG(selling_price) as avg_price,
  COUNT(DISTINCT store_name) as stores_count
FROM transactions
GROUP BY SUBSTRING(sku, 1, 3)
ORDER BY total_revenue DESC;

CREATE INDEX idx_category_perf ON category_performance(category);

-- 6. Monthly Revenue Trends
CREATE MATERIALIZED VIEW IF NOT EXISTS monthly_revenue AS
SELECT 
  DATE_TRUNC('month', date) as month,
  COUNT(*) as transaction_count,
  SUM(total_amount) as total_revenue,
  AVG(total_amount) as avg_transaction_value,
  COUNT(DISTINCT store_name) as active_stores,
  COUNT(DISTINCT sku) as unique_skus
FROM transactions
GROUP BY DATE_TRUNC('month', date)
ORDER BY month DESC;

CREATE INDEX idx_monthly_month ON monthly_revenue(month);

-- 7. Top Performing SKUs (Last 30 Days)
CREATE MATERIALIZED VIEW IF NOT EXISTS top_skus_30d AS
SELECT 
  sku,
  COUNT(*) as transaction_count,
  SUM(quantity) as total_quantity,
  SUM(total_amount) as total_revenue,
  AVG(selling_price) as avg_price
FROM transactions
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY sku
ORDER BY total_revenue DESC
LIMIT 100;

CREATE INDEX idx_top_skus_sku ON top_skus_30d(sku);

-- 8. Store Comparison Matrix
CREATE MATERIALIZED VIEW IF NOT EXISTS store_comparison AS
SELECT 
  store_name,
  DATE_TRUNC('week', date) as week,
  COUNT(*) as transaction_count,
  SUM(total_amount) as weekly_revenue,
  AVG(total_amount) as avg_transaction_value,
  COUNT(DISTINCT sku) as unique_skus
FROM transactions
GROUP BY store_name, DATE_TRUNC('week', date)
ORDER BY week DESC, weekly_revenue DESC;

CREATE INDEX idx_store_comp_name ON store_comparison(store_name);
CREATE INDEX idx_store_comp_week ON store_comparison(week);

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_all_analytics_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_transaction_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY sku_performance;
  REFRESH MATERIALIZED VIEW CONCURRENTLY store_performance;
  REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_trends;
  REFRESH MATERIALIZED VIEW CONCURRENTLY category_performance;
  REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue;
  REFRESH MATERIALIZED VIEW CONCURRENTLY top_skus_30d;
  REFRESH MATERIALIZED VIEW CONCURRENTLY store_comparison;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to refresh views (requires pg_cron extension)
-- Uncomment if pg_cron is available:
-- SELECT cron.schedule('refresh-analytics', '*/15 * * * *', 'SELECT refresh_all_analytics_views()');

COMMENT ON MATERIALIZED VIEW daily_transaction_summary IS 'Daily aggregated transaction metrics by store';
COMMENT ON MATERIALIZED VIEW sku_performance IS 'Overall SKU performance metrics';
COMMENT ON MATERIALIZED VIEW store_performance IS 'Overall store performance metrics';
COMMENT ON MATERIALIZED VIEW hourly_trends IS 'Hourly transaction patterns';
COMMENT ON MATERIALIZED VIEW category_performance IS 'Product category performance';
COMMENT ON MATERIALIZED VIEW monthly_revenue IS 'Monthly revenue trends';
COMMENT ON MATERIALIZED VIEW top_skus_30d IS 'Top 100 SKUs in last 30 days';
COMMENT ON MATERIALIZED VIEW store_comparison IS 'Weekly store performance comparison';
