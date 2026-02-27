-- Performance indexes for handling 100K+ transactions
-- Run this after the main migration

-- Core transaction indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_brand_id_created_at 
ON transactions(brand_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_brand_id_status 
ON transactions(brand_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_brand_id_date_range 
ON transactions(brand_id, created_at) 
WHERE created_at >= NOW() - INTERVAL '30 days';

-- Analytics indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_brand_id_date 
ON analytics(brand_id, date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_brand_id_type 
ON analytics(brand_id, type);

-- Brand owner indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brand_owners_brand_id_active 
ON brand_owners(brand_id) 
WHERE is_active = true;

-- Session cleanup index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brand_sessions_expires_at 
ON brand_sessions(expires_at) 
WHERE expires_at < NOW();

-- Partial index for recent transactions (optimizes common queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_recent 
ON transactions(brand_id, created_at DESC, amount) 
WHERE created_at >= NOW() - INTERVAL '7 days';

-- JSON indexes for metadata queries (if needed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_metadata_gin 
ON transactions USING gin(metadata);

-- Analytics aggregation indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_aggregations 
ON analytics(brand_id, type, date) 
WHERE type IN ('daily', 'weekly', 'monthly');

-- Partition large tables (for 1M+ transactions)
-- This is optional and can be done later
/*
CREATE TABLE transactions_partitioned (
  LIKE transactions INCLUDING ALL
) PARTITION BY RANGE (created_at);

CREATE TABLE transactions_2024_q1 PARTITION OF transactions_partitioned
FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');

CREATE TABLE transactions_2024_q2 PARTITION OF transactions_partitioned
FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');
*/

-- Update table statistics for query planner
ANALYZE transactions;
ANALYZE analytics;
ANALYZE brands;
ANALYZE brand_owners;

-- Create materialized view for daily analytics (updated every hour)
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_analytics AS
SELECT 
  brand_id,
  DATE(created_at) as date,
  COUNT(*) as transaction_count,
  COALESCE(SUM(amount), 0) as total_amount,
  COALESCE(AVG(amount), 0) as avg_amount,
  COUNT(DISTINCT customer_email) as unique_customers
FROM transactions
GROUP BY brand_id, DATE(created_at)
ORDER BY date DESC;

-- Create unique index for materialized view refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_analytics_unique 
ON daily_analytics(brand_id, date);

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_daily_analytics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_analytics;
END;
$$ LANGUAGE plpgsql;

-- Schedule refresh using pg_cron extension (if available)
-- SELECT cron.schedule('refresh-analytics', '0 * * * *', 'SELECT refresh_daily_analytics()');

-- Performance monitoring query
CREATE OR REPLACE FUNCTION transaction_performance_stats()
RETURNS TABLE(
  table_name text,
  row_count bigint,
  size_mb numeric,
  index_count int
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    schemaname||'.'||tablename as table_name,
    n_tup_ins + n_tup_upd + n_tup_del as row_count,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size_mb,
    (SELECT count(*) FROM pg_indexes WHERE tablename = t.tablename) as index_count
  FROM pg_stat_user_tables t
  WHERE tablename IN ('transactions', 'analytics', 'brand_owners', 'brands');
END;
$$ LANGUAGE plpgsql;

-- Query to check slow queries
-- SELECT query, mean_time, calls, total_time
-- FROM pg_stat_statements
-- WHERE query LIKE '%transactions%'
-- ORDER BY mean_time DESC
-- LIMIT 10;
