# Current Task

## Goal

Implement Task 14: installable asset-only PWA behavior, final accessibility and browser verification, end-to-end acceptance coverage, and the production operations guide.

## Status

READY_TO_IMPLEMENT

## User requirement

Continue the approved VKB Farm Manager plan without per-step approval. Preserve the rich Skyblue/Grey frontend, verified Excel formulas/baselines, and secure Cloudflare architecture while finishing V1 readiness.

## Completed

- Task 13 settings and administrative configuration are implemented and independently approved through `c749aed`.
- People, category, crop, and farm-area settings paginate active/inactive records, restrict mutations to admins, preserve historical references, map server validation to fields, and use explicit PATCH-only status changes.
- Controller verification passed 21 focused settings tests, 150 non-Worker tests, 80 Worker tests, typecheck, zero-warning lint, production build, and diff hygiene.

## Remaining

- Add the manifest, generated 192/512 icons, and an asset-only service worker that never queues or fabricates API writes.
- Add Playwright smoke/accessibility coverage for every primary workflow and responsive viewport.
- Perform hands-on browser validation, including the Task 12 receipt/PDF experience and role/offline/error states.
- Complete and verify the setup, Cloudflare Access/D1/R2, migration, backup, deployment, and troubleshooting guide.
- Run the complete V1 acceptance suite, independent Task 14 review/fix loop, and whole-branch final review.

## Relevant files

- `docs/superpowers/plans/2026-09-09-vkb-farm-manager.md` — Task 14 requirements and acceptance commands.
- `docs/superpowers/specs/2026-09-09-vkb-farm-manager-design.md` — approved product, PWA, accessibility, and operations design.
- `src/app/router.tsx`, `src/components/layout/`, `src/features/` — completed routes and interaction contracts.
- `worker/index.ts`, `wrangler.jsonc`, `vite.config.ts` — Worker/assets/D1/R2 behavior.
- `README.md`, `IMPLEMENTATION_STATUS.md`, `package.json` — operations, status, and commands.
- `.superpowers/sdd/2026-09-09-vkb-farm-manager/progress.md` — execution/review ledger.

## Important implementation details

The service worker may cache only versioned assets and the navigation shell; `/api/*` remains network-only and write failures remain honest online/offline errors. Production stays fail-closed behind Cloudflare Access. Do not create remote D1/R2 resources or deploy without explicit authority. Browser tests must use deterministic local fixtures, verify role gates and core expense/settlement/harvest flows, and cover 390x844 plus 1440x900 before final acceptance.

## Tests

Task 13 controller verification on 2026-09-17: 27 non-Worker files / 150 tests passed; 9 Worker files / 80 tests passed; focused settings 21/21; typecheck, lint, build, and diff hygiene passed.

## Known failures / blockers

- No active blocker.
- Remote Cloudflare resource creation and production deployment remain intentionally out of scope until the user explicitly authorizes account mutations.

## Next action

Perform a read-only Task 14 preflight of the current PWA/browser-test setup, route/identity test seams, and installed Wrangler/Playwright commands; generate the exact Task 14 brief and then dispatch the implementation subagent.

## Resume instructions

Read the root context files and Git state, then load only Task 14, current application entry/build files, representative workflows, and existing test infrastructure. Use current official Cloudflare/Wrangler guidance before changing deployment or asset behavior. Do not deploy or mutate remote D1/R2.
