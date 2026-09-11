import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExpenseDetailPage from "./ExpenseDetailPage";
import ExpenseFormPage from "./ExpenseFormPage";
import { ExpenseListPage } from "./ExpenseListPage";

const expense = { id: "expense-1", expenseDate: "2026-09-09", description: "Diesel for tractor", amountPaise: 125050, paidByPersonId: "satish", paidByPersonName: "Satish", categoryId: "fuel", categoryName: "Fuel", expenseClass: "OPEX", paidTo: "Kaveri Fuels", notes: null, cropId: null, cropName: null, isShared: true, createdAt: "2026-09-09T09:00:00.000Z", updatedAt: "2026-09-09T09:00:00.000Z" };

function renderRoute(path: string, role: "admin" | "editor" | "viewer") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
    if (String(url) === "/api/v1/identity") return Promise.resolve(new Response(JSON.stringify({ data: { email: "member@vkb.test", role } }), { status: 200 }));
    if (String(url) === "/api/v1/expenses/expense-1") return Promise.resolve(new Response(JSON.stringify({ data: expense }), { status: 200 }));
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="/expenses/new" element={<ExpenseFormPage />} /><Route path="/expenses/:id/edit" element={<ExpenseFormPage />} /><Route path="/expenses/:id" element={<ExpenseDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
}

describe("expense access controls", () => {
  afterEach(() => vi.restoreAllMocks());

  it("blocks a viewer who directly visits a create route", async () => {
    renderRoute("/expenses/new", "viewer");

    expect(await screen.findByRole("heading", { name: "Read-only access" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /save expense/i })).not.toBeInTheDocument();
  });

  it("blocks a viewer who directly visits an edit route", async () => {
    renderRoute("/expenses/expense-1/edit", "viewer");

    expect(await screen.findByRole("heading", { name: "Read-only access" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
  });

  it("hides the list's add action from a viewer", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url) === "/api/v1/identity") return Promise.resolve(new Response(JSON.stringify({ data: { email: "member@vkb.test", role: "viewer" } }), { status: 200 }));
      if (String(url).startsWith("/api/v1/expenses")) return Promise.resolve(new Response(JSON.stringify({ data: [expense], meta: { page: 1, pageSize: 25, total: 1 } }), { status: 200 }));
      if (String(url).startsWith("/api/v1/categories") || String(url).startsWith("/api/v1/people")) return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/expenses"]}><ExpenseListPage /></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByRole("heading", { name: "Expenses" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /add expense/i })).not.toBeInTheDocument();
  });

  it("hides detail write actions from a viewer", async () => {
    renderRoute("/expenses/expense-1", "viewer");

    expect(await screen.findByRole("heading", { name: "Diesel for tractor" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("keeps edit and confirmed deletion available to an editor", async () => {
    const user = userEvent.setup();
    renderRoute("/expenses/expense-1", "editor");

    expect(await screen.findByRole("link", { name: /edit/i })).toHaveAttribute("href", "/expenses/expense-1/edit");
    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(screen.getByRole("dialog", { name: /delete this expense/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /delete expense/i })).toBeVisible();
  });
});
