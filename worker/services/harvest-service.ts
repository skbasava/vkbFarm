import { ApiHttpError } from "../middleware/errors";
import {
  deleteHarvestStatement,
  getHarvest,
  insertHarvestStatement,
  updateHarvestStatement,
  type Harvest,
  type HarvestWrite,
} from "../repositories/harvest-repository";
import { getCrop } from "../repositories/plantation-repository";
import { createId } from "../utils/ids";
import { isIsoLocalDate } from "../utils/dates";
import { rupeesToPaise } from "../utils/money";
import type { HarvestInput, HarvestUpdateInput } from "../validation/harvests";

const DECIMAL_PATTERN = /^(0|[1-9]\d*)(?:\.(\d{1,3}))?$/;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

type RevenueInput = { netWeightKg: string; salePricePaisePerKg: number };
type RevenueOverride = { calculated: number; actual: number; reason?: string | null };

export type ImportedHarvestInput = {
  cropId: string;
  harvestDate: string | null;
  quantity?: string | null;
  grossWeightKg?: string | null;
  netWeightKg: string;
  averageWeightKg?: string | null;
  salePricePerKg: string;
  actualRevenuePaise: number;
  buyer?: string | null;
  notes?: string | null;
  sourceSheet: string;
  sourceRow: number;
  importFingerprint: string;
};

function scaledThousandths(value: string): bigint {
  const match = DECIMAL_PATTERN.exec(value);
  if (!match) {
    if (value.startsWith("-")) throw new TypeError("Weight must be non-negative");
    throw new TypeError("Weight must be a non-negative decimal with at most three decimal places");
  }
  return BigInt(match[1]) * 1_000n + BigInt((match[2] ?? "").padEnd(3, "0"));
}

/** Calculates integer paise with exact thousandth-kilogram scaling and half-up rounding. */
export function calculateRevenuePaise(input: RevenueInput): number {
  if (!Number.isSafeInteger(input.salePricePaisePerKg) || input.salePricePaisePerKg < 0) {
    throw new TypeError("Sale price must be a non-negative safe integer paise value");
  }

  const numerator = scaledThousandths(input.netWeightKg) * BigInt(input.salePricePaisePerKg);
  const roundedPaise = (numerator + 500n) / 1_000n;
  if (roundedPaise > MAX_SAFE_BIGINT) throw new RangeError("Revenue exceeds the supported range");
  return Number(roundedPaise);
}

/** Enforces the business reason required for a manually overridden revenue total. */
export function validateRevenueOverride(input: RevenueOverride): void {
  if (!Number.isSafeInteger(input.calculated) || !Number.isSafeInteger(input.actual) || input.calculated < 0 || input.actual < 0) {
    throw new TypeError("Revenue must be a non-negative safe integer paise value");
  }
  if (input.actual !== input.calculated && !input.reason?.trim()) {
    throw new TypeError("A revenue override reason is required when actual revenue differs from calculated revenue");
  }
}

function validationError(error: unknown): never {
  if (error instanceof TypeError || error instanceof RangeError) {
    throw new ApiHttpError(422, "VALIDATION_ERROR", error.message);
  }
  throw error;
}

function decimalNumber(value: string | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!DECIMAL_PATTERN.test(value)) throw new TypeError("Decimal values must use at most three decimal places");
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new TypeError("Decimal values must be non-negative and finite");
  return result;
}

function rupeesStringFromPaise(paise: number): string {
  const exact = BigInt(paise);
  const whole = exact / 100n;
  const fraction = String(exact % 100n).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function optionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

async function validateCrop(db: D1Database, cropId: string, unchangedCropId?: string): Promise<void> {
  const crop = await getCrop(db, cropId);
  if (!crop) throw new ApiHttpError(404, "REFERENCE_NOT_FOUND", "The selected crop was not found");
  if (!crop.active && cropId !== unchangedCropId) {
    throw new ApiHttpError(409, "CROP_INACTIVE", "The selected crop is inactive");
  }
}

function auditStatement(
  db: D1Database,
  entityId: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  actor: string,
  before: unknown,
  after: unknown,
): D1PreparedStatement {
  return db.prepare(
    "INSERT INTO audit_log (id, entity_type, entity_id, action, actor, before_json, after_json) VALUES (?, 'harvest', ?, ?, ?, ?, ?)",
  ).bind(
    createId(),
    entityId,
    action,
    actor,
    before === null ? null : JSON.stringify(before),
    after === null ? null : JSON.stringify(after),
  );
}

function calculatedRevenue(netWeightKg: string, salePricePerKg: string): { salePricePaisePerKg: number; calculatedRevenuePaise: number } {
  try {
    const salePricePaisePerKg = rupeesToPaise(salePricePerKg);
    return {
      salePricePaisePerKg,
      calculatedRevenuePaise: calculateRevenuePaise({ netWeightKg, salePricePaisePerKg }),
    };
  } catch (error) {
    validationError(error);
  }
}

function actualRevenue(input: string): number {
  try {
    return rupeesToPaise(input);
  } catch (error) {
    validationError(error);
  }
}

function createWrite(input: HarvestInput, id: string, now: string): HarvestWrite {
  const revenue = calculatedRevenue(input.netWeightKg, input.salePricePerKg);
  const actual = input.actualRevenue == null ? revenue.calculatedRevenuePaise : actualRevenue(input.actualRevenue);
  const reason = optionalText(input.revenueOverrideReason);
  try {
    validateRevenueOverride({ calculated: revenue.calculatedRevenuePaise, actual, reason });
    return {
      id,
      cropId: input.cropId,
      harvestDate: input.harvestDate,
      quantity: decimalNumber(input.quantity),
      grossWeightKg: decimalNumber(input.grossWeightKg),
      netWeightKg: decimalNumber(input.netWeightKg),
      averageWeightKg: decimalNumber(input.averageWeightKg),
      ...revenue,
      actualRevenuePaise: actual,
      revenueOverrideReason: actual === revenue.calculatedRevenuePaise ? null : reason,
      buyer: optionalText(input.buyer),
      notes: optionalText(input.notes),
      source: null,
      sourceSheet: null,
      sourceRow: null,
      importFingerprint: null,
      updatedAt: now,
    };
  } catch (error) {
    validationError(error);
  }
}

function mergedWrite(current: Harvest, input: HarvestUpdateInput): HarvestWrite {
  const netWeightKg = input.netWeightKg ?? current.netWeightKg ?? "0";
  const salePricePerKg = input.salePricePerKg ?? rupeesStringFromPaise(current.salePricePaisePerKg ?? 0);
  const revenue = calculatedRevenue(netWeightKg, salePricePerKg);
  const basisChanged = revenue.calculatedRevenuePaise !== (current.calculatedRevenuePaise ?? 0);
  const currentActual = current.actualRevenuePaise ?? current.calculatedRevenuePaise ?? revenue.calculatedRevenuePaise;
  const currentReason = optionalText(current.revenueOverrideReason);

  let actual: number;
  let reason: string | null;
  if (input.actualRevenue === null) {
    actual = revenue.calculatedRevenuePaise;
    reason = null;
  } else if (input.actualRevenue !== undefined) {
    actual = actualRevenue(input.actualRevenue);
    reason = input.revenueOverrideReason === undefined ? currentReason : optionalText(input.revenueOverrideReason);
  } else if (currentActual === (current.calculatedRevenuePaise ?? 0)) {
    actual = revenue.calculatedRevenuePaise;
    reason = null;
  } else {
    actual = currentActual;
    reason = input.revenueOverrideReason === undefined ? currentReason : optionalText(input.revenueOverrideReason);
  }

  const isTrustedReasonlessLegacy = current.source === "EXCEL" && currentActual !== (current.calculatedRevenuePaise ?? 0) && !currentReason;
  if (isTrustedReasonlessLegacy && basisChanged && input.actualRevenue === undefined) {
    throw new ApiHttpError(422, "LEGACY_REVENUE_REVIEW_REQUIRED", "Changing the calculation basis requires an explicit actual revenue and override reason");
  }
  if (!(isTrustedReasonlessLegacy && !basisChanged && actual === currentActual && !reason)) {
    try {
      validateRevenueOverride({ calculated: revenue.calculatedRevenuePaise, actual, reason });
    } catch (error) {
      validationError(error);
    }
  }

  return {
    id: current.id,
    cropId: input.cropId ?? current.cropId,
    harvestDate: input.harvestDate === undefined ? current.harvestDate : input.harvestDate,
    quantity: input.quantity === undefined ? decimalNumber(current.quantity) : decimalNumber(input.quantity),
    grossWeightKg: input.grossWeightKg === undefined ? decimalNumber(current.grossWeightKg) : decimalNumber(input.grossWeightKg),
    netWeightKg: decimalNumber(netWeightKg),
    averageWeightKg: input.averageWeightKg === undefined ? decimalNumber(current.averageWeightKg) : decimalNumber(input.averageWeightKg),
    ...revenue,
    actualRevenuePaise: actual,
    revenueOverrideReason: actual === revenue.calculatedRevenuePaise ? null : reason,
    buyer: input.buyer === undefined ? current.buyer : optionalText(input.buyer),
    notes: input.notes === undefined ? current.notes : optionalText(input.notes),
    source: current.source,
    sourceSheet: current.sourceSheet,
    sourceRow: current.sourceRow,
    importFingerprint: current.importFingerprint,
    updatedAt: new Date().toISOString(),
  };
}

export async function createHarvest(db: D1Database, input: HarvestInput, actor: string): Promise<Harvest> {
  await validateCrop(db, input.cropId);
  const write = createWrite(input, createId(), new Date().toISOString());
  await db.batch([
    insertHarvestStatement(db, write),
    auditStatement(db, write.id, "CREATE", actor, null, write),
  ]);
  const stored = await getHarvest(db, write.id);
  if (!stored) throw new ApiHttpError(500, "STORAGE_ERROR", "The harvest could not be read after writing");
  return stored;
}

export async function updateHarvest(db: D1Database, id: string, input: HarvestUpdateInput, actor: string): Promise<Harvest> {
  const current = await getHarvest(db, id);
  if (!current) throw new ApiHttpError(404, "HARVEST_NOT_FOUND", "The harvest record was not found");
  if (input.harvestDate === null && !(current.source === "EXCEL" && current.harvestDate === null)) {
    throw new ApiHttpError(422, "VALIDATION_ERROR", "Only an imported harvest with an unavailable date may retain it");
  }
  const write = mergedWrite(current, input);
  await validateCrop(db, write.cropId, current.cropId);
  await db.batch([
    updateHarvestStatement(db, write),
    auditStatement(db, id, "UPDATE", actor, current, write),
  ]);
  const stored = await getHarvest(db, id);
  if (!stored) throw new ApiHttpError(500, "STORAGE_ERROR", "The harvest could not be read after writing");
  return stored;
}

export async function deleteHarvest(db: D1Database, id: string, actor: string): Promise<{ id: string }> {
  const current = await getHarvest(db, id);
  if (!current) throw new ApiHttpError(404, "HARVEST_NOT_FOUND", "The harvest record was not found");
  await db.batch([
    deleteHarvestStatement(db, id),
    auditStatement(db, id, "DELETE", actor, current, null),
  ]);
  return { id };
}

/** Trusted import-only entry point; public HTTP schemas never accept source metadata. */
export async function createImportedHarvest(
  db: D1Database,
  input: ImportedHarvestInput,
  actor: string,
): Promise<Harvest> {
  if (input.harvestDate !== null && !isIsoLocalDate(input.harvestDate)) {
    throw new ApiHttpError(422, "VALIDATION_ERROR", "Harvest date must be a valid ISO local date");
  }
  if (!Number.isSafeInteger(input.actualRevenuePaise) || input.actualRevenuePaise < 0) {
    throw new ApiHttpError(422, "VALIDATION_ERROR", "Actual revenue must be a non-negative safe integer paise value");
  }
  await validateCrop(db, input.cropId);
  const now = new Date().toISOString();
  const revenue = calculatedRevenue(input.netWeightKg, input.salePricePerKg);
  const write: HarvestWrite = {
    id: createId(),
    cropId: input.cropId,
    harvestDate: input.harvestDate,
    quantity: decimalNumber(input.quantity),
    grossWeightKg: decimalNumber(input.grossWeightKg),
    netWeightKg: decimalNumber(input.netWeightKg),
    averageWeightKg: decimalNumber(input.averageWeightKg),
    ...revenue,
    actualRevenuePaise: input.actualRevenuePaise,
    revenueOverrideReason: null,
    buyer: optionalText(input.buyer),
    notes: optionalText(input.notes),
    source: "EXCEL",
    sourceSheet: input.sourceSheet,
    sourceRow: input.sourceRow,
    importFingerprint: input.importFingerprint,
    updatedAt: now,
  };
  await db.batch([
    insertHarvestStatement(db, write),
    auditStatement(db, write.id, "CREATE", actor, null, write),
  ]);
  const stored = await getHarvest(db, write.id);
  if (!stored) throw new ApiHttpError(500, "STORAGE_ERROR", "The imported harvest could not be read after writing");
  return stored;
}
