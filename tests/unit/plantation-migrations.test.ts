import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import initialSchema from "../../migrations/0001_initial.sql?raw";
import indexes from "../../migrations/0002_indexes.sql?raw";
import normalization from "../../migrations/0003_plantation_soft_delete_and_reference_normalization.sql?raw";
import cohortRebuild from "../../migrations/0004_plantation_distinct_cohorts.sql?raw";

const databases: DatabaseSync[] = [];

function databaseBeforePlantationMigrations(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(initialSchema);
  db.exec(indexes);
  return db;
}

function applyAtomically(db: DatabaseSync, sql: string): void {
  db.exec("BEGIN");
  try {
    db.exec(sql);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

afterEach(() => {
  while (databases.length) databases.pop()?.close();
});

describe("plantation D1 migrations", () => {
  it("preflights normalized trim collisions before changing persistent schema and can be retried", () => {
    const db = databaseBeforePlantationMigrations();
    db.prepare("INSERT INTO crops (id, name) VALUES (?, ?)").run("crop_one", "Banana");
    db.prepare("INSERT INTO crops (id, name) VALUES (?, ?)").run("crop_two", " Banana ");

    expect(() => applyAtomically(db, normalization)).toThrow();
    const columns = db.prepare("PRAGMA table_info(crops)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).not.toContain("normalized_name");

    db.prepare("DELETE FROM crops WHERE id = ?").run("crop_two");
    expect(() => applyAtomically(db, normalization)).not.toThrow();
    expect(() => applyAtomically(db, cohortRebuild)).not.toThrow();
  });

  it("rejects normalized farm-area collisions without inventing a reference mapping", () => {
    const db = databaseBeforePlantationMigrations();
    db.prepare("INSERT INTO farm_areas (id, code, name) VALUES (?, ?, ?)").run("area_one", "A1", "North Plot");
    db.prepare("INSERT INTO farm_areas (id, code, name) VALUES (?, ?, ?)").run("area_two", "A2", " north plot ");

    expect(() => applyAtomically(db, normalization)).toThrow();
    expect(db.prepare("SELECT COUNT(*) AS count FROM farm_areas").get()).toMatchObject({ count: 4 });
    const columns = db.prepare("PRAGMA table_info(farm_areas)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).not.toContain("normalized_name");
  });

  it("applies the actual migrations while allowing two same-day cohorts and retaining their rows", () => {
    const db = databaseBeforePlantationMigrations();
    applyAtomically(db, normalization);
    applyAtomically(db, cohortRebuild);
    db.prepare("INSERT INTO crops (id, name, normalized_name) VALUES (?, ?, ?)").run("crop_banana", "Banana", "banana");
    const insert = db.prepare("INSERT INTO plantation_inventory (id, crop_id, farm_area_id, quantity, planting_date) VALUES (?, ?, ?, ?, ?)");
    insert.run("cohort_one", "crop_banana", "area_mt", 10, "2026-08-01");
    expect(() => insert.run("cohort_two", "crop_banana", "area_mt", 20, "2026-08-01")).not.toThrow();
    expect(db.prepare("SELECT COUNT(*) AS count FROM plantation_inventory").get()).toMatchObject({ count: 2 });
  });
});
