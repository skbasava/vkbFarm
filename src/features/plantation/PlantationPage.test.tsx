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
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("opens the create-cohort dialog for the direct /plantation/new route", async () => {
    window.history.replaceState({}, "", "/plantation/new");
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const path = String(url);
      if (path === "/api/v1/identity") return Promise.resolve(new Response(JSON.stringify({ data: { email: "editor@vkb.test", role: "editor" } })));
      if (path === "/api/v1/plantation/summary") return Promise.resolve(new Response(JSON.stringify({ data: { areas: [], rows: [], areaTotals: {}, totalQuantity: 0, cohortCount: 0, cohorts: [] } })));
      if (path.startsWith("/api/v1/plantation/crops")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "banana", name: "Banana", active: true }] })));
      if (path.startsWith("/api/v1/plantation/farm-areas")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "area_mt", code: "MT", name: "MT", active: true }] })));
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    renderPage();

    expect(await screen.findByRole("dialog", { name: "Record crop cohort" })).toBeVisible();
  });

  it("associates plantation validation messages with authoritative fields", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const path = String(url);
      if (path === "/api/v1/identity") return Promise.resolve(new Response(JSON.stringify({ data: { email: "editor@vkb.test", role: "editor" } })));
      if (path === "/api/v1/plantation/summary") return Promise.resolve(new Response(JSON.stringify({ data: { areas: [], rows: [], areaTotals: {}, totalQuantity: 0, cohortCount: 0, cohorts: [] } })));
      if (path.startsWith("/api/v1/plantation/crops")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "banana", name: "Banana", active: true }] })));
      if (path.startsWith("/api/v1/plantation/farm-areas")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "area_mt", code: "MT", name: "MT", active: true }] })));
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    const user = userEvent.setup();
    renderPage();
    await user.click((await screen.findAllByRole("button", { name: /record cohort/i }))[0]!);
    await user.selectOptions(screen.getByLabelText("Crop"), "");
    await user.click(screen.getByRole("button", { name: "Record cohort" }));

    expect(screen.getByLabelText("Crop")).toHaveAttribute("aria-describedby", "plantation-crop-error");
    expect(screen.getByLabelText("Crop")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Choose a crop.")).toBeVisible();
  });

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

  it("loads reference options beyond the first hundred records", async () => {
    const crops = Array.from({ length: 101 }, (_, index) => ({ id: `crop-${index + 1}`, name: `Crop ${index + 1}`, active: true }));
    const areas = Array.from({ length: 101 }, (_, index) => ({ id: `area-${index + 1}`, code: `A${index + 1}`, name: `Area ${index + 1}`, active: true }));
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const path = String(url);
      if (path === "/api/v1/identity") return Promise.resolve(new Response(JSON.stringify({ data: { email: "editor@vkb.test", role: "editor" } })));
      if (path === "/api/v1/plantation/summary") return Promise.resolve(new Response(JSON.stringify({ data: { areas: [], rows: [], areaTotals: {}, totalQuantity: 0, cohortCount: 0, cohorts: [] } })));
      if (path.startsWith("/api/v1/plantation/crops")) return Promise.resolve(new Response(JSON.stringify({ data: path.includes("page=2") ? crops.slice(100) : crops.slice(0, 100) })));
      if (path.startsWith("/api/v1/plantation/farm-areas")) return Promise.resolve(new Response(JSON.stringify({ data: path.includes("page=2") ? areas.slice(100) : areas.slice(0, 100) })));
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: /no plantation records yet/i });
    await user.click(screen.getAllByRole("button", { name: /record cohort/i })[0]!);
    expect(await screen.findByRole("option", { name: "Crop 101" })).toBeVisible();
    expect(screen.getByRole("option", { name: "A101 · Area 101" })).toBeVisible();
  });

  it("preserves an unavailable imported planting date while editing a cohort", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const path = String(url);
      if (path === "/api/v1/identity") return Promise.resolve(new Response(JSON.stringify({ data: { email: "editor@vkb.test", role: "editor" } })));
      if (path === "/api/v1/plantation/summary") return Promise.resolve(new Response(JSON.stringify({ data: { areas: [{ id: "area_mt", code: "MT", name: "MT", active: true }], rows: [{ cropId: "banana", cropName: "Banana", quantities: { area_mt: 12 }, totalQuantity: 12 }], areaTotals: { area_mt: 12 }, totalQuantity: 12, cohortCount: 1, cohorts: [{ id: "legacy-1", cropId: "banana", cropName: "Banana", farmAreaId: "area_mt", farmAreaCode: "MT", farmAreaName: "MT", quantity: 12, plantingDate: null, notes: "Imported", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }] } })));
      if (path.startsWith("/api/v1/plantation/crops")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "banana", name: "Banana", active: true }] })));
      if (path.startsWith("/api/v1/plantation/farm-areas")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "area_mt", code: "MT", name: "MT", active: true }] })));
      if (path === "/api/v1/plantation/legacy-1" && init?.method === "PATCH") return Promise.resolve(new Response(JSON.stringify({ data: { id: "legacy-1" } })));
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /edit banana cohort legacy-1/i }));
    expect(screen.getByLabelText("Planting date")).toHaveValue("");
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "15");
    await user.click(screen.getByRole("button", { name: /save cohort changes/i }));
    await waitFor(() => {
      const patchCall = fetchSpy.mock.calls.find(([url, init]) => String(url) === "/api/v1/plantation/legacy-1" && init?.method === "PATCH");
      expect(patchCall).toBeDefined();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({ quantity: 15, plantingDate: null, notes: "Imported" });
    });
  });
});
