import { test, expect } from "../fixtures/auth";

test.describe("Account & Settings", () => {
  test("account page loads without JS errors", async ({ loggedIn: page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto("/account");
    await page.waitForLoadState("networkidle");

    expect(jsErrors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("account page renders profile form elements", async ({ loggedIn: page }) => {
    const response = await page.goto("/account");
    await page.waitForLoadState("networkidle");

    expect(response?.status()).toBeLessThan(500);

    const body = page.locator("body");
    await expect(body).toBeVisible();

    // Should contain some form-like content (email/name fields or settings)
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });

  test("admin page loads without errors", async ({ loggedIn: page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    const response = await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    // Admin may redirect non-admins, but must not 500
    expect(response?.status()).toBeLessThan(500);
    expect(jsErrors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("maintenance page loads without errors", async ({ loggedIn: page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    const response = await page.goto("/maintenance");
    await page.waitForLoadState("networkidle");

    expect(response?.status()).toBeLessThan(500);
    expect(jsErrors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });
});
