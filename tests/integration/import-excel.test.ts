// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import initialSchema from "../../migrations/0001_initial.sql?raw";
import indexes from "../../migrations/0002_indexes.sql?raw";
import referenceNormalization from "../../migrations/0003_plantation_soft_delete_and_reference_normalization.sql?raw";
import plantationCohorts from "../../migrations/0004_plantation_distinct_cohorts.sql?raw";
import {
  applyImportPlan,
  importWorkbook,
  LocalD1Database,
  parseImportArguments,
} from "../../scripts/import-excel";
import { normalizeWorkbook } from "../../scripts/normalize-excel";
import { verifyImport, verifyMain } from "../../scripts/verify-import";

const fixture = path.resolve("tests/fixtures/farm-import.xlsx");
const databases: LocalD1Database[] = [];
const tempDirectories: string[] = [];

async function database(): Promise<LocalD1Database> {
  const persistTo = await fs.mkdtemp(path.join(os.tmpdir(), "vkb-import-test-"));
  tempDirectories.push(persistTo);
  const db = await LocalD1Database.open(persistTo);
  databases.push(db);
  for (const migration of [initialSchema, indexes, referenceNormalization, plantationCohorts]) await db.exec(migration);
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
    expect(parseImportArguments([fixture, "--dry-run"])).toMatchObject({ workbookPath: fixture, dryRun: true });
    expect(() => parseImportArguments([fixture, "--local-db", "/"])).toThrow("unsafe");
    expect(() => parseImportArguments([fixture, "--remote"])).toThrow("Unknown option");
  });

  it("performs a dry run without opening or mutating D1", async () => {
    const errorsPath = path.join(os.tmpdir(), "vkb-dry-run-errors.json");
    const result = await importWorkbook({ workbookPath: fixture, dryRun: true, errorsPath });
    expect(result).toMatchObject({ dryRun: true, inserted: { expenses: 0, plantation: 0, harvests: 0 }, skipped: 2, duplicates: 0 });
    expect(JSON.parse(await fs.readFile(errorsPath, "utf8"))).toMatchObject({
      version: 1,
      changes: expect.any(Array),
      warnings: expect.any(Array),
      errors: expect.any(Array),
    });
  });

  it("imports atomically in dependency order and the exact second run is a no-op", async () => {
    const db = await database();
    const plan = await normalizeWorkbook(fixture);

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
    const plan = await normalizeWorkbook(fixture);
    const invalid = structuredClone(plan);
    invalid.categories.push({ id: "category_rollback_probe", name: "Rollback Probe", normalizedName: "rollback probe" });
    invalid.expenses[0].paidByPersonId = "person_missing";

    await expect(applyImportPlan(db, invalid)).rejects.toThrow("Local D1 batch failed");
    expect(await db.query("SELECT name FROM expense_categories ORDER BY name")).toEqual([{ name: "Uncategorized" }]);
    expect(await db.query("SELECT COUNT(*) count FROM expenses")).toEqual([{ count: 0 }]);
  });

  it("returns exit 1 when independently derived source controls do not match D1", async () => {
    const db = await database();
    await applyImportPlan(db, await normalizeWorkbook(fixture));
    expect(await verifyImport(db, fixture)).toMatchObject({ ok: true });

    await db.batch([{ sql: "DELETE FROM expenses WHERE source_row = ?", params: [4] }]);
    const mismatch = await verifyImport(db, fixture);
    expect(mismatch.ok).toBe(false);
    expect(mismatch.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "expense count", ok: false })]));
    expect(await verifyMain([fixture, "--local-db", db.persistTo], db)).toBe(1);
  });
});
