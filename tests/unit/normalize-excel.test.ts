import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeWorkbook } from "../../scripts/normalize-excel";

const fixture = path.resolve("tests/fixtures/farm-import.xlsx");

describe("farm workbook parser", () => {
  it("uses only Common Expense A:E and emits structured issues for invalid rows", async () => {
    const plan = await normalizeWorkbook(fixture);

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
    const plan = await normalizeWorkbook(fixture);

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
    const plan = await normalizeWorkbook(fixture);

    expect(plan.harvests).toHaveLength(3);
    expect(plan.harvests.map((harvest) => harvest.actualRevenuePaise)).toEqual([50_000, 30_000, 15_000]);
    expect(plan.harvests.map((harvest) => harvest.formulaCache?.formula)).toEqual(["D2*E2", "D3*E3", "D4*E4"]);
    expect(plan.harvests.map((harvest) => harvest.formulaCache?.value)).toEqual([500, 300, 150]);
  });

  it("produces stable fingerprints and a complete transformation ledger across repeated parses", async () => {
    const first = await normalizeWorkbook(fixture);
    const second = await normalizeWorkbook(fixture);

    expect(first.expenses.map((row) => row.importFingerprint)).toEqual(second.expenses.map((row) => row.importFingerprint));
    expect(first.plantation.map((row) => row.importFingerprint)).toEqual(second.plantation.map((row) => row.importFingerprint));
    expect(first.harvests.map((row) => row.importFingerprint)).toEqual(second.harvests.map((row) => row.importFingerprint));
    expect(first.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "paidBy", from: "mahesh", to: "Mahesh" }),
      expect.objectContaining({ field: "category", from: "Food ", to: "Food" }),
      expect.objectContaining({ field: "crop", from: "Bannana", to: "Banana" }),
    ]));
  });
});
