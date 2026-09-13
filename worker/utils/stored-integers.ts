import { ApiHttpError } from "../middleware/errors";

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function outOfRange(): never {
  throw new ApiHttpError(500, "DATA_RANGE_ERROR", "Stored money exceeds the supported range");
}

export function storedMoneyToNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) outOfRange();
    return value;
  }
  if (!/^-?\d+$/.test(value)) outOfRange();
  const exact = BigInt(value);
  if (exact > MAX_SAFE_BIGINT || exact < -MAX_SAFE_BIGINT) outOfRange();
  return Number(exact);
}

export function exactMoneyToNumber(value: bigint): number {
  if (value > MAX_SAFE_BIGINT || value < -MAX_SAFE_BIGINT) outOfRange();
  return Number(value);
}

export function safeMoneyDifference(left: number, right: number): number {
  return exactMoneyToNumber(BigInt(left) - BigInt(right));
}
