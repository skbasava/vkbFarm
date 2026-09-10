export type ExpenseClass = "CAPEX" | "OPEX";

export type Expense = {
  id: string;
  expenseDate: string;
  description: string;
  amountPaise: number;
  paidByPersonId: string;
  paidByPersonName: string;
  categoryId: string | null;
  categoryName: string | null;
  expenseClass: ExpenseClass | null;
  paidTo: string | null;
  notes: string | null;
  cropId: string | null;
  cropName: string | null;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseCategory = {
  id: string;
  name: string;
  defaultExpenseClass: ExpenseClass | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Person = {
  id: string;
  name: string;
  email: string | null;
  farmRole: string;
  appRole: "admin" | "editor" | "viewer";
  participatesInSharedExpenses: boolean;
  participant: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseFilters = {
  page: number;
  pageSize: 25 | 50 | 100;
  search?: string;
  paidByPersonId?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  expenseClass?: ExpenseClass | "null";
  minAmount?: string;
  maxAmount?: string;
  sortBy: "expenseDate" | "amount" | "description" | "createdAt";
  sortOrder: "asc" | "desc";
};

export type ExpenseInput = {
  expenseDate: string;
  amount: string;
  categoryId: string;
  paidByPersonId: string;
  description: string;
  expenseClass: ExpenseClass | null;
  paidTo: string | null;
  notes: string | null;
  cropId?: string | null;
  isShared: boolean;
};

export type ExpenseListResult = { data: Expense[]; meta: { page: number; pageSize: number; total: number } };
