# Task 11 report — Excel normalization, import, and verification

## Outcome

Task 11 implements a local-only, checksum-aware workbook migration with a dry
run, structured issue report, deterministic fingerprints, dependency-ordered
atomic D1 writes, second-run idempotency, and an independent workbook-to-D1
verification command. No remote D1 path is accepted.

## TDD and recovery evidence

- The recovered worktree already contained the normalization, parser, and
  integration tests written in the task brief's test-first order. Recovery
  began after implementation, so the original RED executions were not rerun or
  reconstructed; the handoff recorded that these suites were green before the
  parser dependency upgrade.
- Fix-round recovery verification ran the focused suite after inspecting the
  preserved changes: 4 files, 28 tests passed (4 normalization, 10 parser, 1
  runtime, and 13 integration tests).
- The focused coverage includes explicit-only person/category/crop mappings,
  strict legacy dates, A:E-only expense parsing, structured invalid-row issues,
  both plantation blocks, cached harvest values, stable repeated fingerprints,
  dry-run no-write behavior, dependency order, atomic rollback, idempotency,
  and independent mismatch detection.
- A fresh full non-Worker run passed 24 files and 102 tests. The dedicated Worker
  run passed 8 files and 64 tests.

## Review fix round

- The issue report is now an atomic JSON replacement and cannot target the
  source workbook, any hard-link/symlink alias, the canonical workbook or an
  existing checksum-identical copy, repository content, or local persistence.
- Verification independently reconstructs and hashes every expense,
  plantation, and harvest projection, including fingerprints, enrichment
  provenance, and source locations; aggregate controls remain as a second
  layer rather than the only check.
- All three import regions use unique exact header-tuple discovery across the
  complete used range. Ambiguous/missing tuples fail closed, vertical
  plantation blocks stay independent, and a harvest Grand Total is required.
- Exact detail-log enrichment now stores its source sheet, row, and consumed
  cells in D1 through additive migration `0005_import_provenance.sql`.
  Trimming and note combining are logged as transformations; ambiguous exact
  matches remain unenriched with a warning.
- Checksum approval is content-based regardless of filename. Synthetic or
  noncanonical workbooks require the explicit `--allow-unapproved-source`
  override and never claim approved baselines.
- Local persistence is canonicalized, must be newly created or carry the
  importer ownership marker, and cannot overlap the repository, source,
  report, or protected system locations. The preparatory CLI makes this
  contract explicit before Wrangler migrations.
- Database `ON CONFLICT` handling and returned D1 change counts make concurrent
  identical imports idempotent and keep inserted/duplicate reporting truthful.
- The runtime documentation and package metadata now consistently require Node
  22.12+, matching the installed Vite/Cloudflare toolchain.
- Automated coverage now includes warning-skipped counts, mandatory harvest
  total evidence, checksum/name behavior, path aliases, owned persistence,
  source errors before D1 access, existing reference reuse, fresh and pre-0005
  schema paths, simultaneous imports, and the real approved workbook with its
  exact 437-duplicate rerun.

## Review fix round 2

- Matching enriched expenses originally imported before migration 0005 now
  retain their historical semantic fingerprint. A rerun validates the complete
  imported business projection and atomically backfills only missing
  `enrichment_source_json`. Import results report this separately as
  `backfilled.expenseEnrichmentProvenance`; mismatched or conflicting rows fail
  closed before the batch executes.
- Exact verification now covers deterministic row IDs, resolved foreign keys
  and reference names, all workbook values, policy constants, nullable fields,
  source metadata, fingerprints, provenance, and soft-delete state. Tamper tests
  exercise expense sharing/class/crop, plantation date, and harvest crop,
  harvest date, average weight, override reason, and buyer.
- Expense enrichment is globally one ledger row to one detail row per
  date/amount/payer key. Many-ledger/one-detail and many-to-many keys leave every
  involved ledger row unenriched and emit explicit warnings.
- Payer whitespace is accepted only through an explicit `payer-trim`
  transformation using the raw cell value; the independent verifier applies the
  same policy. Detail source coordinates remain provenance and no longer alter
  an otherwise identical expense fingerprint.
- A cached harvest revenue differing by even one paise from exact net weight ×
  price produces `FORMULA_CACHE_MISMATCH`, is skipped, and is reported truthfully
  by dry-run even if the workbook Grand Total was adjusted to match the bad
  cache.
- Source validation returns an immutable byte buffer. Normalization, import, and
  verification hash and parse that same buffer, closing the pathname replacement
  window between checksum approval and workbook interpretation.

## Source checksum and parser decision

- The copied source and the supplied workbook both have SHA-256
  `655b77c344356bd9b201e616cf8c2766ec63495414c6673e02271471d5e8e67a`.
- SheetJS Community Edition 0.20.3 is installed from SheetJS's official CDN,
  pinned by its tarball URL, and kept in `devDependencies` because Excel is a
  local migration concern rather than a production runtime dependency.
- Version 0.20.3 was verified directly against raw source cell objects. Revenue
  cells F2:F4 retain both formulas and numeric cached values:
  `(D2*E2)` / 6885, `(D3*E3)` / 2300, and `(D4*E4)` / 900. The synthetic fixture
  retains the equivalent formula/cache behavior.
- No formula value was recalculated or derived for import. The cached revenue
  total is 10085 rupees and reconciles to the workbook Grand Total cache.
- Bundled Artifact Tool 2.8.59 independently read the source sheets and visible
  A:E/F values without editing or exporting the workbook. The artifact-operation
  marker was not rerun during recovery.

## Normalization evidence

- `Common Expense` A4:E397 yielded 394 accepted rows and 297,619,700 paise.
  Satish contributed 149,301,700 paise and Mahesh contributed 148,318,000 paise
  after only the approved payer case normalization.
- Row 222 parsed deterministically as `2022-09-10` and emitted one
  `DATE_LABEL_MISMATCH` warning for its incorrect source weekday.
- The 21 blank categories became `Uncategorized`, with 21 matching warnings.
  Ambiguous source categories such as `Miscelleneous`, `Labours`, and
  `Fertilizers` remain distinct.
- The two plantation blocks contained 43 positive crop/area contributions and
  produced 40 aggregate records totalling 2,740. `Bannana` became `Banana` via
  the sole spelling rule; `Unknown`, `Empty`, and other source labels remain.
- Harvest rows 2–4 produced three undated legacy records totalling 1,008,500
  paise. The source `Avg. Weight (Kg)` values used by the formulas are retained
  as net weight, while average weight remains empty with three explicit
  ambiguity warnings.
- The complete real dry run reported 101 logged normalization changes, 25
  warnings, and 0 errors.

## Fresh disposable D1 verification

Persistence directory: `/tmp/vkb-task11-fresh-LCNlhA/db` (local and
disposable; removed after verification).

1. All five migrations applied locally with Wrangler 4.130.0.
2. Dry run accepted 394 expenses, 40 plantation records, and 3 harvests; it
   inserted nothing and reported 0 errors.
3. First import inserted 87 categories, 23 crops, 394 expenses, 40 plantation
   records, and 3 harvests in one D1 batch.
4. Independent verification returned `ok: true` for all workbook and approved
   controls: 394 expenses; 297,619,700 paise total; Satish 149,301,700 paise;
   Mahesh 148,318,000 paise; settlement 491,850 paise; plantation 2,740; harvest
   revenue 1,008,500 paise.
5. The second import inserted 0 categories, crops, expenses, plantation records,
   or harvests and reported exactly 437 duplicate business fingerprints.
6. A separate disposable database applied migrations 0001–0004, stored a
   genuinely matching enriched expense with the historical fingerprint,
   upgraded through 0005, and reran the import. The rerun inserted the other
   expense, reported one duplicate and one provenance backfill, populated the
   missing JSON, and passed exact verification. A mismatched-business-field
   variant was rejected without partial writes.

Fix-round-2 disposable CLI persistence directory:
`/tmp/vkb-task11-fix2-99PeeU/db` (local-only and removed after evidence capture).
All five migrations applied. The approved dry run accepted 394 expenses, 40
plantation rows, and 3 harvests with 0 errors. The first import inserted 87
categories, 23 crops, 394 expenses, 40 plantation rows, and 3 harvests with 0
backfills. Exact verification returned `ok: true`; projection digests matched for
394/40/3 rows. The rerun inserted nothing, backfilled nothing, and reported 437
duplicates.

## Dependency and audit evidence

- `xlsx` 0.18.5 was replaced with maintained SheetJS CE 0.20.3 from the official
  CDN. The old parser's helper dependency branch was removed from the lockfile.
- Direct `miniflare` is necessary for the local-only persistent D1 adapter and
  its atomic batch tests. It is exactly pinned to `5.20260911.1-alpha`, the patch
  whose Sharp 0.35.4 dependency addresses the current libheif advisory.
- `@types/node` is necessary because the strict scripts project directly uses
  Node filesystem, crypto, path, URL, OS, Buffer, and process APIs.
- Lockfile comparison found no unrelated package version upgrades. Added graph
  entries belong to the declared Node types or the pinned Miniflare/Workerd/Sharp
  runtime; removed entries belong to SheetJS 0.18.5.
- `npm audit --omit=dev --json` reports 0 production vulnerabilities.
- Full `npm audit --json` reports 6 high findings in the pre-existing Cloudflare
  development toolchain's nested Miniflare 5.20260908.0-alpha / Sharp 0.35.2
  branches. The new direct Miniflare runtime is not listed as vulnerable. The
  suggested Worker-pool downgrade is incompatible and was not applied.

## Final verification

- Task-focused fix-round-2 Vitest: 2 files, 31 tests passed.
- Unit/frontend/integration Vitest with Worker files excluded: 24 files,
  110 tests passed.
- Dedicated Cloudflare Worker Vitest: 8 files, 64 tests passed.
- `npm run typecheck`, `npm run lint`, and `npm run build`: exited 0.
- `git diff --check`: no whitespace errors.

## Files

- Source and fixture: `data/VKB-Farm-Expense-tracker.xlsx`,
  `tests/fixtures/farm-import.xlsx`
- Import implementation: `scripts/types.ts`, `scripts/data-normalization.ts`,
  `scripts/normalize-excel.ts`, `scripts/import-excel.ts`,
  `scripts/verify-import.ts`, `scripts/source-policy.ts`, and
  `scripts/prepare-import-db.ts`
- Schema: `migrations/0005_import_provenance.sql`
- Tests: `tests/unit/data-normalization.test.ts`,
  `tests/unit/normalize-excel.test.ts`, `tests/unit/import-runtime.test.ts`, and
  `tests/integration/import-excel.test.ts`
- Configuration and documentation: `package.json`, `package-lock.json`,
  `tsconfig.json`, `tsconfig.scripts.json`, `README.md`,
  `IMPLEMENTATION_STATUS.md`, `docs/DECISIONS.md`

## Concerns

- The default Vitest config predates Task 11 and includes `tests/worker/**`, even
  though `cloudflare:test` resolves only under `vitest.worker.config.ts`.
  Therefore the verified commands remain `npm run test -- --exclude
  'tests/worker/**'` and `npm run test:worker`. This task does not alter that
  unrelated test-runner boundary.
- The remaining six development-only audit findings require coordinated
  Cloudflare plugin upgrades rather than an importer-local dependency change.
- A fresh online audit attempt during the fix round was blocked because sending
  the dependency tree to the public registry was not authorized. The lockfile
  dependency graph is unchanged by the fix round (only the root Node engine was
  added), so the prior successful audit remains the applicable evidence: zero
  production findings and six high development-only Cloudflare-toolchain
  findings. `npm audit --offline` had no cached advisories and was not treated
  as authoritative.
- Fix round 2 again attempted the production online audit; the network sandbox
  failed first and policy then rejected disclosure of the private dependency
  tree to the public registry without separate user authorization. The safer
  `npm audit --omit=dev --offline --json` and full `npm audit --offline --json`
  both returned 0 cached findings across 547 dependencies, but are recorded as
  offline evidence only. No dependencies or lockfile entries changed in this
  round.
