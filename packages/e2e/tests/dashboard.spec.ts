import { test, expect } from "../fixtures/auth";

test.describe("Dashboard", () => {
  test("dashboard loads without JS errors", async ({ loggedIn: page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // No fatal JS errors
    expect(jsErrors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("dashboard has nav and main content area", async ({ loggedIn: page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Nav element should be present (AppFrame renders a sidebar/nav)
    const nav = page.locator("nav, [role='navigation'], aside").first();
    await expect(nav).toBeVisible({ timeout: 10_000 });

    // Main content area
    const main = page.locator("main, [role='main']").first();
    await expect(main).toBeVisible({ timeout: 10_000 });
  });
});
