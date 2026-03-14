import { test as base, expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";

const E2E_EMAIL = process.env.E2E_EMAIL ?? "admin@example.com";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "admin123";
const STORAGE_STATE_PATH = path.join(__dirname, "../.auth/user.json");

/**
 * Perform login and save storage state for reuse.
 */
export async function authenticate(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await expect(page.locator("#email")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#password")).toBeVisible({ timeout: 15_000 });

  await page.fill("#email", E2E_EMAIL);
  await page.fill("#password", E2E_PASSWORD);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL("**/dashboard", { timeout: 20_000 });

  // Persist storage state
  const dir = path.dirname(STORAGE_STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE_PATH });
}

/**
 * loggedIn fixture — authenticates once, then reuses the stored session.
 */
export const test = base.extend<{ loggedIn: Page }>({
  loggedIn: async ({ browser }, use) => {
    const hasState = fs.existsSync(STORAGE_STATE_PATH);
    const context = await browser.newContext(
      hasState ? { storageState: STORAGE_STATE_PATH } : {}
    );
    const page = await context.newPage();

    if (!hasState) {
      await authenticate(page);
    } else {
      // Validate saved session is still valid; re-authenticate if expired.
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");
      if (page.url().includes("/login")) {
        await authenticate(page);
      }
    }

    await use(page);
    await context.close();
  },
});

export { expect };
export { E2E_EMAIL, E2E_PASSWORD };
