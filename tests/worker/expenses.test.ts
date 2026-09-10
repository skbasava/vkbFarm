import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { seedCategorySalary } from "../fixtures/database";
import app from "../../worker/index";
import type { Bindings } from "../../worker/types";

type JsonRecord = Record<string, unknown>;

const jsonHeaders = { "content-type": "application/json" };

const validExpense = {
  expenseDate: "2026-09-09",
  amount: "8000.00",
  categoryId: "category_salary",
  paidByPersonId: "person_mahesh",
  description: "Giri Salary",
  expenseClass: "OPEX",
  isShared: true,
} as const;

async function request(path: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`http://example.com/api/v1${path}`, init);
}

async function createExpense(overrides: JsonRecord = {}): Promise<JsonRecord> {
  const response = await request("/expenses", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ ...validExpense, ...overrides }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { data: JsonRecord };
  return body.data;
}

beforeEach(async () => {
  await seedCategorySalary(env.DB);
});

describe("expense API", () => {
  it("creates a valid expense in paise and writes its audit entry atomically", async () => {
    const response = await request("/expenses", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(validExpense),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: JsonRecord };
    expect(body.data).toMatchObject({
      amountPaise: 800000,
      categoryId: "category_salary",
      categoryName: "Salary",
      paidByPersonId: "person_mahesh",
      paidByPersonName: "Mahesh",
      expenseClass: "OPEX",
      isShared: true,
    });

    const audit = await env.DB.prepare(
      "SELECT action, actor FROM audit_log WHERE entity_id = ?",
    )
      .bind(body.data.id)
      .first<{ action: string; actor: string }>();
    expect(audit).toEqual({ action: "CREATE", actor: "dev@vkb.local" });
  });

  it("rejects zero amounts and invalid calendar dates as semantic validation failures", async () => {
    for (const input of [
      { ...validExpense, amount: "0" },
      { ...validExpense, expenseDate: "2026-02-30" },
    ]) {
      const response = await request("/expenses", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(input),
      });
      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
    }
  });

  it("requires manual expenses to use a category record", async () => {
    const response = await request("/expenses", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ ...validExpense, categoryId: null }),
    });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("distinguishes missing references from an inactive category", async () => {
    const missingPerson = await request("/expenses", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        ...validExpense,
        paidByPersonId: "person_missing",
      }),
    });
    expect(missingPerson.status).toBe(404);

    const missingCategory = await request("/expenses", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ ...validExpense, categoryId: "category_missing" }),
    });
    expect(missingCategory.status).toBe(404);

    await env.DB.prepare(
      "UPDATE expense_categories SET active = 0 WHERE id = ?",
    )
      .bind("category_salary")
      .run();
    const inactiveCategory = await request("/expenses", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(validExpense),
    });
    expect(inactiveCategory.status).toBe(409);
    await expect(inactiveCategory.json()).resolves.toEqual({
      error: {
        code: "CATEGORY_INACTIVE",
        message: "The selected expense category is inactive",
      },
    });
  });

  it("accepts CAPEX, OPEX, and null classifications", async () => {
    const classes = ["CAPEX", "OPEX", null] as const;
    for (const expenseClass of classes) {
      const created = await createExpense({
        description: `Class ${String(expenseClass)}`,
        expenseClass,
      });
      expect(created.expenseClass).toBe(expenseClass);
    }
  });

  it("returns default and capped pagination metadata", async () => {
    await createExpense({ description: "First", expenseDate: "2026-09-08" });
    await createExpense({ description: "Second", expenseDate: "2026-09-09" });

    const firstPage = await request("/expenses?page=1&pageSize=1");
    expect(firstPage.status).toBe(200);
    await expect(firstPage.json()).resolves.toMatchObject({
      data: [{ description: "Second" }],
      meta: { page: 1, pageSize: 1, total: 2 },
    });

    const capped = await request("/expenses?pageSize=999");
    await expect(capped.json()).resolves.toMatchObject({
      meta: { page: 1, pageSize: 100, total: 2 },
    });
  });

  it("searches descriptions, vendors, and category names", async () => {
    await createExpense({
      description: "Tractor repair",
      paidTo: "Ravi Motors",
    });
    await createExpense({ description: "Monthly payroll", paidTo: "Giri" });

    for (const search of ["tractor", "ravi", "salary"]) {
      const response = await request(`/expenses?search=${search}`);
      const body = (await response.json()) as { data: JsonRecord[] };
      expect(body.data).toHaveLength(search === "salary" ? 2 : 1);
    }
  });

  it("applies payer, date, category, class, and amount filters together", async () => {
    await createExpense({
      expenseDate: "2026-08-01",
      amount: "500.00",
      categoryId: "category_uncategorized",
      paidByPersonId: "person_satish",
      description: "Older small expense",
      expenseClass: "CAPEX",
    });
    await createExpense({
      expenseDate: "2026-09-10",
      amount: "1500.00",
      description: "Matching expense",
      expenseClass: "OPEX",
    });

    const response = await request(
      "/expenses?paidByPersonId=person_mahesh&dateFrom=2026-09-01&dateTo=2026-09-30" +
        "&categoryId=category_salary&expenseClass=OPEX&minAmount=1000&maxAmount=2000",
    );
    const body = (await response.json()) as {
      data: JsonRecord[];
      meta: JsonRecord;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      description: "Matching expense",
      amountPaise: 150000,
    });
    expect(body.meta.total).toBe(1);
  });

  it("sorts only by supported fields with a deterministic tie breaker", async () => {
    await createExpense({
      description: "Largest",
      amount: "300.00",
      expenseDate: "2026-09-01",
    });
    await createExpense({
      description: "Smallest",
      amount: "100.00",
      expenseDate: "2026-09-03",
    });
    await createExpense({
      description: "Middle",
      amount: "200.00",
      expenseDate: "2026-09-02",
    });

    const sorted = await request("/expenses?sortBy=amount&sortOrder=asc");
    const sortedBody = (await sorted.json()) as { data: JsonRecord[] };
    expect(sortedBody.data.map((row) => row.description)).toEqual([
      "Smallest",
      "Middle",
      "Largest",
    ]);

    const unsupported = await request(
      "/expenses?sortBy=amount_paise%20DESC%3B%20DROP%20TABLE%20people",
    );
    expect(unsupported.status).toBe(422);
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM people",
    ).first<number>("count");
    expect(count).toBe(2);
  });

  it("updates an expense and records before and after audit values", async () => {
    const created = await createExpense();
    const response = await request(`/expenses/${String(created.id)}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({
        amount: "8250.50",
        expenseClass: "CAPEX",
        notes: "Revised",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { amountPaise: 825050, expenseClass: "CAPEX", notes: "Revised" },
    });

    const audit = await env.DB.prepare(
      "SELECT before_json, after_json FROM audit_log WHERE entity_id = ? AND action = 'UPDATE'",
    )
      .bind(created.id)
      .first<{ before_json: string; after_json: string }>();
    expect(JSON.parse(audit?.before_json ?? "{}")).toMatchObject({
      amountPaise: 800000,
    });
    expect(JSON.parse(audit?.after_json ?? "{}")).toMatchObject({
      amountPaise: 825050,
    });
  });

  it("soft deletes an expense and excludes it from default lists and totals", async () => {
    const created = await createExpense();
    const response = await request(`/expenses/${String(created.id)}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(200);

    const list = await request("/expenses");
    await expect(list.json()).resolves.toMatchObject({
      data: [],
      meta: { total: 0 },
    });
    const stored = await env.DB.prepare(
      "SELECT deleted_at FROM expenses WHERE id = ?",
    )
      .bind(created.id)
      .first<{ deleted_at: string | null }>();
    expect(stored?.deleted_at).not.toBeNull();
    const deleteAudit = await env.DB.prepare(
      "SELECT action FROM audit_log WHERE entity_id = ? AND action = 'DELETE'",
    )
      .bind(created.id)
      .first<{ action: string }>();
    expect(deleteAudit).toEqual({ action: "DELETE" });
  });
});

describe("category and people APIs", () => {
  it("lists, creates, renames, classifies, and disables categories without changing expense history", async () => {
    const createResponse = await request("/categories", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        name: "Farm Equipment",
        defaultExpenseClass: "CAPEX",
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = ((await createResponse.json()) as { data: JsonRecord })
      .data;

    const createAudit = await env.DB.prepare(
      `SELECT entity_type, entity_id, action, actor, before_json, after_json
       FROM audit_log WHERE entity_id = ? AND action = 'CREATE'`,
    )
      .bind(created.id)
      .first<{
        entity_type: string;
        entity_id: string;
        action: string;
        actor: string;
        before_json: string | null;
        after_json: string;
      }>();
    expect(createAudit).toMatchObject({
      entity_type: "expense_category",
      entity_id: created.id,
      action: "CREATE",
      actor: "dev@vkb.local",
      before_json: null,
    });
    expect(JSON.parse(createAudit?.after_json ?? "{}")).toMatchObject({
      id: created.id,
      name: "Farm Equipment",
      defaultExpenseClass: "CAPEX",
      active: true,
    });

    const expense = await createExpense({
      categoryId: created.id,
      description: "New pump",
    });
    const patchResponse = await request(`/categories/${String(created.id)}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({
        name: "Equipment",
        defaultExpenseClass: "OPEX",
        active: false,
      }),
    });
    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      data: { name: "Equipment", defaultExpenseClass: "OPEX", active: false },
    });

    const updateAudit = await env.DB.prepare(
      `SELECT entity_type, entity_id, action, actor, before_json, after_json
       FROM audit_log WHERE entity_id = ? AND action = 'UPDATE'`,
    )
      .bind(created.id)
      .first<{
        entity_type: string;
        entity_id: string;
        action: string;
        actor: string;
        before_json: string;
        after_json: string;
      }>();
    expect(updateAudit).toMatchObject({
      entity_type: "expense_category",
      entity_id: created.id,
      action: "UPDATE",
      actor: "dev@vkb.local",
    });
    expect(JSON.parse(updateAudit?.before_json ?? "{}")).toMatchObject({
      name: "Farm Equipment",
      defaultExpenseClass: "CAPEX",
      active: true,
    });
    expect(JSON.parse(updateAudit?.after_json ?? "{}")).toMatchObject({
      name: "Equipment",
      defaultExpenseClass: "OPEX",
      active: false,
    });

    const historical = await request(`/expenses/${String(expense.id)}`);
    await expect(historical.json()).resolves.toMatchObject({
      data: { categoryId: created.id, categoryName: "Equipment" },
    });
    const categories = await request("/categories?includeInactive=true");
    const list = (await categories.json()) as { data: JsonRecord[] };
    expect(list.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.id, active: false }),
      ]),
    );
  });

  it("lists participants and provides admin-only people create and update", async () => {
    const createdResponse = await request("/people", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        name: "Giri",
        email: "giri@example.com",
        farmRole: "owner",
        appRole: "editor",
        active: true,
      }),
    });
    expect(createdResponse.status).toBe(201);
    const created = ((await createdResponse.json()) as { data: JsonRecord })
      .data;

    const createAudit = await env.DB.prepare(
      `SELECT entity_type, entity_id, action, actor, before_json, after_json
       FROM audit_log WHERE entity_id = ? AND action = 'CREATE'`,
    )
      .bind(created.id)
      .first<{
        entity_type: string;
        entity_id: string;
        action: string;
        actor: string;
        before_json: string | null;
        after_json: string;
      }>();
    expect(createAudit).toMatchObject({
      entity_type: "person",
      entity_id: created.id,
      action: "CREATE",
      actor: "dev@vkb.local",
      before_json: null,
    });
    expect(JSON.parse(createAudit?.after_json ?? "{}")).toMatchObject({
      id: created.id,
      name: "Giri",
      email: "giri@example.com",
      appRole: "editor",
      active: true,
    });

    const participants = await request("/people?participants=true");
    const participantsBody = (await participants.json()) as {
      data: JsonRecord[];
    };
    expect(participantsBody.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.id, participant: true }),
      ]),
    );

    const updated = await request(`/people/${String(created.id)}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ active: false, appRole: "viewer" }),
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      data: { active: false, appRole: "viewer", participant: false },
    });

    const updateAudit = await env.DB.prepare(
      `SELECT entity_type, entity_id, action, actor, before_json, after_json
       FROM audit_log WHERE entity_id = ? AND action = 'UPDATE'`,
    )
      .bind(created.id)
      .first<{
        entity_type: string;
        entity_id: string;
        action: string;
        actor: string;
        before_json: string;
        after_json: string;
      }>();
    expect(updateAudit).toMatchObject({
      entity_type: "person",
      entity_id: created.id,
      action: "UPDATE",
      actor: "dev@vkb.local",
    });
    expect(JSON.parse(updateAudit?.before_json ?? "{}")).toMatchObject({
      active: true,
      appRole: "editor",
    });
    expect(JSON.parse(updateAudit?.after_json ?? "{}")).toMatchObject({
      active: false,
      appRole: "viewer",
    });

    await env.DB.prepare(
      "INSERT INTO people (id, name, email, app_role) VALUES (?, ?, ?, ?)",
    )
      .bind("person_viewer", "Viewer", "viewer@vkb.test", "viewer")
      .run();
    const forbidden = await app.request(
      "http://example.com/api/v1/people",
      {
        method: "POST",
        headers: {
          ...jsonHeaders,
          "Cf-Access-Authenticated-User-Email": "viewer@vkb.test",
        },
        body: JSON.stringify({ name: "No Access" }),
      },
      { ...env, ENVIRONMENT: "production" } satisfies Bindings,
    );
    expect(forbidden.status).toBe(403);
  });
});
