import { Hono, type Context } from "hono";
import { z } from "zod";
import { ApiHttpError } from "../middleware/errors";
import { getIdentity } from "../middleware/identity";
import { requireRole } from "../middleware/roles";
import {
  createCategory,
  listCategories,
  updateCategory,
} from "../repositories/category-repository";
import type { AppEnv } from "../types";

const CategoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    defaultExpenseClass: z.enum(["CAPEX", "OPEX"]).nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();
const CategoryUpdateSchema = CategoryInputSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  "At least one category field must be supplied",
);

function positiveInteger(
  value: string | null,
  fallback: number,
  field: string,
): number {
  if (value === null) return fallback;
  if (
    !/^\d+$/.test(value) ||
    Number(value) < 1 ||
    !Number.isSafeInteger(Number(value))
  ) {
    throw new ApiHttpError(
      422,
      "VALIDATION_ERROR",
      `${field} must be a positive integer`,
    );
  }
  return Number(value);
}

async function parseJson<T>(
  c: Context<AppEnv>,
  schema: z.ZodType<T>,
): Promise<T> {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    throw new ApiHttpError(
      422,
      "VALIDATION_ERROR",
      "Request body must be valid JSON",
    );
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiHttpError(
      422,
      "VALIDATION_ERROR",
      "The category input is invalid",
      {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    );
  }
  return result.data;
}

export const categoryRoutes = new Hono<AppEnv>();

categoryRoutes.get("/", async (c) => {
  const page = positiveInteger(c.req.query("page") ?? null, 1, "page");
  const pageSize = Math.min(
    positiveInteger(c.req.query("pageSize") ?? null, 25, "pageSize"),
    100,
  );
  const result = await listCategories(c.env.DB, {
    page,
    pageSize,
    includeInactive: c.req.query("includeInactive") === "true",
  });
  return c.json({
    data: result.data,
    meta: { page, pageSize, total: result.total },
  });
});

categoryRoutes.post("/", requireRole("admin"), async (c) => {
  const input = await parseJson(c, CategoryInputSchema);
  return c.json(
    { data: await createCategory(c.env.DB, input, getIdentity(c).email) },
    201,
  );
});

const updateHandler = async (c: Context<AppEnv>) => {
  const input = await parseJson(c, CategoryUpdateSchema);
  const id = c.req.param("id");
  if (!id)
    throw new ApiHttpError(
      404,
      "CATEGORY_NOT_FOUND",
      "The expense category was not found",
    );
  return c.json({
    data: await updateCategory(c.env.DB, id, input, getIdentity(c).email),
  });
};

categoryRoutes.patch("/:id", requireRole("admin"), updateHandler);
categoryRoutes.put("/:id", requireRole("admin"), updateHandler);
