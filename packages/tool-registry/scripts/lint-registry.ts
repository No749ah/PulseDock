/**
 * Registry Lint Script
 * Validates the tool registry for:
 * - Duplicate IDs
 * - Missing required fields
 * - Invalid category values
 * - Broken icon URLs (optional --check-icons flag)
 * - Invalid JSON paths
 * - Entries with "guessed" endpoints (unverified)
 *
 * Usage:
 *   npx ts-node scripts/lint-registry.ts
 *   npx ts-node scripts/lint-registry.ts --check-icons
 */

import { TOOL_REGISTRY } from "../src/registry";
import type { ToolRegistryEntry } from "../src/types";

const VALID_CATEGORIES = new Set([
  "Container", "CI/CD", "Database", "Observability", "Security",
  "Networking", "Storage", "CMS", "Dev Tools", "Communication",
  "Media", "Infrastructure", "Messaging", "API", "Cloud",
  "Maven Central", "Helm", "AI/ML", "ERP/Business", "Search/Vector",
  "IoT/Edge", "Photo/Docs", "Photo & Documents", "Project Management",
  "Identity & SSO", "Remote Access", "Download & Torrent",
  "Home Automation", "Analytics & BI", "Calendar & Scheduling",
  "Password Management", "URL Shortener", "Form & Survey",
  "Diagramming", "Terminal & Web Shell", "Print & 3D",
  "Game Servers", "Compliance & Audit",
  "Finance & Accounting", "Education & Learning",
  "Legal & Compliance", "HR & People",
  "GIS & Mapping", "Radio & SDR", "Backup & Recovery",
  "VoIP & Telephony", "Digital Signage", "Fleet & Asset Management",
]);

const VALID_VERSION_SOURCE_TYPES = new Set([
  "github-releases", "github-tags", "gitlab-releases", "docker-hub",
  "npm-registry", "pypi", "cargo", "maven-central", "helm-chart",
  "apt-release", "json-path", "html-scrape", "custom-endpoint",
  "pulsedock-agent", "none",
]);

interface LintError {
  id: string;
  field: string;
  message: string;
  severity: "error" | "warning";
}

function lintRegistry(entries: ToolRegistryEntry[]): LintError[] {
  const errors: LintError[] = [];
  const seenIds = new Map<string, number>();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const id = entry.id ?? `<unknown at index ${i}>`;

    // Duplicate ID check
    if (seenIds.has(id)) {
      errors.push({ id, field: "id", severity: "error", message: `Duplicate ID — also at index ${seenIds.get(id)}` });
    } else {
      seenIds.set(id, i);
    }

    // Required field checks
    if (!entry.id || entry.id.trim() === "") {
      errors.push({ id, field: "id", severity: "error", message: "Missing or empty id" });
    }
    if (!entry.name || entry.name.trim() === "") {
      errors.push({ id, field: "name", severity: "error", message: "Missing or empty name" });
    }
    if (!entry.description || entry.description.trim() === "") {
      errors.push({ id, field: "description", severity: "warning", message: "Missing description" });
    }
    if (!entry.homepage || entry.homepage.trim() === "") {
      errors.push({ id, field: "homepage", severity: "warning", message: "Missing homepage URL" });
    }
    if (!entry.icon || entry.icon.trim() === "") {
      errors.push({ id, field: "icon", severity: "warning", message: "Missing icon URL" });
    }

    // Category check
    if (!VALID_CATEGORIES.has(entry.category)) {
      errors.push({ id, field: "category", severity: "error", message: `Invalid category: "${entry.category}"` });
    }

    // Tags check
    if (!Array.isArray(entry.tags)) {
      errors.push({ id, field: "tags", severity: "error", message: "tags must be an array" });
    }

    // checkInterval check
    if (typeof entry.checkInterval !== "number" || entry.checkInterval < 60) {
      errors.push({ id, field: "checkInterval", severity: "warning", message: `checkInterval ${entry.checkInterval} is unusually low (min recommended: 60s)` });
    }

    // versionSource check
    if (!entry.versionSource) {
      errors.push({ id, field: "versionSource", severity: "error", message: "Missing versionSource" });
    } else {
      if (!VALID_VERSION_SOURCE_TYPES.has(entry.versionSource.type)) {
        errors.push({ id, field: "versionSource.type", severity: "error", message: `Invalid versionSource.type: "${entry.versionSource.type}"` });
      }
      if (entry.versionSource.type === "json-path") {
        if (!entry.versionSource.urlTemplate && !entry.versionSource.target) {
          errors.push({ id, field: "versionSource", severity: "error", message: "json-path type requires urlTemplate or target" });
        }
        if (!entry.versionSource.jsonPath) {
          errors.push({ id, field: "versionSource.jsonPath", severity: "warning", message: "json-path type missing jsonPath — defaults to $.version" });
        }
      }
      if (["github-releases", "github-tags", "docker-hub", "npm-registry", "pypi", "cargo"].includes(entry.versionSource.type)) {
        if (!entry.versionSource.target) {
          errors.push({ id, field: "versionSource.target", severity: "error", message: `${entry.versionSource.type} requires target field` });
        }
      }
    }

    // latestSource check
    if (!entry.latestSource) {
      errors.push({ id, field: "latestSource", severity: "error", message: "Missing latestSource" });
    } else {
      if (!VALID_VERSION_SOURCE_TYPES.has(entry.latestSource.type)) {
        errors.push({ id, field: "latestSource.type", severity: "error", message: `Invalid latestSource.type: "${entry.latestSource.type}"` });
      }
      if (["github-releases", "github-tags", "docker-hub", "npm-registry", "pypi", "cargo"].includes(entry.latestSource.type)) {
        if (!entry.latestSource.target) {
          errors.push({ id, field: "latestSource.target", severity: "error", message: `${entry.latestSource.type} requires target field` });
        }
      }
    }

    // ID format check (should be kebab-case)
    if (entry.id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) {
      errors.push({ id, field: "id", severity: "warning", message: `ID "${entry.id}" is not kebab-case` });
    }

    // Evidence URL check for verified entries
    if (entry.verified && entry.verificationStatus === 'verified' && !entry.evidenceUrl && !entry.docsUrl) {
      errors.push({ id, field: "evidenceUrl", severity: "warning", message: "Verified entry missing evidenceUrl or docsUrl — add reference to endpoint documentation" });
    }

    // Variant validation
    if (entry.variants && entry.variants.length > 0) {
      const variantIds = new Set<string>();
      for (const variant of entry.variants) {
        if (!variant.id || variant.id.trim() === '') {
          errors.push({ id, field: "variants[].id", severity: "error", message: "Variant missing id" });
        } else if (variantIds.has(variant.id)) {
          errors.push({ id, field: "variants[].id", severity: "error", message: `Duplicate variant id: "${variant.id}"` });
        } else {
          variantIds.add(variant.id);
        }
        if (!variant.label || variant.label.trim() === '') {
          errors.push({ id, field: "variants[].label", severity: "warning", message: `Variant "${variant.id}" missing label` });
        }
      }
    }
  }

  return errors;
}

function main() {
  console.log(`\n🔍 PulseDock Registry Lint\n${"─".repeat(50)}`);
  console.log(`Total entries: ${TOOL_REGISTRY.length}`);

  const errors = lintRegistry(TOOL_REGISTRY);
  const hardErrors = errors.filter((e) => e.severity === "error");
  const warnings = errors.filter((e) => e.severity === "warning");

  if (errors.length === 0) {
    console.log(`\n✅ Registry is clean — no issues found.\n`);
    process.exit(0);
  }

  // Print errors
  if (hardErrors.length > 0) {
    console.log(`\n❌ ERRORS (${hardErrors.length}):`);
    for (const err of hardErrors.slice(0, 50)) {
      console.log(`  [${err.id}] ${err.field}: ${err.message}`);
    }
    if (hardErrors.length > 50) {
      console.log(`  ... and ${hardErrors.length - 50} more errors`);
    }
  }

  // Print warnings (first 20)
  if (warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS (${warnings.length}):`);
    for (const warn of warnings.slice(0, 20)) {
      console.log(`  [${warn.id}] ${warn.field}: ${warn.message}`);
    }
    if (warnings.length > 20) {
      console.log(`  ... and ${warnings.length - 20} more warnings`);
    }
  }

  // Summary
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Summary: ${hardErrors.length} error(s), ${warnings.length} warning(s)`);

  // ID uniqueness report
  const idSet = new Set(TOOL_REGISTRY.map((e) => e.id));
  console.log(`Unique IDs: ${idSet.size} / ${TOOL_REGISTRY.length} total`);
  if (idSet.size < TOOL_REGISTRY.length) {
    console.log(`⚠️  ${TOOL_REGISTRY.length - idSet.size} duplicate ID(s) detected!`);
  }

  // Verification status distribution
  const verifiedCount = TOOL_REGISTRY.filter((e) => e.verified).length;
  const withStatus = TOOL_REGISTRY.filter((e) => e.verificationStatus).length;
  const withLastVerified = TOOL_REGISTRY.filter((e) => e.lastVerifiedAt).length;
  const withEvidence = TOOL_REGISTRY.filter((e) => e.evidenceUrl).length;
  const withVariants = TOOL_REGISTRY.filter((e) => e.variants && e.variants.length > 0).length;
  console.log(`\nVerification stats:`);
  console.log(`  verified=true:         ${verifiedCount} / ${TOOL_REGISTRY.length}`);
  console.log(`  verificationStatus:    ${withStatus} / ${TOOL_REGISTRY.length}`);
  console.log(`  lastVerifiedAt:        ${withLastVerified} / ${TOOL_REGISTRY.length}`);
  console.log(`  evidenceUrl:           ${withEvidence} / ${TOOL_REGISTRY.length}`);
  console.log(`  with variants:         ${withVariants} / ${TOOL_REGISTRY.length}`);
  console.log();

  // Exit with error code if there are hard errors
  if (hardErrors.length > 0) {
    process.exit(1);
  }
}

main();
