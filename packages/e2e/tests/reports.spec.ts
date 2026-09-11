import { test, expect } from "../fixtures/auth";

const ANALYTICS_PAGES = [
  { path: "/monitors/fleet", label: "Fleet health" },
  { path: "/monitors/sla", label: "SLA dashboard" },
  { path: "/monitors/trends", label: "Trends" },
  { path: "/monitors/heatmap", label: "Heatmap" },
  { path: "/monitors/health-scores", label: "Health scores" },
  { path: "/monitors/anomaly", label: "Anomaly report" },
  { path: "/reports", label: "Reports" },
];

test.describe("Analytics & Report pages", () => {
  for (const { path, label } of ANALYTICS_PAGES) {
    test(`${label} (${path}) loads without 500 or JS errors`, async ({ loggedIn: page }) => {
      const jsErrors: string[] = [];
      page.on("pageerror", (err) => jsErrors.push(err.message));

      const response = await page.goto(path);
      await page.waitForLoadState("networkidle");

      // Must not 500
      if (response) {
        expect(response.status()).toBeLessThan(500);
      }

      // No unhandled JS exceptions (ResizeObserver benign)
      expect(jsErrors.filter((e) => !e.includes("ResizeObserver"))).toHaveLength(0);

      // Page body must render content
      const body = page.locator("body");
      await expect(body).toBeVisible();
      const text = await body.innerText();
      expect(text.trim().length).toBeGreaterThan(0);
    });
  }
});
