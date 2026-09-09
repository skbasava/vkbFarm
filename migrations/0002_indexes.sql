CREATE INDEX idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX idx_expenses_paid_by_person_id ON expenses(paid_by_person_id);
CREATE INDEX idx_expenses_category_id ON expenses(category_id);
CREATE INDEX idx_expenses_crop_id ON expenses(crop_id);
CREATE INDEX idx_expenses_deleted_at ON expenses(deleted_at);
CREATE INDEX idx_expenses_deleted_at_expense_date ON expenses(deleted_at, expense_date);
CREATE INDEX idx_expenses_payer_deleted_at_expense_date ON expenses(paid_by_person_id, deleted_at, expense_date);
CREATE INDEX idx_expenses_category_deleted_at_expense_date ON expenses(category_id, deleted_at, expense_date);

CREATE INDEX idx_settlements_from_person_id ON settlements(from_person_id);
CREATE INDEX idx_settlements_to_person_id ON settlements(to_person_id);
CREATE INDEX idx_settlements_settlement_date ON settlements(settlement_date);

CREATE INDEX idx_plantation_inventory_crop_id ON plantation_inventory(crop_id);
CREATE INDEX idx_plantation_inventory_farm_area_id ON plantation_inventory(farm_area_id);

CREATE INDEX idx_harvests_crop_id ON harvests(crop_id);
CREATE INDEX idx_harvests_harvest_date ON harvests(harvest_date);
CREATE INDEX idx_harvests_crop_id_harvest_date ON harvests(crop_id, harvest_date);

CREATE INDEX idx_documents_expense_id ON documents(expense_id);

CREATE INDEX idx_audit_log_entity_type_entity_id ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

CREATE UNIQUE INDEX idx_expenses_import_fingerprint ON expenses(import_fingerprint)
  WHERE import_fingerprint IS NOT NULL;
CREATE UNIQUE INDEX idx_plantation_inventory_import_fingerprint ON plantation_inventory(import_fingerprint)
  WHERE import_fingerprint IS NOT NULL;
CREATE UNIQUE INDEX idx_harvests_import_fingerprint ON harvests(import_fingerprint)
  WHERE import_fingerprint IS NOT NULL;
