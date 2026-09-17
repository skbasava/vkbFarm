# Current Task

## Goal

Implement Task 13: responsive, role-aware settings for people, expense categories, crops, farm areas, and application configuration.

## Status

READY_TO_IMPLEMENT

## User requirement

Continue the approved VKB Farm Manager plan without per-step approval. Keep the rich Skyblue/Grey frontend and make routine farm configuration possible without code changes or destructive reference deletion.

## Completed

- Task 12 secure R2 receipt storage and the Documents experience are implemented and independently approved through `6a0d0d5`.
- Private receipt reads, exact 10 MiB validation, R2/D1 compensation, audited deletion, XHR cancellation, retry, preview, expense handoff, and responsive role-aware UI are covered.
- Controller verification passed 129 non-Worker tests, 80 Worker tests, typecheck, lint, production build, and diff hygiene.

## Remaining

- Implement a real lazy Settings route with People, Expense Categories, Crops, Farm Areas, and Application sections.
- Reuse existing administrative APIs with admin-only mutation controls and read-only viewer/editor presentation.
- Validate create/rename/deactivate workflows and explain historical-reference retention; never hard-delete referenced records.
- Run the Task 13 independent review/fix loop.

## Relevant files

- `.superpowers/sdd/2026-09-09-vkb-farm-manager/task-13-brief.md` — exact Task 13 requirements.
- `worker/routes/people.ts`, `worker/routes/categories.ts`, `worker/routes/plantation.ts` — existing administrative APIs.
- `src/features/plantation/api.ts`, `src/features/expenses/api.ts` — current client contracts and pagination patterns.
- `src/lib/identity.ts`, `src/lib/query-keys.ts` — role and invalidation contracts.
- `src/app/router.tsx`, `src/styles/index.css` — lazy routing and responsive design system.
- `.superpowers/sdd/2026-09-09-vkb-farm-manager/progress.md` — execution/review ledger.

## Important implementation details

Admins alone may create, rename, or deactivate settings records. Editors and viewers receive a useful read-only configuration view. Referenced categories, people, crops, and farm areas are deactivated rather than hard-deleted so historical transactions remain correct. Forms must paginate all references, reject case/trim duplicates through existing server rules, surface sanitized errors, invalidate every affected feature key, and remain keyboard/mobile accessible.

## Tests

Task 12 controller verification on 2026-09-17: 26 non-Worker files / 129 tests passed; 9 Worker files / 80 tests passed; typecheck, lint, build, and diff hygiene passed.

## Known failures / blockers

- No active blocker.
- Final hands-on browser/PDF receipt validation remains assigned to Task 14.

## Next action

Dispatch the fresh Task 13 implementer from the generated brief, after confirming the existing administrative endpoint matrix, then run its task-scoped review loop.

## Resume instructions

Read the root context files and Git state, then load only Task 13, the existing people/category/plantation APIs, identity/query patterns, and current UI primitives. Do not add destructive delete endpoints.
