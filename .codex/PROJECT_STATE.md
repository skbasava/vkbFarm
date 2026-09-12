# Project State

## Product

VKB Farm Manager is a mobile-first application for a shared farm's spending, contributions, settlements, inventory, harvest revenue, receipts, and cash flow. The delivered slice now includes reviewed responsive expense management; later plan tasks add settlements, reporting, farm operations, Excel migration, documents, settings, and final PWA/E2E readiness.

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

Foundation, D1 schema/indexes, shared API/security contracts, people/category/expense workflows, responsive shell, settlement workflow, and financial dashboard/reporting are committed through `dec69e1`. CSV exports are bounded, streamed, date-filtered, and spreadsheet-injection safe.

## In progress

Task 9 plantation management is next and not started. See `.codex/CURRENT_TASK.md` for the exact first action.

## Important constraints

- Money is integer paise; use decimal strings at the client boundary. Farm dates are ISO local dates; timestamps are UTC.
- Production must fail closed without Cloudflare Access identity. Do not trust user-supplied roles.
- Validate every write, parameterize SQL, and sanitize Worker errors.
- The future importer uses only authoritative legacy ledger data, preserves source traceability and fingerprints, and never invents values.
- The original plan's workbook baselines remain fixed: 394 expenses, ₹29,76,197 total, 2,740 plantation, and ₹10,085 harvest revenue.

## Known issues

- Receipt upload/document routes, plantation/harvest operations, import, settings, and final production/PWA work are still plan tasks.
- The `xlsx` dependency had seven high audit findings at foundation setup; reassess its replacement during importer work rather than applying incompatible automatic changes.

## Current priorities

1. Implement and review Task 9 plantation management.
2. Implement harvest operations and conservative workbook import.
3. Implement documents, settings, and final acceptance in plan order.

## Last updated

2026-09-12 — Task 8 dashboard/reporting passed review; Task 9 plantation is next.
