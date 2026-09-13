import { describe, expect, it } from "vitest";
import { HarvestFormSchema, validHarvestForm } from "../../src/features/harvest/schema";

describe("harvest form validation", () => {
  it("rejects an impossible calendar date at the client boundary", () => {
    expect(validHarvestForm({ cropId: "banana", harvestDate: "2026-02-30", netWeightKg: "1", salePricePerKg: "45" })).toBe(false);
  });

  it("keeps decimal harvest measurements as strings with bounded precision", () => {
    const parsed = HarvestFormSchema.parse({ cropId: "banana", harvestDate: "2026-02-28", quantity: "12.25", grossWeightKg: "10.126", netWeightKg: "10.125", averageWeightKg: "0.825", salePricePerKg: "7.99", actualRevenue: "", revenueOverrideReason: "", buyer: "", notes: "" });
    expect(parsed).toMatchObject({ quantity: "12.25", netWeightKg: "10.125", salePricePerKg: "7.99" });
    expect(() => HarvestFormSchema.parse({ ...parsed, netWeightKg: "10.1251" })).toThrow();
  });
});
