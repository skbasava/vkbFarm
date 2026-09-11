# Project State

## Product

VKB Farm Manager is a mobile-first application for a shared farm's spending, contributions, settlements, inventory, harvest revenue, receipts, and cash flow. The current delivered slice is the foundation through responsive expense management; later plan tasks add settlements, reporting, farm operations, Excel migration, documents, settings, and final PWA/E2E readiness.

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

Foundation, D1 schema/indexes, API/money/date/error contracts, Access-aware identity and roles, people/category/expense API, responsive application shell, and the initial expense experience are committed through `92a8958`. Expense creation/editing/listing/detail/soft deletion use the existing API and responsive UI.

## In progress

Task 6 review fixes are uncommitted and must be finished and verified before re-review. They add client identity awareness and an authenticated identity endpoint, gate expense write actions for viewers, and extend invalidation/access coverage. See `.codex/CURRENT_TASK.md`; Git is authoritative for the exact diff.

## Important constraints

- Money is integer paise; use decimal strings at the client boundary. Farm dates are ISO local dates; timestamps are UTC.
- Production must fail closed without Cloudflare Access identity. Do not trust user-supplied roles.
- Validate every write, parameterize SQL, and sanitize Worker errors.
- The future importer uses only authoritative legacy ledger data, preserves source traceability and fingerprints, and never invents values.
- The original plan's workbook baselines remain fixed: 394 expenses, ₹29,76,197 total, 2,740 plantation, and ₹10,085 harvest revenue.

## Known issues

- Task 6 review-fix work is incomplete because the implementing subagent exhausted its quota after writing a partial uncommitted change.
- Receipt upload/document routes, settlements, dashboard/reports, farm operations, import, settings, and final production/PWA work are still plan tasks.
- The `xlsx` dependency had seven high audit findings at foundation setup; reassess its replacement during importer work rather than applying incompatible automatic changes.

## Current priorities

1. Finish, test, report, commit, and re-review the existing Task 6 review fixes.
2. Continue the approved plan with Task 7 settlements.
3. Implement dashboard/reporting, farm operations, conservative workbook import, documents, settings, and final acceptance in plan order.

## Last updated

2026-09-11 — persistent recovery context bootstrapped; Task 6 review-fix checkpoint recorded as in progress.
