# VKB Farm Manager

VKB Farm Manager is a mobile-first application for tracking shared farm spending,
contributions, settlements, plantation inventory, harvests, revenue, and cash flow.

## Stack

React and Vite provide the client application. A Hono API runs in a Cloudflare
Worker, with D1 for relational data and R2 for receipt files.

## Prerequisites

- Node.js 22.12 or newer
- npm
- A Cloudflare account is required only for remote deployment

## Run locally

```bash
npm install
npm run dev
```

The local D1 identifier in `wrangler.jsonc` is a non-secret placeholder that is
valid for local development. Before remote deployment, create the D1 database and
R2 bucket, then replace the `database_id` in both the root and `production`
environment binding with the created D1 database ID.

## Import the legacy workbook locally

The approved migration source is `data/VKB-Farm-Expense-tracker.xlsx`. Its SHA-256
checksum is `655b77c344356bd9b201e616cf8c2766ec63495414c6673e02271471d5e8e67a`.
The import command validates this checksum regardless of the supplied filename.
It never supports remote D1 and requires an explicit workbook path. A write
also requires a dedicated local persistence directory.

```bash
npm run import:excel -- data/VKB-Farm-Expense-tracker.xlsx --dry-run --errors /tmp/vkb-migration-errors.json
npm run import:prepare -- --local-db /tmp/vkb-farm-import
npm run db:migrate:local -- --persist-to /tmp/vkb-farm-import
npm run import:excel -- data/VKB-Farm-Expense-tracker.xlsx --local-db /tmp/vkb-farm-import --errors /tmp/vkb-migration-errors.json
npm run verify:import -- data/VKB-Farm-Expense-tracker.xlsx --local-db /tmp/vkb-farm-import
```

Use a new dedicated persistence directory for a disposable import. Repeating the
import against the same local directory skips every matching business fingerprint.
The JSON result reports provenance repairs separately under
`backfilled.expenseEnrichmentProvenance`; these repairs update matching pre-0005
expense rows after validating their complete imported business projection and do
not count as new inserts. Databases written by the earlier Task 11 fix base are
recognized by its historical expense fingerprint and safely migrated to the
canonical identity; actual changes are reported under
`migrated.expenseCanonicalIdentities`. Detail-log enrichment requires a global
one-ledger-row to-one-detail-row match. Payer whitespace trimming is explicitly
recorded in the normalization ledger, and cached harvest revenue must equal exact
weight × price.
`migration-errors.json` contains structured invalid-row evidence; the CLI prints
only counts, the source filename, and its checksum.

Every source must match the approved checksum. `--allow-unapproved-source` is an
explicit fixture/testing override for dry runs, imports, and verification; results
then report `approvedSource: false` and never claim approved baselines. Report
paths must be JSON outside the repository, source, and local persistence directory.
The importer and verifier hash and parse the same in-memory source bytes so a
pathname replacement cannot change the workbook after checksum validation.

Later implementation slices add the complete production deployment instructions.

## Production and preview security

Cloudflare Access is mandatory for this application in production. Before deploying,
create or update a Cloudflare Access application and policy that covers **every**
production hostname and every preview hostname that serves VKB Farm Manager. This
includes the initial `workers.dev` or custom production hostname and any branch or
preview hostnames enabled for the Worker. Do not leave an alternate hostname or
direct route outside the Access application.

The Worker treats `Cf-Access-Authenticated-User-Email` as an identity only on
these Access-protected hostnames. It looks up the matching active person and role
in D1. With `ENVIRONMENT=production`, a missing or unknown identity is rejected
with HTTP 401; it never falls back to the local development user. The automated
Worker identity test verifies this fail-closed behavior, but Cloudflare Access
policy coverage is an account-level deployment requirement that Wrangler cannot
create or validate from this repository.
