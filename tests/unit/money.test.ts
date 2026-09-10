import { describe, expect, it } from "vitest";
import { rupeesToPaise } from "../../worker/utils/money";

describe("rupeesToPaise", () => {
  it.each([
    ["1250.50", 125050],
    ["0.01", 1],
    [1250, 125000],
  ])("converts %s", (input, expected) => {
    expect(rupeesToPaise(input)).toBe(expected);
  });

  it.each(["", "1.001", -1])("rejects invalid decimal input %s", (input) => {
    expect(() => rupeesToPaise(input)).toThrow();
  });

  it.each([
    0.01,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("rejects non-integer or unsafe numeric input %s", (input) => {
    expect(() => rupeesToPaise(input)).toThrow();
  });
});
