# VKB Farm Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Cloudflare-native VKB Farm Manager V1 and migrate the supplied Excel workbook into verified D1-backed farm finance and operations data.

**Architecture:** A React and TypeScript SPA is served with Cloudflare Workers Static Assets, while a single Hono Worker owns `/api/v1`, D1 business data, and R2 receipt access. Feature services contain authoritative financial and import rules; responsive React feature modules consume typed API envelopes through TanStack Query.

**Tech Stack:** React, TypeScript strict mode, Vite, React Router, Tailwind CSS, shadcn/ui conventions, Lucide, TanStack Query, TanStack Table, React Hook Form, Zod, Recharts, Hono, Cloudflare Workers Static Assets, D1, R2, Wrangler, Vitest, React Testing Library, Playwright, and SheetJS `xlsx` for the local importer.

**Spec:** `docs/superpowers/specs/2026-09-09-vkb-farm-manager-design.md`

## Global Constraints

- The product name is `VKB Farm Manager` and the short navigation brand is `VKB Farm`.
- Use one Worker application and one frontend; do not add microservices or a long-running Node server.
- Use React, TypeScript, Vite, React Router, Tailwind CSS, shadcn/ui conventions, Lucide, TanStack Query, TanStack Table, React Hook Form, Zod, Recharts, Hono, D1, R2, Workers Static Assets, `@cloudflare/vite-plugin`, and `wrangler.jsonc`.
- Use `2026-09-09` as the initial Wrangler compatibility date and verify installed CLI syntax before deployment documentation is finalized.
- Configure SPA fallback with `assets.not_found_handling = "single-page-application"` and run the Worker first for `/api/*`.
- TypeScript is strict; avoid `any`, parameterize SQL, validate every write, and never expose raw SQL errors or stack traces.
- Store authoritative money as integer paise. Store farm transaction dates as ISO local calendar dates and timestamps as UTC.
- The server calculates expenses, contributions, settlements, dashboard metrics, report totals, and harvest revenue.
- Production identity comes from Cloudflare Access. A development identity is allowed only in local mode and production fails closed.
- The approved interface uses sky blue for actions and live signals, charcoal grey navigation, cool grey canvas surfaces, responsive desktop/tablet/mobile navigation, and accessible semantic state colors.
- `Common Expense` A:E is the authoritative expense ledger. Summary/pivot/formula regions are verification evidence, not transactions.
- Preserve import traceability and deterministic fingerprints. Never invent dates, vendors, classifications, or ambiguous normalization mappings.
- Imported legacy banana harvest records may have a null date; API-created harvests must include a valid date.
- Keep the workbook baselines exact: 394 expenses; ₹29,76,197 total; Satish ₹14,93,017; Mahesh ₹14,83,180; Mahesh pays Satish ₹4,918.50; plantation 2,740; harvest revenue ₹10,085.
- Keep `.superpowers/`, `.wrangler/`, `.dev.vars*`, `dist/`, coverage output, local D1 state, and generated migration error reports out of Git.
- Update `IMPLEMENTATION_STATUS.md` after each completed task.

## File Map

```text
package.json                         scripts and dependency manifest
vite.config.ts                       React, Tailwind, and Cloudflare plugins
wrangler.jsonc                       Worker entrypoint, SPA routing, D1/R2 bindings
tsconfig*.json                       browser, Worker, and tooling type boundaries
vitest.config.ts                     pure TypeScript and React tests
vitest.worker.config.ts              Workers/D1 integration tests
playwright.config.ts                 responsive smoke tests
migrations/0001_initial.sql          normalized tables, seeds, constraints, indexes
src/app/*                            providers, router, error boundary, application shell
src/components/ui/*                  focused shadcn-style primitives
src/components/layout/*              sidebar, mobile navigation, quick action sheet
src/lib/*                            API client, query keys, money/date formatting
src/features/<feature>/*             route, components, hooks, schemas for one feature
src/styles/index.css                 approved design tokens and responsive base styles
src/types/api.ts                     shared API envelope contracts
worker/index.ts                      composed Hono application
worker/types.ts                      Cloudflare bindings, variables, identity types
worker/middleware/*                  identity, role checks, error conversion
worker/repositories/*                parameterized D1 queries
worker/services/*                    financial and domain business rules
worker/routes/*                      thin `/api/v1` route modules
worker/validation/*                  server-side Zod schemas
worker/utils/*                       money, dates, IDs, CSV, R2 key helpers
scripts/data-normalization.ts        explicit Excel normalization maps
scripts/normalize-excel.ts           workbook-to-normalized-record parser
scripts/import-excel.ts              dry-run and idempotent local D1 import command
scripts/verify-import.ts             workbook-versus-D1 reconciliation command
data/VKB-Farm-Expense-tracker.xlsx   supplied migration source workbook
tests/fixtures/*                     small deterministic synthetic fixtures
tests/worker/*                       D1/Worker integration tests
tests/e2e/*                          critical user journeys
README.md                            setup, import, deployment, Access, and backup guide
IMPLEMENTATION_STATUS.md             delivery status and known limitations
```

---

### Task 1: Cloudflare React Foundation and Test Harness

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `package-lock.json` through `npm install`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `wrangler.jsonc`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.worker.json`
- Create: `vitest.config.ts`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `worker/index.ts`
- Create: `worker/types.ts`
- Create: `tests/worker/health.test.ts`
- Create: `IMPLEMENTATION_STATUS.md`
- Create: `README.md`

**Interfaces:**
- Consumes: No prior application code.
- Produces: `Bindings`, `AppVariables`, `AppEnv`, the Hono `app`, a React mount point, and working `dev`, `build`, `test`, `typecheck`, `lint`, `deploy`, and D1 migration scripts.

- [ ] **Step 1: Install the production and development dependency sets**

Run:

```bash
npm init -y
npm install react react-dom react-router-dom hono @hono/zod-validator zod @tanstack/react-query @tanstack/react-table react-hook-form @hookform/resolvers recharts lucide-react class-variance-authority clsx tailwind-merge sonner @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-alert-dialog xlsx
npm install --save-dev typescript tsx vite @vitejs/plugin-react @cloudflare/vite-plugin wrangler tailwindcss @tailwindcss/vite vitest @cloudflare/vitest-pool-workers jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh prettier @playwright/test
```

Expected: `package-lock.json` pins the resolved dependency graph and `npm audit` output is reviewed before continuing.

- [ ] **Step 2: Write the failing Worker health test**

```ts
// tests/worker/health.test.ts
import { describe, expect, it } from "vitest";
import app from "../../worker/index";

describe("GET /api/v1/health", () => {
  it("returns the application identity", async () => {
    const response = await app.request("http://localhost/api/v1/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { name: "VKB Farm Manager", status: "ok" },
    });
  });
});
```

- [ ] **Step 3: Run the health test and confirm the missing-module failure**

Run: `npx vitest run tests/worker/health.test.ts`

Expected: FAIL because `worker/index.ts` does not exist.

- [ ] **Step 4: Add minimal configuration and the health route**

```ts
// worker/types.ts
export type Bindings = {
  DB: D1Database;
  RECEIPTS: R2Bucket;
  ENVIRONMENT: "local" | "production";
  DEV_AUTH_ENABLED?: string;
};

export type Identity = {
  email: string;
  role: "admin" | "editor" | "viewer";
};

export type AppVariables = { identity: Identity };
export type AppEnv = { Bindings: Bindings; Variables: AppVariables };
```

```ts
// worker/index.ts
import { Hono } from "hono";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();
app.get("/api/v1/health", (c) =>
  c.json({ data: { name: "VKB Farm Manager", status: "ok" as const } }),
);

export default app;
```

Configure `vite.config.ts` with `react()`, `tailwindcss()`, and `cloudflare()`. Configure `wrangler.jsonc` with `main: "./worker/index.ts"`, `compatibility_date: "2026-09-09"`, `assets.not_found_handling: "single-page-application"`, `assets.run_worker_first: ["/api/*"]`, a `DB` D1 binding, a `RECEIPTS` R2 binding, and local/production environment variables. Do not set `assets.directory`; the Cloudflare Vite plugin generates it.

- [ ] **Step 5: Add package scripts and baseline ignores**

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "npm run build && wrangler deploy",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "test:worker": "vitest --config vitest.worker.config.ts run",
    "test:e2e": "playwright test",
    "lint": "eslint . --max-warnings 0",
    "db:migrate:local": "wrangler d1 migrations apply vkb-farm-db --local",
    "db:migrate:remote": "wrangler d1 migrations apply vkb-farm-db --remote",
    "import:excel": "tsx scripts/import-excel.ts",
    "verify:import": "tsx scripts/verify-import.ts"
  }
}
```

Ignore `node_modules/`, `dist/`, `.wrangler/`, `.dev.vars*`, `coverage/`, `playwright-report/`, `test-results/`, `.superpowers/`, and `migration-errors.json`. Create a concise README with the product goal, chosen stack, prerequisites, install command, `npm run dev`, and a note that later tasks expand migration and deployment instructions.

- [ ] **Step 6: Run the foundation checks**

Run:

```bash
npm run test -- tests/worker/health.test.ts
npm run typecheck
npm run build
```

Expected: health test PASS, TypeScript PASS, and Vite emits a Worker/static-assets production build.

- [ ] **Step 7: Record status and commit**

Set `IMPLEMENTATION_STATUS.md` to Foundation complete, Expense System in progress, and all later slices remaining.

```bash
git add .gitignore package.json package-lock.json index.html vite.config.ts wrangler.jsonc tsconfig.json tsconfig.app.json tsconfig.worker.json vitest.config.ts src worker tests/worker/health.test.ts IMPLEMENTATION_STATUS.md README.md
git commit -m "chore: scaffold VKB Cloudflare application"
```

---

### Task 2: D1 Schema, Seeds, and Database Test Runtime

**Files:**
- Create: `migrations/0001_initial.sql`
- Create: `migrations/0002_indexes.sql`
- Create: `vitest.worker.config.ts`
- Create: `tests/worker/database.test.ts`
- Create: `tests/fixtures/database.ts`
- Modify: `worker/types.ts`
- Modify: `IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Consumes: `Bindings.DB` from Task 1.
- Produces: tables `people`, `expense_categories`, `crops`, `farm_areas`, `expenses`, `settlements`, `plantation_inventory`, `harvests`, `documents`, and `audit_log`; seeded IDs `person_satish`, `person_mahesh`, `area_mt`, `area_sk`, and `category_uncategorized`.

- [ ] **Step 1: Write a failing D1 migration test**

```ts
// tests/worker/database.test.ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("initial schema", () => {
  it("seeds people, areas, and Uncategorized", async () => {
    const people = await env.DB.prepare(
      "SELECT id, name FROM people ORDER BY id",
    ).all();
    expect(people.results).toEqual([
      { id: "person_mahesh", name: "Mahesh" },
      { id: "person_satish", name: "Satish" },
    ]);
    const areaCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM farm_areas").first<number>("count");
    expect(areaCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test without migrations**

Run: `npm run test:worker -- tests/worker/database.test.ts`

Expected: FAIL with `no such table: people`.

- [ ] **Step 3: Create constrained tables and seeds**

In `0001_initial.sql`, define all approved tables with foreign keys, `CHECK` constraints for boolean values, CAPEX/OPEX values, positive monetary amounts, different settlement participants, non-negative quantities/weights, and nullable `harvest_date`. Add `import_fingerprint TEXT UNIQUE` to imported `expenses`, `plantation_inventory`, and `harvests`. Seed the stable people, farm areas, and Uncategorized category IDs.

Use this schema shape; include the standard `created_at`/`updated_at` columns shown rather than adding triggers:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  farm_role TEXT NOT NULL DEFAULT 'owner',
  app_role TEXT NOT NULL DEFAULT 'viewer' CHECK (app_role IN ('admin','editor','viewer')),
  participates_in_shared_expenses INTEGER NOT NULL DEFAULT 1 CHECK (participates_in_shared_expenses IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  normalized_name TEXT NOT NULL UNIQUE,
  default_expense_class TEXT CHECK (default_expense_class IN ('CAPEX','OPEX')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE crops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  local_name TEXT,
  crop_type TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE farm_areas (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  expense_date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  paid_by_person_id TEXT NOT NULL REFERENCES people(id),
  category_id TEXT REFERENCES expense_categories(id),
  expense_class TEXT CHECK (expense_class IN ('CAPEX','OPEX')),
  paid_to TEXT,
  notes TEXT,
  crop_id TEXT REFERENCES crops(id),
  is_shared INTEGER NOT NULL DEFAULT 1 CHECK (is_shared IN (0,1)),
  source TEXT,
  source_sheet TEXT,
  source_row INTEGER,
  import_fingerprint TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE settlements (
  id TEXT PRIMARY KEY,
  from_person_id TEXT NOT NULL REFERENCES people(id),
  to_person_id TEXT NOT NULL REFERENCES people(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  settlement_date TEXT NOT NULL,
  remarks TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (from_person_id <> to_person_id)
);

CREATE TABLE plantation_inventory (
  id TEXT PRIMARY KEY,
  crop_id TEXT NOT NULL REFERENCES crops(id),
  farm_area_id TEXT NOT NULL REFERENCES farm_areas(id),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  planting_date TEXT,
  notes TEXT,
  source TEXT,
  source_sheet TEXT,
  source_row INTEGER,
  import_fingerprint TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (crop_id, farm_area_id, planting_date)
);

CREATE TABLE harvests (
  id TEXT PRIMARY KEY,
  crop_id TEXT NOT NULL REFERENCES crops(id),
  harvest_date TEXT,
  quantity REAL CHECK (quantity >= 0),
  gross_weight_kg REAL CHECK (gross_weight_kg >= 0),
  net_weight_kg REAL CHECK (net_weight_kg >= 0),
  average_weight_kg REAL CHECK (average_weight_kg >= 0),
  sale_price_paise_per_kg INTEGER CHECK (sale_price_paise_per_kg >= 0),
  calculated_revenue_paise INTEGER CHECK (calculated_revenue_paise >= 0),
  actual_revenue_paise INTEGER CHECK (actual_revenue_paise >= 0),
  revenue_override_reason TEXT,
  buyer TEXT,
  notes TEXT,
  source TEXT,
  source_sheet TEXT,
  source_row INTEGER,
  import_fingerprint TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((source = 'EXCEL' AND harvest_date IS NULL) OR harvest_date IS NOT NULL),
  CHECK (actual_revenue_paise = calculated_revenue_paise OR length(trim(revenue_override_reason)) > 0)
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  expense_id TEXT REFERENCES expenses(id),
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size >= 0),
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATE','UPDATE','DELETE','SETTLEMENT')),
  actor TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO people (id, name, farm_role, app_role) VALUES
  ('person_satish', 'Satish', 'owner', 'admin'),
  ('person_mahesh', 'Mahesh', 'owner', 'admin');
INSERT INTO farm_areas (id, code, name) VALUES
  ('area_mt', 'MT', 'MT'),
  ('area_sk', 'SK', 'SK');
INSERT INTO expense_categories (id, name, normalized_name) VALUES
  ('category_uncategorized', 'Uncategorized', 'uncategorized');
```

- [ ] **Step 4: Create query indexes**

In `0002_indexes.sql`, add the specification's single-column indexes plus `(deleted_at, expense_date)`, `(paid_by_person_id, deleted_at, expense_date)`, `(category_id, deleted_at, expense_date)`, `(crop_id, harvest_date)`, and unique import fingerprint indexes that ignore nulls.

- [ ] **Step 5: Configure the Workers Vitest pool to apply migrations**

```ts
// vitest.worker.config.ts
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => ({
  test: {
    setupFiles: ["./tests/worker/setup.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: await readD1Migrations("./migrations") },
        },
      },
    },
  },
}));
```

Create `tests/worker/setup.ts` to call `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` before the suite and clear mutable tables between tests.

- [ ] **Step 6: Apply migrations and run schema tests**

Run:

```bash
npm run db:migrate:local
npm run test:worker -- tests/worker/database.test.ts
```

Expected: migrations apply successfully and seed assertions PASS.

- [ ] **Step 7: Commit the schema**

```bash
git add migrations vitest.worker.config.ts worker/types.ts tests/worker tests/fixtures/database.ts IMPLEMENTATION_STATUS.md
git commit -m "feat: add normalized D1 schema"
```

---

### Task 3: Shared API Contracts, Money Rules, Errors, and Identity

**Files:**
- Create: `src/types/api.ts`
- Create: `src/lib/api-client.ts`
- Create: `src/lib/format.ts`
- Create: `src/lib/query-keys.ts`
- Create: `worker/utils/money.ts`
- Create: `worker/utils/dates.ts`
- Create: `worker/utils/ids.ts`
- Create: `worker/middleware/errors.ts`
- Create: `worker/middleware/identity.ts`
- Create: `worker/middleware/roles.ts`
- Create: `tests/unit/money.test.ts`
- Create: `tests/unit/format.test.ts`
- Create: `tests/worker/identity.test.ts`
- Modify: `worker/index.ts`

**Interfaces:**
- Consumes: `AppEnv` and the foundation Hono app.
- Produces: `ApiObject<T>`, `ApiList<T>`, `ApiFailure`, `apiFetch<T>()`, `rupeesToPaise()`, `formatINR()`, `formatCompactINR()`, `formatDate()`, `getIdentity()`, and `requireRole()`.

- [ ] **Step 1: Write failing money and formatting tests**

```ts
// tests/unit/money.test.ts
import { describe, expect, it } from "vitest";
import { rupeesToPaise } from "../../worker/utils/money";

describe("rupeesToPaise", () => {
  it.each([["1250.50", 125050], ["0.01", 1], [1250, 125000]])("converts %s", (input, expected) => {
    expect(rupeesToPaise(input)).toBe(expected);
  });
  it.each(["", "1.001", -1, Number.NaN])("rejects %s", (input) => {
    expect(() => rupeesToPaise(input)).toThrow();
  });
});
```

```ts
// tests/unit/format.test.ts
import { expect, it } from "vitest";
import { formatCompactINR, formatINR } from "../../src/lib/format";

it("uses Indian currency grouping", () => {
  expect(formatINR(12500000)).toBe("₹1,25,000");
  expect(formatCompactINR(149301700)).toBe("₹14.93 L");
});
```

- [ ] **Step 2: Run tests and confirm missing exports**

Run: `npm run test -- tests/unit/money.test.ts tests/unit/format.test.ts`

Expected: FAIL because money and format modules do not exist.

- [ ] **Step 3: Implement shared money and API contracts**

```ts
export type ApiObject<T> = { data: T };
export type ApiList<T> = {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
};
export type ApiFailure = {
  error: { code: string; message: string; details?: Record<string, unknown> };
};
```

Implement `rupeesToPaise(input: string | number): number` with decimal-string parsing, at most two fractional digits, safe-integer checks, and no floating-point multiplication for string input. Implement the approved INR/date/weight formatters using `Intl.NumberFormat("en-IN")` and Asia/Kolkata display rules.

- [ ] **Step 4: Write failing identity and role tests**

Test that local requests receive `dev@vkb.local/admin` only when `ENVIRONMENT=local` and `DEV_AUTH_ENABLED=true`; production without Access identity returns 401; viewer writes return 403; and errors use `{ error: { code, message, details } }` without a stack.

- [ ] **Step 5: Implement middleware and API client behavior**

Read `Cf-Access-Authenticated-User-Email` only under the documented Access-protected deployment contract; Workers Static Assets do not expose `ctx.access` to the user Worker. Production returns 401 when the Access identity header is absent, and the deployment guide requires Access on every production and preview hostname. `apiFetch<T>(path, init)` must parse the common envelope, throw a typed `ApiError`, distinguish offline failures, and never assume every error body is JSON.

- [ ] **Step 6: Run focused checks and commit**

```bash
npm run test -- tests/unit/money.test.ts tests/unit/format.test.ts
npm run test:worker -- tests/worker/identity.test.ts
npm run typecheck
git add src/types src/lib worker/utils worker/middleware worker/index.ts tests IMPLEMENTATION_STATUS.md
git commit -m "feat: add shared API and security foundations"
```

Expected: all focused tests and type checking PASS.

---

### Task 4: Expense, Category, and People API Vertical Slice

**Files:**
- Create: `worker/validation/expenses.ts`
- Create: `worker/repositories/people-repository.ts`
- Create: `worker/repositories/category-repository.ts`
- Create: `worker/repositories/expense-repository.ts`
- Create: `worker/services/expense-service.ts`
- Create: `worker/routes/people.ts`
- Create: `worker/routes/categories.ts`
- Create: `worker/routes/expenses.ts`
- Create: `tests/worker/expenses.test.ts`
- Modify: `worker/index.ts`
- Modify: `IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Consumes: D1 tables, `AppEnv`, role middleware, ID/date/money utilities, API envelopes.
- Produces: `listExpenses(db, filters)`, `getExpense(db, id)`, `createExpense(db, input, actor)`, `updateExpense(db, id, input, actor)`, `softDeleteExpense(db, id, actor)`, and the specified people/category/expense endpoints.

- [ ] **Step 1: Write failing expense route tests**

Create tests for: valid expense creation; amount `0` rejection; unknown person/category rejection; CAPEX/OPEX/null classification; paginated list metadata; search across description/vendor/category; payer/date/category/class/amount filters; deterministic sorting; update audit entry; soft delete; and disabled category rejection on new writes.

```ts
const response = await SELF.fetch("http://example.com/api/v1/expenses", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    expenseDate: "2026-09-09",
    amount: "8000.00",
    categoryId: "category_salary",
    paidByPersonId: "person_mahesh",
    description: "Giri Salary",
    expenseClass: "OPEX",
    isShared: true,
  }),
});
expect(response.status).toBe(201);
```

- [ ] **Step 2: Run route tests and verify 404 failures**

Run: `npm run test:worker -- tests/worker/expenses.test.ts`

Expected: FAIL because `/api/v1/expenses` is not registered.

- [ ] **Step 3: Implement exact validation and repository query building**

Define `ExpenseInputSchema` with `expenseDate`, decimal-string `amount`, active references, nullable `expenseClass`, optional `paidTo`, description, notes, crop, and `isShared`. Build SQL from a fixed whitelist of filter and sort fragments; bind every value. Default to page 1, page size 25, descending expense date then created time, and cap page size at 100.

- [ ] **Step 4: Implement transactional service operations**

Create/update/delete must write the expense and matching `audit_log` entry in one D1 batch. Return 409 for an inactive category, 404 for missing references, and 422 for semantic validation. A soft-deleted expense must be absent from default lists and totals.

- [ ] **Step 5: Implement category and people endpoints**

Categories support list, add, rename, default class change, and activation/deactivation. Renaming updates the canonical category record without modifying expense history. People support list and admin-only create/update; participant membership is represented by active people with role `owner`.

- [ ] **Step 6: Run the expense slice checks**

```bash
npm run test:worker -- tests/worker/expenses.test.ts
npm run typecheck
npm run lint
```

Expected: expense, category, people, and audit tests PASS.

- [ ] **Step 7: Commit the API slice**

```bash
git add worker tests/worker/expenses.test.ts IMPLEMENTATION_STATUS.md
git commit -m "feat: add expense management API"
```

---

### Task 5: Approved Responsive Application Shell and UI Primitives

**Files:**
- Create: `src/styles/index.css`
- Create: `src/app/providers.tsx`
- Create: `src/app/router.tsx`
- Create: `src/app/AppErrorBoundary.tsx`
- Create: `src/components/layout/AppShell.tsx`
- Create: `src/components/layout/DesktopSidebar.tsx`
- Create: `src/components/layout/MobileNavigation.tsx`
- Create: `src/components/layout/QuickActionSheet.tsx`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/field.tsx`
- Create: `src/components/ui/select.tsx`
- Create: `src/components/ui/skeleton.tsx`
- Create: `src/components/ui/empty-state.tsx`
- Create: `src/components/ui/error-state.tsx`
- Create: `src/lib/cn.ts`
- Create: `src/test/setup.ts`
- Create: `src/app/App.test.tsx`
- Modify: `src/main.tsx`
- Modify: `IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Consumes: React foundation, API client, approved visual design.
- Produces: lazy route shell, `QueryClientProvider`, reusable accessible controls, `AppShell`, and responsive navigation contracts.

- [ ] **Step 1: Write failing shell behavior tests**

```tsx
it("shows core desktop navigation and opens quick actions", async () => {
  render(<App />);
  expect(screen.getByRole("navigation", { name: /primary/i })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /quick add/i }));
  expect(screen.getByRole("dialog", { name: /quick actions/i })).toBeVisible();
  expect(screen.getByRole("link", { name: /add expense/i })).toHaveAttribute("href", "/expenses/new");
});
```

- [ ] **Step 2: Run the shell test and confirm the missing UI**

Run: `npm run test -- src/app/App.test.tsx`

Expected: FAIL because providers, router, and layout do not exist.

- [ ] **Step 3: Implement design tokens and primitives**

Define named CSS tokens for sky action, sky emphasis, charcoal navigation, cool-grey canvas, paper surfaces, text, muted text, borders, success, warning, and destructive states. Meet WCAG contrast, preserve visible focus rings, respect reduced motion, and use Barlow Condensed only for display totals/headings with Manrope for body text.

Build shadcn-style primitives with Radix and CVA; do not create a second competing component system.

- [ ] **Step 4: Implement the responsive shell**

Desktop routes appear in the sidebar. Tablet navigation collapses. Mobile exposes Home, Expenses, Quick Add, Farm, and More; Farm groups Plantation and Harvest, and More groups Reports, Documents, and Settings. All secondary feature routes use `React.lazy` with route skeletons.

- [ ] **Step 5: Run UI checks at desktop and mobile widths**

Run:

```bash
npm run test -- src/app/App.test.tsx
npm run typecheck
npm run build
```

Use browser inspection at 1440×900, 768×1024, and 390×844. Expected: no horizontal page overflow, focus order follows visual order, the mobile action does not cover content, and route refreshes return the SPA shell.

- [ ] **Step 6: Commit the shell**

```bash
git add src IMPLEMENTATION_STATUS.md
git commit -m "feat: add responsive VKB application shell"
```

---

### Task 6: Expense List, Filters, Entry, Detail, and Editing UI

**Files:**
- Create: `src/features/expenses/api.ts`
- Create: `src/features/expenses/types.ts`
- Create: `src/features/expenses/schema.ts`
- Create: `src/features/expenses/ExpenseListPage.tsx`
- Create: `src/features/expenses/ExpenseFilters.tsx`
- Create: `src/features/expenses/ExpenseTable.tsx`
- Create: `src/features/expenses/ExpenseCards.tsx`
- Create: `src/features/expenses/ExpenseForm.tsx`
- Create: `src/features/expenses/ExpenseFormPage.tsx`
- Create: `src/features/expenses/ExpenseDetailPage.tsx`
- Create: `src/features/expenses/DeleteExpenseDialog.tsx`
- Create: `src/features/expenses/ExpenseForm.test.tsx`
- Create: `src/features/expenses/ExpenseListPage.test.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/lib/query-keys.ts`
- Modify: `IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Consumes: `/api/v1/expenses`, `/api/v1/categories`, `/api/v1/people`, query provider, UI primitives, formatters.
- Produces: `expenseKeys`, expense query/mutation hooks, responsive expense list, create/edit form, detail view, and confirmed soft deletion.

- [ ] **Step 1: Write failing form and list tests**

Test today's local default date, required amount/category/person/description, decimal amount validation, active API-loaded options, disabled submit during mutation, server field errors, successful invalidation, Add Another behavior, receipt handoff, desktop table columns, mobile cards, filters, sorting, page sizes 25/50/100, skeletons, empty states, and delete confirmation.

- [ ] **Step 2: Run the focused React tests**

Run: `npm run test -- src/features/expenses`

Expected: FAIL because expense components do not exist.

- [ ] **Step 3: Implement typed API hooks and structured query keys**

```ts
export const expenseKeys = {
  all: ["expenses"] as const,
  list: (filters: ExpenseFilters) => ["expenses", "list", filters] as const,
  detail: (id: string) => ["expenses", "detail", id] as const,
};
```

Mutations invalidate expense lists, the affected detail, dashboard, settlement summary, and expense/contribution/cashflow reports.

- [ ] **Step 4: Implement the 15–30 second entry flow**

Use a mobile-first form with date defaulted in Asia/Kolkata, numeric-decimal amount keyboard, recent/default category assistance without changing authoritative values, two-tap payer selection, optional fields collapsed after core fields, and a persistent but non-overlapping submit region.

- [ ] **Step 5: Implement responsive browsing and details**

Use TanStack Table on desktop. Render card rows on phones with amount and description first, then date/category/payer. Keep filter state in URL search parameters so refresh/back navigation preserves it. The detail page shows receipt area, notes, source traceability, and edit/delete actions allowed by role.

- [ ] **Step 6: Verify and commit**

```bash
npm run test -- src/features/expenses
npm run typecheck
npm run build
git add src/features/expenses src/app/router.tsx src/lib/query-keys.ts IMPLEMENTATION_STATUS.md
git commit -m "feat: add responsive expense experience"
```

---

### Task 7: Generic Settlement Engine, API, and Settlement Experience

**Files:**
- Create: `worker/services/settlement-service.ts`
- Create: `worker/repositories/settlement-repository.ts`
- Create: `worker/validation/settlements.ts`
- Create: `worker/routes/settlements.ts`
- Create: `tests/unit/settlement.test.ts`
- Create: `tests/worker/settlements.test.ts`
- Create: `src/features/settlements/api.ts`
- Create: `src/features/settlements/SettlementPage.tsx`
- Create: `src/features/settlements/SettlementSummary.tsx`
- Create: `src/features/settlements/SettlementForm.tsx`
- Create: `src/features/settlements/SettlementHistory.tsx`
- Create: `src/features/settlements/SettlementPage.test.tsx`
- Modify: `worker/index.ts`
- Modify: `src/app/router.tsx`
- Modify: `IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Consumes: people, shared expenses, settlement table, money/date validation, expense query invalidation.
- Produces: `calculateSettlement(input): SettlementResult`, `GET/POST /api/v1/settlements`, `GET /api/v1/settlements/summary`, and the settlement page.

```ts
export type Contribution = { personId: string; name: string; paidPaise: number };
export type RecordedSettlement = { fromPersonId: string; toPersonId: string; amountPaise: number };
export type RecommendedTransfer = { fromPersonId: string; toPersonId: string; amountPaise: number };
export type SettlementResult = {
  totalSharedExpensePaise: number;
  participants: Array<Contribution & { expectedPaise: number; balancePaise: number }>;
  recommendedTransfers: RecommendedTransfer[];
};
```

- [ ] **Step 1: Write the failing pure algorithm tests**

Cover equal contributions, one person paying all ₹16,000, three participants, previous settlement, odd-paise allocation, stable ordering, and exact workbook values:

```ts
expect(calculateSettlement({
  contributions: [
    { personId: "person_satish", name: "Satish", paidPaise: 149301700 },
    { personId: "person_mahesh", name: "Mahesh", paidPaise: 148318000 },
  ],
  settlements: [],
}).recommendedTransfers).toEqual([
  { fromPersonId: "person_mahesh", toPersonId: "person_satish", amountPaise: 491850 },
]);
```

- [ ] **Step 2: Run tests and confirm the missing algorithm**

Run: `npm run test -- tests/unit/settlement.test.ts`

Expected: FAIL because `calculateSettlement` does not exist.

- [ ] **Step 3: Implement deterministic creditor/debtor balancing**

Allocate division remainders by sorted participant ID, apply recorded transfers to payer/receiver balances, sort debtors and creditors by magnitude then ID, and match until all non-zero balances are exhausted. Assert internally that participant balances and transfers reconcile to zero.

- [ ] **Step 4: Implement and test settlement routes**

The summary repository aggregates non-deleted shared expenses by active owner. POST validates active distinct people and a positive decimal amount, writes the settlement plus audit entry, and refreshes the summary. Route tests must prove settlement payments do not change expense totals.

- [ ] **Step 5: Implement the settlement UI**

Show total shared expense, contribution per person, expected share, explicit receive/owe wording, one recommended transfer card, recording form, and chronological history. Never rely on color alone for balance meaning.

- [ ] **Step 6: Verify and commit**

```bash
npm run test -- tests/unit/settlement.test.ts src/features/settlements/SettlementPage.test.tsx
npm run test:worker -- tests/worker/settlements.test.ts
npm run typecheck
git add worker src/features/settlements src/app/router.tsx tests IMPLEMENTATION_STATUS.md
git commit -m "feat: add contribution settlement workflow"
```

---

### Task 8: Dashboard, Reports, and CSV Exports

**Files:**
- Create: `worker/repositories/report-repository.ts`
- Create: `worker/services/report-service.ts`
- Create: `worker/routes/dashboard.ts`
- Create: `worker/routes/reports.ts`
- Create: `worker/utils/csv.ts`
- Create: `tests/worker/dashboard-reports.test.ts`
- Create: `tests/unit/csv.test.ts`
- Create: `src/features/dashboard/api.ts`
- Create: `src/features/dashboard/DashboardPage.tsx`
- Create: `src/features/dashboard/KpiGrid.tsx`
- Create: `src/features/dashboard/ExpenseCharts.tsx`
- Create: `src/features/dashboard/RecentActivity.tsx`
- Create: `src/features/dashboard/DashboardPage.test.tsx`
- Create: `src/features/reports/api.ts`
- Create: `src/features/reports/ReportsPage.tsx`
- Create: `src/features/reports/ReportFilters.tsx`
- Modify: `worker/index.ts`
- Modify: `src/app/router.tsx`
- Modify: `IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Consumes: expense, settlement, plantation, and harvest tables; formatters and responsive shell.
- Produces: aggregated `/api/v1/dashboard`; expense, contribution, harvest, and cashflow report endpoints; CSV variants for expenses, settlements, plantation, and harvest; dashboard and reports pages.

- [ ] **Step 1: Write failing aggregation and CSV tests**

Seed expenses spanning months, categories, payers, deleted rows, and CAPEX/OPEX. Assert current month/year totals, contribution totals, category/month grouping, recent rows, revenue, net cash flow, CSV headers, RFC 4180 quote escaping, and formula-injection neutralization for values beginning with `=`, `+`, `-`, or `@`.

- [ ] **Step 2: Run tests and verify missing endpoints**

Run: `npm run test:worker -- tests/worker/dashboard-reports.test.ts`

Expected: FAIL with 404 responses.

- [ ] **Step 3: Implement SQL-owned aggregations**

Use bounded grouped queries and one service composition for dashboard data. The endpoint returns totals, contributions, monthly expenses, category expenses, recent expenses, recent harvests, and plantation summary in the approved envelope. Date filters bind ISO start/end boundaries.

- [ ] **Step 4: Implement streamed CSV responses**

Create separate exports for expenses, settlements, plantation, and harvest. Use stable headings, Indian-readable ISO dates, raw numeric rupee columns, UTF-8 BOM for Excel compatibility, safe cell escaping, and attachment filenames containing the export type and ISO date.

- [ ] **Step 5: Write and implement the dashboard UI tests**

Test skeleton cards, the four primary KPI cards, exact settlement wording, no more than four major charts, recent expenses/harvests, plantation summary, report date filters, undated-harvest disclosure, and CSV links.

- [ ] **Step 6: Implement approved dashboard composition**

Use the sky/grey design, Indian currency helpers, Recharts with accessible labels/tooltips, mobile chart simplification, and one aggregated dashboard query. Do not calculate financial totals in React.

- [ ] **Step 7: Verify and commit**

```bash
npm run test -- tests/unit/csv.test.ts src/features/dashboard src/features/reports
npm run test:worker -- tests/worker/dashboard-reports.test.ts
npm run typecheck
npm run build
git add worker src/features/dashboard src/features/reports src/app/router.tsx tests IMPLEMENTATION_STATUS.md
git commit -m "feat: add financial dashboard and reports"
```

---

### Task 9: Plantation Inventory API and Responsive Module

**Files:**
- Create: `worker/validation/plantation.ts`
- Create: `worker/repositories/plantation-repository.ts`
- Create: `worker/services/plantation-service.ts`
- Create: `worker/routes/plantation.ts`
- Create: `tests/worker/plantation.test.ts`
- Create: `src/features/plantation/api.ts`
- Create: `src/features/plantation/PlantationPage.tsx`
- Create: `src/features/plantation/PlantationMatrix.tsx`
- Create: `src/features/plantation/PlantationForm.tsx`
- Create: `src/features/plantation/PlantationPage.test.tsx`
- Modify: `worker/index.ts`
- Modify: `src/app/router.tsx`
- Modify: `IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Consumes: crops, farm areas, plantation inventory tables, roles, shared forms.
- Produces: crop/farm-area/plantation CRUD, `/api/v1/plantation/summary`, and a responsive crop-by-area inventory matrix.

- [ ] **Step 1: Write failing route tests**

Test dynamic crop creation, MT/SK retrieval, non-negative integer quantity, same crop in multiple areas, summary totals, update, delete, disabled reference rejection, and parameterized filtering.

- [ ] **Step 2: Run route tests and confirm 404 failures**

Run: `npm run test:worker -- tests/worker/plantation.test.ts`

Expected: FAIL because plantation routes are absent.

- [ ] **Step 3: Implement repositories, validation, and routes**

Provide `GET/POST /crops`, `GET/POST /farm-areas`, plantation CRUD, and summary. Preserve local names exactly; normalized uniqueness is case-insensitive. Compute row totals and area totals in SQL/service output.

- [ ] **Step 4: Implement the responsive module**

Desktop presents Crop, each active area, and Total. Mobile presents one crop card with area quantities and total, with an accessible edit action. Empty state offers the first plantation entry. Forms load crops/areas from APIs.

- [ ] **Step 5: Verify and commit**

```bash
npm run test -- src/features/plantation
npm run test:worker -- tests/worker/plantation.test.ts
npm run typecheck
git add worker src/features/plantation src/app/router.tsx tests/worker/plantation.test.ts IMPLEMENTATION_STATUS.md
git commit -m "feat: add plantation inventory"
```

---

### Task 10: Harvest Tracking and Revenue Rules

**Files:**
- Create: `worker/validation/harvests.ts`
- Create: `worker/repositories/harvest-repository.ts`
- Create: `worker/services/harvest-service.ts`
- Create: `worker/routes/harvests.ts`
- Create: `tests/unit/harvest.test.ts`
- Create: `tests/worker/harvests.test.ts`
- Create: `src/features/harvest/api.ts`
- Create: `src/features/harvest/schema.ts`
- Create: `src/features/harvest/HarvestPage.tsx`
- Create: `src/features/harvest/HarvestForm.tsx`
- Create: `src/features/harvest/HarvestSummary.tsx`
- Create: `src/features/harvest/HarvestCharts.tsx`
- Create: `src/features/harvest/HarvestPage.test.tsx`
- Modify: `worker/index.ts`
- Modify: `src/app/router.tsx`
- Modify: `IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Consumes: crops, harvest table, money/date utilities, report/dashboard invalidation.
- Produces: `calculateRevenuePaise()`, harvest CRUD/filter endpoints, summary metrics, and harvest UI.

- [ ] **Step 1: Write failing revenue tests**

```ts
expect(calculateRevenuePaise({ netWeightKg: "153", salePricePaisePerKg: 4500 })).toBe(688500);
expect(() => validateRevenueOverride({ calculated: 688500, actual: 700000, reason: "" })).toThrow();
```

Also test decimal kilograms without binary-float drift, zero/negative inputs, valid override reasons, and null legacy dates.

- [ ] **Step 2: Run tests and confirm missing service**

Run: `npm run test -- tests/unit/harvest.test.ts`

Expected: FAIL because harvest service is absent.

- [ ] **Step 3: Implement revenue calculation and CRUD**

Parse decimal kilograms as scaled integers before multiplying by price. Manual/API records require dates. Actual revenue defaults to calculated revenue; a difference requires `revenueOverrideReason`. Imported EXCEL rows may use a null date and cached actual revenue.

- [ ] **Step 4: Implement harvest page and form**

Show total quantity, harvested weight, revenue, average price, recent records, crop/month/year/date filters, monthly crop revenue, and quantity over time. Clearly label undated imported records and exclude them only from date-bucket charts.

- [ ] **Step 5: Verify and commit**

```bash
npm run test -- tests/unit/harvest.test.ts src/features/harvest
npm run test:worker -- tests/worker/harvests.test.ts
npm run typecheck
git add worker src/features/harvest src/app/router.tsx tests IMPLEMENTATION_STATUS.md
git commit -m "feat: add harvest tracking and revenue"
```

---

### Task 11: Excel Normalization, Dry Run, Idempotent Import, and Verification

**Files:**
- Create: `data/VKB-Farm-Expense-tracker.xlsx` by copying the supplied workbook unchanged
- Create: `scripts/types.ts`
- Create: `scripts/data-normalization.ts`
- Create: `scripts/normalize-excel.ts`
- Create: `scripts/import-excel.ts`
- Create: `scripts/verify-import.ts`
- Create: `tests/fixtures/farm-import.xlsx`
- Create: `tests/unit/data-normalization.test.ts`
- Create: `tests/unit/normalize-excel.test.ts`
- Create: `tests/integration/import-excel.test.ts`
- Modify: `package.json`
- Modify: `IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Consumes: D1 schema, stable seed IDs, workbook cached values, explicit normalization maps.
- Produces: `normalizeWorkbook(path): ImportPlan`, dry-run/import CLI, `migration-errors.json`, idempotent D1 inserts, and exact source/D1 verification.

```ts
export type ImportPlan = {
  expenses: NormalizedExpense[];
  plantation: NormalizedPlantation[];
  harvests: NormalizedHarvest[];
  categories: NormalizedCategory[];
  changes: NormalizationChange[];
  warnings: ImportIssue[];
  errors: ImportIssue[];
  discovered: Record<string, number>;
  duplicates: number;
};
```

- [ ] **Step 1: Copy the source workbook and record its checksum**

Run:

```bash
mkdir -p data
cp /home/satish/Downloads/VKB-Farm-Expense-tracker.xlsx data/VKB-Farm-Expense-tracker.xlsx
sha256sum data/VKB-Farm-Expense-tracker.xlsx
```

Store the checksum in the README import section so later verification uses the intended source file.

- [ ] **Step 2: Create a small synthetic workbook fixture**

Build a deterministic fixture containing duplicate-looking summary data, one invalid date, missing category, `mahesh`, `Bannana`, both plantation blocks, formula cells with cached harvest results, and a Grand Total row. The fixture contains no real farm data.

- [ ] **Step 3: Write failing normalization/parser tests**

Assert `Mahesh/mahesh/MAHESH -> Mahesh`, explicit category variants, `Bannana -> Banana`, non-normalization of ambiguous names, Common Expense A:E-only parsing, exclusion of total rows, warning/error payload shape, cached harvest results, and fingerprints stable across repeated parses.

- [ ] **Step 4: Run parser tests and confirm missing implementation**

Run: `npm run test -- tests/unit/data-normalization.test.ts tests/unit/normalize-excel.test.ts`

Expected: FAIL because parser modules are absent.

- [ ] **Step 5: Implement explicit normalization and workbook parsing**

Use SheetJS cell objects with formulas and cached values preserved. Identify headers rather than relying only on fixed maximum rows. Restrict authoritative transactions to Common Expense A:E. Treat personal summary sheets as controls, and enrich from detail logs only on an exact date/amount/payer match with a single candidate.

Parse both plantation blocks, aggregate repeated crop/area pairs, skip totals and zero counts, preserve source references, and parse banana rows 2–4 while excluding Grand Total. Every transformation appends a `NormalizationChange`.

- [ ] **Step 6: Write failing dry-run and idempotency integration tests**

Run the synthetic fixture in dry-run and assert no D1 mutation. Run a real import twice against disposable local D1 and assert the second run reports all fingerprints as duplicates without changing table counts or totals.

- [ ] **Step 7: Implement CLI write safety and verification**

The CLI requires an explicit workbook path, recognizes `--dry-run`, prints all required counts, writes structured errors, and imports categories/expenses/plantation/harvest in dependency order. `verify:import` independently derives workbook controls and queries D1 for matching counts and sums; it exits 1 on mismatch.

- [ ] **Step 8: Verify against the supplied workbook**

Run:

```bash
npm run db:migrate:local
npm run import:excel -- data/VKB-Farm-Expense-tracker.xlsx --dry-run
npm run import:excel -- data/VKB-Farm-Expense-tracker.xlsx
npm run verify:import -- data/VKB-Farm-Expense-tracker.xlsx
npm run import:excel -- data/VKB-Farm-Expense-tracker.xlsx
```

Expected: dry run reports 394 accepted common expenses; first import succeeds; verification matches every approved baseline; second import adds zero business records.

- [ ] **Step 9: Commit the migration slice**

```bash
git add data scripts tests package.json package-lock.json README.md IMPLEMENTATION_STATUS.md
git commit -m "feat: migrate and verify farm workbook"
```

---

### Task 12: R2 Receipt Storage and Document Experience

**Files:**
- Create: `worker/utils/r2-keys.ts`
- Create: `worker/repositories/document-repository.ts`
- Create: `worker/services/document-service.ts`
- Create: `worker/routes/documents.ts`
- Create: `tests/unit/r2-keys.test.ts`
- Create: `tests/worker/documents.test.ts`
- Create: `src/features/documents/api.ts`
- Create: `src/features/documents/DocumentsPage.tsx`
- Create: `src/features/documents/ReceiptUpload.tsx`
- Create: `src/features/documents/ReceiptPreview.tsx`
- Create: `src/features/documents/DocumentsPage.test.tsx`
- Modify: `src/features/expenses/ExpenseForm.tsx`
- Modify: `src/features/expenses/ExpenseDetailPage.tsx`
- Modify: `worker/index.ts`
- Modify: `src/app/router.tsx`
- Modify: `IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Consumes: `Bindings.RECEIPTS`, documents table, identity/roles, expense records.
- Produces: safe R2 keys, document upload/read/delete endpoints, expense-document listing, and receipt UI.

- [ ] **Step 1: Write failing key and upload tests**

Test safe filename normalization, UUID-prefixed year/month keys, path traversal input, allowed MIME types, 10 MB boundary, 10 MB + 1 byte rejection, missing expense, viewer rejection, metadata cleanup after simulated D1 failure, authenticated read, and delete audit.

- [ ] **Step 2: Run tests and confirm missing modules**

Run:

```bash
npm run test -- tests/unit/r2-keys.test.ts
npm run test:worker -- tests/worker/documents.test.ts
```

Expected: FAIL because document modules and routes do not exist.

- [ ] **Step 3: Implement safe upload lifecycle**

Generate the object key exclusively on the server. Verify size and MIME before `R2Bucket.put`. After a successful put, insert D1 metadata; on insert failure, delete the object before returning a sanitized error. Document reads resolve by metadata ID and use only the stored key. Delete removes R2, D1 metadata, and records an audit event.

- [ ] **Step 4: Implement receipt UI**

Use an accessible file input/drop area, show accepted formats and size limit, upload progress/state, retryable errors, image/PDF preview, and document deletion confirmation. Expense creation may upload only after the expense ID exists; failure preserves the saved expense and clearly offers receipt retry.

- [ ] **Step 5: Verify and commit**

```bash
npm run test -- tests/unit/r2-keys.test.ts src/features/documents
npm run test:worker -- tests/worker/documents.test.ts
npm run typecheck
git add worker src/features/documents src/features/expenses src/app/router.tsx tests IMPLEMENTATION_STATUS.md
git commit -m "feat: add secure receipt storage"
```

---

### Task 13: Settings and Administrative Configuration

**Files:**
- Create: `src/features/settings/SettingsPage.tsx`
- Create: `src/features/settings/PeopleSettings.tsx`
- Create: `src/features/settings/CategorySettings.tsx`
- Create: `src/features/settings/CropSettings.tsx`
- Create: `src/features/settings/FarmAreaSettings.tsx`
- Create: `src/features/settings/SettingsPage.test.tsx`
- Modify: `src/app/router.tsx`
- Modify: `IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Consumes: people, category, crop, and farm-area administrative endpoints.
- Produces: admin configuration UI without code changes or destructive reference deletion.

- [ ] **Step 1: Write failing settings tests**

Test section navigation, admin-only edit controls, viewer read-only display, new category/crop/area/person validation, category rename, deactivation, and prevention of hard delete for referenced records.

- [ ] **Step 2: Run tests and confirm missing page**

Run: `npm run test -- src/features/settings/SettingsPage.test.tsx`

Expected: FAIL because settings components do not exist.

- [ ] **Step 3: Implement settings sections**

Use one responsive settings route with People, Expense Categories, Crops, Farm Areas, and Application sections. Load data from APIs, apply role-aware controls, use confirmation for deactivation, and explain that referenced categories are retained in historical transactions.

- [ ] **Step 4: Verify and commit**

```bash
npm run test -- src/features/settings
npm run typecheck
git add src/features/settings src/app/router.tsx IMPLEMENTATION_STATUS.md
git commit -m "feat: add farm configuration settings"
```

---

### Task 14: PWA, Accessibility, End-to-End Verification, and Operations Guide

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/sw.js`
- Create: `playwright.config.ts`
- Create: `tests/e2e/farm-manager.spec.ts`
- Create: `tests/e2e/accessibility.spec.ts`
- Modify: `README.md`
- Modify: `index.html`
- Modify: `src/main.tsx`
- Modify: `package.json`
- Modify: `IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Consumes: all completed application modules and operational scripts.
- Produces: installable asset-cached PWA, final smoke/accessibility suite, exact setup/deployment/backup guide, and final status report.

- [ ] **Step 1: Write failing end-to-end smoke tests**

```ts
test("expense and harvest updates flow through the dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Farm overview" })).toBeVisible();
  await page.getByRole("link", { name: "Expenses" }).click();
  await page.getByRole("link", { name: "Add expense" }).click();
  await page.getByLabel("Amount").fill("10000");
  await page.getByLabel("Description").fill("Synthetic farm expense");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText("Expense saved")).toBeVisible();
});
```

Add a second flow that records a settlement and checks the recommendation, and a third that adds a harvest and verifies dashboard revenue.

- [ ] **Step 2: Run the smoke suite and capture the missing PWA/accessibility work**

Run: `npm run test:e2e`

Expected: functional flows may pass, while manifest/service-worker and targeted accessibility assertions fail until this task is implemented.

- [ ] **Step 3: Implement a basic asset-only PWA**

Add a manifest with VKB Farm Manager name, short name, start URL `/dashboard`, standalone display, approved sky theme, generated 192/512 icons, and responsive metadata. Register a service worker that caches versioned build assets and navigation shell but never queues or fabricates API writes. API failures remain online/offline errors.

- [ ] **Step 4: Complete accessibility verification**

Test keyboard navigation, skip link, dialog focus trapping/return, visible focus, form labels/errors, chart accessible names, status text that does not depend on color, and 200% zoom without lost controls. Check dashboard, expense form/list/detail, settlement, plantation, harvest, reports, documents, and settings at 390×844 and 1440×900.

- [ ] **Step 5: Write and verify the operations README**

Document overview, architecture, repository layout, prerequisites, exact installation and local commands, D1/R2 creation, local/remote migrations, Excel dry run/import/verification, tests, Workers deployment, Access setup, `workers.dev`, custom domain configuration, CSV backup, current Wrangler D1 export, authentication behavior, and troubleshooting.

Verify current commands locally:

```bash
npx wrangler --version
npx wrangler d1 migrations apply --help
npx wrangler r2 bucket create --help
npx wrangler deploy --dry-run
```

- [ ] **Step 6: Run the complete acceptance suite**

```bash
npm run lint
npm run typecheck
npm run test
npm run test:worker
npm run build
npm run import:excel -- data/VKB-Farm-Expense-tracker.xlsx --dry-run
npm run verify:import -- data/VKB-Farm-Expense-tracker.xlsx
npm run test:e2e
```

Expected: every command exits 0; no formula/reference/import discrepancy exists; route refresh works; D1 and R2 local behavior works; and the responsive UI matches the approved palette.

- [ ] **Step 7: Perform final manual checks**

Inspect dashboard and every primary form at 390×844, 768×1024, and 1440×900. Test empty, loading, validation, server error, offline, viewer, editor, and admin states. Confirm adding an ordinary expense takes no more than 30 seconds with familiar category and payer choices.

- [ ] **Step 8: Finalize status and commit**

Set Completed to all V1 modules and verified checks. Keep Deployment Status as `Ready for authenticated Cloudflare resource creation` until account-owned D1/R2 creation and deploy commands are actually run.

```bash
git add public tests/e2e playwright.config.ts README.md index.html src/main.tsx package.json package-lock.json IMPLEMENTATION_STATUS.md
git commit -m "feat: complete VKB Farm Manager V1"
```

## Execution Checkpoints

- After Task 4: Worker/D1 expense CRUD is independently usable and tested.
- After Task 7: the core shared-expense and settlement product is usable end to end.
- After Task 10: all finance and farm-operation modules are usable before migration.
- After Task 11: the real workbook is imported, idempotent, and reconciled.
- After Task 14: the complete V1 acceptance suite passes and deployment steps are documented.

## Source Notes for Implementation

The [Cloudflare React SPA tutorial](https://developers.cloudflare.com/workers/vite-plugin/tutorial/) and [Static Assets reference](https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/) establish that the Vite plugin generates the deployed asset directory; the input Wrangler configuration should specify SPA fallback and `/api/*` Worker-first routing without hard-coding an asset directory. The [Wrangler D1 command reference](https://developers.cloudflare.com/workers/wrangler/commands/d1/) retains `wrangler d1 migrations apply <database> --local|--remote`. The [Cloudflare Access documentation](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) governs the production hostname policy. Confirm installed CLI behavior while implementing Tasks 1 and 14.
