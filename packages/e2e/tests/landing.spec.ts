import { test, expect } from "@playwright/test";

test.describe("Public pages", () => {
  test("landing page loads with correct title", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveTitle(/PulseDock/i);
  });

  test("login page loads with visible form", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Email and password inputs must be visible
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("non-existent route does not crash the app", async ({ page }) => {
    const response = await page.goto("/nonexistent-404-xyz");
    await page.waitForLoadState("networkidle");

    // The app should either return a 404 page or redirect — but must not be a 5xx crash
    const status = response?.status() ?? 200;
    expect(status).toBeLessThan(500);

    // Page body must render something (not blank)
    const body = await page.locator("body").innerText();
    expect(body.trim().length).toBeGreaterThan(0);
  });
});
