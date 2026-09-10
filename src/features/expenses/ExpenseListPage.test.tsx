import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpenseListPage } from "./ExpenseListPage";

const expense = { id: "expense-1", expenseDate: "2026-09-09", description: "Diesel for tractor", amountPaise: 125050, paidByPersonId: "satish", paidByPersonName: "Satish", categoryId: "fuel", categoryName: "Fuel", expenseClass: "OPEX", paidTo: "Kaveri Fuels", notes: null, cropId: null, cropName: null, isShared: true, createdAt: "2026-09-09T09:00:00.000Z", updatedAt: "2026-09-09T09:00:00.000Z" };

function renderList(initialEntry = "/expenses?search=diesel&pageSize=50&sortBy=amount&sortOrder=asc") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initialEntry]}><ExpenseListPage /></MemoryRouter></QueryClientProvider>);
}

describe("ExpenseListPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses URL filters when loading and presents a desktop table plus mobile card row", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [expense], meta: { page: 1, pageSize: 50, total: 1 } }), { status: 200 }));
    renderList();

    expect(await screen.findByRole("columnheader", { name: "Description" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Amount" })).toBeVisible();
    expect(screen.getAllByText("Diesel for tractor")).toHaveLength(2);
    expect(screen.getAllByText("₹1,250.5")).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledWith("/api/v1/expenses?search=diesel&pageSize=50&sortBy=amount&sortOrder=asc&page=1");
  });

  it("shows a useful empty state and the permitted page-size choices", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [], meta: { page: 1, pageSize: 25, total: 0 } }), { status: 200 }));
    renderList("/expenses");

    expect(await screen.findByRole("heading", { name: /no expenses yet/i })).toBeVisible();
    expect(screen.getByRole("option", { name: "25 per page" })).toBeVisible();
    expect(screen.getByRole("option", { name: "50 per page" })).toBeVisible();
    expect(screen.getByRole("option", { name: "100 per page" })).toBeVisible();
  });
});
