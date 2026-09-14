import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { normalizeCategory, normalizeCrop, normalizePerson, parseLegacyDate } from "./data-normalization";
import type {
  FormulaCache,
  ImportIssue,
  ImportPlan,
  NormalizationChange,
  NormalizedCategory,
  NormalizedExpense,
  NormalizedHarvest,
  NormalizedPlantation,
  SourceCell,
} from "./types";

export const CANONICAL_WORKBOOK_NAME = "VKB-Farm-Expense-tracker.xlsx";
export const CANONICAL_WORKBOOK_SHA256 = "655b77c344356bd9b201e616cf8c2766ec63495414c6673e02271471d5e8e67a";
XLSX.set_fs(nodeFs);

type CellValue = XLSX.CellObject["v"] | XLSX.CellObject | null | undefined;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableId(prefix: string, fingerprint: string): string {
  return `${prefix}_${fingerprint.slice(0, 24)}`;
}

function fingerprint(kind: string, value: unknown): string {
  return sha256(`${kind}\n${JSON.stringify(value)}`);
}

function cell(sheet: XLSX.WorkSheet, row: number, column: number): XLSX.CellObject | undefined {
  return sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })] as XLSX.CellObject | undefined;
}

function rawValue(value: CellValue): unknown {
  if (value && typeof value === "object" && "v" in value) return value.v;
  return value ?? null;
}

function textValue(value: CellValue): string {
  const raw = rawValue(value);
  return typeof raw === "string" ? raw : raw == null ? "" : String(raw);
}

function numericValue(value: CellValue): number | null {
  const raw = rawValue(value);
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function decimalString(value: number): string {
  if (!Number.isFinite(value) || value < 0) throw new TypeError("Expected a non-negative finite number");
  return value.toFixed(3).replace(/(?:\.0+|(\.\d*?)0+)$/, "$1");
}

function calculateRevenuePaise(netWeightKg: string, salePricePaisePerKg: number): number {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,3}))?$/.exec(netWeightKg);
  if (!match || !Number.isSafeInteger(salePricePaisePerKg) || salePricePaisePerKg < 0) {
    throw new TypeError("Harvest values are outside the supported decimal range");
  }
  const scaledWeight = BigInt(match[1]) * 1_000n + BigInt((match[2] ?? "").padEnd(3, "0"));
  const revenue = (scaledWeight * BigInt(salePricePaisePerKg) + 500n) / 1_000n;
  if (revenue > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Revenue exceeds the supported range");
  return Number(revenue);
}

function moneyPaise(value: CellValue): number | null {
  const numeric = numericValue(value);
  if (numeric === null || numeric <= 0) return null;
  const scaled = Math.round(numeric * 100);
  if (!Number.isSafeInteger(scaled) || Math.abs(scaled / 100 - numeric) > 1e-8) return null;
  return scaled;
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase("en-IN");
}

function issue(
  severity: "warning" | "error",
  entity: ImportIssue["entity"],
  code: string,
  sheet: string,
  row: number,
  reason: string,
  raw: Record<string, unknown>,
): ImportIssue {
  return { code, severity, entity, sheet, row, reason, raw };
}

function addChange(changes: NormalizationChange[], sheet: string, row: number, field: string, from: unknown, to: unknown, rule: string): void {
  changes.push({ sheet, row, field, from, to, rule });
}

function sheetRange(sheet: XLSX.WorkSheet): { start: XLSX.CellAddress; end: XLSX.CellAddress } {
  if (!sheet["!ref"]) throw new Error("Workbook sheet is empty");
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  return { start: range.s, end: range.e };
}

function requireSheet(workbook: XLSX.WorkBook, name: string): XLSX.WorkSheet {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`Required sheet is missing: ${name}`);
  return sheet;
}

function findExpenseHeader(sheet: XLSX.WorkSheet): number {
  const expected = ["Date", "Description", "Amount", "Who Paid", "Expense Type"];
  const { start, end } = sheetRange(sheet);
  for (let row = start.r + 1; row <= Math.min(end.r + 1, 50); row += 1) {
    const values = expected.map((_, index) => textValue(cell(sheet, row, index + 1)).trim());
    if (values.every((value, index) => value === expected[index])) return row;
  }
  throw new Error("Common Expense A:E headers were not found");
}

type Enrichment = { date: string; amountPaise: number; payer: "Mahesh" | "Satish"; paidTo: string | null; notes: string | null };

function parseEnrichments(workbook: XLSX.WorkBook): Enrichment[] {
  const entries: Enrichment[] = [];
  for (const [sheetName, payer] of [["Sat-Expense Log", "Satish"], ["Mah-Expense-Log", "Mahesh"]] as const) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.["!ref"]) continue;
    const { end } = sheetRange(sheet);
    for (let row = 1; row <= end.r + 1; row += 1) {
      const date = parseLegacyDate(rawValue(cell(sheet, row, 1))).value;
      const amountPaise = moneyPaise(cell(sheet, row, 5));
      if (!date || amountPaise === null) continue;
      const paidTo = textValue(cell(sheet, row, 6)).trim() || null;
      const notes = [textValue(cell(sheet, row, 7)).trim(), textValue(cell(sheet, row, 8)).trim()].filter(Boolean).join(" | ") || null;
      entries.push({ date, amountPaise, payer, paidTo, notes });
    }
  }
  return entries;
}

function formulaCache(value: XLSX.CellObject | undefined): FormulaCache | null {
  if (!value?.f || typeof value.v !== "number" || !Number.isFinite(value.v)) return null;
  return { formula: value.f.replace(/^=/, ""), value: value.v };
}

function expenseRows(workbook: XLSX.WorkBook, changes: NormalizationChange[], warnings: ImportIssue[], errors: ImportIssue[]): { expenses: NormalizedExpense[]; discovered: number } {
  const sheetName = "Common Expense";
  const sheet = requireSheet(workbook, sheetName);
  const headerRow = findExpenseHeader(sheet);
  const { end } = sheetRange(sheet);
  const enrichments = parseEnrichments(workbook);
  const expenses: NormalizedExpense[] = [];
  let discovered = 0;

  for (let row = headerRow + 1; row <= end.r + 1; row += 1) {
    const cells = [1, 2, 3, 4, 5].map((column) => cell(sheet, row, column));
    if (cells.every((value) => rawValue(value) == null || textValue(value).trim() === "")) continue;
    discovered += 1;
    const raw = { date: rawValue(cells[0]), description: rawValue(cells[1]), amount: rawValue(cells[2]), paidBy: rawValue(cells[3]), category: rawValue(cells[4]) };
    const parsedDate = parseLegacyDate(raw.date);
    if (!parsedDate.value) {
      errors.push(issue("error", "expense", "INVALID_DATE", sheetName, row, "Date is not one of the strict supported Excel date forms", raw));
      continue;
    }
    if (parsedDate.changed) addChange(changes, sheetName, row, "date", raw.date, parsedDate.value, parsedDate.rule!);
    if (parsedDate.warning) warnings.push(issue("warning", "expense", "DATE_LABEL_MISMATCH", sheetName, row, parsedDate.warning, { date: raw.date }));

    const amountPaise = moneyPaise(cells[2]);
    if (amountPaise === null) {
      errors.push(issue("error", "expense", "INVALID_AMOUNT", sheetName, row, "Amount must be numeric, positive, and have at most two decimal places", raw));
      continue;
    }
    const payerRaw = textValue(cells[3]).trim();
    const payer = normalizePerson(payerRaw);
    if (payer.changed) addChange(changes, sheetName, row, "paidBy", payerRaw, payer.value, payer.rule!);
    if (payer.value !== "Mahesh" && payer.value !== "Satish") {
      errors.push(issue("error", "expense", "UNKNOWN_PAYER", sheetName, row, "Payer is not an explicitly recognized person", raw));
      continue;
    }

    const descriptionRaw = textValue(cells[1]);
    let description = descriptionRaw.trim();
    if (!description) {
      description = "Imported expense";
      addChange(changes, sheetName, row, "description", raw.description, description, "missing-description-default");
      warnings.push(issue("warning", "expense", "MISSING_DESCRIPTION", sheetName, row, "Missing description was replaced with the approved import label", { description: raw.description }));
    } else if (description !== descriptionRaw) {
      addChange(changes, sheetName, row, "description", descriptionRaw, description, "description-trim");
    }

    const categoryRaw = textValue(cells[4]);
    let categoryName: string;
    if (!categoryRaw.trim()) {
      categoryName = "Uncategorized";
      addChange(changes, sheetName, row, "category", raw.category, categoryName, "missing-category-default");
      warnings.push(issue("warning", "expense", "MISSING_CATEGORY", sheetName, row, "Missing category was mapped to Uncategorized", { category: raw.category }));
    } else {
      const category = normalizeCategory(categoryRaw);
      categoryName = category.value;
      if (category.changed) addChange(changes, sheetName, row, "category", categoryRaw, category.value, category.rule!);
    }

    const matching = enrichments.filter((entry) => entry.date === parsedDate.value && entry.amountPaise === amountPaise && entry.payer === payer.value);
    let paidTo: string | null = null;
    let notes: string | null = null;
    if (matching.length === 1) {
      paidTo = matching[0].paidTo;
      notes = matching[0].notes;
    } else if (matching.length > 1) {
      warnings.push(issue("warning", "expense", "AMBIGUOUS_DETAIL_MATCH", sheetName, row, "Multiple exact detail-log matches exist; no enrichment was applied", raw));
    }

    const categoryId = categoryName === "Uncategorized" ? "category_uncategorized" : stableId("category_import", fingerprint("category", normalizedName(categoryName)));
    const identity = { sheet: sheetName, row, date: parsedDate.value, description, amountPaise, payer: payer.value, categoryName, paidTo, notes };
    const importFingerprint = fingerprint("expense", identity);
    expenses.push({
      id: stableId("expense_import", importFingerprint),
      expenseDate: parsedDate.value,
      description,
      amountPaise,
      paidByPersonId: payer.value === "Mahesh" ? "person_mahesh" : "person_satish",
      categoryId,
      categoryName,
      paidTo,
      notes,
      source: "EXCEL",
      sourceSheet: sheetName,
      sourceRow: row,
      importFingerprint,
    });
  }
  return { expenses, discovered };
}

function plantationRows(workbook: XLSX.WorkBook, changes: NormalizationChange[], warnings: ImportIssue[]): { records: NormalizedPlantation[]; discovered: number } {
  const sheetName = "Plantation Details";
  const sheet = requireSheet(workbook, sheetName);
  const { end } = sheetRange(sheet);
  const blocks: number[] = [];
  for (let column = 1; column <= end.c + 1; column += 1) {
    if (textValue(cell(sheet, 1, column)).trim() === "Name" && textValue(cell(sheet, 1, column + 1)).trim() === "MT" && textValue(cell(sheet, 1, column + 2)).trim() === "SK") blocks.push(column);
  }
  if (blocks.length !== 2) throw new Error("Expected exactly two Plantation Details Name/MT/SK blocks");

  const aggregates = new Map<string, { cropName: string; farmAreaId: "area_mt" | "area_sk"; quantity: number; sources: SourceCell[] }>();
  let discovered = 0;
  for (const block of blocks) {
    for (let row = 2; row <= end.r + 1; row += 1) {
      const cropRaw = textValue(cell(sheet, row, block));
      const cropTrimmed = cropRaw.trim();
      const totalLabel = cropTrimmed.toLocaleLowerCase("en-IN").replace(/\s+/g, "");
      if (!cropTrimmed || ["total", "sum", "grandtotal"].includes(totalLabel)) continue;
      const crop = normalizeCrop(cropRaw);
      if (crop.changed) addChange(changes, sheetName, row, "crop", cropRaw, crop.value, crop.rule!);
      for (const [offset, area, columnName] of [[1, "area_mt", "MT"], [2, "area_sk", "SK"]] as const) {
        const quantity = numericValue(cell(sheet, row, block + offset));
        if (quantity === null || quantity <= 0) continue;
        discovered += 1;
        if (!Number.isSafeInteger(quantity)) {
          warnings.push(issue("warning", "plantation", "INVALID_QUANTITY", sheetName, row, "Plantation quantity is not a positive integer", { crop: cropRaw, area: columnName, quantity }));
          continue;
        }
        const source: SourceCell = { sheet: sheetName, row, column: XLSX.utils.encode_col(block + offset - 1) };
        const key = `${crop.value}\u0000${area}`;
        const existing = aggregates.get(key);
        if (existing) {
          existing.quantity += quantity;
          existing.sources.push(source);
        } else {
          aggregates.set(key, { cropName: crop.value, farmAreaId: area, quantity, sources: [source] });
        }
      }
    }
  }

  const records = [...aggregates.values()]
    .sort((a, b) => a.cropName.localeCompare(b.cropName, "en-IN") || a.farmAreaId.localeCompare(b.farmAreaId))
    .map((value) => {
      const cropFingerprint = fingerprint("crop", normalizedName(value.cropName));
      const cropId = stableId("crop_import", cropFingerprint);
      const importFingerprint = fingerprint("plantation", { cropName: value.cropName, farmAreaId: value.farmAreaId, quantity: value.quantity, sources: value.sources });
      return {
        id: stableId("plantation_import", importFingerprint),
        cropId,
        cropName: value.cropName,
        farmAreaId: value.farmAreaId,
        quantity: value.quantity,
        sources: value.sources,
        source: "EXCEL" as const,
        sourceSheet: "Plantation Details" as const,
        sourceRow: value.sources[0].row,
        importFingerprint,
      };
    });
  return { records, discovered };
}

function harvestRows(workbook: XLSX.WorkBook, changes: NormalizationChange[], warnings: ImportIssue[], errors: ImportIssue[]): { records: NormalizedHarvest[]; discovered: number } {
  const sheetName = "Banana Harvest Details";
  const sheet = requireSheet(workbook, sheetName);
  const records: NormalizedHarvest[] = [];
  let discovered = 0;
  for (let row = 2; row <= 4; row += 1) {
    discovered += 1;
    const quantity = numericValue(cell(sheet, row, 2));
    const gross = numericValue(cell(sheet, row, 3));
    const net = numericValue(cell(sheet, row, 4));
    const pricePaise = moneyPaise(cell(sheet, row, 5));
    const actualPaise = moneyPaise(cell(sheet, row, 6));
    const cache = formulaCache(cell(sheet, row, 6));
    const raw = { quantity: rawValue(cell(sheet, row, 2)), grossWeightKg: rawValue(cell(sheet, row, 3)), netWeightKg: rawValue(cell(sheet, row, 4)), salePrice: rawValue(cell(sheet, row, 5)), revenue: rawValue(cell(sheet, row, 6)) };
    if (quantity === null || quantity < 0 || net === null || net < 0 || pricePaise === null || actualPaise === null) {
      errors.push(issue("error", "harvest", "INVALID_HARVEST", sheetName, row, "Harvest row lacks required non-negative numeric cached values", raw));
      continue;
    }
    if (!cache) {
      errors.push(issue("error", "harvest", "MISSING_FORMULA_CACHE", sheetName, row, "Harvest revenue formula has no numeric cached value", raw));
      continue;
    }
    if (gross === null && raw.grossWeightKg != null) addChange(changes, sheetName, row, "grossWeightKg", raw.grossWeightKg, null, "dash-as-missing");
    warnings.push(issue("warning", "harvest", "AMBIGUOUS_AVERAGE_WEIGHT", sheetName, row, "The source Avg. Weight column is used by the revenue formula as total net weight; average weight was left empty", { sourceHeader: "Avg. Weight (Kg)", cachedNetWeightKg: net }));
    let calculatedRevenuePaise: number;
    try {
      calculatedRevenuePaise = calculateRevenuePaise(decimalString(net), pricePaise);
    } catch {
      errors.push(issue("error", "harvest", "INVALID_REVENUE_RANGE", sheetName, row, "Calculated harvest revenue exceeds the supported range", raw));
      continue;
    }
    const importFingerprint = fingerprint("harvest", { sheet: sheetName, row, quantity, gross, net, pricePaise, actualPaise, formula: cache.formula });
    records.push({
      id: stableId("harvest_import", importFingerprint),
      cropId: stableId("crop_import", fingerprint("crop", "banana")),
      harvestDate: null,
      quantity: decimalString(quantity),
      grossWeightKg: gross === null ? null : decimalString(gross),
      netWeightKg: decimalString(net),
      averageWeightKg: null,
      salePricePaisePerKg: pricePaise,
      calculatedRevenuePaise,
      actualRevenuePaise: actualPaise,
      formulaCache: cache,
      source: "EXCEL",
      sourceSheet: sheetName,
      sourceRow: row,
      importFingerprint,
    });
  }
  return { records, discovered };
}

function deduplicate<T extends { importFingerprint: string }>(records: T[]): { records: T[]; duplicates: number } {
  const seen = new Set<string>();
  const unique: T[] = [];
  let duplicates = 0;
  for (const record of records) {
    if (seen.has(record.importFingerprint)) duplicates += 1;
    else {
      seen.add(record.importFingerprint);
      unique.push(record);
    }
  }
  return { records: unique, duplicates };
}

export async function workbookChecksum(workbookPath: string): Promise<string> {
  return sha256(await fs.readFile(workbookPath));
}

export async function validateWorkbookPath(workbookPath: string): Promise<{ absolutePath: string; checksum: string }> {
  if (!workbookPath.trim()) throw new Error("An explicit workbook path is required");
  const absolutePath = path.resolve(workbookPath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile() || path.extname(absolutePath).toLocaleLowerCase("en-IN") !== ".xlsx") throw new Error("Workbook path must identify an .xlsx file");
  const checksum = await workbookChecksum(absolutePath);
  if (path.basename(absolutePath) === CANONICAL_WORKBOOK_NAME && checksum !== CANONICAL_WORKBOOK_SHA256) {
    throw new Error("Canonical workbook checksum does not match the approved source");
  }
  return { absolutePath, checksum };
}

export async function normalizeWorkbook(workbookPath: string): Promise<ImportPlan> {
  const validated = await validateWorkbookPath(workbookPath);
  const workbook = XLSX.readFile(validated.absolutePath, { cellDates: false, cellFormula: true, cellNF: true, raw: true });
  const changes: NormalizationChange[] = [];
  const warnings: ImportIssue[] = [];
  const errors: ImportIssue[] = [];
  const expenseResult = expenseRows(workbook, changes, warnings, errors);
  const plantationResult = plantationRows(workbook, changes, warnings);
  const harvestResult = harvestRows(workbook, changes, warnings, errors);
  const expenseDeduped = deduplicate(expenseResult.expenses);
  const plantationDeduped = deduplicate(plantationResult.records);
  const harvestDeduped = deduplicate(harvestResult.records);

  const categoryByName = new Map<string, NormalizedCategory>();
  for (const expense of expenseDeduped.records) {
    if (!categoryByName.has(expense.categoryName)) categoryByName.set(expense.categoryName, { id: expense.categoryId, name: expense.categoryName, normalizedName: normalizedName(expense.categoryName) });
  }

  return {
    expenses: expenseDeduped.records,
    plantation: plantationDeduped.records,
    harvests: harvestDeduped.records,
    categories: [...categoryByName.values()].sort((a, b) => a.name.localeCompare(b.name, "en-IN")),
    changes,
    warnings,
    errors,
    discovered: {
      expenses: expenseResult.discovered,
      plantationContributions: plantationResult.discovered,
      harvests: harvestResult.discovered,
    },
    duplicates: expenseDeduped.duplicates + plantationDeduped.duplicates + harvestDeduped.duplicates,
    sourceFile: path.basename(validated.absolutePath),
    sourceChecksum: validated.checksum,
  };
}
