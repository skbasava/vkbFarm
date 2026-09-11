import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "./ReportsPage";

function respond(url: string): Response {
  if (url.startsWith("/api/v1/reports/expenses")) return new Response(JSON.stringify({ data: [{ id: "expense-1", expenseDate: "2026-09-09", description: "Diesel", amountPaise: 125_050, paidByPersonName: "Satish", categoryName: "Fuel", expenseClass: "OPEX", paidTo: null, isShared: true, notes: null }] }), { status: 200 });
  if (url.startsWith("/api/v1/reports/harvest")) return new Response(JSON.stringify({ data: [{ id: "harvest-1", cropName: "Banana", harvestDate: null, quantity: 3, revenuePaise: 2_500, buyer: "Market", notes: "Imported" }] }), { status: 200 });
  if (url.startsWith("/api/v1/reports/contributions")) return new Response(JSON.stringify({ data: { totalSharedExpensePaise: 325_050, participants: [], recommendedTransfers: [] } }), { status: 200 });
  return new Response(JSON.stringify({ data: { expensePaise: 125_050, revenuePaise: 0, netCashFlowPaise: -125_050 } }), { status: 200 });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><ReportsPage /></MemoryRouter></QueryClientProvider>);
}

describe("ReportsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("applies ISO-local date filters, discloses undated harvests, and exposes secure export links", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => Promise.resolve(respond(String(url))));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Reports" })).toBeVisible();
    expect(await screen.findByText("Date unavailable")).toBeVisible();
    expect(screen.getByRole("link", { name: "Download expenses CSV" })).toHaveAttribute("href", "/api/v1/reports/export/expenses");
    expect(screen.getByRole("link", { name: "Download harvest CSV" })).toHaveAttribute("href", "/api/v1/reports/export/harvest");

    await user.type(screen.getByLabelText("From date"), "2026-09-01");
    await user.type(screen.getByLabelText("To date"), "2026-09-30");
    await user.click(screen.getByRole("button", { name: "Apply dates" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/v1/reports/expenses?dateFrom=2026-09-01&dateTo=2026-09-30", undefined));
    expect(screen.getByRole("link", { name: "Download expenses CSV" })).toHaveAttribute("href", "/api/v1/reports/export/expenses?dateFrom=2026-09-01&dateTo=2026-09-30");
  });
});
