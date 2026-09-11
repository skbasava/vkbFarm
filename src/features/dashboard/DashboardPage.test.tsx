import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./DashboardPage";

const dashboard = {
  totals: { expensePaise: 375_050, currentMonthExpensePaise: 325_050, currentYearExpensePaise: 375_050, capexPaise: 200_000, opexPaise: 175_050, revenuePaise: 77_500, netCashFlowPaise: -297_550 },
  contributions: {
    totalSharedExpensePaise: 325_050,
    participants: [
      { personId: "person_mahesh", name: "Mahesh", paidPaise: 200_000, expectedPaise: 162_525, balancePaise: 37_475 },
      { personId: "person_satish", name: "Satish", paidPaise: 125_050, expectedPaise: 162_525, balancePaise: -37_475 },
    ],
    recommendedTransfers: [{ fromPersonId: "person_satish", toPersonId: "person_mahesh", amountPaise: 37_475 }],
  },
  monthlyExpenses: [{ month: "2026-08", amountPaise: 50_000 }, { month: "2026-09", amountPaise: 325_050 }],
  categoryExpenses: [{ categoryId: "category_tools", categoryName: "Tools", amountPaise: 200_000 }, { categoryId: "category_fuel", categoryName: "Fuel", amountPaise: 175_050 }],
  recentExpenses: [{ id: "expense-1", expenseDate: "2026-09-09", description: "Diesel", amountPaise: 125_050, paidByPersonName: "Satish", categoryName: "Fuel", expenseClass: "OPEX" }],
  recentHarvests: [{ id: "harvest-1", cropName: "Banana", harvestDate: null, quantity: 3, revenuePaise: 2_500, buyer: "Market" }],
  plantationSummary: { totalQuantity: 42, cropCount: 1, areaCount: 1 },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DashboardPage /></QueryClientProvider>);
}

describe("DashboardPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders dashboard skeleton cards until its single aggregated response arrives", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(() => {}));
    renderPage();
    expect(screen.getByLabelText("Loading dashboard")).toBeVisible();
    expect(screen.getAllByTestId("dashboard-skeleton-card")).toHaveLength(4);
  });

  it("formats Worker-owned KPIs, explicit settlement direction, activity, and accessible charts", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: dashboard }), { status: 200 }));
    renderPage();

    expect(await screen.findByRole("heading", { name: "Farm at a glance" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Total spend" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Net cash flow" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Plantation" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Harvest revenue" })).toBeVisible();
    expect(screen.getByText("Satish owes Mahesh ₹374.75")).toBeVisible();
    expect(screen.getByText("Mahesh receives ₹374.75")).toBeVisible();
    expect(screen.getByText("Diesel")).toBeVisible();
    expect(await screen.findByText("Date unavailable")).toBeVisible();
    expect(screen.getByText("42 plants across 1 crop and 1 area")).toBeVisible();
    expect(screen.getAllByRole("img", { name: /expense/i }).length).toBeLessThanOrEqual(4);
    expect(fetchSpy).toHaveBeenCalledWith("/api/v1/dashboard", undefined);
  });

  it("uses concise Worker-supplied chart summaries at the mobile breakpoint", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: dashboard }), { status: 200 }));
    renderPage();

    expect(await screen.findByText("Mobile expense summary")).toBeVisible();
    expect(screen.getByText("Latest period: 2026-09 · ₹3,250.5")).toBeVisible();
    expect(screen.queryByRole("img", { name: /expense/i })).not.toBeInTheDocument();
  });
});
