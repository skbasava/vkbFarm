import { z } from "zod";
import { isIsoLocalDate } from "../utils/dates";
import { rupeesToPaise } from "../utils/money";

const DecimalAmountSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)(?:\.\d{1,2})?$/,
    "Amount must be a decimal string with at most two decimal places",
  )
  .refine((value) => {
    try {
      return rupeesToPaise(value) > 0;
    } catch {
      return false;
    }
  }, "Amount must be greater than zero");

const OptionalTextSchema = z.string().trim().max(500).nullable().optional();

export const ExpenseInputSchema = z
  .object({
    expenseDate: z
      .string()
      .refine(isIsoLocalDate, "Expense date must be a valid ISO local date"),
    amount: DecimalAmountSchema,
    categoryId: z.string().trim().min(1),
    paidByPersonId: z.string().trim().min(1),
    description: z.string().trim().min(1).max(500),
    expenseClass: z.enum(["CAPEX", "OPEX"]).nullable(),
    paidTo: OptionalTextSchema,
    notes: OptionalTextSchema,
    cropId: z.string().trim().min(1).nullable().optional(),
    isShared: z.boolean().default(true),
  })
  .strict();

export const ExpenseUpdateSchema = ExpenseInputSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  "At least one expense field must be supplied",
);

export type ExpenseInput = z.infer<typeof ExpenseInputSchema>;
export type ExpenseUpdateInput = z.infer<typeof ExpenseUpdateSchema>;

export const EXPENSE_SORT_FIELDS = [
  "expenseDate",
  "amount",
  "description",
  "createdAt",
] as const;
export type ExpenseSortField = (typeof EXPENSE_SORT_FIELDS)[number];

export type ExpenseFilters = {
  page: number;
  pageSize: number;
  search?: string;
  paidByPersonId?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  expenseClass?: "CAPEX" | "OPEX" | "null";
  minAmountPaise?: number;
  maxAmountPaise?: number;
  sortBy: ExpenseSortField;
  sortOrder: "asc" | "desc";
};
