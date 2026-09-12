import { z } from "zod";
import { isIsoLocalDate } from "../utils/dates";

const requiredText = (maximum: number) =>
  z.string().min(1).max(maximum).refine((value) => value.trim().length > 0, "Value is required");
const optionalText = (maximum: number) => z.string().max(maximum).nullable().optional();

export const PlantationInputSchema = z
  .object({
    cropId: requiredText(120),
    farmAreaId: requiredText(120),
    quantity: z.number().int().nonnegative(),
    plantingDate: z.string().refine(isIsoLocalDate, "Planting date must be a valid ISO local date"),
    notes: optionalText(1000),
  })
  .strict();

export const PlantationUpdateSchema = z
  .object({
    cropId: requiredText(120).optional(),
    farmAreaId: requiredText(120).optional(),
    quantity: z.number().int().nonnegative().optional(),
    // A null date is accepted here only so the service can retain an existing EXCEL row
    // whose source date was unavailable. Creates still require a valid local date.
    plantingDate: z.string().refine(isIsoLocalDate, "Planting date must be a valid ISO local date").nullable().optional(),
    notes: optionalText(1000),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, "At least one plantation field must be supplied");

export const CropInputSchema = z
  .object({
    name: requiredText(120),
    localName: optionalText(120),
    cropType: optionalText(120),
    active: z.boolean().optional(),
  })
  .strict();
export const CropUpdateSchema = CropInputSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  "At least one crop field must be supplied",
);

export const FarmAreaInputSchema = z
  .object({
    code: requiredText(40),
    name: requiredText(120),
    description: optionalText(500),
    active: z.boolean().optional(),
  })
  .strict();
export const FarmAreaUpdateSchema = FarmAreaInputSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  "At least one farm area field must be supplied",
);

export type PlantationInput = z.infer<typeof PlantationInputSchema>;
export type PlantationUpdateInput = z.infer<typeof PlantationUpdateSchema>;
export type CropInput = z.infer<typeof CropInputSchema>;
export type CropUpdateInput = z.infer<typeof CropUpdateSchema>;
export type FarmAreaInput = z.infer<typeof FarmAreaInputSchema>;
export type FarmAreaUpdateInput = z.infer<typeof FarmAreaUpdateSchema>;
