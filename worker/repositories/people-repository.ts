import { ApiHttpError } from "../middleware/errors";
import { createId } from "../utils/ids";
import type { Identity } from "../types";

export type Person = {
  id: string;
  name: string;
  email: string | null;
  farmRole: string;
  appRole: Identity["role"];
  participatesInSharedExpenses: boolean;
  active: boolean;
  participant: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PersonInput = {
  name: string;
  email?: string | null;
  farmRole?: string;
  appRole?: Identity["role"];
  participatesInSharedExpenses?: boolean;
  active?: boolean;
};

type PersonRow = {
  id: string;
  name: string;
  email: string | null;
  farm_role: string;
  app_role: Identity["role"];
  participates_in_shared_expenses: number;
  active: number;
  created_at: string;
  updated_at: string;
};

function mapPerson(row: PersonRow): Person {
  const active = row.active === 1;
  const participates = row.participates_in_shared_expenses === 1;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    farmRole: row.farm_role,
    appRole: row.app_role,
    participatesInSharedExpenses: participates,
    active,
    participant: active && row.farm_role === "owner" && participates,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPersonConstraint(error: unknown): never {
  if (
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed")
  ) {
    throw new ApiHttpError(
      409,
      "PERSON_EMAIL_EXISTS",
      "A person with this email already exists",
    );
  }
  throw error;
}

function personAuditStatement(
  db: D1Database,
  personId: string,
  action: "CREATE" | "UPDATE",
  actor: string,
  before: Person | null,
  after: Person,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_log (
        id, entity_type, entity_id, action, actor, before_json, after_json
      ) VALUES (?, 'person', ?, ?, ?, ?, ?)`,
    )
    .bind(
      createId(),
      personId,
      action,
      actor,
      before ? JSON.stringify(before) : null,
      JSON.stringify(after),
    );
}

const PERSON_SELECT = `
  SELECT id, name, email, farm_role, app_role, participates_in_shared_expenses,
    active, created_at, updated_at FROM people`;

export async function listPeople(
  db: D1Database,
  options: {
    page: number;
    pageSize: number;
    includeInactive: boolean;
    participants: boolean;
  },
): Promise<{ data: Person[]; total: number }> {
  const conditions: string[] = [];
  if (!options.includeInactive || options.participants)
    conditions.push("active = 1");
  if (options.participants) {
    conditions.push(
      "farm_role = 'owner'",
      "participates_in_shared_expenses = 1",
    );
  }
  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (options.page - 1) * options.pageSize;
  const [count, rows] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS total FROM people ${where}`)
      .first<{ total: number }>(),
    db
      .prepare(
        `${PERSON_SELECT} ${where} ORDER BY name COLLATE NOCASE ASC, id ASC LIMIT ? OFFSET ?`,
      )
      .bind(options.pageSize, offset)
      .all<PersonRow>(),
  ]);
  return { data: rows.results.map(mapPerson), total: count?.total ?? 0 };
}

export async function getPerson(
  db: D1Database,
  id: string,
): Promise<Person | null> {
  const row = await db
    .prepare(`${PERSON_SELECT} WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<PersonRow>();
  return row ? mapPerson(row) : null;
}

export async function createPerson(
  db: D1Database,
  input: PersonInput,
  actor: string,
): Promise<Person> {
  const id = createId();
  const now = new Date().toISOString();
  const active = input.active !== false;
  const farmRole = input.farmRole?.trim() || "owner";
  const participatesInSharedExpenses =
    input.participatesInSharedExpenses !== false;
  const person: Person = {
    id,
    name: input.name.trim(),
    email: input.email?.trim().toLowerCase() || null,
    farmRole,
    appRole: input.appRole ?? "viewer",
    participatesInSharedExpenses,
    active,
    participant: active && farmRole === "owner" && participatesInSharedExpenses,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO people (
            id, name, email, farm_role, app_role, participates_in_shared_expenses,
            active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          person.name,
          person.email,
          farmRole,
          person.appRole,
          participatesInSharedExpenses ? 1 : 0,
          active ? 1 : 0,
          now,
          now,
        ),
      personAuditStatement(db, id, "CREATE", actor, null, person),
    ]);
  } catch (error) {
    mapPersonConstraint(error);
  }
  const storedPerson = await getPerson(db, id);
  if (!storedPerson)
    throw new ApiHttpError(
      500,
      "STORAGE_ERROR",
      "The person could not be read after writing",
    );
  return storedPerson;
}

export async function updatePerson(
  db: D1Database,
  id: string,
  input: Partial<PersonInput>,
  actor: string,
): Promise<Person> {
  const current = await getPerson(db, id);
  if (!current)
    throw new ApiHttpError(404, "PERSON_NOT_FOUND", "The person was not found");
  const email =
    input.email === undefined
      ? current.email
      : input.email?.trim().toLowerCase() || null;
  const name = input.name?.trim() ?? current.name;
  const farmRole = input.farmRole?.trim() ?? current.farmRole;
  const appRole = input.appRole ?? current.appRole;
  const participatesInSharedExpenses =
    input.participatesInSharedExpenses ?? current.participatesInSharedExpenses;
  const active = input.active ?? current.active;
  const updatedAt = new Date().toISOString();
  const person: Person = {
    ...current,
    name,
    email,
    farmRole,
    appRole,
    participatesInSharedExpenses,
    active,
    participant: active && farmRole === "owner" && participatesInSharedExpenses,
    updatedAt,
  };
  try {
    await db.batch([
      db
        .prepare(
          `UPDATE people SET name = ?, email = ?, farm_role = ?, app_role = ?,
            participates_in_shared_expenses = ?, active = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(
          name,
          email,
          farmRole,
          appRole,
          participatesInSharedExpenses ? 1 : 0,
          active ? 1 : 0,
          updatedAt,
          id,
        ),
      personAuditStatement(db, id, "UPDATE", actor, current, person),
    ]);
  } catch (error) {
    mapPersonConstraint(error);
  }
  const storedPerson = await getPerson(db, id);
  if (!storedPerson)
    throw new ApiHttpError(
      500,
      "STORAGE_ERROR",
      "The person could not be read after writing",
    );
  return storedPerson;
}
