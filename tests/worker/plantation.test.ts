import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../../worker/index";
import type { Bindings } from "../../worker/types";

const jsonHeaders = { "content-type": "application/json" };

async function request(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`http://example.com/api/v1/plantation${path}`, init);
}

async function createCrop(name: string): Promise<Record<string, unknown>> {
  const response = await request("/crops", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ name }),
  });
  expect(response.status).toBe(201);
  return (await response.json() as { data: Record<string, unknown> }).data;
}

async function createPlantation(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const crop = await createCrop("Banana");
  const response = await request("", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_mt", quantity: 42, plantingDate: "2026-08-01", ...overrides }),
  });
  expect(response.status).toBe(201);
  return (await response.json() as { data: Record<string, unknown> }).data;
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM audit_log"),
    env.DB.prepare("DELETE FROM plantation_inventory"),
    env.DB.prepare("DELETE FROM crops"),
    env.DB.prepare("DELETE FROM farm_areas WHERE id NOT IN (?, ?)").bind("area_mt", "area_sk"),
  ]);
});

describe("plantation API", () => {
  it("creates crops with preserved display names and retrieves seeded MT and SK areas", async () => {
    const crop = await createCrop("  Nati   Banana ");
    expect(crop).toMatchObject({ name: "  Nati   Banana ", active: true });

    const areas = await request("/farm-areas?pageSize=100");
    const areaBody = await areas.json() as { data: Record<string, unknown>[] };
    expect(areaBody.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "area_mt", code: "MT", name: "MT", active: true }),
        expect.objectContaining({ id: "area_sk", code: "SK", name: "SK", active: true }),
    ]));
  });

  it("keeps separate cohorts for the same crop and area and returns SQL-owned matrix totals", async () => {
    const crop = await createCrop("Banana");
    const first = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_mt", quantity: 42, plantingDate: "2026-08-01" }) });
    const second = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_mt", quantity: 8, plantingDate: "2026-09-01" }) });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const response = await request("/summary");
    await expect(response.json()).resolves.toMatchObject({
      data: {
        totalQuantity: 50,
        rows: [{ cropName: "Banana", totalQuantity: 50, quantities: { area_mt: 50 } }],
        areaTotals: { area_mt: 50, area_sk: 0 },
      },
    });
    const listed = await request(`?cropId=${String(crop.id)}&farmAreaId=area_mt`);
    await expect(listed.json()).resolves.toMatchObject({ meta: { total: 2 } });
  });

  it("rejects invalid manual quantities and unavailable planting dates", async () => {
    const crop = await createCrop("Banana");
    for (const quantity of [-1, 1.5, "2"]) {
      const response = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_mt", quantity, plantingDate: "2026-08-01" }) });
      expect(response.status).toBe(422);
    }
    const response = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_mt", quantity: 1, plantingDate: null }) });
    expect(response.status).toBe(422);
  });

  it("updates and soft deletes cohorts with an atomic audit trail", async () => {
    const plantation = await createPlantation();
    const updated = await request(`/${String(plantation.id)}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ quantity: 47 }) });
    await expect(updated.json()).resolves.toMatchObject({ data: { quantity: 47 } });
    const deleted = await request(`/${String(plantation.id)}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);
    const stored = await env.DB.prepare("SELECT deleted_at FROM plantation_inventory WHERE id = ?").bind(plantation.id).first<{ deleted_at: string | null }>();
    expect(stored?.deleted_at).not.toBeNull();
    const audit = await env.DB.prepare("SELECT action FROM audit_log WHERE entity_id = ? ORDER BY created_at, id").bind(plantation.id).all<{ action: string }>();
    expect(audit.results.map((entry) => entry.action)).toEqual(expect.arrayContaining(["CREATE", "UPDATE", "DELETE"]));
  });

  it("rejects inactive crop and area references", async () => {
    const crop = await createCrop("Banana");
    await env.DB.batch([
      env.DB.prepare("UPDATE crops SET active = 0 WHERE id = ?").bind(crop.id),
      env.DB.prepare("UPDATE farm_areas SET active = 0 WHERE id = ?").bind("area_sk"),
    ]);
    const cropResponse = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_mt", quantity: 1, plantingDate: "2026-08-01" }) });
    const areaResponse = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_sk", quantity: 1, plantingDate: "2026-08-01" }) });
    expect(cropResponse.status).toBe(409);
    expect(areaResponse.status).toBe(409);
  });

  it("binds filter values instead of interpreting injected filter text as SQL", async () => {
    await createPlantation();
    const response = await request("?cropId=missing%27%20OR%201%3D1%20--");
    await expect(response.json()).resolves.toMatchObject({ data: [], meta: { total: 0 } });
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM plantation_inventory").first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it("protects reference administration and cohort writes by role", async () => {
    await env.DB.prepare("INSERT INTO people (id, name, email, app_role) VALUES (?, ?, ?, ?)").bind("plantation_viewer", "Viewer", "plantation-viewer@vkb.test", "viewer").run();
    const bindings: Bindings = { ...env, ENVIRONMENT: "production", RECEIPTS: env.RECEIPTS };
    const cropResponse = await app.request("http://example.com/api/v1/plantation/crops", { method: "POST", headers: { ...jsonHeaders, "Cf-Access-Authenticated-User-Email": "plantation-viewer@vkb.test" }, body: JSON.stringify({ name: "Blocked" }) }, bindings);
    expect(cropResponse.status).toBe(403);
  });
});
