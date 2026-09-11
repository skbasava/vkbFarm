# Development

## Prerequisites and common commands

Use Node.js 20+ and npm.

```bash
npm install
npm run dev
npm run test
npm run test:worker
npm run typecheck
npm run lint
npm run build
```

Focused frontend tests use `npm run test -- src/features/expenses`; Worker integration tests use `npm run test:worker -- tests/worker/<file>.test.ts`.

## Local data and deployment

Apply the local D1 migrations with `npm run db:migrate:local`. The D1 IDs in `wrangler.jsonc` are non-secret local-development placeholders; replace both root and production bindings with the account-created D1 ID before remote deployment. `npm run deploy` builds and runs Wrangler deployment.

Production and every preview hostname must be protected by Cloudflare Access before deployment. See `README.md` for the required hostname coverage and account setup.

## Conventions

- Keep API routes under `/api/v1` and their successful/error response envelopes consistent with `src/lib/api-client.ts` and Worker error middleware.
- Put feature-specific UI, typed API, schemas, and tests in `src/features/<feature>/`; put shared UI in `src/components/` and shared client utilities in `src/lib/`.
- Keep routes thin, repositories parameterized, and services authoritative for financial rules.
- Add or update targeted tests before claiming a task complete; run typecheck and build when interfaces or bundles change.
- Treat Git as current implementation truth. Record task checkpoints in `.codex/` rather than copying large diffs into docs.

## Import and operations status

Excel import scripts and receipt document endpoints are planned but not yet implemented. Do not assume they exist merely because package scripts or schema tables anticipate them. The verified workbook baselines and eventual import rules live in `docs/superpowers/specs/2026-09-09-vkb-farm-manager-design.md`.
