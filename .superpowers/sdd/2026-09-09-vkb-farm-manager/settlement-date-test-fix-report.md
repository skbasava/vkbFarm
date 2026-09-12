# Settlement payment date test fix

## Status

Complete.

## Root cause

`SettlementForm` initializes its payment date from `todayLocal()`, using the browser's local calendar date. The settlement page test hard-coded `2026-09-11`; on the reproduction date, the form correctly submitted `2026-09-12`, so the request assertion failed.

## Change

The test now reads the rendered Payment date input's selected/default value and asserts that the submitted API payload uses that value. This keeps the integration assertion meaningful across date rollovers without coupling it to a wall-clock literal. Production code was not changed.

## Verification

- Focused settlement UI test: 2 passed
- `npm run test -- src tests/unit`: 13 files, 50 tests passed
- `npm run typecheck`: passed
- `npm run lint`: passed
- `git diff --check`: passed

## Concerns

None identified. The test intentionally follows the form's actual selected/default date and therefore remains deterministic with respect to the rendered control rather than the current day.
