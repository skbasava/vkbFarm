import { Hono, type Context } from "hono";
import type { z } from "zod";
import { ApiHttpError } from "../middleware/errors";
import { getIdentity } from "../middleware/identity";
import { requireRole } from "../middleware/roles";
import { getExpense, listExpenses } from "../repositories/expense-repository";
import {
  createExpense,
  softDeleteExpense,
  updateExpense,
} from "../services/expense-service";
import type { AppEnv } from "../types";
import { isIsoLocalDate } from "../utils/dates";
import { rupeesToPaise } from "../utils/money";
import {
  EXPENSE_SORT_FIELDS,
  ExpenseInputSchema,
  ExpenseUpdateSchema,
  type ExpenseFilters,
  type ExpenseSortField,
} from "../validation/expenses";

function validationError(
  message: string,
  details?: Record<string, unknown>,
): ApiHttpError {
  return new ApiHttpError(422, "VALIDATION_ERROR", message, details);
}

async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw validationError("Request body must be valid JSON");
  }
  const result = schema.safeParse(input);
  if (!result.success) {
    throw validationError("The expense input is invalid", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  field: string,
): number {
  if (value === undefined) return fallback;
  if (
    !/^\d+$/.test(value) ||
    Number(value) < 1 ||
    !Number.isSafeInteger(Number(value))
  ) {
    throw validationError(`${field} must be a positive integer`);
  }
  return Number(value);
}

function optionalDate(
  value: string | undefined,
  field: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (!isIsoLocalDate(value))
    throw validationError(`${field} must be a valid ISO local date`);
  return value;
}

function optionalAmount(
  value: string | undefined,
  field: string,
): number | undefined {
  if (value === undefined) return undefined;
  try {
    return rupeesToPaise(value);
  } catch {
    throw validationError(`${field} must be a non-negative decimal amount`);
  }
}

function parseFilters(url: URL): ExpenseFilters {
  const params = url.searchParams;
  const page = positiveInteger(params.get("page") ?? undefined, 1, "page");
  const pageSize = Math.min(
    positiveInteger(params.get("pageSize") ?? undefined, 25, "pageSize"),
    100,
  );
  const sortByValue = params.get("sortBy") ?? "expenseDate";
  if (!EXPENSE_SORT_FIELDS.some((field) => field === sortByValue)) {
    throw validationError("sortBy is not supported");
  }
  const sortOrderValue = params.get("sortOrder") ?? "desc";
  if (sortOrderValue !== "asc" && sortOrderValue !== "desc") {
    throw validationError("sortOrder must be asc or desc");
  }
  const expenseClassValue = params.get("expenseClass") ?? undefined;
  if (
    expenseClassValue !== undefined &&
    expenseClassValue !== "CAPEX" &&
    expenseClassValue !== "OPEX" &&
    expenseClassValue !== "null"
  ) {
    throw validationError("expenseClass must be CAPEX, OPEX, or null");
  }
  const dateFrom = optionalDate(
    params.get("dateFrom") ?? undefined,
    "dateFrom",
  );
  const dateTo = optionalDate(params.get("dateTo") ?? undefined, "dateTo");
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw validationError("dateFrom must not be after dateTo");
  }
  const minAmountPaise = optionalAmount(
    params.get("minAmount") ?? undefined,
    "minAmount",
  );
  const maxAmountPaise = optionalAmount(
    params.get("maxAmount") ?? undefined,
    "maxAmount",
  );
  if (
    minAmountPaise !== undefined &&
    maxAmountPaise !== undefined &&
    minAmountPaise > maxAmountPaise
  ) {
    throw validationError("minAmount must not exceed maxAmount");
  }

  const search = params.get("search")?.trim();
  return {
    page,
    pageSize,
    ...(search ? { search } : {}),
    ...(params.get("paidByPersonId")
      ? { paidByPersonId: params.get("paidByPersonId")! }
      : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(params.get("categoryId")
      ? { categoryId: params.get("categoryId")! }
      : {}),
    ...(expenseClassValue ? { expenseClass: expenseClassValue } : {}),
    ...(minAmountPaise !== undefined ? { minAmountPaise } : {}),
    ...(maxAmountPaise !== undefined ? { maxAmountPaise } : {}),
    sortBy: sortByValue as ExpenseSortField,
    sortOrder: sortOrderValue,
  };
}

export const expenseRoutes = new Hono<AppEnv>();

expenseRoutes.get("/", async (c) => {
  const filters = parseFilters(new URL(c.req.url));
  const result = await listExpenses(c.env.DB, filters);
  return c.json({
    data: result.data,
    meta: {
      page: filters.page,
      pageSize: filters.pageSize,
      total: result.total,
    },
  });
});

expenseRoutes.get("/:id", async (c) => {
  const expense = await getExpense(c.env.DB, c.req.param("id"));
  if (!expense)
    throw new ApiHttpError(
      404,
      "EXPENSE_NOT_FOUND",
      "The expense was not found",
    );
  return c.json({ data: expense });
});

expenseRoutes.post("/", requireRole("editor"), async (c) => {
  const input = await parseJson(c.req.raw, ExpenseInputSchema);
  const expense = await createExpense(c.env.DB, input, getIdentity(c).email);
  return c.json({ data: expense }, 201);
});

const updateHandler = async (c: Context<AppEnv>) => {
  const input = await parseJson(c.req.raw, ExpenseUpdateSchema);
  const id = c.req.param("id");
  if (!id)
    throw new ApiHttpError(
      404,
      "EXPENSE_NOT_FOUND",
      "The expense was not found",
    );
  const expense = await updateExpense(
    c.env.DB,
    id,
    input,
    getIdentity(c).email,
  );
  return c.json({ data: expense });
};

expenseRoutes.patch("/:id", requireRole("editor"), updateHandler);
expenseRoutes.put("/:id", requireRole("editor"), updateHandler);

expenseRoutes.delete("/:id", requireRole("editor"), async (c) => {
  const result = await softDeleteExpense(
    c.env.DB,
    c.req.param("id"),
    getIdentity(c).email,
  );
  return c.json({ data: result });
});
