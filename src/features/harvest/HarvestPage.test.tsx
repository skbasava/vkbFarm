import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import HarvestPage from "./HarvestPage";

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HarvestPage /></QueryClientProvider>);
}

const summary = {
  recordCount: 2,
  totalQuantity: "12",
  totalNetWeightKg: "153",
  revenuePaise: 688500,
  averagePricePaisePerKg: 4500,
  undatedCount: 1,
  undatedRevenuePaise: 10085,
  monthlyCropRevenue: [{ month: "2026-08", cropName: "Banana", revenuePaise: 678415, quantity: "11", netWeightKg: "150" }],
};
const legacyHarvest = {
  id: "legacy",
  cropId: "banana",
  cropName: "Banana",
  cropActive: true,
  harvestDate: null,
  quantity: "1",
  grossWeightKg: null,
  netWeightKg: "3",
  averageWeightKg: null,
  salePricePaisePerKg: 100,
  calculatedRevenuePaise: 300,
  actualRevenuePaise: 300,
  revenueOverrideReason: null,
  buyer: null,
  notes: null,
  source: "EXCEL",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function standardFetch(role: "editor" | "viewer" = "editor") {
  return vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
    const path = String(url);
    if (path === "/api/v1/identity") return Promise.resolve(new Response(JSON.stringify({ data: { email: `${role}@vkb.test`, role } })));
    if (path.startsWith("/api/v1/harvests/summary")) return Promise.resolve(new Response(JSON.stringify({ data: summary })));
    if (path === "/api/v1/harvests" && init?.method === "POST") return Promise.resolve(new Response(JSON.stringify({ data: legacyHarvest }), { status: 201 }));
    if (path === "/api/v1/harvests" || path.startsWith("/api/v1/harvests?")) return Promise.resolve(new Response(JSON.stringify({ data: [legacyHarvest], meta: { total: 1 } })));
    if (path.startsWith("/api/v1/plantation/crops")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "banana", name: "Banana", active: true }] })));
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
}

describe("HarvestPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows string-valued server totals, undated disclosure, both charts, filters, and an editor form", async () => {
    const fetchSpy = standardFetch();
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Harvest" })).toBeVisible();
    expect(screen.getByText("₹6,885")).toBeVisible();
    expect(screen.getByText(/1 imported record has no harvest date/i)).toBeVisible();
    expect(screen.getByText("Date unavailable · imported from Excel")).toBeVisible();
    expect(screen.getByRole("img", { name: /monthly crop revenue/i })).toBeVisible();
    expect(screen.getByRole("img", { name: /harvest quantity over time/i })).toBeVisible();

    await user.selectOptions(await screen.findByLabelText("Filter crop"), "banana");
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("cropId=banana"), undefined));
    await user.click(screen.getByRole("button", { name: /^record harvest$/i }));
    const dialog = screen.getByRole("dialog", { name: /record harvest/i });
    expect(dialog).toBeVisible();
    await user.selectOptions(within(dialog).getByLabelText("Crop"), "banana");
    await user.type(within(dialog).getByLabelText("Quantity"), "12.25");
    await user.type(within(dialog).getByLabelText("Net weight (kg)"), "10.125");
    await user.type(within(dialog).getByLabelText("Sale price (₹ per kg)"), "7.99");
    await user.click(within(dialog).getByRole("button", { name: /^record harvest$/i }));
    await waitFor(() => {
      const createCall = fetchSpy.mock.calls.find(([url, init]) => String(url) === "/api/v1/harvests" && init?.method === "POST");
      expect(createCall).toBeDefined();
      expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({ quantity: "12.25", netWeightKg: "10.125", salePricePerKg: "7.99" });
      expect(JSON.parse(String(createCall?.[1]?.body))).not.toHaveProperty("source");
    });
  });

  it("keeps the reporting view available while hiding write controls from a viewer", async () => {
    standardFetch("viewer");
    renderPage();
    expect(await screen.findByText("Date unavailable · imported from Excel")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^record harvest$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit banana harvest/i })).not.toBeInTheDocument();
  });

  it("loads crops beyond one hundred and retains an inactive selected crop label while editing", async () => {
    const crops = Array.from({ length: 100 }, (_, index) => ({ id: `crop-${index + 1}`, name: `Crop ${index + 1}`, active: true }));
    const inactive = { id: "archived-banana", name: "Archive banana", active: false };
    const historical = { ...legacyHarvest, id: "historical", cropId: inactive.id, cropName: inactive.name, cropActive: false, harvestDate: "2026-07-01", source: null };
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const path = String(url);
      if (path === "/api/v1/identity") return Promise.resolve(new Response(JSON.stringify({ data: { email: "editor@vkb.test", role: "editor" } })));
      if (path.startsWith("/api/v1/harvests/summary")) return Promise.resolve(new Response(JSON.stringify({ data: { ...summary, undatedCount: 0 } })));
      if (path === "/api/v1/harvests") return Promise.resolve(new Response(JSON.stringify({ data: [historical] })));
      if (path.includes("/api/v1/plantation/crops?page=2")) return Promise.resolve(new Response(JSON.stringify({ data: [inactive] })));
      if (path.includes("/api/v1/plantation/crops?page=1")) return Promise.resolve(new Response(JSON.stringify({ data: crops })));
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /edit archive banana harvest historical/i }));
    expect(await screen.findByRole("option", { name: "Archive banana (inactive)" })).toBeVisible();
    expect(within(screen.getByRole("dialog", { name: /edit harvest/i })).getByLabelText("Crop")).toHaveValue("archived-banana");
  });
});
