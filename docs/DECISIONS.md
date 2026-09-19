# Architecture Decisions

## ADR-001 — Cloudflare-native single application

Status: Accepted

Context: The product needs one mobile-first client, an API, relational finance data, and receipt storage without a separate server fleet.

Decision: Serve the React/Vite SPA and Hono API from one Cloudflare Worker application, using D1 for relational data and R2 for receipts.

Reason: This preserves a simple deployment boundary and matches the approved V1 architecture.

Consequences: Domain code stays in Worker routes/services/repositories; no microservices or long-running Node server.

Do not: Introduce a parallel backend or place business authority in browser state.

## ADR-002 — Money and dates have explicit representations

Status: Accepted

Context: Shared settlements and legacy farm data require deterministic arithmetic and calendar behavior.

Decision: Store authoritative money as integer paise and farm transaction dates as ISO local dates; use UTC for timestamps. The UI formats dates for Asia/Kolkata.

Reason: Prevents floating-point reconciliation errors and UTC date shifts.

Consequences: Client decimal input is validated and converted at the Worker boundary; balancing allocates indivisible paise deterministically.

Do not: Store currency floats or round-trip local transaction dates through UTC.

## ADR-003 — Cloudflare Access is the production trust boundary

Status: Accepted

Context: The farm application has role-governed write operations.

Decision: In production, derive identity from the Access-protected request header and map it to an active D1 person. Local development identity requires both local environment and explicit enablement.

Reason: A direct or unknown production request must not acquire local privileges.

Consequences: Production and preview hostnames need Access coverage; unauthenticated production requests fail closed.

Do not: Trust arbitrary client identity, enable the development fallback in production, or leave alternate deployed hostnames outside Access.

## ADR-004 — Import data remains traceable and conservative

Status: Accepted

Context: The legacy workbook contains ledger rows plus summaries, formulas, and ambiguous values.

Decision: Task 11 will import only authoritative `Common Expense` A:E ledger rows, preserve source metadata and deterministic fingerprints, and use explicit normalization maps.

Reason: Reconciliation evidence must not become duplicate transactions or fabricated data.

Implementation: `scripts/normalize-excel.ts`, `scripts/import-excel.ts`, and
`scripts/verify-import.ts` implement the local-only workflow. The importer uses
maintained SheetJS Community Edition 0.20.3 from the project's official CDN and
reads raw formula objects without recalculating the source workbook.

Consequences: The importer runs locally, is idempotent, and records warnings/errors. Legacy banana harvest rows may retain a null date; API-created harvests require one.

Do not: When implementing the importer, import summary/pivot regions, invent missing business values, or silently normalize ambiguous source values.

## ADR-005 — Harvest revenue and aggregate money remain exact

Status: Accepted

Context: Harvest weights can contain thousandths of a kilogram, and valid row-level paise values can aggregate beyond JavaScript's safe-integer range.

Decision: Parse harvest decimals into scaled integers, calculate and round revenue with `BigInt`, compare override bases by canonical weight and price, and carry D1 monetary aggregates as exact text until explicit safe-range validation.

Reason: Binary floating point and early numeric conversion can silently change authoritative farm revenue or net cash flow.

Consequences: Out-of-range aggregates fail with a sanitized data-range error; weighted averages use bounded keyset reads and incremental exact accumulation; UI measurement formatting preserves thousandths.

Do not: Multiply currency by JavaScript or SQLite floating-point weights, accept already-rounded unsafe numbers, or retain unexplained legacy revenue after its calculation basis changes.

## ADR-006 — Receipt access is metadata-scoped and private

Status: Accepted

Context: Farm receipts contain financial evidence that must remain available to authorized members without exposing R2 object names or public bucket URLs.

Decision: Generate receipt keys only in the Worker, resolve reads through authenticated document IDs, and expose same-origin content URLs instead of object keys. Upload writes R2 first and atomically records D1 metadata plus audit, compensating the object if the database write fails. Delete removes R2 first and atomically records the audit plus metadata deletion. Existing receipts remain readable after expense soft deletion, while new uploads require the expense to be live at the atomic write boundary.

Reason: The D1 document record stays the authorization boundary, financial evidence survives ledger soft deletion, and R2/D1 races cannot silently create a valid receipt for an archived expense or duplicate delete audits.

Consequences: Viewer-or-higher roles may list and stream receipts; editor-or-higher roles may upload and delete. JPEG, PNG, and PDF uploads must pass MIME, extension, magic-byte, file-size, and bounded multipart-envelope validation. The client uses XHR only to report real upload progress and retains a failed file for retry.

Do not: Publish the bucket, accept client-selected object keys, authorize reads by raw key, discard a saved expense when its later receipt upload fails, or filter historical receipts solely because the linked expense was soft-deleted.

## ADR-007 — Production selection and offline behavior are explicit

Status: Accepted

Context: The default local environment enables a development identity, while the installed PWA must remain honest when connectivity is unavailable.

Decision: Production builds and every deploy path explicitly use `CLOUDFLARE_ENV=production`; remote migrations explicitly select the production environment. The service worker caches only successful same-origin assets and the navigation shell, handles `/api` first as network-only, and never queues or fabricates writes. Local E2E creates disposable D1/R2 persistence and exercises production Access-header identity mapping.

Reason: An implicit environment can package a local authentication bypass, and cached or synthetic API responses can misrepresent authoritative finance state.

Consequences: Deploy dry-run output is a release gate, offline mutations fail visibly while preserving input, and production acceptance never reuses developer/import state or remote resources.

Do not: Deploy a default local build, add `DEV_AUTH_ENABLED` to production, cache `/api`, add background write synchronization in V1, or run browser acceptance against remote bindings.
