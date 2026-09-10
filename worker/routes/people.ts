import { Hono, type Context } from "hono";
import { z } from "zod";
import { ApiHttpError } from "../middleware/errors";
import { requireRole } from "../middleware/roles";
import {
  createPerson,
  listPeople,
  updatePerson,
} from "../repositories/people-repository";
import type { AppEnv } from "../types";

const PersonInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email().trim().toLowerCase().nullable().optional(),
    farmRole: z.string().trim().min(1).max(80).optional(),
    appRole: z.enum(["admin", "editor", "viewer"]).optional(),
    participatesInSharedExpenses: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict();
const PersonUpdateSchema = PersonInputSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  "At least one person field must be supplied",
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
      "The person input is invalid",
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

export const peopleRoutes = new Hono<AppEnv>();

peopleRoutes.get("/", async (c) => {
  const page = positiveInteger(c.req.query("page") ?? null, 1, "page");
  const pageSize = Math.min(
    positiveInteger(c.req.query("pageSize") ?? null, 25, "pageSize"),
    100,
  );
  const result = await listPeople(c.env.DB, {
    page,
    pageSize,
    includeInactive: c.req.query("includeInactive") === "true",
    participants: c.req.query("participants") === "true",
  });
  return c.json({
    data: result.data,
    meta: { page, pageSize, total: result.total },
  });
});

peopleRoutes.post("/", requireRole("admin"), async (c) => {
  const input = await parseJson(c, PersonInputSchema);
  return c.json({ data: await createPerson(c.env.DB, input) }, 201);
});

const updateHandler = async (c: Context<AppEnv>) => {
  const input = await parseJson(c, PersonUpdateSchema);
  const id = c.req.param("id");
  if (!id)
    throw new ApiHttpError(404, "PERSON_NOT_FOUND", "The person was not found");
  return c.json({ data: await updatePerson(c.env.DB, id, input) });
};

peopleRoutes.patch("/:id", requireRole("admin"), updateHandler);
peopleRoutes.put("/:id", requireRole("admin"), updateHandler);
