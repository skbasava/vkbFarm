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

  it.each(["", "1.001", -1, Number.NaN])("rejects %s", (input) => {
    expect(() => rupeesToPaise(input)).toThrow();
  });
});
