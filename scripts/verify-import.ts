import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { LocalD1Database } from "./import-excel";
import { CANONICAL_WORKBOOK_SHA256, validateWorkbookPath, workbookChecksum } from "./source-policy";
import type { EnrichmentSource, ImportDatabase, SourceCell } from "./types";

XLSX.set_fs(nodeFs);

type VerificationCheck = { name: string; source: number | string; database: number | string; ok: boolean };
export type VerificationResult = { ok: boolean; approvedSource: boolean; sourceChecksum: string; checks: VerificationCheck[] };
type Header = { row: number; column: number };

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(kind: string, value: unknown): string {
  return hash(`${kind}\n${JSON.stringify(value)}`);
}

function cell(sheet: XLSX.WorkSheet, row: number, column: number): XLSX.CellObject | undefined {
  return sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })] as XLSX.CellObject | undefined;
}

function raw(sheet: XLSX.WorkSheet, row: number, column: number): unknown {
  return cell(sheet, row, column)?.v ?? null;
}

function text(sheet: XLSX.WorkSheet, row: number, column: number): string {
  const value = raw(sheet, row, column);
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function numeric(sheet: XLSX.WorkSheet, row: number, column: number): number | null {
  const value = raw(sheet, row, column);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function usedRange(sheet: XLSX.WorkSheet): XLSX.Range {
  if (!sheet["!ref"]) throw new Error("Verification source sheet is empty");
  return XLSX.utils.decode_range(sheet["!ref"]);
}

function findHeaders(sheet: XLSX.WorkSheet, tuple: string[], label: string, expectedCount = 1): Header[] {
  const used = usedRange(sheet);
  const matches: Header[] = [];
  for (let row = used.s.r + 1; row <= used.e.r + 1; row += 1) {
    for (let column = used.s.c + 1; column <= used.e.c + 2 - tuple.length; column += 1) {
      if (tuple.every((expected, offset) => text(sheet, row, column + offset) === expected)) matches.push({ row, column });
    }
  }
  if (matches.length !== expectedCount) throw new Error(`${label} verification header tuple is ${matches.length ? "ambiguous" : "missing"}`);
  return matches;
}

function findHeaderVariant(sheet: XLSX.WorkSheet, alternatives: string[][], label: string): Header {
  const matches = alternatives.flatMap((tuple) => {
    try {
      return findHeaders(sheet, tuple, label);
    } catch (error) {
      if (error instanceof Error && error.message.includes("header tuple is missing")) return [];
      throw error;
    }
  });
  if (matches.length !== 1) throw new Error(`${label} verification header tuple is ${matches.length ? "ambiguous" : "missing"}`);
  return matches[0];
}

const MONTHS = new Map([
  ["January", 0], ["February", 1], ["March", 2], ["April", 3], ["May", 4], ["June", 5],
  ["July", 6], ["August", 7], ["September", 8], ["October", 9], ["November", 10], ["December", 11],
]);

function isoDate(year: number, month: number, day: number): string | null {
  const value = new Date(Date.UTC(year, month, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month || value.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function strictDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return isoDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  if (typeof value !== "string") return null;
  const match = /^(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})$/.exec(value);
  if (!match) return null;
  const month = MONTHS.get(match[1]);
  return month === undefined ? null : isoDate(Number(match[3]), month, Number(match[2]));
}

function moneyPaise(value: number | null): number | null {
  if (value === null || value <= 0) return null;
  const paise = Math.round(value * 100);
  return Number.isSafeInteger(paise) && Math.abs(paise / 100 - value) <= 1e-8 ? paise : null;
}

function strictPayer(value: unknown): { id: "person_mahesh" | "person_satish"; name: "Mahesh" | "Satish" } | null {
  if (value === "Mahesh" || value === "mahesh" || value === "MAHESH") return { id: "person_mahesh", name: "Mahesh" };
  if (value === "Satish" || value === "satish" || value === "SATISH") return { id: "person_satish", name: "Satish" };
  return null;
}

function categoryName(value: unknown): string {
  const input = typeof value === "string" ? value : value == null ? "" : String(value);
  if (!input.trim()) return "Uncategorized";
  return new Map([
    ["travel", "Travel"], ["travel ", "Travel"], ["Tractor emi", "Tractor EMI"],
    ["Food (teak)", "Food (Teak)"], ["travel (Teak)", "Travel (teak)"],
  ]).get(input) ?? input.trim();
}

type Detail = { date: string; amountPaise: number; payer: "Mahesh" | "Satish"; paidTo: string | null; notes: string | null; source: EnrichmentSource };

function details(workbook: XLSX.WorkBook): Detail[] {
  const result: Detail[] = [];
  for (const [sheetName, payer] of [["Sat-Expense Log", "Satish"], ["Mah-Expense-Log", "Mahesh"]] as const) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.["!ref"]) continue;
    for (let row = usedRange(sheet).s.r + 1; row <= usedRange(sheet).e.r + 1; row += 1) {
      const date = strictDate(raw(sheet, row, 1));
      const amountPaise = moneyPaise(numeric(sheet, row, 5));
      if (!date || amountPaise === null) continue;
      const paidTo = text(sheet, row, 6).trim() || null;
      const notesAt = [7, 8].map((column) => ({ column, value: text(sheet, row, column).trim() })).filter((entry) => entry.value);
      const cells = ["A", "E", ...(paidTo ? ["F"] : []), ...notesAt.map((entry) => XLSX.utils.encode_col(entry.column - 1))].map((column) => `${column}${row}`);
      result.push({ date, amountPaise, payer, paidTo, notes: notesAt.map((entry) => entry.value).join(" | ") || null, source: { sheet: sheetName, row, cells } });
    }
  }
  return result;
}

function expenseProjection(workbook: XLSX.WorkBook) {
  const sheetName = "Common Expense";
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("Verification source sheet is missing: Common Expense");
  const [{ row: headerRow, column }] = findHeaders(sheet, ["Date", "Description", "Amount", "Who Paid", "Expense Type"], sheetName);
  const enrichment = details(workbook);
  const records: Array<Record<string, string | number | null>> = [];
  for (let row = headerRow + 1; row <= usedRange(sheet).e.r + 1; row += 1) {
    const values = [0, 1, 2, 3, 4].map((offset) => raw(sheet, row, column + offset));
    if (values.every((value) => value == null || String(value).trim() === "")) continue;
    const expenseDate = strictDate(values[0]);
    const amountPaise = moneyPaise(typeof values[2] === "number" ? values[2] : null);
    const payer = strictPayer(values[3]);
    if (!expenseDate || amountPaise === null || !payer) continue;
    const description = String(values[1] ?? "").trim() || "Imported expense";
    const category = categoryName(values[4]);
    const matches = enrichment.filter((entry) => entry.date === expenseDate && entry.amountPaise === amountPaise && entry.payer === payer.name);
    const exact = matches.length === 1 ? matches[0] : null;
    const identity = { sheet: sheetName, row, date: expenseDate, description, amountPaise, payer: payer.name, categoryName: category, paidTo: exact?.paidTo ?? null, notes: exact?.notes ?? null, enrichmentSource: exact?.source ?? null };
    records.push({ expense_date: expenseDate, description, amount_paise: amountPaise, paid_by_person_id: payer.id, category_name: category, paid_to: exact?.paidTo ?? null, notes: exact?.notes ?? null, source_sheet: sheetName, source_row: row, import_fingerprint: fingerprint("expense", identity), enrichment_source_json: exact ? JSON.stringify(exact.source) : null });
  }
  return records.sort((a, b) => Number(a.source_row) - Number(b.source_row));
}

function normalizedCrop(value: string): string {
  return value === "Bannana" ? "Banana" : value.trim();
}

function plantationProjection(workbook: XLSX.WorkBook) {
  const sheetName = "Plantation Details";
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("Verification source sheet is missing: Plantation Details");
  const blocks = findHeaders(sheet, ["Name", "MT", "SK"], sheetName, 2);
  const aggregates = new Map<string, { crop: string; area: "area_mt" | "area_sk"; quantity: number; sources: SourceCell[] }>();
  for (const block of blocks) {
    const nextOverlappingHeader = blocks
      .filter((candidate) => candidate.row > block.row && candidate.column <= block.column + 2 && block.column <= candidate.column + 2)
      .reduce((minimum, candidate) => Math.min(minimum, candidate.row), usedRange(sheet).e.r + 2);
    for (let row = block.row + 1; row < nextOverlappingHeader; row += 1) {
      const crop = normalizedCrop(text(sheet, row, block.column));
      const label = crop.toLocaleLowerCase("en-IN").replace(/\s+/g, "");
      if (!crop || ["total", "sum", "grandtotal"].includes(label)) continue;
      for (const [offset, area] of [[1, "area_mt"], [2, "area_sk"]] as const) {
        const quantity = numeric(sheet, row, block.column + offset);
        if (quantity === null || quantity <= 0 || !Number.isSafeInteger(quantity)) continue;
        const source = { sheet: sheetName, row, column: XLSX.utils.encode_col(block.column + offset - 1) };
        const key = `${crop}\u0000${area}`;
        const current = aggregates.get(key);
        if (current) { current.quantity += quantity; current.sources.push(source); }
        else aggregates.set(key, { crop, area, quantity, sources: [source] });
      }
    }
  }
  return [...aggregates.values()].map((value) => ({ crop_name: value.crop, farm_area_id: value.area, quantity: value.quantity, notes: `Imported aggregate from ${value.sources.map((source) => `${source.sheet}!${source.column}${source.row}`).join(", ")}`, source_sheet: sheetName, source_row: value.sources[0].row, import_fingerprint: fingerprint("plantation", { cropName: value.crop, farmAreaId: value.area, quantity: value.quantity, sources: value.sources }) })).sort((a, b) => a.crop_name.localeCompare(b.crop_name, "en-IN") || a.farm_area_id.localeCompare(b.farm_area_id));
}

function decimal(value: number): string {
  return value.toFixed(3).replace(/(?:\.0+|(\.\d*?)0+)$/, "$1");
}

function storedDecimal(value: unknown): string {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error("D1 returned an invalid stored decimal");
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) throw new Error("D1 returned an out-of-range stored decimal");
  return decimal(numericValue);
}

function exactRevenue(weight: string, price: number): number {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,3}))?$/.exec(weight);
  if (!match) throw new Error("Verification harvest weight is invalid");
  const scaled = BigInt(match[1]) * 1_000n + BigInt((match[2] ?? "").padEnd(3, "0"));
  return Number((scaled * BigInt(price) + 500n) / 1_000n);
}

function harvestProjection(workbook: XLSX.WorkBook) {
  const sheetName = "Banana Harvest Details";
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("Verification source sheet is missing: Banana Harvest Details");
  const { row: headerRow, column } = findHeaderVariant(sheet, [
    ["Total ಬಾಳೆಗೊನೆ harvested (1st time)", "Split of ಬಾಳೆಗೊನೆ Quantity", "Gross Weight (Kg)", "Avg. Weight (Kg)", "Sell Price per kg", "Total Price"],
    ["Total harvested", "Quantity", "Gross Weight (Kg)", "Avg. Weight (Kg)", "Sell Price per kg", "Total Price"],
  ], sheetName);
  const records: Array<Record<string, string | number | null>> = [];
  let grandTotal: number | null = null;
  for (let row = headerRow + 1; row <= usedRange(sheet).e.r + 1; row += 1) {
    if (text(sheet, row, column).trim().toLocaleLowerCase("en-IN").replace(/\s+/g, "") === "grandtotal") {
      grandTotal = numeric(sheet, row, column + 5);
      break;
    }
    const quantity = numeric(sheet, row, column + 1);
    const gross = numeric(sheet, row, column + 2);
    const net = numeric(sheet, row, column + 3);
    const price = moneyPaise(numeric(sheet, row, column + 4));
    const revenue = moneyPaise(numeric(sheet, row, column + 5));
    const formula = cell(sheet, row, column + 5)?.f?.replace(/^=/, "");
    if (quantity === null || net === null || price === null || revenue === null || !formula) continue;
    const identity = { sheet: sheetName, row, quantity, gross, net, pricePaise: price, actualPaise: revenue, formula };
    records.push({ quantity: decimal(quantity), gross_weight_kg: gross === null ? null : decimal(gross), net_weight_kg: decimal(net), sale_price_paise_per_kg: price, calculated_revenue_paise: exactRevenue(decimal(net), price), actual_revenue_paise: revenue, notes: `Cached formula: ${formula}`, source_sheet: sheetName, source_row: row, import_fingerprint: fingerprint("harvest", identity) });
  }
  if (grandTotal === null) throw new Error("Banana Harvest Details Grand Total cache is required for verification");
  if (Math.round(grandTotal * 100) !== records.reduce((sum, row) => sum + Number(row.actual_revenue_paise), 0)) throw new Error("Harvest rows do not reconcile to Grand Total");
  return records.sort((a, b) => Number(a.source_row) - Number(b.source_row));
}

function projections(workbook: XLSX.WorkBook) {
  const expenses = expenseProjection(workbook);
  const plantation = plantationProjection(workbook);
  const harvests = harvestProjection(workbook);
  const expenseTotalPaise = expenses.reduce((sum, row) => sum + Number(row.amount_paise), 0);
  const satishPaise = expenses.filter((row) => row.paid_by_person_id === "person_satish").reduce((sum, row) => sum + Number(row.amount_paise), 0);
  const maheshPaise = expenses.filter((row) => row.paid_by_person_id === "person_mahesh").reduce((sum, row) => sum + Number(row.amount_paise), 0);
  return { expenses, plantation, harvests, controls: { expenseCount: expenses.length, expenseTotalPaise, satishPaise, maheshPaise, settlementPaise: Math.abs(satishPaise - expenseTotalPaise / 2), plantationTotal: plantation.reduce((sum, row) => sum + Number(row.quantity), 0), harvestRevenuePaise: harvests.reduce((sum, row) => sum + Number(row.actual_revenue_paise), 0) } };
}

function projectionCheck(name: string, source: unknown[], database: unknown[]): VerificationCheck {
  const sourceDigest = hash(JSON.stringify(source));
  const databaseDigest = hash(JSON.stringify(database));
  return { name, source: `${source.length}:${sourceDigest}`, database: `${database.length}:${databaseDigest}`, ok: sourceDigest === databaseDigest };
}

export async function verifyImport(database: ImportDatabase, workbookPath: string, options: { allowUnapprovedSource?: boolean } = {}): Promise<VerificationResult> {
  const validated = await validateWorkbookPath(workbookPath, options);
  const workbook = XLSX.readFile(validated.absolutePath, { cellDates: false, cellFormula: true, raw: true });
  const source = projections(workbook);
  const databaseExpenses = await database.query(`SELECT e.expense_date, e.description, e.amount_paise, e.paid_by_person_id, c.name category_name, e.paid_to, e.notes, e.source_sheet, e.source_row, e.import_fingerprint, e.enrichment_source_json FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id WHERE e.source = 'EXCEL' AND e.source_sheet = 'Common Expense' AND e.deleted_at IS NULL ORDER BY e.source_row`);
  const databasePlantation = await database.query(`SELECT c.name crop_name, p.farm_area_id, p.quantity, p.notes, p.source_sheet, p.source_row, p.import_fingerprint FROM plantation_inventory p JOIN crops c ON c.id = p.crop_id WHERE p.source = 'EXCEL' AND p.source_sheet = 'Plantation Details' AND p.deleted_at IS NULL ORDER BY c.name COLLATE NOCASE, p.farm_area_id`);
  const rawDatabaseHarvests = await database.query<Record<string, unknown>>(`SELECT CAST(h.quantity AS TEXT) quantity, CASE WHEN h.gross_weight_kg IS NULL THEN NULL ELSE CAST(h.gross_weight_kg AS TEXT) END gross_weight_kg, CAST(h.net_weight_kg AS TEXT) net_weight_kg, h.sale_price_paise_per_kg, h.calculated_revenue_paise, h.actual_revenue_paise, h.notes, h.source_sheet, h.source_row, h.import_fingerprint FROM harvests h WHERE h.source = 'EXCEL' AND h.source_sheet = 'Banana Harvest Details' ORDER BY h.source_row`);
  const databaseHarvests = rawDatabaseHarvests.map((row) => ({
    ...row,
    quantity: storedDecimal(row.quantity),
    gross_weight_kg: row.gross_weight_kg === null ? null : storedDecimal(row.gross_weight_kg),
    net_weight_kg: storedDecimal(row.net_weight_kg),
  }));
  const checks: VerificationCheck[] = [projectionCheck("expense exact projection", source.expenses, databaseExpenses), projectionCheck("plantation exact projection", source.plantation, databasePlantation), projectionCheck("harvest exact projection", source.harvests, databaseHarvests)];
  const databaseControls = { expenseCount: databaseExpenses.length, expenseTotalPaise: databaseExpenses.reduce((sum, row) => sum + Number(row.amount_paise), 0), satishPaise: databaseExpenses.filter((row) => row.paid_by_person_id === "person_satish").reduce((sum, row) => sum + Number(row.amount_paise), 0), maheshPaise: databaseExpenses.filter((row) => row.paid_by_person_id === "person_mahesh").reduce((sum, row) => sum + Number(row.amount_paise), 0), settlementPaise: 0, plantationTotal: databasePlantation.reduce((sum, row) => sum + Number(row.quantity), 0), harvestRevenuePaise: rawDatabaseHarvests.reduce((sum, row) => sum + Number(row.actual_revenue_paise), 0) };
  databaseControls.settlementPaise = Math.abs(databaseControls.satishPaise - databaseControls.expenseTotalPaise / 2);
  for (const name of Object.keys(source.controls) as Array<keyof typeof source.controls>) checks.push({ name: `control ${name}`, source: source.controls[name], database: databaseControls[name], ok: source.controls[name] === databaseControls[name] });
  if (validated.approvedSource) {
    const approved = { expenseCount: 394, expenseTotalPaise: 297_619_700, satishPaise: 149_301_700, maheshPaise: 148_318_000, settlementPaise: 491_850, plantationTotal: 2_740, harvestRevenuePaise: 1_008_500 };
    for (const name of Object.keys(approved) as Array<keyof typeof approved>) checks.push({ name: `approved source ${name}`, source: approved[name], database: source.controls[name], ok: approved[name] === source.controls[name] });
  }
  return { ok: checks.every((check) => check.ok), approvedSource: validated.approvedSource, sourceChecksum: validated.checksum, checks };
}

function parseVerifyArguments(args: string[]): { workbookPath: string; localDb: string; allowUnapprovedSource: boolean } {
  let workbookPath: string | undefined;
  let localDb: string | undefined;
  let allowUnapprovedSource = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--allow-unapproved-source") allowUnapprovedSource = true;
    else if (argument === "--local-db") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("--local-db requires a local persistence directory");
      localDb = path.resolve(value);
    } else if (argument.startsWith("--")) throw new Error(`Unknown option: ${argument}`);
    else if (workbookPath) throw new Error("Only one workbook path may be supplied");
    else workbookPath = path.resolve(argument);
  }
  if (!workbookPath) throw new Error("An explicit workbook path is required");
  if (!localDb) throw new Error("--local-db is required; remote D1 is never supported");
  return { workbookPath, localDb, allowUnapprovedSource };
}

export async function verifyMain(args: string[], injectedDatabase?: ImportDatabase): Promise<number> {
  let database: LocalD1Database | undefined;
  try {
    const options = parseVerifyArguments(args);
    const selected = injectedDatabase ?? (database = await LocalD1Database.open(options.localDb));
    const result = await verifyImport(selected, options.workbookPath, { allowUnapprovedSource: options.allowUnapprovedSource });
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Import verification failed");
    return 1;
  } finally {
    await database?.dispose();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exitCode = await verifyMain(process.argv.slice(2));

export { projections as sourceControls, workbookChecksum, CANONICAL_WORKBOOK_SHA256 };
