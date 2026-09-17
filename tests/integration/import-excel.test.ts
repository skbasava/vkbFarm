// @vitest-environment node
import fs from "node:fs/promises";
import * as nodeFs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import initialSchema from "../../migrations/0001_initial.sql?raw";
import indexes from "../../migrations/0002_indexes.sql?raw";
import referenceNormalization from "../../migrations/0003_plantation_soft_delete_and_reference_normalization.sql?raw";
import plantationCohorts from "../../migrations/0004_plantation_distinct_cohorts.sql?raw";
import importProvenance from "../../migrations/0005_import_provenance.sql?raw";
import {
  applyImportPlan,
  importWorkbook,
  LocalD1Database,
  parseImportArguments,
  prepareLocalPersistenceDirectory,
} from "../../scripts/import-excel";
import { normalizeWorkbook } from "../../scripts/normalize-excel";
import { sourceControls, verifyImport, verifyMain } from "../../scripts/verify-import";

const fixture = path.resolve("tests/fixtures/farm-import.xlsx");
const canonical = path.resolve("data/VKB-Farm-Expense-tracker.xlsx");
const databases: LocalD1Database[] = [];
const tempDirectories: string[] = [];
XLSX.set_fs(nodeFs);

async function workbookVariant(update: (workbook: XLSX.WorkBook) => void): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vkb-import-variant-"));
  tempDirectories.push(directory);
  const output = path.join(directory, "variant.xlsx");
  const workbook = XLSX.readFile(fixture, { cellFormula: true, raw: true });
  update(workbook);
  XLSX.writeFile(workbook, output);
  return output;
}

async function database(): Promise<LocalD1Database> {
  return databaseWithMigrations([initialSchema, indexes, referenceNormalization, plantationCohorts, importProvenance]);
}

async function databaseWithMigrations(migrations: string[]): Promise<LocalD1Database> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "vkb-import-test-"));
  tempDirectories.push(parent);
  const persistTo = path.join(parent, "d1");
  const db = await LocalD1Database.open(persistTo);
  databases.push(db);
  for (const migration of migrations) await db.exec(migration);
  return db;
}

afterEach(async () => {
  while (databases.length) await databases.pop()?.dispose();
  while (tempDirectories.length) await fs.rm(tempDirectories.pop()!, { recursive: true, force: true });
});

describe("Excel import", () => {
  it("requires an explicit workbook and an explicit local database for writes", () => {
    expect(() => parseImportArguments([])).toThrow("workbook path");
    expect(() => parseImportArguments([fixture])).toThrow("--local-db");
    expect(parseImportArguments([fixture, "--dry-run", "--allow-unapproved-source"])).toMatchObject({ workbookPath: fixture, dryRun: true, allowUnapprovedSource: true });
    expect(() => parseImportArguments([fixture, "--local-db", "/"])).toThrow("unsafe");
    expect(() => parseImportArguments([fixture, "--remote"])).toThrow("Unknown option");
  });

  it("performs a dry run without opening or mutating D1", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vkb-dry-run-"));
    tempDirectories.push(directory);
    const errorsPath = path.join(directory, "errors.json");
    const result = await importWorkbook({ workbookPath: fixture, dryRun: true, errorsPath, allowUnapprovedSource: true });
    expect(result).toMatchObject({ dryRun: true, inserted: { expenses: 0, plantation: 0, harvests: 0 }, skipped: 2, duplicates: 0 });
    expect(JSON.parse(await fs.readFile(errorsPath, "utf8"))).toMatchObject({
      version: 1,
      provenance: {
        expenses: expect.arrayContaining([expect.objectContaining({
          source: { sheet: "Common Expense", row: 4 },
          enrichment: { sheet: "Mah-Expense-Log", row: 3, cells: ["A3", "E3", "F3", "G3"] },
        })]),
      },
      changes: expect.any(Array),
      warnings: expect.any(Array),
      errors: expect.any(Array),
    });
    expect((await fs.readdir(directory)).filter((entry) => entry.endsWith(".tmp"))).toEqual([]);
  });

  it("reports a one-paise harvest formula-cache mismatch truthfully in dry-run mode", async () => {
    const mismatched = await workbookVariant((workbook) => {
      workbook.Sheets["Banana Harvest Details"].F2.v = 500.01;
      workbook.Sheets["Banana Harvest Details"].F5.v = 950.01;
    });
    const errorsPath = path.join(path.dirname(mismatched), "errors.json");
    const result = await importWorkbook({ workbookPath: mismatched, dryRun: true, errorsPath, allowUnapprovedSource: true });
    expect(result).toMatchObject({ accepted: { harvests: 2 }, skipped: 3, errors: 3 });
    const report = JSON.parse(await fs.readFile(errorsPath, "utf8")) as { errors: Array<{ code: string; row: number }> };
    expect(report.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "FORMULA_CACHE_MISMATCH", row: 2 })]));
    expect(() => sourceControls(XLSX.readFile(mismatched, { cellFormula: true, raw: true }))).toThrow("FORMULA_CACHE_MISMATCH");
  });

  it("imports atomically in dependency order and the exact second run is a no-op", async () => {
    const db = await database();
    const plan = await normalizeWorkbook(fixture, { allowUnapprovedSource: true });

    const first = await applyImportPlan(db, plan);
    const beforeSecond = await db.query<{ expense_count: number; expense_total: number; plantation_count: number; plantation_total: number; harvest_count: number; harvest_total: number }>(`
      SELECT
        (SELECT COUNT(*) FROM expenses) expense_count,
        (SELECT SUM(amount_paise) FROM expenses) expense_total,
        (SELECT COUNT(*) FROM plantation_inventory) plantation_count,
        (SELECT SUM(quantity) FROM plantation_inventory) plantation_total,
        (SELECT COUNT(*) FROM harvests) harvest_count,
        (SELECT SUM(actual_revenue_paise) FROM harvests) harvest_total`);
    const second = await applyImportPlan(db, plan);
    const afterSecond = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM expenses) expense_count,
        (SELECT SUM(amount_paise) FROM expenses) expense_total,
        (SELECT COUNT(*) FROM plantation_inventory) plantation_count,
        (SELECT SUM(quantity) FROM plantation_inventory) plantation_total,
        (SELECT COUNT(*) FROM harvests) harvest_count,
        (SELECT SUM(actual_revenue_paise) FROM harvests) harvest_total`);

    expect(first).toMatchObject({ inserted: { categories: 1, crops: 3, expenses: 2, plantation: 5, harvests: 3 }, duplicates: 0 });
    expect(beforeSecond[0]).toEqual({ expense_count: 2, expense_total: 17_500, plantation_count: 5, plantation_total: 22, harvest_count: 3, harvest_total: 95_000 });
    expect(second).toMatchObject({ inserted: { categories: 0, crops: 0, expenses: 0, plantation: 0, harvests: 0 }, duplicates: 10 });
    expect(afterSecond).toEqual(beforeSecond);
  });

  it("rolls back reference inserts when a dependent business write fails", async () => {
    const db = await database();
    const plan = await normalizeWorkbook(fixture, { allowUnapprovedSource: true });
    const invalid = structuredClone(plan);
    invalid.categories.push({ id: "category_rollback_probe", name: "Rollback Probe", normalizedName: "rollback probe" });
    invalid.expenses[0].paidByPersonId = "person_missing";

    await expect(applyImportPlan(db, invalid)).rejects.toThrow("Local D1 batch failed");
    expect(await db.query("SELECT name FROM expense_categories ORDER BY name")).toEqual([{ name: "Uncategorized" }]);
    expect(await db.query("SELECT COUNT(*) count FROM expenses")).toEqual([{ count: 0 }]);
  });

  it("returns exit 1 when independently derived source controls do not match D1", async () => {
    const db = await database();
    await applyImportPlan(db, await normalizeWorkbook(fixture, { allowUnapprovedSource: true }));
    const initialVerification = await verifyImport(db, fixture, { allowUnapprovedSource: true });
    expect(initialVerification).toMatchObject({ ok: true, approvedSource: false });

    await db.batch([{ sql: "UPDATE expenses SET description = ? WHERE source_row = ?", params: ["Tampered without changing totals", 4] }]);
    const mismatch = await verifyImport(db, fixture, { allowUnapprovedSource: true });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "expense exact projection", ok: false }),
      expect.objectContaining({ name: "control expenseCount", ok: true }),
      expect.objectContaining({ name: "control expenseTotalPaise", ok: true }),
    ]));
    expect(await verifyMain([fixture, "--local-db", db.persistTo, "--allow-unapproved-source"], db)).toBe(1);
  });

  it("detects tampering of imported expense policy fields", async () => {
    const db = await database();
    await applyImportPlan(db, await normalizeWorkbook(fixture, { allowUnapprovedSource: true }));
    const [otherCrop] = await db.query<{ id: string }>("SELECT id FROM crops WHERE normalized_name <> 'banana' ORDER BY id LIMIT 1");
    const mutations = [
      { sql: "UPDATE expenses SET is_shared = 0 WHERE source_row = 4", reset: "UPDATE expenses SET is_shared = 1 WHERE source_row = 4" },
      { sql: "UPDATE expenses SET expense_class = 'CAPEX' WHERE source_row = 4", reset: "UPDATE expenses SET expense_class = NULL WHERE source_row = 4" },
      { sql: "UPDATE expenses SET crop_id = ? WHERE source_row = 4", params: [otherCrop.id], reset: "UPDATE expenses SET crop_id = NULL WHERE source_row = 4" },
    ];

    for (const mutation of mutations) {
      await db.batch([{ sql: mutation.sql, params: mutation.params }]);
      const result = await verifyImport(db, fixture, { allowUnapprovedSource: true });
      expect(result.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "expense exact projection", ok: false })]));
      await db.batch([{ sql: mutation.reset }]);
    }
  });

  it("detects tampering of the imported plantation date policy", async () => {
    const db = await database();
    await applyImportPlan(db, await normalizeWorkbook(fixture, { allowUnapprovedSource: true }));
    await db.batch([{ sql: "UPDATE plantation_inventory SET planting_date = '2024-01-01' WHERE source_row = 2" }]);

    const result = await verifyImport(db, fixture, { allowUnapprovedSource: true });
    expect(result.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "plantation exact projection", ok: false })]));
  });

  it("detects tampering of every imported harvest policy field", async () => {
    const db = await database();
    await applyImportPlan(db, await normalizeWorkbook(fixture, { allowUnapprovedSource: true }));
    const [otherCrop] = await db.query<{ id: string }>("SELECT id FROM crops WHERE normalized_name <> 'banana' ORDER BY id LIMIT 1");
    const mutations = [
      { sql: "UPDATE harvests SET crop_id = ? WHERE source_row = 2", params: [otherCrop.id], reset: "UPDATE harvests SET crop_id = (SELECT id FROM crops WHERE normalized_name = 'banana') WHERE source_row = 2" },
      { sql: "UPDATE harvests SET harvest_date = '2024-01-01' WHERE source_row = 2", reset: "UPDATE harvests SET harvest_date = NULL WHERE source_row = 2" },
      { sql: "UPDATE harvests SET average_weight_kg = 1 WHERE source_row = 2", reset: "UPDATE harvests SET average_weight_kg = NULL WHERE source_row = 2" },
      { sql: "UPDATE harvests SET revenue_override_reason = 'tampered' WHERE source_row = 2", reset: "UPDATE harvests SET revenue_override_reason = NULL WHERE source_row = 2" },
      { sql: "UPDATE harvests SET buyer = 'tampered' WHERE source_row = 2", reset: "UPDATE harvests SET buyer = NULL WHERE source_row = 2" },
    ];

    for (const mutation of mutations) {
      await db.batch([{ sql: mutation.sql, params: mutation.params }]);
      const result = await verifyImport(db, fixture, { allowUnapprovedSource: true });
      expect(result.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "harvest exact projection", ok: false })]));
      await db.batch([{ sql: mutation.reset }]);
    }
  });

  it("requires checksum approval regardless of filename unless explicitly opted in", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vkb-renamed-source-"));
    tempDirectories.push(directory);
    const renamed = path.join(directory, "renamed.xlsx");
    await fs.copyFile(fixture, renamed);

    await expect(importWorkbook({ workbookPath: renamed, dryRun: true, errorsPath: path.join(directory, "errors.json") })).rejects.toThrow("approved checksum");
    await expect(verifyImport({} as never, renamed)).rejects.toThrow("approved checksum");
    await expect(importWorkbook({ workbookPath: renamed, dryRun: true, errorsPath: path.join(directory, "errors.json"), allowUnapprovedSource: true })).resolves.toMatchObject({ approvedSource: false });

    const misleading = path.join(directory, "VKB-Farm-Expense-tracker.xlsx");
    await fs.copyFile(fixture, misleading);
    await expect(normalizeWorkbook(misleading)).rejects.toThrow("approved checksum");

    const approvedRenamed = path.join(directory, "approved-renamed.xlsx");
    await fs.copyFile(canonical, approvedRenamed);
    await expect(normalizeWorkbook(approvedRenamed)).resolves.toMatchObject({ approvedSource: true, sourceChecksum: "655b77c344356bd9b201e616cf8c2766ec63495414c6673e02271471d5e8e67a" });
  });

  it("rejects unsafe report aliases before writing and preserves the workbook", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vkb-report-safety-"));
    tempDirectories.push(directory);
    const source = path.join(directory, "source.xlsx");
    const alias = path.join(directory, "source-alias.json");
    await fs.copyFile(fixture, source);
    await fs.symlink(source, alias);
    const before = await fs.readFile(source);

    await expect(importWorkbook({ workbookPath: source, dryRun: true, errorsPath: alias, allowUnapprovedSource: true })).rejects.toThrow("source workbook");
    expect(await fs.readFile(source)).toEqual(before);
    await expect(importWorkbook({ workbookPath: source, dryRun: true, errorsPath: source, allowUnapprovedSource: true })).rejects.toThrow(".json");
    await expect(importWorkbook({ workbookPath: source, dryRun: true, errorsPath: path.resolve("package-lock.json"), allowUnapprovedSource: true })).rejects.toThrow("repository");

    const hardlink = path.join(directory, "source-hardlink.json");
    await fs.link(source, hardlink);
    await expect(importWorkbook({ workbookPath: source, dryRun: true, errorsPath: hardlink, allowUnapprovedSource: true })).rejects.toThrow("source workbook");
    expect(await fs.readFile(source)).toEqual(before);

    const canonicalAlias = path.join(directory, "canonical-alias.json");
    await fs.symlink(canonical, canonicalAlias);
    await expect(importWorkbook({ workbookPath: source, dryRun: true, errorsPath: canonicalAlias, allowUnapprovedSource: true })).rejects.toThrow("canonical workbook");
  });

  it("requires new or importer-owned persistence and resolves symlink destinations", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vkb-persistence-safety-"));
    tempDirectories.push(directory);
    const arbitrary = path.join(directory, "arbitrary");
    await fs.mkdir(arbitrary);
    await fs.writeFile(path.join(arbitrary, "keep.txt"), "unrelated", "utf8");
    await expect(prepareLocalPersistenceDirectory(arbitrary)).rejects.toThrow("not importer-owned");

    const empty = path.join(directory, "empty");
    await fs.mkdir(empty);
    await expect(prepareLocalPersistenceDirectory(empty)).rejects.toThrow("not importer-owned");

    const owned = path.join(directory, "owned");
    await prepareLocalPersistenceDirectory(owned);
    await expect(prepareLocalPersistenceDirectory(owned)).resolves.toBe(path.resolve(owned));

    const repoAlias = path.join(directory, "repo-link");
    await fs.symlink(path.resolve("."), repoAlias);
    await expect(prepareLocalPersistenceDirectory(repoAlias)).rejects.toThrow("repository");

    const nested = path.join(directory, "new", "nested", "owned");
    await expect(prepareLocalPersistenceDirectory(nested)).resolves.toBe(path.resolve(nested));

    const overlappingPersistence = path.join(directory, "overlap-d1");
    await expect(importWorkbook({
      workbookPath: fixture,
      dryRun: true,
      localDb: overlappingPersistence,
      errorsPath: path.join(overlappingPersistence, "errors.json"),
      allowUnapprovedSource: true,
    })).rejects.toThrow("overlap the persistence directory");
  });

  it("writes an issue report but never opens D1 when accepted source rows contain errors", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vkb-import-errors-"));
    tempDirectories.push(directory);
    const persistence = path.join(directory, "persistence");
    const errorsPath = path.join(directory, "errors.json");
    await expect(importWorkbook({ workbookPath: fixture, dryRun: false, localDb: persistence, errorsPath, allowUnapprovedSource: true })).rejects.toThrow("no database writes");
    expect(JSON.parse(await fs.readFile(errorsPath, "utf8"))).toMatchObject({ kind: "vkb-farm-migration-report", counts: { errors: 2 } });
    expect((await fs.readdir(persistence)).sort()).toEqual([".vkb-import-owned.json"]);
  });

  it("reuses existing normalized reference rows without ID collisions", async () => {
    const db = await database();
    await db.batch([{ sql: "INSERT INTO expense_categories (id, name, normalized_name) VALUES (?, ?, ?)", params: ["category_existing_food", "Food", "food"] }]);
    const plan = await normalizeWorkbook(fixture, { allowUnapprovedSource: true });
    const result = await applyImportPlan(db, plan);
    expect(result.inserted.categories).toBe(0);
    expect(await db.query("SELECT category_id FROM expenses ORDER BY source_row LIMIT 1")).toEqual([{ category_id: "category_existing_food" }]);
  });

  it("backfills provenance for a matching enriched expense imported before migration 0005", async () => {
    const db = await databaseWithMigrations([initialSchema, indexes, referenceNormalization, plantationCohorts]);
    const plan = await normalizeWorkbook(fixture, { allowUnapprovedSource: true });
    const enriched = plan.expenses[0];
    await db.batch([
      {
        sql: "INSERT INTO expense_categories (id, name, normalized_name) VALUES (?, ?, ?)",
        params: [enriched.categoryId, enriched.categoryName, enriched.categoryName.toLocaleLowerCase("en-IN")],
      },
      {
        sql: `INSERT INTO expenses (
        id, expense_date, description, amount_paise, paid_by_person_id, category_id,
        expense_class, paid_to, notes, crop_id, is_shared, source, source_sheet,
        source_row, import_fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, 1, 'EXCEL', ?, ?, ?)`,
        params: [enriched.id, enriched.expenseDate, enriched.description, enriched.amountPaise, enriched.paidByPersonId, enriched.categoryId, enriched.paidTo, enriched.notes, enriched.sourceSheet, enriched.sourceRow, enriched.importFingerprint],
      },
    ]);

    await db.exec(importProvenance);
    expect(await db.query("SELECT id, enrichment_source_json FROM expenses WHERE id = ?", [enriched.id])).toEqual([
      { id: enriched.id, enrichment_source_json: null },
    ]);
    const result = await applyImportPlan(db, plan);
    expect(result).toMatchObject({ inserted: { expenses: 1 }, duplicates: 1, backfilled: { expenseEnrichmentProvenance: 1 } });
    expect(await db.query("SELECT enrichment_source_json FROM expenses WHERE id = ?", [enriched.id])).toEqual([
      { enrichment_source_json: JSON.stringify(enriched.enrichmentSource) },
    ]);
    const verification = await verifyImport(db, fixture, { allowUnapprovedSource: true });
    expect(verification.checks.filter((check) => !check.ok)).toEqual([]);
    expect(verification.ok).toBe(true);
  });

  it("refuses provenance backfill when an existing fingerprint has mismatched business fields", async () => {
    const db = await database();
    const plan = await normalizeWorkbook(fixture, { allowUnapprovedSource: true });
    const enriched = plan.expenses[0];
    await db.batch([
      {
        sql: "INSERT INTO expense_categories (id, name, normalized_name) VALUES (?, ?, ?)",
        params: [enriched.categoryId, enriched.categoryName, enriched.categoryName.toLocaleLowerCase("en-IN")],
      },
      {
        sql: `INSERT INTO expenses (
          id, expense_date, description, amount_paise, paid_by_person_id, category_id,
          expense_class, paid_to, notes, crop_id, is_shared, source, source_sheet,
          source_row, import_fingerprint, enrichment_source_json
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, 1, 'EXCEL', ?, ?, ?, NULL)`,
        params: [enriched.id, enriched.expenseDate, "Tampered legacy description", enriched.amountPaise, enriched.paidByPersonId, enriched.categoryId, enriched.paidTo, enriched.notes, enriched.sourceSheet, enriched.sourceRow, enriched.importFingerprint],
      },
    ]);

    await expect(applyImportPlan(db, plan)).rejects.toThrow("does not match the workbook projection");
    expect(await db.query("SELECT COUNT(*) count FROM plantation_inventory")).toEqual([{ count: 0 }]);
  });

  it("handles simultaneous identical imports with database-safe duplicate counts", async () => {
    const db = await database();
    const plan = await normalizeWorkbook(fixture, { allowUnapprovedSource: true });
    const results = await Promise.all([applyImportPlan(db, plan), applyImportPlan(db, plan)]);

    expect(results.map((result) => result.inserted.expenses).sort((a, b) => a - b)).toEqual([0, 2]);
    expect(results.map((result) => result.duplicates).sort((a, b) => a - b)).toEqual([0, 10]);
    expect(await db.query("SELECT COUNT(*) count FROM expenses")).toEqual([{ count: 2 }]);
  });

  it("imports and exactly verifies the real approved workbook, then reports 437 duplicates", async () => {
    const db = await database();
    const plan = await normalizeWorkbook(canonical);
    const first = await applyImportPlan(db, plan);
    const verification = await verifyImport(db, canonical);
    const second = await applyImportPlan(db, plan);

    expect(plan).toMatchObject({ approvedSource: true, discovered: { expenses: 394, plantationContributions: 43, harvests: 3 } });
    expect(first.inserted).toMatchObject({ expenses: 394, plantation: 40, harvests: 3 });
    expect(verification).toMatchObject({ ok: true, approvedSource: true });
    expect(second).toMatchObject({ inserted: { expenses: 0, plantation: 0, harvests: 0 }, duplicates: 437 });
  });
});
