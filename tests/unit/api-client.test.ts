import { afterEach, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "../../src/lib/api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("unwraps the shared success envelope", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { id: "expense_1" } })));

  await expect(apiFetch<{ id: string }>("/api/v1/expenses/expense_1")).resolves.toEqual({
    id: "expense_1",
  });
});

it("returns a safe typed error when a failed response is not JSON", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("proxy failure", { status: 502 })));

  await expect(apiFetch("/api/v1/expenses")).rejects.toMatchObject({
    code: "REQUEST_FAILED",
    message: "The request could not be completed",
    status: 502,
  } satisfies Partial<ApiError>);
});

it("marks failed requests as offline when the browser is offline", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

  await expect(apiFetch("/api/v1/expenses")).rejects.toMatchObject({
    code: "OFFLINE",
    offline: true,
    status: 0,
  } satisfies Partial<ApiError>);
});
