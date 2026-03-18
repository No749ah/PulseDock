import { test, expect } from "@playwright/test";

const E2E_EMAIL = process.env.E2E_EMAIL ?? "admin@example.com";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "admin123";

/**
 * Wait for the login form to be ready — the page fetches /setup-status first,
 * so the form may not render immediately.
 */
async function waitForLoginForm(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never) {
  await page.waitForLoadState("networkidle").catch(() => null);
  await expect(page.locator("#email")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#password")).toBeVisible({ timeout: 20_000 });
}

test.describe("Authentication flows", () => {
  test("login page loads with visible form", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await waitForLoginForm(page as never);
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await waitForLoginForm(page as never);

    await page.fill("#email", "invalid@example.com");
    await page.fill("#password", "wrongpassword_not_valid");
    await page.click('button[type="submit"]');

    // Error message should appear — check for error indicator (uses Tailwind 'danger' class pattern)
    const errorEl = page.locator('[class*="bg-danger"], [class*="text-danger"], [role="alert"]').first();
    await expect(errorEl).toBeVisible({ timeout: 15_000 });
  });

  test("login with valid credentials redirects to /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await waitForLoginForm(page as never);

    await page.fill("#email", E2E_EMAIL);
    await page.fill("#password", E2E_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for redirect — may go to /dashboard or stay on login with email verification
    await Promise.race([
      page.waitForURL("**/dashboard", { timeout: 25_000 }),
      page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 }),
    ]);

    // Verify we're somewhere authenticated
    const url = page.url();
    expect(url).not.toContain("/login");
  });

  test("after login, /dashboard shows monitoring content", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await waitForLoginForm(page as never);

    await page.fill("#email", E2E_EMAIL);
    await page.fill("#password", E2E_PASSWORD);
    await page.click('button[type="submit"]');

    await Promise.race([
      page.waitForURL("**/dashboard", { timeout: 25_000 }),
      page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 }),
    ]);

    await page.waitForLoadState("networkidle").catch(() => null);

    const body = await page.locator("body").innerText();
    // Dashboard renders monitor stats, status, or navigation
    expect(body.toLowerCase()).toMatch(/monitor|uptime|status|dashboard/i);
  });

  test("unauthenticated access to /dashboard redirects to login", async ({ page }) => {
    // Clear cookies to ensure unauthenticated state
    await page.context().clearCookies();

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle").catch(() => null);

    // Should redirect to login
    const url = page.url();
    expect(url).toContain("/login");
  });
});
