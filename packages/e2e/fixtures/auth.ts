import { test as base, expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";

const E2E_EMAIL = process.env.E2E_EMAIL ?? "admin@example.com";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "admin123";
const STORAGE_STATE_PATH = path.join(__dirname, "../.auth/user.json");

/**
 * Wait for the login page to be fully interactive (setup-status check complete).
 * The login page fetches /v1/auth/setup-status before rendering the form.
 */
async function waitForLoginReady(page: Page): Promise<"login" | "setup"> {
  // Wait for either the login form (#email) or setup form (#setup-email) to appear
  await Promise.race([
    page.locator("#email").waitFor({ state: "visible", timeout: 20_000 }),
    page.locator("#setup-email").waitFor({ state: "visible", timeout: 20_000 }).catch(() => null),
  ]);

  // Detect which form is shown
  const emailVisible = await page.locator("#email").isVisible().catch(() => false);
  if (emailVisible) return "login";

  const setupEmailVisible = await page.locator("#setup-email").isVisible().catch(() => false);
  if (setupEmailVisible) return "setup";

  return "login";
}

/**
 * Perform first-time setup if the app hasn't been configured yet.
 */
async function handleSetup(page: Page): Promise<void> {
  // Fill setup form — it uses #setup-email / #setup-password or generic email/password
  const emailField = page.locator("#setup-email");
  const passwordField = page.locator("#setup-password");
  const confirmField = page.locator("#setup-confirm");

  await emailField.fill(E2E_EMAIL);
  await passwordField.fill(E2E_PASSWORD);
  const confirmVisible = await confirmField.isVisible().catch(() => false);
  if (confirmVisible) await confirmField.fill(E2E_PASSWORD);

  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 20_000 });
}

/**
 * Perform login and save storage state for reuse.
 */
export async function authenticate(page: Page): Promise<void> {
  await page.goto("/login");
  // Wait for network to settle after setup-status fetch
  await page.waitForLoadState("domcontentloaded");

  // Give the setup-status API call time to complete (it gates the form render)
  await page.waitForLoadState("networkidle").catch(() => null);

  // Wait for form to be interactive
  const formType = await waitForLoginReady(page).catch(() => "login" as const);

  if (formType === "setup") {
    await handleSetup(page);
  } else {
    await expect(page.locator("#email")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#password")).toBeVisible({ timeout: 15_000 });

    await page.fill("#email", E2E_EMAIL);
    await page.fill("#password", E2E_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for redirect away from login (dashboard or any authenticated page)
    await Promise.race([
      page.waitForURL("**/dashboard", { timeout: 25_000 }),
      page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 }),
    ]);

    // Ensure the page is settled on an authenticated route
    await page.waitForLoadState("networkidle").catch(() => null);

    // Final check: if somehow still on login, something went wrong
    if (page.url().includes("/login")) {
      throw new Error(`Login failed — still on login page. URL: ${page.url()}`);
    }
  }

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
      await page.waitForLoadState("networkidle").catch(() => null);
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
