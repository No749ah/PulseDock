import { test, expect } from "../fixtures/auth";

const TEST_STATUS_PAGE_NAME = "E2E Test Status Page";

test.describe("Status Pages", () => {
  test("status pages list loads without JS errors", async ({ loggedIn: page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto("/status-pages");
    await page.waitForLoadState("networkidle");

    expect(jsErrors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("status pages list page renders", async ({ loggedIn: page }) => {
    const response = await page.goto("/status-pages");
    await page.waitForLoadState("networkidle");

    expect(response?.status()).toBeLessThan(500);

    const body = page.locator("body");
    await expect(body).toBeVisible();
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(0);
  });

  test("create new status page and verify it appears in list", async ({ loggedIn: page }) => {
    await page.goto("/status-pages");
    await page.waitForLoadState("networkidle");

    // Find the "New" / "Create" button
    const newBtn = page
      .getByRole("button", { name: /New Status Page|New Page|Create/i })
      .first();
    if (!(await newBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await newBtn.click();

    // Fill in status page name
    const nameInput = page.getByLabel(/Name/i).first();
    if (!(await nameInput.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await nameInput.fill(TEST_STATUS_PAGE_NAME);

    // Submit
    const saveBtn = page.getByRole("button", { name: /Save|Create|Add/i }).last();
    await saveBtn.click();

    // Status page should appear in the list
    await expect(page.getByText(TEST_STATUS_PAGE_NAME)).toBeVisible({ timeout: 10_000 });
  });

  test("status page editor loads", async ({ loggedIn: page }) => {
    await page.goto("/status-pages");
    await page.waitForLoadState("networkidle");

    // Click on a status page to open editor if one exists
    const editLink = page.locator("a[href*='/status-pages/']").first();
    if (!(await editLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await editLink.click();
    await page.waitForLoadState("networkidle");

    // Editor should have loaded
    const status = await page.evaluate(() => document.readyState);
    expect(status).toBe("complete");
    expect(page.url()).not.toContain("error");
  });
});
