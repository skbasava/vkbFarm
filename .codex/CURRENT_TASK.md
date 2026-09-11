# Current Task

## Goal

Implement Task 7: the deterministic shared-expense settlement engine, API, and responsive settlement UI.

## Status

NOT_STARTED

## User requirement

Continue the approved VKB Farm Manager plan without per-step approval. The settlement calculation must correctly split shared farm expenses between active participants, including Satish and Mahesh.

## Completed

- Task 6 expense UI and its review fixes are committed through `8f3c347`.
- Role-aware create/edit/delete controls, the protected identity endpoint, ID-scoped receipt handoff, and 16 focused expense UI tests passed independent re-review.
- The persistent context bootstrap is committed through `f9439fd`.

## Remaining

- Generate and read the Task 7 brief from the approved implementation plan.
- Implement settlement calculation tests first, then API and responsive UI.
- Run the Task 7 review/fix loop and checkpoint the result.

## Relevant files

- `docs/superpowers/plans/2026-09-09-vkb-farm-manager.md` — Task 7 requirements.
- `migrations/0001_initial.sql` — people, expenses, and settlement tables.
- `worker/repositories/expense-repository.ts`, `worker/repositories/people-repository.ts` — authoritative inputs.
- `src/app/router.tsx`, `src/lib/query-keys.ts`, `src/lib/identity.ts` — route, cache, and role contracts.
- `.superpowers/sdd/2026-09-09-vkb-farm-manager/progress.md` — implementation ledger.

## Files modified

None for Task 7 yet. Git should be clean apart from this checkpoint update before it is committed.

## Important implementation details

Use integer paise only. Shared participants are active people with `participates_in_shared_expenses = 1`; do not treat every identity as a participant. Settlement output is computed from authoritative expenses/contributions/settlements, not the workbook's F:H display cells.

## Tests

Last verified Task 6 commands: `npm run test -- src/features/expenses` (16 passed), `npm run test:worker -- tests/worker/identity.test.ts` (5 passed), typecheck, build, lint, and diff check passed.

## Known failures / blockers

- No active blocker.
- Receipt file upload remains owned by Task 12.
- Browser viewport inspection remains deferred to the final browser-capable acceptance pass.

## Next action

Generate the Task 7 brief with the SDD task-brief script, then dispatch its fresh implementer.

## Resume instructions

Read the root context files and Git state, then load only Task 7 plus the listed settlement inputs. Do not re-open completed Task 6 unless a dependency mismatch appears.
