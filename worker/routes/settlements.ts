import { Hono } from "hono";
import type { z } from "zod";
import { ApiHttpError } from "../middleware/errors";
import { getIdentity } from "../middleware/identity";
import { requireRole } from "../middleware/roles";
import {
  listRecordedSettlements,
  listSettlementContributions,
  listSettlements,
} from "../repositories/settlement-repository";
import { calculateSettlement, createSettlement } from "../services/settlement-service";
import type { AppEnv } from "../types";
import { SettlementInputSchema } from "../validation/settlements";

async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new ApiHttpError(422, "VALIDATION_ERROR", "Request body must be valid JSON");
  }
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiHttpError(422, "VALIDATION_ERROR", "The settlement input is invalid", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

async function settlementSummary(db: D1Database) {
  const [contributions, settlements] = await Promise.all([
    listSettlementContributions(db),
    listRecordedSettlements(db),
  ]);
  return calculateSettlement({ contributions, settlements });
}

export const settlementRoutes = new Hono<AppEnv>();

settlementRoutes.get("/summary", async (c) => {
  return c.json({ data: await settlementSummary(c.env.DB) });
});

settlementRoutes.get("/", async (c) => {
  return c.json({ data: await listSettlements(c.env.DB) });
});

settlementRoutes.post("/", requireRole("editor"), async (c) => {
  const input = await parseJson(c.req.raw, SettlementInputSchema);
  const settlement = await createSettlement(c.env.DB, input, getIdentity(c).email);
  return c.json({ data: settlement }, 201);
});
