import { z } from "zod";

const DECIMAL = /^(0|[1-9]\d*)(?:\.\d{1,3})?$/;
const MONEY = /^(0|[1-9]\d*)(?:\.\d{1,2})?$/;

function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

export const HarvestFormSchema = z.object({
  cropId: z.string().min(1, "Choose a crop"),
  harvestDate: z.string().refine(isRealIsoDate, "Choose a valid harvest date"),
  quantity: z.string().refine((value) => !value || DECIMAL.test(value), "Use a non-negative value with up to three decimals"),
  grossWeightKg: z.string().refine((value) => !value || DECIMAL.test(value), "Use a non-negative value with up to three decimals"),
  netWeightKg: z.string().regex(DECIMAL, "Use a non-negative value with up to three decimals"),
  averageWeightKg: z.string().refine((value) => !value || DECIMAL.test(value), "Use a non-negative value with up to three decimals"),
  salePricePerKg: z.string().regex(MONEY, "Use a non-negative rupee amount with up to two decimals"),
  actualRevenue: z.string().refine((value) => !value || MONEY.test(value), "Use a non-negative rupee amount with up to two decimals"),
  revenueOverrideReason: z.string().max(500),
  buyer: z.string().max(250),
  notes: z.string().max(1000),
});

export type HarvestFormValues = z.infer<typeof HarvestFormSchema>;

export function validHarvestForm(values: Pick<HarvestFormValues, "cropId" | "harvestDate" | "netWeightKg" | "salePricePerKg">): boolean {
  return z.object({
    cropId: HarvestFormSchema.shape.cropId,
    harvestDate: HarvestFormSchema.shape.harvestDate,
    netWeightKg: HarvestFormSchema.shape.netWeightKg,
    salePricePerKg: HarvestFormSchema.shape.salePricePerKg,
  }).safeParse(values).success;
}
