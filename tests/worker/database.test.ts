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
});
