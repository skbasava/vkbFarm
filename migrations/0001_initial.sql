PRAGMA foreign_keys = ON;

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  farm_role TEXT NOT NULL DEFAULT 'owner',
  app_role TEXT NOT NULL DEFAULT 'viewer' CHECK (app_role IN ('admin','editor','viewer')),
  participates_in_shared_expenses INTEGER NOT NULL DEFAULT 1 CHECK (participates_in_shared_expenses IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  normalized_name TEXT NOT NULL UNIQUE,
  default_expense_class TEXT CHECK (default_expense_class IN ('CAPEX','OPEX')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE crops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  local_name TEXT,
  crop_type TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE farm_areas (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  expense_date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  paid_by_person_id TEXT NOT NULL REFERENCES people(id),
  category_id TEXT REFERENCES expense_categories(id),
  expense_class TEXT CHECK (expense_class IN ('CAPEX','OPEX')),
  paid_to TEXT,
  notes TEXT,
  crop_id TEXT REFERENCES crops(id),
  is_shared INTEGER NOT NULL DEFAULT 1 CHECK (is_shared IN (0,1)),
  source TEXT,
  source_sheet TEXT,
  source_row INTEGER,
  import_fingerprint TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE settlements (
  id TEXT PRIMARY KEY,
  from_person_id TEXT NOT NULL REFERENCES people(id),
  to_person_id TEXT NOT NULL REFERENCES people(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  settlement_date TEXT NOT NULL,
  remarks TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (from_person_id <> to_person_id)
);

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
  UNIQUE (crop_id, farm_area_id, planting_date)
);

CREATE TABLE harvests (
  id TEXT PRIMARY KEY,
  crop_id TEXT NOT NULL REFERENCES crops(id),
  harvest_date TEXT,
  quantity REAL CHECK (quantity >= 0),
  gross_weight_kg REAL CHECK (gross_weight_kg >= 0),
  net_weight_kg REAL CHECK (net_weight_kg >= 0),
  average_weight_kg REAL CHECK (average_weight_kg >= 0),
  sale_price_paise_per_kg INTEGER CHECK (sale_price_paise_per_kg >= 0),
  calculated_revenue_paise INTEGER CHECK (calculated_revenue_paise >= 0),
  actual_revenue_paise INTEGER CHECK (actual_revenue_paise >= 0),
  revenue_override_reason TEXT,
  buyer TEXT,
  notes TEXT,
  source TEXT,
  source_sheet TEXT,
  source_row INTEGER,
  import_fingerprint TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (harvest_date IS NOT NULL OR (source IS NOT NULL AND source = 'EXCEL')),
  CHECK (actual_revenue_paise = calculated_revenue_paise OR length(trim(revenue_override_reason)) > 0)
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  expense_id TEXT REFERENCES expenses(id),
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size >= 0),
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATE','UPDATE','DELETE','SETTLEMENT')),
  actor TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO people (id, name, farm_role, app_role) VALUES
  ('person_satish', 'Satish', 'owner', 'admin'),
  ('person_mahesh', 'Mahesh', 'owner', 'admin');
INSERT INTO farm_areas (id, code, name) VALUES
  ('area_mt', 'MT', 'MT'),
  ('area_sk', 'SK', 'SK');
INSERT INTO expense_categories (id, name, normalized_name) VALUES
  ('category_uncategorized', 'Uncategorized', 'uncategorized');
