-- ═══════════════════════════════════════════════════════════════════════
-- SAFETY MIGRATION: Run in pgAdmin after migrate-new-features.sql
-- Idempotent — safe to run multiple times.
--
-- 1. Row-Level Security (tenant isolation at DB level)
-- 2. Idempotency columns (prevent duplicate imports)
-- 3. Append-only audit log (immutable activity_log)
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. ADMIN CONTEXT HELPER ───────────────────────────────────────────
-- set_brand_context already exists from setup-db.ts
-- Add set_admin_context for admin routes

CREATE OR REPLACE FUNCTION set_admin_context()
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.is_admin', 'true', true);
END;
$$ LANGUAGE plpgsql;

-- ─── 2. ROW-LEVEL SECURITY ─────────────────────────────────────────────
-- Policy logic:
--   • If app.current_brand_id is set → only that brand's rows visible
--   • If app.is_admin = 'true'       → all rows visible
--   • If neither is set              → no rows visible (safe default)
-- NULLIF('','')::uuid → NULL → brand_id = NULL → false (safe)

-- Enable RLS on all brand-scoped tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notifications') THEN
        ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
        ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
    END IF;
END
$$;
ALTER TABLE unmapped_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE sku_store_map ENABLE ROW LEVEL SECURITY;

-- Force RLS for these tables (bypasses table owner privileges)
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE stores FORCE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE unmapped_skus FORCE ROW LEVEL SECURITY;
ALTER TABLE sku_store_map FORCE ROW LEVEL SECURITY;

-- ── products ──
DROP POLICY IF EXISTS tenant_isolation ON products;
CREATE POLICY tenant_isolation ON products FOR ALL
  USING (
    brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    OR current_setting('app.is_admin', true) = 'true'
  )
  WITH CHECK (
    brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    OR current_setting('app.is_admin', true) = 'true'
  );

-- ── transactions ──
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON transactions;
CREATE POLICY tenant_isolation ON transactions FOR ALL
  USING (
    brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    OR current_setting('app.is_admin', true) = 'true'
  )
  WITH CHECK (
    brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    OR current_setting('app.is_admin', true) = 'true'
  );

-- ── stock_movements ──
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON stock_movements;
CREATE POLICY tenant_isolation ON stock_movements FOR ALL
  USING (
    brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    OR current_setting('app.is_admin', true) = 'true'
  )
  WITH CHECK (
    brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    OR current_setting('app.is_admin', true) = 'true'
  );

-- ── notifications (if exists) ──
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notifications') THEN
        ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
        ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON notifications;
        CREATE POLICY tenant_isolation ON notifications FOR ALL
          USING (
            brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
            OR owner_id = NULLIF(current_setting('app.current_owner_id', true), '')::uuid
            OR current_setting('app.is_admin', true) = 'true'
          )
          WITH CHECK (
            brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
            OR current_setting('app.is_admin', true) = 'true'
          );
    END IF;
END
$$;

-- ── unmapped_skus ──
ALTER TABLE unmapped_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE unmapped_skus FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON unmapped_skus;
CREATE POLICY tenant_isolation ON unmapped_skus FOR ALL
  USING (
    brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    OR current_setting('app.is_admin', true) = 'true'
  )
  WITH CHECK (
    brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    OR current_setting('app.is_admin', true) = 'true'
  );

-- ── sku_store_map ──
ALTER TABLE sku_store_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE sku_store_map FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON sku_store_map;
CREATE POLICY tenant_isolation ON sku_store_map FOR ALL
  USING (
    brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    OR current_setting('app.is_admin', true) = 'true'
  )
  WITH CHECK (
    brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    OR current_setting('app.is_admin', true) = 'true'
  );

-- NOTE: brands, brand_owners, activity_log, invite_links do NOT get RLS
-- brands       → tenant table itself, admin needs full access
-- brand_owners → auth routes need cross-brand email lookup
-- activity_log → protected by append-only trigger instead
-- invite_links → admin-only management

-- ─── 3. IDEMPOTENCY COLUMNS ────────────────────────────────────────────
-- request_id: client-generated UUID to prevent duplicate creates on retry
-- import_run_id: groups rows from a single CSV import

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS request_id VARCHAR(255);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_run_id UUID;

-- Unique constraint: same brand + request_id = duplicate (only when not null)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_txn_brand_request_id'
  ) THEN
    CREATE UNIQUE INDEX uq_txn_brand_request_id
      ON transactions (brand_id, request_id) WHERE request_id IS NOT NULL;
  END IF;
END $$;

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS request_id VARCHAR(255);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_sm_brand_request_id'
  ) THEN
    CREATE UNIQUE INDEX uq_sm_brand_request_id
      ON stock_movements (brand_id, request_id) WHERE request_id IS NOT NULL;
  END IF;
END $$;

-- ─── 4. APPEND-ONLY AUDIT LOG ──────────────────────────────────────────
-- Prevent UPDATE and DELETE on activity_log after creation

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only: % operations are not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_no_update ON activity_log;
CREATE TRIGGER audit_no_update
  BEFORE UPDATE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

DROP TRIGGER IF EXISTS audit_no_delete ON activity_log;
CREATE TRIGGER audit_no_delete
  BEFORE DELETE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- ─── 5. VERIFY ─────────────────────────────────────────────────────────
DO $$ BEGIN
  RAISE NOTICE 'Safety migration completed:';
  RAISE NOTICE '  ✓ RLS enabled + forced on 7 tables';
  RAISE NOTICE '  ✓ Idempotency columns on transactions + stock_movements';
  RAISE NOTICE '  ✓ Append-only triggers on activity_log';
END $$;

SELECT 'Safety migration completed successfully!' AS result;
