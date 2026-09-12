# Context Index

## Product and plan

- `README.md` — setup and Access deployment requirements.
- `IMPLEMENTATION_STATUS.md` — high-level delivery status.
- `docs/superpowers/specs/2026-09-09-vkb-farm-manager-design.md` — approved product/design authority.
- `docs/superpowers/plans/2026-09-09-vkb-farm-manager.md` — task-by-task implementation plan.
- `.superpowers/sdd/2026-09-09-vkb-farm-manager/progress.md` — execution/review ledger and rulings.

## Frontend

- `src/app/` — providers, router, error boundary, application shell entry points.
- `src/components/layout/` — desktop/mobile navigation and quick actions.
- `src/components/ui/` — shared accessible primitives and state components.
- `src/features/expenses/` — completed expense API hooks, types, schema, responsive list/forms/detail/delete and tests.
- `src/features/settlements/` — settlement queries, responsive summary/form/history UI, and tests.
- `src/features/dashboard/`, `src/features/reports/` — dashboard/report queries, responsive views, filters, charts, and tests.
- `src/lib/api-client.ts`, `format.ts`, `identity.ts`, `query-keys.ts` — shared API, display, identity, and query contracts.

## Backend

- `worker/index.ts` — Hono composition and protected route boundary.
- `worker/middleware/` — identity, roles, sanitized errors.
- `worker/routes/expenses.ts`, `categories.ts`, `people.ts` — implemented API modules.
- `worker/services/expense-service.ts` and `worker/repositories/expense-repository.ts` — expense rules and D1 queries.
- `worker/services/settlement-service.ts`, `worker/repositories/settlement-repository.ts`, `worker/routes/settlements.ts` — deterministic settlement calculation, persistence, and API.
- `worker/repositories/report-repository.ts`, `worker/services/report-service.ts`, `worker/routes/dashboard.ts`, `worker/routes/reports.ts`, `worker/utils/csv.ts` — report aggregation and streamed export contracts.
- `worker/validation/expenses.ts`, `worker/utils/money.ts`, `dates.ts` — input and representation invariants.

## Database

- `migrations/0001_initial.sql` — normalized schema and reference seeds.
- `migrations/0002_indexes.sql` — supporting indexes.
- `tests/fixtures/database.ts` — Worker-test database setup.

## Configuration and testing

- `package.json` — commands and dependencies.
- `wrangler.jsonc` — Worker/assets/D1/R2/local-production bindings.
- `vite.config.ts`, `tsconfig*.json`, `vitest*.config.ts`, `eslint.config.js` — build/type/test/lint configuration.
- `tests/unit/` and `tests/worker/` — pure and Worker integration suites; feature tests sit beside feature code.

## Active checkpoint

- `.codex/CURRENT_TASK.md` — exact Task 9 plantation implementation state. Load before touching source.
- `git status --short`, `git diff --stat`, `git diff`, and `git log -5 --oneline` — current source-of-truth evidence.
