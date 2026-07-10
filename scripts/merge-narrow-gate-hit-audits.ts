import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { resolveCliFlagValueStrict } from "./cli-options";

export interface NarrowGateHitAuditSource {
  runId: string;
  scale: string;
  verdicts: Array<{ caseIds: string[]; gateId: string }>;
}

export interface MergedNarrowGateHitAudit {
  generatedAt: string;
  sourceReports: Array<{ runId: string; scale: string }>;
  summary: {
    caseFitted: number;
    multiCase: number;
    totalGates: number;
    unobserved: number;
  };
  verdicts: Array<{
    caseIds: string[];
    gateId: string;
    hitCount: number;
    status: "case_fitted" | "multi_case" | "unobserved";
  }>;
}

export function mergeNarrowGateHitAudits(input: {
  generatedAt: string;
  reports: NarrowGateHitAuditSource[];
}): MergedNarrowGateHitAudit {
  if (input.reports.length === 0) {
    throw new Error("at least one narrow-gate hit audit report is required");
  }
  const sourceKeys = new Set<string>();
  let expectedGateIds: Set<string> | undefined;
  for (const report of input.reports) {
    const sourceKey = `${report.scale}:${report.runId}`;
    if (sourceKeys.has(sourceKey)) {
      throw new Error(`duplicate narrow-gate audit source ${sourceKey}`);
    }
    sourceKeys.add(sourceKey);

    const gateIds = report.verdicts.map(({ gateId }) => gateId);
    const uniqueGateIds = new Set(gateIds);
    if (uniqueGateIds.size !== gateIds.length) {
      throw new Error(`narrow-gate audit ${sourceKey} contains a duplicate gate id`);
    }
    if (expectedGateIds === undefined) {
      expectedGateIds = uniqueGateIds;
      continue;
    }
    if (
      expectedGateIds.size !== uniqueGateIds.size ||
      [...expectedGateIds].some((gateId) => !uniqueGateIds.has(gateId))
    ) {
      throw new Error("all narrow-gate audit reports must contain the same gate inventory");
    }
  }
  const caseIdsByGate = new Map<string, Set<string>>();
  for (const report of input.reports) {
    for (const verdict of report.verdicts) {
      const caseIds = caseIdsByGate.get(verdict.gateId) ?? new Set<string>();
      for (const caseId of verdict.caseIds) {
        caseIds.add(`${report.scale}:${caseId}`);
      }
      caseIdsByGate.set(verdict.gateId, caseIds);
    }
  }

  const verdicts = [...caseIdsByGate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([gateId, caseIds]) => {
      const sortedCaseIds = [...caseIds].sort();
      return {
        caseIds: sortedCaseIds,
        gateId,
        hitCount: sortedCaseIds.length,
        status: sortedCaseIds.length === 0
          ? "unobserved" as const
          : sortedCaseIds.length === 1
            ? "case_fitted" as const
            : "multi_case" as const,
      };
    });

  return {
    generatedAt: input.generatedAt,
    sourceReports: input.reports.map(({ runId, scale }) => ({ runId, scale })),
    summary: {
      caseFitted: verdicts.filter(({ status }) => status === "case_fitted").length,
      multiCase: verdicts.filter(({ status }) => status === "multi_case").length,
      totalGates: verdicts.length,
      unobserved: verdicts.filter(({ status }) => status === "unobserved").length,
    },
    verdicts,
  };
}

function readRepeatedFlag(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) {
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--") || value.trim() !== value) {
      throw new Error(`${flag} requires a non-empty unpadded value`);
    }
    values.push(value);
  }
  if (new Set(values.map((value) => resolve(value))).size !== values.length) {
    throw new Error(`${flag} paths must be unique`);
  }
  return values;
}

async function main(argv: readonly string[]): Promise<void> {
  const reportPaths = readRepeatedFlag(argv, "--report");
  if (reportPaths.length === 0) {
    throw new Error("at least one --report path is required");
  }
  const output = resolveCliFlagValueStrict(argv, "--output") ??
    "scripts/eval-profiles/legacy-fitted/gate-audit.json";
  const reports = await Promise.all(
    reportPaths.map(async (path) =>
      JSON.parse(await readFile(path, "utf8")) as NarrowGateHitAuditSource
    ),
  );
  const merged = mergeNarrowGateHitAudits({
    generatedAt: new Date().toISOString(),
    reports,
  });
  await writeFile(output, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(JSON.stringify({ output, summary: merged.summary }, null, 2));
}

if (import.meta.main) {
  await main(Bun.argv);
}
