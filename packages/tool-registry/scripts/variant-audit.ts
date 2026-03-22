import fs from 'fs';
import path from 'path';
import { TOOL_REGISTRY } from '../src/registry';
import { TOOL_VARIANTS } from '../src/variants';

interface BaselineFile {
  generatedAt: string;
  policy: string;
  missingVerifiedRequiresInstanceUrlVariants: string[];
}

function loadBaseline(filePath: string): BaselineFile {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Baseline file not found: ${filePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<BaselineFile>;
  if (!Array.isArray(parsed.missingVerifiedRequiresInstanceUrlVariants)) {
    throw new Error('Invalid baseline format: missingVerifiedRequiresInstanceUrlVariants must be an array');
  }

  return {
    generatedAt: parsed.generatedAt ?? 'unknown',
    policy: parsed.policy ?? 'unknown',
    missingVerifiedRequiresInstanceUrlVariants: parsed.missingVerifiedRequiresInstanceUrlVariants,
  };
}

function main(): void {
  const baselinePath = path.resolve(__dirname, '../audit/variant-audit-baseline.json');
  const baseline = loadBaseline(baselinePath);

  const registryIds = new Set(TOOL_REGISTRY.map((entry) => entry.id));
  const variantToolIds = new Set(Object.keys(TOOL_VARIANTS));

  const currentMissing = TOOL_REGISTRY
    .filter((entry) => entry.verified && entry.requiresInstanceUrl && !variantToolIds.has(entry.id))
    .map((entry) => entry.id)
    .sort();

  const baselineMissing = [...baseline.missingVerifiedRequiresInstanceUrlVariants].sort();

  const currentSet = new Set(currentMissing);
  const baselineSet = new Set(baselineMissing);

  const newlyMissing = currentMissing.filter((id) => !baselineSet.has(id));
  const resolvedSinceBaseline = baselineMissing.filter((id) => !currentSet.has(id));
  const orphanVariantDefinitions = [...variantToolIds].filter((id) => !registryIds.has(id)).sort();

  console.log('\n🔎 PulseDock Variant Coverage Audit');
  console.log('─'.repeat(50));
  console.log(`Registry entries: ${TOOL_REGISTRY.length}`);
  console.log(`Variant definitions: ${variantToolIds.size}`);
  console.log(`Baseline generated at: ${baseline.generatedAt}`);
  console.log(`Baseline policy: ${baseline.policy}`);
  console.log(`Current missing (verified + requiresInstanceUrl): ${currentMissing.length}`);

  if (resolvedSinceBaseline.length > 0) {
    console.log(`✅ Resolved since baseline: ${resolvedSinceBaseline.length}`);
  }

  if (newlyMissing.length > 0) {
    console.log(`❌ New missing variant definitions detected: ${newlyMissing.length}`);
    console.log(`   ${newlyMissing.slice(0, 30).join(', ')}${newlyMissing.length > 30 ? ' ...' : ''}`);
  }

  if (orphanVariantDefinitions.length > 0) {
    console.log(`❌ Orphan variant definitions (tool id not found in registry): ${orphanVariantDefinitions.length}`);
    console.log(`   ${orphanVariantDefinitions.slice(0, 30).join(', ')}${orphanVariantDefinitions.length > 30 ? ' ...' : ''}`);
  }

  if (newlyMissing.length === 0 && orphanVariantDefinitions.length === 0) {
    console.log('✅ Variant coverage regression check passed.');
    process.exit(0);
  }

  process.exit(1);
}

main();
