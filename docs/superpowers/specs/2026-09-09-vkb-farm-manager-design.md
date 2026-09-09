# VKB Farm Manager Design

**Date:** 2026-09-09  
**Status:** Approved for implementation planning  
**Source requirements:** User-supplied complete implementation specification and `VKB-Farm-Expense-tracker.xlsx`

## Purpose

VKB Farm Manager replaces the existing Excel workbook with a mobile-first farm finance and operations application. It must show shared expenditure, individual contributions, equal-share settlements, plantation inventory, harvest revenue, and cash flow without presenting users with spreadsheet-like screens.

The first release includes the complete V1 scope from the source specification: dashboard, expense management, settlement calculation and history, plantation inventory, harvest tracking, reports and CSV export, Excel migration and verification, R2 receipts, PWA support, tests, and Cloudflare deployment documentation.

## Product Principles

- A farm owner can understand total spending, each person's contribution, the current settlement, crops, harvests, and revenue from the dashboard.
- Adding an expense should take approximately 15–30 seconds on a phone.
- Financial calculations are authoritative on the server and stored in integer paise.
- Excel is an auditable migration source, not a production dependency.
- The interface uses plain language, large touch targets, limited navigation depth, and useful defaults.
- V1 remains focused. Weather, AI, payroll, GST, IoT, procurement, and offline write synchronization are excluded.

## Delivery Approach

Implementation proceeds as working vertical slices rather than disconnected frontend and backend batches:

1. Foundation: React application, Hono Worker, local D1, migrations, seeds, shared types, and test harness.
2. Expense and settlement slice: expense CRUD, people/categories, contribution totals, equal-share balancing, and responsive expense screens.
3. Dashboard and reporting slice: aggregated metrics, charts, recent activity, report queries, and CSV exports.
4. Plantation and harvest slice: inventory and harvest CRUD, calculated revenue, summaries, and responsive screens.
5. Excel migration slice: parsing, normalization, idempotent import, dry run, error report, and baseline verification.
6. Documents and production readiness: R2 receipts, Access identity integration, audit logging, PWA, accessibility, deployment documentation, and final verification.

Each slice must connect React to the Worker and D1 and remain independently testable.

## System Architecture

One Cloudflare Worker application serves the Vite-built React static assets and the `/api/v1` Hono API. React Router owns client navigation. The Cloudflare Vite plugin provides local and production integration. D1 stores application data, and R2 stores receipt binaries.

Request flow:

```text
React feature
  -> typed API client
  -> Hono route
  -> identity and role middleware
  -> Zod request validation
  -> feature service
  -> parameterized D1 repository / R2 gateway
  -> consistent JSON response
```

Routes handle HTTP concerns only. Services own business rules such as money conversion, harvest revenue, settlement balancing, and import normalization. Repositories own SQL and map D1 rows to application types.

## Repository Organization

The project uses feature-oriented boundaries:

```text
src/
  app/                 application shell, router, providers
  components/          reusable UI, layout, charts, feedback states
  features/            dashboard, expenses, settlements, plantation,
                       harvest, reports, documents, settings
  lib/                 API client, formatting, dates, query keys
  styles/              design tokens and global styles
  types/               shared frontend contracts
worker/
  middleware/          identity, authorization, errors
  routes/              thin API route modules
  services/            business rules and transactions
  repositories/        parameterized D1 access
  validation/          server-side Zod schemas
  utils/               IDs, money, dates, CSV, R2 keys
scripts/               Excel parsing, normalization, import, verification
migrations/            D1 schema and indexes
tests/                 shared fixtures, integration and end-to-end tests
```

Files are split by responsibility. Feature-specific UI, hooks, schemas, and API calls remain together. Shared modules exist only when used by multiple features.

## Frontend Experience

### Visual Direction

The approved visual direction is a modern financial field ledger using sky blue and engineered greys:

- Sky blue identifies primary actions, active navigation, selected controls, links, and live financial signals.
- Charcoal grey provides the desktop navigation shell and strong text contrast.
- Cool light grey forms the page canvas and separates content without excessive borders.
- White or dark neutral surfaces hold KPI cards and forms.
- Semantic error, warning, and success colors remain distinct and are always paired with text or icons.

Typography pairs a condensed, characterful display face with a highly readable sans-serif body face. The application avoids generic admin-template styling, decorative gradients, excessive card nesting, and bright agricultural green.

### Responsive Shell

- Desktop uses a persistent sidebar and a content width capped near 1400px.
- Tablet uses a collapsible sidebar.
- Mobile uses bottom navigation: Home, Expenses, a central quick-add action, Farm, and More.
- The quick-add action opens expense, harvest, plantation, settlement, and bill-upload choices.
- Expense tables become readable mobile cards instead of forcing horizontal scrolling.
- Important form actions remain visible near the bottom of mobile screens without covering fields.

### State and Forms

TanStack Query owns server data and invalidation. Local React state owns drawers, dialogs, filters, and transient controls. React Hook Form and Zod provide accessible field errors and consistent client validation; the server repeats all write validation.

Every route includes intentional loading, empty, error, and offline states. Destructive actions require accessible confirmation. Successful writes show feedback and invalidate affected dashboard, report, and list queries.

## Data Model

Core tables follow the supplied schema: `people`, `expense_categories`, `crops`, `farm_areas`, `expenses`, `settlements`, `plantation_inventory`, `harvests`, `documents`, and `audit_log`.

Additional import metadata includes a deterministic `import_fingerprint` with a unique index. All imported business records preserve `source`, `source_sheet`, and `source_row` where applicable.

Money uses integer paise. Transaction dates use ISO local calendar dates (`YYYY-MM-DD`) and are never round-tripped through UTC. Timestamps use UTC. The UI formats dates for Asia/Kolkata and currency with Indian grouping.

The database seeds Satish and Mahesh as active participants and MT and SK as farm areas. The application retrieves these records rather than hard-coding them in feature logic.

### Legacy Harvest Dates

The source banana harvest sheet contains three valid revenue rows but no harvest dates. To satisfy both traceable migration and the rule against invented dates, `harvests.harvest_date` is nullable for legacy imported records only. Manual and API-created harvests require a valid date. The UI labels a missing legacy date as `Date unavailable`, and date-filtered reports disclose that undated records are excluded from period groupings while including them in all-time totals.

## Expense and Settlement Rules

All shared expenses contribute to the participant pool unless `is_shared` is false or the expense is soft-deleted. For each participant:

```text
expected share = total shared expense / active participant count
raw balance = amount paid - expected share
```

Positive balances should receive money; negative balances owe money. Recorded participant-to-participant settlements adjust the remaining balances without changing farm expenditure. A deterministic creditor/debtor matching algorithm produces recommended transfers for two or more participants.

Paise that cannot be divided evenly are allocated deterministically by stable participant ID so balances always sum to zero. Tests cover equal payments, one payer, three participants, prior settlements, and odd-paise totals.

The workbook's ₹13,000 row categorized as `Settlement` is a payment to Giri and remains a farm expense. It is not imported into participant settlement history. The workbook contains no authoritative prior owner-to-owner settlement transactions, so imported settlement history starts empty.

## Excel Migration

The local migration command accepts a workbook path and supports `--dry-run`. It does not use an external API and does not make production runtime depend on Excel.

### Expenses

- `Common Expense` columns A:E are the authoritative ledger.
- A row is eligible when it has a deterministically valid date, numeric positive amount, and recognizable payer.
- Formula, pivot, summary, and note regions to the right are never imported as expenses.
- `Satish's Expense` and `Mahesh's Expense` are reconciliation sources only.
- `Sat-Expense Log` and `Mah-Expense-Log` may enrich a Common Expense transaction only when correlation is unambiguous. Otherwise, the importer emits a warning.
- Missing categories become `Uncategorized`. Missing descriptions become `Imported expense` with a warning. Vendors are never fabricated.
- Category and person mappings normalize explicit spelling/case variants and print every change. Ambiguous values remain distinct.

### Plantation

Both side-by-side `Name / MT / SK` blocks are parsed. Total, Sum, Grandtotal, blank, and non-positive inventory rows are excluded. Crop names are preserved except for explicit mappings such as `Bannana` to `Banana`. Repeated crops across the blocks aggregate by crop and area without losing source traceability.

### Harvest

Rows 2–4 of `Banana Harvest Details` become Banana harvest records. Evaluated formula values populate quantity, net/average weight, sale price, and actual revenue. The Grand Total row is verification evidence only.

### Idempotency and Errors

The importer hashes normalized source identity and business fields. A second run skips matching fingerprints. Invalid rows are written to `migration-errors.json` with sheet, row, reason, and raw values. Dry-run output reports discovered, accepted, skipped, duplicate, normalized, warning, and error counts before any database write.

## Verified Workbook Baseline

The verification command independently derives and compares these values:

| Measure | Expected value |
| --- | ---: |
| Common expense rows | 394 |
| Total common expense | ₹29,76,197 |
| Satish contribution | ₹14,93,017 |
| Mahesh contribution after case normalization | ₹14,83,180 |
| Equal share per person | ₹14,88,098.50 |
| Recommended transfer | Mahesh pays Satish ₹4,918.50 |
| Plantation total | 2,740 |
| Banana harvest revenue | ₹10,085 |

Verification exits non-zero for a material mismatch. The settlement baseline is tested in paise with exact equality; only workbook-derived floating calculations may use an explicitly small tolerance.

## API Design

The API follows the requested `/api/v1` routes and JSON envelopes. List endpoints paginate by default at 25 items and accept documented filters. Dashboard data is aggregated in one endpoint. Report aggregation occurs in SQL rather than the browser.

Write endpoints validate positive amounts, ISO dates, references, CAPEX/OPEX values, non-negative inventory/harvest values, and settlement source/destination differences. Expense deletion is soft deletion and emits an audit event. Category records with usage may only be disabled.

CSV export streams or paginates from D1 without loading an unbounded dataset into browser memory.

## Documents and R2

Receipt uploads accept JPG, JPEG, PNG, and PDF up to a configurable 10 MB limit. The Worker checks content type and size and generates keys shaped like `receipts/{year}/{month}/{uuid}-{safeFilename}`. Client filenames never determine bucket traversal.

The Worker writes the R2 object first and then commits D1 metadata. If metadata creation fails, it removes the just-uploaded object. Delete operations remove or tombstone metadata consistently and record an audit event. Document reads require an authorized document ID and never expose arbitrary R2 keys.

## Identity and Authorization

Cloudflare Access protects the production application. Middleware reads verified identity headers and maps identities to `admin`, `editor`, or `viewer` roles. Admins manage settings and all records; editors create and update farm data; viewers are read-only.

Local development may use an explicit development identity only when the environment is local. Production configuration fails closed if Access identity is absent; the development bypass cannot become the production default.

## Error Handling

The Worker converts known validation, authentication, authorization, not-found, conflict, and storage failures into the shared error envelope and appropriate HTTP status. Production responses never expose SQL errors, stack traces, bucket keys, or internal paths.

The frontend maps field validation details to the relevant input. Network and offline failures retain user-entered form values and offer retry. Route-level failures render recoverable error states. Error boundaries protect the application shell from unexpected rendering failures.

## Testing and Verification

### Unit Tests

- Money parsing, paise conversion, INR formatting, dates, and IDs.
- Generic settlement balancing and prior-settlement adjustment.
- Harvest calculated revenue and override validation.
- Person/category/crop normalization and Excel row classification.
- Import fingerprints, duplicate detection, plantation aggregation, and CSV escaping.

### Integration Tests

- Hono routes against a migrated local D1 test database.
- Expense CRUD, filtering, pagination, soft deletion, and audit records.
- Dashboard and report aggregation.
- Settlement creation and updated recommendations.
- Plantation and harvest CRUD and summaries.
- R2 metadata behavior with a test bucket adapter.

### Frontend and End-to-End Tests

React Testing Library covers form validation, mobile/desktop result rendering, loading/empty/error states, and mutation invalidation. A small Playwright suite covers dashboard load, expense creation, settlement update, harvest creation, and revenue refresh.

### Required Completion Checks

The release is complete only after `npm install`, linting, type checking, unit/integration tests, production build, local Worker run, Excel dry run, local import, import verification, and responsive/accessibility checks succeed. R2 integration and SPA route fallback are verified locally where emulation supports them. Cloudflare account actions that require owner authentication remain documented deployment steps.

## Progress and Operations

`IMPLEMENTATION_STATUS.md` records completed work, current work, remaining work, known issues, and deployment status. The README contains exact commands for local development, D1/R2 setup, migrations, import and verification, tests, deployment, custom domains, Access, CSV backup, and current Wrangler-based D1 export.

The first production URL may use `workers.dev`. A custom `farm.<domain>` route is documented but not configured until the domain is supplied.

## Acceptance Summary

The delivered application must use real D1-backed data and real settlement, plantation, harvest, and dashboard calculations. It must import the supplied workbook without duplicating summary data, preserve traceability, remain usable on mobile and desktop, and deploy as a Cloudflare Worker with static assets, D1, and R2 bindings.
