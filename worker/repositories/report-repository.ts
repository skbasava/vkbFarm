export type DateRange = { dateFrom?: string; dateTo?: string };

export type DashboardTotals = {
  expensePaise: number;
  currentMonthExpensePaise: number;
  currentYearExpensePaise: number;
  capexPaise: number;
  opexPaise: number;
  revenuePaise: number;
  netCashFlowPaise: number;
};

export type MonthlyExpense = { month: string; amountPaise: number };
export type CategoryExpense = { categoryId: string | null; categoryName: string; amountPaise: number };
export type RecentExpense = {
  id: string;
  expenseDate: string;
  description: string;
  amountPaise: number;
  paidByPersonName: string;
  categoryName: string | null;
  expenseClass: "CAPEX" | "OPEX" | null;
};
export type RecentHarvest = {
  id: string;
  cropName: string;
  harvestDate: string | null;
  quantity: number | null;
  revenuePaise: number;
  buyer: string | null;
};
export type PlantationSummary = { totalQuantity: number; cropCount: number; areaCount: number };
export type ExpenseReportRow = RecentExpense & { paidTo: string | null; isShared: boolean; notes: string | null };
export type HarvestReportRow = RecentHarvest & { notes: string | null };
export type PlantationReportRow = { cropName: string; areaCode: string; areaName: string; quantity: number; plantingDate: string | null; notes: string | null };
export type SettlementReportRow = { settlementDate: string; fromPersonName: string; toPersonName: string; amountPaise: number; remarks: string | null };

type TotalRow = {
  expense_paise: number;
  current_month_expense_paise: number;
  current_year_expense_paise: number;
  capex_paise: number;
  opex_paise: number;
  revenue_paise: number;
};

function numberValue(value: number | null | undefined): number {
  return value ?? 0;
}

function rangeWhere(column: string, range: DateRange): { sql: string; params: string[] } {
  const conditions: string[] = [];
  const params: string[] = [];
  if (range.dateFrom) {
    conditions.push(`${column} >= ?`);
    params.push(range.dateFrom);
  }
  if (range.dateTo) {
    conditions.push(`${column} <= ?`);
    params.push(range.dateTo);
  }
  return { sql: conditions.length ? ` AND ${conditions.join(" AND ")}` : "", params };
}

export async function getDashboardTotals(db: D1Database, currentMonth: string, currentYear: string): Promise<DashboardTotals> {
  const row = await db.prepare(
    `SELECT
      COALESCE(SUM(e.amount_paise), 0) AS expense_paise,
      COALESCE(SUM(CASE WHEN substr(e.expense_date, 1, 7) = ? THEN e.amount_paise ELSE 0 END), 0) AS current_month_expense_paise,
      COALESCE(SUM(CASE WHEN substr(e.expense_date, 1, 4) = ? THEN e.amount_paise ELSE 0 END), 0) AS current_year_expense_paise,
      COALESCE(SUM(CASE WHEN e.expense_class = 'CAPEX' THEN e.amount_paise ELSE 0 END), 0) AS capex_paise,
      COALESCE(SUM(CASE WHEN e.expense_class = 'OPEX' THEN e.amount_paise ELSE 0 END), 0) AS opex_paise,
      (SELECT COALESCE(SUM(COALESCE(h.actual_revenue_paise, h.calculated_revenue_paise)), 0) FROM harvests h) AS revenue_paise
    FROM expenses e WHERE e.deleted_at IS NULL`,
  ).bind(currentMonth, currentYear).first<TotalRow>();
  const expensePaise = numberValue(row?.expense_paise);
  const revenuePaise = numberValue(row?.revenue_paise);
  return {
    expensePaise,
    currentMonthExpensePaise: numberValue(row?.current_month_expense_paise),
    currentYearExpensePaise: numberValue(row?.current_year_expense_paise),
    capexPaise: numberValue(row?.capex_paise),
    opexPaise: numberValue(row?.opex_paise),
    revenuePaise,
    netCashFlowPaise: revenuePaise - expensePaise,
  };
}

export async function listMonthlyExpenses(db: D1Database): Promise<MonthlyExpense[]> {
  const rows = await db.prepare(
    `SELECT month, amount_paise FROM (
       SELECT substr(expense_date, 1, 7) AS month, SUM(amount_paise) AS amount_paise
       FROM expenses WHERE deleted_at IS NULL
       GROUP BY substr(expense_date, 1, 7) ORDER BY month DESC LIMIT 24
     ) ORDER BY month ASC`,
  ).all<{ month: string; amount_paise: number }>();
  return rows.results.map((row) => ({ month: row.month, amountPaise: row.amount_paise }));
}

export async function listCategoryExpenses(db: D1Database): Promise<CategoryExpense[]> {
  const rows = await db.prepare(
    `SELECT e.category_id, COALESCE(c.name, 'Uncategorized') AS category_name,
       SUM(e.amount_paise) AS amount_paise
     FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
     WHERE e.deleted_at IS NULL
     GROUP BY e.category_id, c.name
     ORDER BY amount_paise DESC, category_name ASC LIMIT 12`,
  ).all<{ category_id: string | null; category_name: string; amount_paise: number }>();
  return rows.results.map((row) => ({ categoryId: row.category_id, categoryName: row.category_name, amountPaise: row.amount_paise }));
}

export async function listRecentExpenses(db: D1Database, limit = 8): Promise<RecentExpense[]> {
  const rows = await db.prepare(
    `SELECT e.id, e.expense_date, e.description, e.amount_paise, p.name AS paid_by_person_name,
       c.name AS category_name, e.expense_class
     FROM expenses e JOIN people p ON p.id = e.paid_by_person_id
     LEFT JOIN expense_categories c ON c.id = e.category_id
     WHERE e.deleted_at IS NULL
     ORDER BY e.expense_date DESC, e.created_at DESC, e.id DESC LIMIT ?`,
  ).bind(limit).all<{
    id: string; expense_date: string; description: string; amount_paise: number;
    paid_by_person_name: string; category_name: string | null; expense_class: "CAPEX" | "OPEX" | null;
  }>();
  return rows.results.map((row) => ({ id: row.id, expenseDate: row.expense_date, description: row.description, amountPaise: row.amount_paise, paidByPersonName: row.paid_by_person_name, categoryName: row.category_name, expenseClass: row.expense_class }));
}

export async function listRecentHarvests(db: D1Database, limit = 8): Promise<RecentHarvest[]> {
  const rows = await db.prepare(
    `SELECT h.id, c.name AS crop_name, h.harvest_date, h.quantity,
       COALESCE(h.actual_revenue_paise, h.calculated_revenue_paise, 0) AS revenue_paise, h.buyer
     FROM harvests h JOIN crops c ON c.id = h.crop_id
     ORDER BY h.harvest_date IS NULL ASC, h.harvest_date DESC, h.created_at DESC, h.id DESC LIMIT ?`,
  ).bind(limit).all<{ id: string; crop_name: string; harvest_date: string | null; quantity: number | null; revenue_paise: number; buyer: string | null }>();
  return rows.results.map((row) => ({ id: row.id, cropName: row.crop_name, harvestDate: row.harvest_date, quantity: row.quantity, revenuePaise: row.revenue_paise, buyer: row.buyer }));
}

export async function getPlantationSummary(db: D1Database): Promise<PlantationSummary> {
  const row = await db.prepare(
    `SELECT COALESCE(SUM(quantity), 0) AS total_quantity, COUNT(DISTINCT crop_id) AS crop_count,
       COUNT(DISTINCT farm_area_id) AS area_count FROM plantation_inventory WHERE deleted_at IS NULL`,
  ).first<{ total_quantity: number; crop_count: number; area_count: number }>();
  return { totalQuantity: numberValue(row?.total_quantity), cropCount: numberValue(row?.crop_count), areaCount: numberValue(row?.area_count) };
}

export async function listExpenseReport(db: D1Database, range: DateRange): Promise<ExpenseReportRow[]> {
  const where = rangeWhere("e.expense_date", range);
  const rows = await db.prepare(
    `SELECT e.id, e.expense_date, e.description, e.amount_paise, p.name AS paid_by_person_name,
       c.name AS category_name, e.expense_class, e.paid_to, e.is_shared, e.notes
     FROM expenses e JOIN people p ON p.id = e.paid_by_person_id
     LEFT JOIN expense_categories c ON c.id = e.category_id
     WHERE e.deleted_at IS NULL${where.sql}
     ORDER BY e.expense_date DESC, e.created_at DESC, e.id DESC LIMIT 5000`,
  ).bind(...where.params).all<{
    id: string; expense_date: string; description: string; amount_paise: number; paid_by_person_name: string;
    category_name: string | null; expense_class: "CAPEX" | "OPEX" | null; paid_to: string | null; is_shared: number; notes: string | null;
  }>();
  return rows.results.map((row) => ({ id: row.id, expenseDate: row.expense_date, description: row.description, amountPaise: row.amount_paise, paidByPersonName: row.paid_by_person_name, categoryName: row.category_name, expenseClass: row.expense_class, paidTo: row.paid_to, isShared: row.is_shared === 1, notes: row.notes }));
}

export async function listHarvestReport(db: D1Database, range: DateRange): Promise<HarvestReportRow[]> {
  const where = rangeWhere("h.harvest_date", range);
  const rows = await db.prepare(
    `SELECT h.id, c.name AS crop_name, h.harvest_date, h.quantity,
       COALESCE(h.actual_revenue_paise, h.calculated_revenue_paise, 0) AS revenue_paise, h.buyer, h.notes
     FROM harvests h JOIN crops c ON c.id = h.crop_id
     WHERE 1 = 1${where.sql}
     ORDER BY h.harvest_date IS NULL ASC, h.harvest_date DESC, h.created_at DESC, h.id DESC LIMIT 5000`,
  ).bind(...where.params).all<{
    id: string; crop_name: string; harvest_date: string | null; quantity: number | null; revenue_paise: number; buyer: string | null; notes: string | null;
  }>();
  return rows.results.map((row) => ({ id: row.id, cropName: row.crop_name, harvestDate: row.harvest_date, quantity: row.quantity, revenuePaise: row.revenue_paise, buyer: row.buyer, notes: row.notes }));
}

export async function getCashflowReport(db: D1Database, range: DateRange): Promise<{ expensePaise: number; revenuePaise: number; netCashFlowPaise: number }> {
  const expenseRange = rangeWhere("expense_date", range);
  const harvestRange = rangeWhere("harvest_date", range);
  const [expenses, harvests] = await Promise.all([
    db.prepare(`SELECT COALESCE(SUM(amount_paise), 0) AS amount_paise FROM expenses WHERE deleted_at IS NULL${expenseRange.sql}`).bind(...expenseRange.params).first<{ amount_paise: number }>(),
    db.prepare(`SELECT COALESCE(SUM(COALESCE(actual_revenue_paise, calculated_revenue_paise)), 0) AS amount_paise FROM harvests WHERE harvest_date IS NOT NULL${harvestRange.sql}`).bind(...harvestRange.params).first<{ amount_paise: number }>(),
  ]);
  const expensePaise = numberValue(expenses?.amount_paise);
  const revenuePaise = numberValue(harvests?.amount_paise);
  return { expensePaise, revenuePaise, netCashFlowPaise: revenuePaise - expensePaise };
}

export async function listSettlementReport(db: D1Database, range: DateRange): Promise<SettlementReportRow[]> {
  const where = rangeWhere("s.settlement_date", range);
  const rows = await db.prepare(
    `SELECT s.settlement_date, payer.name AS from_person_name, receiver.name AS to_person_name,
       s.amount_paise, s.remarks
     FROM settlements s JOIN people payer ON payer.id = s.from_person_id
     JOIN people receiver ON receiver.id = s.to_person_id
     WHERE 1 = 1${where.sql}
     ORDER BY s.settlement_date DESC, s.created_at DESC, s.id DESC LIMIT 5000`,
  ).bind(...where.params).all<{
    settlement_date: string; from_person_name: string; to_person_name: string; amount_paise: number; remarks: string | null;
  }>();
  return rows.results.map((row) => ({ settlementDate: row.settlement_date, fromPersonName: row.from_person_name, toPersonName: row.to_person_name, amountPaise: row.amount_paise, remarks: row.remarks }));
}

export async function listPlantationReport(db: D1Database, range: DateRange = {}): Promise<PlantationReportRow[]> {
  const where = rangeWhere("p.planting_date", range);
  const excludesUndated = range.dateFrom || range.dateTo;
  const rows = await db.prepare(
    `SELECT c.name AS crop_name, a.code AS area_code, a.name AS area_name, p.quantity, p.planting_date, p.notes
     FROM plantation_inventory p JOIN crops c ON c.id = p.crop_id JOIN farm_areas a ON a.id = p.farm_area_id
     WHERE p.deleted_at IS NULL${excludesUndated ? " AND p.planting_date IS NOT NULL" : ""}${where.sql}
     ORDER BY p.planting_date IS NULL ASC, p.planting_date DESC, c.name COLLATE NOCASE ASC, a.code COLLATE NOCASE ASC, p.id ASC LIMIT 5000`,
  ).bind(...where.params).all<{ crop_name: string; area_code: string; area_name: string; quantity: number; planting_date: string | null; notes: string | null }>();
  return rows.results.map((row) => ({ cropName: row.crop_name, areaCode: row.area_code, areaName: row.area_name, quantity: row.quantity, plantingDate: row.planting_date, notes: row.notes }));
}
