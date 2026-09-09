import { applyD1Migrations, env } from "cloudflare:test";
import { afterEach, beforeAll } from "vitest";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

afterEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM documents"),
    env.DB.prepare("DELETE FROM audit_log"),
    env.DB.prepare("DELETE FROM harvests"),
    env.DB.prepare("DELETE FROM plantation_inventory"),
    env.DB.prepare("DELETE FROM settlements"),
    env.DB.prepare("DELETE FROM expenses"),
    env.DB.prepare("DELETE FROM crops"),
    env.DB.prepare("DELETE FROM expense_categories WHERE id <> ?").bind(
      "category_uncategorized",
    ),
  ]);
});
