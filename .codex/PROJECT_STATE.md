# Project State

## Product

VKB Farm Manager is a mobile-first application for a shared farm's spending, contributions, settlements, inventory, harvest revenue, receipts, and cash flow. The delivered slice now includes reviewed expenses, settlements, reporting, plantation inventory, and harvest tracking; later plan tasks add Excel migration, documents, settings, and final PWA/E2E readiness.

## Stack

- Frontend: React 19, TypeScript, Vite, React Router, Tailwind, Radix-style UI primitives, TanStack Query/Table, React Hook Form, Zod.
- Backend: Hono on Cloudflare Workers, TypeScript strict mode.
- Data/storage: Cloudflare D1 with SQL migrations; R2 is reserved for receipts.
- Authentication: Cloudflare Access identity mapped to active D1 people and roles; opt-in local development identity.
- Deployment/testing: Wrangler and Cloudflare Vite plugin; Vitest/React Testing Library, Worker Vitest pool, Playwright planned for final smoke coverage.

## Architecture

One Worker serves the SPA and owns `/api/v1`. Routes delegate to middleware, services, and repositories. The browser consumes typed JSON envelopes and TanStack Query owns server state. D1 is the business-data authority; all financial calculation and validation is server-side. See `docs/ARCHITECTURE.md` and `docs/DECISIONS.md`.

## Repository structure

- `src/app/`, `src/components/`, `src/features/`, `src/lib/` — client shell, UI, feature modules, shared client utilities.
- `worker/routes/`, `worker/services/`, `worker/repositories/`, `worker/middleware/`, `worker/validation/`, `worker/utils/` — API and domain layers.
- `migrations/` — normalized D1 schema and indexes.
- `tests/unit/`, `tests/worker/`, `src/**/*.test.tsx` — unit, Worker, and frontend tests.
- `docs/superpowers/` — approved design and execution plan; `.superpowers/sdd/` — execution/review ledger.

## Implemented

Foundation, D1 schema/indexes, shared API/security contracts, people/category/expense workflows, responsive shell, settlements, financial reporting, plantation inventory, exact harvest tracking, conservative Excel migration, and private receipt documents are committed through `6a0d0d5`. Financial aggregates are range-checked, the workbook imports with exact provenance, and receipts have compensated R2/D1 lifecycle handling with audited private access.

## In progress

Task 13 settings and administrative configuration are next. See `.codex/CURRENT_TASK.md` for the exact first action.

## Important constraints

- Money is integer paise; use decimal strings at the client boundary. Farm dates are ISO local dates; timestamps are UTC.
- Production must fail closed without Cloudflare Access identity. Do not trust user-supplied roles.
- Validate every write, parameterize SQL, and sanitize Worker errors.
- The importer uses only authoritative legacy ledger data, preserves source traceability and fingerprints, and never invents values.
- The original plan's workbook baselines remain fixed: 394 expenses, ₹29,76,197 total, 2,740 plantation, and ₹10,085 harvest revenue.

## Known issues

- Settings and final production/PWA/browser acceptance work are still plan tasks.
- The importer replaced the stale parser with maintained SheetJS CE 0.20.3. Six high development-only findings remain in the Cloudflare toolchain; production audit was clean in the last authoritative run.

## Current priorities

1. Implement and review settings and administration.
2. Complete PWA, deployment, browser, and final acceptance work.
3. Run whole-branch review and prepare integration options.

## Last updated

2026-09-17 — Task 12 receipts/documents passed review and controller verification; Task 13 settings is next.
