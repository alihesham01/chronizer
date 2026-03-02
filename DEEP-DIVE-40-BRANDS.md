# System Deep Dive: Function Map, Scale Analysis & Missing Features
**Target**: Support 40 active brands concurrently  
**Date**: March 2, 2026

---

## Part 1: Complete Feature Map (What Exists Today)

### 1.1 Authentication & Onboarding
| Feature | Status | Files |
|---------|--------|-------|
| Email/password login with bcrypt | ✅ Working | `auth.routes.ts:44` |
| JWT token issuance (brandId+ownerId encoded) | ✅ Working | `auth.routes.ts:17-19` |
| Invite-only registration (one-time links) | ✅ Working | `auth.routes.ts:102-237` |
| Token verification endpoint | ✅ Working | `auth.routes.ts:239+` |
| Password change | ✅ Working | `auth.routes.ts` |
| Token refresh | ✅ Working | `auth.routes.ts` |
| Login brute-force rate limiting | ✅ Working | `auth.routes.ts:44` via `loginRateLimit` |
| Admin auth (is_admin flag on brand_owners) | ✅ Working | `admin.routes.ts:30` |
| **Multi-user per brand** | ❌ Missing | Only 1 owner per brand supported in flow |
| **Roles/permissions within a brand** | ❌ Missing | No role system beyond owner/admin |
| **Password reset via email** | ❌ Missing | Only admin can reset passwords |
| **2FA / MFA** | ❌ Missing | — |
| **Session management (list/revoke)** | ❌ Missing | — |

### 1.2 Brand Management
| Feature | Status | Files |
|---------|--------|-------|
| Brand profile (name, colors, subdomain) | ✅ Working | `brand.controller.ts:7-16` |
| Brand settings update | ✅ Working | `brand.controller.ts:18-44` |
| Dashboard stats (today/month revenue, store/product counts) | ✅ Working | `brand.controller.ts:93-121` |
| Period-based analytics (top products, top stores) | ✅ Working | `brand.controller.ts:46-91` |
| **Logo upload** | ❌ Missing | `logo_url` column exists but no upload endpoint |
| **Custom domain routing** | ❌ Missing | `custom_domain` column exists, no routing logic |
| **Brand deactivation self-service** | ❌ Missing | Only admin can deactivate |
| **Brand-level settings (currency, timezone, locale)** | ❌ Missing | `settings JSONB` exists but unused |

### 1.3 Products
| Feature | Status | Files |
|---------|--------|-------|
| CRUD (create, read, update, soft-delete) | ✅ Working | `products.controller.ts` |
| Search by SKU, name, big_sku | ✅ Working | `products.controller.ts:19` |
| Filter by category | ✅ Working | `products.controller.ts:20` |
| Pagination (max 200/page) | ✅ Working | `products.controller.ts:12` |
| Bulk create/upsert (max 5000) | ✅ Working | `products.controller.ts:101-130` |
| SKU uniqueness per brand | ✅ Working | DB constraint `UNIQUE(brand_id, sku)` |
| **Product images** | ❌ Missing | No image column or upload |
| **Product variants (color/size as separate entities)** | ❌ Missing | Stored as flat strings |
| **Product categories management** | ❌ Missing | Category is a free-text string, no categories table |
| **Product import from CSV** | ❌ Missing | Only bulk JSON supported |
| **Product export** | ❌ Missing | — |
| **Cost price tracking / margin calculation** | 🔶 Partial | `cost_price` exists but not used in analytics |

### 1.4 Stores
| Feature | Status | Files |
|---------|--------|-------|
| CRUD (create, read, update, soft-delete) | ✅ Working | `stores.controller.ts` |
| Search by name, code, display_name | ✅ Working | `stores.controller.ts:19` |
| Filter by group_name, active status | ✅ Working | `stores.controller.ts:20-22` |
| Bulk create | ✅ Working | `stores.controller.ts:105-131` |
| Commission and rent tracking | ✅ Working | Schema has `commission`, `rent` columns |
| **Store-level analytics (revenue, top products per store)** | 🔶 Partial | Available in brand analytics but not standalone |
| **Store groups management** | ❌ Missing | `group_name` is free-text, no groups table |
| **Store activation/deactivation scheduling** | ❌ Missing | Only manual toggle |

### 1.5 Transactions
| Feature | Status | Files |
|---------|--------|-------|
| CRUD (create, read, update, soft-delete) | ✅ Working | `transactions.controller.ts` |
| Search by SKU, item name | ✅ Working | `transactions.controller.ts:33` |
| Filter by status, store, date range | ✅ Working | `transactions.controller.ts:34-37` |
| Pagination (max 200/page) | ✅ Working | `transactions.controller.ts:26` |
| SKU auto-resolution via sku_store_map | ✅ Working | `transactions.controller.ts:80-99` |
| Bulk create (max 5000, batched by 500) | ✅ Working | `transactions.controller.ts:207-263` |
| CSV import with column mapping | ✅ Working | `transactions.controller.ts:265-389` |
| CSV export (max 50K rows) | ✅ Working | `transactions.controller.ts:165-205` |
| Idempotency via request_id | ✅ Working | `transactions.controller.ts:105` |
| Import run tracking via import_run_id | ✅ Working | `transactions.controller.ts:347` |
| Soft delete (status='deleted') | ✅ Working | `transactions.controller.ts:152-163` |
| Audit logging on all mutations | ✅ Working | via `auditLog()` |
| **Transaction items (line items)** | 🔶 Inconsistent | Scraper creates `transaction_items`, manual does not |
| **Returns/voids workflow** | ❌ Missing | Status exists but no refund/void logic |
| **Transaction attachments (receipts)** | ❌ Missing | — |
| **Date validation/normalization** | ❌ Missing | Date strings accepted as-is |

### 1.6 SKU Mapping System
| Feature | Status | Files |
|---------|--------|-------|
| Map external store SKUs to internal products | ✅ Working | `sku-map.controller.ts` |
| CRUD on mappings | ✅ Working | `sku-map.controller.ts:66-187` |
| Bulk create mappings | ✅ Working | `sku-map.controller.ts:98-138` |
| Group-level operations (delete all for group) | ✅ Working | `sku-map.controller.ts:189-200` |
| Lookup endpoint (resolve store SKU → product) | ✅ Working | `sku-map.controller.ts:202-222` |
| Groups summary with counts | ✅ Working | `sku-map.controller.ts:51-63` |
| **Auto-suggest mappings** | ❌ Missing | No fuzzy matching or similarity scoring |

### 1.7 Unmapped SKUs
| Feature | Status | Files |
|---------|--------|-------|
| Track unmapped external SKUs with occurrence count | ✅ Working | `unmapped-skus.controller.ts` |
| Resolve: map to product or ignore | ✅ Working | `unmapped-skus.controller.ts:53-103` |
| Bulk resolve | ✅ Working | `unmapped-skus.controller.ts:107-152` |
| Status filtering (pending/mapped/ignored) | ✅ Working | `unmapped-skus.controller.ts:11` |
| Summary counts | ✅ Working | `unmapped-skus.controller.ts:22-34` |
| **Auto-flag during scrape** | 🔶 Partial | `flag()` function exists but scraper doesn't call it |

### 1.8 Stock Movements
| Feature | Status | Files |
|---------|--------|-------|
| CRUD (create, read, update, cancel) | ✅ Working | `stock-moves.controller.ts` |
| Search by SKU, filter by destination/date | ✅ Working | `stock-moves.controller.ts:19-22` |
| Bulk create (max 5000) | ✅ Working | `stock-moves.controller.ts:114-142` |
| Stock summary per SKU (in/out/net) | ✅ Working | `stock-moves.controller.ts:144-162` |
| Idempotency via request_id | ✅ Working | `stock-moves.controller.ts:65` |
| **Automated stock adjustments on sales** | ❌ Missing | Sales don't auto-create stock movements |
| **Transfer between stores** | ❌ Missing | No store-to-store transfer flow |
| **Stock movement approval workflow** | ❌ Missing | — |

### 1.9 Inventory
| Feature | Status | Files |
|---------|--------|-------|
| Computed inventory view (stock_in - stock_out - sold) | ✅ Working | `inventory_view` in `setup-db.ts:162-189` |
| Paginated listing with search | ✅ Working | `inventory.controller.ts:7-55` |
| Low stock filter (threshold-based) | ✅ Working | `inventory.controller.ts:83-93` |
| Negative stock detection | ✅ Working | `inventory.controller.ts:95-103` |
| Inventory value summary | ✅ Working | `inventory.controller.ts:105-118` |
| Top items by value | ✅ Working | `inventory.controller.ts:120-130` |
| Item history (stock moves + transactions combined) | ✅ Working | `inventory.controller.ts:70-78` |
| **Reorder point alerts** | ❌ Missing | — |
| **Stock count / reconciliation** | ❌ Missing | — |
| **Inventory export** | ❌ Missing | — |

### 1.10 Analytics
| Feature | Status | Files |
|---------|--------|-------|
| Dashboard metrics (today/yesterday/month) | ✅ Working | `analytics-service.ts:66-77` |
| Daily summary (by date + store) | ✅ Working | `analytics-service.ts:7-25` |
| SKU performance ranking | ✅ Working | `analytics-service.ts:27-35` |
| Store performance comparison | ✅ Working | `analytics-service.ts:37-46` |
| Monthly revenue trends | ✅ Working | `analytics-service.ts:48-55` |
| Top SKUs (last 30 days) | ✅ Working | `analytics-service.ts:57-64` |
| 7-day sales trends | ✅ Working | `analytics-service.ts:79-86` |
| Overall summary stats | ✅ Working | `analytics-service.ts:88-99` |
| Materialized view for fast aggregation | ✅ Working | `daily_transaction_summary` |
| Frontend charts (Recharts: area, bar, line, pie) | ✅ Working | `analytics/page.tsx` |
| **Date range actually wired to API calls** | ❌ Broken | Frontend has date selector but doesn't pass it to API |
| **Profit/margin analytics** | ❌ Missing | `cost_price` exists but never used in analytics queries |
| **Commission/rent deduction from revenue** | ❌ Missing | Columns exist on stores but not calculated |
| **Export analytics as PDF/CSV** | ❌ Missing | Export button in UI but no handler |
| **Comparison periods (vs last month/year)** | ❌ Missing | Hardcoded "+20.1%" in UI is fake |
| **Per-store drill-down analytics** | ❌ Missing | — |

### 1.11 Scrapers
| Feature | Status | Files |
|---------|--------|-------|
| Save portal credentials | ✅ Working | `scrapers.routes.ts:12-34` |
| View credential status (no passwords) | ✅ Working | `scrapers.routes.ts:37-44` |
| Initial scrape (all history) | ✅ Working | `scrapers.routes.ts:66-178` |
| Daily scrape (yesterday) | ✅ Working | `scrapers.routes.ts:181-280` |
| Automated daily cron (1 AM) | ✅ Working | `scheduler.ts` |
| Locally API scraper | ✅ Working | `locally.scraper.ts` |
| Mr Lokal Puppeteer scraper | ✅ Working | `mrlokal.scraper.ts` |
| Idempotency on external_id | ✅ Working | `ON CONFLICT DO NOTHING` |
| **Genz scraper** | ❌ Stub only | `genz.ts` is dead code with broken imports |
| **Go Native scraper** | ❌ Stub only | `gonative.ts` is dead code |
| **Lokal scraper** | ❌ Stub only | `lokal.ts` is dead code |
| **Scrape history/status dashboard** | ❌ Missing | No scrape_jobs table |
| **Credential health monitoring** | ❌ Missing | — |
| **Manual date range scrape** | ❌ Missing | Only "yesterday" or "all time" |
| **Scrape progress indication** | ❌ Missing | Long-running scrapes with no feedback |
| **Webhook receiver for portals that push data** | ❌ Missing | `webhookUrl` in config.ts but unused |

### 1.12 Notifications
| Feature | Status | Files |
|---------|--------|-------|
| List notifications | ✅ Working | `notifications.routes.ts:8-24` |
| Mark as read (single + all) | ✅ Working | `notifications.routes.ts:27-61` |
| Unread count | ✅ Working | `notifications.routes.ts:17-19` |
| **Notification creation (nothing generates them)** | ❌ Missing | No code anywhere creates notification rows |
| **Email notifications** | ❌ Missing | — |
| **Push notifications** | ❌ Missing | — |

### 1.13 Admin Panel
| Feature | Status | Files |
|---------|--------|-------|
| System-wide stats | ✅ Working | `admin.routes.ts` |
| Brand management (list, drill-down) | ✅ Working | `admin.routes.ts`, `admin/brands/` |
| User management | ✅ Working | `admin/users/` |
| Invite link generation | ✅ Working | `admin/invite-codes/` |
| Activity log viewer | ✅ Working | `admin/activity-log/` |
| Data integrity checks | ✅ Working | `admin/integrity/` |
| System health status | ✅ Working | `admin/system/` |
| Admin password reset for users | ✅ Working | `admin.routes.ts` |
| **Brand suspension/ban with reason** | ❌ Missing | Only is_active toggle |
| **Usage quotas per brand** | ❌ Missing | — |
| **Billing/subscription management** | ❌ Missing | — |

---

## Part 2: What Breaks at 40 Brands

### 2.1 Database Connection Pool
**Current**: 20 connections (`database.ts:16,28`)

Every `brandQuery()` call does: `connect → BEGIN → SET LOCAL → query → COMMIT → release`. That's 1 connection held for the entire cycle.

**At 40 brands**:
- 40 users making 2 concurrent requests each = 80 connection demands
- Pool size of 20 means 60 requests queue up waiting
- `connectionTimeoutMillis: 5000` means those 60 requests start failing after 5 seconds
- Scraper adds more pressure: scheduler runs 40 brands sequentially, each holding a connection for seconds

**Fix**: 
- Increase pool to 40-50 connections (`DB_POOL_SIZE=50`)
- PostgreSQL `max_connections` must be ≥ pool size + 10 (for admin/superuser)
- Consider PgBouncer for connection multiplexing at 100+ brands
- Optimize `brandQuery()` to avoid BEGIN/COMMIT for read-only single queries

### 2.2 Scheduler Duration
**Current**: Sequential processing, one brand at a time.

Per brand, the scheduler:
1. Queries credentials (~5ms)
2. Finds General store (~5ms)
3. Calls scraper (Locally API: ~2-5s, Mr Lokal Puppeteer: ~10-30s)
4. N+1 inserts per transaction (~2ms × N)
5. Calls inventory scraper (~5-15s)
6. N+1 inserts per inventory item

**At 40 brands**:
- Best case (all Locally API): 40 × ~10s = ~7 minutes
- Worst case (all Mr Lokal Puppeteer): 40 × ~60s = ~40 minutes
- Mixed: ~20-25 minutes

This is tolerable at 40, but:
- A single Puppeteer crash blocks the entire queue
- No parallelism means wasted time
- No retry means failures are permanent

**Fix**:
- Process up to 3-5 API scrapers in parallel (no Puppeteer conflict)
- Keep Puppeteer scrapers sequential (memory constraint)
- Add per-brand timeout (120s max)
- Add retry queue for failures

### 2.3 Memory
**Current**: 512MB Docker container for backend

Per-component memory usage:
- Node.js base: ~60MB
- pg Pool (20 connections): ~40MB
- In-memory cache (1000 items): ~5-20MB
- Puppeteer browser: ~200MB per instance
- Large CSV import (50K rows): ~50MB spike

**At 40 brands**:
- If 2 Puppeteer scrapes overlap (manual + scheduler): 400MB → OOM
- If cache fills with 40 brands × 25 keys each = 1000 items (at limit)
- Large CSV imports during scrape = memory pressure

**Fix**:
- Increase container to 1GB
- Hard-limit Puppeteer to 1 concurrent instance (semaphore)
- Add CSV streaming instead of full-body JSON parse
- Consider moving scrapers to a separate worker container

### 2.4 Materialized View Refresh
**Current**: `REFRESH MATERIALIZED VIEW CONCURRENTLY daily_transaction_summary` — called via `/api/analytics/refresh` (manual only)

**At 40 brands**:
- If this view covers ALL brands, refresh time grows linearly with total transaction count
- At 40 brands × 50K transactions each = 2M rows → refresh takes 10-30 seconds
- During refresh, queries against this view may return stale data
- No automated refresh schedule

**Fix**:
- Add cron-based refresh (every 15 minutes or after scheduler completes)
- Consider partitioning the materialized view by brand_id
- Or: replace with regular queries + proper indexes (the view isn't used much anyway)

### 2.5 Inventory View Performance
**Current**: `inventory_view` is a regular VIEW with 3 LATERAL JOINs (`setup-db.ts:162-189`)

Each lateral join does a full aggregation over `stock_movements` and `transactions` for every product. This is recalculated on every query.

**At 40 brands × 500 products × 50K transactions each**:
- The lateral joins scan millions of rows per brand
- `inventory.controller.ts:26-47` runs 3 parallel queries against this view
- Response time: potentially 5-15 seconds per page load

**Fix**:
- Replace lateral joins with a materialized `product_stock_summary` table
- Update it incrementally on each stock movement or transaction insert (trigger or app-level)
- Or: maintain running totals in a `product_inventory` table

---

## Part 3: Missing Features for 40-Brand Production

### 3.1 CRITICAL — Must Have Before 40 Brands

#### A. Multi-User Per Brand
**Currently**: One `brand_owner` per brand. No way to add team members.
**Need**: A brand owner should invite team members with specific roles (viewer, editor, manager).
**Implementation**:
```
- Add `role` enum: 'owner', 'manager', 'editor', 'viewer'
- brand_owners already has role column (defaults to 'owner')
- Add brand-level invite flow (separate from admin invite)
- Add permission checks per role in middleware
- Frontend: team management page under Settings
```
**Effort**: ~3-4 days

#### B. Self-Service Password Reset
**Currently**: Only admin can reset passwords via `admin.routes.ts`.
**Need**: "Forgot password?" link on login → email with reset token.
**Implementation**:
```
- Add email service (SendGrid, AWS SES, or SMTP)
- Create password_reset_tokens table
- POST /api/auth/forgot-password → generates token, sends email
- POST /api/auth/reset-password → validates token, updates password
- Frontend: forgot-password page
```
**Effort**: ~2 days

#### C. Notification System (Actually Wired Up)
**Currently**: Notifications table + API exist, but **nothing creates notifications**. The system is silent.
**Need**: Generate notifications for:
- Scrape failures
- Portal credential expiry
- Low stock alerts
- New unmapped SKUs detected
- Large data imports completed
- Admin actions on your brand

**Implementation**:
```
- Create NotificationService.create(brandId, ownerId, type, title, message, metadata)
- Call it from: scheduler (on failure), scrapers (on completion), inventory checks
- Optional: email digest of unread notifications (daily)
```
**Effort**: ~2 days

#### D. Scrape Job Tracking & Dashboard
**Currently**: Zero visibility into scrape health. Only server logs.
**Need**: Brand owners need to see:
- When was the last successful scrape?
- How many transactions were imported?
- Is the portal connection working?
- History of all scrape runs

**Implementation**:
```
- Create scrape_jobs table (see AUDIT-REPORT.md)
- Update scheduler and scrapers.routes.ts to record jobs
- Frontend: scrape status page showing job history per store group
- Traffic light indicator: green (recent success), yellow (>24h), red (failed)
```
**Effort**: ~2-3 days

#### E. Brand-Level Settings (Currency, Timezone)
**Currently**: `settings JSONB` column on brands exists but is completely unused.
**Need**: Each brand should configure:
- Currency (EGP, USD, AED, etc.) — affects all monetary displays
- Timezone — affects "yesterday" calculation in scrapers, date displays
- Date format preference
- Low stock threshold default

**Implementation**:
```
- Define settings schema: { currency: 'EGP', timezone: 'Africa/Cairo', dateFormat: 'DD/MM/YYYY', lowStockThreshold: 10 }
- Use timezone in scraper date calculations (fixes the UTC+2 bug from audit)
- Use currency in frontend displays and CSV exports
- Settings page already exists, just needs the fields
```
**Effort**: ~1-2 days

### 3.2 HIGH PRIORITY — Should Have

#### F. Profit & Commission Analytics
**Currently**: `cost_price` on products and `commission`/`rent` on stores exist but are never used in any calculation.
**Need**: Brand owners need to see:
- Gross profit = revenue - (cost_price × quantity)
- Net profit after commission and rent deductions
- Margin percentage per product, per store
- Monthly P&L summary

**Implementation**:
```
- Add profit columns to analytics queries
- Per-store P&L: revenue - (commission% × revenue) - rent
- Frontend: profit tab in analytics with margin charts
```
**Effort**: ~2-3 days

#### G. Product CSV Import
**Currently**: Products can only be bulk-created via JSON API. No CSV import UI.
**Need**: Same column-mapping CSV import flow as transactions, but for products.
**Effort**: ~1 day (reuse CSV import pattern from transactions)

#### H. Remaining Scrapers (Genz, Go Native, Lokal)
**Currently**: Only Locally (API) and Mr Lokal (Puppeteer) actually work. Three store chains have stub code only.
**Need**: If brands use these portals, they need working scrapers.
**Per scraper effort**: ~2-3 days each (requires portal access + reverse engineering)

#### I. Manual Date Range Scrape
**Currently**: Only "initial (all time)" or "daily (yesterday)" scrape modes.
**Need**: Brand owner should be able to say "re-scrape from Jan 15 to Jan 20" to fill gaps or correct data.
**Implementation**:
```
- Add POST /api/scrapers/scrape/range/:groupName with { dateFrom, dateTo }
- Reuse existing scraper logic with custom date range
- Frontend: date picker in stores page scraper section
```
**Effort**: ~1 day

#### J. Inventory Export
**Currently**: Transactions can be exported as CSV. Inventory cannot.
**Need**: Export current inventory snapshot to CSV/Excel for offline analysis or sharing with portals.
**Effort**: ~0.5 day

#### K. Data Export (Full Brand Export)
**Currently**: Only transaction CSV export exists.
**Need**: Brand owners should be able to export all their data (products, stores, transactions, stock movements) as a ZIP of CSVs for backup or migration.
**Effort**: ~1-2 days

### 3.3 NICE TO HAVE — Differentiation Features

#### L. Auto-Suggest SKU Mappings
When a new unmapped SKU is detected, use string similarity (Levenshtein distance) to suggest likely product matches.
**Effort**: ~1-2 days

#### M. Webhook Receiver
The `config.ts` already defines `webhookUrl` for Lokal. Some portals can push data instead of requiring scraping.
**Effort**: ~2 days (depends on portal API)

#### N. Dashboard Widgets / Customization
Let brand owners choose which metrics appear on their dashboard.
**Effort**: ~2-3 days

#### O. Email Digest Reports
Weekly summary email to brand owners: revenue, top products, stock alerts, scrape health.
**Effort**: ~2 days (requires email service)

#### P. API Rate Limit Per Brand
Currently rate limiting is global (500/15min). At 40 brands, one brand could consume all capacity.
Need per-brand or per-token rate limiting.
**Effort**: ~0.5 day

---

## Part 4: Architecture Improvements for 40 Brands

### 4.1 Connection Pool Strategy
```
Current:  Pool(20) + brandQuery wraps every single query in BEGIN/COMMIT
Problem:  40 brands × 2 avg concurrent requests = 80 demand, 20 supply
Solution: 
  1. Pool size → 50  (env: DB_POOL_SIZE=50)
  2. PostgreSQL max_connections → 60
  3. For read-only brandQuery, skip BEGIN/COMMIT, use SET LOCAL in a simpler wrapper
  4. At 100+ brands: add PgBouncer in transaction mode
```

### 4.2 Scraper Architecture
```
Current:  Single-threaded sequential scheduler in main process
Problem:  40 brands take 20-40 min, Puppeteer risks OOM
Solution:
  Phase 1 (now):
    - Semaphore: max 1 Puppeteer, max 5 API scrapers concurrently
    - Per-brand timeout: 120 seconds
    - Retry queue: 3 attempts with backoff
  Phase 2 (100+ brands):
    - Separate scraper worker container
    - Job queue (BullMQ with Redis, or pg-boss with PostgreSQL)
    - Horizontal scaling: multiple workers
```

### 4.3 Caching Strategy
```
Current:  In-memory cache, 1000 items max, brand data cached 5min
Problem:  40 brands × ~25 cache keys = 1000 items at limit, LRU evictions start
Solution:
  1. Increase MAX_CACHE_SIZE to 5000
  2. Cache analytics results (15min TTL) — currently analytics-service.ts has TTL=900 defined but never uses it
  3. Cache product lookups for scraper inserts (saves N+1 queries)
  4. At 100+ brands: consider Redis for shared cache across instances
```

### 4.4 Background Job Processing
```
Current:  Only the daily cron scheduler exists. Everything else is synchronous.
Problem:  Large CSV imports (50K rows), initial scrapes, and report generation block the HTTP response
Solution:
  1. Add a simple job queue using PostgreSQL (pg-boss pattern):
     - jobs table: id, type, brand_id, status, payload, result, created_at, started_at, completed_at
     - Worker loop: poll for pending jobs, process one at a time
  2. Convert to async:
     - CSV import → return job_id immediately, process in background
     - Initial scrape → return job_id, poll for status
     - Report generation → async with notification on completion
  3. Frontend: show job progress indicators
```

### 4.5 Database Optimizations
```
Current issues at 40 brands:
  1. inventory_view lateral joins are O(transactions × products) per brand
  2. No table partitioning
  3. Materialized view not auto-refreshed

Fixes:
  1. Replace inventory_view with a maintained product_stock table:
     CREATE TABLE product_stock (
       brand_id UUID, product_id UUID, store_id UUID,
       stock_in INT DEFAULT 0, stock_out INT DEFAULT 0, sold INT DEFAULT 0,
       available INT GENERATED ALWAYS AS (stock_in - stock_out - sold) STORED,
       last_updated TIMESTAMPTZ DEFAULT NOW(),
       PRIMARY KEY (brand_id, product_id, store_id)
     );
     Update via triggers on stock_movements and transactions.

  2. Partition transactions by brand_id (hash partitioning):
     Only needed at 5M+ total rows. At 40 brands × 50K = 2M rows, indexes suffice.

  3. Auto-refresh materialized view:
     Add to scheduler: after all scrapes complete, refresh the view.
     Or add a separate cron: every 15 minutes.
```

---

## Part 5: Prioritized Roadmap

### Phase 1: Foundation (Week 1-2) — Before onboarding brand #10
| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 1 | Fix security issues from AUDIT-REPORT.md (top 5) | 2 days | Prevents data breach |
| 2 | Increase DB pool to 50, container to 1GB | 1 hour | Prevents connection failures |
| 3 | Add scrape_jobs table + tracking | 2 days | Visibility into scraper health |
| 4 | Wire up notification creation (scrape failures, low stock) | 2 days | Brands know when things break |
| 5 | Brand settings: currency + timezone | 1 day | Correct scraper dates, proper currency display |
| 6 | Delete dead code (8 files) | 15 min | Reduces confusion |

### Phase 2: Scale (Week 3-4) — Before brand #20
| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 7 | Self-service password reset (email) | 2 days | Reduces admin burden × 20 |
| 8 | Scraper concurrency control (semaphore) | 1 day | Prevents OOM crashes |
| 9 | Fix analytics: real date ranges, profit margins | 2 days | Brands get actual insights |
| 10 | Product CSV import | 1 day | Faster brand onboarding |
| 11 | Inventory + analytics export | 1 day | Brands can share reports |
| 12 | Replace inventory_view with maintained table | 2 days | 10x faster inventory page |

### Phase 3: Growth (Week 5-8) — Before brand #40
| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 13 | Multi-user per brand (roles + invites) | 3 days | Brands add their team |
| 14 | Manual date range scrape | 1 day | Fill gaps in historical data |
| 15 | Background job queue for long operations | 3 days | No more HTTP timeouts |
| 16 | Remaining scrapers (Genz, Go Native, Lokal) | 6-9 days | Support all portal chains |
| 17 | Per-brand rate limiting | 0.5 day | Fair resource sharing |
| 18 | Commission/rent P&L analytics | 2 days | Real business value |

### Phase 4: Differentiation (Post brand #40)
| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 19 | Auto-suggest SKU mappings | 2 days | Saves hours of manual mapping |
| 20 | Email digest reports | 2 days | Passive value delivery |
| 21 | Webhook receiver for push-capable portals | 2 days | Eliminates scraping overhead |
| 22 | Custom domains | 2 days | Professional brand appearance |
| 23 | Separate scraper worker container | 3 days | Horizontal scaling |

---

## Part 6: Quick Wins (< 1 hour each)

These require minimal code changes but improve the experience:

1. **Fix hardcoded analytics percentages** — `analytics/page.tsx:159,174,189,199` shows fake "+20.1%", "+15.3%" etc. Either calculate real comparisons or remove them.

2. **Activate the unused `settings JSONB`** — Add defaults on brand creation: `{ currency: 'EGP', timezone: 'Africa/Cairo' }`.

3. **Add cache warming for analytics** — `analytics-service.ts:5` defines `TTL = 900` but never caches results. Add `memoryCache.get/set` in `getDashboardMetrics()`.

4. **Wire the Export Report button** — `analytics/page.tsx:135-138` has a download button that does nothing.

5. **Profile editing** — `settings/page.tsx:131` says "Profile name and email cannot be changed at this time." — add firstName/lastName update endpoint.

6. **Add `is_admin` to JWT claims** — Currently requires an extra DB query on every admin page load (`auth.routes.ts:77`). Encode it in the token.

---

*End of deep dive.*
