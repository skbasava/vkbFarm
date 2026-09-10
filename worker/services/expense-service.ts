import { ApiHttpError } from "../middleware/errors";
import {
  deleteExpenseStatement,
  getExpense,
  insertExpenseStatement,
  updateExpenseStatement,
  type Expense,
  type ExpenseWrite,
} from "../repositories/expense-repository";
import { createId } from "../utils/ids";
import { rupeesToPaise } from "../utils/money";
import type { ExpenseInput, ExpenseUpdateInput } from "../validation/expenses";

type ActiveRow = { active: number };

function referenceNotFound(
  reference: "person" | "category" | "crop",
): ApiHttpError {
  return new ApiHttpError(
    404,
    "REFERENCE_NOT_FOUND",
    `The selected ${reference} was not found`,
  );
}

async function validateReferences(
  db: D1Database,
  input: Pick<ExpenseWrite, "paidByPersonId" | "categoryId" | "cropId">,
): Promise<void> {
  const personPromise = db
    .prepare("SELECT active FROM people WHERE id = ? LIMIT 1")
    .bind(input.paidByPersonId)
    .first<ActiveRow>();
  const categoryPromise = input.categoryId
    ? db
        .prepare("SELECT active FROM expense_categories WHERE id = ? LIMIT 1")
        .bind(input.categoryId)
        .first<ActiveRow>()
    : Promise.resolve(null);
  const cropPromise = input.cropId
    ? db
        .prepare("SELECT active FROM crops WHERE id = ? LIMIT 1")
        .bind(input.cropId)
        .first<ActiveRow>()
    : Promise.resolve(null);
  const [person, category, crop] = await Promise.all([
    personPromise,
    categoryPromise,
    cropPromise,
  ]);

  if (!person || person.active !== 1) throw referenceNotFound("person");
  if (input.categoryId && !category) throw referenceNotFound("category");
  if (category && category.active !== 1) {
    throw new ApiHttpError(
      409,
      "CATEGORY_INACTIVE",
      "The selected expense category is inactive",
    );
  }
  if (input.cropId && (!crop || crop.active !== 1))
    throw referenceNotFound("crop");
}

function auditStatement(
  db: D1Database,
  entityId: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  actor: string,
  before: Expense | null,
  after: ExpenseWrite | null,
): D1PreparedStatement {
  return db
    .prepare(
      `
      INSERT INTO audit_log (id, entity_type, entity_id, action, actor, before_json, after_json)
      VALUES (?, 'expense', ?, ?, ?, ?, ?)`,
    )
    .bind(
      createId(),
      entityId,
      action,
      actor,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
    );
}

function createWrite(
  input: ExpenseInput,
  id: string,
  updatedAt: string,
): ExpenseWrite {
  return {
    id,
    expenseDate: input.expenseDate,
    description: input.description,
    amountPaise: rupeesToPaise(input.amount),
    paidByPersonId: input.paidByPersonId,
    categoryId: input.categoryId,
    expenseClass: input.expenseClass,
    paidTo: input.paidTo ?? null,
    notes: input.notes ?? null,
    cropId: input.cropId ?? null,
    isShared: input.isShared,
    updatedAt,
  };
}

function mergeWrite(
  current: Expense,
  input: ExpenseUpdateInput,
  updatedAt: string,
): ExpenseWrite {
  return {
    id: current.id,
    expenseDate: input.expenseDate ?? current.expenseDate,
    description: input.description ?? current.description,
    amountPaise:
      input.amount === undefined
        ? current.amountPaise
        : rupeesToPaise(input.amount),
    paidByPersonId: input.paidByPersonId ?? current.paidByPersonId,
    categoryId:
      input.categoryId === undefined ? current.categoryId : input.categoryId,
    expenseClass:
      input.expenseClass === undefined
        ? current.expenseClass
        : input.expenseClass,
    paidTo: input.paidTo === undefined ? current.paidTo : input.paidTo,
    notes: input.notes === undefined ? current.notes : input.notes,
    cropId: input.cropId === undefined ? current.cropId : input.cropId,
    isShared: input.isShared ?? current.isShared,
    updatedAt,
  };
}

async function requireWrittenExpense(
  db: D1Database,
  id: string,
): Promise<Expense> {
  const expense = await getExpense(db, id);
  if (!expense) {
    throw new ApiHttpError(
      500,
      "STORAGE_ERROR",
      "The expense could not be read after writing",
    );
  }
  return expense;
}

export async function createExpense(
  db: D1Database,
  input: ExpenseInput,
  actor: string,
): Promise<Expense> {
  const now = new Date().toISOString();
  const expense = createWrite(input, createId(), now);
  await validateReferences(db, expense);
  await db.batch([
    insertExpenseStatement(db, expense),
    auditStatement(db, expense.id, "CREATE", actor, null, expense),
  ]);
  return requireWrittenExpense(db, expense.id);
}

export async function updateExpense(
  db: D1Database,
  id: string,
  input: ExpenseUpdateInput,
  actor: string,
): Promise<Expense> {
  const current = await getExpense(db, id);
  if (!current)
    throw new ApiHttpError(
      404,
      "EXPENSE_NOT_FOUND",
      "The expense was not found",
    );

  const expense = mergeWrite(current, input, new Date().toISOString());
  await validateReferences(db, expense);
  await db.batch([
    updateExpenseStatement(db, expense),
    auditStatement(db, id, "UPDATE", actor, current, expense),
  ]);
  return requireWrittenExpense(db, id);
}

export async function softDeleteExpense(
  db: D1Database,
  id: string,
  actor: string,
): Promise<{ id: string; deleted: true }> {
  const current = await getExpense(db, id);
  if (!current)
    throw new ApiHttpError(
      404,
      "EXPENSE_NOT_FOUND",
      "The expense was not found",
    );

  const deletedAt = new Date().toISOString();
  await db.batch([
    deleteExpenseStatement(db, id, deletedAt),
    auditStatement(db, id, "DELETE", actor, current, null),
  ]);
  return { id, deleted: true };
}
