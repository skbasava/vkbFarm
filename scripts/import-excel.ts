import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { normalizeWorkbook } from "./normalize-excel";
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
        await env.DB.batch(statements);
        return Response.json({ ok: true });
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
};

export type ImportResult = {
  dryRun: boolean;
  inserted: { categories: number; crops: number; expenses: number; plantation: number; harvests: number };
  duplicates: number;
  accepted: { expenses: number; plantation: number; harvests: number };
  skipped: number;
  discovered: Record<string, number>;
  normalized: number;
  warnings: number;
  errors: number;
  sourceFile: string;
  sourceChecksum: string;
};

function safeLocalPath(input: string): string {
  const resolved = path.resolve(input);
  const unsafe = new Set([path.parse(resolved).root, os.homedir(), process.cwd()]);
  if (unsafe.has(resolved)) throw new Error("The local database target is unsafe; choose a dedicated persistence directory");
  return resolved;
}

export function parseImportArguments(args: string[]): ImportArguments {
  let workbookPath: string | undefined;
  let localDb: string | undefined;
  let errorsPath = path.resolve("migration-errors.json");
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") dryRun = true;
    else if (argument === "--local-db") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("--local-db requires a dedicated local persistence directory");
      localDb = safeLocalPath(value);
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
  return { workbookPath, dryRun, ...(localDb ? { localDb } : {}), errorsPath };
}

export class LocalD1Database implements ImportDatabase {
  private constructor(public readonly persistTo: string, private readonly miniflare: Miniflare) {}

  static async open(persistTo: string): Promise<LocalD1Database> {
    const resolved = safeLocalPath(persistTo);
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

  async batch(statements: SqlStatement[]): Promise<void> {
    if (!statements.length) return;
    await this.request({ operation: "batch", statements }, "batch");
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

function sourceNotes(sources: ImportPlan["plantation"][number]["sources"]): string {
  return `Imported aggregate from ${sources.map((source) => `${source.sheet}!${source.column}${source.row}`).join(", ")}`;
}

export async function applyImportPlan(database: ImportDatabase, plan: ImportPlan): Promise<Pick<ImportResult, "inserted" | "duplicates">> {
  const [expenseRows, plantationRows, harvestRows, categoryRows, cropRows] = await Promise.all([
    database.query<{ import_fingerprint: unknown }>("SELECT import_fingerprint FROM expenses WHERE import_fingerprint IS NOT NULL"),
    database.query<{ import_fingerprint: unknown }>("SELECT import_fingerprint FROM plantation_inventory WHERE import_fingerprint IS NOT NULL"),
    database.query<{ import_fingerprint: unknown }>("SELECT import_fingerprint FROM harvests WHERE import_fingerprint IS NOT NULL"),
    database.query<{ id: string; normalized_name: string }>("SELECT id, normalized_name FROM expense_categories"),
    database.query<{ id: string; normalized_name: string }>("SELECT id, normalized_name FROM crops"),
  ]);
  const existingExpenses = existingFingerprints(expenseRows);
  const existingPlantation = existingFingerprints(plantationRows);
  const existingHarvests = existingFingerprints(harvestRows);
  const categoryIds = new Map(categoryRows.map((row) => [row.normalized_name, row.id]));
  const cropIds = new Map(cropRows.map((row) => [row.normalized_name, row.id]));
  const statements: SqlStatement[] = [];
  const inserted = { categories: 0, crops: 0, expenses: 0, plantation: 0, harvests: 0 };

  for (const category of plan.categories) {
    if (categoryIds.has(category.normalizedName)) continue;
    statements.push({
      sql: "INSERT INTO expense_categories (id, name, normalized_name) VALUES (?, ?, ?)",
      params: [category.id, category.name, category.normalizedName],
    });
    categoryIds.set(category.normalizedName, category.id);
    inserted.categories += 1;
  }

  const uniqueCrops = new Map<string, { id: string; name: string }>();
  for (const plantation of plan.plantation) uniqueCrops.set(plantation.cropName.toLocaleLowerCase("en-IN"), { id: plantation.cropId, name: plantation.cropName });
  if (plan.harvests.length) {
    const banana = plan.harvests[0];
    uniqueCrops.set("banana", { id: banana.cropId, name: "Banana" });
  }
  for (const [normalized, crop] of [...uniqueCrops.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (cropIds.has(normalized)) continue;
    statements.push({ sql: "INSERT INTO crops (id, name, normalized_name) VALUES (?, ?, ?)", params: [crop.id, crop.name, normalized] });
    cropIds.set(normalized, crop.id);
    inserted.crops += 1;
  }

  const now = new Date().toISOString();
  for (const expense of plan.expenses) {
    if (existingExpenses.has(expense.importFingerprint)) continue;
    const categoryId = categoryIds.get(expense.categoryName.toLocaleLowerCase("en-IN"));
    if (!categoryId) throw new Error("Import plan category dependency is missing");
    statements.push({
      sql: `INSERT INTO expenses (
        id, expense_date, description, amount_paise, paid_by_person_id, category_id,
        expense_class, paid_to, notes, crop_id, is_shared, source, source_sheet,
        source_row, import_fingerprint, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, 1, 'EXCEL', ?, ?, ?, ?)`,
      params: [expense.id, expense.expenseDate, expense.description, expense.amountPaise, expense.paidByPersonId, categoryId, expense.paidTo, expense.notes, expense.sourceSheet, expense.sourceRow, expense.importFingerprint, now],
    });
    inserted.expenses += 1;
  }
  for (const plantation of plan.plantation) {
    if (existingPlantation.has(plantation.importFingerprint)) continue;
    const cropId = cropIds.get(plantation.cropName.toLocaleLowerCase("en-IN"));
    if (!cropId) throw new Error("Import plan crop dependency is missing");
    statements.push({
      sql: `INSERT INTO plantation_inventory (
        id, crop_id, farm_area_id, quantity, planting_date, notes, source,
        source_sheet, source_row, import_fingerprint, updated_at
      ) VALUES (?, ?, ?, ?, NULL, ?, 'EXCEL', ?, ?, ?, ?)`,
      params: [plantation.id, cropId, plantation.farmAreaId, plantation.quantity, sourceNotes(plantation.sources), plantation.sourceSheet, plantation.sourceRow, plantation.importFingerprint, now],
    });
    inserted.plantation += 1;
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
      ) VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, 'EXCEL', ?, ?, ?, ?)`,
      params: [harvest.id, cropId, harvest.quantity, harvest.grossWeightKg, harvest.netWeightKg, harvest.salePricePaisePerKg, harvest.calculatedRevenuePaise, harvest.actualRevenuePaise, `Cached formula: ${harvest.formulaCache?.formula ?? "unavailable"}`, harvest.sourceSheet, harvest.sourceRow, harvest.importFingerprint, now],
    });
    inserted.harvests += 1;
  }

  await database.batch(statements);
  const duplicates = plan.duplicates
    + plan.expenses.filter((row) => existingExpenses.has(row.importFingerprint)).length
    + plan.plantation.filter((row) => existingPlantation.has(row.importFingerprint)).length
    + plan.harvests.filter((row) => existingHarvests.has(row.importFingerprint)).length;
  return { inserted, duplicates };
}

async function writeIssueReport(plan: ImportPlan, errorsPath: string): Promise<void> {
  await fs.mkdir(path.dirname(errorsPath), { recursive: true });
  await fs.writeFile(errorsPath, `${JSON.stringify({
    version: 1,
    source: { file: plan.sourceFile, sha256: plan.sourceChecksum },
    counts: { warnings: plan.warnings.length, errors: plan.errors.length },
    changes: plan.changes,
    warnings: plan.warnings,
    errors: plan.errors,
  }, null, 2)}\n`, "utf8");
}

export async function importWorkbook(options: { workbookPath: string; dryRun: boolean; localDb?: string; errorsPath: string }): Promise<ImportResult> {
  const plan = await normalizeWorkbook(options.workbookPath);
  await writeIssueReport(plan, options.errorsPath);
  const accepted = { expenses: plan.expenses.length, plantation: plan.plantation.length, harvests: plan.harvests.length };
  if (options.dryRun) {
    return {
      dryRun: true,
      inserted: { categories: 0, crops: 0, expenses: 0, plantation: 0, harvests: 0 },
      duplicates: plan.duplicates,
      accepted,
      skipped: plan.errors.length,
      discovered: plan.discovered,
      normalized: plan.changes.length,
      warnings: plan.warnings.length,
      errors: plan.errors.length,
      sourceFile: plan.sourceFile,
      sourceChecksum: plan.sourceChecksum,
    };
  }
  if (!options.localDb) throw new Error("An explicit local D1 persistence directory is required");
  const database = await LocalD1Database.open(options.localDb);
  try {
    const applied = await applyImportPlan(database, plan);
    return {
      dryRun: false,
      ...applied,
      accepted,
      skipped: plan.errors.length,
      discovered: plan.discovered,
      normalized: plan.changes.length,
      warnings: plan.warnings.length,
      errors: plan.errors.length,
      sourceFile: plan.sourceFile,
      sourceChecksum: plan.sourceChecksum,
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
