import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../../worker/index";
import { createImportedHarvest } from "../../worker/services/harvest-service";
import type { Bindings } from "../../worker/types";

const jsonHeaders = { "content-type": "application/json" };

async function request(path = "", init?: RequestInit): Promise<Response> {
  return SELF.fetch(`http://example.com/api/v1/harvests${path}`, init);
}

async function crop(name = "Banana"): Promise<{ id: string; name: string; active: boolean }> {
  const result = await SELF.fetch("http://example.com/api/v1/plantation/crops", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ name }) });
  expect(result.status).toBe(201);
  return (await result.json() as { data: { id: string } }).data;
}

async function createHarvest(overrides: Record<string, unknown> = {}, cropId?: string): Promise<Record<string, unknown>> {
  const selectedCropId = cropId ?? (await crop()).id;
  const response = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: selectedCropId, harvestDate: "2026-08-01", quantity: "12", grossWeightKg: "154.5", netWeightKg: "153", averageWeightKg: "12.75", salePricePerKg: "45", buyer: "Market buyer", ...overrides }) });
  expect(response.status).toBe(201);
  return (await response.json() as { data: Record<string, unknown> }).data;
}

beforeEach(async () => {
  await env.DB.prepare("DROP TRIGGER IF EXISTS block_harvest_audit").run();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM audit_log"),
    env.DB.prepare("DELETE FROM harvests"),
    env.DB.prepare("DELETE FROM crops"),
  ]);
});

describe("harvest API", () => {
  it("creates exact calculated revenue and returns summary totals", async () => {
    const harvested = await createHarvest();
    expect(harvested).toMatchObject({ harvestDate: "2026-08-01", quantity: "12", grossWeightKg: "154.5", netWeightKg: "153", averageWeightKg: "12.75", calculatedRevenuePaise: 688500, actualRevenuePaise: 688500 });

    const summary = await request("/summary");
    await expect(summary.json()).resolves.toMatchObject({ data: { recordCount: 1, totalQuantity: "12", totalNetWeightKg: "153", revenuePaise: 688500, averagePricePaisePerKg: 4500 } });
  });

  it("preserves a safe-integer sale price exactly across unrelated patches", async () => {
    const banana = await crop();
    const created = await createHarvest({ netWeightKg: "0", salePricePerKg: "90071992547409.91" }, banana.id);
    expect(created).toMatchObject({ salePricePaisePerKg: Number.MAX_SAFE_INTEGER, calculatedRevenuePaise: 0 });

    const updated = await request(`/${String(created.id)}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ notes: "No price change" }) });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ data: { salePricePaisePerKg: Number.MAX_SAFE_INTEGER, calculatedRevenuePaise: 0 } });
  });

  it("requires a real manual date and an override reason when revenue differs", async () => {
    const banana = await crop();
    const noDate = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: banana.id, harvestDate: null, netWeightKg: "1", salePricePerKg: "1" }) });
    const invalidDate = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: banana.id, harvestDate: "2026-02-30", netWeightKg: "1", salePricePerKg: "1" }) });
    const missingReason = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: banana.id, harvestDate: "2026-08-01", netWeightKg: "1", salePricePerKg: "1", actualRevenue: "0.99" }) });
    expect(noDate.status).toBe(422);
    expect(invalidDate.status).toBe(422);
    expect(missingReason.status).toBe(422);
  });

  it("rejects client attempts to spoof the trusted EXCEL source", async () => {
    const banana = await crop();
    const response = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: banana.id, harvestDate: null, netWeightKg: "1", salePricePerKg: "1", source: "EXCEL" }) });
    expect(response.status).toBe(422);
    const stored = await env.DB.prepare("SELECT COUNT(*) AS count FROM harvests").first<{ count: number }>();
    expect(stored?.count).toBe(0);
  });

  it("creates, preserves, updates, and explicitly reverts valid revenue overrides", async () => {
    const banana = await crop();
    const overridden = await createHarvest({ netWeightKg: "10.125", salePricePerKg: "7.99", actualRevenue: "81", revenueOverrideReason: "Rounded buyer settlement" }, banana.id);
    expect(overridden).toMatchObject({ calculatedRevenuePaise: 8090, actualRevenuePaise: 8100, revenueOverrideReason: "Rounded buyer settlement" });

    const recalculated = await request(`/${String(overridden.id)}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ netWeightKg: "11.125" }) });
    expect(recalculated.status).toBe(200);
    await expect(recalculated.json()).resolves.toMatchObject({ data: { calculatedRevenuePaise: 8889, actualRevenuePaise: 8100, revenueOverrideReason: "Rounded buyer settlement" } });

    const staleReasonless = await request(`/${String(overridden.id)}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ revenueOverrideReason: null }) });
    expect(staleReasonless.status).toBe(422);

    const reverted = await request(`/${String(overridden.id)}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ actualRevenue: null }) });
    expect(reverted.status).toBe(200);
    await expect(reverted.json()).resolves.toMatchObject({ data: { calculatedRevenuePaise: 8889, actualRevenuePaise: 8889, revenueOverrideReason: null } });

    const recalculatedDefault = await createHarvest({}, banana.id);
    const changedWeight = await request(`/${String(recalculatedDefault.id)}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ netWeightKg: "154" }) });
    await expect(changedWeight.json()).resolves.toMatchObject({ data: { calculatedRevenuePaise: 693000, actualRevenuePaise: 693000 } });
  });

  it("clears optional harvest measurements without clearing the revenue basis", async () => {
    const created = await createHarvest();
    const response = await request(`/${String(created.id)}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ quantity: null, grossWeightKg: null, averageWeightKg: null }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { quantity: null, grossWeightKg: null, averageWeightKg: null, netWeightKg: "153", calculatedRevenuePaise: 688500 },
    });
  });

  it("preserves reasonless cached legacy revenue only through the trusted importer path", async () => {
    const banana = await crop();
    const imported = await createImportedHarvest(env.DB, {
      cropId: banana.id,
      harvestDate: null,
      quantity: "3",
      netWeightKg: "2.5",
      salePricePerKg: "40",
      actualRevenuePaise: 10085,
      sourceSheet: "Banana Harvest Details",
      sourceRow: 2,
      importFingerprint: "legacy-fingerprint",
    }, "import@vkb.local");
    expect(imported).toMatchObject({ harvestDate: null, source: "EXCEL", calculatedRevenuePaise: 10000, actualRevenuePaise: 10085, revenueOverrideReason: null });

    const unrelated = await request(`/${imported.id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ buyer: "Verified buyer", harvestDate: null }) });
    expect(unrelated.status).toBe(200);
    await expect(unrelated.json()).resolves.toMatchObject({ data: { harvestDate: null, actualRevenuePaise: 10085, buyer: "Verified buyer" } });

    const changedBasis = await request(`/${imported.id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ netWeightKg: "3" }) });
    expect(changedBasis.status).toBe(422);

    const sameTotalDifferentBasis = await request(`/${imported.id}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ netWeightKg: "5", salePricePerKg: "20" }),
    });
    expect(sameTotalDifferentBasis.status).toBe(422);
    await expect(sameTotalDifferentBasis.json()).resolves.toMatchObject({
      error: { code: "LEGACY_REVENUE_REVIEW_REQUIRED" },
    });
    const unchanged = await request(`/${imported.id}`);
    await expect(unchanged.json()).resolves.toMatchObject({ data: { netWeightKg: "2.5", calculatedRevenuePaise: 10000, actualRevenuePaise: 10085 } });
  });

  it("validates every trusted import value at runtime with sanitized errors", async () => {
    const banana = await crop();
    const valid = {
      cropId: banana.id,
      harvestDate: "2026-08-01",
      netWeightKg: "1.125",
      salePricePerKg: "40",
      actualRevenuePaise: 4_500,
      sourceSheet: "Banana Harvest Details",
      sourceRow: 2,
      importFingerprint: "legacy-fingerprint",
    };
    const invalidInputs = [
      { ...valid, harvestDate: "2026-02-30" },
      { ...valid, netWeightKg: "1.0001" },
      { ...valid, quantity: "not-a-decimal" },
      { ...valid, salePricePerKg: "1.001" },
      { ...valid, actualRevenuePaise: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, sourceSheet: "   " },
      { ...valid, sourceSheet: "s".repeat(251) },
      { ...valid, sourceRow: 0 },
      { ...valid, sourceRow: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, importFingerprint: "" },
      { ...valid, importFingerprint: "f".repeat(513) },
    ];

    for (const input of invalidInputs) {
      await expect(createImportedHarvest(env.DB, input as never, "import@vkb.local")).rejects.toMatchObject({
        status: 422,
        code: "VALIDATION_ERROR",
        message: "The imported harvest input is invalid",
      });
    }
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM harvests").first<{ count: number }>();
    expect(count?.count).toBe(0);
  });

  it("filters with bound crop and local date values, retaining undated EXCEL legacy rows in all-time totals", async () => {
    const banana = await crop();
    const mango = await crop("Mango");
    await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: banana.id, harvestDate: "2026-08-01", netWeightKg: "1", salePricePerKg: "1" }) });
    await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: mango.id, harvestDate: "2026-09-01", netWeightKg: "2", salePricePerKg: "1" }) });
    await env.DB.prepare("INSERT INTO harvests (id, crop_id, harvest_date, net_weight_kg, sale_price_paise_per_kg, calculated_revenue_paise, actual_revenue_paise, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("legacy_harvest", banana.id, null, 3, 100, 300, 300, "EXCEL").run();

    const filtered = await request(`?cropId=${banana.id}&dateFrom=2026-08-01&dateTo=2026-08-31`);
    await expect(filtered.json()).resolves.toMatchObject({ data: [expect.objectContaining({ cropId: banana.id, harvestDate: "2026-08-01" })], meta: { total: 1 } });
    const allTime = await request("/summary");
    await expect(allTime.json()).resolves.toMatchObject({ data: { recordCount: 3, revenuePaise: 600 } });
    const injected = await request("?cropId=missing%27%20OR%201%3D1%20--");
    await expect(injected.json()).resolves.toMatchObject({ data: [], meta: { total: 0 } });
  });

  it("validates bounded pagination and crop, month, year, and date filters", async () => {
    const banana = await crop();
    const mango = await crop("Mango");
    await Promise.all([
      createHarvest({ harvestDate: "2026-08-01" }, banana.id),
      createHarvest({ harvestDate: "2026-09-01" }, banana.id),
      createHarvest({ harvestDate: "2025-09-01" }, mango.id),
    ]);

    const page = await request("?page=2&pageSize=1&cropId=" + banana.id);
    await expect(page.json()).resolves.toMatchObject({ data: [expect.objectContaining({ cropId: banana.id })], meta: { page: 2, pageSize: 1, total: 2 } });
    const month = await request("?month=2026-09");
    await expect(month.json()).resolves.toMatchObject({ data: [expect.objectContaining({ harvestDate: "2026-09-01" })], meta: { total: 1 } });
    const year = await request("?year=2025");
    await expect(year.json()).resolves.toMatchObject({ data: [expect.objectContaining({ cropId: mango.id })], meta: { total: 1 } });
    expect((await request("?pageSize=0")).status).toBe(422);
    expect((await request("?pageSize=101")).status).toBe(422);
    expect((await request("?month=2026-13")).status).toBe(422);
    expect((await request("?year=26")).status).toBe(422);
    expect((await request("?dateFrom=2026-09-02&dateTo=2026-09-01")).status).toBe(422);
    expect((await request("?page=1000000&pageSize=100")).status).toBe(200);
    const beyondMaximumPage = await request("?page=1000001&pageSize=100");
    expect(beyondMaximumPage.status).toBe(422);
    await expect(beyondMaximumPage.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("updates and deletes records with an audit trail while preserving imported unavailable dates", async () => {
    const created = await createHarvest();
    const updated = await request(`/${String(created.id)}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ actualRevenue: "6900", revenueOverrideReason: "Buyer quality adjustment" }) });
    await expect(updated.json()).resolves.toMatchObject({ data: { actualRevenuePaise: 690000, revenueOverrideReason: "Buyer quality adjustment" } });
    const deleted = await request(`/${String(created.id)}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);
    const actions = await env.DB.prepare("SELECT action FROM audit_log WHERE entity_id = ? ORDER BY created_at, id").bind(created.id).all<{ action: string }>();
    expect(actions.results.map((row) => row.action)).toEqual(expect.arrayContaining(["CREATE", "UPDATE", "DELETE"]));

    await env.DB.prepare("INSERT INTO harvests (id, crop_id, harvest_date, net_weight_kg, sale_price_paise_per_kg, calculated_revenue_paise, actual_revenue_paise, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("legacy_update", created.cropId, null, 1, 100, 100, 101, "EXCEL").run();
    const legacy = await request("/legacy_update", { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ buyer: "Verified buyer" }) });
    await expect(legacy.json()).resolves.toMatchObject({ data: { harvestDate: null, actualRevenuePaise: 101 } });
  });

  it("allows an unchanged inactive historical crop but rejects new assignment to it", async () => {
    const banana = await crop();
    const mango = await crop("Mango");
    const existing = await createHarvest({}, banana.id);
    await env.DB.prepare("UPDATE crops SET active = 0 WHERE id = ?").bind(banana.id).run();

    const editUnchanged = await request(`/${String(existing.id)}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ notes: "Historical note" }) });
    expect(editUnchanged.status).toBe(200);
    await expect(editUnchanged.json()).resolves.toMatchObject({ data: { cropId: banana.id, cropActive: false, notes: "Historical note" } });
    const createInactive = await createHarvest({}, mango.id);
    const reassign = await request(`/${String(createInactive.id)}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ cropId: banana.id }) });
    expect(reassign.status).toBe(409);
  });

  it("keeps total and dated chart revenue consistent and returns zero for a zero-weight average", async () => {
    const banana = await crop();
    await createHarvest({ harvestDate: "2026-08-01", quantity: "0", netWeightKg: "0", salePricePerKg: "45" }, banana.id);
    await createHarvest({ harvestDate: "2026-08-02", quantity: "2.25", netWeightKg: "0.29", salePricePerKg: "1" }, banana.id);
    await env.DB.prepare("INSERT INTO harvests (id, crop_id, harvest_date, quantity, net_weight_kg, sale_price_paise_per_kg, calculated_revenue_paise, actual_revenue_paise, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("legacy_summary", banana.id, null, 1.5, 3, 100, 300, 300, "EXCEL").run();

    const response = await request("/summary");
    const body = await response.json() as { data: { totalQuantity: string; totalNetWeightKg: string; revenuePaise: number; averagePricePaisePerKg: number; undatedRevenuePaise: number; monthlyCropRevenue: Array<{ quantity: string; revenuePaise: number }> } };
    expect(body.data).toMatchObject({ totalQuantity: "3.75", totalNetWeightKg: "3.29", revenuePaise: 329, undatedRevenuePaise: 300 });
    expect(body.data.monthlyCropRevenue).toEqual([
      expect.objectContaining({ month: "2026-08", cropName: "Banana", quantity: "2.25", netWeightKg: "0.29", revenuePaise: 29 }),
    ]);
    expect(body.data.monthlyCropRevenue.reduce((sum, row) => sum + row.revenuePaise, 0) + body.data.undatedRevenuePaise).toBe(body.data.revenuePaise);

    await env.DB.prepare("DELETE FROM harvests").run();
    await createHarvest({ quantity: "0", netWeightKg: "0", salePricePerKg: "45" }, banana.id);
    const zero = await request("/summary");
    await expect(zero.json()).resolves.toMatchObject({ data: { totalNetWeightKg: "0", averagePricePaisePerKg: 0 } });
  });

  it("calculates fractional-weight averages with scaled integers and rejects unsafe money totals", async () => {
    const banana = await crop();
    await createHarvest({ quantity: "1", netWeightKg: "0.001", salePricePerKg: "1" }, banana.id);
    await createHarvest({ quantity: "1", netWeightKg: "0.002", salePricePerKg: "2" }, banana.id);

    const exactAverage = await request("/summary");
    await expect(exactAverage.json()).resolves.toMatchObject({
      data: { totalNetWeightKg: "0.003", averagePricePaisePerKg: 167 },
    });

    await env.DB.prepare("DELETE FROM harvests").run();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO harvests (id, crop_id, harvest_date, net_weight_kg, sale_price_paise_per_kg, calculated_revenue_paise, actual_revenue_paise) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind("overflow_one", banana.id, "2026-08-01", 1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      env.DB.prepare("INSERT INTO harvests (id, crop_id, harvest_date, net_weight_kg, sale_price_paise_per_kg, calculated_revenue_paise, actual_revenue_paise) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind("overflow_two", banana.id, "2026-08-02", 1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    ]);
    const overflow = await request("/summary");
    expect(overflow.status).toBe(500);
    await expect(overflow.json()).resolves.toEqual({
      error: { code: "DATA_RANGE_ERROR", message: "Stored money exceeds the supported range" },
    });
  });

  it("allows editors and admins to write but rejects viewers", async () => {
    const banana = await crop();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO people (id, name, email, app_role) VALUES (?, ?, ?, ?)").bind("harvest_viewer", "Viewer", "harvest-viewer@vkb.test", "viewer"),
      env.DB.prepare("INSERT INTO people (id, name, email, app_role) VALUES (?, ?, ?, ?)").bind("harvest_editor", "Editor", "harvest-editor@vkb.test", "editor"),
    ]);
    const bindings: Bindings = { ...env, ENVIRONMENT: "production", RECEIPTS: env.RECEIPTS };
    const body = JSON.stringify({ cropId: banana.id, harvestDate: "2026-08-01", netWeightKg: "1", salePricePerKg: "1" });
    const viewer = await app.request("http://example.com/api/v1/harvests", { method: "POST", headers: { ...jsonHeaders, "Cf-Access-Authenticated-User-Email": "harvest-viewer@vkb.test" }, body }, bindings);
    const editor = await app.request("http://example.com/api/v1/harvests", { method: "POST", headers: { ...jsonHeaders, "Cf-Access-Authenticated-User-Email": "harvest-editor@vkb.test" }, body }, bindings);
    expect(viewer.status).toBe(403);
    expect(editor.status).toBe(201);
  });

  it("writes actor and snapshots atomically for create, update, and delete", async () => {
    const banana = await crop();
    await env.DB.prepare("INSERT INTO people (id, name, email, app_role) VALUES (?, ?, ?, ?)").bind("audit_editor", "Audit Editor", "audit-editor@vkb.test", "editor").run();
    const bindings: Bindings = { ...env, ENVIRONMENT: "production", RECEIPTS: env.RECEIPTS };
    const headers = { ...jsonHeaders, "Cf-Access-Authenticated-User-Email": "audit-editor@vkb.test" };
    const createdResponse = await app.request("http://example.com/api/v1/harvests", { method: "POST", headers, body: JSON.stringify({ cropId: banana.id, harvestDate: "2026-08-01", netWeightKg: "1", salePricePerKg: "1" }) }, bindings);
    const created = (await createdResponse.json() as { data: { id: string } }).data;
    await app.request(`http://example.com/api/v1/harvests/${created.id}`, { method: "PATCH", headers, body: JSON.stringify({ notes: "Audited" }) }, bindings);
    await app.request(`http://example.com/api/v1/harvests/${created.id}`, { method: "DELETE", headers }, bindings);
    const entries = await env.DB.prepare("SELECT action, actor, before_json, after_json FROM audit_log WHERE entity_id = ? ORDER BY created_at, rowid").bind(created.id).all<{ action: string; actor: string; before_json: string | null; after_json: string | null }>();
    expect(entries.results).toHaveLength(3);
    expect(entries.results.map((entry) => entry.action)).toEqual(["CREATE", "UPDATE", "DELETE"]);
    expect(entries.results.every((entry) => entry.actor === "audit-editor@vkb.test")).toBe(true);
    expect(entries.results[0]).toMatchObject({ before_json: null, after_json: expect.any(String) });
    expect(entries.results[1]).toMatchObject({ before_json: expect.any(String), after_json: expect.any(String) });
    expect(entries.results[2]).toMatchObject({ before_json: expect.any(String), after_json: null });

    await env.DB.prepare("CREATE TRIGGER block_harvest_audit BEFORE INSERT ON audit_log WHEN NEW.entity_type = 'harvest' BEGIN SELECT RAISE(ABORT, 'audit blocked'); END").run();
    const failed = await request("", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ cropId: banana.id, harvestDate: "2026-08-03", netWeightKg: "1", salePricePerKg: "1" }) });
    expect(failed.status).toBe(500);
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM harvests").first<{ count: number }>();
    expect(count?.count).toBe(0);
    await env.DB.prepare("DROP TRIGGER block_harvest_audit").run();
  });
});
