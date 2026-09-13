# Task 10 Report — Harvest Tracking and Revenue Rules

## Outcome

Implemented harvest revenue calculation, authenticated CRUD/filter/summary APIs, trusted legacy import handling, atomic audit events, and the responsive Harvest reporting/editor experience from base commit `da8e947`.

## Delivered behavior

- Revenue uses `BigInt` thousandth-kilogram scaling and integer paise multiplication, with deterministic half-up rounding and safe-integer overflow rejection. Existing safe-integer prices are reconstructed without division through JavaScript floating point during PATCH merges.
- Public inputs accept decimal strings and never accept source metadata. Manual/API records require real ISO local dates; only the trusted import service can create `EXCEL` rows with null dates and cached reasonless revenue differences.
- PATCH merges recalculate defaults, preserve valid explained overrides, explicitly revert overrides, block stale reasonless differences, retain unchanged inactive historical crop assignments, and allow optional measurements to be cleared.
- List/filter queries bind crop/month/year/date values and enforce pagination bounds. Summary totals include undated legacy rows while chart buckets exclude them; quantity, weights, and other decimal measurements cross the harvest API boundary as strings.
- Admin/editor writes and viewer read-only behavior are enforced by existing identity/role middleware. Create, update, and delete pair their mutation and actor/snapshot audit event in one D1 batch.
- The Skyblue/Grey Harvest page provides four summary signals, crop/month/year/date filters, monthly crop revenue, quantity over time, recent records, accessible edit/delete dialogs, explicit legacy-date disclosure, and responsive mobile/desktop layouts.
- Crop choices paginate beyond 100, filters include inactive historical references, and edit forms retain an inactive selected crop with a visible `(inactive)` label.
- Harvest mutations invalidate harvest, dashboard, and all report query families; existing dashboard/report aggregation contracts were not changed.

## TDD and review evidence

- Initial unit RED: `tests/unit/harvest.test.ts` failed because `worker/services/harvest-service.ts` was absent.
- Worker RED/GREEN cycles caught page-size overflow acceptance, an incorrect hand-derived rounding expectation, missing chart quantity, safe-integer price drift on unrelated PATCH, and inability to clear optional measurements.
- Frontend RED/GREEN cycles started with absent `HarvestPage`/`HarvestForm` and then verified editor/viewer behavior, decimal-string submission, filters, both chart regions, legacy labeling, options beyond 100, and inactive selected labels.
- Visual QA used the running local application at the desktop viewport and at `390×844`; the ledger, filters, metric hierarchy, mobile navigation, and scrollable form/save action rendered without lost controls or horizontal overflow.

## Final verification

All commands were run fresh on 2026-09-13:

| Check | Result |
| --- | --- |
| `npm run test -- tests/unit src` | PASS — 18 files, 67 tests |
| `npm run test:worker` | PASS — 8 files, 58 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — zero warnings allowed |
| `WRANGLER_LOG_PATH=/tmp/vkb-task10-wrangler.log npm run build` | PASS — Worker and client production bundles built |
| `git diff --check` | PASS |

The unit/frontend run includes the existing dashboard and reports React regression tests. The full Worker run includes `dashboard-reports.test.ts`, preserving dashboard totals, dated report semantics, undated disclosures, cash flow, and exports.

## Tooling note

The repository's pre-existing unfiltered `npm run test` include glob also selects Worker tests under the jsdom config, where `cloudflare:test` is unavailable. The configured suites above are therefore intentionally split between unit/frontend and `test:worker`; both pass in full.

## Review round 1 fixes

Completed on 2026-09-13 against Task 10 commit `cd66aad`:

- PATCH basis review now compares canonical thousandth-kilogram weight and integer-paise price independently. The regression for an imported `2.5 kg × ₹40` record changing to `5 kg × ₹20` confirms that an unexplained cached legacy difference cannot bypass review merely because its calculated total is unchanged.
- Harvest summary, dated chart buckets, dashboard totals, recent dashboard harvests, harvest reports, and cashflow now read authoritative money through exact text and reject values outside JavaScript's safe-integer range with the sanitized `DATA_RANGE_ERROR` contract. Weighted average price no longer uses SQLite `REAL` multiplication: canonical three-decimal weights and integer-paise prices are combined and half-up rounded with `BigInt`.
- The trusted importer applies a strict runtime schema for crop ID, real ISO-local/null date, decimal-string measurements, sale price, safe actual revenue, trimmed bounded sheet/fingerprint metadata, and a positive safe source row. Invalid calls return generic structured validation errors and never leak a raw `TypeError`.
- Harvest pages are capped at `1,000,000`, keeping the maximum offset bounded; tests cover the maximum accepted and first rejected values.
- Weight presentation retains up to three fractional kilograms, including `0.001 kg`. Both charts expose screen-reader-only lists containing every bucket and formatted value while their Recharts SVG presentations are hidden from assistive technology.
- Frontend behavior coverage now includes loading, empty, error/retry, post-create query invalidation, chart text equivalence, thousandth-kilogram display, and failed deletion. Delete rejection is caught locally so the confirmation remains open with a retryable message.

### Review TDD evidence

- Worker RED: the focused run reported 5 expected failures covering same-total basis changes, trusted-import runtime validation, page ceiling, aggregate overflow, and dashboard/report overflow.
- Worker GREEN: `npm run test:worker -- tests/worker/harvests.test.ts tests/worker/dashboard-reports.test.ts` passed 2 files / 24 tests.
- Frontend GREEN: `npm run test -- tests/unit/format.test.ts src/features/harvest/HarvestPage.test.tsx` passed 2 files / 10 tests after adding the UI regressions.

### Fresh final verification after review fixes

| Check | Result |
| --- | --- |
| `npm run test -- tests/unit src` | PASS — 18 files, 72 tests |
| `npm run test:worker` | PASS — 8 files, 61 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — zero warnings allowed |
| `npm run build` | PASS — Worker and client production bundles built |
| `git diff --check` | PASS |

## Review round 2 fixes

Completed on 2026-09-13 against review-fix commit `f3141f8`:

- Dashboard expense total, current-month, current-year, CAPEX, and OPEX aggregates now cross the D1 boundary as exact decimal text and are range-checked before conversion. Cashflow expense totals use the same path. Monthly and category expense dashboard buckets were hardened consistently.
- `safeMoneyDifference` independently validates both operands before constructing `BigInt` values, so two already-rounded unsafe numbers cannot cancel into a plausible but incorrect small net result.
- Weighted sale price now uses stable `id` keyset pagination with a 100-row database bound and incremental BigInt numerator/weight accumulation. A 205-row regression proves exact accumulation and rounding across three reads.
- Create, update, and delete hook tests keep active harvest-summary, dashboard, and filtered-reports observers mounted and prove that every successful harvest mutation refetches all three query families.

### Review round 2 TDD evidence

- RED: the focused unit run demonstrated that equal unsafe operands incorrectly returned zero from `safeMoneyDifference` before operand validation.
- GREEN: `npm run test -- tests/unit/stored-integers.test.ts src/features/harvest/api.test.tsx` passed 2 files / 2 tests; the Worker overflow and multi-page regressions passed 2 files / 27 tests in their focused run.

### Fresh final verification after round 2

| Check | Result |
| --- | --- |
| `npm run test -- tests/unit src` | PASS — 20 files, 74 tests |
| `npm run test:worker` | PASS — 8 files, 64 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — zero warnings allowed |
| `npm run build` | PASS — Worker and client production bundles built |
| `git diff --check` | PASS |
