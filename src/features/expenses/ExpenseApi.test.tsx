import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "../../lib/query-keys";
import { expenseKeys, useCreateExpense } from "./api";
import type { ExpenseFilters, ExpenseInput } from "./types";

const filters: ExpenseFilters = { page: 1, pageSize: 25, sortBy: "expenseDate", sortOrder: "desc" };
const input: ExpenseInput = { expenseDate: "2026-09-10", amount: "125.50", categoryId: "seed", paidByPersonId: "satish", description: "Potting mix", expenseClass: "OPEX", paidTo: null, notes: null, isShared: true };

function CreateExpenseButton() {
  const createExpense = useCreateExpense();
  return <button onClick={() => createExpense.mutate(input)} type="button">Create expense</button>;
}

describe("expense mutations", () => {
  it("invalidates ledger, detail, dashboard, settlement, and report consumers after creation", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const affectedKeys = [expenseKeys.list(filters), expenseKeys.detail("expense-1"), queryKeys.dashboard, queryKeys.settlements, queryKeys.reports(), ["reports", "expenses"], queryKeys.expenseContributionReport, queryKeys.expenseCashflowReport] as const;
    affectedKeys.forEach((key) => client.setQueryData(key, { stale: false }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { id: "expense-1" } }), { status: 201 }));
    const user = userEvent.setup();
    render(<QueryClientProvider client={client}><CreateExpenseButton /></QueryClientProvider>);

    await user.click(screen.getByRole("button", { name: "Create expense" }));

    await waitFor(() => affectedKeys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true)));
  });
});
