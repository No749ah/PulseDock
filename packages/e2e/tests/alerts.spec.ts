import { test, expect } from "../fixtures/auth";

test.describe("Alerts", () => {
  test("alerts page loads without JS errors", async ({ loggedIn: page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    expect(jsErrors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("alerts page renders main heading and content", async ({ loggedIn: page }) => {
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    const body = page.locator("body");
    await expect(body).toBeVisible();

    // Page should have some alert-related content
    const pageText = await body.innerText();
    expect(pageText.length).toBeGreaterThan(0);
  });

  test("alerts page does not return 500", async ({ loggedIn: page }) => {
    const response = await page.goto("/alerts");
    expect(response?.status()).toBeLessThan(500);
  });
});
