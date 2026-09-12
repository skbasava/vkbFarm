# Task 8 — Dashboard, Reports, and CSV Exports

## Delivered

- Added authenticated `/api/v1/dashboard` aggregation composed from bounded D1 report queries and the reviewed Task 7 settlement repository/service.
- Added authenticated expense, contribution, harvest, and cashflow report endpoints. ISO-local `dateFrom` and `dateTo` filters are validated, ordered, parameter-bound, and applied to the source data.
- Added spreadsheet-safe exports for expenses, settlements, plantation, and harvest data. Exports use UTF-8 BOM, CRLF/RFC 4180 escaping, raw decimal INR values, stable headings, safe attachment names, bounded 5,000-row queries, and formula-prefix neutralization.
- Added responsive dashboard and reports pages, real lazy route imports, explicit settlement payment wording, accessible Recharts figures/tooltips, empty states, recent activity, and undated-harvest disclosure.
- Kept all financial calculation on the Worker: React only formats the values returned by the API.

## Test-first evidence

- `tests/unit/csv.test.ts` was written before `worker/utils/csv.ts`; its initial import failed, then passed after implementation.
- `tests/worker/dashboard-reports.test.ts` was written before the dashboard/report routes; the required initial run returned 404 responses, then passed after the Worker implementation.
- Dashboard and reports page tests were written before their components; initial module resolution failed, then passed after implementation.
- A final focused contribution-date test failed while contribution reports ignored filters, then passed after adding date-bound repository parameters while retaining the reviewed settlement engine.

## Verification

- `npm run test -- tests/unit/csv.test.ts src/features/dashboard src/features/reports` — 4 tests passed.
- `npm run test:worker -- tests/worker/dashboard-reports.test.ts` — 4 tests passed.
- `npm run test -- src tests/unit` — 46 tests passed across 13 files.
- `npm run test:worker` — 31 tests passed across 6 files.
- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings.
- `npm run build` — passed.
- `git diff --check` — passed.

## Fix Round 2

### Review fix delivered

- CSV formula-prefix neutralization now recognizes all JavaScript whitespace, including form-feed, vertical-tab, and non-breaking space, before `=`, `+`, `-`, or `@` while preserving the exact original cell content after the apostrophe.

### TDD red/green evidence

- **RED:** after adding regression coverage for form-feed, vertical-tab, and NBSP prefixes, `npm run test -- tests/unit/csv.test.ts` failed 1 test; each new cell bypassed the prior space/tab/CR/LF-only expression.
- **GREEN:** after changing the prefix check to `^\\s*[=+\\-@]`, `npm run test -- tests/unit/csv.test.ts` passed 4 tests.

### Verification output

- `npm run test -- src tests/unit` — 49 passed, 1 failed (pre-existing `src/features/settlements/SettlementPage.test.tsx`; it expects hard-coded `2026-09-11` but the form correctly submitted current date `2026-09-12`).
- `npm run test:worker` — 34 tests passed across 6 files.
- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings.
- `npm run build` — passed.
- `git diff --check` — passed.

## Notes

- Worker test/build commands require the approved local Worker runtime permission because Miniflare opens a loopback listener and Wrangler writes its debug log outside the worktree.
- No Cloudflare REST calls, migrations, or Task 7 settlement-calculation rewrites were introduced.

## Fix Round 1

### Review fixes delivered

- CSV formula neutralization now detects `=`, `+`, `-`, and `@` after leading spaces, tabs, or line whitespace while retaining the source cell text after the spreadsheet apostrophe.
- CSV responses now use a `ReadableStream` and `TextEncoder`: the BOM/header and every bounded row are emitted as separate UTF-8 chunks. Route generators transform one row at a time rather than eagerly building report CSV arrays or body strings.
- Settlement exports now bind the validated range, order by settlement date/creation/id, and cap at 5,000 rows. Plantation exports bind planting-date ranges, use deterministic ordering/caps, and deliberately exclude null planting dates when any date boundary is active; unfiltered exports label those rows `Date unavailable`.
- Monthly dashboard data selects the newest 24 month buckets then returns them chronologically for the chart.
- Dashboard transfer copy now says both who owes and who receives. On mobile, the Recharts cards are replaced with a concise latest-period/largest-category summary using Worker-provided values only.
- All four report-export links now retain active date filters.

### TDD red/green evidence

- **RED:** `npm run test -- tests/unit/csv.test.ts src/features/dashboard src/features/reports` failed the new whitespace-injection, per-chunk streaming, owes/receives, mobile-summary, and active-link assertions (5 failed assertions across the focused files).
- **RED:** `npm run test:worker -- tests/worker/dashboard-reports.test.ts` failed the new monthly-window, settlement-range/cap, and plantation-range/null-date assertions (3 failures; existing 4 tests remained green).
- **GREEN:** after implementation, `npm run test -- tests/unit/csv.test.ts src/features/dashboard src/features/reports` passed 7 tests across 3 files.
- **GREEN:** after implementation, `npm run test:worker -- tests/worker/dashboard-reports.test.ts` passed 7 tests.

### Verification output

- `npm run test -- src tests/unit` — 49 tests passed across 13 files.
- `npm run test:worker` — 34 tests passed across 6 files.
- `npm run typecheck` — passed.
- `npm run lint` — passed with zero warnings.
- `npm run build` — passed.
- `git diff --check` — passed.
