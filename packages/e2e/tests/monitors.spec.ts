import { test, expect } from "../fixtures/auth";

const TEST_MONITOR_NAME = "E2E Test Monitor";

test.describe("Monitor CRUD", () => {
  test("monitors page loads after login", async ({ loggedIn: page }) => {
    await page.goto("/monitors");
    await page.waitForLoadState("networkidle");

    // The page should render without crashing
    await expect(page.locator("body")).toBeVisible();

    // "New Monitor" button should be present
    const newBtn = page.getByRole("button", { name: /New Monitor|New/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10_000 });
  });

  test("create a new HTTP monitor and verify it appears in list", async ({
    loggedIn: page,
  }) => {
    await page.goto("/monitors");
    await page.waitForLoadState("networkidle");

    // Click "New Monitor"
    const newBtn = page.getByRole("button", { name: /New Monitor|New/i }).first();
    await newBtn.click();

    // Modal opens — skip template selection if shown
    const skipTemplateBtn = page.getByRole("button", { name: /skip|No thanks|blank|start from scratch/i });
    if (await skipTemplateBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await skipTemplateBtn.click();
    }

    // Fill in the monitor name
    const nameInput = page.getByLabel(/Monitor Name/i);
    await nameInput.fill(TEST_MONITOR_NAME);

    // Type select — choose HTTP (should already be default)
    const typeSelect = page.getByLabel(/Type/i);
    await typeSelect.selectOption("HTTP");

    // Target URL
    const targetInput = page.getByLabel(/Target/i);
    await targetInput.fill("https://example.com");

    // Click Save / Create
    const saveBtn = page.getByRole("button", { name: /Save|Create|Add/i }).last();
    await saveBtn.click();

    // Monitor should appear in the list
    await expect(page.getByText(TEST_MONITOR_NAME)).toBeVisible({ timeout: 10_000 });
  });

  test("delete the E2E test monitor", async ({ loggedIn: page }) => {
    await page.goto("/monitors");
    await page.waitForLoadState("networkidle");

    // Find the delete button for our test monitor
    const deleteBtn = page.getByRole("button", {
      name: new RegExp(`Delete monitor ${TEST_MONITOR_NAME}`, "i"),
    });

    if (!(await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      // Monitor may not exist (e.g. previous test didn't run) — skip gracefully
      test.skip();
      return;
    }

    // Handle browser confirm dialog
    page.once("dialog", (dialog) => dialog.accept());
    await deleteBtn.click();

    // Monitor should no longer appear in list
    await expect(page.getByText(TEST_MONITOR_NAME)).not.toBeVisible({ timeout: 10_000 });
  });
});
