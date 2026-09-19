import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  ["dashboard", "/dashboard", "Farm at a glance"],
  ["expenses", "/expenses", "Expenses"],
  ["settlements", "/settlements", "Settlements"],
  ["plantation", "/plantation", "Plantation"],
  ["harvest", "/harvest", "Harvest"],
  ["reports", "/reports", "Reports"],
  ["documents", "/documents", "Receipts & records"],
  ["settings", "/settings", "Farm settings, kept in season."],
] as const;

test.describe("responsive accessibility", () => {
  for (const [name, path, heading] of routes) {
    test(`${name} has no serious accessibility violations or page overflow`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(page.locator(".route-skeleton")).toHaveCount(0);
      await page.evaluate(async () => Promise.allSettled(document.getAnimations().map((animation) => animation.finished)));
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test("skip navigation, visible focus, dialog trap, and focus return work", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toHaveCSS("position", "fixed");
    await skipLink.press("Enter");
    await expect(page.locator("main#main-content")).toBeFocused();

    const trigger = page.getByRole("button", { name: "Add record" });
    if (await trigger.isVisible()) {
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Quick actions" });
      await expect(dialog).toBeVisible();
      for (let index = 0; index < 10; index += 1) {
        await page.keyboard.press("Tab");
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  });

  test("field errors name their controls and chart equivalents expose values", async ({ page }) => {
    await page.goto("/expenses/new");
    await page.getByRole("button", { name: "Save expense" }).click();
    await expect(page.getByRole("group", { name: "Paid by" })).toHaveAttribute("aria-describedby", "expense-payer-error");
    await expect(page.getByLabel("Category")).toHaveAttribute("aria-describedby", "category-error");

    await page.goto("/dashboard");
    if ((page.viewportSize()?.width ?? 0) < 760) {
      await expect(page.getByRole("region", { name: "Mobile expense summary" })).toContainText(/₹/);
    } else {
      await expect(page.getByRole("list", { name: "Monthly expense values" })).toContainText(/₹/);
      await expect(page.getByRole("list", { name: "Expense category values" })).toContainText(/₹/);
    }
    await expect(page.getByText("Server-backed records · writes require network")).toBeVisible();
  });
});
