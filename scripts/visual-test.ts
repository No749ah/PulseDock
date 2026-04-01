#!/usr/bin/env npx tsx
/**
 * Visual regression testing script for PulseDock.
 *
 * Captures screenshots of all pages at multiple viewports (desktop, tablet, mobile)
 * in both light and dark themes. Outputs to scripts/screenshots/.
 *
 * Usage: npx tsx scripts/visual-test.ts [--base-url=http://localhost:1234]
 *
 * Requires: npx playwright install chromium
 */

import { chromium, type Browser, type Page } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const BASE_URL = process.argv.find((a) => a.startsWith('--base-url='))?.split('=')[1] ?? 'http://localhost:1234';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
} as const;

/** Pages that don't require authentication */
const PUBLIC_PAGES = [
  { name: 'landing', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'changelog', path: '/changelog' },
];

/** Pages that require authentication (will show login redirect) */
const AUTH_PAGES = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'monitors', path: '/monitors' },
  { name: 'monitors-sla', path: '/monitors/sla' },
  { name: 'monitors-analytics', path: '/monitors/analytics' },
  { name: 'alerts', path: '/alerts' },
  { name: 'incidents', path: '/incidents' },
  { name: 'status-pages', path: '/status-pages' },
  { name: 'versions', path: '/versions' },
  { name: 'projects', path: '/projects' },
  { name: 'reports', path: '/reports' },
  { name: 'account', path: '/account' },
  { name: 'admin', path: '/admin' },
];

const OUT_DIR = join(__dirname, 'screenshots');

interface ScreenshotResult {
  page: string;
  viewport: string;
  theme: string;
  file: string;
  status: 'ok' | 'error';
  error?: string;
  httpStatus?: number;
}

function printPlaywrightDependencyHint(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);

  if (!message.includes('error while loading shared libraries')) {
    return;
  }

  console.error('\n⚠️  Playwright browser runtime dependencies are missing on this host.');
  console.error('   This environment needs system packages for headless Chromium.');
  console.error('   Fix (requires root):');
  console.error('     npx playwright install-deps chromium');
  console.error('   Then rerun:');
  console.error('     npx tsx scripts/visual-test.ts --base-url=http://localhost:1234\n');
}

async function captureScreenshot(
  page: Page,
  pageName: string,
  pagePath: string,
  viewport: keyof typeof VIEWPORTS,
  theme: 'light' | 'dark',
): Promise<ScreenshotResult> {
  const fileName = `${pageName}_${viewport}_${theme}.png`;
  const filePath = join(OUT_DIR, fileName);

  try {
    await page.setViewportSize(VIEWPORTS[viewport]);

    // Set theme preference via media query emulation
    await page.emulateMedia({ colorScheme: theme });

    const response = await page.goto(`${BASE_URL}${pagePath}`, {
      waitUntil: 'networkidle',
      timeout: 15000,
    });

    const httpStatus = response?.status() ?? 0;

    // Wait a bit for animations to settle
    await page.waitForTimeout(500);

    await page.screenshot({
      path: filePath,
      fullPage: true,
    });

    return {
      page: pageName,
      viewport,
      theme,
      file: fileName,
      status: httpStatus >= 400 ? 'error' : 'ok',
      httpStatus,
    };
  } catch (err) {
    return {
      page: pageName,
      viewport,
      theme,
      file: fileName,
      status: 'error',
      error: (err as Error).message,
    };
  }
}

async function run() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`🔍 Visual regression test starting...`);
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Output: ${OUT_DIR}\n`);

  let browser: Browser;

  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    printPlaywrightDependencyHint(err);
    throw err;
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  const results: ScreenshotResult[] = [];
  const allPages = [...PUBLIC_PAGES, ...AUTH_PAGES];

  for (const { name, path } of allPages) {
    for (const viewport of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
      for (const theme of ['light', 'dark'] as const) {
        const result = await captureScreenshot(page, name, path, viewport, theme);
        results.push(result);

        const icon = result.status === 'ok' ? '✅' : '❌';
        const extra = result.httpStatus ? ` (HTTP ${result.httpStatus})` : '';
        console.log(`${icon} ${name} [${viewport}/${theme}]${extra}`);
      }
    }
  }

  await browser.close();

  // Summary
  const errors = results.filter((r) => r.status === 'error');
  const ok = results.filter((r) => r.status === 'ok');

  console.log(`\n📊 Results: ${ok.length} passed, ${errors.length} failed out of ${results.length} total`);

  if (errors.length > 0) {
    console.log('\n❌ Failed screenshots:');
    for (const e of errors) {
      console.log(`   ${e.page} [${e.viewport}/${e.theme}]: ${e.error ?? `HTTP ${e.httpStatus}`}`);
    }
  }

  console.log(`\n📁 Screenshots saved to: ${OUT_DIR}`);
  process.exit(errors.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
