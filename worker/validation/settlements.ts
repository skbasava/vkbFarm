import { z } from "zod";
import { isIsoLocalDate } from "../utils/dates";

const PositiveDecimalAmountSchema = z
  .string()
  .regex(
    /^(?:0\.(?:0[1-9]|[1-9]\d?)|[1-9]\d*(?:\.\d{1,2})?)$/,
    "Amount must be a positive decimal string with at most two decimal places",
  );

export const SettlementInputSchema = z
  .object({
    fromPersonId: z.string().trim().min(1),
    toPersonId: z.string().trim().min(1),
    amount: PositiveDecimalAmountSchema,
    settlementDate: z
      .string()
      .refine(isIsoLocalDate, "Settlement date must be a valid ISO local date"),
    remarks: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((input) => input.fromPersonId !== input.toPersonId, {
    message: "Settlement people must be distinct",
    path: ["toPersonId"],
  });

export type SettlementInput = z.infer<typeof SettlementInputSchema>;
