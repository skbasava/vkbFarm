import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Dashboard = {
  totals: { expensePaise: number; revenuePaise: number };
};

type SettlementSummary = {
  recommendedTransfers: Array<{ amountPaise: number; fromPersonId: string; toPersonId: string }>;
};

async function apiData<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(path);
  expect(response.ok(), `${path} should succeed`).toBe(true);
  const payload = (await response.json()) as { data: T };
  return payload.data;
}

function fixturePdf(label: string): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 180] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${45 + label.length} >>\nstream\nBT /F1 18 Tf 28 100 Td (${label}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(document);
}

async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(async () => {
    if (!("serviceWorker" in navigator)) return false;
    await navigator.serviceWorker.ready;
    return true;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

test.describe.configure({ mode: "serial" });

test("authenticated production workflow, private PDF, PWA safety, and role gates", async ({ browser, context, page, request }, testInfo) => {
  const suffix = testInfo.project.name.startsWith("mobile") ? "mobile" : "desktop";
  const amountPaise = suffix === "mobile" ? 12_345 : 12_445;
  const amountRupees = (amountPaise / 100).toFixed(2);
  const expenseLabel = `E2E ${suffix} irrigation parts`;

  const anonymous = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string, extraHTTPHeaders: {} });
  const anonymousIdentity = await anonymous.request.get("/api/v1/identity");
  expect(anonymousIdentity.status()).toBe(401);
  await anonymous.close();

  const dashboardBefore = await apiData<Dashboard>(request, "/api/v1/dashboard");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Farm at a glance" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Farm at a glance" })).toBeVisible();

  await page.goto("/expenses/new");
  await expect(page.getByRole("heading", { name: "Add an expense" })).toBeVisible();
  await page.getByLabel("Amount").fill(amountRupees);
  await page.getByLabel("Date").fill(suffix === "mobile" ? "2026-09-10" : "2026-09-11");
  await page.getByLabel("Category").selectOption({ label: "Uncategorized" });
  await page.getByRole("button", { name: "Satish" }).click();
  await page.getByLabel("Description").fill(expenseLabel);
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByRole("status")).toContainText("Expense saved");

  const dashboardAfterExpense = await apiData<Dashboard>(request, "/api/v1/dashboard");
  expect(dashboardAfterExpense.totals.expensePaise).toBe(dashboardBefore.totals.expensePaise + amountPaise);
  const expenseResult = await apiData<Array<{ id: string; description: string }>>(
    request,
    `/api/v1/expenses?search=${encodeURIComponent(expenseLabel)}&pageSize=25&page=1`,
  );
  expect(expenseResult).toHaveLength(1);
  const expenseId = expenseResult[0]!.id;

  const settlementBefore = await apiData<SettlementSummary>(request, "/api/v1/settlements/summary");
  expect(settlementBefore.recommendedTransfers).toHaveLength(1);
  await page.goto("/settlements");
  await expect(page.getByRole("heading", { name: "Settlements" })).toBeVisible();
  const recommendation = settlementBefore.recommendedTransfers[0]!;
  await page.getByLabel("From", { exact: true }).selectOption(recommendation.fromPersonId);
  await page.getByLabel("To", { exact: true }).selectOption(recommendation.toPersonId);
  await page.getByLabel("Amount").fill("1.00");
  await page.getByLabel("Payment date").fill(suffix === "mobile" ? "2026-09-12" : "2026-09-13");
  await page.getByLabel(/Remarks/).fill(`E2E ${suffix} settlement`);
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(`E2E ${suffix} settlement`)).toBeVisible();
  const settlementAfter = await apiData<SettlementSummary>(request, "/api/v1/settlements/summary");
  expect(settlementAfter.recommendedTransfers[0]!.amountPaise).toBe(recommendation.amountPaise - 100);

  const dashboardBeforeHarvest = await apiData<Dashboard>(request, "/api/v1/dashboard");
  await page.goto("/harvest/new");
  await expect(page.getByRole("dialog", { name: "Record harvest" })).toBeVisible();
  await page.getByLabel("Crop", { exact: true }).selectOption({ label: "Banana" });
  await page.getByLabel("Harvest date").fill(suffix === "mobile" ? "2026-09-14" : "2026-09-15");
  await page.getByLabel("Net weight (kg)").fill("2");
  await page.getByLabel("Sale price (₹ per kg)").fill("5");
  await page.getByRole("button", { name: "Record harvest" }).last().click();
  await expect(page.getByRole("dialog", { name: "Record harvest" })).toBeHidden();
  const dashboardAfterHarvest = await apiData<Dashboard>(request, "/api/v1/dashboard");
  expect(dashboardAfterHarvest.totals.revenuePaise).toBe(dashboardBeforeHarvest.totals.revenuePaise + 1_000);

  await page.goto("/plantation/new");
  await expect(page.getByRole("dialog", { name: "Record crop cohort" })).toBeVisible();
  await page.getByLabel("Crop", { exact: true }).selectOption({ label: "Banana" });
  await page.getByLabel("Farm area").selectOption("area_mt");
  await page.getByLabel("Quantity").fill(suffix === "mobile" ? "17" : "19");
  await page.getByLabel("Planting date").fill(suffix === "mobile" ? "2026-09-16" : "2026-09-17");
  await page.getByRole("button", { name: "Record cohort" }).click();
  await expect(page.getByRole("dialog", { name: "Record crop cohort" })).toBeHidden();

  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  const csv = await request.get("/api/v1/reports/export/expenses");
  expect(csv.ok()).toBe(true);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain(expenseLabel);

  await page.goto(`/documents?expenseId=${expenseId}`);
  await expect(page.getByRole("heading", { name: "Receipts & records" })).toBeVisible();
  const pdfName = `receipt-${suffix}.pdf`;
  await page.getByLabel("Choose receipt file").setInputFiles({
    name: pdfName,
    mimeType: "application/pdf",
    buffer: fixturePdf(`VKB ${suffix} receipt`),
  });
  await page.getByRole("button", { name: "Upload receipt" }).click();
  await expect(page.getByRole("status")).toContainText(`${pdfName} is safely attached`);
  await expect(page.getByTitle(`Preview ${pdfName}`)).toBeVisible();
  const openReceipt = page.getByRole("link", { name: "Open" }).last();
  const contentPath = await openReceipt.getAttribute("href");
  expect(contentPath).toMatch(/^\/api\/v1\/documents\/[^/]+\/content$/);
  const content = await request.get(contentPath!);
  expect(content.ok()).toBe(true);
  expect(content.headers()["content-type"]).toContain("application/pdf");
  expect((await content.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Farm settings, kept in season." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add person" })).toBeVisible();

  const viewer = await browser.newContext({
    baseURL: testInfo.project.use.baseURL as string,
    extraHTTPHeaders: { "Cf-Access-Authenticated-User-Email": "viewer@vkb.test" },
    viewport: suffix === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  });
  const viewerPage = await viewer.newPage();
  await viewerPage.goto("/settings");
  await expect(viewerPage.getByText("Read only", { exact: true })).toBeVisible();
  await expect(viewerPage.getByRole("button", { name: "Add person" })).toHaveCount(0);
  await viewerPage.goto("/dashboard");
  await expect(viewerPage.getByRole("button", { name: "Add record" })).toHaveCount(0);
  const forbidden = await viewer.request.post("/api/v1/expenses", {
    data: {
      amount: "1.00",
      categoryId: "category_uncategorized",
      description: "must not be created",
      expenseDate: "2026-09-18",
      isShared: true,
      paidByPersonId: "person_satish",
    },
  });
  expect(forbidden.status()).toBe(403);
  await viewer.close();

  const editor = await browser.newContext({
    baseURL: testInfo.project.use.baseURL as string,
    extraHTTPHeaders: { "Cf-Access-Authenticated-User-Email": "editor@vkb.test" },
    viewport: suffix === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  });
  const editorIdentity = await editor.request.get("/api/v1/identity");
  expect(await editorIdentity.json()).toEqual({ data: { email: "editor@vkb.test", role: "editor" } });
  const editorWrite = await editor.request.post("/api/v1/expenses", {
    data: {
      amount: "2.00",
      categoryId: "category_uncategorized",
      description: `E2E ${suffix} editor-authorized expense`,
      expenseClass: "OPEX",
      expenseDate: suffix === "mobile" ? "2026-09-18" : "2026-09-19",
      isShared: false,
      notes: null,
      paidByPersonId: "person_mahesh",
      paidTo: null,
    },
  });
  expect(editorWrite.status()).toBe(201);
  const editorPage = await editor.newPage();
  await editorPage.goto("/settings");
  await expect(editorPage.getByText("Read only", { exact: true })).toBeVisible();
  await expect(editorPage.getByRole("button", { name: "Add person" })).toHaveCount(0);
  await editor.close();

  await page.goto("/dashboard");
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ id: "/", start_url: "/dashboard", display: "standalone" });
  await waitForServiceWorker(page);
  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames).toContain("vkb-shell-v1");

  await page.goto("/expenses/new");
  const retainedLabel = `E2E ${suffix} retained offline value`;
  await page.getByLabel("Amount").fill("9.99");
  await page.getByLabel("Category").selectOption({ label: "Uncategorized" });
  await page.getByRole("button", { name: "Satish" }).click();
  await page.getByLabel("Description").fill(retainedLabel);
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Description")).toHaveValue(retainedLabel);
  const apiWasNotSynthesized = await page.evaluate(async () => {
    try {
      await fetch("/api/v1/dashboard");
      return false;
    } catch {
      return true;
    }
  });
  expect(apiWasNotSynthesized).toBe(true);
  await page.goto("/dashboard");
  await expect(page.locator("#root")).not.toBeEmpty();
  await context.setOffline(false);
});
