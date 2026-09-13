import { z } from "zod";
import { isIsoLocalDate } from "../utils/dates";

const text = (maximum: number) => z.string().max(maximum).nullable().optional();
const requiredId = z.string().min(1).max(120).refine((value) => value.trim().length > 0, "Value is required");
const decimal = (label: string) => z.string().min(1).max(40).regex(/^(0|[1-9]\d*)(?:\.\d{1,3})?$/, `${label} must be a non-negative decimal with at most three decimal places`);
const price = z.string().min(1).max(40).regex(/^(0|[1-9]\d*)(?:\.\d{1,2})?$/, "Amount must be a non-negative rupee value with at most two decimal places");

const harvestFields = {
  cropId: requiredId,
  harvestDate: z.string().refine(isIsoLocalDate, "Harvest date must be a valid ISO local date"),
  quantity: decimal("Quantity").optional(),
  grossWeightKg: decimal("Gross weight").optional(),
  netWeightKg: decimal("Net weight"),
  averageWeightKg: decimal("Average weight").optional(),
  salePricePerKg: price,
  actualRevenue: price.nullable().optional(),
  revenueOverrideReason: text(500),
  buyer: text(250),
  notes: text(1000),
};

export const HarvestInputSchema = z.object(harvestFields).strict();

export const HarvestUpdateSchema = z.object({
  ...harvestFields,
  cropId: harvestFields.cropId.optional(),
  harvestDate: z.string().refine(isIsoLocalDate, "Harvest date must be a valid ISO local date").nullable().optional(),
  quantity: decimal("Quantity").nullable().optional(),
  grossWeightKg: decimal("Gross weight").nullable().optional(),
  netWeightKg: harvestFields.netWeightKg.optional(),
  averageWeightKg: decimal("Average weight").nullable().optional(),
  salePricePerKg: harvestFields.salePricePerKg.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one harvest field must be supplied");

export type HarvestInput = z.infer<typeof HarvestInputSchema>;
export type HarvestUpdateInput = z.infer<typeof HarvestUpdateSchema>;
