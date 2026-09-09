import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("initial schema", () => {
  it("seeds people, areas, and Uncategorized", async () => {
    const people = await env.DB.prepare(
      "SELECT id, name FROM people ORDER BY id",
    ).all();

    expect(people.results).toEqual([
      { id: "person_mahesh", name: "Mahesh" },
      { id: "person_satish", name: "Satish" },
    ]);

    const areaCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM farm_areas",
    ).first<number>("count");
    expect(areaCount).toBe(2);

    const category = await env.DB.prepare(
      "SELECT id, name FROM expense_categories WHERE id = ?",
    )
      .bind("category_uncategorized")
      .first<{ id: string; name: string }>();
    expect(category).toEqual({
      id: "category_uncategorized",
      name: "Uncategorized",
    });
  });

  it("allows an undated harvest only for an Excel import", async () => {
    await env.DB.prepare("INSERT INTO crops (id, name) VALUES (?, ?)")
      .bind("crop_banana", "Banana")
      .run();

    await expect(
      env.DB
        .prepare(
          "INSERT INTO harvests (id, crop_id, harvest_date) VALUES (?, ?, ?)",
        )
        .bind("harvest_manual", "crop_banana", null)
        .run(),
    ).rejects.toThrow("CHECK constraint failed");

    await expect(
      env.DB
        .prepare(
          "INSERT INTO harvests (id, crop_id, harvest_date, source) VALUES (?, ?, ?, ?)",
        )
        .bind("harvest_excel", "crop_banana", null, "EXCEL")
        .run(),
    ).resolves.toMatchObject({ success: true });
  });

  it("creates non-seed people and farm areas for isolation verification", async () => {
    await env.DB.batch([
      env.DB
        .prepare("INSERT INTO people (id, name) VALUES (?, ?)")
        .bind("person_test", "Test Person"),
      env.DB
        .prepare("INSERT INTO farm_areas (id, code, name) VALUES (?, ?, ?)")
        .bind("area_test", "TEST", "Test Area"),
    ]);
  });

  it("starts without people or farm areas created by a prior test", async () => {
    const extraPeople = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM people WHERE id NOT IN (?, ?)",
    )
      .bind("person_satish", "person_mahesh")
      .first<number>("count");
    const extraAreas = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM farm_areas WHERE id NOT IN (?, ?)",
    )
      .bind("area_mt", "area_sk")
      .first<number>("count");

    expect(extraPeople).toBe(0);
    expect(extraAreas).toBe(0);
  });
});
