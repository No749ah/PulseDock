#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';

const baseUrl = process.env.BASE_URL || 'http://localhost:1234';
const routes = (process.env.UX_ROUTES || '/login,/dashboard,/monitors,/alerts,/account,/projects,/versions,/admin')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve('artifacts', 'ux-review', stamp);

const viewports = [
  { name: 'desktop', ...devices['Desktop Chrome'] },
  { name: 'tablet', ...devices['iPad (gen 7)'] },
  { name: 'mobile', ...devices['iPhone 13'] },
];

const colorSchemes = ['light', 'dark'];

async function run() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = {
    baseUrl,
    createdAt: new Date().toISOString(),
    routes,
    screenshots: [],
    checks: [],
  };

  for (const view of viewports) {
    for (const colorScheme of colorSchemes) {
      const context = await browser.newContext({
        ...view,
        colorScheme,
      });

      for (const route of routes) {
        const page = await context.newPage();
        const target = `${baseUrl}${route}`;

        try {
          const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          const status = response?.status() ?? 0;
          await page.waitForTimeout(500);

          const safeRoute = route.replace(/[^a-z0-9-_]/gi, '_').replace(/^_+|_+$/g, '') || 'root';
          const file = `${safeRoute}-${view.name}-${colorScheme}.png`;
          const abs = path.join(outDir, file);
          await page.screenshot({ path: abs, fullPage: true });

          // Basic keyboard navigation sanity (focus should move after Tab)
          const before = await page.evaluate(() => document.activeElement?.tagName || 'NONE');
          await page.keyboard.press('Tab');
          const after = await page.evaluate(() => document.activeElement?.tagName || 'NONE');
          const keyboardOk = before !== after;

          report.screenshots.push({ route, viewport: view.name, colorScheme, file, status });
          report.checks.push({ route, viewport: view.name, colorScheme, statusOk: status >= 200 && status < 400, keyboardOk, before, after });
        } catch (error) {
          report.checks.push({
            route,
            viewport: view.name,
            colorScheme,
            statusOk: false,
            keyboardOk: false,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          await page.close();
        }
      }

      await context.close();
    }
  }

  await browser.close();

  const reportPath = path.join(outDir, 'report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  const failed = report.checks.filter((c) => !c.statusOk || !c.keyboardOk);
  console.log(`UX review report: ${reportPath}`);
  console.log(`Screenshots: ${report.screenshots.length}`);
  console.log(`Checks: ${report.checks.length} (${failed.length} issues)`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
