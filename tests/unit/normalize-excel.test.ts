import fs from "node:fs/promises";
import * as nodeFs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { normalizeWorkbook } from "../../scripts/normalize-excel";
import { sourceControls } from "../../scripts/verify-import";

const fixture = path.resolve("tests/fixtures/farm-import.xlsx");
const tempDirectories: string[] = [];
XLSX.set_fs(nodeFs);

async function normalizeFixture() {
  return normalizeWorkbook(fixture, { allowUnapprovedSource: true });
}

function shiftSheet(sheet: XLSX.WorkSheet, rowOffset: number, columnOffset: number): XLSX.WorkSheet {
  const shifted: XLSX.WorkSheet = {};
  for (const [address, value] of Object.entries(sheet)) {
    if (address.startsWith("!")) continue;
    const decoded = XLSX.utils.decode_cell(address);
    shifted[XLSX.utils.encode_cell({ r: decoded.r + rowOffset, c: decoded.c + columnOffset })] = value;
  }
  const range = XLSX.utils.decode_range(sheet["!ref"]!);
  shifted["!ref"] = XLSX.utils.encode_range({
    s: { r: range.s.r + rowOffset, c: range.s.c + columnOffset },
    e: { r: range.e.r + rowOffset, c: range.e.c + columnOffset },
  });
  return shifted;
}

async function workbookVariant(update: (workbook: XLSX.WorkBook) => void): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vkb-parser-variant-"));
  tempDirectories.push(directory);
  const output = path.join(directory, "variant.xlsx");
  const workbook = XLSX.readFile(fixture, { cellFormula: true, raw: true });
  update(workbook);
  XLSX.writeFile(workbook, output);
  return output;
}

afterEach(async () => {
  while (tempDirectories.length) await fs.rm(tempDirectories.pop()!, { recursive: true, force: true });
});

describe("farm workbook parser", () => {
  it("uses only Common Expense A:E and emits structured issues for invalid rows", async () => {
    const plan = await normalizeFixture();

    expect(plan.discovered).toMatchObject({ expenses: 4, plantationContributions: 6, harvests: 3 });
    expect(plan.expenses).toHaveLength(2);
    expect(plan.expenses.map((expense) => expense.amountPaise)).toEqual([10_000, 7_500]);
    expect(plan.expenses[0]).toMatchObject({
      sourceSheet: "Common Expense",
      sourceRow: 4,
      paidByPersonId: "person_mahesh",
      categoryName: "Food",
      paidTo: "Vendor B",
      notes: "exact enrichment",
      enrichmentSource: {
        sheet: "Mah-Expense-Log",
        row: 3,
        cells: ["A3", "E3", "F3", "G3"],
      },
    });
    expect(plan.expenses[1]).toMatchObject({ description: "Imported expense", categoryName: "Uncategorized" });
    expect(plan.errors.map((issue) => ({ code: issue.code, sheet: issue.sheet, row: issue.row }))).toEqual([
      { code: "INVALID_DATE", sheet: "Common Expense", row: 5 },
      { code: "UNKNOWN_PAYER", sheet: "Common Expense", row: 7 },
    ]);
    expect(plan.errors[0]).toMatchObject({ severity: "error", entity: "expense", reason: expect.any(String), raw: expect.any(Object) });
    expect(plan.warnings.map((issue) => issue.code)).toEqual(expect.arrayContaining(["MISSING_CATEGORY", "MISSING_DESCRIPTION"]));
  });

  it("aggregates both plantation blocks, excludes totals and zeros, and retains every cell source", async () => {
    const plan = await normalizeFixture();

    expect(plan.plantation).toHaveLength(5);
    expect(plan.plantation.reduce((sum, record) => sum + record.quantity, 0)).toBe(22);
    expect(plan.plantation.find((record) => record.cropName === "Banana" && record.farmAreaId === "area_mt")).toMatchObject({
      quantity: 12,
      sources: [
        { sheet: "Plantation Details", row: 2, column: "B" },
        { sheet: "Plantation Details", row: 2, column: "F" },
      ],
    });
    expect(plan.plantation.some((record) => /Grand Total|Sum/i.test(record.cropName))).toBe(false);
  });

  it("reads formula cached values for harvest rows 2-4 and excludes Grand Total", async () => {
    const plan = await normalizeFixture();

    expect(plan.harvests).toHaveLength(3);
    expect(plan.harvests.map((harvest) => harvest.actualRevenuePaise)).toEqual([50_000, 30_000, 15_000]);
    expect(plan.harvests.map((harvest) => harvest.formulaCache?.formula)).toEqual(["D2*E2", "D3*E3", "D4*E4"]);
    expect(plan.harvests.map((harvest) => harvest.formulaCache?.value)).toEqual([500, 300, 150]);
  });

  it("produces stable fingerprints and a complete transformation ledger across repeated parses", async () => {
    const first = await normalizeFixture();
    const second = await normalizeFixture();

    expect(first.expenses.map((row) => row.importFingerprint)).toEqual(second.expenses.map((row) => row.importFingerprint));
    expect(first.plantation.map((row) => row.importFingerprint)).toEqual(second.plantation.map((row) => row.importFingerprint));
    expect(first.harvests.map((row) => row.importFingerprint)).toEqual(second.harvests.map((row) => row.importFingerprint));
    expect(first.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "paidBy", from: "mahesh", to: "Mahesh" }),
      expect.objectContaining({ field: "category", from: "Food ", to: "Food" }),
      expect.objectContaining({ field: "crop", from: "Bannana", to: "Banana" }),
    ]));
  });

  it("discovers unique exact header tuples anywhere in each full used range", async () => {
    const relocated = await workbookVariant((workbook) => {
      workbook.Sheets["Common Expense"] = shiftSheet(workbook.Sheets["Common Expense"], 8, 3);
      workbook.Sheets["Plantation Details"] = shiftSheet(workbook.Sheets["Plantation Details"], 4, 2);
      workbook.Sheets["Banana Harvest Details"] = shiftSheet(workbook.Sheets["Banana Harvest Details"], 6, 4);
    });

    const plan = await normalizeWorkbook(relocated, { allowUnapprovedSource: true });
    expect(plan.expenses.map((row) => row.sourceRow)).toEqual([12, 14]);
    expect(plan.plantation.reduce((sum, row) => sum + row.quantity, 0)).toBe(22);
    expect(plan.harvests.map((row) => row.sourceRow)).toEqual([8, 9, 10]);
    const independentlyDerived = sourceControls(XLSX.readFile(relocated, { cellFormula: true, raw: true }));
    expect(independentlyDerived).toMatchObject({
      expenses: expect.arrayContaining([expect.objectContaining({ source_row: 12 })]),
      plantation: expect.arrayContaining([expect.objectContaining({ quantity: 12 })]),
      harvests: expect.arrayContaining([expect.objectContaining({ source_row: 8 })]),
    });
  });

  it("rejects duplicate exact header tuples as ambiguous", async () => {
    const duplicate = await workbookVariant((workbook) => {
      const sheet = workbook.Sheets["Common Expense"];
      for (let column = 0; column < 5; column += 1) {
        sheet[XLSX.utils.encode_cell({ r: 20, c: 10 + column })] = { t: "s", v: ["Date", "Description", "Amount", "Who Paid", "Expense Type"][column] };
      }
      const range = XLSX.utils.decode_range(sheet["!ref"]!);
      range.e.r = Math.max(range.e.r, 20);
      range.e.c = Math.max(range.e.c, 14);
      sheet["!ref"] = XLSX.utils.encode_range(range);
    });

    await expect(normalizeWorkbook(duplicate, { allowUnapprovedSource: true })).rejects.toThrow("ambiguous");
    expect(() => sourceControls(XLSX.readFile(duplicate, { cellFormula: true, raw: true }))).toThrow("ambiguous");
  });

  it("rejects ambiguous plantation and harvest header tuples independently", async () => {
    const plantationDuplicate = await workbookVariant((workbook) => {
      const sheet = workbook.Sheets["Plantation Details"];
      ["Name", "MT", "SK"].forEach((value, column) => { sheet[XLSX.utils.encode_cell({ r: 20, c: 10 + column })] = { t: "s", v: value }; });
      sheet["!ref"] = "A1:M21";
    });
    await expect(normalizeWorkbook(plantationDuplicate, { allowUnapprovedSource: true })).rejects.toThrow("Plantation Details header tuple is ambiguous");
    expect(() => sourceControls(XLSX.readFile(plantationDuplicate, { cellFormula: true, raw: true }))).toThrow("Plantation Details verification header tuple is ambiguous");

    const harvestDuplicate = await workbookVariant((workbook) => {
      const sheet = workbook.Sheets["Banana Harvest Details"];
      ["Total harvested", "Quantity", "Gross Weight (Kg)", "Avg. Weight (Kg)", "Sell Price per kg", "Total Price"].forEach((value, column) => {
        sheet[XLSX.utils.encode_cell({ r: 20, c: 10 + column })] = { t: "s", v: value };
      });
      sheet["!ref"] = "A1:P21";
    });
    await expect(normalizeWorkbook(harvestDuplicate, { allowUnapprovedSource: true })).rejects.toThrow("Banana Harvest Details header tuple is ambiguous");
    expect(() => sourceControls(XLSX.readFile(harvestDuplicate, { cellFormula: true, raw: true }))).toThrow("Banana Harvest Details verification header tuple is ambiguous");
  });

  it("keeps vertically relocated plantation blocks independent", async () => {
    const relocated = await workbookVariant((workbook) => {
      const original = workbook.Sheets["Plantation Details"];
      const vertical: XLSX.WorkSheet = {};
      for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          const first = original[XLSX.utils.encode_cell({ r: row, c: column })];
          const second = original[XLSX.utils.encode_cell({ r: row, c: column + 4 })];
          if (first) vertical[XLSX.utils.encode_cell({ r: row, c: column })] = first;
          if (second) vertical[XLSX.utils.encode_cell({ r: row + 9, c: column })] = second;
        }
      }
      vertical["!ref"] = "A1:C13";
      workbook.Sheets["Plantation Details"] = vertical;
    });

    const plan = await normalizeWorkbook(relocated, { allowUnapprovedSource: true });
    expect(plan.plantation.reduce((sum, row) => sum + row.quantity, 0)).toBe(22);
    expect(plan.discovered.plantationContributions).toBe(6);
  });

  it("reports exact ambiguous enrichment and records trimming/combining provenance", async () => {
    const transformed = await workbookVariant((workbook) => {
      const sheet = workbook.Sheets["Mah-Expense-Log"];
      sheet.F3.v = " Vendor B ";
      sheet.G3.v = " first note ";
      sheet.H3 = { t: "s", v: " second note " };
      sheet["!ref"] = "A1:H4";
    });
    const transformedPlan = await normalizeWorkbook(transformed, { allowUnapprovedSource: true });
    expect(transformedPlan.expenses[0]).toMatchObject({
      paidTo: "Vendor B",
      notes: "first note | second note",
      enrichmentSource: { sheet: "Mah-Expense-Log", row: 3, cells: ["A3", "E3", "F3", "G3", "H3"] },
    });
    expect(transformedPlan.changes.map((change) => change.rule)).toEqual(expect.arrayContaining(["detail-paid-to-trim", "detail-note-trim", "detail-notes-combine"]));

    const ambiguous = await workbookVariant((workbook) => {
      const sheet = workbook.Sheets["Mah-Expense-Log"];
      for (let column = 0; column < 8; column += 1) {
        const source = sheet[XLSX.utils.encode_cell({ r: 2, c: column })];
        if (source) sheet[XLSX.utils.encode_cell({ r: 4, c: column })] = { ...source };
      }
      sheet["!ref"] = "A1:H5";
    });
    const ambiguousPlan = await normalizeWorkbook(ambiguous, { allowUnapprovedSource: true });
    expect(ambiguousPlan.expenses[0]).toMatchObject({ paidTo: null, notes: null, enrichmentSource: null });
    expect(ambiguousPlan.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "AMBIGUOUS_DETAIL_MATCH", row: 4 })]));

    const relocatedDetail = await workbookVariant((workbook) => {
      const sheet = workbook.Sheets["Mah-Expense-Log"];
      for (let column = 0; column < 8; column += 1) {
        const source = sheet[XLSX.utils.encode_cell({ r: 2, c: column })];
        delete sheet[XLSX.utils.encode_cell({ r: 2, c: column })];
        if (source) sheet[XLSX.utils.encode_cell({ r: 4, c: column })] = { ...source };
      }
      sheet["!ref"] = "A1:H5";
    });
    const relocatedPlan = await normalizeWorkbook(relocatedDetail, { allowUnapprovedSource: true });
    expect(relocatedPlan.expenses[0]).toMatchObject({ paidTo: "Vendor B", enrichmentSource: { row: 5 } });
    expect(relocatedPlan.expenses[0].importFingerprint).not.toBe((await normalizeFixture()).expenses[0].importFingerprint);
  });

  it("counts warning-skipped invalid plantation contributions and requires harvest Grand Total", async () => {
    const invalidPlantation = await workbookVariant((workbook) => {
      workbook.Sheets["Plantation Details"].B2.v = 1.5;
    });
    const plan = await normalizeWorkbook(invalidPlantation, { allowUnapprovedSource: true });
    expect(plan.skipped).toBe(3);
    expect(plan.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INVALID_QUANTITY", row: 2 })]));

    const missingGrandTotal = await workbookVariant((workbook) => {
      const sheet = workbook.Sheets["Banana Harvest Details"];
      for (let column = 0; column < 6; column += 1) delete sheet[XLSX.utils.encode_cell({ r: 4, c: column })];
      sheet["!ref"] = "A1:F4";
    });
    await expect(normalizeWorkbook(missingGrandTotal, { allowUnapprovedSource: true })).rejects.toThrow("Grand Total");
    expect(() => sourceControls(XLSX.readFile(missingGrandTotal, { cellFormula: true, raw: true }))).toThrow("Grand Total");
  });
});
