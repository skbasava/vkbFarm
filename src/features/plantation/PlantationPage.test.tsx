import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url) === "/api/v1/identity") return Promise.resolve(new Response(JSON.stringify({ data: { email: "owner@vkb.test", role: "editor" } })));
      if (String(url) === "/api/v1/plantation/summary") return Promise.resolve(new Response(JSON.stringify({ data: { areas: [{ id: "area_mt", code: "MT", name: "MT", active: true }, { id: "area_sk", code: "SK", name: "SK", active: true }], rows: [{ cropId: "banana", cropName: "Banana", quantities: { area_mt: 42, area_sk: 8 }, totalQuantity: 50 }], areaTotals: { area_mt: 42, area_sk: 8 }, totalQuantity: 50 } })));
      if (String(url).startsWith("/api/v1/plantation/crops")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "banana", name: "Banana", active: true }] })));
      if (String(url).startsWith("/api/v1/plantation/farm-areas")) return Promise.resolve(new Response(JSON.stringify({ data: [{ id: "area_mt", code: "MT", name: "MT", active: true }, { id: "area_sk", code: "SK", name: "SK", active: true }] })));
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("columnheader", { name: "MT" })).toBeVisible();
    expect(screen.getAllByText("Banana")).toHaveLength(2);
    expect(screen.getAllByText("50").length).toBeGreaterThanOrEqual(2);
    await user.click(screen.getByRole("button", { name: /add plantation/i }));
    expect(screen.getByRole("dialog", { name: /record plantation/i })).toBeVisible();
    expect(screen.getByLabelText("Crop")).toBeVisible();
  });

  it("offers the first entry from an empty state and hides it from viewers", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url) === "/api/v1/identity") return Promise.resolve(new Response(JSON.stringify({ data: { email: "viewer@vkb.test", role: "viewer" } })));
      if (String(url) === "/api/v1/plantation/summary") return Promise.resolve(new Response(JSON.stringify({ data: { areas: [], rows: [], areaTotals: {}, totalQuantity: 0 } })));
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    renderPage();
    expect(await screen.findByRole("heading", { name: /no plantation records yet/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /add plantation/i })).not.toBeInTheDocument();
  });
});
