import { describe, expect, it } from "vitest";
import app from "../../worker/index";

describe("GET /api/v1/health", () => {
  it("returns the application identity", async () => {
    const response = await app.request("http://localhost/api/v1/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { name: "VKB Farm Manager", status: "ok" },
    });
  });
});
