import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlantationPage } from "./PlantationPage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><PlantationPage /></QueryClientProvider>);
}

describe("PlantationPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders a dynamic crop matrix and opens a role-permitted entry form", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      if (String(url) === "/api/v1/identity") return Promise.resolve(new Response(JSON.stringify({ data: { email: "owner@vkb.test", role: "editor" } })));
      if (String(url) === "/api/v1/plantation/summary") return Promise.resolve(new Response(JSON.stringify({ data: { areas: [{ id: "area_mt", code: "MT", name: "MT", active: true }, { id: "area_sk", code: "SK", name: "SK", active: true }], rows: [{ cropId: "banana", cropName: "Banana", quantities: { area_mt: 42, area_sk: 8 }, totalQuantity: 50 }], areaTotals: { area_mt: 42, area_sk: 8 }, totalQuantity: 50, cohortCount: 1, cohorts: [{ id: "cohort-1", cropId: "banana", cropName: "Banana", farmAreaId: "area_mt", farmAreaCode: "MT", farmAreaName: "MT", quantity: 42, plantingDate: "2026-08-01", notes: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }] } })));
      if (String(url).startsWith("/api/v1/plantation/crops")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "banana", name: "Banana", active: true }] })));
      if (String(url).startsWith("/api/v1/plantation/farm-areas")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "area_mt", code: "MT", name: "MT", active: true }, { id: "area_sk", code: "SK", name: "SK", active: true }] })));
      if (String(url) === "/api/v1/plantation/cohort-1" && init?.method === "PATCH") return Promise.resolve(new Response(JSON.stringify({ data: { id: "cohort-1" } })));
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("columnheader", { name: "MT" })).toBeVisible();
    expect(screen.getAllByText("Banana").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("50").length).toBeGreaterThanOrEqual(2);
    await user.click(screen.getByRole("button", { name: /record cohort/i }));
    expect(screen.getByRole("dialog", { name: /record crop cohort/i })).toBeVisible();
    expect(screen.getByLabelText("Crop")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /close dialog/i }));
    await user.click(screen.getByRole("button", { name: /edit banana cohort cohort-1/i }));
    expect(screen.getByRole("dialog", { name: /edit crop cohort/i })).toBeVisible();
    expect(screen.getByLabelText("Farm area")).toHaveValue("area_mt");
    expect(screen.getByLabelText("Planting date")).toHaveValue("2026-08-01");
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "43");
    await user.click(screen.getByRole("button", { name: /save cohort changes/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/v1/plantation/cohort-1", expect.objectContaining({ method: "PATCH" })));
  });

  it("offers the first entry from an empty state and hides it from viewers", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url) === "/api/v1/identity") return Promise.resolve(new Response(JSON.stringify({ data: { email: "viewer@vkb.test", role: "viewer" } })));
      if (String(url) === "/api/v1/plantation/summary") return Promise.resolve(new Response(JSON.stringify({ data: { areas: [], rows: [], areaTotals: {}, totalQuantity: 0, cohortCount: 0, cohorts: [] } })));
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    renderPage();
    expect(await screen.findByRole("heading", { name: /no plantation records yet/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /record cohort/i })).not.toBeInTheDocument();
  });
});
