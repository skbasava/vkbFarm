import type { ExpenseFilters } from "../validation/expenses";

export type Expense = {
  id: string;
  expenseDate: string;
  description: string;
  amountPaise: number;
  paidByPersonId: string;
  paidByPersonName: string;
  categoryId: string | null;
  categoryName: string | null;
  expenseClass: "CAPEX" | "OPEX" | null;
  paidTo: string | null;
  notes: string | null;
  cropId: string | null;
  cropName: string | null;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
};

type ExpenseRow = {
  id: string;
  expense_date: string;
  description: string;
  amount_paise: number;
  paid_by_person_id: string;
  paid_by_person_name: string;
  category_id: string | null;
  category_name: string | null;
  expense_class: "CAPEX" | "OPEX" | null;
  paid_to: string | null;
  notes: string | null;
  crop_id: string | null;
  crop_name: string | null;
  is_shared: number;
  created_at: string;
  updated_at: string;
};

export type ExpenseWrite = {
  id: string;
  expenseDate: string;
  description: string;
  amountPaise: number;
  paidByPersonId: string;
  categoryId: string | null;
  expenseClass: "CAPEX" | "OPEX" | null;
  paidTo: string | null;
  notes: string | null;
  cropId: string | null;
  isShared: boolean;
  updatedAt: string;
};

const EXPENSE_SELECT = `
  SELECT e.id, e.expense_date, e.description, e.amount_paise,
    e.paid_by_person_id, p.name AS paid_by_person_name,
    e.category_id, ec.name AS category_name, e.expense_class,
    e.paid_to, e.notes, e.crop_id, c.name AS crop_name, e.is_shared,
    e.created_at, e.updated_at
  FROM expenses e
  JOIN people p ON p.id = e.paid_by_person_id
  LEFT JOIN expense_categories ec ON ec.id = e.category_id
  LEFT JOIN crops c ON c.id = e.crop_id`;

const SORT_SQL: Record<ExpenseFilters["sortBy"], string> = {
  expenseDate: "e.expense_date",
  amount: "e.amount_paise",
  description: "e.description COLLATE NOCASE",
  createdAt: "e.created_at",
};

function mapExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    expenseDate: row.expense_date,
    description: row.description,
    amountPaise: row.amount_paise,
    paidByPersonId: row.paid_by_person_id,
    paidByPersonName: row.paid_by_person_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    expenseClass: row.expense_class,
    paidTo: row.paid_to,
    notes: row.notes,
    cropId: row.crop_id,
    cropName: row.crop_name,
    isShared: row.is_shared === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildWhere(filters: ExpenseFilters): {
  sql: string;
  params: Array<string | number>;
} {
  const conditions = ["e.deleted_at IS NULL"];
  const params: Array<string | number> = [];

  if (filters.search) {
    conditions.push(
      "(e.description LIKE ? COLLATE NOCASE OR e.paid_to LIKE ? COLLATE NOCASE OR ec.name LIKE ? COLLATE NOCASE)",
    );
    const search = `%${filters.search}%`;
    params.push(search, search, search);
  }
  if (filters.paidByPersonId) {
    conditions.push("e.paid_by_person_id = ?");
    params.push(filters.paidByPersonId);
  }
  if (filters.dateFrom) {
    conditions.push("e.expense_date >= ?");
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push("e.expense_date <= ?");
    params.push(filters.dateTo);
  }
  if (filters.categoryId) {
    conditions.push("e.category_id = ?");
    params.push(filters.categoryId);
  }
  if (filters.expenseClass === "null") {
    conditions.push("e.expense_class IS NULL");
  } else if (filters.expenseClass) {
    conditions.push("e.expense_class = ?");
    params.push(filters.expenseClass);
  }
  if (filters.minAmountPaise !== undefined) {
    conditions.push("e.amount_paise >= ?");
    params.push(filters.minAmountPaise);
  }
  if (filters.maxAmountPaise !== undefined) {
    conditions.push("e.amount_paise <= ?");
    params.push(filters.maxAmountPaise);
  }

  return { sql: `WHERE ${conditions.join(" AND ")}`, params };
}

export async function listExpenses(
  db: D1Database,
  filters: ExpenseFilters,
): Promise<{ data: Expense[]; total: number }> {
  const where = buildWhere(filters);
  const offset = (filters.page - 1) * filters.pageSize;
  const direction = filters.sortOrder === "asc" ? "ASC" : "DESC";
  const orderBy = `${SORT_SQL[filters.sortBy]} ${direction}, e.expense_date DESC, e.created_at DESC, e.id DESC`;

  const [countResult, listResult] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS total FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id ${where.sql}`,
      )
      .bind(...where.params)
      .first<{ total: number }>(),
    db
      .prepare(
        `${EXPENSE_SELECT} ${where.sql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      )
      .bind(...where.params, filters.pageSize, offset)
      .all<ExpenseRow>(),
  ]);

  return {
    data: listResult.results.map(mapExpense),
    total: countResult?.total ?? 0,
  };
}

export async function getExpense(
  db: D1Database,
  id: string,
): Promise<Expense | null> {
  const row = await db
    .prepare(
      `${EXPENSE_SELECT} WHERE e.id = ? AND e.deleted_at IS NULL LIMIT 1`,
    )
    .bind(id)
    .first<ExpenseRow>();
  return row ? mapExpense(row) : null;
}

export function insertExpenseStatement(
  db: D1Database,
  expense: ExpenseWrite,
): D1PreparedStatement {
  return db
    .prepare(
      `
      INSERT INTO expenses (
        id, expense_date, description, amount_paise, paid_by_person_id,
        category_id, expense_class, paid_to, notes, crop_id, is_shared, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      expense.id,
      expense.expenseDate,
      expense.description,
      expense.amountPaise,
      expense.paidByPersonId,
      expense.categoryId,
      expense.expenseClass,
      expense.paidTo,
      expense.notes,
      expense.cropId,
      expense.isShared ? 1 : 0,
      expense.updatedAt,
    );
}

export function updateExpenseStatement(
  db: D1Database,
  expense: ExpenseWrite,
): D1PreparedStatement {
  return db
    .prepare(
      `
      UPDATE expenses SET expense_date = ?, description = ?, amount_paise = ?,
        paid_by_person_id = ?, category_id = ?, expense_class = ?, paid_to = ?,
        notes = ?, crop_id = ?, is_shared = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(
      expense.expenseDate,
      expense.description,
      expense.amountPaise,
      expense.paidByPersonId,
      expense.categoryId,
      expense.expenseClass,
      expense.paidTo,
      expense.notes,
      expense.cropId,
      expense.isShared ? 1 : 0,
      expense.updatedAt,
      expense.id,
    );
}

export function deleteExpenseStatement(
  db: D1Database,
  id: string,
  deletedAt: string,
): D1PreparedStatement {
  return db
    .prepare(
      "UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(deletedAt, deletedAt, id);
}
