import { expect, it } from "vitest";
import { formatCompactINR, formatDate, formatINR, formatWeight } from "../../src/lib/format";

it("uses Indian currency grouping", () => {
  expect(formatINR(12500000)).toBe("₹1,25,000");
  expect(formatCompactINR(149301700)).toBe("₹14.93 L");
});

it("formats local calendar dates and weights for the farm UI", () => {
  expect(formatDate("2026-09-09")).toBe("09 Sept 2026");
  expect(formatWeight(12.5)).toBe("12.5 kg");
});
