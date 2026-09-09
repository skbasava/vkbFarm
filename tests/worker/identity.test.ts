import { env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../../worker/middleware/errors";
import { getIdentity, identityMiddleware } from "../../worker/middleware/identity";
import { requireRole } from "../../worker/middleware/roles";
import type { AppEnv, Bindings } from "../../worker/types";

function createProtectedApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use("*", identityMiddleware);
  app.get("/whoami", (c) => c.json({ data: getIdentity(c) }));
  app.post("/write", requireRole("editor"), (c) => c.json({ data: { ok: true } }));
  app.get("/fails", () => {
    throw new Error("internal database path");
  });
  return app;
}

function bindings(overrides: Partial<Bindings>): Bindings {
  return { ...env, ENVIRONMENT: "production", ...overrides };
}

describe("identity middleware", () => {
  it("supplies the explicit local development admin identity", async () => {
    const response = await createProtectedApp().request(
      "http://localhost/whoami",
      undefined,
      bindings({ ENVIRONMENT: "local", DEV_AUTH_ENABLED: "true" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { email: "dev@vkb.local", role: "admin" },
    });
  });

  it("fails closed in production when the Access identity header is absent", async () => {
    const response = await createProtectedApp().request(
      "http://localhost/whoami",
      undefined,
      bindings({}),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: "UNAUTHORIZED", message: "Authentication is required" },
    });
  });

  it("prevents Access-authenticated viewers from writing", async () => {
    await env.DB.prepare(
      "INSERT INTO people (id, name, email, app_role) VALUES (?, ?, ?, ?)",
    )
      .bind("person_viewer", "Viewer", "viewer@vkb.test", "viewer")
      .run();

    const response = await createProtectedApp().request(
      "http://localhost/write",
      {
        method: "POST",
        headers: { "Cf-Access-Authenticated-User-Email": "viewer@vkb.test" },
      },
      bindings({}),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: "FORBIDDEN", message: "You do not have permission to perform this action" },
    });
  });

  it("sanitizes unexpected errors without a stack trace", async () => {
    const response = await createProtectedApp().request(
      "http://localhost/fails",
      undefined,
      bindings({ ENVIRONMENT: "local", DEV_AUTH_ENABLED: "true" }),
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    });
    expect(JSON.stringify(body)).not.toContain("stack");
    expect(JSON.stringify(body)).not.toContain("internal database path");
  });
});
