# Current Task

## Goal

Finish the Task 6 responsive expense-management review fixes, verify them, append the Task 6 fix report, commit them, and re-review before beginning Task 7.

## Status

IN_PROGRESS

## User requirement

Preserve the interrupted uncommitted Task 6 review-fix work byte-for-byte until it is deliberately completed. Do not begin new application work first.

## Completed

- The initial Task 6 expense UI was delivered in `1a1dded` and its initial report is in `.superpowers/sdd/2026-09-09-vkb-farm-manager/task-6-report.md`.
- A review-fix pass has partially added authenticated identity retrieval, viewer write-action gating, an identity route/test, and coverage for access/invalidation behavior.

## Remaining

- Inspect and finish the existing review-fix implementation without discarding its work.
- Run focused frontend/Worker tests plus typecheck, build, lint, and diff checks as appropriate.
- Append the Task 6 fix report, commit the application fix, and perform the required re-review.

## Relevant files

- `src/features/expenses/ExpenseListPage.tsx`, `ExpenseFormPage.tsx`, `ExpenseDetailPage.tsx`, and `ExpenseForm.tsx` — role-aware expense UI.
- `src/lib/identity.ts`, `src/lib/query-keys.ts` — client identity query and cache key.
- `worker/index.ts`, `worker/middleware/identity.ts`, `tests/worker/identity.test.ts` — protected identity endpoint and contract.
- `src/features/expenses/ExpenseAccess.test.tsx`, `ExpenseApi.test.tsx`, and existing expense tests — review-fix coverage.
- `.superpowers/sdd/2026-09-09-vkb-farm-manager/task-6-report.md` — append target.

## Files modified

Modified Task 6 files: `src/features/expenses/ExpenseDetailPage.tsx`, `ExpenseForm.test.tsx`, `ExpenseForm.tsx`, `ExpenseFormPage.tsx`, `ExpenseListPage.test.tsx`, `ExpenseListPage.tsx`, `src/lib/query-keys.ts`, `tests/worker/identity.test.ts`, and `worker/index.ts`.

Untracked Task 6 files: `src/features/expenses/ExpenseAccess.test.tsx`, `ExpenseApi.test.tsx`, and `src/lib/identity.ts`.

Separate bootstrap-plan file currently untracked: `docs/superpowers/plans/2026-09-11-persistent-context-bootstrap.md`.

## Important implementation details

Prior review required expense controls to respect application roles in the client while the Worker remains the authorization authority. The current fix queries `/api/v1/identity`, permits expense writes only to `admin`/`editor`, exposes the identity only after existing middleware, and adds invalidation assertions for dependent consumers. Preserve the production fail-closed identity contract.

## Tests

The interrupted implementer did not leave verified final results for this fix pass. Treat all uncommitted work as needing execution and review.

## Known failures / blockers

The prior Task 6 review-fix subagent exhausted its usage quota after writing partial changes. This is a handoff event, not a product failure; no source change should be discarded merely because the implementation is incomplete.

## Next action

Finish and verify the existing uncommitted Task 6 review fix before re-review.

## Resume instructions

Read `AGENTS.md`, this file, `.codex/PROJECT_STATE.md`, and Git status/diff first. Inspect only the listed Task 6 files, finish the existing diff, then update this checkpoint and the Task 6 report with actual verification evidence.
