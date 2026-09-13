import { describe, expect, it } from "vitest";
import { calculateRevenuePaise, validateRevenueOverride } from "../../worker/services/harvest-service";

describe("harvest revenue rules", () => {
  it("multiplies whole kilograms by the paise sale price", () => {
    expect(calculateRevenuePaise({ netWeightKg: "153", salePricePaisePerKg: 4500 })).toBe(688500);
  });

  it("uses scaled decimal kilograms without binary floating point drift", () => {
    expect(calculateRevenuePaise({ netWeightKg: "0.29", salePricePaisePerKg: 100 })).toBe(29);
    expect(calculateRevenuePaise({ netWeightKg: "10.125", salePricePaisePerKg: 799 })).toBe(8090);
  });

  it("rounds a fractional paise half up and rejects a result outside the safe integer range", () => {
    expect(calculateRevenuePaise({ netWeightKg: "0.005", salePricePaisePerKg: 100 })).toBe(1);
    expect(calculateRevenuePaise({ netWeightKg: "90071992547409.91", salePricePaisePerKg: 100 })).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => calculateRevenuePaise({ netWeightKg: "90071992547409.92", salePricePaisePerKg: 100 })).toThrow("supported range");
  });

  it("allows zero values but rejects negative and over-precise weights", () => {
    expect(calculateRevenuePaise({ netWeightKg: "0", salePricePaisePerKg: 0 })).toBe(0);
    expect(() => calculateRevenuePaise({ netWeightKg: "-1", salePricePaisePerKg: 10 })).toThrow("non-negative");
    expect(() => calculateRevenuePaise({ netWeightKg: "1.0001", salePricePaisePerKg: 10 })).toThrow("at most three decimal places");
    expect(() => calculateRevenuePaise({ netWeightKg: "1", salePricePaisePerKg: 1.5 })).toThrow("safe integer");
  });

  it("requires a non-blank reason only when actual revenue overrides the calculation", () => {
    expect(() => validateRevenueOverride({ calculated: 688500, actual: 700000, reason: "" })).toThrow("reason");
    expect(() => validateRevenueOverride({ calculated: 688500, actual: 700000, reason: "Negotiated buyer deduction" })).not.toThrow();
    expect(() => validateRevenueOverride({ calculated: 688500, actual: 688500, reason: "" })).not.toThrow();
  });
});
