# Current Task

## Goal

Implement Task 8: dashboard, reporting APIs/UI, and CSV export.

## Status

NOT_STARTED

## User requirement

Continue the approved VKB Farm Manager plan without per-step approval. Reporting must derive from authoritative farm data and the reviewed settlement service rather than duplicating financial logic.

## Completed

- Task 7 settlement engine/API/UI is committed in `59a081c` and passed independent review.
- The exact legacy workbook case recommends Mahesh pay Satish 491850 paise (₹4,918.50).
- Settlement payments adjust partner balances without altering total shared expense.

## Remaining

- Generate and read the Task 8 brief from the approved implementation plan.
- Implement report/dashboard query tests first, then responsive UI and CSV export.
- Run the Task 8 review/fix loop and checkpoint the result.

## Relevant files

- `docs/superpowers/plans/2026-09-09-vkb-farm-manager.md` — Task 8 requirements.
- `worker/services/settlement-service.ts`, `worker/repositories/settlement-repository.ts` — reviewed settlement source.
- `worker/repositories/expense-repository.ts`, `migrations/0001_initial.sql` — reporting data contracts.
- `src/features/settlements/`, `src/features/expenses/`, `src/app/router.tsx`, `src/lib/query-keys.ts` — UI/query inputs.
- `.superpowers/sdd/2026-09-09-vkb-farm-manager/progress.md` — implementation ledger.

## Files modified

None for Task 8 yet. Git should be clean apart from this checkpoint update before it is committed.

## Important implementation details

Use integer paise and ISO local-date filters. Dashboard settlement figures must consume the settlement service result. CSV output must be spreadsheet-safe and derive from the same filtered queries as on-screen reports.

## Tests

Task 7 report records 7 focused tests and 27 full Worker tests passing, plus typecheck, lint, build, and diff check.

## Known failures / blockers

- No active blocker.
- Default `npm run test` still discovers Worker suites in the browser runner; use `npm run test:worker` for Worker tests.
- Receipt file upload remains owned by Task 12; browser viewport inspection remains deferred to final acceptance.

## Next action

Generate the Task 8 brief with the SDD task-brief script, then dispatch its fresh implementer.

## Resume instructions

Read the root context files and Git state, then load only Task 8 plus the listed reporting/settlement inputs. Do not duplicate settlement calculations in dashboard code.
