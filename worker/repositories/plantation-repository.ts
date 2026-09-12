export type Crop = {
  id: string;
  name: string;
  localName: string | null;
  cropType: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FarmArea = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Plantation = {
  id: string;
  cropId: string;
  cropName: string;
  farmAreaId: string;
  farmAreaCode: string;
  farmAreaName: string;
  quantity: number;
  plantingDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlantationWrite = Pick<Plantation, "id" | "cropId" | "farmAreaId" | "quantity" | "plantingDate" | "notes" | "updatedAt">;

type CropRow = { id: string; name: string; local_name: string | null; crop_type: string | null; active: number; created_at: string; updated_at: string };
type FarmAreaRow = { id: string; code: string; name: string; description: string | null; active: number; created_at: string; updated_at: string };
type PlantationRow = { id: string; crop_id: string; crop_name: string; farm_area_id: string; farm_area_code: string; farm_area_name: string; quantity: number; planting_date: string | null; notes: string | null; created_at: string; updated_at: string };

const PLANTATION_SELECT = `
  SELECT p.id, p.crop_id, c.name AS crop_name, p.farm_area_id,
    a.code AS farm_area_code, a.name AS farm_area_name, p.quantity,
    p.planting_date, p.notes, p.created_at, p.updated_at
  FROM plantation_inventory p
  JOIN crops c ON c.id = p.crop_id
  JOIN farm_areas a ON a.id = p.farm_area_id`;

function mapCrop(row: CropRow): Crop {
  return { id: row.id, name: row.name, localName: row.local_name, cropType: row.crop_type, active: row.active === 1, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapFarmArea(row: FarmAreaRow): FarmArea {
  return { id: row.id, code: row.code, name: row.name, description: row.description, active: row.active === 1, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapPlantation(row: PlantationRow): Plantation {
  return { id: row.id, cropId: row.crop_id, cropName: row.crop_name, farmAreaId: row.farm_area_id, farmAreaCode: row.farm_area_code, farmAreaName: row.farm_area_name, quantity: row.quantity, plantingDate: row.planting_date, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function listCrops(db: D1Database, options: { page: number; pageSize: number; includeInactive: boolean }): Promise<{ data: Crop[]; total: number }> {
  const where = options.includeInactive ? "" : "WHERE active = 1";
  const [count, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total FROM crops ${where}`).first<{ total: number }>(),
    db.prepare(`SELECT id, name, local_name, crop_type, active, created_at, updated_at FROM crops ${where} ORDER BY name COLLATE NOCASE ASC, id ASC LIMIT ? OFFSET ?`).bind(options.pageSize, (options.page - 1) * options.pageSize).all<CropRow>(),
  ]);
  return { data: rows.results.map(mapCrop), total: count?.total ?? 0 };
}

export async function getCrop(db: D1Database, id: string): Promise<Crop | null> {
  const row = await db.prepare("SELECT id, name, local_name, crop_type, active, created_at, updated_at FROM crops WHERE id = ? LIMIT 1").bind(id).first<CropRow>();
  return row ? mapCrop(row) : null;
}

export async function listFarmAreas(db: D1Database, options: { page: number; pageSize: number; includeInactive: boolean }): Promise<{ data: FarmArea[]; total: number }> {
  const where = options.includeInactive ? "" : "WHERE active = 1";
  const [count, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total FROM farm_areas ${where}`).first<{ total: number }>(),
    db.prepare(`SELECT id, code, name, description, active, created_at, updated_at FROM farm_areas ${where} ORDER BY code COLLATE NOCASE ASC, id ASC LIMIT ? OFFSET ?`).bind(options.pageSize, (options.page - 1) * options.pageSize).all<FarmAreaRow>(),
  ]);
  return { data: rows.results.map(mapFarmArea), total: count?.total ?? 0 };
}

export async function getFarmArea(db: D1Database, id: string): Promise<FarmArea | null> {
  const row = await db.prepare("SELECT id, code, name, description, active, created_at, updated_at FROM farm_areas WHERE id = ? LIMIT 1").bind(id).first<FarmAreaRow>();
  return row ? mapFarmArea(row) : null;
}

export async function listPlantations(db: D1Database, filters: { page: number; pageSize: number; cropId?: string; farmAreaId?: string }): Promise<{ data: Plantation[]; total: number }> {
  const conditions = ["p.deleted_at IS NULL"];
  const params: string[] = [];
  if (filters.cropId) { conditions.push("p.crop_id = ?"); params.push(filters.cropId); }
  if (filters.farmAreaId) { conditions.push("p.farm_area_id = ?"); params.push(filters.farmAreaId); }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const [count, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total FROM plantation_inventory p ${where}`).bind(...params).first<{ total: number }>(),
    db.prepare(`${PLANTATION_SELECT} ${where} ORDER BY p.planting_date DESC, p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`).bind(...params, filters.pageSize, (filters.page - 1) * filters.pageSize).all<PlantationRow>(),
  ]);
  return { data: rows.results.map(mapPlantation), total: count?.total ?? 0 };
}

export async function getPlantation(db: D1Database, id: string): Promise<Plantation | null> {
  const row = await db.prepare(`${PLANTATION_SELECT} WHERE p.id = ? AND p.deleted_at IS NULL LIMIT 1`).bind(id).first<PlantationRow>();
  return row ? mapPlantation(row) : null;
}

export async function getPlantationSummaryTotals(db: D1Database): Promise<{
  cells: Array<{ cropId: string; cropName: string; farmAreaId: string; quantity: number }>;
  totalQuantity: number;
}> {
  const [cells, total] = await Promise.all([
    db.prepare(`SELECT p.crop_id, c.name AS crop_name, p.farm_area_id, SUM(p.quantity) AS quantity
      FROM plantation_inventory p JOIN crops c ON c.id = p.crop_id
      WHERE p.deleted_at IS NULL GROUP BY p.crop_id, c.name, p.farm_area_id`).all<{ crop_id: string; crop_name: string; farm_area_id: string; quantity: number }>(),
    db.prepare("SELECT COALESCE(SUM(quantity), 0) AS total_quantity FROM plantation_inventory WHERE deleted_at IS NULL").first<{ total_quantity: number }>(),
  ]);
  return { cells: cells.results.map((cell) => ({ cropId: cell.crop_id, cropName: cell.crop_name, farmAreaId: cell.farm_area_id, quantity: cell.quantity })), totalQuantity: total?.total_quantity ?? 0 };
}

export function insertPlantationStatement(db: D1Database, plantation: PlantationWrite): D1PreparedStatement {
  return db.prepare("INSERT INTO plantation_inventory (id, crop_id, farm_area_id, quantity, planting_date, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(plantation.id, plantation.cropId, plantation.farmAreaId, plantation.quantity, plantation.plantingDate, plantation.notes, plantation.updatedAt);
}

export function updatePlantationStatement(db: D1Database, plantation: PlantationWrite): D1PreparedStatement {
  return db.prepare("UPDATE plantation_inventory SET crop_id = ?, farm_area_id = ?, quantity = ?, planting_date = ?, notes = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL").bind(plantation.cropId, plantation.farmAreaId, plantation.quantity, plantation.plantingDate, plantation.notes, plantation.updatedAt, plantation.id);
}

export function deletePlantationStatement(db: D1Database, id: string, deletedAt: string): D1PreparedStatement {
  return db.prepare("UPDATE plantation_inventory SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL").bind(deletedAt, deletedAt, id);
}
