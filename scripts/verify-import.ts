import * as nodeFs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { parseLegacyDate } from "./data-normalization";
import { CANONICAL_WORKBOOK_SHA256, workbookChecksum, validateWorkbookPath } from "./normalize-excel";
import { LocalD1Database } from "./import-excel";
import type { ImportDatabase } from "./types";

XLSX.set_fs(nodeFs);

type VerificationCheck = { name: string; source: number | string; database: number | string; ok: boolean };
export type VerificationResult = { ok: boolean; sourceChecksum: string; checks: VerificationCheck[] };

function raw(sheet: XLSX.WorkSheet, row: number, column: number): unknown {
  return (sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })] as XLSX.CellObject | undefined)?.v ?? null;
}

function numeric(sheet: XLSX.WorkSheet, row: number, column: number): number | null {
  const value = raw(sheet, row, column);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function strictPayer(value: unknown): "Mahesh" | "Satish" | null {
  if (value === "Mahesh" || value === "mahesh" || value === "MAHESH") return "Mahesh";
  if (value === "Satish" || value === "satish" || value === "SATISH") return "Satish";
  return null;
}

function sourceControls(workbook: XLSX.WorkBook) {
  const expenses = workbook.Sheets["Common Expense"];
  const plantation = workbook.Sheets["Plantation Details"];
  const harvest = workbook.Sheets["Banana Harvest Details"];
  if (!expenses || !plantation || !harvest) throw new Error("Verification source sheets are missing");
  let expenseCount = 0;
  let expenseTotalPaise = 0;
  let satishPaise = 0;
  let maheshPaise = 0;
  const expenseRange = XLSX.utils.decode_range(expenses["!ref"]!);
  for (let row = 4; row <= expenseRange.e.r + 1; row += 1) {
    const date = parseLegacyDate(raw(expenses, row, 1)).value;
    const amount = numeric(expenses, row, 3);
    const payer = strictPayer(raw(expenses, row, 4));
    if (!date || amount === null || amount <= 0 || !payer) continue;
    const paise = Math.round(amount * 100);
    expenseCount += 1;
    expenseTotalPaise += paise;
    if (payer === "Satish") satishPaise += paise;
    else maheshPaise += paise;
  }

  let plantationTotal = 0;
  for (const block of [1, 5]) {
    for (let row = 2; row <= 45; row += 1) {
      const label = String(raw(plantation, row, block) ?? "").trim().toLocaleLowerCase("en-IN").replace(/\s+/g, "");
      if (!label || ["total", "sum", "grandtotal"].includes(label)) continue;
      for (const offset of [1, 2]) {
        const quantity = numeric(plantation, row, block + offset);
        if (quantity !== null && quantity > 0) plantationTotal += quantity;
      }
    }
  }

  let harvestRevenuePaise = 0;
  for (let row = 2; row <= 4; row += 1) {
    const revenue = numeric(harvest, row, 6);
    if (revenue === null || revenue < 0) throw new Error(`Harvest cached revenue is unavailable at row ${row}`);
    harvestRevenuePaise += Math.round(revenue * 100);
  }
  const harvestGrandTotal = numeric(harvest, 5, 6);
  if (harvestGrandTotal !== null && Math.round(harvestGrandTotal * 100) !== harvestRevenuePaise) throw new Error("Harvest detail does not reconcile to the workbook Grand Total cache");
  const settlementPaise = Math.abs(satishPaise - expenseTotalPaise / 2);
  return { expenseCount, expenseTotalPaise, satishPaise, maheshPaise, settlementPaise, plantationTotal, harvestRevenuePaise };
}

export async function verifyImport(database: ImportDatabase, workbookPath: string): Promise<VerificationResult> {
  const validated = await validateWorkbookPath(workbookPath);
  const workbook = XLSX.readFile(validated.absolutePath, { cellDates: false, cellFormula: true, raw: true });
  const source = sourceControls(workbook);
  const [totals] = await database.query<{
    expense_count: number;
    expense_total: number;
    satish_total: number;
    mahesh_total: number;
    plantation_total: number;
    harvest_total: number;
  }>(`SELECT
    (SELECT COUNT(*) FROM expenses WHERE source = 'EXCEL' AND source_sheet = 'Common Expense' AND deleted_at IS NULL) expense_count,
    (SELECT COALESCE(SUM(amount_paise), 0) FROM expenses WHERE source = 'EXCEL' AND source_sheet = 'Common Expense' AND deleted_at IS NULL) expense_total,
    (SELECT COALESCE(SUM(amount_paise), 0) FROM expenses WHERE source = 'EXCEL' AND source_sheet = 'Common Expense' AND paid_by_person_id = 'person_satish' AND deleted_at IS NULL) satish_total,
    (SELECT COALESCE(SUM(amount_paise), 0) FROM expenses WHERE source = 'EXCEL' AND source_sheet = 'Common Expense' AND paid_by_person_id = 'person_mahesh' AND deleted_at IS NULL) mahesh_total,
    (SELECT COALESCE(SUM(quantity), 0) FROM plantation_inventory WHERE source = 'EXCEL' AND source_sheet = 'Plantation Details' AND deleted_at IS NULL) plantation_total,
    (SELECT COALESCE(SUM(actual_revenue_paise), 0) FROM harvests WHERE source = 'EXCEL' AND source_sheet = 'Banana Harvest Details') harvest_total`);
  if (!totals) throw new Error("Local D1 verification query returned no result");
  const databaseSettlement = Math.abs(totals.satish_total - totals.expense_total / 2);
  const checks: VerificationCheck[] = [
    { name: "expense count", source: source.expenseCount, database: totals.expense_count, ok: source.expenseCount === totals.expense_count },
    { name: "expense total paise", source: source.expenseTotalPaise, database: totals.expense_total, ok: source.expenseTotalPaise === totals.expense_total },
    { name: "Satish contribution paise", source: source.satishPaise, database: totals.satish_total, ok: source.satishPaise === totals.satish_total },
    { name: "Mahesh contribution paise", source: source.maheshPaise, database: totals.mahesh_total, ok: source.maheshPaise === totals.mahesh_total },
    { name: "settlement paise", source: source.settlementPaise, database: databaseSettlement, ok: source.settlementPaise === databaseSettlement },
    { name: "plantation total", source: source.plantationTotal, database: totals.plantation_total, ok: source.plantationTotal === totals.plantation_total },
    { name: "harvest revenue paise", source: source.harvestRevenuePaise, database: totals.harvest_total, ok: source.harvestRevenuePaise === totals.harvest_total },
  ];
  if (validated.checksum === CANONICAL_WORKBOOK_SHA256) {
    const approved = {
      expenseCount: 394,
      expenseTotalPaise: 297_619_700,
      satishPaise: 149_301_700,
      maheshPaise: 148_318_000,
      settlementPaise: 491_850,
      plantationTotal: 2_740,
      harvestRevenuePaise: 1_008_500,
    };
    for (const [name, expected] of Object.entries(approved)) {
      const actual = source[name as keyof typeof source];
      checks.push({ name: `approved source ${name}`, source: expected, database: actual, ok: expected === actual });
    }
  }
  return { ok: checks.every((check) => check.ok), sourceChecksum: validated.checksum, checks };
}

function parseVerifyArguments(args: string[]): { workbookPath: string; localDb: string } {
  let workbookPath: string | undefined;
  let localDb: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--local-db") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("--local-db requires a local persistence directory");
      localDb = path.resolve(value);
    } else if (argument.startsWith("--")) throw new Error(`Unknown option: ${argument}`);
    else if (workbookPath) throw new Error("Only one workbook path may be supplied");
    else workbookPath = path.resolve(argument);
  }
  if (!workbookPath) throw new Error("An explicit workbook path is required");
  if (!localDb) throw new Error("--local-db is required; remote D1 is never supported");
  return { workbookPath, localDb };
}

export async function verifyMain(args: string[], injectedDatabase?: ImportDatabase): Promise<number> {
  let database: LocalD1Database | undefined;
  try {
    const options = parseVerifyArguments(args);
    const selected = injectedDatabase ?? (database = await LocalD1Database.open(options.localDb));
    const result = await verifyImport(selected, options.workbookPath);
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Import verification failed");
    return 1;
  } finally {
    await database?.dispose();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await verifyMain(process.argv.slice(2));
}

export { sourceControls, workbookChecksum };
