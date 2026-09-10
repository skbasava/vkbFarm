import { ApiHttpError } from "../middleware/errors";
import { createId } from "../utils/ids";

export type ExpenseCategory = {
  id: string;
  name: string;
  defaultExpenseClass: "CAPEX" | "OPEX" | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type CategoryRow = {
  id: string;
  name: string;
  default_expense_class: "CAPEX" | "OPEX" | null;
  active: number;
  created_at: string;
  updated_at: string;
};

function mapCategory(row: CategoryRow): ExpenseCategory {
  return {
    id: row.id,
    name: row.name,
    defaultExpenseClass: row.default_expense_class,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizedCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
}

function mapCategoryConstraint(error: unknown): never {
  if (
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed")
  ) {
    throw new ApiHttpError(
      409,
      "CATEGORY_EXISTS",
      "An expense category with this name already exists",
    );
  }
  throw error;
}

export async function listCategories(
  db: D1Database,
  options: { page: number; pageSize: number; includeInactive: boolean },
): Promise<{ data: ExpenseCategory[]; total: number }> {
  const where = options.includeInactive ? "" : "WHERE active = 1";
  const offset = (options.page - 1) * options.pageSize;
  const [count, rows] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS total FROM expense_categories ${where}`)
      .first<{ total: number }>(),
    db
      .prepare(
        `
        SELECT id, name, default_expense_class, active, created_at, updated_at
        FROM expense_categories ${where}
        ORDER BY name COLLATE NOCASE ASC, id ASC LIMIT ? OFFSET ?`,
      )
      .bind(options.pageSize, offset)
      .all<CategoryRow>(),
  ]);
  return { data: rows.results.map(mapCategory), total: count?.total ?? 0 };
}

export async function getCategory(
  db: D1Database,
  id: string,
): Promise<ExpenseCategory | null> {
  const row = await db
    .prepare(
      `
      SELECT id, name, default_expense_class, active, created_at, updated_at
      FROM expense_categories WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<CategoryRow>();
  return row ? mapCategory(row) : null;
}

export async function createCategory(
  db: D1Database,
  input: {
    name: string;
    defaultExpenseClass?: "CAPEX" | "OPEX" | null;
    active?: boolean;
  },
): Promise<ExpenseCategory> {
  const id = createId();
  const name = input.name.trim().replace(/\s+/g, " ");
  try {
    await db
      .prepare(
        `
        INSERT INTO expense_categories (id, name, normalized_name, default_expense_class, active)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        name,
        normalizedCategoryName(name),
        input.defaultExpenseClass ?? null,
        input.active === false ? 0 : 1,
      )
      .run();
  } catch (error) {
    mapCategoryConstraint(error);
  }
  const category = await getCategory(db, id);
  if (!category)
    throw new ApiHttpError(
      500,
      "STORAGE_ERROR",
      "The category could not be read after writing",
    );
  return category;
}

export async function updateCategory(
  db: D1Database,
  id: string,
  input: {
    name?: string;
    defaultExpenseClass?: "CAPEX" | "OPEX" | null;
    active?: boolean;
  },
): Promise<ExpenseCategory> {
  const current = await getCategory(db, id);
  if (!current)
    throw new ApiHttpError(
      404,
      "CATEGORY_NOT_FOUND",
      "The expense category was not found",
    );
  const name = input.name?.trim().replace(/\s+/g, " ") ?? current.name;
  const defaultExpenseClass =
    input.defaultExpenseClass === undefined
      ? current.defaultExpenseClass
      : input.defaultExpenseClass;
  const active = input.active ?? current.active;
  try {
    await db
      .prepare(
        `
        UPDATE expense_categories SET name = ?, normalized_name = ?,
          default_expense_class = ?, active = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(
        name,
        normalizedCategoryName(name),
        defaultExpenseClass,
        active ? 1 : 0,
        new Date().toISOString(),
        id,
      )
      .run();
  } catch (error) {
    mapCategoryConstraint(error);
  }
  const category = await getCategory(db, id);
  if (!category)
    throw new ApiHttpError(
      500,
      "STORAGE_ERROR",
      "The category could not be read after writing",
    );
  return category;
}
