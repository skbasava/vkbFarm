-- The original table treated crop, area, and planting date as a singleton.
-- Rebuild it without that constraint so every entered or imported cohort is retained.
ALTER TABLE plantation_inventory RENAME TO plantation_inventory_before_cohorts;

CREATE TABLE plantation_inventory (
  id TEXT PRIMARY KEY,
  crop_id TEXT NOT NULL REFERENCES crops(id),
  farm_area_id TEXT NOT NULL REFERENCES farm_areas(id),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  planting_date TEXT,
  notes TEXT,
  source TEXT,
  source_sheet TEXT,
  source_row INTEGER,
  import_fingerprint TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

INSERT INTO plantation_inventory (
  id, crop_id, farm_area_id, quantity, planting_date, notes, source,
  source_sheet, source_row, import_fingerprint, created_at, updated_at, deleted_at
)
SELECT id, crop_id, farm_area_id, quantity, planting_date, notes, source,
  source_sheet, source_row, import_fingerprint, created_at, updated_at, deleted_at
FROM plantation_inventory_before_cohorts;

DROP TABLE plantation_inventory_before_cohorts;

CREATE INDEX idx_plantation_inventory_crop_id ON plantation_inventory(crop_id);
CREATE INDEX idx_plantation_inventory_farm_area_id ON plantation_inventory(farm_area_id);
CREATE UNIQUE INDEX idx_plantation_inventory_import_fingerprint ON plantation_inventory(import_fingerprint)
  WHERE import_fingerprint IS NOT NULL;
CREATE INDEX idx_plantation_inventory_deleted_at ON plantation_inventory(deleted_at);
