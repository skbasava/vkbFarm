import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./api-client";

describe("apiFetch offline behavior", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fails an offline request immediately without dispatching a write", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);

    await expect(apiFetch("/api/v1/expenses", { method: "POST" })).rejects.toMatchObject({
      code: "OFFLINE",
      offline: true,
      status: 0,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
