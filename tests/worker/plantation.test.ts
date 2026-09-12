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
    env.DB.prepare("UPDATE farm_areas SET active = 1 WHERE id IN (?, ?)").bind("area_mt", "area_sk"),
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

  it("keeps separate same-day cohorts and summarizes the same crop across MT and SK", async () => {
    const crop = await createCrop("Banana");
    const first = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_mt", quantity: 42, plantingDate: "2026-08-01" }) });
    const second = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_mt", quantity: 8, plantingDate: "2026-08-01" }) });
    const third = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_sk", quantity: 5, plantingDate: "2026-08-01" }) });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(third.status).toBe(201);

    const response = await request("/summary");
    await expect(response.json()).resolves.toMatchObject({
      data: {
        totalQuantity: 55,
        cohortCount: 3,
        rows: [{ cropName: "Banana", totalQuantity: 55, quantities: { area_mt: 50, area_sk: 5 } }],
        areaTotals: { area_mt: 50, area_sk: 5 },
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
    const invalidDate = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_mt", quantity: 1, plantingDate: "2026-02-30" }) });
    expect(invalidDate.status).toBe(422);
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

  it("retains an imported null planting date when an editor changes its quantity or notes", async () => {
    const crop = await createCrop("Banana");
    await env.DB.prepare("INSERT INTO plantation_inventory (id, crop_id, farm_area_id, quantity, planting_date, notes, source) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("legacy_cohort", crop.id, "area_mt", 12, null, "Imported row", "EXCEL").run();
    const response = await request("/legacy_cohort", { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ quantity: 15, notes: "Counted again", plantingDate: null }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { quantity: 15, notes: "Counted again", plantingDate: null } });

    const manualResponse = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_mt", quantity: 2, plantingDate: "2026-08-02" }) });
    expect(manualResponse.status).toBe(201);
    const manual = (await manualResponse.json() as { data: Record<string, unknown> }).data;
    const rejected = await request(`/${String(manual.id)}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ plantingDate: null }) });
    expect(rejected.status).toBe(422);
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

  it("retains zero-quantity cohorts and inactive historical labels in the unbounded summary", async () => {
    const crop = await createCrop("Banana");
    const created = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_mt", quantity: 0, plantingDate: "2026-08-01" }) });
    expect(created.status).toBe(201);
    await env.DB.batch([
      env.DB.prepare("UPDATE crops SET active = 0 WHERE id = ?").bind(crop.id),
      env.DB.prepare("UPDATE farm_areas SET active = 0 WHERE id = ?").bind("area_mt"),
    ]);
    const summary = await request("/summary");
    await expect(summary.json()).resolves.toMatchObject({
      data: {
        cohortCount: 1,
        rows: [{ cropId: crop.id, cropName: "Banana", totalQuantity: 0 }],
        areas: expect.arrayContaining([expect.objectContaining({ id: "area_mt", code: "MT", active: false })]),
        cohorts: [expect.objectContaining({ cropName: "Banana", farmAreaCode: "MT", quantity: 0 })],
      },
    });
  });

  it("includes active farm areas beyond the first hundred in summary matrix columns", async () => {
    const crop = await createCrop("Banana");
    const areas: D1PreparedStatement[] = [];
    for (let index = 0; index < 101; index += 1) {
      areas.push(env.DB.prepare("INSERT INTO farm_areas (id, code, name, normalized_name) VALUES (?, ?, ?, ?)").bind(`area_extra_${index}`, `X${index}`, `Extra ${index}`, `extra ${index}`));
    }
    await env.DB.batch(areas);
    const response = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_extra_100", quantity: 3, plantingDate: "2026-08-01" }) });
    expect(response.status).toBe(201);
    const summary = await request("/summary");
    const body = await summary.json() as { data: { areas: Array<{ id: string }>; rows: Array<{ quantities: Record<string, number> }> } };
    expect(body.data.areas).toHaveLength(103);
    expect(body.data.rows[0]?.quantities.area_extra_100).toBe(3);
  });

  it("binds filter values instead of interpreting injected filter text as SQL", async () => {
    await createPlantation();
    const response = await request("?cropId=missing%27%20OR%201%3D1%20--");
    await expect(response.json()).resolves.toMatchObject({ data: [], meta: { total: 0 } });
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM plantation_inventory").first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it("allows editor and admin mutations while denying viewers plantation writes", async () => {
    const crop = await createCrop("Banana");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO people (id, name, email, app_role) VALUES (?, ?, ?, ?)").bind("plantation_viewer", "Viewer", "plantation-viewer@vkb.test", "viewer"),
      env.DB.prepare("INSERT INTO people (id, name, email, app_role) VALUES (?, ?, ?, ?)").bind("plantation_editor", "Editor", "plantation-editor@vkb.test", "editor"),
      env.DB.prepare("INSERT INTO people (id, name, email, app_role) VALUES (?, ?, ?, ?)").bind("plantation_admin", "Admin", "plantation-admin@vkb.test", "admin"),
    ]);
    const bindings: Bindings = { ...env, ENVIRONMENT: "production", RECEIPTS: env.RECEIPTS };
    const cropResponse = await app.request("http://example.com/api/v1/plantation/crops", { method: "POST", headers: { ...jsonHeaders, "Cf-Access-Authenticated-User-Email": "plantation-viewer@vkb.test" }, body: JSON.stringify({ name: "Blocked" }) }, bindings);
    expect(cropResponse.status).toBe(403);
    const viewerWrite = await app.request("http://example.com/api/v1/plantation", { method: "POST", headers: { ...jsonHeaders, "Cf-Access-Authenticated-User-Email": "plantation-viewer@vkb.test" }, body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_mt", quantity: 1, plantingDate: "2026-08-01" }) }, bindings);
    expect(viewerWrite.status).toBe(403);
    const editorWrite = await app.request("http://example.com/api/v1/plantation", { method: "POST", headers: { ...jsonHeaders, "Cf-Access-Authenticated-User-Email": "plantation-editor@vkb.test" }, body: JSON.stringify({ cropId: crop.id, farmAreaId: "area_mt", quantity: 1, plantingDate: "2026-08-01" }) }, bindings);
    expect(editorWrite.status).toBe(201);
    const adminReferenceWrite = await app.request("http://example.com/api/v1/plantation/crops", { method: "POST", headers: { ...jsonHeaders, "Cf-Access-Authenticated-User-Email": "plantation-admin@vkb.test" }, body: JSON.stringify({ name: "Admin crop" }) }, bindings);
    expect(adminReferenceWrite.status).toBe(201);
  });
});
