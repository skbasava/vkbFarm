const MONEY_PATTERN = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

/** Converts a non-negative rupee amount into its exact integer paise value. */
export function rupeesToPaise(input: string | number): number {
  if (typeof input === "number" && !Number.isSafeInteger(input)) {
    throw new TypeError("Numeric amounts must be safe integer rupees");
  }

  const value = String(input);
  const match = MONEY_PATTERN.exec(value);
  if (!match) {
    throw new TypeError("Amount must have at most two decimal places");
  }

  const [, whole, fraction = ""] = match;
  const paise = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Amount exceeds the supported range");
  }

  return Number(paise);
}
