# Project State

## Product

VKB Farm Manager is a mobile-first application for a shared farm's spending, contributions, settlements, inventory, harvest revenue, receipts, and cash flow. All planned V1 business modules, conservative Excel migration, private documents, administration, PWA, accessibility, E2E, and operations work are implemented; only final review and account-owner release gates remain.

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

The complete V1 implementation is committed through `f7c7b40`: foundation, D1, API/security, expenses, settlements, reports, plantation, harvest, exact workbook migration, private receipts, role-aware settings, asset-only PWA, accessibility, isolated production-identity E2E, and a production-safe operations guide. Financial aggregates are range-checked, workbook provenance is exact, receipts have compensated R2/D1 lifecycle handling, and production packaging excludes local authentication.

## In progress

Task 14 implementation is complete; scoped re-review and the whole-branch final review are in progress. See `.codex/CURRENT_TASK.md`.

## Important constraints

- Money is integer paise; use decimal strings at the client boundary. Farm dates are ISO local dates; timestamps are UTC.
- Production must fail closed without Cloudflare Access identity. Do not trust user-supplied roles.
- Validate every write, parameterize SQL, and sanitize Worker errors.
- The importer uses only authoritative legacy ledger data, preserves source traceability and fingerprints, and never invents values.
- The original plan's workbook baselines remain fixed: 394 expenses, ₹29,76,197 total, 2,740 plantation, and ₹10,085 harvest revenue.

## Known issues

- Native 200% zoom and installed standalone-PWA window checks require an account-owner browser and remain explicit release gates.
- Cloudflare D1/R2 creation, account-level default-deny Access, and deployment require owner authority and have not been performed.
- The importer replaced the stale parser with maintained SheetJS CE 0.20.3. Six high development-only findings remain in the Cloudflare toolchain; production audit was clean in the last authoritative run.

## Current priorities

1. Complete scoped Task 14 and whole-branch reviews.
2. Present branch integration options without pushing, merging, or deploying.

## Last updated

2026-09-19 — Task 14 implementation and safety fix passed local acceptance; final reviews and owner-controlled release gates remain.
