# Current Task

## Goal

Implement Task 11: conservative Excel normalization, dry-run/import CLI, idempotent D1 migration, and baseline verification.

## Status

NOT_STARTED

## User requirement

Continue the approved VKB Farm Manager plan without per-step approval. The supplied workbook is authoritative only where the approved design says so; preserve formulas/cached values and source traceability, and never invent missing or ambiguous values.

## Completed

- Task 10 harvest tracking is implemented and independently approved through `a1548de`.
- Revenue uses exact scaled-decimal/BigInt arithmetic, safe aggregate money handling, audited role-aware CRUD, and strict trusted-import validation.
- The responsive Skyblue/Grey harvest page includes totals, filters, recent records, accessible chart equivalents, legacy undated disclosure, and full query invalidation.
- Controller verification passed 74 unit/frontend tests, 64 Worker tests, typecheck, lint, production build, and diff hygiene.

## Remaining

- Load the spreadsheet workflow and generate/read the Task 11 brief.
- Copy the source workbook unchanged, checksum it, create deterministic synthetic fixtures, and implement normalization/import/verification test-first.
- Verify exact approved workbook baselines and second-run idempotency, then run the Task 11 review/fix loop.

## Relevant files

- `docs/superpowers/plans/2026-09-09-vkb-farm-manager.md` — Task 11 requirements.
- `docs/superpowers/specs/2026-09-09-vkb-farm-manager-design.md` — authoritative workbook rules and baselines.
- `docs/DECISIONS.md` — conservative import policy.
- `/home/satish/Downloads/VKB-Farm-Expense-tracker.xlsx` — user-supplied source workbook.
- `migrations/`, `tests/fixtures/database.ts` — destination schema and disposable D1 setup.
- `worker/services/harvest-service.ts` — trusted EXCEL harvest import boundary.
- `.superpowers/sdd/2026-09-09-vkb-farm-manager/progress.md` — implementation ledger.

## Files modified

None for Task 11 yet. Git should be clean after this checkpoint is committed.

## Important implementation details

Import only authoritative Common Expense A:E rows; treat personal summaries as controls. Use explicit normalization maps, deterministic fingerprints, structured warnings/errors, dry-run safety, and dependency-ordered writes. Parse both plantation blocks and banana harvest rows while excluding totals. Formula cached values must be verified with the installed parser; derive only documented formulas if caches are unavailable and record every derivation.

## Tests

Task 10 controller verification: 74 unit/frontend tests and 64 Worker tests passed; typecheck, lint, production build, and diff hygiene passed.

## Known failures / blockers

- No active blocker.
- The current `xlsx` dependency has known audit findings; Task 11 must assess a maintained replacement without sacrificing cached formula behavior.

## Next action

Read the spreadsheet skill, load bundled workspace dependencies, generate the Task 11 brief, and dispatch its fresh implementer.

## Resume instructions

Read the root context files and Git state, then load only Task 11, the approved import rules, destination schema/services, and workbook inspection evidence. Do not infer business values from summary sheets.
