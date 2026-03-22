import fs from 'fs';
import path from 'path';

interface VerificationIssueReport {
  generatedAt: string;
  totals: {
    entries: number;
    verifiedFlag: number;
    verificationStatusVerified: number;
    requiresInstanceUrl: number;
  };
  missingEvidenceForVerified: string[];
  missingLastVerifiedAtForVerified: string[];
  missingVerifiedOnVersionForVerified: string[];
  missingAuthMetadataForInstanceVersionSource: string[];
}

interface VerifiedRuntimeBaseline {
  generatedAt: string;
  policy: string;
  thresholds: {
    maxMissingEvidenceForVerified: number;
    maxMissingLastVerifiedAtForVerified: number;
    maxMissingVerifiedOnVersionForVerified: number;
    maxMissingAuthMetadataForInstanceVersionSource: number;
  };
}

function loadJsonFile<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function main(): void {
  const auditPath = path.resolve(__dirname, '../audit/verified-runtime-audit.json');
  const baselinePath = path.resolve(__dirname, '../audit/verified-runtime-audit-baseline.json');

  const audit = loadJsonFile<VerificationIssueReport>(auditPath);
  const baseline = loadJsonFile<VerifiedRuntimeBaseline>(baselinePath);

  const checks = [
    {
      label: 'missingEvidenceForVerified',
      current: audit.missingEvidenceForVerified.length,
      allowed: baseline.thresholds.maxMissingEvidenceForVerified,
    },
    {
      label: 'missingLastVerifiedAtForVerified',
      current: audit.missingLastVerifiedAtForVerified.length,
      allowed: baseline.thresholds.maxMissingLastVerifiedAtForVerified,
    },
    {
      label: 'missingVerifiedOnVersionForVerified',
      current: audit.missingVerifiedOnVersionForVerified.length,
      allowed: baseline.thresholds.maxMissingVerifiedOnVersionForVerified,
    },
    {
      label: 'missingAuthMetadataForInstanceVersionSource',
      current: audit.missingAuthMetadataForInstanceVersionSource.length,
      allowed: baseline.thresholds.maxMissingAuthMetadataForInstanceVersionSource,
    },
  ];

  console.log('\n🔎 PulseDock Verified Runtime Regression Check');
  console.log('─'.repeat(56));
  console.log(`Audit generated at: ${audit.generatedAt}`);
  console.log(`Baseline generated at: ${baseline.generatedAt}`);
  console.log(`Policy: ${baseline.policy}`);

  const failures: string[] = [];

  for (const check of checks) {
    const status = check.current <= check.allowed ? '✅' : '❌';
    console.log(`${status} ${check.label}: ${check.current} (allowed <= ${check.allowed})`);

    if (check.current > check.allowed) {
      failures.push(
        `${check.label} exceeded threshold (${check.current} > ${check.allowed})`,
      );
    }
  }

  if (failures.length > 0) {
    console.error('\nVerified runtime regression check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('\n✅ Verified runtime regression check passed.');
}

main();
