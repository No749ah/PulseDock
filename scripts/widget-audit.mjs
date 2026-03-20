#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function extract(content, regex) {
  return [...content.matchAll(regex)].map((m) => m[1]);
}

const typesFile = 'apps/api/src/status-pages/status-pages.types.ts';
const editorFile = 'apps/web/app/status-pages/[id]/edit/page.tsx';
const rendererFile = 'apps/web/app/status/[slug]/widgets/index.tsx';
const resolverFile = 'apps/api/src/status-pages/status-pages.service.ts';

const widgetTypes = new Set(extract(read(typesFile), /\| '([^']+)'/g));
const paletteTypes = new Set(extract(read(editorFile), /\{\s*type:\s*"([a-z0-9-]+)"/g));
const rendererCases = new Set(extract(read(rendererFile), /case "([a-z0-9-]+)":/g));
const resolverCases = new Set(
  extract(read(resolverFile), /case '([a-z0-9-]+)'/g).filter(
    (value) => !['24h', '30d', '90d'].includes(value),
  ),
);

const allowedResolverMissing = new Set([
  'active-incident-banner',
  'changelog-widget',
  'code-block',
  'collapsible-section',
  'data-table',
  'divider',
  'image-banner',
  'maintenance-calendar',
  'multi-monitor-status-grid',
  'multi-status-badges',
  'rss-feed-widget',
  'tab-container',
  'text-block',
  'update-summary',
  'version-check-badge',
  'video-embed',
]);

function diff(a, b) {
  return [...a].filter((item) => !b.has(item)).sort();
}

const missingFromPalette = diff(widgetTypes, paletteTypes);
const missingFromRenderer = diff(widgetTypes, rendererCases);
const missingFromResolver = diff(widgetTypes, resolverCases);
const unexpectedResolverMissing = missingFromResolver.filter(
  (item) => !allowedResolverMissing.has(item),
);

const report = {
  generatedAt: new Date().toISOString(),
  counts: {
    widgetTypes: widgetTypes.size,
    paletteTypes: paletteTypes.size,
    rendererCases: rendererCases.size,
    resolverCases: resolverCases.size,
  },
  missingFromPalette,
  missingFromRenderer,
  missingFromResolver,
  unexpectedResolverMissing,
  allowedResolverMissing: [...allowedResolverMissing].sort(),
};

const outDir = path.join(ROOT, 'artifacts', 'widget-audit');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(report, null, 2));

console.log('Widget Audit Report');
console.log(`- Widget types: ${report.counts.widgetTypes}`);
console.log(`- Palette coverage missing: ${missingFromPalette.length}`);
console.log(`- Renderer coverage missing: ${missingFromRenderer.length}`);
console.log(`- Resolver coverage missing: ${missingFromResolver.length}`);
console.log(`- Unexpected resolver gaps: ${unexpectedResolverMissing.length}`);
console.log(`- Report: artifacts/widget-audit/latest.json`);

if (missingFromPalette.length || missingFromRenderer.length || unexpectedResolverMissing.length) {
  console.error('\n❌ Widget audit failed.');
  if (missingFromPalette.length) console.error(`Missing from palette: ${missingFromPalette.join(', ')}`);
  if (missingFromRenderer.length) console.error(`Missing from renderer: ${missingFromRenderer.join(', ')}`);
  if (unexpectedResolverMissing.length) {
    console.error(`Unexpected resolver gaps: ${unexpectedResolverMissing.join(', ')}`);
  }
  process.exit(1);
}

console.log('\n✅ Widget audit passed.');
