// Report-only audit of the scenario-fitted selector surface.
//
// Scans the recall selector sources for string literals carrying proper-noun
// tokens (benchmark-specific people/places/topics) and prints which files carry
// the most. This quantifies the fitted-vs-generalization gap (ADR-005) as a
// trackable metric while the surface is de-fitted. It never fails the build; it
// is a diagnostic, complementary to the hardcoded denylist enforced by the
// architecture-boundaries test.
//
// Run: bun run scripts/audit-fitted-selectors.ts

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeSelectorFitting,
  type SelectorSourceEntry,
} from "../src/eval/fittedSelectorAudit";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const SELECTOR_ROOT = join(repoRoot, "src", "recall", "selectors");
const TOP_FINDINGS = 20;

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(fullPath)));
    } else if (entry.isFile() && fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main(): Promise<void> {
  const files = await collectTypeScriptFiles(SELECTOR_ROOT);
  const entries: SelectorSourceEntry[] = await Promise.all(
    files.map(async (file) => ({
      path: relative(repoRoot, file),
      source: await readFile(file, "utf8"),
    })),
  );

  const report = analyzeSelectorFitting(entries);
  console.log("Fitted-selector audit (report-only)");
  console.log(`  scanned files:            ${report.totalFiles}`);
  console.log(`  files with proper nouns:  ${report.fittedFiles}`);
  console.log(`  proper-noun literals:     ${report.totalProperNounLiterals}`);
  console.log("");
  console.log(`Top ${Math.min(TOP_FINDINGS, report.findings.length)} fitted files:`);
  for (const finding of report.findings.slice(0, TOP_FINDINGS)) {
    console.log(
      `  ${finding.properNounLiterals.length.toString().padStart(3)}  ${finding.path}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
