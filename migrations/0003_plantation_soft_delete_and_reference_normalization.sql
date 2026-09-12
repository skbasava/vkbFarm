-- These expression indexes are preflight guards. A normalized collision aborts
-- the migration transaction before any table data or columns are changed.
CREATE UNIQUE INDEX migration_0003_crop_names_preflight ON crops(lower(trim(name)));
CREATE UNIQUE INDEX migration_0003_farm_area_names_preflight ON farm_areas(lower(trim(name)));

ALTER TABLE plantation_inventory ADD COLUMN deleted_at TEXT;

ALTER TABLE crops ADD COLUMN normalized_name TEXT;
UPDATE crops SET normalized_name = lower(trim(name));
CREATE UNIQUE INDEX idx_crops_normalized_name ON crops(normalized_name);

ALTER TABLE farm_areas ADD COLUMN normalized_name TEXT;
UPDATE farm_areas SET normalized_name = lower(trim(name));
CREATE UNIQUE INDEX idx_farm_areas_normalized_name ON farm_areas(normalized_name);

CREATE INDEX idx_plantation_inventory_deleted_at ON plantation_inventory(deleted_at);

DROP INDEX migration_0003_crop_names_preflight;
DROP INDEX migration_0003_farm_area_names_preflight;
