import { test, expect } from "../fixtures/auth";

test.describe("Versions", () => {
  test("versions page loads without JS errors", async ({ loggedIn: page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto("/versions");
    await page.waitForLoadState("networkidle");

    expect(jsErrors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("versions page renders version intelligence content", async ({ loggedIn: page }) => {
    const response = await page.goto("/versions");
    await page.waitForLoadState("networkidle");

    expect(response?.status()).toBeLessThan(500);

    const body = page.locator("body");
    await expect(body).toBeVisible();
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(0);
  });

  test("projects page loads without errors", async ({ loggedIn: page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    const response = await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    expect(response?.status()).toBeLessThan(500);
    expect(jsErrors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });
});
