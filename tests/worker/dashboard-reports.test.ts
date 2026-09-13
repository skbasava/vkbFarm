import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

async function request(path: string): Promise<Response> {
  return SELF.fetch(`http://example.com/api/v1${path}`);
}

async function seedFixture(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO expense_categories (id, name, normalized_name) VALUES (?, ?, ?)")
      .bind("category_fuel", "Fuel", "fuel"),
    env.DB.prepare("INSERT INTO expense_categories (id, name, normalized_name) VALUES (?, ?, ?)")
      .bind("category_tools", "Tools", "tools"),
    env.DB.prepare("INSERT INTO crops (id, name) VALUES (?, ?)").bind("crop_banana", "Banana"),
    env.DB.prepare(
      `INSERT INTO expenses (
        id, expense_date, description, amount_paise, paid_by_person_id, category_id,
        expense_class, is_shared, created_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("expense_sep_fuel", "2026-09-09", "Diesel", 125_050, "person_satish", "category_fuel", "OPEX", 1, "2026-09-09T09:00:00.000Z", null),
    env.DB.prepare(
      `INSERT INTO expenses (
        id, expense_date, description, amount_paise, paid_by_person_id, category_id,
        expense_class, is_shared, created_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("expense_sep_tools", "2026-09-08", "Pump repair", 200_000, "person_mahesh", "category_tools", "CAPEX", 1, "2026-09-08T09:00:00.000Z", null),
    env.DB.prepare(
      `INSERT INTO expenses (
        id, expense_date, description, amount_paise, paid_by_person_id, category_id,
        expense_class, is_shared, created_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("expense_aug", "2026-08-30", "Older diesel", 50_000, "person_satish", "category_fuel", "OPEX", 0, "2026-08-30T09:00:00.000Z", null),
    env.DB.prepare(
      `INSERT INTO expenses (
        id, expense_date, description, amount_paise, paid_by_person_id, category_id,
        expense_class, is_shared, created_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("expense_deleted", "2026-09-10", "Deleted", 999_999, "person_satish", "category_fuel", "OPEX", 1, "2026-09-10T09:00:00.000Z", "2026-09-10T10:00:00.000Z"),
    env.DB.prepare(
      `INSERT INTO plantation_inventory (id, crop_id, farm_area_id, quantity, planting_date)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind("plantation_banana", "crop_banana", "area_mt", 42, "2026-08-01"),
    env.DB.prepare(
      `INSERT INTO harvests (
        id, crop_id, harvest_date, quantity, actual_revenue_paise, calculated_revenue_paise,
        revenue_override_reason, buyer, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("harvest_recent", "crop_banana", "2026-09-10", 12, 75_000, 75_000, null, "Market", "Fresh", "2026-09-10T08:00:00.000Z"),
    env.DB.prepare(
      `INSERT INTO harvests (
        id, crop_id, harvest_date, quantity, actual_revenue_paise, calculated_revenue_paise,
        revenue_override_reason, buyer, notes, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("harvest_undated", "crop_banana", null, 3, 2_500, 2_500, null, "=Untrusted", "@legacy", "EXCEL", "2026-09-01T08:00:00.000Z"),
  ]);
}

describe("dashboard and reports API", () => {
  it("returns SQL-owned dashboard totals, grouping, activity, and a reviewed settlement composition", async () => {
    await seedFixture();

    const response = await request("/dashboard");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        totals: {
          expensePaise: 375_050,
          currentMonthExpensePaise: 325_050,
          currentYearExpensePaise: 375_050,
          capexPaise: 200_000,
          opexPaise: 175_050,
          revenuePaise: 77_500,
          netCashFlowPaise: -297_550,
        },
        contributions: {
          totalSharedExpensePaise: 325_050,
          participants: [
            { personId: "person_mahesh", name: "Mahesh", paidPaise: 200_000, expectedPaise: 162_525, balancePaise: 37_475 },
            { personId: "person_satish", name: "Satish", paidPaise: 125_050, expectedPaise: 162_525, balancePaise: -37_475 },
          ],
          recommendedTransfers: [{ fromPersonId: "person_satish", toPersonId: "person_mahesh", amountPaise: 37_475 }],
        },
        monthlyExpenses: [
          { month: "2026-08", amountPaise: 50_000 },
          { month: "2026-09", amountPaise: 325_050 },
        ],
        categoryExpenses: [
          { categoryId: "category_tools", categoryName: "Tools", amountPaise: 200_000 },
          { categoryId: "category_fuel", categoryName: "Fuel", amountPaise: 175_050 },
        ],
        recentExpenses: [
          { id: "expense_sep_fuel", expenseDate: "2026-09-09", description: "Diesel", amountPaise: 125_050, paidByPersonName: "Satish", categoryName: "Fuel", expenseClass: "OPEX" },
          { id: "expense_sep_tools", expenseDate: "2026-09-08", description: "Pump repair", amountPaise: 200_000, paidByPersonName: "Mahesh", categoryName: "Tools", expenseClass: "CAPEX" },
          { id: "expense_aug", expenseDate: "2026-08-30", description: "Older diesel", amountPaise: 50_000, paidByPersonName: "Satish", categoryName: "Fuel", expenseClass: "OPEX" },
        ],
        recentHarvests: [
          { id: "harvest_recent", cropName: "Banana", harvestDate: "2026-09-10", quantity: 12, revenuePaise: 75_000, buyer: "Market" },
          { id: "harvest_undated", cropName: "Banana", harvestDate: null, quantity: 3, revenuePaise: 2_500, buyer: "=Untrusted" },
        ],
        plantationSummary: { totalQuantity: 42, cropCount: 1, areaCount: 1 },
      },
    });
  });

  it("honors bound ISO-local report dates and returns CSV downloads with raw rupee numbers", async () => {
    await seedFixture();

    const cashflow = await request("/reports/cashflow?dateFrom=2026-09-01&dateTo=2026-09-30");
    expect(cashflow.status).toBe(200);
    await expect(cashflow.json()).resolves.toEqual({
      data: { expensePaise: 325_050, revenuePaise: 75_000, netCashFlowPaise: -250_050 },
    });

    const harvestReport = await request("/reports/harvest?dateFrom=2026-09-01&dateTo=2026-09-30");
    await expect(harvestReport.json()).resolves.toEqual({
      data: [{ id: "harvest_recent", cropName: "Banana", harvestDate: "2026-09-10", quantity: 12, revenuePaise: 75_000, buyer: "Market", notes: "Fresh" }],
    });

    const exportResponse = await request("/reports/export/harvest");
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get("content-disposition")).toMatch(/^attachment; filename="vkb-harvest-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(new Uint8Array(await exportResponse.clone().arrayBuffer()).slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
    const csv = await exportResponse.text();
    expect(csv).toContain("Harvest Date,Crop,Quantity,Revenue (INR),Buyer,Notes\r\n");
    expect(csv).toContain("2026-09-10,Banana,12,750,Market,Fresh\r\n");
    expect(csv).toContain("Date unavailable,Banana,3,25,'=Untrusted,'@legacy\r\n");
  });

  it("rejects invalid report date filters with the standard validation contract", async () => {
    const response = await request("/reports/expenses?dateFrom=2026-09-31");
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("rejects unsafe harvest revenue totals in dashboard and cashflow contracts", async () => {
    await env.DB.prepare("INSERT INTO crops (id, name) VALUES (?, ?)").bind("crop_range", "Range crop").run();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO harvests (id, crop_id, harvest_date, actual_revenue_paise, calculated_revenue_paise) VALUES (?, ?, ?, ?, ?)")
        .bind("range_one", "crop_range", "2026-09-01", Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      env.DB.prepare("INSERT INTO harvests (id, crop_id, harvest_date, actual_revenue_paise, calculated_revenue_paise) VALUES (?, ?, ?, ?, ?)")
        .bind("range_two", "crop_range", "2026-09-02", Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    ]);

    for (const path of ["/dashboard", "/reports/cashflow"]) {
      const response = await request(path);
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: { code: "DATA_RANGE_ERROR", message: "Stored money exceeds the supported range" },
      });
    }
  });

  it("rejects unsafe expense totals before dashboard or cashflow arithmetic can round them", async () => {
    const exactUnsafeTotalParts = [4_503_599_627_370_496, 4_503_599_627_370_497];
    await env.DB.batch(exactUnsafeTotalParts.map((amount, index) => env.DB.prepare(
      `INSERT INTO expenses (
        id, expense_date, description, amount_paise, paid_by_person_id, expense_class, is_shared
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(`unsafe_expense_${index}`, "2026-09-05", `Unsafe ${index}`, amount, "person_satish", index === 0 ? "CAPEX" : "OPEX", 0)));

    for (const path of ["/dashboard", "/reports/cashflow"]) {
      const response = await request(path);
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: { code: "DATA_RANGE_ERROR", message: "Stored money exceeds the supported range" },
      });
    }
  });

  it("rejects near-equal unsafe revenue and expense totals instead of returning a rounded small net", async () => {
    await env.DB.prepare("INSERT INTO crops (id, name) VALUES (?, ?)").bind("crop_difference", "Difference crop").run();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO expenses (id, expense_date, description, amount_paise, paid_by_person_id, is_shared) VALUES (?, ?, ?, ?, ?, ?)")
        .bind("difference_expense_one", "2026-09-05", "Difference 1", 4_503_599_627_370_496, "person_satish", 0),
      env.DB.prepare("INSERT INTO expenses (id, expense_date, description, amount_paise, paid_by_person_id, is_shared) VALUES (?, ?, ?, ?, ?, ?)")
        .bind("difference_expense_two", "2026-09-05", "Difference 2", 4_503_599_627_370_497, "person_satish", 0),
      env.DB.prepare("INSERT INTO harvests (id, crop_id, harvest_date, actual_revenue_paise, calculated_revenue_paise) VALUES (?, ?, ?, ?, ?)")
        .bind("difference_revenue_one", "crop_difference", "2026-09-05", 4_503_599_627_370_496, 4_503_599_627_370_496),
      env.DB.prepare("INSERT INTO harvests (id, crop_id, harvest_date, actual_revenue_paise, calculated_revenue_paise) VALUES (?, ?, ?, ?, ?)")
        .bind("difference_revenue_two", "crop_difference", "2026-09-05", 4_503_599_627_370_496, 4_503_599_627_370_496),
    ]);

    const response = await request("/reports/cashflow");
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "DATA_RANGE_ERROR" } });
  });

  it("calculates date-filtered contribution reports through the settlement service", async () => {
    await seedFixture();
    await env.DB.prepare(
      `INSERT INTO expenses (
        id, expense_date, description, amount_paise, paid_by_person_id, category_id,
        expense_class, is_shared, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind("expense_aug_shared", "2026-08-20", "Older shared expense", 20_000, "person_satish", "category_fuel", "OPEX", 1, "2026-08-20T09:00:00.000Z").run();

    const response = await request("/reports/contributions?dateFrom=2026-09-01&dateTo=2026-09-30");
    await expect(response.json()).resolves.toEqual({
      data: {
        totalSharedExpensePaise: 325_050,
        participants: [
          { personId: "person_mahesh", name: "Mahesh", paidPaise: 200_000, expectedPaise: 162_525, balancePaise: 37_475 },
          { personId: "person_satish", name: "Satish", paidPaise: 125_050, expectedPaise: 162_525, balancePaise: -37_475 },
        ],
        recommendedTransfers: [{ fromPersonId: "person_satish", toPersonId: "person_mahesh", amountPaise: 37_475 }],
      },
    });
  });

  it("keeps the newest 24 monthly buckets while preserving chronological chart order", async () => {
    await seedFixture();
    const inserts: D1PreparedStatement[] = [];
    for (let month = 1; month <= 25; month += 1) {
      const year = 2024 + Math.floor((month - 1) / 12);
      const monthText = String(((month - 1) % 12) + 1).padStart(2, "0");
      inserts.push(env.DB.prepare(
        `INSERT INTO expenses (
          id, expense_date, description, amount_paise, paid_by_person_id, category_id,
          expense_class, is_shared, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(`expense_month_${month}`, `${year}-${monthText}-01`, `Month ${month}`, 100, "person_satish", "category_fuel", "OPEX", 0, `${year}-${monthText}-01T00:00:00.000Z`));
    }
    await env.DB.batch(inserts);

    const response = await request("/dashboard");
    const body = await response.json() as { data: { monthlyExpenses: Array<{ month: string }> } };
    expect(body.data.monthlyExpenses).toHaveLength(24);
    expect(body.data.monthlyExpenses[0]).toMatchObject({ month: "2024-04" });
    expect(body.data.monthlyExpenses.at(-1)).toMatchObject({ month: "2026-09" });
  });

  it("filters and caps settlement CSV exports deterministically", async () => {
    await seedFixture();
    const settlements: D1PreparedStatement[] = [];
    for (let index = 0; index < 5_001; index += 1) {
      settlements.push(env.DB.prepare(
        `INSERT INTO settlements (
          id, from_person_id, to_person_id, amount_paise, settlement_date, remarks, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(`settlement_${String(index).padStart(4, "0")}`, "person_satish", "person_mahesh", 100, "2026-09-10", `Settlement ${index}`, `2026-09-10T00:00:${String(index % 60).padStart(2, "0")}.000Z`));
    }
    settlements.push(env.DB.prepare(
      `INSERT INTO settlements (
        id, from_person_id, to_person_id, amount_paise, settlement_date, remarks, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind("settlement_aug", "person_satish", "person_mahesh", 100, "2026-08-10", "Excluded", "2026-08-10T00:00:00.000Z"));
    await env.DB.batch(settlements);

    const response = await request("/reports/export/settlements?dateFrom=2026-09-01&dateTo=2026-09-30");
    const csv = await response.text();
    expect(csv).toContain("Settlement 5000");
    expect(csv).not.toContain("Excluded");
    expect(csv.trim().split("\r\n")).toHaveLength(5_001);
  });

  it("filters dated plantation exports and excludes null planting dates when a range is active", async () => {
    await seedFixture();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO plantation_inventory (id, crop_id, farm_area_id, quantity, planting_date, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind("plantation_september", "crop_banana", "area_sk", 7, "2026-09-03", "September"),
      env.DB.prepare(
        `INSERT INTO plantation_inventory (id, crop_id, farm_area_id, quantity, planting_date, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind("plantation_undated", "crop_banana", "area_sk", 3, null, "Undated"),
    ]);

    const all = await request("/reports/export/plantation");
    expect(await all.text()).toContain("Date unavailable");
    const filtered = await request("/reports/export/plantation?dateFrom=2026-09-01&dateTo=2026-09-30");
    const csv = await filtered.text();
    expect(csv).toContain("2026-09-03");
    expect(csv).not.toContain("2026-08-01");
    expect(csv).not.toContain("Date unavailable");
  });
});
