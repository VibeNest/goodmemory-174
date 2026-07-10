import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { validateBeamRows } from "../src/eval/beam";
import {
  listNarrowGateQueryProbeIdsForInternalEval,
  listRegisteredNarrowGateIds,
  probeNarrowGatesForInternalEval,
} from "./eval-profiles/legacy-fitted/recall/narrowGates";
import "./eval-profiles/legacy-fitted/recall/selectionLegacy";
import { resolveCliFlagValueStrict } from "./cli-options";

function parseScale(value: string | undefined): "100K" | "500K" | "1M" {
  if (value === "100K" || value === "500K" || value === "1M") {
    return value;
  }
  throw new Error("--scale must be 100K, 500K, or 1M");
}

export async function probeBeamNarrowGates(input: {
  benchmarkRoot: string;
  generatedAt: string;
  runId: string;
  scale: "100K" | "500K" | "1M";
}): Promise<{
  generatedAt: string;
  runId: string;
  scale: string;
  totalCases: number;
  verdicts: Array<{
    caseIds: string[];
    gateId: string;
    hitCount: number;
    status: "case_fitted" | "multi_case" | "unobserved";
  }>;
}> {
  const registered = listRegisteredNarrowGateIds();
  const probeable = listNarrowGateQueryProbeIdsForInternalEval();
  if (registered.length !== probeable.length) {
    const probeableSet = new Set(probeable);
    throw new Error(
      `all fitted gates must expose a single-query classifier; missing: ${registered.filter((id) => !probeableSet.has(id)).join(", ")}`,
    );
  }
  const rows = validateBeamRows(
    JSON.parse(await readFile(join(input.benchmarkRoot, `${input.scale}.json`), "utf8")),
  );
  const caseIdsByGate = new Map(
    registered.map((gateId) => [gateId, new Set<string>()]),
  );
  let totalCases = 0;
  for (const row of rows) {
    for (const question of row.probingQuestions) {
      totalCases += 1;
      for (const gateId of probeNarrowGatesForInternalEval(question.question)) {
        caseIdsByGate.get(gateId)?.add(question.questionId);
      }
    }
  }

  return {
    generatedAt: input.generatedAt,
    runId: input.runId,
    scale: input.scale,
    totalCases,
    verdicts: registered.map((gateId) => {
      const caseIds = [...(caseIdsByGate.get(gateId) ?? [])].sort();
      return {
        caseIds,
        gateId,
        hitCount: caseIds.length,
        status: caseIds.length === 0
          ? "unobserved" as const
          : caseIds.length === 1
            ? "case_fitted" as const
            : "multi_case" as const,
      };
    }),
  };
}

async function main(argv: readonly string[]): Promise<void> {
  const benchmarkRoot = resolveCliFlagValueStrict(argv, "--benchmark-root");
  if (!benchmarkRoot) {
    throw new Error("--benchmark-root is required");
  }
  const scale = parseScale(resolveCliFlagValueStrict(argv, "--scale"));
  const runId = resolveCliFlagValueStrict(argv, "--run-id") ??
    `phase68-narrow-gate-query-probe-${scale.toLowerCase()}`;
  const output = resolveCliFlagValueStrict(argv, "--output") ??
    join(benchmarkRoot, `narrow-gate-query-probe-${scale}.json`);
  const report = await probeBeamNarrowGates({
    benchmarkRoot,
    generatedAt: new Date().toISOString(),
    runId,
    scale,
  });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        output,
        summary: {
          caseFitted: report.verdicts.filter(({ status }) => status === "case_fitted").length,
          multiCase: report.verdicts.filter(({ status }) => status === "multi_case").length,
          totalCases: report.totalCases,
          totalGates: report.verdicts.length,
          unobserved: report.verdicts.filter(({ status }) => status === "unobserved").length,
        },
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) {
  await main(Bun.argv);
}
