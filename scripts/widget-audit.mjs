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

function extractSetBody(content, name) {
  const match = content.match(new RegExp(`const\\s+${name}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  return match?.[1] ?? '';
}

function extractNoConfigResolverTypes(content) {
  const lines = content.split('\n');
  const noConfigTypes = new Set();
  let activeCases = [];

  for (const line of lines) {
    const caseMatch = line.match(/case '([^']+)'\s*:/);
    if (caseMatch) {
      activeCases.push(caseMatch[1]);
      continue;
    }

    const hasBreak = line.includes('break;') || line.includes('return ');
    if (hasBreak && !line.includes('_noConfig')) {
      activeCases = [];
    }

    if (line.includes('return { _noConfig: true }')) {
      for (const widgetType of activeCases) {
        noConfigTypes.add(widgetType);
      }
      activeCases = [];
    }
  }

  return noConfigTypes;
}

const typesFile = 'apps/api/src/status-pages/status-pages.types.ts';
const editorFile = 'apps/web/app/status-pages/[id]/edit/page.tsx';
const constantsFile = 'apps/web/app/status-pages/[id]/edit/components/constants.ts';
const rendererFile = 'apps/web/app/status/[slug]/widgets/index.tsx';
const resolverFile = 'apps/api/src/status-pages/status-pages.service.ts';
const resolverDir = 'apps/api/src/status-pages/resolvers';

const typesContent = read(typesFile);
const editorContent = read(editorFile);
const constantsContent = fs.existsSync(path.join(ROOT, constantsFile)) ? read(constantsFile) : '';
const rendererContent = read(rendererFile);
const resolverContent = [
  fs.existsSync(path.join(ROOT, resolverFile)) ? read(resolverFile) : '',
  ...fs.readdirSync(path.join(ROOT, resolverDir))
    .filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map(f => read(path.join(resolverDir, f)))
].join('\n');

const widgetTypes = new Set(extract(typesContent, /\| '([^']+)'/g));
// Check palette types in both page.tsx (inline) and constants.ts (WIDGET_PALETTE array)
const paletteTypesInPage = new Set(extract(editorContent, /\{\s*type:\s*"([a-z0-9-]+)"/g));
const paletteTypesInConstants = new Set(extract(constantsContent, /type:\s*"([a-z0-9-]+)"/g));
const paletteTypes = new Set([...paletteTypesInPage, ...paletteTypesInConstants]);
const rendererCases = new Set(extract(rendererContent, /case "([a-z0-9-]+)":/g));
const resolverCases = new Set(
  extract(resolverContent, /case '([a-z0-9-]+)'/g).filter(
    (value) => !['24h', '30d', '90d'].includes(value),
  ),
);

const allowedResolverMissing = new Set([]);

const noConfigResolverTypes = extractNoConfigResolverTypes(resolverContent);
// Config warning coverage: check both page.tsx and constants.ts for NEEDS_MONITOR* sets
const combinedEditorContent = editorContent + '\n' + constantsContent;
const configWarningCoveredTypes = new Set([
  ...extract(extractSetBody(combinedEditorContent, 'NEEDS_MONITOR_TYPES'), /'([^']+)'/g),
  ...extract(extractSetBody(combinedEditorContent, 'NEEDS_MONITORS_TYPES'), /'([^']+)'/g),
  ...extract(extractSetBody(combinedEditorContent, 'NO_MONITOR_NEEDED_TYPES'), /'([^']+)'/g),
  ...extract(editorContent, /widget\.type === "([a-z0-9-]+)"/g),
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
const noConfigMissingWarnings = diff(noConfigResolverTypes, configWarningCoveredTypes);

const report = {
  generatedAt: new Date().toISOString(),
  counts: {
    widgetTypes: widgetTypes.size,
    paletteTypes: paletteTypes.size,
    rendererCases: rendererCases.size,
    resolverCases: resolverCases.size,
    noConfigResolverTypes: noConfigResolverTypes.size,
    configWarningCoveredTypes: configWarningCoveredTypes.size,
  },
  missingFromPalette,
  missingFromRenderer,
  missingFromResolver,
  unexpectedResolverMissing,
  noConfigMissingWarnings,
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
console.log(`- Missing editor warnings for _noConfig widgets: ${noConfigMissingWarnings.length}`);
console.log('- Report: artifacts/widget-audit/latest.json');

if (missingFromPalette.length || missingFromRenderer.length || unexpectedResolverMissing.length || noConfigMissingWarnings.length) {
  console.error('\n❌ Widget audit failed.');
  if (missingFromPalette.length) console.error(`Missing from palette: ${missingFromPalette.join(', ')}`);
  if (missingFromRenderer.length) console.error(`Missing from renderer: ${missingFromRenderer.join(', ')}`);
  if (unexpectedResolverMissing.length) {
    console.error(`Unexpected resolver gaps: ${unexpectedResolverMissing.join(', ')}`);
  }
  if (noConfigMissingWarnings.length) {
    console.error(`Missing editor warnings for _noConfig widget types: ${noConfigMissingWarnings.join(', ')}`);
  }
  process.exit(1);
}

console.log('\n✅ Widget audit passed.');
