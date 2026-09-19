# Development

## Prerequisites and common commands

Use Node.js 22.12+ and npm.

```bash
npm ci
npm run dev
npm run test
npm run test:worker
npm run typecheck
npm run lint
npm run build:production
npm run deploy:dry-run
npm run test:e2e
```

Focused frontend tests use `npm run test -- src/features/expenses`; Worker integration tests use `npm run test:worker -- tests/worker/<file>.test.ts`.

## Local data and deployment

Apply local D1 migrations with `npm run db:migrate:local`. `npm run dev` selects the local-only `development` Wrangler environment. The D1 IDs in `wrangler.jsonc` are non-secret placeholders; replace every root, development, and production binding with the account-created D1 ID before remote deployment. `npm run deploy:dry-run` is the required non-uploading production gate.

Before mapping a production admin email or creating the first routable deployment, enable account-level **Protect all Workers** in the Workers & Pages overview, select **All traffic**, attach a default-deny allow policy, and verify there is no bypass. Only after this protection is verified may an authorized account owner run `npm run deploy`. Immediately after deployment, verify unauthenticated and forged-header requests are stopped by Access before the application, then complete the README's native-zoom and installed-window owner-browser gates before production use. See `README.md` for the exact sequence; never rely on selecting a Worker that does not exist yet.

## Conventions

- Keep API routes under `/api/v1` and their successful/error response envelopes consistent with `src/lib/api-client.ts` and Worker error middleware.
- Put feature-specific UI, typed API, schemas, and tests in `src/features/<feature>/`; put shared UI in `src/components/` and shared client utilities in `src/lib/`.
- Keep routes thin, repositories parameterized, and services authoritative for financial rules.
- Add or update targeted tests before claiming a task complete; run typecheck and build when interfaces or bundles change.
- Treat Git as current implementation truth. Keep durable operational and architectural decisions in repository documentation and append delivery evidence to the SDD ledger.

## Import and operations status

The Excel import scripts are implemented with approved-checksum enforcement,
local-only owned D1 persistence, dry-run/error reporting, exact projection
verification, and idempotent writes. Authenticated private receipt endpoints, the
responsive document shelf, and compensating R2/D1 lifecycle are implemented.
The verified workbook baselines and import rules live in
`docs/superpowers/specs/2026-09-09-vkb-farm-manager-design.md`.
