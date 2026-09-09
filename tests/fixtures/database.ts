export const categorySalary = {
  id: "category_salary",
  name: "Salary",
  normalizedName: "salary",
} as const;

export async function seedCategorySalary(database: D1Database): Promise<void> {
  await database
    .prepare(
      "INSERT INTO expense_categories (id, name, normalized_name) VALUES (?, ?, ?)",
    )
    .bind(categorySalary.id, categorySalary.name, categorySalary.normalizedName)
    .run();
}
