import { Hono, type Context } from "hono";
import type { z } from "zod";
import { ApiHttpError } from "../middleware/errors";
import { getIdentity } from "../middleware/identity";
import { requireRole } from "../middleware/roles";
import { getPlantation, getPlantationSummaryTotals, listCrops, listFarmAreas, listPlantations } from "../repositories/plantation-repository";
import { createCrop, createFarmArea, createPlantation, softDeletePlantation, updateCrop, updateFarmArea, updatePlantation } from "../services/plantation-service";
import type { AppEnv } from "../types";
import { CropInputSchema, CropUpdateSchema, FarmAreaInputSchema, FarmAreaUpdateSchema, PlantationInputSchema, PlantationUpdateSchema } from "../validation/plantation";

function validationError(message: string, issues?: Record<string, unknown>): ApiHttpError {
  return new ApiHttpError(422, "VALIDATION_ERROR", message, issues);
}

async function parseJson<T>(request: Request, schema: z.ZodType<T>, subject: string): Promise<T> {
  let input: unknown;
  try { input = await request.json(); } catch { throw validationError("Request body must be valid JSON"); }
  const result = schema.safeParse(input);
  if (!result.success) throw validationError(`The ${subject} input is invalid`, { issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
  return result.data;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) throw validationError(`${name} must be a positive integer`);
  return Number(value);
}

function paging(c: Context<AppEnv>): { page: number; pageSize: number } {
  return { page: positiveInteger(c.req.query("page"), 1, "page"), pageSize: Math.min(positiveInteger(c.req.query("pageSize"), 25, "pageSize"), 100) };
}

export const plantationRoutes = new Hono<AppEnv>();

plantationRoutes.get("/crops", async (c) => {
  const options = { ...paging(c), includeInactive: c.req.query("includeInactive") === "true" };
  const result = await listCrops(c.env.DB, options);
  return c.json({ data: result.data, meta: { ...options, total: result.total } });
});

plantationRoutes.post("/crops", requireRole("admin"), async (c) => {
  const input = await parseJson(c.req.raw, CropInputSchema, "crop");
  return c.json({ data: await createCrop(c.env.DB, input, getIdentity(c).email) }, 201);
});

const updateCropHandler = async (c: Context<AppEnv>) => {
  const id = c.req.param("id");
  if (!id) throw new ApiHttpError(404, "CROP_NOT_FOUND", "The crop was not found");
  const input = await parseJson(c.req.raw, CropUpdateSchema, "crop");
  return c.json({ data: await updateCrop(c.env.DB, id, input, getIdentity(c).email) });
};
plantationRoutes.patch("/crops/:id", requireRole("admin"), updateCropHandler);
plantationRoutes.put("/crops/:id", requireRole("admin"), updateCropHandler);

plantationRoutes.get("/farm-areas", async (c) => {
  const options = { ...paging(c), includeInactive: c.req.query("includeInactive") === "true" };
  const result = await listFarmAreas(c.env.DB, options);
  return c.json({ data: result.data, meta: { ...options, total: result.total } });
});

plantationRoutes.post("/farm-areas", requireRole("admin"), async (c) => {
  const input = await parseJson(c.req.raw, FarmAreaInputSchema, "farm area");
  return c.json({ data: await createFarmArea(c.env.DB, input, getIdentity(c).email) }, 201);
});

const updateFarmAreaHandler = async (c: Context<AppEnv>) => {
  const id = c.req.param("id");
  if (!id) throw new ApiHttpError(404, "FARM_AREA_NOT_FOUND", "The farm area was not found");
  const input = await parseJson(c.req.raw, FarmAreaUpdateSchema, "farm area");
  return c.json({ data: await updateFarmArea(c.env.DB, id, input, getIdentity(c).email) });
};
plantationRoutes.patch("/farm-areas/:id", requireRole("admin"), updateFarmAreaHandler);
plantationRoutes.put("/farm-areas/:id", requireRole("admin"), updateFarmAreaHandler);

plantationRoutes.get("/summary", async (c) => {
  const [areas, crops, inventory] = await Promise.all([
    listFarmAreas(c.env.DB, { page: 1, pageSize: 100, includeInactive: false }),
    listCrops(c.env.DB, { page: 1, pageSize: 100, includeInactive: false }),
    getPlantationSummaryTotals(c.env.DB),
  ]);
  const quantities = new Map<string, Map<string, number>>();
  for (const record of inventory.cells) {
    const row = quantities.get(record.cropId) ?? new Map<string, number>();
    row.set(record.farmAreaId, record.quantity);
    quantities.set(record.cropId, row);
  }
  const areaTotals = Object.fromEntries(areas.data.map((area) => [area.id, 0]));
  const rows = crops.data.map((crop) => {
    const cropQuantities = quantities.get(crop.id) ?? new Map<string, number>();
    const cells = Object.fromEntries(areas.data.map((area) => {
      const quantity = cropQuantities.get(area.id) ?? 0;
      areaTotals[area.id] = (areaTotals[area.id] ?? 0) + quantity;
      return [area.id, quantity];
    }));
    return { cropId: crop.id, cropName: crop.name, quantities: cells, totalQuantity: [...cropQuantities.values()].reduce((total, quantity) => total + quantity, 0) };
  }).filter((row) => row.totalQuantity > 0);
  return c.json({ data: { areas: areas.data, rows, areaTotals, totalQuantity: inventory.totalQuantity } });
});

plantationRoutes.get("/", async (c) => {
  const filters = { ...paging(c), ...(c.req.query("cropId") ? { cropId: c.req.query("cropId")! } : {}), ...(c.req.query("farmAreaId") ? { farmAreaId: c.req.query("farmAreaId")! } : {}) };
  const result = await listPlantations(c.env.DB, filters);
  return c.json({ data: result.data, meta: { page: filters.page, pageSize: filters.pageSize, total: result.total } });
});

plantationRoutes.post("/", requireRole("editor"), async (c) => {
  const input = await parseJson(c.req.raw, PlantationInputSchema, "plantation");
  return c.json({ data: await createPlantation(c.env.DB, input, getIdentity(c).email) }, 201);
});

plantationRoutes.get("/:id", async (c) => {
  const plantation = await getPlantation(c.env.DB, c.req.param("id"));
  if (!plantation) throw new ApiHttpError(404, "PLANTATION_NOT_FOUND", "The plantation record was not found");
  return c.json({ data: plantation });
});

const updatePlantationHandler = async (c: Context<AppEnv>) => {
  const id = c.req.param("id");
  if (!id) throw new ApiHttpError(404, "PLANTATION_NOT_FOUND", "The plantation record was not found");
  const input = await parseJson(c.req.raw, PlantationUpdateSchema, "plantation");
  return c.json({ data: await updatePlantation(c.env.DB, id, input, getIdentity(c).email) });
};
plantationRoutes.patch("/:id", requireRole("editor"), updatePlantationHandler);
plantationRoutes.put("/:id", requireRole("editor"), updatePlantationHandler);

plantationRoutes.delete("/:id", requireRole("editor"), async (c) => c.json({ data: await softDeletePlantation(c.env.DB, c.req.param("id"), getIdentity(c).email) }));
