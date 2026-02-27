# Chronizer — Full System Audit Report

Generated: 2026-02-27

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [CRITICAL — Dead Code & Unused Dependencies](#3-critical--dead-code--unused-dependencies)
4. [CRITICAL — Security Issues](#4-critical--security-issues)
5. [HIGH — Database & Schema Issues](#5-high--database--schema-issues)
6. [HIGH — Backend Code Quality](#6-high--backend-code-quality)
7. [HIGH — Frontend Code Quality](#7-high--frontend-code-quality)
8. [MEDIUM — Architectural Debt](#8-medium--architectural-debt)
9. [MEDIUM — Missing Features & Gaps](#9-medium--missing-features--gaps)
10. [LOW — Polish & Best Practices](#10-low--polish--best-practices)
11. [What to REMOVE](#11-what-to-remove)
12. [What to ADD](#12-what-to-add)
13. [What to IMPROVE](#13-what-to-improve)
14. [Priority Action Plan](#14-priority-action-plan)

---

## 1. Executive Summary

Chronizer is a **multi-tenant SaaS** for retail/brand transaction management. The architecture is solid at its core — Hono backend, Next.js frontend, PostgreSQL, JWT auth, multi-tenant via `brand_id`. However, the codebase carries **significant dead weight** from earlier iterations (Redis, BullMQ, Drizzle ORM, WebSocket) that are **never used** but still compiled and shipped. There are also **security gaps**, **duplicated code**, and **inconsistent patterns** that should be addressed.

### Health Score: 5.5/10

| Area | Score | Notes |
|------|-------|-------|
| Core functionality | 7/10 | CRUD works, auth works, multi-tenant works |
| Code cleanliness | 4/10 | ~40% of backend files are dead code |
| Security | 4/10 | JWT fallback secrets, no input sanitization, SQL patterns |
| Frontend | 6/10 | Modern stack, but inconsistent API patterns |
| Database | 6/10 | Good schema, missing some indexes, no migrations |
| Deployment | 5/10 | Works on Render, but fragile setup |
| Testing | 0/10 | Zero tests |

---

## 2. Architecture Overview

```
Frontend (Next.js 14)          Backend (Hono + Node)         Database (PostgreSQL)
├── /app (pages)               ├── /config (env, db)         ├── brands
├── /components (UI)           ├── /controllers (8)          ├── brand_owners
├── /lib (API clients)         ├── /routes (12)              ├── stores
└── shadcn/ui + Tailwind       ├── /services (9, 5 dead)     ├── products
                               ├── /middleware (5)            ├── transactions
                               ├── /workers (2, all dead)    ├── stock_movements
                               ├── /db (3, all dead)         ├── inventory_view
                               └── /lib (logger)             ├── sku_store_map
                                                             ├── invite_links
                                                             └── activity_log
```

**Active route count**: 12 route files → ~50+ endpoints
**Frontend pages**: 18 pages
**Backend controllers**: 8 active controllers

---

## 3. CRITICAL — Dead Code & Unused Dependencies

### 3.1 Dead Backend Files (REMOVE ALL)

These files are **compiled but never imported** by any active code:

| File | Lines | What it does | Why it's dead |
|------|-------|-------------|---------------|
| `src/services/redis-manager.ts` | 215 | Redis connection manager | No Redis in production |
| `src/services/cache.ts` | 215 | Redis-based cache service | Imports dead redis-manager |
| `src/services/pubsub.ts` | 217 | Redis pub/sub wrapper | Imports dead redis-manager |
| `src/services/cache-warmer.ts` | 78 | Pre-loads cache keys | Imports dead multi-level-cache |
| `src/services/multi-level-cache.ts` | 137 | L1/L2 cache (both in-memory) | Redundant — `memory-cache.ts` is used instead |
| `src/services/queue-manager.ts` | 456 | BullMQ queue manager | No Redis = no BullMQ |
| `src/services/queue-manager-simple.ts` | 90 | In-memory queue manager | Never called from routes |
| `src/services/websocket-server.ts` | 443 | WebSocket server | Never initialized |
| `src/workers/index.ts` | 49 | Worker initialization | Never called from index.ts |
| `src/workers/transaction-processor.ts` | 339 | BullMQ transaction worker | Imports dead db/index |
| `src/db/index.ts` | 41 | Drizzle ORM connection | Active code uses pg Pool instead |
| `src/db/connection.ts` | 92 | Duplicate DB connection | Active code uses `config/database.ts` |
| `src/db/schema.ts` | 134 | Drizzle ORM schema | Not used by any active code |
| `src/middleware/tenant.ts` | 231 | Subdomain-based tenant middleware | Replaced by JWT-based middleware in index.ts |
| `src/middleware/monitoring.ts` | 170 | Pino logger + metrics collector | Never registered in app |
| `src/controllers/bulk.controller.ts` | ? | Bulk operations | Likely superseded by per-controller bulk methods |

**Total dead code: ~2,900+ lines across 16 files**

### 3.2 Unused npm Dependencies (REMOVE)

**Backend `package.json`:**

| Package | Size | Why unused |
|---------|------|-----------|
| `bullmq` | Heavy | No Redis, queue-manager never called |
| `ioredis` | Heavy | No Redis in production |
| `drizzle-orm` | Medium | Using raw pg queries, not Drizzle |
| `postgres` | Medium | Using `pg` package, not `postgres.js` |
| `ws` | Medium | WebSocket server never initialized |
| `express-rate-limit` | Small | Using custom Hono rate limiter |
| `helmet` | Small | Using custom security middleware |
| `node-fetch` | Small | Node 18+ has native fetch |
| `@types/node-fetch` | Small | Goes with node-fetch |
| `@types/uuid` | Small | UUID generated by Postgres, not JS |

**Frontend `package.json`:**

| Package | Why unused/suspect |
|---------|-------------------|
| `socket.io-client` | No WebSocket server exists |
| `@tanstack/react-query` | Not used — all pages use `useState` + `useEffect` |
| `@tanstack/react-table` | Not used — custom table implementations |
| `cmdk` | Command palette not implemented |
| `zustand` | Not used — no global state management |
| `framer-motion` | Possibly used in a few places, verify |
| `@tremor/react` | Heavy charting lib — verify if actually used |

---

## 4. CRITICAL — Security Issues

### 4.1 JWT Secret Fallback Mismatch ⚠️ (PARTIALLY FIXED)
- `src/routes/auth.routes.ts:10` uses fallback `'fallback-dev-secret-change-me'`
- `src/index.ts:102` now also uses `'fallback-dev-secret-change-me'` (fixed in previous session)
- **Risk**: If `JWT_SECRET` env var is not set in production, tokens are signed with a known public string
- **Fix**: Crash on startup if `JWT_SECRET` is not set in production

### 4.2 No Input Sanitization
- `sanitizeInput()` exists in `src/middleware/security.ts` but is **never called anywhere**
- All user inputs go directly into SQL queries via parameterized queries (safe from SQL injection) but HTML/XSS vectors are not stripped
- **Risk**: Stored XSS if product names, notes, etc. contain `<script>` tags and are rendered unsafely

### 4.3 Admin Routes Expose Sensitive Data
- `GET /api/admin/all-users` returns all user emails, login times
- `GET /api/admin/system` returns `process.memoryUsage()`, Node version, platform, DB connection counts
- **Risk**: Information disclosure if admin token is compromised
- **Fix**: Add rate limiting specifically to admin routes; consider IP whitelisting

### 4.4 No Password Change / Reset Flow
- Users cannot change their password
- `reset-password` page exists on frontend but no backend endpoint
- **Risk**: If a password is compromised, there's no recovery mechanism

### 4.5 AuthGuard is Client-Only
- `frontend/lib/auth-guard.tsx` only checks if `auth_token` exists in localStorage
- It does NOT verify the token is valid or not expired
- **Risk**: Expired tokens show dashboard briefly before API calls fail

### 4.6 Invite Link URL Uses Wrong Env Var
- `src/routes/admin.routes.ts:179`: `process.env.CORS_ORIGIN || 'http://localhost:3001'`
- Should use `ALLOWED_ORIGINS` or a dedicated `FRONTEND_URL` env var
- **Risk**: Generated invite URLs point to wrong domain

### 4.7 Database Credentials in Setup Scripts
- `setup-sku-map-table.cjs` and `fix-admin-password.cjs` contain hardcoded database credentials
- **Risk**: Credentials exposed in Git history
- **Fix**: Use `DATABASE_URL` env var instead

---

## 5. HIGH — Database & Schema Issues

### 5.1 No Migration System
- Schema is created via ad-hoc scripts (`scripts/setup-db.ts`, `setup-sku-map-table.cjs`)
- No version tracking, no rollback capability
- **Fix**: Adopt a migration tool (e.g., `node-pg-migrate` or even manual numbered SQL files)

### 5.2 Drizzle Schema Doesn't Match Reality
- `src/db/schema.ts` defines tables WITHOUT `brand_id` (no multi-tenancy)
- Actual DB tables HAVE `brand_id` on everything
- This file is dead code but could mislead developers

### 5.3 Missing Indexes (Performance)
- `transactions` table is the heaviest — needs composite indexes on:
  - `(brand_id, transaction_date DESC)` — most common query pattern
  - `(brand_id, sku)` — for SKU lookups
  - `(brand_id, store_id, transaction_date)` — for store performance
- `stock_movements` needs `(brand_id, sku)` index
- `sku_store_map` indexes are well-done ✓

### 5.4 `inventory_view` is a View, Not a Table
- Inventory controller queries `inventory_view` — this is presumably a SQL VIEW
- No materialized view for performance
- Heavy queries on large datasets will be slow
- **Fix**: Consider materialized view with periodic refresh

### 5.5 No `updated_at` Auto-Update
- Tables have `updated_at` column but no trigger to auto-update it
- Controllers manually set it in some places, forget in others

---

## 6. HIGH — Backend Code Quality

### 6.1 Duplicated `getBrandId()` Helper
This exact function is copy-pasted in **8 files**:
- `brand.controller.ts`, `products.controller.ts`, `stores.controller.ts`
- `transactions.controller.ts`, `stock-moves.controller.ts`, `inventory.controller.ts`
- `sku-map.controller.ts`, `transactions-async.ts`, `analytics.routes.ts`

**Fix**: Extract to a shared utility file.

### 6.2 Two Duplicate Bulk Transaction Endpoints
- `POST /api/transactions/bulk` — in `transactions.controller.ts` (max 5000, batched INSERT, pre-fetches products)
- `POST /api/transactions-async/bulk` — in `transactions-async.ts` (max 10000, row-by-row INSERT, no product lookup)

They do similar things with different behaviors. **Remove one.**

### 6.3 Inconsistent Response Formats
- Some endpoints return `{ data: ... }` (transactions, stores, stock-moves)
- Some return `{ success: true, data: ... }` (products, admin, sku-map, auth)
- Some return `{ data: ..., pagination: ... }` without `success` field
- **Fix**: Standardize all responses to `{ success: boolean, data: T, pagination?: P }`

### 6.4 `transactions-async.ts` Route Naming is Misleading
- It's called "async" but is actually synchronous
- Comment says "replaces old queue-based approach"
- **Fix**: Merge into main transactions routes or rename

### 6.5 `any` Type Abuse
- Nearly every controller uses `any` for request bodies, DB results, and params
- No Zod validation on most endpoints (only auth routes have it)
- **Fix**: Add Zod schemas to all write endpoints at minimum

### 6.6 Error Handler Returns Inconsistent Format
- `errorHandler` in `middleware/error.ts` returns `{ error: { message, status } }`
- But controllers return `{ success: false, error: 'string' }`
- Frontend doesn't handle both formats consistently

---

## 7. HIGH — Frontend Code Quality

### 7.1 Four Different API Client Patterns
The frontend has **4 separate API client implementations**:

| File | Pattern | Auth? |
|------|---------|-------|
| `lib/api.ts` | Class-based `ApiClient` | ✓ Auto from localStorage |
| `lib/auth.ts` | Class-based `AuthClient` | Manual header |
| `lib/stores.ts` | Class-based `StoresAPI` | ✗ No auth header! |
| `lib/products.ts` | Class-based `ProductsClient` | ✗ No auth header! |
| `lib/sku-map.ts` | Class-based `SkuMapAPI` | ✓ Manual from localStorage |
| Admin pages | Raw `fetch()` with inline token | ✓ Manual |

**Problems:**
- `stores.ts` and `products.ts` **never send the Authorization header** — they work only because the tenant middleware silently continues without auth. If you ever add auth enforcement, these break.
- Inconsistent error handling across all clients
- **Fix**: Create ONE shared `apiClient` function with auto-auth and use it everywhere

### 7.2 `stores.ts` Has No Auth Token
```typescript
// stores.ts — NO Authorization header!
const config: RequestInit = {
  headers: {
    'Content-Type': 'application/json',
    ...options.headers, // no token injected
  },
```
This will fail if the backend ever requires auth for store routes.

### 7.3 Frontend Types Don't Match Backend
- `frontend/lib/api.ts` defines `Transaction.id` as `number` — backend returns UUID `string`
- `HealthStatus` interface references `redis`, `websocket`, `queue` services that don't exist
- `CacheStats` references L1/L2 cache that doesn't exist
- `QueueStats` references queues that don't exist

### 7.4 Unused Frontend Components/Pages
- `frontend/app/system/page.tsx` — separate from admin system page, likely dead
- `frontend/app/reset-password/page.tsx` — no backend endpoint exists

### 7.5 No Loading/Error Boundaries
- If any page component throws, the entire app crashes (React error #31 issue from earlier)
- **Fix**: Add `error.tsx` boundary files in the app router

---

## 8. MEDIUM — Architectural Debt

### 8.1 Three Database Connection Implementations
| File | Library | Used? |
|------|---------|-------|
| `src/config/database.ts` | `pg` Pool | ✅ **Active** — used by all controllers |
| `src/db/connection.ts` | `pg` Pool | ❌ Dead — different wrapper |
| `src/db/index.ts` | `postgres.js` + Drizzle | ❌ Dead — completely different ORM |

### 8.2 Two Logger Implementations
| File | Library | Used? |
|------|---------|-------|
| `src/lib/logger.ts` | Custom console wrapper | ✅ **Active** |
| `src/middleware/monitoring.ts` | Pino | ❌ Dead |

### 8.3 Three Cache Implementations
| File | Used? |
|------|-------|
| `src/services/memory-cache.ts` | ✅ **Active** |
| `src/services/multi-level-cache.ts` | ❌ Dead (both levels are in-memory) |
| `src/services/cache.ts` | ❌ Dead (requires Redis) |

### 8.4 `@types/*` Packages in `dependencies` Instead of `devDependencies`
- `@types/bcryptjs`, `@types/jsonwebtoken`, `@types/pg`, `@types/uuid`, `@types/node-fetch`
- These are type-only packages, should be in `devDependencies`
- They ship in production builds unnecessarily

---

## 9. MEDIUM — Missing Features & Gaps

### 9.1 No Data Export
- `api.ts` frontend client has `exportTransactions()` method
- No corresponding backend endpoint exists

### 9.2 No Pagination on Several Admin Endpoints
- `GET /api/admin/brands` — no pagination, returns all
- `GET /api/admin/all-products` — hardcoded LIMIT 200
- `GET /api/admin/all-stores` — hardcoded LIMIT 200
- `GET /api/admin/all-users` — no limit at all

### 9.3 No Soft Delete
- Products and stores have `is_active` flag
- But `DELETE` endpoints do hard deletes (`DELETE FROM ...`)
- Transactions and stock movements have no soft delete at all
- **Risk**: Accidental data loss

### 9.4 No Audit Trail for Data Changes
- `activity_log` table exists but only logs account creation
- No logging for: creating/updating/deleting products, stores, transactions
- **Fix**: Add middleware or per-controller audit logging

### 9.5 No Rate Limiting on Auth Endpoints
- Login has no brute-force protection beyond the global 500 req/15min limit
- **Fix**: Add stricter rate limiting on `/api/auth/login` (e.g., 10 attempts/15min per IP)

### 9.6 SKU Map Not Integrated with Transaction Flow
- The `sku_store_map` table exists but is not used when creating transactions
- When a transaction comes in with a store's SKU, there's no automatic resolution to internal SKU
- **Fix**: Add optional auto-resolution in `createTransaction` / `bulkCreateTransactions`

---

## 10. LOW — Polish & Best Practices

### 10.1 No `.env.example` File
- New developers have no idea what env vars are needed
- **Fix**: Create `.env.example` with all required vars documented

### 10.2 `test` Script is a No-Op
- `"test": "echo \"Tests not implemented yet\" && exit 0"`
- **Fix**: Add at least integration tests for auth and CRUD flows

### 10.3 No TypeScript Strict Mode
- No `tsconfig.json` in the root (only frontend has one)
- Backend TypeScript is loose — `any` types everywhere

### 10.4 `console.log` Leaking DB Connection Strings
- `src/config/database.ts:14` logs `DATABASE_URL` (partially masked)
- `src/config/database.ts:24-27` logs individual DB params including password type
- **Fix**: Remove or mask completely

### 10.5 Memory Cache Has No Size Limit
- `memory-cache.ts` grows unbounded until cleanup runs
- On a busy system, could consume significant memory
- **Fix**: Add max entries cap with LRU eviction

### 10.6 No Health Check on Frontend
- Frontend has no way to detect if backend is down
- **Fix**: Add a status indicator or toast on connection failure

---

## 11. What to REMOVE

### Immediate (0 effort, big impact)

| Action | Files | Impact |
|--------|-------|--------|
| Delete dead services | `redis-manager.ts`, `cache.ts`, `pubsub.ts`, `cache-warmer.ts`, `multi-level-cache.ts`, `queue-manager.ts`, `queue-manager-simple.ts`, `websocket-server.ts` | -1,745 lines |
| Delete dead workers | `workers/index.ts`, `workers/transaction-processor.ts` | -388 lines |
| Delete dead DB layer | `db/index.ts`, `db/connection.ts`, `db/schema.ts` | -267 lines |
| Delete dead middleware | `middleware/tenant.ts`, `middleware/monitoring.ts` | -401 lines |
| Remove unused backend deps | `bullmq`, `ioredis`, `drizzle-orm`, `postgres`, `ws`, `express-rate-limit`, `helmet`, `node-fetch` | Smaller bundle |
| Remove unused frontend deps | `socket.io-client`, `cmdk` | Smaller bundle |
| Delete setup scripts with hardcoded creds | `setup-sku-map-table.cjs`, `fix-admin-password.cjs` | Security |
| Delete deployment guide clutter | `GOOGLE_CLOUD_DEPLOYMENT.md`, `RAILWAY_DEPLOYMENT.md` (if not using them) | Cleanliness |

### Consider Removing

| Action | Reason |
|--------|--------|
| `transactions-async.ts` route | Duplicate of main transactions bulk endpoint |
| `src/controllers/bulk.controller.ts` | Likely superseded by per-controller bulk methods |
| `frontend/app/system/page.tsx` | Duplicate of admin/system |
| `frontend/app/reset-password/page.tsx` | No backend support |

---

## 12. What to ADD

### High Priority

| Feature | Why |
|---------|-----|
| **Error boundaries** (`error.tsx`) | Prevent React crash on API errors |
| **Password change endpoint** | Users can't change password |
| **Login rate limiting** | Brute-force protection |
| **`.env.example`** | Developer onboarding |
| **Startup validation** | Crash if JWT_SECRET missing in production |
| **Unified API client** on frontend | Replace 6 different patterns |

### Medium Priority

| Feature | Why |
|---------|-----|
| **Database migrations** | Track schema changes properly |
| **`updated_at` triggers** | Auto-update timestamps |
| **SKU auto-resolution** in transactions | Use sku_store_map when importing |
| **Data export endpoint** | Frontend already expects it |
| **Soft delete everywhere** | Prevent accidental data loss |
| **Auth token refresh** | 7-day expiry with no refresh = bad UX |

### Low Priority

| Feature | Why |
|---------|-----|
| **Unit tests for controllers** | Regression prevention |
| **Integration tests for auth** | Most critical flow |
| **WebSocket for real-time updates** | Nice-to-have for dashboards |
| **Materialized views** for analytics | Performance at scale |
| **Dark mode persistence** | Currently resets on refresh |

---

## 13. What to IMPROVE

### Code Quality

| What | Current | Target |
|------|---------|--------|
| `getBrandId()` | Copy-pasted in 8 files | Shared utility |
| API response format | 3 different patterns | Single `{ success, data, pagination }` |
| Frontend API clients | 6 different implementations | 1 unified client with auto-auth |
| TypeScript strictness | `any` everywhere | Zod validation on write endpoints |
| Error handling | Inconsistent | Standardized error format |

### Performance

| What | Current | Target |
|------|---------|--------|
| Transaction indexes | Basic | Composite indexes on common query patterns |
| Inventory view | SQL VIEW | Materialized view with refresh |
| Memory cache | No size limit | LRU with max 1000 entries |
| Bulk inserts (stock moves) | Row-by-row | Batched multi-row INSERT |

### Security

| What | Current | Target |
|------|---------|--------|
| JWT secret | Fallback string | Crash if not set in production |
| Login attempts | No limit | 10/15min per IP |
| Admin routes | Standard rate limit | Stricter limit + IP allowlist |
| Invite URL origin | Wrong env var | Dedicated `FRONTEND_URL` var |
| Setup scripts | Hardcoded creds | Use env vars |

---

## 14. Priority Action Plan

### Sprint 1 — Cleanup (1-2 days)
1. Delete all 16 dead files listed in Section 11
2. Remove unused npm dependencies from both package.json files
3. Move `@types/*` to devDependencies
4. Extract shared `getBrandId()` utility
5. Create `.env.example`
6. Remove hardcoded credentials from setup scripts

### Sprint 2 — Security (1 day)
1. Add production startup check for `JWT_SECRET`
2. Add login-specific rate limiting (10 req/15min)
3. Fix invite link URL env var (`CORS_ORIGIN` → `FRONTEND_URL`)
4. Remove DB credential logging from `database.ts`

### Sprint 3 — Consistency (2-3 days)
1. Create unified frontend API client with auto-auth
2. Standardize all backend responses to `{ success, data, pagination }`
3. Add Zod validation on all write endpoints
4. Add `error.tsx` boundary files in frontend
5. Fix frontend type mismatches (UUID vs number, etc.)

### Sprint 4 — Features (2-3 days)
1. Implement password change endpoint
2. Add database migration system
3. Integrate SKU map into transaction creation flow
4. Add data export endpoint
5. Add audit logging for CRUD operations

### Sprint 5 — Performance & Testing (2-3 days)
1. Add composite database indexes
2. Create materialized view for inventory
3. Add LRU eviction to memory cache
4. Write tests for auth flow and CRUD operations

---

*End of report. Total estimated cleanup effort: ~2 weeks for a single developer.*
