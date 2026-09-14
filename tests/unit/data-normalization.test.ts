import { describe, expect, it } from "vitest";
import {
  normalizeCategory,
  normalizeCrop,
  normalizePerson,
  parseLegacyDate,
} from "../../scripts/data-normalization";

describe("explicit Excel normalization", () => {
  it("normalizes only approved payer case variants", () => {
    expect(["Mahesh", "mahesh", "MAHESH"].map(normalizePerson)).toEqual([
      { value: "Mahesh", changed: false },
      { value: "Mahesh", changed: true, rule: "person-case:mahesh" },
      { value: "Mahesh", changed: true, rule: "person-case:mahesh" },
    ]);
    expect(normalizePerson("M.")).toEqual({ value: "M.", changed: false });
  });

  it("normalizes only approved category variants and preserves ambiguous spellings", () => {
    expect(normalizeCategory("travel ")).toEqual({ value: "Travel", changed: true, rule: "category-case:travel" });
    expect(normalizeCategory("Tractor emi")).toEqual({ value: "Tractor EMI", changed: true, rule: "category-case:tractor-emi" });
    expect(normalizeCategory("Food (teak)")).toEqual({ value: "Food (Teak)", changed: true, rule: "category-case:food-teak" });
    expect(normalizeCategory("travel (Teak)")).toEqual({ value: "Travel (teak)", changed: true, rule: "category-case:travel-teak" });
    expect(normalizeCategory("Miscelleneous")).toEqual({ value: "Miscelleneous", changed: false });
    expect(normalizeCategory("Labours")).toEqual({ value: "Labours", changed: false });
    expect(normalizeCategory("Fertilizers")).toEqual({ value: "Fertilizers", changed: false });
  });

  it("maps only the approved crop spelling and preserves other source labels", () => {
    expect(normalizeCrop("Bannana")).toEqual({ value: "Banana", changed: true, rule: "crop-spelling:bannana" });
    expect(normalizeCrop("Rampala  Sitapala")).toEqual({ value: "Rampala  Sitapala", changed: false });
    expect(normalizeCrop("Unknown")).toEqual({ value: "Unknown", changed: false });
  });

  it("parses Excel serials and the one strict legacy text shape without broad date guessing", () => {
    expect(parseLegacyDate(44_567)).toEqual({ value: "2022-01-06", changed: false });
    expect(parseLegacyDate("Sunday, September 10, 2022")).toEqual({
      value: "2022-09-10",
      changed: true,
      rule: "legacy-text-date",
      warning: "The source weekday does not match the parsed calendar date",
    });
    expect(parseLegacyDate("09/10/2022")).toEqual({ value: null, changed: false });
    expect(parseLegacyDate("2022-02-30")).toEqual({ value: null, changed: false });
  });
});
