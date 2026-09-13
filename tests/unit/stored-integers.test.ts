import { describe, expect, it } from "vitest";
import { safeMoneyDifference } from "../../worker/utils/stored-integers";

describe("safeMoneyDifference", () => {
  it("rejects unsafe operands even when their rounded difference would look safe", () => {
    expect(() => safeMoneyDifference(Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1)).toThrowError(
      expect.objectContaining({ code: "DATA_RANGE_ERROR", message: "Stored money exceeds the supported range" }),
    );
  });
});
