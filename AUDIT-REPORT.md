# Production Readiness Audit Report
**System**: Chronizer / Woke Portal  
**Date**: March 2, 2026  
**Scope**: Full codebase inspection — backend, frontend, scrapers, DB, Docker

---

## Executive Summary

**Top 5 most dangerous things, ranked by blast radius:**

1. **Portal passwords stored in plain text** in `store_portal_creds` — a single DB read leaks every brand's portal credentials to every e-commerce portal they use.
2. **Scheduler bypasses RLS entirely** — `src/scrapers/scheduler.ts:17` uses raw `query()` instead of `brandQuery()`, reading all brands' credentials in one query with no tenant isolation.
3. **Tenant middleware silently continues on invalid tokens** — `src/index.ts:98-101` returns `await next()` when no Bearer token is present, meaning unauthenticated requests reach route handlers that may not check `getBrandId()`.
4. **No migration exists for `store_portal_creds`** — the table the scraper system depends on has no CREATE TABLE anywhere in the codebase. It was created manually or doesn't exist yet, meaning deploys to new environments will fail.
5. **Cache clear and cache stats endpoints are unauthenticated** — `src/index.ts:204-211` exposes `/api/cache/clear` (POST) and `/api/cache/stats` (GET) with zero auth checks. Anyone can flush the cache.

---

## 1. Critical Security Issues

### 1.1 Portal Passwords Stored in Plain Text
- **What**: `src/routes/scrapers.routes.ts:25-31` inserts `portal_password` directly into `store_portal_creds` as plain text. Every read (`scheduler.ts:18`, `scrapers.routes.ts:72`, `scrapers.routes.ts:186`) retrieves the raw password.
- **Why dangerous**: A single SQL injection, DB backup leak, or admin account compromise exposes every brand's portal login to Locally, Mr Lokal, etc. These are real third-party credentials.
- **Fix**: Encrypt at rest using AES-256-GCM with a server-side key:
```typescript
// src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
const ENCRYPTION_KEY = process.env.PORTAL_CRED_KEY!; // 32-byte hex
export function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}
export function decrypt(data: string): string {
  const [ivHex, tagHex, encrypted] = data.split(':');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

### 1.2 Unauthenticated Cache Endpoints
- **What**: `src/index.ts:204-211` — `/api/cache/clear` (POST) and `/api/cache/stats` (GET) have no auth middleware.
- **Why dangerous**: Anyone can flush the entire cache (DoS) or inspect cache contents for fingerprinting.
- **Fix**: Move these under admin routes or add auth check:
```typescript
app.post('/api/cache/clear', requireAuth, (c) => { ... });
```

### 1.3 JWT Fallback Secret in Dev
- **What**: `src/config/env.ts:7` — `JWT_SECRET` defaults to `'fallback-dev-secret-change-me'`. Production check exists at line 28, but only if `NODE_ENV=production` is set.
- **Why dangerous**: If deployed without `NODE_ENV=production` (common Docker misconfiguration), all tokens are signed with a known secret.
- **Fix**: Remove the default entirely. Force crash if JWT_SECRET is not explicitly set:
```typescript
JWT_SECRET: z.string().min(32), // No default
```

### 1.4 CORS Wildcard in Development
- **What**: `src/index.ts:70-72` — CORS origin is `'*'` in non-production mode.
- **Why dangerous**: If `NODE_ENV` isn't set to `production`, any website can make authenticated requests to the API.
- **Fix**: Always use explicit origins:
```typescript
origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
```

### 1.5 localStorage Token Storage
- **What**: `frontend/app/register/page.tsx:104`, `frontend/lib/auth-guard.tsx:15,35-44` — JWT token stored in `localStorage`.
- **Why dangerous**: Vulnerable to XSS attacks. Any injected script can steal the token.
- **Fix**: Use `httpOnly` cookies instead. This is a larger refactor but critical for production. Short-term: ensure strict CSP headers are enforced.

### 1.6 Error Handler Leaks Stack Traces
- **What**: `src/middleware/error.ts:33` — `stack: err.stack` is included when `NODE_ENV === 'development'`. Combined with 1.3, this can leak in production.
- **Why dangerous**: Stack traces reveal file paths, library versions, and internal architecture.
- **Fix**: Only include stack trace if explicitly opted in:
```typescript
...(process.env.DEBUG_ERRORS === 'true' && { stack: err.stack })
```

### 1.7 No Rate Limiting on Scraper Endpoints
- **What**: Scraper routes (`/api/scrapers/*`) inherit only the global 500/15min limit. No per-endpoint limit.
- **Why dangerous**: A compromised account can trigger unlimited scrapes, hammering third-party portals and potentially getting the IP blocked.
- **Fix**: Add specific rate limits:
```typescript
scrapers.use('/*', rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'scraper' }));
```

---

## 2. Auth & Multi-Tenancy Isolation

### 2.1 Scheduler Bypasses RLS (CRITICAL)
- **Where**: `src/scrapers/scheduler.ts:17-21`
- **What**: Uses `query()` (raw pool query) to fetch ALL brands' portal credentials in one shot: `SELECT spc.brand_id, spc.group_name, spc.portal_email, spc.portal_password FROM store_portal_creds spc`.
- **Why dangerous**: This query runs without any RLS context. If `store_portal_creds` has RLS enabled, this will return 0 rows and silently break. If RLS is not enabled on this table, all credentials are exposed in a single query.
- **Additional**: Lines 39-41, 58, 60, 71-76, 79-82, 94, 96-99, 104-107, 113 also use raw `query()` instead of `brandQuery()`.
- **Fix**: The scheduler must iterate brands first, then use `brandQuery(brandId, ...)` for each:
```typescript
const brands = await query('SELECT DISTINCT brand_id FROM store_portal_creds WHERE first_scrape_done = true');
for (const { brand_id } of brands.rows) {
  const credRes = await brandQuery(brand_id, 'SELECT ... FROM store_portal_creds WHERE brand_id = $1', [brand_id]);
  // ... process within brand context
}
```

### 2.2 Tenant Middleware Doesn't Reject
- **Where**: `src/index.ts:88-136`
- **What**: If no `Authorization` header is present, the middleware calls `await next()` — it doesn't reject. This means unauthenticated requests reach route handlers. Security depends entirely on each controller calling `getBrandId(c)` which throws if brandId is missing.
- **Risk**: If any route handler forgets to call `getBrandId(c)`, it processes without tenant context.
- **Affected routes that DO enforce**: All controllers use `getBrandId(c)` ✅
- **Unprotected routes**: `/api/cache/clear`, `/api/cache/stats` — no auth at all ❌

### 2.3 Admin Routes Use `db.query()` Directly
- **Where**: `src/routes/admin.routes.ts:18` (requireAdmin), lines 65-72, 78-86, 325-333, 428-432, 439-441, 457-461, 464-466, 483-492, 540-542, 552-554
- **What**: Multiple admin queries use `db.query()` directly, bypassing RLS.
- **Assessment**: This is **intentional** — admin needs cross-tenant access. The `requireAdmin` middleware at line 30 (`admin.use('/*', requireAdmin)`) enforces admin status. This is acceptable **if** the `is_admin` flag is properly secured.
- **Risk**: If an attacker can set `is_admin = true` on any `brand_owners` row, they get full cross-tenant access. There's no separate admin auth flow — admin and regular users share the same JWT structure.

### 2.4 `store_portal_creds` Has No RLS Policy
- **Where**: Not in `migrate-safety.sql`, not in `migrate-scrapers.sql`, no CREATE TABLE exists anywhere.
- **What**: The migration in `migrate-scrapers.sql` creates `store_credentials` (different table!) with `pgp_sym_encrypt`. But the actual code uses `store_portal_creds` which has no migration, no RLS policy.
- **Fix**: Create a proper migration:
```sql
CREATE TABLE IF NOT EXISTS store_portal_creds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    group_name VARCHAR(100) NOT NULL,
    portal_email VARCHAR(255) NOT NULL,
    portal_password TEXT NOT NULL, -- TODO: encrypt
    first_scrape_done BOOLEAN DEFAULT false,
    last_scraped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand_id, group_name)
);
ALTER TABLE store_portal_creds ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_portal_creds FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON store_portal_creds FOR ALL
  USING (
    brand_id = NULLIF(current_setting('app.current_brand_id', true), '')::uuid
    OR current_setting('app.is_admin', true) = 'true'
  );
```

---

## 3. Reliability & Data Integrity

### 3.1 No Scrape Job Tracking
- **What**: Scrapes run fire-and-forget. No table records whether a scrape started, succeeded, failed, how long it took, or how many records were processed.
- **Silent failure**: If the daily scrape at 1:00 AM fails for a brand, nobody knows until they manually notice missing data.
- **Fix**: Add a `scrape_jobs` table:
```sql
CREATE TABLE scrape_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL,
    group_name VARCHAR(100) NOT NULL,
    job_type VARCHAR(20) NOT NULL, -- 'initial', 'daily'
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending','running','completed','failed'
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    transactions_found INTEGER DEFAULT 0,
    transactions_inserted INTEGER DEFAULT 0,
    inventory_items INTEGER DEFAULT 0,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 No Retry Logic
- **Where**: `src/scrapers/scheduler.ts:117-119` — catches error, logs it, moves to next brand.
- **What**: If a portal is temporarily down (maintenance window, rate limit, network blip), that day's data is permanently lost.
- **Fix**: Implement retry with exponential backoff (3 attempts, 5min/15min/60min delays). Store retry count in `scrape_jobs`.

### 3.3 Puppeteer Crash = Leaked Browser Process
- **Where**: `src/scrapers/stores/mrlokal.scraper.ts:12-21`
- **What**: If `page.goto()` throws before reaching the `finally` block, or if the process crashes mid-scrape, the Chromium process is never killed.
- **Impact**: Memory leak. At 200+ MB per Chromium instance, this exhausts the 512MB container limit quickly.
- **Fix**: Add global timeout wrapper + process cleanup:
```typescript
async fetchTransactions(...) {
  const page = await this.init();
  const timeout = setTimeout(() => this.close(), 60000); // Hard kill after 60s
  try { ... } finally { clearTimeout(timeout); await this.close(); }
}
```

### 3.4 Transaction Consistency Between Scraper and Manual
- **What**: Scraper inserts into `transactions` with columns `(brand_id, store_id, transaction_type, total_amount, transaction_date, reference_number, external_id)` at `scrapers.routes.ts:111`. But manual/CSV transactions use `(brand_id, transaction_date, store_id, sku, big_sku, item_name, colour, size, quantity_sold, selling_price, status)` at `transactions.controller.ts:107`.
- **Impact**: These are **different column sets** for the same table. Scraper transactions have no `sku`, `quantity_sold`, `selling_price`, `item_name`. Manual transactions have no `transaction_type`, `external_id`.
- **Risk**: Any query that relies on `sku` or `quantity_sold` will miss scraper-inserted rows. Dashboard analytics use `quantity_sold * selling_price` which will be NULL for scraper rows.
- **Fix**: Scraper inserts must populate the same columns manual inserts use, OR the schema needs to be unified with a clear contract.

### 3.5 CSV Import Memory Bomb
- **Where**: `src/controllers/transactions.controller.ts:267`
- **What**: The entire CSV text is received as a JSON string in the request body (`csvText`). A 100K-row CSV is ~50MB of JSON. Node's default body size + JSON parsing will either crash or time out.
- **Fix**: Use streaming multipart upload instead of JSON body. Short-term: add a size limit:
```typescript
if (csvText.length > 10_000_000) throw new HTTPException(400, { message: 'CSV too large. Max 10MB.' });
```

---

## 4. Performance & Scale

### 4.1 N+1 Queries in Scraper Insert Loops
- **Where**: 
  - `src/routes/scrapers.routes.ts:102-133` — `findOrCreateProduct()` inside `for (const trx of transactions)` loop
  - `src/scrapers/scheduler.ts:53-84` — same pattern: `query(SELECT...)` then `query(INSERT...)` per transaction
- **Impact**: 1000 transactions = 2000+ individual DB queries, each acquiring and releasing a connection.
- **Fix**: Batch upsert all products first, then batch insert all transactions:
```typescript
// Batch product upsert
const skus = [...new Set(transactions.map(t => t.sku || t.product_name))];
await client.query(`
  INSERT INTO products (brand_id, sku, name, selling_price)
  SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::numeric[])
  ON CONFLICT (brand_id, sku) DO UPDATE SET name = EXCLUDED.name
`, [brandIds, skus, names, prices]);
```

### 4.2 Puppeteer Memory Under Concurrent Brands
- **Where**: `src/scrapers/stores/mrlokal.scraper.ts:14` — `puppeteer.launch()` on every scrape call
- **What**: Each MrLokal scrape launches a full Chromium browser (~200MB). The scheduler runs brands sequentially (good), but if multiple brands trigger manual scrapes via API, multiple browsers run concurrently.
- **Impact**: 3 concurrent Puppeteer instances = 600MB, exceeding the 512MB Docker limit.
- **Fix**: Add a scrape semaphore:
```typescript
const scrapeSemaphore = new Semaphore(1); // Max 1 concurrent Puppeteer
```

### 4.3 Connection Pool Exhaustion
- **Where**: `src/config/database.ts:17,28` — pool size is 20.
- **What**: `brandQuery()` acquires a connection, runs BEGIN/SET/QUERY/COMMIT, releases. The scheduler uses raw `query()` which also acquires connections. Under load, 20 connections can be exhausted.
- **Scenario**: 10 brands × 2 concurrent queries (count + data) = 20 connections. Add scheduler + scraper = blocked.
- **Fix**: Reduce long-held connections. The `brandQuery()` pattern of BEGIN/COMMIT for single queries is expensive. Consider:
```typescript
// For read-only single queries, use SET LOCAL without explicit transaction
await client.query("SET LOCAL app.current_brand_id = $1", [brandId]);
```

### 4.4 What Breaks at Scale

| Brands | What breaks |
|--------|-------------|
| 10 | Nothing yet, but scraper takes ~10min sequentially |
| 50 | Scheduler takes 50+ min. Connection pool contention starts. |
| 100 | Scheduler may not finish before next day's run. Puppeteer OOM likely. |
| 200 | Need job queue, worker processes, connection pooling rethink |

---

## 5. Edge Cases Not Handled

### 5.1 Empty Scrape Results
- **Where**: `src/routes/scrapers.routes.ts:100` — `if (transactions.length > 0)`
- **What**: If a portal returns 0 transactions, this is treated as success. But it could mean the portal changed its API, the account expired, or credentials are wrong (some portals return 200 with empty data instead of 401).
- **Fix**: Log a warning if 0 results. After N consecutive empty scrapes, mark credentials as suspect.

### 5.2 Portal Credential Rotation
- **What**: No mechanism to detect or handle changed portal passwords. The scraper will fail silently, logging an error in the scheduler but never notifying the brand owner.
- **Fix**: On auth failure, update `store_portal_creds.status = 'auth_failed'`, create a notification for the brand owner.

### 5.3 Timezone: "Yesterday" in Whose Timezone?
- **Where**: `src/scrapers/scheduler.ts:28-30`, `src/routes/scrapers.routes.ts:207-210`
- **What**: `new Date().setDate(d.getDate() - 1)` uses the **server's** timezone (UTC in Docker). But the portals operate in Egypt time (UTC+2). "Yesterday" at 1:00 AM UTC is still "today" in EET until 2:00 AM local.
- **Impact**: Missing the last 2 hours of each day's transactions.
- **Fix**: Calculate "yesterday" in the portal's timezone:
```typescript
const egyptYesterday = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
egyptYesterday.setDate(egyptYesterday.getDate() - 1);
```

### 5.4 Duplicate `external_id` Collisions
- **Where**: `src/routes/scrapers.routes.ts:122`, `src/scrapers/scheduler.ts:69`
- **What**: Fallback external_id is `${groupName}-${trx.date}-${trx.sku || trx.product_name}-${trx.quantity}`. Two transactions on the same day, same product, same quantity = collision → second one silently dropped.
- **Fix**: Add a sequence number or hash:
```typescript
const externalId = trx.external_order_id || 
  `${groupName}-${trx.date}-${trx.sku}-${trx.quantity}-${crypto.randomUUID().slice(0,8)}`;
```
But this breaks idempotency. Better: include row index from the scrape results.

### 5.5 Concurrent Scrapes for Same Brand
- **What**: Nothing prevents two users from triggering `/scrape/initial/Locally` simultaneously. Both will insert the same transactions, but `ON CONFLICT DO NOTHING` saves correctness. However, both Puppeteer instances run concurrently (memory) and both report success (confusing UX).
- **Fix**: Add a lock check:
```typescript
const running = await brandQuery(brandId, 
  "SELECT 1 FROM scrape_jobs WHERE brand_id = $1 AND group_name = $2 AND status = 'running'", 
  [brandId, groupName]);
if (running.rows.length > 0) throw new HTTPException(409, { message: 'Scrape already in progress' });
```

### 5.6 General Branch Doesn't Exist When Scrape Fires
- **Where**: `src/scrapers/scheduler.ts:43-46`
- **What**: If the General branch was deleted or never created, the scheduler logs a warning and skips that brand forever. No notification, no retry.
- **Fix**: Auto-create the General branch if missing, or create a persistent notification.

---

## 6. Observability & Operations Gaps

### 6.1 What Can't Be Seen Right Now
- **Scrape history**: No record of past scrapes — when they ran, how long, what they found
- **Scrape health**: No way to know if scrapes are succeeding or failing without reading server logs
- **Portal credential status**: No visibility into whether credentials are still valid
- **Connection pool usage**: No metrics on pool saturation
- **Request latency**: No P50/P95/P99 tracking
- **Error rates**: No aggregated error tracking per endpoint

### 6.2 Minimum Monitoring Before Going Live

**Metrics to track:**
- `scrape_duration_seconds{brand, portal}` — histogram
- `scrape_success_total{brand, portal}` — counter
- `scrape_failure_total{brand, portal, error_type}` — counter
- `scrape_transactions_inserted{brand, portal}` — gauge
- `db_pool_active_connections` — gauge
- `db_pool_waiting_requests` — gauge
- `http_request_duration_seconds{method, route, status}` — histogram

**Log fields to add:**
- `brand_id` on every scraper log line
- `scrape_job_id` for correlation
- `duration_ms` on every scrape completion
- `error_code` classification (auth_failed, timeout, parse_error, db_error)

**Alerting rules:**
- Alert if any brand's scrape fails 3 consecutive days
- Alert if scrape duration > 5 minutes
- Alert if DB pool utilization > 80%
- Alert if any portal returns 0 transactions for 3 consecutive scrapes
- Alert if container memory > 400MB (of 512MB limit)

### 6.3 Minimum Viable Stack
- **Logs**: Structured JSON logs (pino or winston) → shipped to any log aggregator
- **Metrics**: Simple `/api/metrics` endpoint returning Prometheus-format counters
- **Alerts**: Cron job that queries `scrape_jobs` table + sends webhook/email on failure patterns

---

## 7. Dead Code & Tech Debt

### 7.1 Dead Scraper Files (6 files, never imported)
| File | Problem |
|------|---------|
| `src/scrapers/stores/genz.ts` | Imports non-existent `TransactionData, InventoryData` from types. Never imported by any active code. |
| `src/scrapers/stores/gonative.ts` | Same — dead code with broken imports |
| `src/scrapers/stores/lokal.ts` | Same |
| `src/scrapers/stores/locally.ts` | Same — superseded by `locally.scraper.ts` |
| `src/scrapers/stores/locally-working.ts` | Same — 12KB of dead experimental code |
| `src/scrapers/stores/mrlokal.ts` | Same — superseded by `mrlokal.scraper.ts` |

**Risk**: Confusion for any developer. Broken imports mean TypeScript compilation may fail if strict mode is on.
**Fix**: Delete all 6 files.

### 7.2 Dead Service File
| File | Problem |
|------|---------|
| `src/services/scraper-service.ts` | Imports `StoreScraper` (doesn't exist in index.ts), `TransactionData, InventoryData` (don't exist in types.ts). References `inventory_snapshots` table. Never imported anywhere. |

**Fix**: Delete.

### 7.3 Dead Config File
| File | Problem |
|------|---------|
| `src/scrapers/config.ts` | Contains `STORE_CONFIGS` and `findWorkingUrl`. Not imported by any active scraper. The actual scrapers hard-code their URLs. |

**Fix**: Delete.

### 7.4 Schema Mismatch: Two Credential Tables
- `migrate-scrapers.sql` creates `store_credentials` with `password_hash BYTEA` (encrypted)
- Actual code uses `store_portal_creds` with `portal_password TEXT` (plain text)
- These are **different tables**. The migration creates a table nobody uses. The code uses a table nobody migrated.

### 7.5 Schema Mismatch: `stock_movements` Columns
- `setup-db.ts` defines `stock_movements` with columns: `move_date, sku, quantity, destination, reference_type, reference_number`
- Scraper code inserts with columns: `product_id, store_id, movement_type, quantity, reference_type, notes, movement_date`
- These are **different column sets**. One or both will fail at runtime depending on which migration actually ran.

---

## 8. Minimum Viable Fixes

*Ordered by priority. Each is one PR-sized change. First 5 eliminate ~80% of risk.*

1. **Encrypt portal passwords + add migration for `store_portal_creds`** — Create the missing migration with proper schema. Add encrypt/decrypt wrapper. ~4 hours.

2. **Fix scheduler to use `brandQuery()`** — Replace all `query()` calls in `scheduler.ts` with proper RLS-scoped queries. ~1 hour.

3. **Add auth to cache endpoints + remove JWT default secret** — Move cache endpoints behind auth. Remove `fallback-dev-secret-change-me` default. ~30 min.

4. **Delete 8 dead files** — Remove `genz.ts`, `gonative.ts`, `lokal.ts`, `locally.ts`, `locally-working.ts`, `mrlokal.ts`, `scraper-service.ts`, `config.ts`. ~15 min.

5. **Add `scrape_jobs` table + basic tracking** — Insert a row before each scrape, update on completion/failure. Query this table for health visibility. ~3 hours.

6. **Fix timezone for "yesterday" calculation** — Use `Africa/Cairo` timezone. ~30 min.

7. **Add Puppeteer concurrency limiter** — Semaphore limiting to 1 concurrent browser. ~1 hour.

8. **Fix scraper/manual transaction column mismatch** — Unify the columns both paths populate. ~2 hours.

9. **Add scraper rate limiting** — 5 scrapes/min per brand. ~30 min.

10. **Add CSV import size limit** — Reject CSVs > 10MB at parse time. ~15 min.

11. **Fix `external_id` collision risk** — Include row index in fallback ID generation. ~30 min.

12. **Add retry logic for failed scrapes** — 3 attempts with exponential backoff. ~2 hours.

---

## 9. Success Criteria

| Category | KPI | Target |
|----------|-----|--------|
| **Security** | Plain-text passwords in DB | 0 |
| **Security** | Unauthenticated endpoints | 0 |
| **Security** | Routes missing tenant context check | 0 |
| **Reliability** | Daily scrape success rate | > 99% |
| **Reliability** | Consecutive scrape failures before alert | ≤ 2 |
| **Reliability** | Mean time to detect scrape failure | < 1 hour |
| **Performance** | Scrape duration per brand | < 60 seconds |
| **Performance** | API P95 latency | < 500ms |
| **Performance** | DB connection pool utilization | < 70% |
| **Observability** | Scrape jobs with recorded status | 100% |
| **Observability** | Errors with structured classification | 100% |
| **Observability** | Time from failure to alert | < 15 minutes |
| **Scale** | Brands supported without architecture change | 50 |

---

*End of audit.*
