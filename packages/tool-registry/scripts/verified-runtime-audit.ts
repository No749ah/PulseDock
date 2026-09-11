import fs from 'fs';
import path from 'path';
import { TOOL_REGISTRY } from '../src/registry';
import type { ToolRegistryEntry, VersionSource } from '../src/types';

interface VerificationIssueReport {
  generatedAt: string;
  totals: {
    entries: number;
    verifiedFlag: number;
    verificationStatusVerified: number;
    requiresInstanceUrl: number;
  };
  byVerificationStatus: Record<string, number>;
  missingEvidenceForVerified: string[];
  missingLastVerifiedAtForVerified: string[];
  missingVerifiedOnVersionForVerified: string[];
  missingAuthMetadataForInstanceVersionSource: string[];
  categoriesWithUnverifiedCount: Array<{ category: string; count: number }>;
}

function collectSources(entry: ToolRegistryEntry): VersionSource[] {
  const sources: VersionSource[] = [entry.versionSource, entry.latestSource];

  if (entry.versionSourceFallbacks?.length) {
    sources.push(...entry.versionSourceFallbacks);
  }

  if (entry.variants?.length) {
    for (const variant of entry.variants) {
      if (variant.versionSource) sources.push(variant.versionSource);
      if (variant.latestSource) sources.push(variant.latestSource);
    }
  }

  return sources;
}

function sourceRequiresInstanceUrl(source: VersionSource): boolean {
  return Boolean(source.urlTemplate?.includes('{{instanceUrl}}'));
}

function hasEvidence(entry: ToolRegistryEntry): boolean {
  return Boolean(entry.docsUrl || entry.evidenceUrl);
}

function buildReport(): VerificationIssueReport {
  const byVerificationStatus = TOOL_REGISTRY.reduce<Record<string, number>>((acc, entry) => {
    const key = entry.verificationStatus ?? 'unset';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const verifiedEntries = TOOL_REGISTRY.filter(
    (entry) => entry.verified && entry.verificationStatus === 'verified',
  );

  const missingEvidenceForVerified = verifiedEntries
    .filter((entry) => !hasEvidence(entry))
    .map((entry) => entry.id)
    .sort();

  const missingLastVerifiedAtForVerified = verifiedEntries
    .filter((entry) => !entry.lastVerifiedAt)
    .map((entry) => entry.id)
    .sort();

  const missingVerifiedOnVersionForVerified = verifiedEntries
    .filter((entry) => !entry.verifiedOnVersion)
    .map((entry) => entry.id)
    .sort();

  const missingAuthMetadataForInstanceVersionSource = TOOL_REGISTRY
    .filter((entry) =>
      collectSources(entry).some((source) => sourceRequiresInstanceUrl(source) && source.authRequired === undefined),
    )
    .map((entry) => entry.id)
    .sort();

  const categoryUnverifiedMap = TOOL_REGISTRY.reduce<Map<string, number>>((acc, entry) => {
    if (entry.verificationStatus !== 'verified') {
      acc.set(entry.category, (acc.get(entry.category) ?? 0) + 1);
    }
    return acc;
  }, new Map<string, number>());

  const sortedCategories = [...categoryUnverifiedMap.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      entries: TOOL_REGISTRY.length,
      verifiedFlag: TOOL_REGISTRY.filter((entry) => entry.verified).length,
      verificationStatusVerified: TOOL_REGISTRY.filter((entry) => entry.verificationStatus === 'verified').length,
      requiresInstanceUrl: TOOL_REGISTRY.filter((entry) => entry.requiresInstanceUrl).length,
    },
    byVerificationStatus,
    missingEvidenceForVerified,
    missingLastVerifiedAtForVerified,
    missingVerifiedOnVersionForVerified,
    missingAuthMetadataForInstanceVersionSource,
    categoriesWithUnverifiedCount: sortedCategories,
  };
}

function printSummary(report: VerificationIssueReport): void {
  console.log('\n🔍 PulseDock Verified Runtime Audit');
  console.log('─'.repeat(52));
  console.log(`Entries: ${report.totals.entries}`);
  console.log(`verified=true: ${report.totals.verifiedFlag}`);
  console.log(`verificationStatus=verified: ${report.totals.verificationStatusVerified}`);
  console.log(`requiresInstanceUrl: ${report.totals.requiresInstanceUrl}`);
  console.log(`Missing evidence (verified): ${report.missingEvidenceForVerified.length}`);
  console.log(`Missing lastVerifiedAt (verified): ${report.missingLastVerifiedAtForVerified.length}`);
  console.log(`Missing verifiedOnVersion (verified): ${report.missingVerifiedOnVersionForVerified.length}`);
  console.log(`Missing auth metadata on instance-url sources: ${report.missingAuthMetadataForInstanceVersionSource.length}`);

  const topCategories = report.categoriesWithUnverifiedCount.slice(0, 10);
  if (topCategories.length > 0) {
    console.log('\nTop categories by unverified entry count:');
    for (const row of topCategories) {
      console.log(`- ${row.category}: ${row.count}`);
    }
  }
}

function main(): void {
  const report = buildReport();
  printSummary(report);

  const outputPath = path.resolve(__dirname, '../audit/verified-runtime-audit.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\n📝 Wrote audit report: ${outputPath}`);
}

main();
