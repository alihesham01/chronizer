-- ============================================================
-- Migration 002: Data Archiving Support
-- Archive old transactions and stock movements to separate tables.
-- Uses a lightweight approach: move rows older than 2 years into
-- archive tables via a scheduled function, keeping the main tables fast.
-- ============================================================

-- Archive tables (identical schema minus constraints)
CREATE TABLE IF NOT EXISTS transactions_archive (LIKE transactions INCLUDING ALL);
CREATE TABLE IF NOT EXISTS stock_movements_archive (LIKE stock_movements INCLUDING ALL);

-- Function to archive old data (called by worker cron monthly)
CREATE OR REPLACE FUNCTION archive_old_data(cutoff_months INTEGER DEFAULT 24)
RETURNS TABLE(transactions_archived BIGINT, stock_movements_archived BIGINT) AS $$
DECLARE
  cutoff_date TIMESTAMPTZ;
  tx_count BIGINT;
  sm_count BIGINT;
BEGIN
  cutoff_date := NOW() - (cutoff_months || ' months')::interval;

  -- Move old transactions
  WITH moved AS (
    DELETE FROM transactions
    WHERE transaction_date < cutoff_date
    RETURNING *
  )
  INSERT INTO transactions_archive SELECT * FROM moved;
  GET DIAGNOSTICS tx_count = ROW_COUNT;

  -- Move old stock movements
  WITH moved AS (
    DELETE FROM stock_movements
    WHERE move_date < cutoff_date
    RETURNING *
  )
  INSERT INTO stock_movements_archive SELECT * FROM moved;
  GET DIAGNOSTICS sm_count = ROW_COUNT;

  RETURN QUERY SELECT tx_count, sm_count;
END;
$$ LANGUAGE plpgsql;

-- Record this migration
INSERT INTO schema_migrations (name) VALUES ('002_data_archiving')
ON CONFLICT (name) DO NOTHING;
