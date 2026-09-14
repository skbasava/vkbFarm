const PERSON_MAP = new Map<string, string>([
  ["mahesh", "Mahesh"],
  ["MAHESH", "Mahesh"],
  ["satish", "Satish"],
  ["SATISH", "Satish"],
]);

const CATEGORY_MAP = new Map<string, { value: string; rule: string }>([
  ["travel", { value: "Travel", rule: "category-case:travel" }],
  ["travel ", { value: "Travel", rule: "category-case:travel" }],
  ["Tractor emi", { value: "Tractor EMI", rule: "category-case:tractor-emi" }],
  ["Food (teak)", { value: "Food (Teak)", rule: "category-case:food-teak" }],
  ["travel (Teak)", { value: "Travel (teak)", rule: "category-case:travel-teak" }],
]);

const MONTHS = new Map([
  ["January", 0], ["February", 1], ["March", 2], ["April", 3],
  ["May", 4], ["June", 5], ["July", 6], ["August", 7],
  ["September", 8], ["October", 9], ["November", 10], ["December", 11],
]);
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type NormalizationResult<T> = {
  value: T;
  changed: boolean;
  rule?: string;
  warning?: string;
};

export function normalizePerson(input: string): NormalizationResult<string> {
  const mapped = PERSON_MAP.get(input);
  if (mapped) return { value: mapped, changed: true, rule: `person-case:${mapped.toLocaleLowerCase("en-IN")}` };
  return { value: input, changed: false };
}

export function normalizeCategory(input: string): NormalizationResult<string> {
  const explicit = CATEGORY_MAP.get(input);
  if (explicit) return { value: explicit.value, changed: true, rule: explicit.rule };
  const trimmed = input.trim();
  if (trimmed !== input) return { value: trimmed, changed: true, rule: "category-trim" };
  return { value: input, changed: false };
}

export function normalizeCrop(input: string): NormalizationResult<string> {
  if (input === "Bannana") return { value: "Banana", changed: true, rule: "crop-spelling:bannana" };
  const trimmed = input.trim();
  if (trimmed !== input) return { value: trimmed, changed: true, rule: "crop-trim" };
  return { value: input, changed: false };
}

function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseLegacyDate(input: unknown): NormalizationResult<string | null> {
  if (input instanceof Date && Number.isFinite(input.getTime())) {
    return { value: isoDate(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()), changed: false };
  }
  if (typeof input === "number" && Number.isInteger(input) && input > 0) {
    const milliseconds = Date.UTC(1899, 11, 30) + input * 86_400_000;
    const date = new Date(milliseconds);
    return { value: isoDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()), changed: false };
  }
  if (typeof input !== "string") return { value: null, changed: false };
  const match = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})$/.exec(input);
  if (!match) return { value: null, changed: false };
  const month = MONTHS.get(match[2]);
  if (month === undefined) return { value: null, changed: false };
  const year = Number(match[4]);
  const day = Number(match[3]);
  const value = isoDate(year, month, day);
  if (!value) return { value: null, changed: false };
  const actualWeekday = WEEKDAYS[new Date(Date.UTC(year, month, day)).getUTCDay()];
  return {
    value,
    changed: true,
    rule: "legacy-text-date",
    ...(actualWeekday === match[1] ? {} : { warning: "The source weekday does not match the parsed calendar date" }),
  };
}
