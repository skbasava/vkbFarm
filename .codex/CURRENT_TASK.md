# Current Task

## Goal

Implement Task 10: harvest tracking, exact revenue rules, CRUD/filter APIs, and responsive harvest reporting UI.

## Status

NOT_STARTED

## User requirement

Continue the approved VKB Farm Manager plan without per-step approval. Revenue calculations must avoid binary-float drift, manual/API harvests require valid dates, and legacy EXCEL rows may retain unavailable dates.

## Completed

- Task 9 plantation inventory is implemented and independently approved through `c196ff9`.
- Distinct same-day cohorts are retained; normalized reference collisions fail before schema mutation; summaries include inactive historical references and zero-quantity cohorts.
- Individual cohort PATCH editing is available, imported null dates are preserved, and form references paginate beyond 100.
- Controller verification passed 28 frontend tests, 44 Worker tests, typecheck, lint, and production build.

## Remaining

- Generate and read the Task 10 brief from the approved implementation plan.
- Implement exact scaled-decimal revenue tests and harvest Worker APIs first, then responsive harvest UI.
- Run the Task 10 review/fix loop and checkpoint the result.

## Relevant files

- `docs/superpowers/plans/2026-09-09-vkb-farm-manager.md` — Task 10 requirements.
- `migrations/0001_initial.sql` — harvest schema and legacy-null constraints.
- `worker/utils/money.ts`, `worker/utils/dates.ts` — exact amount and farm-date contracts.
- `worker/repositories/report-repository.ts` — dashboard/report harvest consumers.
- `src/app/router.tsx`, `src/lib/query-keys.ts`, `src/lib/identity.ts`, `src/components/ui/` — UI/query/access contracts.
- `.superpowers/sdd/2026-09-09-vkb-farm-manager/progress.md` — implementation ledger.

## Files modified

None for Task 10 yet. Git should be clean apart from this checkpoint update before it is committed.

## Important implementation details

Parse decimal kilograms as scaled integers before multiplying by paise-per-kilogram. Calculated revenue is the default; any actual-revenue override requires a reason. Manual/API rows require real ISO local dates, while legacy EXCEL rows may retain null dates and cached actual revenue.

## Tests

Task 9 controller verification: 28 frontend tests and 44 Worker tests passed; typecheck, lint, and production build passed.

## Known failures / blockers

- No active blocker.
- Receipt file upload remains owned by Task 12; browser viewport inspection remains deferred to final acceptance.

## Next action

Generate the Task 10 brief with the SDD task-brief script, then dispatch its fresh implementer.

## Resume instructions

Read the root context files and Git state, then load only Task 10 plus the listed harvest schema/report consumers. Preserve existing dashboard/report contracts.
