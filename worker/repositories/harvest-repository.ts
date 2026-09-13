import { exactMoneyToNumber, storedMoneyToNumber } from "../utils/stored-integers";

export type Harvest = {
  id: string;
  cropId: string;
  cropName: string;
  cropActive: boolean;
  harvestDate: string | null;
  quantity: string | null;
  grossWeightKg: string | null;
  netWeightKg: string | null;
  averageWeightKg: string | null;
  salePricePaisePerKg: number | null;
  calculatedRevenuePaise: number | null;
  actualRevenuePaise: number | null;
  revenueOverrideReason: string | null;
  buyer: string | null;
  notes: string | null;
  source: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  importFingerprint: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HarvestWrite = {
  id: string;
  cropId: string;
  harvestDate: string | null;
  quantity: number | null;
  grossWeightKg: number | null;
  netWeightKg: number | null;
  averageWeightKg: number | null;
  salePricePaisePerKg: number;
  calculatedRevenuePaise: number;
  actualRevenuePaise: number;
  revenueOverrideReason: string | null;
  buyer: string | null;
  notes: string | null;
  source: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  importFingerprint: string | null;
  updatedAt: string;
};

export type HarvestFilters = {
  page: number;
  pageSize: number;
  cropId?: string;
  dateFrom?: string;
  dateTo?: string;
  month?: string;
  year?: string;
};

type HarvestRow = {
  id: string;
  crop_id: string;
  crop_name: string;
  crop_active: number;
  harvest_date: string | null;
  quantity: string | null;
  gross_weight_kg: string | null;
  net_weight_kg: string | null;
  average_weight_kg: string | null;
  sale_price_paise_per_kg: number | null;
  calculated_revenue_paise: number | null;
  actual_revenue_paise: number | null;
  revenue_override_reason: string | null;
  buyer: string | null;
  notes: string | null;
  source: string | null;
  source_sheet: string | null;
  source_row: number | null;
  import_fingerprint: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT = `SELECT h.id, h.crop_id, c.name AS crop_name, c.active AS crop_active,
  h.harvest_date,
  CASE WHEN h.quantity IS NULL THEN NULL ELSE printf('%.3f', h.quantity) END AS quantity,
  CASE WHEN h.gross_weight_kg IS NULL THEN NULL ELSE printf('%.3f', h.gross_weight_kg) END AS gross_weight_kg,
  CASE WHEN h.net_weight_kg IS NULL THEN NULL ELSE printf('%.3f', h.net_weight_kg) END AS net_weight_kg,
  CASE WHEN h.average_weight_kg IS NULL THEN NULL ELSE printf('%.3f', h.average_weight_kg) END AS average_weight_kg,
  h.sale_price_paise_per_kg, h.calculated_revenue_paise, h.actual_revenue_paise,
  h.revenue_override_reason, h.buyer, h.notes, h.source, h.source_sheet, h.source_row,
  h.import_fingerprint, h.created_at, h.updated_at
  FROM harvests h JOIN crops c ON c.id = h.crop_id`;

function decimalString(value: string | null): string | null {
  if (value === null) return null;
  return value.replace(/(?:\.0+|(\.\d*?)0+)$/, "$1");
}

function scaledThousandths(value: string): bigint {
  const match = /^(0|[1-9]\d*)\.(\d{3})$/.exec(value);
  if (!match) throw new TypeError("Stored weight is not a canonical three-decimal value");
  return BigInt(match[1]) * 1_000n + BigInt(match[2]);
}

function weightedAverage(rows: Array<{ sale_price_paise_per_kg: string | number; net_weight_kg: string }>): number {
  let weightedPaise = 0n;
  let weight = 0n;
  for (const row of rows) {
    const price = storedMoneyToNumber(row.sale_price_paise_per_kg);
    const scaledWeight = scaledThousandths(row.net_weight_kg);
    weightedPaise += BigInt(price) * scaledWeight;
    weight += scaledWeight;
  }
  if (weight === 0n) return 0;
  return exactMoneyToNumber((weightedPaise + weight / 2n) / weight);
}

function map(row: HarvestRow): Harvest {
  return {
    id: row.id,
    cropId: row.crop_id,
    cropName: row.crop_name,
    cropActive: row.crop_active === 1,
    harvestDate: row.harvest_date,
    quantity: decimalString(row.quantity),
    grossWeightKg: decimalString(row.gross_weight_kg),
    netWeightKg: decimalString(row.net_weight_kg),
    averageWeightKg: decimalString(row.average_weight_kg),
    salePricePaisePerKg: row.sale_price_paise_per_kg,
    calculatedRevenuePaise: row.calculated_revenue_paise,
    actualRevenuePaise: row.actual_revenue_paise,
    revenueOverrideReason: row.revenue_override_reason,
    buyer: row.buyer,
    notes: row.notes,
    source: row.source,
    sourceSheet: row.source_sheet,
    sourceRow: row.source_row,
    importFingerprint: row.import_fingerprint,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function where(filters: Omit<HarvestFilters, "page" | "pageSize">) {
  const conditions: string[] = [];
  const params: string[] = [];
  if (filters.cropId) { conditions.push("h.crop_id = ?"); params.push(filters.cropId); }
  if (filters.dateFrom) { conditions.push("h.harvest_date >= ?"); params.push(filters.dateFrom); }
  if (filters.dateTo) { conditions.push("h.harvest_date <= ?"); params.push(filters.dateTo); }
  if (filters.month) { conditions.push("substr(h.harvest_date, 1, 7) = ?"); params.push(filters.month); }
  if (filters.year) { conditions.push("substr(h.harvest_date, 1, 4) = ?"); params.push(filters.year); }
  return { sql: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

export async function listHarvests(db: D1Database, filters: HarvestFilters): Promise<{ data: Harvest[]; total: number }> {
  const filter = where(filters);
  const offset = (filters.page - 1) * filters.pageSize;
  const [count, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total FROM harvests h ${filter.sql}`).bind(...filter.params).first<{ total: number }>(),
    db.prepare(`${SELECT} ${filter.sql} ORDER BY h.harvest_date IS NULL ASC, h.harvest_date DESC, h.created_at DESC, h.id DESC LIMIT ? OFFSET ?`).bind(...filter.params, filters.pageSize, offset).all<HarvestRow>(),
  ]);
  return { data: rows.results.map(map), total: count?.total ?? 0 };
}

export async function getHarvest(db: D1Database, id: string): Promise<Harvest | null> {
  const row = await db.prepare(`${SELECT} WHERE h.id = ? LIMIT 1`).bind(id).first<HarvestRow>();
  return row ? map(row) : null;
}

export async function harvestSummary(db: D1Database, filters: Omit<HarvestFilters, "page" | "pageSize">) {
  const filter = where(filters);
  const datedWhere = filter.sql ? `${filter.sql} AND h.harvest_date IS NOT NULL` : "WHERE h.harvest_date IS NOT NULL";
  const weightedWhere = filter.sql ? `${filter.sql} AND h.net_weight_kg IS NOT NULL AND h.sale_price_paise_per_kg IS NOT NULL` : "WHERE h.net_weight_kg IS NOT NULL AND h.sale_price_paise_per_kg IS NOT NULL";
  const [summary, charts, weights] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS record_count,
      printf('%.3f', COALESCE(SUM(quantity), 0)) AS total_quantity,
      printf('%.3f', COALESCE(SUM(net_weight_kg), 0)) AS total_net_weight_kg,
      CAST(COALESCE(SUM(COALESCE(actual_revenue_paise, calculated_revenue_paise)), 0) AS TEXT) AS revenue_paise,
      COALESCE(SUM(CASE WHEN harvest_date IS NULL THEN 1 ELSE 0 END), 0) AS undated_count,
      CAST(COALESCE(SUM(CASE WHEN harvest_date IS NULL THEN COALESCE(actual_revenue_paise, calculated_revenue_paise) ELSE 0 END), 0) AS TEXT) AS undated_revenue_paise
      FROM harvests h ${filter.sql}`).bind(...filter.params).first<{
        record_count: number; total_quantity: string; total_net_weight_kg: string; revenue_paise: string;
        undated_count: number; undated_revenue_paise: string;
      }>(),
    db.prepare(`SELECT substr(h.harvest_date, 1, 7) AS month, c.name AS crop_name,
      CAST(COALESCE(SUM(COALESCE(actual_revenue_paise, calculated_revenue_paise)), 0) AS TEXT) AS revenue_paise,
      printf('%.3f', COALESCE(SUM(quantity), 0)) AS quantity,
      printf('%.3f', COALESCE(SUM(net_weight_kg), 0)) AS net_weight_kg
      FROM harvests h JOIN crops c ON c.id = h.crop_id ${datedWhere}
      GROUP BY substr(h.harvest_date, 1, 7), c.id, c.name
      ORDER BY month ASC, c.name COLLATE NOCASE ASC, c.id ASC`).bind(...filter.params).all<{
        month: string; crop_name: string; revenue_paise: string; quantity: string; net_weight_kg: string;
      }>(),
    db.prepare(`SELECT CAST(h.sale_price_paise_per_kg AS TEXT) AS sale_price_paise_per_kg,
      printf('%.3f', h.net_weight_kg) AS net_weight_kg
      FROM harvests h ${weightedWhere}`).bind(...filter.params).all<{
        sale_price_paise_per_kg: string; net_weight_kg: string;
      }>(),
  ]);
  const row = summary ?? { record_count: 0, total_quantity: "0.000", total_net_weight_kg: "0.000", revenue_paise: "0", undated_count: 0, undated_revenue_paise: "0" };
  return {
    recordCount: row.record_count,
    totalQuantity: decimalString(row.total_quantity) ?? "0",
    totalNetWeightKg: decimalString(row.total_net_weight_kg) ?? "0",
    revenuePaise: storedMoneyToNumber(row.revenue_paise),
    averagePricePaisePerKg: weightedAverage(weights.results),
    undatedCount: row.undated_count,
    undatedRevenuePaise: storedMoneyToNumber(row.undated_revenue_paise),
    monthlyCropRevenue: charts.results.map((chart) => ({
      month: chart.month,
      cropName: chart.crop_name,
      revenuePaise: storedMoneyToNumber(chart.revenue_paise),
      quantity: decimalString(chart.quantity) ?? "0",
      netWeightKg: decimalString(chart.net_weight_kg) ?? "0",
    })),
  };
}

export function insertHarvestStatement(db: D1Database, value: HarvestWrite): D1PreparedStatement {
  return db.prepare(`INSERT INTO harvests (
    id, crop_id, harvest_date, quantity, gross_weight_kg, net_weight_kg, average_weight_kg,
    sale_price_paise_per_kg, calculated_revenue_paise, actual_revenue_paise,
    revenue_override_reason, buyer, notes, source, source_sheet, source_row, import_fingerprint, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    value.id, value.cropId, value.harvestDate, value.quantity, value.grossWeightKg, value.netWeightKg,
    value.averageWeightKg, value.salePricePaisePerKg, value.calculatedRevenuePaise, value.actualRevenuePaise,
    value.revenueOverrideReason, value.buyer, value.notes, value.source, value.sourceSheet, value.sourceRow,
    value.importFingerprint, value.updatedAt,
  );
}

export function updateHarvestStatement(db: D1Database, value: HarvestWrite): D1PreparedStatement {
  return db.prepare(`UPDATE harvests SET crop_id = ?, harvest_date = ?, quantity = ?, gross_weight_kg = ?,
    net_weight_kg = ?, average_weight_kg = ?, sale_price_paise_per_kg = ?, calculated_revenue_paise = ?,
    actual_revenue_paise = ?, revenue_override_reason = ?, buyer = ?, notes = ?, updated_at = ? WHERE id = ?`).bind(
    value.cropId, value.harvestDate, value.quantity, value.grossWeightKg, value.netWeightKg,
    value.averageWeightKg, value.salePricePaisePerKg, value.calculatedRevenuePaise,
    value.actualRevenuePaise, value.revenueOverrideReason, value.buyer, value.notes, value.updatedAt, value.id,
  );
}

export function deleteHarvestStatement(db: D1Database, id: string): D1PreparedStatement {
  return db.prepare("DELETE FROM harvests WHERE id = ?").bind(id);
}
