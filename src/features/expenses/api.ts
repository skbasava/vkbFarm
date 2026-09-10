import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "../../lib/api-client";
import { queryKeys } from "../../lib/query-keys";
import type { Expense, ExpenseCategory, ExpenseFilters, ExpenseInput, ExpenseListResult, Person } from "./types";

export const expenseKeys = {
  all: ["expenses"] as const,
  list: (filters: ExpenseFilters) => ["expenses", "list", filters] as const,
  detail: (id: string) => ["expenses", "detail", id] as const,
};

export function listPath(search: URLSearchParams): string {
  const params = new URLSearchParams(search);
  if (!params.get("page")) params.set("page", "1");
  return `/api/v1/expenses?${params.toString()}`;
}

function filtersFromSearch(search: URLSearchParams): ExpenseFilters {
  const pageSize = Number(search.get("pageSize") ?? 25);
  return {
    page: Number(search.get("page") ?? 1),
    pageSize: pageSize === 50 || pageSize === 100 ? pageSize : 25,
    ...(search.get("search") ? { search: search.get("search")! } : {}),
    ...(search.get("paidByPersonId") ? { paidByPersonId: search.get("paidByPersonId")! } : {}),
    ...(search.get("dateFrom") ? { dateFrom: search.get("dateFrom")! } : {}),
    ...(search.get("dateTo") ? { dateTo: search.get("dateTo")! } : {}),
    ...(search.get("categoryId") ? { categoryId: search.get("categoryId")! } : {}),
    ...(search.get("expenseClass") ? { expenseClass: search.get("expenseClass") as ExpenseFilters["expenseClass"] } : {}),
    ...(search.get("minAmount") ? { minAmount: search.get("minAmount")! } : {}),
    ...(search.get("maxAmount") ? { maxAmount: search.get("maxAmount")! } : {}),
    sortBy: (search.get("sortBy") as ExpenseFilters["sortBy"]) || "expenseDate",
    sortOrder: search.get("sortOrder") === "asc" ? "asc" : "desc",
  };
}

async function fetchExpenseList(search: URLSearchParams): Promise<ExpenseListResult> {
  const response = await fetch(listPath(search));
  const body = await response.json().catch(() => undefined) as ExpenseListResult | { error?: { code: string; message: string; details?: Record<string, unknown> } } | undefined;
  if (!response.ok || !body || !("data" in body) || !Array.isArray(body.data)) {
    const error = body && "error" in body ? body.error : undefined;
    throw new ApiError({ status: response.status, code: error?.code ?? "REQUEST_FAILED", message: error?.message ?? "Could not load expenses", details: error?.details });
  }
  return body;
}

export function useExpenses(search: URLSearchParams) {
  const filters = filtersFromSearch(search);
  return useQuery({ queryKey: expenseKeys.list(filters), queryFn: () => fetchExpenseList(search) });
}

export function useExpense(id: string) {
  return useQuery({ queryKey: expenseKeys.detail(id), queryFn: () => apiFetch<Expense>(`/api/v1/expenses/${id}`), enabled: Boolean(id) });
}

export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: () => apiFetch<ExpenseCategory[]>("/api/v1/categories?pageSize=100") });
}

export function usePeople() {
  return useQuery({ queryKey: queryKeys.people, queryFn: () => apiFetch<Person[]>("/api/v1/people?pageSize=100") });
}

function useExpenseInvalidation() {
  const queryClient = useQueryClient();
  return async (id?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: expenseKeys.all }),
      ...(id ? [queryClient.invalidateQueries({ queryKey: expenseKeys.detail(id) })] : []),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
      queryClient.invalidateQueries({ queryKey: queryKeys.settlements }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reports() }),
      queryClient.invalidateQueries({ queryKey: ["reports", "expenses"] }),
      queryClient.invalidateQueries({ queryKey: ["reports", "contributions"] }),
      queryClient.invalidateQueries({ queryKey: ["reports", "cashflow"] }),
    ]);
  };
}

export function useCreateExpense() {
  const invalidate = useExpenseInvalidation();
  return useMutation({ mutationFn: (input: ExpenseInput) => apiFetch<Expense>("/api/v1/expenses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }), onSuccess: async () => invalidate() });
}

export function useUpdateExpense(id: string) {
  const invalidate = useExpenseInvalidation();
  return useMutation({ mutationFn: (input: ExpenseInput) => apiFetch<Expense>(`/api/v1/expenses/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }), onSuccess: async () => invalidate(id) });
}

export function useDeleteExpense(id: string) {
  const invalidate = useExpenseInvalidation();
  return useMutation({ mutationFn: () => apiFetch<{ id: string; deletedAt: string }>(`/api/v1/expenses/${id}`, { method: "DELETE" }), onSuccess: async () => invalidate(id) });
}
