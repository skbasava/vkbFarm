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

Implementation: Pending Task 11; no importer scripts or import workflow are implemented yet.

Consequences: The future importer will run locally, be idempotent, and record warnings/errors. Legacy banana harvest rows may retain a null date; API-created harvests will require one.

Do not: When implementing the importer, import summary/pivot regions, invent missing business values, or silently normalize ambiguous source values.

## ADR-005 — Harvest revenue and aggregate money remain exact

Status: Accepted

Context: Harvest weights can contain thousandths of a kilogram, and valid row-level paise values can aggregate beyond JavaScript's safe-integer range.

Decision: Parse harvest decimals into scaled integers, calculate and round revenue with `BigInt`, compare override bases by canonical weight and price, and carry D1 monetary aggregates as exact text until explicit safe-range validation.

Reason: Binary floating point and early numeric conversion can silently change authoritative farm revenue or net cash flow.

Consequences: Out-of-range aggregates fail with a sanitized data-range error; weighted averages use bounded keyset reads and incremental exact accumulation; UI measurement formatting preserves thousandths.

Do not: Multiply currency by JavaScript or SQLite floating-point weights, accept already-rounded unsafe numbers, or retain unexplained legacy revenue after its calculation basis changes.
