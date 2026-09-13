import { Hono, type Context } from "hono";
import type { z } from "zod";
import { ApiHttpError } from "../middleware/errors";
import { getIdentity } from "../middleware/identity";
import { requireRole } from "../middleware/roles";
import { getHarvest, harvestSummary, listHarvests } from "../repositories/harvest-repository";
import { createHarvest, deleteHarvest, updateHarvest } from "../services/harvest-service";
import type { AppEnv } from "../types";
import { isIsoLocalDate } from "../utils/dates";
import { HarvestInputSchema, HarvestUpdateSchema } from "../validation/harvests";

function invalid(message: string, details?: Record<string, unknown>): ApiHttpError { return new ApiHttpError(422, "VALIDATION_ERROR", message, details); }
async function json<T>(request: Request, schema: z.ZodType<T>): Promise<T> { let body: unknown; try { body = await request.json(); } catch { throw invalid("Request body must be valid JSON"); } const parsed = schema.safeParse(body); if (!parsed.success) throw invalid("The harvest input is invalid", { issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }); return parsed.data; }
function positive(value: string | undefined, fallback: number, label: string): number { if (value === undefined) return fallback; if (!/^\d+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) throw invalid(`${label} must be a positive integer`); return Number(value); }
function pageSize(value: string | undefined): number { const parsed = positive(value, 25, "pageSize"); if (parsed > 100) throw invalid("pageSize must not exceed 100"); return parsed; }
function filters(c: Context<AppEnv>) {
  const dateFrom = c.req.query("dateFrom"); const dateTo = c.req.query("dateTo"); const month = c.req.query("month"); const year = c.req.query("year");
  if (dateFrom && !isIsoLocalDate(dateFrom)) throw invalid("dateFrom must be a valid ISO local date");
  if (dateTo && !isIsoLocalDate(dateTo)) throw invalid("dateTo must be a valid ISO local date");
  if (dateFrom && dateTo && dateFrom > dateTo) throw invalid("dateFrom must not be after dateTo");
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw invalid("month must use YYYY-MM");
  if (year && !/^\d{4}$/.test(year)) throw invalid("year must use YYYY");
  return { cropId: c.req.query("cropId") || undefined, dateFrom, dateTo, month, year };
}
export const harvestRoutes = new Hono<AppEnv>();
harvestRoutes.get("/summary", async (c) => c.json({ data: await harvestSummary(c.env.DB, filters(c)) }));
harvestRoutes.get("/", async (c) => { const page = positive(c.req.query("page"), 1, "page"); const boundedPageSize = pageSize(c.req.query("pageSize")); const result = await listHarvests(c.env.DB, { ...filters(c), page, pageSize: boundedPageSize }); return c.json({ data: result.data, meta: { page, pageSize: boundedPageSize, total: result.total } }); });
harvestRoutes.get("/:id", async (c) => { const record = await getHarvest(c.env.DB, c.req.param("id")); if (!record) throw new ApiHttpError(404, "HARVEST_NOT_FOUND", "The harvest record was not found"); return c.json({ data: record }); });
harvestRoutes.post("/", requireRole("editor"), async (c) => c.json({ data: await createHarvest(c.env.DB, await json(c.req.raw, HarvestInputSchema), getIdentity(c).email) }, 201));
harvestRoutes.patch("/:id", requireRole("editor"), async (c) => c.json({ data: await updateHarvest(c.env.DB, c.req.param("id"), await json(c.req.raw, HarvestUpdateSchema), getIdentity(c).email) }));
harvestRoutes.delete("/:id", requireRole("editor"), async (c) => c.json({ data: await deleteHarvest(c.env.DB, c.req.param("id"), getIdentity(c).email) }));
