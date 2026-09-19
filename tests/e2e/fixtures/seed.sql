PRAGMA foreign_keys = ON;

UPDATE people
SET email = 'admin@vkb.test', app_role = 'admin', updated_at = CURRENT_TIMESTAMP
WHERE id = 'person_satish';

UPDATE people
SET email = 'editor@vkb.test', app_role = 'editor', updated_at = CURRENT_TIMESTAMP
WHERE id = 'person_mahesh';

INSERT INTO people (id, name, email, farm_role, app_role, participates_in_shared_expenses)
VALUES ('person_viewer', 'VKB Viewer', 'viewer@vkb.test', 'observer', 'viewer', 0);

INSERT INTO crops (id, name, local_name, crop_type)
VALUES ('crop_banana', 'Banana', 'Kela', 'fruit');

INSERT INTO expenses (
  id, expense_date, description, amount_paise, paid_by_person_id,
  category_id, expense_class, paid_to, is_shared, source
) VALUES
  ('e2e_expense_satish', '2026-09-01', 'E2E opening Satish expense', 20000, 'person_satish', 'category_uncategorized', 'OPEX', 'Fixture supplier', 1, 'E2E'),
  ('e2e_expense_mahesh', '2026-09-02', 'E2E opening Mahesh expense', 10000, 'person_mahesh', 'category_uncategorized', 'OPEX', 'Fixture supplier', 1, 'E2E');
