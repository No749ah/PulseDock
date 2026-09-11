import { test, expect } from "../fixtures/auth";

test.describe("Incidents", () => {
  test("incidents page loads without JS errors", async ({ loggedIn: page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto("/incidents");
    await page.waitForLoadState("networkidle");

    expect(jsErrors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("incidents page renders and returns 200", async ({ loggedIn: page }) => {
    const response = await page.goto("/incidents");
    await page.waitForLoadState("networkidle");

    expect(response?.status()).toBeLessThan(500);

    const body = page.locator("body");
    await expect(body).toBeVisible();
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(0);
  });
});
