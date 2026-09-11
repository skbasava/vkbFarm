import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../../worker/index";
import type { Bindings } from "../../worker/types";

const jsonHeaders = { "content-type": "application/json" };

async function request(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`http://example.com/api/v1${path}`, init);
}

async function seedExpense(input: {
  id: string;
  amountPaise: number;
  paidByPersonId: string;
  isShared?: boolean;
  deletedAt?: string | null;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO expenses (
      id, expense_date, description, amount_paise, paid_by_person_id, is_shared, deleted_at
    ) VALUES (?, '2026-09-09', ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.id,
      input.id,
      input.amountPaise,
      input.paidByPersonId,
      input.isShared === false ? 0 : 1,
      input.deletedAt ?? null,
    )
    .run();
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB
      .prepare(
        `INSERT INTO people (
          id, name, email, farm_role, app_role, participates_in_shared_expenses, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind("person_editor", "Editor", "editor@vkb.test", "manager", "editor", 0, 1),
    env.DB
      .prepare(
        `INSERT INTO people (
          id, name, farm_role, app_role, participates_in_shared_expenses, active
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind("person_worker", "Worker", "employee", "viewer", 1, 1),
  ]);
});

describe("settlement API", () => {
  it("summarizes active owner contributions without letting payments change shared expense totals", async () => {
    await seedExpense({ id: "expense_satish", amountPaise: 1_000_000, paidByPersonId: "person_satish" });
    await seedExpense({ id: "expense_mahesh", amountPaise: 600_000, paidByPersonId: "person_mahesh" });
    await seedExpense({ id: "expense_worker", amountPaise: 900_000, paidByPersonId: "person_worker" });
    await seedExpense({ id: "expense_private", amountPaise: 500_000, paidByPersonId: "person_satish", isShared: false });
    await seedExpense({ id: "expense_deleted", amountPaise: 400_000, paidByPersonId: "person_satish", deletedAt: "2026-09-10T00:00:00.000Z" });

    const before = await request("/settlements/summary");
    expect(before.status).toBe(200);
    await expect(before.json()).resolves.toEqual({
      data: {
        totalSharedExpensePaise: 1_600_000,
        participants: [
          { personId: "person_mahesh", name: "Mahesh", paidPaise: 600_000, expectedPaise: 800_000, balancePaise: -200_000 },
          { personId: "person_satish", name: "Satish", paidPaise: 1_000_000, expectedPaise: 800_000, balancePaise: 200_000 },
        ],
        recommendedTransfers: [{ fromPersonId: "person_mahesh", toPersonId: "person_satish", amountPaise: 200_000 }],
      },
    });

    const recorded = await request("/settlements", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        fromPersonId: "person_mahesh",
        toPersonId: "person_satish",
        amount: "500.00",
        settlementDate: "2026-09-11",
        remarks: "UPI",
      }),
    });
    expect(recorded.status).toBe(201);
    const settlement = (await recorded.json()) as { data: { id: string; amountPaise: number } };
    expect(settlement.data.amountPaise).toBe(50_000);

    const after = await request("/settlements/summary");
    await expect(after.json()).resolves.toMatchObject({
      data: {
        totalSharedExpensePaise: 1_600_000,
        participants: [
          { personId: "person_mahesh", balancePaise: -150_000 },
          { personId: "person_satish", balancePaise: 150_000 },
        ],
        recommendedTransfers: [{ fromPersonId: "person_mahesh", toPersonId: "person_satish", amountPaise: 150_000 }],
      },
    });
    const audit = await env.DB.prepare(
      "SELECT entity_type, action, actor, after_json FROM audit_log WHERE entity_id = ?",
    )
      .bind(settlement.data.id)
      .first<{ entity_type: string; action: string; actor: string; after_json: string }>();
    expect(audit).toMatchObject({ entity_type: "settlement", action: "SETTLEMENT", actor: "dev@vkb.local" });
    expect(JSON.parse(audit?.after_json ?? "{}")).toMatchObject({ amountPaise: 50_000 });
  });

  it("returns settlement history in chronological order", async () => {
    for (const [settlementDate, amount] of [["2026-09-10", "100.00"], ["2026-09-11", "200.00"]] as const) {
      const response = await request("/settlements", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ fromPersonId: "person_mahesh", toPersonId: "person_satish", amount, settlementDate }),
      });
      expect(response.status).toBe(201);
    }
    const response = await request("/settlements");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [
        { settlementDate: "2026-09-11", amountPaise: 20_000, fromPersonName: "Mahesh", toPersonName: "Satish" },
        { settlementDate: "2026-09-10", amountPaise: 10_000 },
      ],
    });
  });

  it("rejects invalid people, duplicate parties, bad dates, and non-positive decimal amounts", async () => {
    for (const body of [
      { fromPersonId: "person_satish", toPersonId: "person_satish", amount: "1.00", settlementDate: "2026-09-11" },
      { fromPersonId: "person_worker", toPersonId: "person_satish", amount: "1.00", settlementDate: "2026-09-11" },
      { fromPersonId: "person_mahesh", toPersonId: "person_satish", amount: "0", settlementDate: "2026-09-11" },
      { fromPersonId: "person_mahesh", toPersonId: "person_satish", amount: "1.001", settlementDate: "2026-02-30" },
    ]) {
      const response = await request("/settlements", { method: "POST", headers: jsonHeaders, body: JSON.stringify(body) });
      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    }
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM settlements").first<number>("count")).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE entity_type = 'settlement'").first<number>("count")).toBe(0);
  });

  it("allows editor roles to record settlements and forbids viewers", async () => {
    const editorResponse = await app.request(
      "http://example.com/api/v1/settlements",
      {
        method: "POST",
        headers: { ...jsonHeaders, "Cf-Access-Authenticated-User-Email": "editor@vkb.test" },
        body: JSON.stringify({ fromPersonId: "person_mahesh", toPersonId: "person_satish", amount: "1.00", settlementDate: "2026-09-11" }),
      },
      { ...env, ENVIRONMENT: "production" } satisfies Bindings,
    );
    expect(editorResponse.status).toBe(201);

    await env.DB.prepare("UPDATE people SET email = ? WHERE id = ?")
      .bind("viewer@vkb.test", "person_worker")
      .run();
    const viewerResponse = await app.request(
      "http://example.com/api/v1/settlements",
      {
        method: "POST",
        headers: { ...jsonHeaders, "Cf-Access-Authenticated-User-Email": "viewer@vkb.test" },
        body: JSON.stringify({ fromPersonId: "person_mahesh", toPersonId: "person_satish", amount: "1.00", settlementDate: "2026-09-11" }),
      },
      { ...env, ENVIRONMENT: "production" } satisfies Bindings,
    );
    expect(viewerResponse.status).toBe(403);
  });
});
