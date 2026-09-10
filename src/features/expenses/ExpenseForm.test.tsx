import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpenseForm } from "./ExpenseForm";

const todayInKolkata = "2026-09-10";

function renderForm(props: Partial<React.ComponentProps<typeof ExpenseForm>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><ExpenseForm mode="create" {...props} /></MemoryRouter></QueryClientProvider>);
}

function respond(url: string, init?: RequestInit) {
  if (url.startsWith("/api/v1/categories")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "seed", name: "Seeds", defaultExpenseClass: "OPEX", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" }], meta: { page: 1, pageSize: 100, total: 1 } }), { status: 200 }));
  if (url.startsWith("/api/v1/people")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "satish", name: "Satish", email: null, farmRole: "owner", appRole: "admin", participatesInSharedExpenses: true, participant: true, active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" }], meta: { page: 1, pageSize: 100, total: 1 } }), { status: 200 }));
  if (url === "/api/v1/expenses" && init?.method === "POST") return Promise.resolve(new Response(JSON.stringify({ data: { id: "expense-1" } }), { status: 201 }));
  return Promise.reject(new Error(`Unexpected request: ${url}`));
}

describe("ExpenseForm", () => {
  afterEach(() => vi.restoreAllMocks());

  it("defaults the entry date to today's Asia/Kolkata calendar date", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(respond as typeof fetch);
    renderForm();

    expect(await screen.findByLabelText("Date")).toHaveValue(todayInKolkata);
  });

  it("blocks empty and imprecise core values before a ledger request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(respond as typeof fetch);
    const user = userEvent.setup();
    renderForm();

    await screen.findByRole("option", { name: "Seeds" });
    await user.click(screen.getByRole("button", { name: /save expense/i }));

    expect(await screen.findByText("Amount is required")).toBeVisible();
    expect(screen.getByText("Category is required")).toBeVisible();
    expect(screen.getByText("Paid by is required")).toBeVisible();
    expect(screen.getByText("Description is required")).toBeVisible();
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await user.type(screen.getByLabelText("Amount"), "10.999");
    await user.click(screen.getByRole("button", { name: /save expense/i }));
    expect(await screen.findByText("Enter an amount with up to two decimal places")).toBeVisible();
  });

  it("serializes a valid amount as a decimal string and offers Add another after saving", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(respond as typeof fetch);
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("option", { name: "Seeds" });

    await user.type(screen.getByLabelText("Amount"), "125.50");
    await user.selectOptions(screen.getByLabelText("Category"), "seed");
    await user.click(screen.getByRole("button", { name: "Satish" }));
    await user.type(screen.getByLabelText("Description"), "Potting mix");
    await user.click(screen.getByRole("button", { name: /save expense/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/v1/expenses", expect.objectContaining({ method: "POST" })));
    const request = fetchSpy.mock.calls.find(([url, init]) => url === "/api/v1/expenses" && init?.method === "POST");
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ amount: "125.50", description: "Potting mix" });
    expect(await screen.findByRole("button", { name: /add another/i })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /add another/i }));
    expect(screen.getByLabelText("Amount")).toHaveValue("");
  });

  it("shows server field errors without discarding the entry", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (String(url) === "/api/v1/expenses" && init?.method === "POST") return Promise.resolve(new Response(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "The expense input is invalid", details: { issues: [{ path: "description", message: "Description has already been archived" }] } } }), { status: 422 }));
      return respond(String(url), init);
    });
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("option", { name: "Seeds" });
    await user.type(screen.getByLabelText("Amount"), "50");
    await user.selectOptions(screen.getByLabelText("Category"), "seed");
    await user.click(screen.getByRole("button", { name: "Satish" }));
    await user.type(screen.getByLabelText("Description"), "Potting mix");
    await user.click(screen.getByRole("button", { name: /save expense/i }));

    expect(await screen.findByText("Description has already been archived")).toBeVisible();
    expect(screen.getByLabelText("Description")).toHaveValue("Potting mix");
  });
});
