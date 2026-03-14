import { test, expect } from "@playwright/test";

const E2E_EMAIL = process.env.E2E_EMAIL ?? "admin@example.com";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "admin123";

test.describe("Authentication flows", () => {
  test("login page loads with visible form", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.fill("#email", "invalid@example.com");
    await page.fill("#password", "wrongpassword");
    await page.click('button[type="submit"]');

    // Error message should appear — it renders inside an AlertCircle div
    const errorEl = page.locator('[class*="danger"]').first();
    await expect(errorEl).toBeVisible({ timeout: 10_000 });
  });

  test("login with valid credentials redirects to /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.fill("#email", E2E_EMAIL);
    await page.fill("#password", E2E_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    expect(page.url()).toContain("/dashboard");
  });

  test("after login, /dashboard shows monitors section", async ({ page }) => {
    // Log in first
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill("#email", E2E_EMAIL);
    await page.fill("#password", E2E_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 15_000 });

    // Dashboard should have content indicating monitors
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").innerText();
    // The dashboard renders monitor stats and/or a monitors table
    expect(body.toLowerCase()).toMatch(/monitor|uptime|status/i);
  });
});
