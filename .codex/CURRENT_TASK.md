# Current Task

## Goal

Implement Task 12: secure R2 receipt storage, audited document APIs, and the responsive receipt experience.

## Status

READY_TO_IMPLEMENT

## User requirement

Continue the approved VKB Farm Manager plan without per-step approval. Use the Skyblue/Grey design system, keep receipt access private, and preserve a saved expense when a later receipt upload fails.

## Completed

- Task 11 Excel normalization/import is implemented and independently approved through `fee6ad3`.
- The local-only importer verifies the approved workbook exactly, preserves cached formulas and provenance, supports pre-0005 and prior-fingerprint upgrades, and remains idempotent.
- Controller verification passed 114 non-Worker tests, 64 Worker tests, typecheck, lint, production build, and diff hygiene.

## Remaining

- Implement safe R2 object keys and strict JPG/JPEG/PNG/PDF validation with the configurable 10 MiB boundary.
- Implement authenticated, role-aware document list/upload/read/delete APIs with D1 metadata, audit logging, and R2/D1 compensation.
- Replace the Documents placeholder and integrate accessible upload, preview, retry, and delete flows with expense create/detail pages.
- Run the Task 12 independent review/fix loop.

## Relevant files

- `.superpowers/sdd/2026-09-09-vkb-farm-manager/task-12-brief.md` — exact Task 12 requirements.
- `docs/superpowers/specs/2026-09-09-vkb-farm-manager-design.md` — private receipt lifecycle and UI authority.
- `migrations/0001_initial.sql`, `migrations/0002_indexes.sql` — existing documents schema/index.
- `worker/types.ts`, `wrangler.jsonc` — existing `RECEIPTS` binding.
- `worker/routes/expenses.ts`, `worker/services/expense-service.ts` — role, validation, audit, and error patterns.
- `src/features/expenses/ExpenseForm.tsx`, `src/features/expenses/ExpenseDetailPage.tsx` — receipt handoff consumers.
- `.superpowers/sdd/2026-09-09-vkb-farm-manager/progress.md` — execution/review ledger.

## Important implementation details

Generate R2 keys only on the server as `receipts/{year}/{month}/{uuid}-{safeFilename}`. Validate size, type, and file signature before storage. Put R2 first, then atomically write metadata and CREATE audit; compensate by deleting the object if D1 fails. Reads resolve only through an authorized document ID and never expose object keys. Deletes remove R2 before atomically deleting metadata and recording DELETE audit. Viewers may read; editors/admins may upload/delete.

## Tests

Task 11 controller verification on 2026-09-17: 24 non-Worker files / 114 tests passed; 8 Worker files / 64 tests passed; typecheck, lint, build, and diff hygiene passed.

## Known failures / blockers

- No active blocker.
- A fresh online dependency audit remains policy-blocked; the last authoritative audit was 0 production findings and 6 high development-only Cloudflare-toolchain findings.

## Next action

Dispatch the fresh Task 12 implementer using the generated brief and the approved receipt/R2 rulings, then run its task-scoped review loop.

## Resume instructions

Read the root context files and Git state, then load only Task 12, the approved receipt rules, existing expense/document schema, R2 bindings, and current UI/API patterns. Do not use remote R2 or D1.
