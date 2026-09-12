ALTER TABLE plantation_inventory ADD COLUMN deleted_at TEXT;

ALTER TABLE crops ADD COLUMN normalized_name TEXT;
UPDATE crops SET normalized_name = lower(trim(name));
CREATE UNIQUE INDEX idx_crops_normalized_name ON crops(normalized_name);

ALTER TABLE farm_areas ADD COLUMN normalized_name TEXT;
UPDATE farm_areas SET normalized_name = lower(trim(name));
CREATE UNIQUE INDEX idx_farm_areas_normalized_name ON farm_areas(normalized_name);

CREATE INDEX idx_plantation_inventory_deleted_at ON plantation_inventory(deleted_at);
