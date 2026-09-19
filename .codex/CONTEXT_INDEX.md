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
- `src/features/plantation/` — reviewed plantation summaries, cohort forms/editing, responsive matrix/cards, and paginated reference loading.
- `src/features/harvest/` — reviewed harvest filters, exact revenue forms, responsive summaries/charts, legacy-date disclosure, and tests.
- `src/features/documents/` — reviewed private receipt list/upload/preview/delete experience with expense handoff and role-aware states.
- `src/features/settings/` — reviewed five-section administration workspace with admin-only mutations, inactive history, field-mapped validation, and read-only application facts.
- `public/`, `src/pwa/` — asset-only PWA manifest/icons/service worker and registration readiness tests.
- `tests/e2e/`, `playwright.config.ts`, `scripts/run-e2e.mjs`, `scripts/start-e2e.mjs` — isolated production-identity mobile/desktop browser acceptance with temporary local D1/R2.
- `src/lib/api-client.ts`, `format.ts`, `identity.ts`, `query-keys.ts` — shared API, display, identity, and query contracts.

## Backend

- `worker/index.ts` — Hono composition and protected route boundary.
- `worker/middleware/` — identity, roles, sanitized errors.
- `worker/routes/expenses.ts`, `categories.ts`, `people.ts` — implemented API modules.
- `worker/services/expense-service.ts` and `worker/repositories/expense-repository.ts` — expense rules and D1 queries.
- `worker/services/settlement-service.ts`, `worker/repositories/settlement-repository.ts`, `worker/routes/settlements.ts` — deterministic settlement calculation, persistence, and API.
- `worker/repositories/report-repository.ts`, `worker/services/report-service.ts`, `worker/routes/dashboard.ts`, `worker/routes/reports.ts`, `worker/utils/csv.ts` — report aggregation and streamed export contracts.
- `worker/validation/plantation.ts`, `worker/repositories/plantation-repository.ts`, `worker/services/plantation-service.ts`, `worker/routes/plantation.ts` — reviewed reference administration and distinct plantation-cohort APIs.
- `worker/validation/harvests.ts`, `worker/repositories/harvest-repository.ts`, `worker/services/harvest-service.ts`, `worker/routes/harvests.ts`, `worker/utils/stored-integers.ts` — reviewed harvest CRUD/import boundary, exact revenue, and safe aggregate contracts.
- `scripts/normalize-excel.ts`, `scripts/import-excel.ts`, `scripts/verify-import.ts`, `scripts/source-policy.ts` — reviewed local-only workbook normalization, migration, compatibility, and exact verification.
- `worker/utils/r2-keys.ts`, `worker/repositories/document-repository.ts`, `worker/services/document-service.ts`, `worker/routes/documents.ts` — reviewed private R2 receipt lifecycle and audited document API.
- `worker/validation/expenses.ts`, `worker/utils/money.ts`, `dates.ts` — input and representation invariants.

## Database

- `migrations/0001_initial.sql` — normalized schema and reference seeds.
- `migrations/0002_indexes.sql` — supporting indexes.
- `migrations/0003_plantation_soft_delete_and_reference_normalization.sql`, `migrations/0004_plantation_distinct_cohorts.sql` — collision-safe reference normalization and distinct plantation cohorts.
- `migrations/0005_import_provenance.sql` — additive expense enrichment provenance for imported rows.
- `tests/fixtures/database.ts` — Worker-test database setup.

## Configuration and testing

- `package.json` — commands and dependencies.
- `wrangler.jsonc` — Worker/assets/D1/R2/local-production bindings.
- `vite.config.ts`, `tsconfig*.json`, `vitest*.config.ts`, `eslint.config.js` — build/type/test/lint configuration.
- `tests/unit/` and `tests/worker/` — pure and Worker integration suites; feature tests sit beside feature code.

## Active checkpoint

- `.codex/CURRENT_TASK.md` — exact final-review and branch-handoff state. Load before touching source.
- `git status --short`, `git diff --stat`, `git diff`, and `git log -5 --oneline` — current source-of-truth evidence.
