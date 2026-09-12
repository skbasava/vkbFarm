import { ApiHttpError } from "../middleware/errors";
import { deletePlantationStatement, getCrop, getFarmArea, getPlantation, insertPlantationStatement, updatePlantationStatement, type Crop, type FarmArea, type Plantation, type PlantationWrite } from "../repositories/plantation-repository";
import { createId } from "../utils/ids";
import type { PlantationInput, PlantationUpdateInput } from "../validation/plantation";

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
}

function referenceError(kind: "crop" | "farm area", inactive: boolean): ApiHttpError {
  if (inactive) return new ApiHttpError(409, `${kind === "crop" ? "CROP" : "FARM_AREA"}_INACTIVE`, `The selected ${kind} is inactive`);
  return new ApiHttpError(404, "REFERENCE_NOT_FOUND", `The selected ${kind} was not found`);
}

async function validateReferences(db: D1Database, cropId: string, farmAreaId: string): Promise<void> {
  const [crop, area] = await Promise.all([getCrop(db, cropId), getFarmArea(db, farmAreaId)]);
  if (!crop) throw referenceError("crop", false);
  if (!crop.active) throw referenceError("crop", true);
  if (!area) throw referenceError("farm area", false);
  if (!area.active) throw referenceError("farm area", true);
}

function auditStatement(db: D1Database, entityType: "plantation" | "crop" | "farm_area", entityId: string, action: "CREATE" | "UPDATE" | "DELETE", actor: string, before: unknown, after: unknown): D1PreparedStatement {
  return db.prepare("INSERT INTO audit_log (id, entity_type, entity_id, action, actor, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(createId(), entityType, entityId, action, actor, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null);
}

function constraint(error: unknown, existsCode: string, label: string): never {
  if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) throw new ApiHttpError(409, existsCode, `A ${label} with this name already exists`);
  throw error;
}

export async function createCrop(db: D1Database, input: { name: string; localName?: string | null; cropType?: string | null; active?: boolean }, actor: string): Promise<Crop> {
  const id = createId();
  const now = new Date().toISOString();
  const crop: Crop = { id, name: input.name, localName: input.localName ?? null, cropType: input.cropType ?? null, active: input.active !== false, createdAt: now, updatedAt: now };
  try {
    await db.batch([
      db.prepare("INSERT INTO crops (id, name, normalized_name, local_name, crop_type, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, crop.name, normalizeName(crop.name), crop.localName, crop.cropType, crop.active ? 1 : 0, now, now),
      auditStatement(db, "crop", id, "CREATE", actor, null, crop),
    ]);
  } catch (error) { constraint(error, "CROP_EXISTS", "crop"); }
  const stored = await getCrop(db, id);
  if (!stored) throw new ApiHttpError(500, "STORAGE_ERROR", "The crop could not be read after writing");
  return stored;
}

export async function updateCrop(db: D1Database, id: string, input: { name?: string; localName?: string | null; cropType?: string | null; active?: boolean }, actor: string): Promise<Crop> {
  const current = await getCrop(db, id);
  if (!current) throw new ApiHttpError(404, "CROP_NOT_FOUND", "The crop was not found");
  const crop: Crop = { ...current, name: input.name ?? current.name, localName: input.localName === undefined ? current.localName : input.localName, cropType: input.cropType === undefined ? current.cropType : input.cropType, active: input.active ?? current.active, updatedAt: new Date().toISOString() };
  try {
    await db.batch([
      db.prepare("UPDATE crops SET name = ?, normalized_name = ?, local_name = ?, crop_type = ?, active = ?, updated_at = ? WHERE id = ?").bind(crop.name, normalizeName(crop.name), crop.localName, crop.cropType, crop.active ? 1 : 0, crop.updatedAt, id),
      auditStatement(db, "crop", id, "UPDATE", actor, current, crop),
    ]);
  } catch (error) { constraint(error, "CROP_EXISTS", "crop"); }
  return (await getCrop(db, id))!;
}

export async function createFarmArea(db: D1Database, input: { code: string; name: string; description?: string | null; active?: boolean }, actor: string): Promise<FarmArea> {
  const id = createId();
  const now = new Date().toISOString();
  const area: FarmArea = { id, code: input.code, name: input.name, description: input.description ?? null, active: input.active !== false, createdAt: now, updatedAt: now };
  try {
    await db.batch([
      db.prepare("INSERT INTO farm_areas (id, code, name, normalized_name, description, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, area.code, area.name, normalizeName(area.name), area.description, area.active ? 1 : 0, now, now),
      auditStatement(db, "farm_area", id, "CREATE", actor, null, area),
    ]);
  } catch (error) { constraint(error, "FARM_AREA_EXISTS", "farm area"); }
  const stored = await getFarmArea(db, id);
  if (!stored) throw new ApiHttpError(500, "STORAGE_ERROR", "The farm area could not be read after writing");
  return stored;
}

export async function updateFarmArea(db: D1Database, id: string, input: { code?: string; name?: string; description?: string | null; active?: boolean }, actor: string): Promise<FarmArea> {
  const current = await getFarmArea(db, id);
  if (!current) throw new ApiHttpError(404, "FARM_AREA_NOT_FOUND", "The farm area was not found");
  const area: FarmArea = { ...current, code: input.code ?? current.code, name: input.name ?? current.name, description: input.description === undefined ? current.description : input.description, active: input.active ?? current.active, updatedAt: new Date().toISOString() };
  try {
    await db.batch([
      db.prepare("UPDATE farm_areas SET code = ?, name = ?, normalized_name = ?, description = ?, active = ?, updated_at = ? WHERE id = ?").bind(area.code, area.name, normalizeName(area.name), area.description, area.active ? 1 : 0, area.updatedAt, id),
      auditStatement(db, "farm_area", id, "UPDATE", actor, current, area),
    ]);
  } catch (error) { constraint(error, "FARM_AREA_EXISTS", "farm area"); }
  return (await getFarmArea(db, id))!;
}

function writeFrom(input: PlantationInput, id: string, updatedAt: string): PlantationWrite {
  return { id, cropId: input.cropId, farmAreaId: input.farmAreaId, quantity: input.quantity, plantingDate: input.plantingDate, notes: input.notes ?? null, updatedAt };
}

function mergeWrite(current: Plantation, input: PlantationUpdateInput): PlantationWrite {
  return { id: current.id, cropId: input.cropId ?? current.cropId, farmAreaId: input.farmAreaId ?? current.farmAreaId, quantity: input.quantity ?? current.quantity, plantingDate: input.plantingDate ?? current.plantingDate, notes: input.notes === undefined ? current.notes : input.notes, updatedAt: new Date().toISOString() };
}

export async function createPlantation(db: D1Database, input: PlantationInput, actor: string): Promise<Plantation> {
  const write = writeFrom(input, createId(), new Date().toISOString());
  await validateReferences(db, write.cropId, write.farmAreaId);
  try { await db.batch([insertPlantationStatement(db, write), auditStatement(db, "plantation", write.id, "CREATE", actor, null, write)]); } catch (error) { constraint(error, "PLANTATION_EXISTS", "plantation cohort"); }
  const stored = await getPlantation(db, write.id);
  if (!stored) throw new ApiHttpError(500, "STORAGE_ERROR", "The plantation could not be read after writing");
  return stored;
}

export async function updatePlantation(db: D1Database, id: string, input: PlantationUpdateInput, actor: string): Promise<Plantation> {
  const current = await getPlantation(db, id);
  if (!current) throw new ApiHttpError(404, "PLANTATION_NOT_FOUND", "The plantation record was not found");
  const write = mergeWrite(current, input);
  await validateReferences(db, write.cropId, write.farmAreaId);
  try { await db.batch([updatePlantationStatement(db, write), auditStatement(db, "plantation", id, "UPDATE", actor, current, write)]); } catch (error) { constraint(error, "PLANTATION_EXISTS", "plantation cohort"); }
  return (await getPlantation(db, id))!;
}

export async function softDeletePlantation(db: D1Database, id: string, actor: string): Promise<{ id: string; deletedAt: string }> {
  const current = await getPlantation(db, id);
  if (!current) throw new ApiHttpError(404, "PLANTATION_NOT_FOUND", "The plantation record was not found");
  const deletedAt = new Date().toISOString();
  await db.batch([deletePlantationStatement(db, id, deletedAt), auditStatement(db, "plantation", id, "DELETE", actor, current, null)]);
  return { id, deletedAt };
}
