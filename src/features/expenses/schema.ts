import type { ExpenseInput } from "./types";

export type ExpenseFormValues = Omit<ExpenseInput, "paidTo" | "notes"> & { paidTo: string; notes: string };
export type ExpenseFormErrors = Partial<Record<keyof ExpenseFormValues, string>>;

const amountPattern = /^(0|[1-9]\d*)(?:\.\d{1,2})?$/;

export function todayInKolkata(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function validateExpense(values: ExpenseFormValues): ExpenseFormErrors {
  const errors: ExpenseFormErrors = {};
  if (!values.amount) errors.amount = "Amount is required";
  else if (!amountPattern.test(values.amount)) errors.amount = "Enter an amount with up to two decimal places";
  else if (Number(values.amount) <= 0) errors.amount = "Amount must be greater than zero";
  if (!values.categoryId) errors.categoryId = "Category is required";
  if (!values.paidByPersonId) errors.paidByPersonId = "Paid by is required";
  if (!values.description.trim()) errors.description = "Description is required";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.expenseDate)) errors.expenseDate = "Use a valid date";
  return errors;
}

export function toExpenseInput(values: ExpenseFormValues): ExpenseInput {
  return { ...values, description: values.description.trim(), paidTo: values.paidTo.trim() || null, notes: values.notes.trim() || null };
}
