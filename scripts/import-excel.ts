import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { normalizeWorkbookSource } from "./normalize-excel";
import { CANONICAL_WORKBOOK_NAME, CANONICAL_WORKBOOK_SHA256, canonicalizePotentialPath, validateWorkbookPath, workbookChecksum } from "./source-policy";
import type { ImportDatabase, ImportPlan, SqlStatement } from "./types";

const LOCAL_DATABASE_ID = "db00ab6a-447e-4d06-9937-bf2fb4f3efbf";
const DATABASE_WORKER = String.raw`
export default {
  async fetch(request, env) {
    try {
      const body = await request.json();
      if (body.operation === "query") {
        const statement = env.DB.prepare(body.sql).bind(...(body.params || []));
        const result = await statement.all();
        return Response.json({ results: result.results });
      }
      if (body.operation === "batch") {
        const statements = body.statements.map((value) => env.DB.prepare(value.sql).bind(...(value.params || [])));
        const results = await env.DB.batch(statements);
        return Response.json({ changes: results.map((result) => result.meta?.changes || 0) });
      }
      if (body.operation === "exec") {
        await env.DB.exec(body.sql);
        return Response.json({ ok: true });
      }
      return Response.json({ error: "unsupported operation" }, { status: 400 });
    } catch {
      return Response.json({ error: "local database operation failed" }, { status: 500 });
    }
  }
};`;

export type ImportArguments = {
  workbookPath: string;
  dryRun: boolean;
  localDb?: string;
  errorsPath: string;
  allowUnapprovedSource: boolean;
};

export type ImportResult = {
  dryRun: boolean;
  inserted: { categories: number; crops: number; expenses: number; plantation: number; harvests: number };
  backfilled: { expenseEnrichmentProvenance: number };
  migrated: { expenseCanonicalIdentities: number };
  duplicates: number;
  accepted: { expenses: number; plantation: number; harvests: number };
  skipped: number;
  discovered: Record<string, number>;
  normalized: number;
  warnings: number;
  errors: number;
  sourceFile: string;
  sourceChecksum: string;
  approvedSource: boolean;
};

const OWNERSHIP_MARKER = ".vkb-import-owned.json";
const REPORT_KIND = "vkb-farm-migration-report";

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function sameFile(left: string, right: string): Promise<boolean> {
  try {
    const [leftStat, rightStat] = await Promise.all([fs.stat(left), fs.stat(right)]);
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function atomicJsonWrite(target: string, value: unknown): Promise<void> {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function prepareLocalPersistenceDirectory(input: string, protectedPaths: string[] = []): Promise<string> {
  const resolved = await canonicalizePotentialPath(input);
  const repo = await fs.realpath(process.cwd());
  const unsafe = [path.parse(resolved).root, await fs.realpath(os.homedir()), await fs.realpath(os.tmpdir()), repo];
  if (unsafe.includes(resolved) || isWithin(repo, resolved)) throw new Error("The persistence directory is a protected repository or system location");
  for (const protectedPath of protectedPaths) {
    const canonical = await canonicalizePotentialPath(protectedPath);
    if (isWithin(resolved, canonical) || isWithin(canonical, resolved)) throw new Error("The persistence directory overlaps a protected source or output location");
  }
  let exists = true;
  try {
    if (!(await fs.stat(resolved)).isDirectory()) throw new Error("The persistence target must be a directory");
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    exists = false;
  }
  if (!exists) await fs.mkdir(resolved, { recursive: true });
  const marker = path.join(resolved, OWNERSHIP_MARKER);
  const entries = await fs.readdir(resolved);
  if (!exists) {
    await atomicJsonWrite(marker, { kind: "vkb-farm-import-persistence", version: 1 });
  } else if (!entries.includes(OWNERSHIP_MARKER)) {
    throw new Error("The persistence directory is not importer-owned");
  } else {
    const ownership = JSON.parse(await fs.readFile(marker, "utf8")) as { kind?: string; version?: number };
    if (ownership.kind !== "vkb-farm-import-persistence" || ownership.version !== 1) throw new Error("The persistence directory ownership marker is invalid");
  }
  return resolved;
}

export function parseImportArguments(args: string[]): ImportArguments {
  let workbookPath: string | undefined;
  let localDb: string | undefined;
  let errorsPath = path.join(os.tmpdir(), "vkb-migration-errors.json");
  let dryRun = false;
  let allowUnapprovedSource = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") dryRun = true;
    else if (argument === "--allow-unapproved-source") allowUnapprovedSource = true;
    else if (argument === "--local-db") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("--local-db requires a dedicated local persistence directory");
      localDb = path.resolve(value);
      if ([path.parse(localDb).root, os.homedir(), process.cwd(), os.tmpdir()].includes(localDb)) throw new Error("The local database target is unsafe; choose a dedicated persistence directory");
    } else if (argument === "--errors") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("--errors requires an output file path");
      errorsPath = path.resolve(value);
    } else if (argument.startsWith("--")) throw new Error(`Unknown option: ${argument}`);
    else if (workbookPath) throw new Error("Only one workbook path may be supplied");
    else workbookPath = path.resolve(argument);
  }
  if (!workbookPath) throw new Error("An explicit workbook path is required");
  if (!dryRun && !localDb) throw new Error("--local-db is required for imports; remote D1 is never supported");
  return { workbookPath, dryRun, ...(localDb ? { localDb } : {}), errorsPath, allowUnapprovedSource };
}

export class LocalD1Database implements ImportDatabase {
  private constructor(public readonly persistTo: string, private readonly miniflare: Miniflare) {}

  static async open(persistTo: string): Promise<LocalD1Database> {
    const resolved = await prepareLocalPersistenceDirectory(persistTo);
    await fs.mkdir(path.join(resolved, "v3"), { recursive: true });
    const options = convertV4MiniflareOptions({
      modules: true,
      script: DATABASE_WORKER,
      d1Databases: { DB: LOCAL_DATABASE_ID },
      resourcePersistencePath: path.join(resolved, "v3"),
    });
    const miniflare = new Miniflare(options);
    const ready = await miniflare.ready;
    if (ready.hostname !== "127.0.0.1" && ready.hostname !== "localhost") {
      await miniflare.dispose();
      throw new Error("Local D1 refused a non-loopback runtime address");
    }
    return new LocalD1Database(resolved, miniflare);
  }

  private async request<T>(payload: unknown, label: string): Promise<T> {
    const response = await this.miniflare.dispatchFetch("http://local-d1.invalid/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Local D1 ${label} failed`);
    return response.json() as Promise<T>;
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: Array<string | number | null> = []): Promise<T[]> {
    const response = await this.request<{ results: T[] }>({ operation: "query", sql, params }, "query");
    return response.results;
  }

  async batch(statements: SqlStatement[]): Promise<number[]> {
    if (!statements.length) return [];
    const result = await this.request<{ changes: number[] }>({ operation: "batch", statements }, "batch");
    return result.changes;
  }

  async exec(sql: string): Promise<void> {
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean)
      .map((statement) => ({ sql: statement }));
    await this.request({ operation: "batch", statements }, "migration");
  }

  async dispose(): Promise<void> {
    await this.miniflare.dispose();
  }
}

function existingFingerprints(rows: Array<{ import_fingerprint: unknown }>): Set<string> {
  return new Set(rows.map((row) => row.import_fingerprint).filter((value): value is string => typeof value === "string"));
}

type ExistingExpense = {
  id: string;
  expense_date: string;
  description: string;
  amount_paise: number;
  paid_by_person_id: string;
  category_id: string | null;
  category_name: string;
  expense_class: string | null;
  paid_to: string | null;
  notes: string | null;
  crop_id: string | null;
  is_shared: number;
  source: string | null;
  source_sheet: string | null;
  source_row: number | null;
  import_fingerprint: string;
  enrichment_source_json: string | null;
  deleted_at: string | null;
};

type ExpectedExpenseState = {
  id: string;
  categoryId: string;
  fingerprint: string;
  enrichmentSourceJson: string | null;
};

function expenseMatchesPlan(row: ExistingExpense, expense: ImportPlan["expenses"][number], expected: ExpectedExpenseState): boolean {
  return row.id === expected.id
    && row.expense_date === expense.expenseDate
    && row.description === expense.description
    && row.amount_paise === expense.amountPaise
    && row.paid_by_person_id === expense.paidByPersonId
    && row.category_id === expected.categoryId
    && row.category_name === expense.categoryName
    && row.expense_class === null
    && row.paid_to === expense.paidTo
    && row.notes === expense.notes
    && row.crop_id === null
    && row.is_shared === 1
    && row.source === expense.source
    && row.source_sheet === expense.sourceSheet
    && row.source_row === expense.sourceRow
    && row.import_fingerprint === expected.fingerprint
    && row.deleted_at === null;
}

function expenseStatePredicate(expense: ImportPlan["expenses"][number], expected: ExpectedExpenseState): { sql: string; params: Array<string | number | null> } {
  return {
    sql: `id = ?
      AND expense_date = ?
      AND description = ?
      AND amount_paise = ?
      AND paid_by_person_id = ?
      AND category_id = ?
      AND EXISTS (
        SELECT 1 FROM expense_categories expected_category
        WHERE expected_category.id = expenses.category_id
          AND expected_category.name = ?
          AND expected_category.normalized_name = ?
      )
      AND expense_class IS NULL
      AND paid_to IS ?
      AND notes IS ?
      AND crop_id IS NULL
      AND is_shared = 1
      AND source = ?
      AND source_sheet = ?
      AND source_row = ?
      AND import_fingerprint = ?
      AND enrichment_source_json IS ?
      AND deleted_at IS NULL`,
    params: [
      expected.id,
      expense.expenseDate,
      expense.description,
      expense.amountPaise,
      expense.paidByPersonId,
      expected.categoryId,
      expense.categoryName,
      expense.categoryName.toLocaleLowerCase("en-IN"),
      expense.paidTo,
      expense.notes,
      expense.source,
      expense.sourceSheet,
      expense.sourceRow,
      expected.fingerprint,
      expected.enrichmentSourceJson,
    ],
  };
}

function expenseStateGuard(expense: ImportPlan["expenses"][number], expected: ExpectedExpenseState): SqlStatement {
  const predicate = expenseStatePredicate(expense, expected);
  return {
    // SQLite evaluates CASE lazily. The minimum-integer abs() branch raises an
    // overflow, which makes D1 roll back the batch if neither this run nor an
    // identical concurrent run established the complete expected state.
    sql: `SELECT CASE
      WHEN EXISTS (SELECT 1 FROM expenses WHERE ${predicate.sql}) THEN 1
      ELSE abs(-9223372036854775808)
    END import_guard`,
    params: predicate.params,
  };
}

function fixBaseExpenseIdentity(expense: ImportPlan["expenses"][number]): { id: string; fingerprint: string } {
  const identity = {
    sheet: expense.sourceSheet,
    row: expense.sourceRow,
    date: expense.expenseDate,
    description: expense.description,
    amountPaise: expense.amountPaise,
    payer: expense.paidByPersonId === "person_mahesh" ? "Mahesh" : "Satish",
    categoryName: expense.categoryName,
    paidTo: expense.paidTo,
    notes: expense.notes,
    enrichmentSource: expense.enrichmentSource,
  };
  const fingerprint = createHash("sha256").update(`expense\n${JSON.stringify(identity)}`).digest("hex");
  return { id: `expense_import_${fingerprint.slice(0, 24)}`, fingerprint };
}

function sourceNotes(sources: ImportPlan["plantation"][number]["sources"]): string {
  return `Imported aggregate from ${sources.map((source) => `${source.sheet}!${source.column}${source.row}`).join(", ")}`;
}

export async function applyImportPlan(database: ImportDatabase, plan: ImportPlan): Promise<Pick<ImportResult, "inserted" | "backfilled" | "migrated" | "duplicates">> {
  const [expenseRows, plantationRows, harvestRows, categoryRows, cropRows] = await Promise.all([
    database.query<ExistingExpense>(`SELECT
      e.id, e.expense_date, e.description, e.amount_paise, e.paid_by_person_id,
      e.category_id, c.name category_name, e.expense_class, e.paid_to, e.notes, e.crop_id,
      e.is_shared, e.source, e.source_sheet, e.source_row, e.import_fingerprint,
      e.enrichment_source_json, e.deleted_at
      FROM expenses e
      LEFT JOIN expense_categories c ON c.id = e.category_id
      WHERE e.import_fingerprint IS NOT NULL`),
    database.query<{ import_fingerprint: unknown }>("SELECT import_fingerprint FROM plantation_inventory WHERE import_fingerprint IS NOT NULL"),
    database.query<{ import_fingerprint: unknown }>("SELECT import_fingerprint FROM harvests WHERE import_fingerprint IS NOT NULL"),
    database.query<{ id: string; normalized_name: string }>("SELECT id, normalized_name FROM expense_categories"),
    database.query<{ id: string; normalized_name: string }>("SELECT id, normalized_name FROM crops"),
  ]);
  const existingExpenses = new Map(expenseRows.map((row) => [row.import_fingerprint, row]));
  const existingPlantation = existingFingerprints(plantationRows);
  const existingHarvests = existingFingerprints(harvestRows);
  const categoryIds = new Map(categoryRows.map((row) => [row.normalized_name, row.id]));
  const cropIds = new Map(cropRows.map((row) => [row.normalized_name, row.id]));
  const statements: SqlStatement[] = [];
  const statementKinds: Array<
    keyof ImportResult["inserted"]
    | "expenseEnrichmentProvenance"
    | "expenseCanonicalIdentity"
    | "expenseCanonicalIdentityAndProvenance"
    | "guard"
  > = [];
  const inserted = { categories: 0, crops: 0, expenses: 0, plantation: 0, harvests: 0 };
  const backfilled = { expenseEnrichmentProvenance: 0 };
  const migrated = { expenseCanonicalIdentities: 0 };

  for (const category of plan.categories) {
    if (categoryIds.has(category.normalizedName)) continue;
    statements.push({
      sql: "INSERT INTO expense_categories (id, name, normalized_name) VALUES (?, ?, ?) ON CONFLICT(normalized_name) DO NOTHING",
      params: [category.id, category.name, category.normalizedName],
    });
    statementKinds.push("categories");
    categoryIds.set(category.normalizedName, category.id);
  }

  const uniqueCrops = new Map<string, { id: string; name: string }>();
  for (const plantation of plan.plantation) uniqueCrops.set(plantation.cropName.toLocaleLowerCase("en-IN"), { id: plantation.cropId, name: plantation.cropName });
  if (plan.harvests.length) {
    const banana = plan.harvests[0];
    uniqueCrops.set("banana", { id: banana.cropId, name: "Banana" });
  }
  for (const [normalized, crop] of [...uniqueCrops.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (cropIds.has(normalized)) continue;
    statements.push({ sql: "INSERT INTO crops (id, name, normalized_name) VALUES (?, ?, ?) ON CONFLICT(normalized_name) DO NOTHING", params: [crop.id, crop.name, normalized] });
    statementKinds.push("crops");
    cropIds.set(normalized, crop.id);
  }

  const now = new Date().toISOString();
  for (const expense of plan.expenses) {
    const categoryId = categoryIds.get(expense.categoryName.toLocaleLowerCase("en-IN"));
    if (!categoryId) throw new Error("Import plan category dependency is missing");
    const fixBaseIdentity = fixBaseExpenseIdentity(expense);
    const canonicalExisting = existingExpenses.get(expense.importFingerprint);
    const fixBaseExisting = existingExpenses.get(fixBaseIdentity.fingerprint);
    if (canonicalExisting && fixBaseExisting && canonicalExisting.id !== fixBaseExisting.id) {
      throw new Error(`Existing database has conflicting imported expense identities for source row ${expense.sourceRow}`);
    }
    const existing = canonicalExisting ?? fixBaseExisting;
    if (existing) {
      const existingIdentity = canonicalExisting
        ? { id: expense.id, fingerprint: expense.importFingerprint }
        : fixBaseIdentity;
      const expected = {
        id: existingIdentity.id,
        categoryId,
        fingerprint: existingIdentity.fingerprint,
        enrichmentSourceJson: existing.enrichment_source_json,
      };
      if (!expenseMatchesPlan(existing, expense, expected)) {
        throw new Error(`Existing imported expense ${existingIdentity.fingerprint} does not match the workbook projection`);
      }
      const enrichmentSource = expense.enrichmentSource ? JSON.stringify(expense.enrichmentSource) : null;
      const needsProvenance = existing.enrichment_source_json !== enrichmentSource;
      if (needsProvenance && (existing.enrichment_source_json !== null || enrichmentSource === null)) {
        throw new Error(`Existing imported expense ${existingIdentity.fingerprint} has conflicting enrichment provenance`);
      }
      if (fixBaseExisting && !canonicalExisting) {
        const before = expenseStatePredicate(expense, expected);
        statements.push({
          sql: `UPDATE expenses
            SET id = ?, import_fingerprint = ?, enrichment_source_json = ?, updated_at = ?
            WHERE ${before.sql}`,
          params: [expense.id, expense.importFingerprint, enrichmentSource, now, ...before.params],
        });
        statementKinds.push(needsProvenance ? "expenseCanonicalIdentityAndProvenance" : "expenseCanonicalIdentity");
        statements.push(expenseStateGuard(expense, {
          id: expense.id,
          categoryId,
          fingerprint: expense.importFingerprint,
          enrichmentSourceJson: enrichmentSource,
        }));
        statementKinds.push("guard");
      } else if (needsProvenance) {
        const before = expenseStatePredicate(expense, { ...expected, enrichmentSourceJson: null });
        statements.push({ sql: `UPDATE expenses SET enrichment_source_json = ?, updated_at = ? WHERE ${before.sql}`, params: [enrichmentSource, now, ...before.params] });
        statementKinds.push("expenseEnrichmentProvenance");
        statements.push(expenseStateGuard(expense, { ...expected, enrichmentSourceJson: enrichmentSource }));
        statementKinds.push("guard");
      }
      continue;
    }
    statements.push({
      sql: `INSERT INTO expenses (
        id, expense_date, description, amount_paise, paid_by_person_id, category_id,
        expense_class, paid_to, notes, crop_id, is_shared, source, source_sheet,
        source_row, import_fingerprint, enrichment_source_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, 1, 'EXCEL', ?, ?, ?, ?, ?)
      ON CONFLICT(import_fingerprint) WHERE import_fingerprint IS NOT NULL DO NOTHING`,
      params: [expense.id, expense.expenseDate, expense.description, expense.amountPaise, expense.paidByPersonId, categoryId, expense.paidTo, expense.notes, expense.sourceSheet, expense.sourceRow, expense.importFingerprint, expense.enrichmentSource ? JSON.stringify(expense.enrichmentSource) : null, now],
    });
    statementKinds.push("expenses");
  }
  for (const plantation of plan.plantation) {
    if (existingPlantation.has(plantation.importFingerprint)) continue;
    const cropId = cropIds.get(plantation.cropName.toLocaleLowerCase("en-IN"));
    if (!cropId) throw new Error("Import plan crop dependency is missing");
    statements.push({
      sql: `INSERT INTO plantation_inventory (
        id, crop_id, farm_area_id, quantity, planting_date, notes, source,
        source_sheet, source_row, import_fingerprint, updated_at
      ) VALUES (?, ?, ?, ?, NULL, ?, 'EXCEL', ?, ?, ?, ?)
      ON CONFLICT(import_fingerprint) WHERE import_fingerprint IS NOT NULL DO NOTHING`,
      params: [plantation.id, cropId, plantation.farmAreaId, plantation.quantity, sourceNotes(plantation.sources), plantation.sourceSheet, plantation.sourceRow, plantation.importFingerprint, now],
    });
    statementKinds.push("plantation");
  }
  for (const harvest of plan.harvests) {
    if (existingHarvests.has(harvest.importFingerprint)) continue;
    const cropId = cropIds.get("banana");
    if (!cropId) throw new Error("Banana crop dependency is missing");
    statements.push({
      sql: `INSERT INTO harvests (
        id, crop_id, harvest_date, quantity, gross_weight_kg, net_weight_kg,
        average_weight_kg, sale_price_paise_per_kg, calculated_revenue_paise,
        actual_revenue_paise, revenue_override_reason, buyer, notes, source,
        source_sheet, source_row, import_fingerprint, updated_at
      ) VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, 'EXCEL', ?, ?, ?, ?)
      ON CONFLICT(import_fingerprint) WHERE import_fingerprint IS NOT NULL DO NOTHING`,
      params: [harvest.id, cropId, harvest.quantity, harvest.grossWeightKg, harvest.netWeightKg, harvest.salePricePaisePerKg, harvest.calculatedRevenuePaise, harvest.actualRevenuePaise, `Cached formula: ${harvest.formulaCache?.formula ?? "unavailable"}`, harvest.sourceSheet, harvest.sourceRow, harvest.importFingerprint, now],
    });
    statementKinds.push("harvests");
  }

  const changes = await database.batch(statements);
  changes.forEach((count, index) => {
    const kind = statementKinds[index];
    if (kind === "expenseEnrichmentProvenance") backfilled.expenseEnrichmentProvenance += count;
    else if (kind === "expenseCanonicalIdentity" || kind === "expenseCanonicalIdentityAndProvenance") {
      migrated.expenseCanonicalIdentities += count;
      if (kind === "expenseCanonicalIdentityAndProvenance") backfilled.expenseEnrichmentProvenance += count;
    }
    else if (kind !== "guard") inserted[kind] += count;
  });
  const duplicates = plan.duplicates + plan.expenses.length + plan.plantation.length + plan.harvests.length
    - inserted.expenses - inserted.plantation - inserted.harvests;
  return { inserted, backfilled, migrated, duplicates };
}

async function validateIssueReportPath(errorsPath: string, sourcePath: string, persistTo?: string): Promise<string> {
  if (path.extname(errorsPath).toLocaleLowerCase("en-IN") !== ".json") throw new Error("--errors must use a .json destination");
  const target = await canonicalizePotentialPath(errorsPath);
  const source = await canonicalizePotentialPath(sourcePath);
  const repo = await fs.realpath(process.cwd());
  const canonicalWorkbook = await canonicalizePotentialPath(path.join(repo, "data", CANONICAL_WORKBOOK_NAME));
  if (target === source || await sameFile(target, source)) throw new Error("The issue report cannot overwrite the source workbook");
  if (target === canonicalWorkbook || await sameFile(target, canonicalWorkbook)) throw new Error("The issue report cannot overwrite the canonical workbook");
  try {
    if ((await fs.stat(target)).isFile() && await workbookChecksum(target) === CANONICAL_WORKBOOK_SHA256) {
      throw new Error("The issue report cannot overwrite a canonical workbook copy");
    }
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  if (path.extname(target).toLocaleLowerCase("en-IN") !== ".json") throw new Error("The resolved --errors destination must use a .json file");
  if (isWithin(repo, target)) throw new Error("The issue report cannot overwrite repository files or directories");
  if (persistTo) {
    const persistence = await canonicalizePotentialPath(persistTo);
    if (isWithin(persistence, target) || isWithin(target, persistence)) throw new Error("The issue report cannot overlap the persistence directory");
  }
  try {
    const existing = JSON.parse(await fs.readFile(target, "utf8")) as { kind?: string };
    if (existing.kind !== REPORT_KIND) throw new Error("The issue report destination contains an unrelated file");
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  return target;
}

async function writeIssueReport(plan: ImportPlan, errorsPath: string): Promise<void> {
  await atomicJsonWrite(errorsPath, {
    kind: REPORT_KIND,
    version: 1,
    source: { file: plan.sourceFile, sha256: plan.sourceChecksum, approved: plan.approvedSource },
    counts: { warnings: plan.warnings.length, errors: plan.errors.length },
    provenance: {
      expenses: plan.expenses.map((expense) => ({
        source: { sheet: expense.sourceSheet, row: expense.sourceRow },
        enrichment: expense.enrichmentSource,
        fingerprint: expense.importFingerprint,
      })),
      plantation: plan.plantation.map((record) => ({ sources: record.sources, fingerprint: record.importFingerprint })),
      harvests: plan.harvests.map((record) => ({
        source: { sheet: record.sourceSheet, row: record.sourceRow },
        formulaCache: record.formulaCache,
        fingerprint: record.importFingerprint,
      })),
    },
    changes: plan.changes,
    warnings: plan.warnings,
    errors: plan.errors,
  });
}

export async function importWorkbook(options: { workbookPath: string; dryRun: boolean; localDb?: string; errorsPath: string; allowUnapprovedSource?: boolean }): Promise<ImportResult> {
  const source = await validateWorkbookPath(options.workbookPath, { allowUnapprovedSource: options.allowUnapprovedSource });
  const errorsPath = await validateIssueReportPath(options.errorsPath, source.absolutePath, options.localDb);
  if (options.localDb) await prepareLocalPersistenceDirectory(options.localDb, [source.absolutePath, errorsPath]);
  const plan = normalizeWorkbookSource(source);
  await writeIssueReport(plan, errorsPath);
  const accepted = { expenses: plan.expenses.length, plantation: plan.plantation.length, harvests: plan.harvests.length };
  if (options.dryRun) {
    return {
      dryRun: true,
      inserted: { categories: 0, crops: 0, expenses: 0, plantation: 0, harvests: 0 },
      backfilled: { expenseEnrichmentProvenance: 0 },
      migrated: { expenseCanonicalIdentities: 0 },
      duplicates: plan.duplicates,
      accepted,
      skipped: plan.skipped,
      discovered: plan.discovered,
      normalized: plan.changes.length,
      warnings: plan.warnings.length,
      errors: plan.errors.length,
      sourceFile: plan.sourceFile,
      sourceChecksum: plan.sourceChecksum,
      approvedSource: plan.approvedSource,
    };
  }
  if (!options.localDb) throw new Error("An explicit local D1 persistence directory is required");
  if (plan.errors.length) throw new Error("Workbook contains import errors; no database writes were attempted");
  const database = await LocalD1Database.open(options.localDb);
  try {
    const applied = await applyImportPlan(database, plan);
    return {
      dryRun: false,
      ...applied,
      accepted,
      skipped: plan.skipped,
      discovered: plan.discovered,
      normalized: plan.changes.length,
      warnings: plan.warnings.length,
      errors: plan.errors.length,
      sourceFile: plan.sourceFile,
      sourceChecksum: plan.sourceChecksum,
      approvedSource: plan.approvedSource,
    };
  } finally {
    await database.dispose();
  }
}

export async function importMain(args: string[]): Promise<number> {
  try {
    const options = parseImportArguments(args);
    const result = await importWorkbook(options);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Excel import failed");
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await importMain(process.argv.slice(2));
}
