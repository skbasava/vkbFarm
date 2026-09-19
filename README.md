# VKB Farm Manager

VKB Farm Manager is a private, mobile-first farm finance and operations application. One Cloudflare Worker serves the React SPA and Hono API; D1 stores expenses, settlements, plantation, harvest, settings, and audit records; private R2 stores receipt files.

## Prerequisites

- Node.js 22.12 or newer and npm
- Wrangler 4.130.0 (installed by this project)
- Chromium for Playwright 1.63.0: `npx playwright install chromium`
- For production only: a Cloudflare account with Workers, D1, R2, and Zero Trust Access
- For R2 backup: an S3-compatible tool such as AWS CLI and an R2 API token

Install exact locked dependencies with `npm ci`.

## Repository layout

- `src/`: React client, feature UI, typed API calls, and unit tests
- `worker/`: Hono routes, services, repositories, authentication, and errors
- `migrations/`: D1 schema migrations and stable reference seeds
- `scripts/`: conservative workbook import/verification and local E2E harnesses
- `tests/worker/`: Worker integration tests using isolated local bindings
- `tests/e2e/`: Chromium workflows using a fresh temporary D1/R2 store per run
- `public/`: manifest, asset-only service worker, and deterministic PWA icons

The PWA caches only successful same-origin application assets and the navigation shell. All `/api` traffic—including reads, writes, CSV, and document streams—is network-only. Offline writes fail visibly and keep form values; V1 has no background synchronization.

## Local development

Apply migrations to Wrangler's local D1 store, then start the local Worker/Vite application:

```bash
npm run db:migrate:local
npm run dev
```

`npm run dev` explicitly selects the `development` Wrangler environment, where the local-only development identity is enabled. Production never inherits that bypass. R2 is emulated locally by Wrangler. To isolate a local database, append `-- --persist-to /absolute/path/to/state` to the migration command and start Vite with `VKB_E2E_PERSIST_TO=/absolute/path/to/state npm run dev`.

## Legacy workbook: disposable local import only

The approved source is `data/VKB-Farm-Expense-tracker.xlsx`, SHA-256 `655b77c344356bd9b201e616cf8c2766ec63495414c6673e02271471d5e8e67a`. Import tooling is intentionally local-only; never point it at remote D1.

Use a new directory outside the repository:

```bash
IMPORT_STATE=/tmp/vkb-farm-import
npm run import:excel -- data/VKB-Farm-Expense-tracker.xlsx --dry-run --errors /tmp/vkb-migration-errors.json
npm run import:prepare -- --local-db "$IMPORT_STATE"
npm run db:migrate:local -- --persist-to "$IMPORT_STATE"
npm run import:excel -- data/VKB-Farm-Expense-tracker.xlsx --local-db "$IMPORT_STATE" --errors /tmp/vkb-migration-errors.json
npm run verify:import -- data/VKB-Farm-Expense-tracker.xlsx --local-db "$IMPORT_STATE"
npm run import:excel -- data/VKB-Farm-Expense-tracker.xlsx --local-db "$IMPORT_STATE" --errors /tmp/vkb-migration-errors-rerun.json
```

The verifier must report 394 expenses, 297,619,700 paise of expenses, plantation quantity 2,740, and 1,008,500 paise of harvest revenue. The rerun must insert nothing and skip the matching fingerprints. `--allow-unapproved-source` is only a fixture/testing override and can never establish the approved baseline.

## Verification

```bash
npm test
npm run test:worker
npm run typecheck
npm run lint
npm run build
npm run build:production
npm run deploy:dry-run
npm run test:e2e
```

`npm run test:e2e` builds the production environment, creates temporary D1/R2 persistence, applies migrations and the committed E2E seed, and uses real production identity headers for admin/editor/viewer contexts. It never reuses `.wrangler/state`, workbook-import state, or remote bindings. `deploy:dry-run` compiles with production bindings but does not upload.

## One-time production resource setup

These are account-owner commands. Do not run them until the account, names, Access policy, and backup location are approved.

```bash
npx wrangler login
npx wrangler d1 create vkb-farm-db
npx wrangler r2 bucket create vkb-farm-receipts
```

Copy the returned D1 UUID into every `database_id` in `wrangler.jsonc` (root, `development`, and `production`). Keep the R2 bucket private and retain the configured name. Do not add an `assets.directory`; the Cloudflare Vite plugin generates the deploy asset directory.

Choose exactly one database initialization path:

1. **Empty database:** run `npm run db:migrate:remote`. This explicitly uses `--env production --remote` and creates the schema plus stable seed references.
2. **Verified workbook database:** complete and verify the disposable local workflow above, export that complete local database, and load it into the newly created empty remote D1 database. Do not run remote migrations first and do not run the workbook importer against remote D1.

```bash
npx wrangler d1 export vkb-farm-db --local --persist-to "$IMPORT_STATE" --output /tmp/vkb-farm-verified.sql
npx wrangler d1 execute vkb-farm-db --env production --remote --file /tmp/vkb-farm-verified.sql
```

## Cloudflare Access and first deployment

The first deployment must use account-level Access because a Worker-level policy cannot be attached before the named Worker exists. Complete this sequence without deploying the application or enabling any custom route:

1. Enable Zero Trust for the account if it is not already enabled.
2. In the **Workers & Pages overview**, find **Protect all Workers**, select **Enable Access**, choose **All traffic**, and attach a default-deny policy that allows only the approved identities. Apply the policy. Do not add a Worker, hostname, or path bypass.
3. Verify in the dashboard that account-level protection is enabled for **All traffic**, covers existing and future Workers, and has no public/bypass exception. This must be true before mapping a production admin email or creating the first routable deployment. See Cloudflare's [Protect all Workers instructions](https://developers.cloudflare.com/workers/configuration/cloudflare-access/#protect-all-workers).

Only after that protection is enabled and verified, populate real Access email addresses for the imported/seeded people. Imported people currently have null emails. Use a carefully reviewed statement such as:

```bash
npx wrangler d1 execute vkb-farm-db --env production --remote --command "UPDATE people SET email='owner@example.com', app_role='admin' WHERE id='person_satish'"
```

Use unique emails, keep at least one active admin, verify the rows, and never put personal emails or Access credentials in Git. The Worker maps `Cf-Access-Authenticated-User-Email` to an active D1 person and returns HTTP 401 for a missing or unknown mapped identity, but this application-level lookup is not a substitute for the Access gate.

First verify the production package without uploading:

```bash
npm run deploy:dry-run
```

The binding summary must show `ENVIRONMENT ("production")` and must not show `DEV_AUTH_ENABLED`. When the owner has confirmed resources, protected account-level Access, email mappings, and backups, deploy with:

```bash
npm run deploy
```

The production config deliberately sets `workers_dev: true` and `preview_urls: false`. Immediately after deployment, verify the exact `vkb-farm-manager.<account-subdomain>.workers.dev` hostname before using the application:

- An unauthenticated request to both `/` and `/api/v1/identity` must be intercepted by Access with a login or deny response, not application HTML or JSON.
- A request without an Access session but with a forged `Cf-Access-Authenticated-User-Email` header must also be intercepted by Access; it must never reach the application as an authenticated identity.
- After an approved administrator completes Access login, `/api/v1/identity` must return that administrator's mapped email and `admin` role.
- Recheck the Worker Access view for **All traffic** and confirm no Worker-level, hostname, or path rule overrides the account default with a bypass.

If any check fails, disable the routable hostname or remove the deployment until protection is corrected. A custom domain may be enabled only after its real hostname is known, the account-level gate is still effective, any more-specific hostname rule is confirmed non-bypassing, and the same unauthenticated/forged-header checks pass. No unknown domain is configured in this repository.

## Owner-browser release gates

Code and automated PWA/accessibility acceptance are complete, but these two owner-browser checks remain pending and are required before production use:

1. Inspect every primary route in a supported desktop browser at native 200% browser zoom. Confirm that controls, focus indicators, dialogs, navigation, validation, and content remain available without lost functionality or horizontal page overflow.
2. Install the PWA through the target browser/operating system, launch the installed standalone PWA window, and verify `/dashboard` startup, Access login, navigation, online API behavior, cached-shell offline navigation, and update/reopen behavior.

The in-app verification harness could exercise equivalent responsive reflow, manifest/install metadata, service-worker control, and offline shell behavior, but it could not invoke native browser zoom or an OS installed-app window. Do not mark these owner-browser gates complete from automated evidence alone.

## Backups and operational snapshots

Export D1 before migrations, bulk initialization, or a release:

```bash
npx wrangler d1 export vkb-farm-db --env production --remote --output "vkb-d1-$(date +%F).sql"
```

R2 has no bulk-download command in Wrangler 4.130.0. Create a scoped R2 API token, keep credentials outside shell history, and use supported S3 tooling against the account endpoint:

```bash
AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
  aws s3 sync s3://vkb-farm-receipts ./vkb-r2-backup \
  --endpoint-url https://ACCOUNT_ID.r2.cloudflarestorage.com
```

Use the authenticated Reports page to download dated expenses, settlements, plantation, and harvest CSV snapshots. CSV is an operational snapshot, not a substitute for D1 plus R2 backup.

## Troubleshooting

- **401 in production:** confirm Access covers the exact hostname, the request reached the Worker through Access, and the normalized Access email belongs to an active person.
- **403 on a write:** viewers are read-only; confirm the mapped D1 `app_role` is `editor` or `admin` for that operation.
- **Local 401:** start with `npm run dev`, not bare `vite`, so the development environment and local-only identity are selected.
- **Missing tables:** apply migrations to the same `--persist-to` directory used by the local server.
- **Receipt upload failure:** confirm JPEG/PNG/PDF type and extension match, the file is at most 10 MiB, and the private R2 binding is present. A failed receipt never rolls back its saved expense.
- **Workbook rejected:** confirm the approved file checksum and use an external error-report path; do not bypass approval for real data.
- **Offline save remains unsent:** reconnect and submit again. No write queue exists by design.
- **PWA update appears delayed:** close all installed-app tabs and reopen. The service worker intentionally does not force `skipWaiting()`.

Deployment status: **Ready for authenticated Cloudflare resource creation**. Owner-browser release gates remain pending.
