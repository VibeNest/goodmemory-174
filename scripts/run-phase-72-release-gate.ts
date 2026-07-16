import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { resolveCliFlagValueStrict } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

interface ScoreTriple {
  extractionF1: number;
  questionAnsweringAccuracy: number;
  updateAccuracy: number;
}

export interface Phase72ReleaseMetrics {
  beam: {
    evidenceRecall: number;
    executionFailures: number;
    officialJudgeFailures: number;
    officialPaperScore: number;
    officialRubricItems: number;
    officialUnifiedScore: number;
    publicReferenceScore: number;
    strictBinaryGateEligible: boolean;
    strictBinaryScore: number;
    totalQuestions: number;
  };
  halumem: {
    baseline: ScoreTriple;
    baselineExecutionFailures: number;
    goodmemory: ScoreTriple;
    goodmemoryExecutionFailures: number;
  };
  implicitMemBench: {
    executionFailures: number;
    score: number;
  };
  locomo: {
    executionFailures: number;
    officialJudgeFailures: number;
    officialScore: number;
    openDomainScore: number;
    strictScore: number;
  };
  longMemEval: {
    executionFailures: number;
    officialJudgeFailures: number;
    officialScore: number;
    strictScore: number;
  };
  memoryAgentBench: {
    conflictResolutionExecutionFailures: number;
    conflictResolutionScore: number;
    testTimeLearningExecutionFailures: number;
    testTimeLearningScore: number;
  };
  memgym: {
    goodmemoryExecutionFailures: number;
    goodmemoryScore: number;
    noMemoryExecutionFailures: number;
    noMemoryScore: number;
  };
  minteval: {
    executionFailures: number;
    passed: boolean;
    scored: boolean;
  };
}

interface Phase72GateCheck {
  actual: boolean | number;
  id: string;
  passed: boolean;
  target: boolean | number;
}

interface Phase72GateDiagnostic {
  actual: number;
  id: string;
  note: string;
  target: number;
}

export interface Phase72ReleaseGateEvaluation {
  blockers: string[];
  checks: Phase72GateCheck[];
  diagnostics: Phase72GateDiagnostic[];
  passed: boolean;
}

export function evaluatePhase72ReleaseGate(
  metrics: Phase72ReleaseMetrics,
): Phase72ReleaseGateEvaluation {
  const blockers: string[] = [];
  const checks: Phase72GateCheck[] = [];
  const diagnostics: Phase72GateDiagnostic[] = [];

  const atLeast = (id: string, actual: number, target: number): void => {
    const passed = actual >= target;
    checks.push({ actual, id, passed, target });
    if (!passed) {
      blockers.push(`${id}: expected >= ${target}, got ${actual}`);
    }
  };
  const equal = (
    id: string,
    actual: boolean | number,
    target: boolean | number,
  ): void => {
    const passed = actual === target;
    checks.push({ actual, id, passed, target });
    if (!passed) {
      blockers.push(`${id}: expected ${target}, got ${actual}`);
    }
  };
  const greaterThan = (id: string, actual: number, target: number): void => {
    const passed = actual > target;
    checks.push({ actual, id, passed, target });
    if (!passed) {
      blockers.push(`${id}: expected > ${target}, got ${actual}`);
    }
  };

  atLeast("longmemeval-strict", metrics.longMemEval.strictScore, 0.72);
  atLeast("longmemeval-official", metrics.longMemEval.officialScore, 0.92);
  equal(
    "longmemeval-execution-failures",
    metrics.longMemEval.executionFailures,
    0,
  );
  equal(
    "longmemeval-judge-failures",
    metrics.longMemEval.officialJudgeFailures,
    0,
  );

  atLeast("locomo-strict", metrics.locomo.strictScore, 0.61);
  atLeast("locomo-official", metrics.locomo.officialScore, 0.87);
  atLeast("locomo-open-domain", metrics.locomo.openDomainScore, 0.6);
  equal("locomo-execution-failures", metrics.locomo.executionFailures, 0);
  equal("locomo-judge-failures", metrics.locomo.officialJudgeFailures, 0);

  atLeast(
    "memoryagentbench-conflict-resolution",
    metrics.memoryAgentBench.conflictResolutionScore,
    0.95,
  );
  atLeast(
    "memoryagentbench-test-time-learning",
    metrics.memoryAgentBench.testTimeLearningScore,
    0.75,
  );
  equal(
    "memoryagentbench-conflict-resolution-execution-failures",
    metrics.memoryAgentBench.conflictResolutionExecutionFailures,
    0,
  );
  equal(
    "memoryagentbench-test-time-learning-execution-failures",
    metrics.memoryAgentBench.testTimeLearningExecutionFailures,
    0,
  );

  atLeast(
    "implicitmembench-retry-merged",
    metrics.implicitMemBench.score,
    0.69,
  );
  equal(
    "implicitmembench-execution-failures",
    metrics.implicitMemBench.executionFailures,
    0,
  );

  atLeast("beam-generalization-recall", metrics.beam.evidenceRecall, 0.8);
  atLeast(
    "beam-official-vs-public-reference",
    metrics.beam.officialUnifiedScore,
    metrics.beam.publicReferenceScore,
  );
  equal("beam-total-questions", metrics.beam.totalQuestions, 400);
  equal("beam-official-rubric-items", metrics.beam.officialRubricItems, 1051);
  equal("beam-execution-failures", metrics.beam.executionFailures, 0);
  equal("beam-judge-failures", metrics.beam.officialJudgeFailures, 0);
  if (metrics.beam.strictBinaryGateEligible) {
    atLeast("beam-strict-binary", metrics.beam.strictBinaryScore, 0.72);
  } else {
    diagnostics.push({
      actual: metrics.beam.strictBinaryScore,
      id: "beam-strict-binary-stretch",
      note: "diagnostic because the frozen event-ordering integrity audit is not eligible for a strict hard gate",
      target: 0.72,
    });
  }
  diagnostics.push(
    {
      actual: metrics.beam.officialUnifiedScore,
      id: "beam-official-unified-stretch",
      note: "retained internal stretch target; public comparability uses the same-protocol reference",
      target: 0.8,
    },
    {
      actual: metrics.beam.officialPaperScore,
      id: "beam-upstream-paper-protocol",
      note: "disclosed protocol score, not compared with the unified-rubric public reference",
      target: 0.8,
    },
  );

  equal(
    "halumem-goodmemory-execution-failures",
    metrics.halumem.goodmemoryExecutionFailures,
    0,
  );
  equal(
    "halumem-baseline-execution-failures",
    metrics.halumem.baselineExecutionFailures,
    0,
  );
  greaterThan(
    "halumem-extraction",
    metrics.halumem.goodmemory.extractionF1,
    metrics.halumem.baseline.extractionF1,
  );
  greaterThan(
    "halumem-update",
    metrics.halumem.goodmemory.updateAccuracy,
    metrics.halumem.baseline.updateAccuracy,
  );
  greaterThan(
    "halumem-question-answering",
    metrics.halumem.goodmemory.questionAnsweringAccuracy,
    metrics.halumem.baseline.questionAnsweringAccuracy,
  );

  equal(
    "memgym-goodmemory-execution-failures",
    metrics.memgym.goodmemoryExecutionFailures,
    0,
  );
  equal(
    "memgym-no-memory-execution-failures",
    metrics.memgym.noMemoryExecutionFailures,
    0,
  );
  atLeast(
    "memgym-memory-uplift",
    metrics.memgym.goodmemoryScore - metrics.memgym.noMemoryScore,
    0.05,
  );

  equal("minteval-execution-failures", metrics.minteval.executionFailures, 0);
  equal("minteval-smoke-passed", metrics.minteval.passed, true);
  equal("minteval-remains-unscored", metrics.minteval.scored, false);

  return {
    blockers,
    checks,
    diagnostics,
    passed: blockers.length === 0,
  };
}

type JsonRecord = Record<string, unknown>;

interface LoadedEvidence {
  bytes: number;
  path: string;
  sha256: string;
  value: unknown;
}

const SOURCE_PATHS = {
  beamAudit:
    "reports/quality-gates/phase-72/run-20260716-final/beam-event-ordering-integrity-audit.json",
  beamOfficial:
    "reports/eval/research/official-rescore/rescore-phase72-beam-generalized-answer-clean-full400-terra-gpt55-c40-v1/rescore-summary.json",
  beamPaper:
    "reports/eval/research/official-rescore/rescore-phase72-beam-generalized-answer-clean-full400-terra-paper-gpt55-c40-v1/rescore-summary.json",
  beamReport:
    "reports/eval/research/phase-72/beam/run-phase72-beam-generalized-answer-clean-full400-terra-gpt55-c40-v1/live-slice-report.json",
  halumem:
    "reports/eval/research/phase-72/halumem/run-20260712-halumem-local-frozen-v17/halumem-report.json",
  implicitMemBench:
    "reports/eval/research/phase-72/implicitmembench-retry/run-phase72-full300-terra-gpt54-logiql-retry-merged-v3/overall-report.json",
  locomoOfficial:
    "reports/eval/research/official-rescore/phase72-locomo-production-listwise-temporal-bounded-full1540-terra-v2-gpt55/rescore-summary.json",
  locomoReport:
    "reports/eval/research/phase-72/locomo/run-phase72-locomo-production-listwise-temporal-bounded-full1540-terra-v2/smoke-report.json",
  longMemEvalOfficial:
    "reports/eval/research/official-rescore/rescore-phase72-longmemeval-promoted-verifier-final500-terra-gpt55-v1/rescore-summary.json",
  longMemEvalReport:
    "reports/eval/research/phase-72/longmemeval/run-phase72-longmemeval-verifier-chain-full500-terra-v1/report.json",
  memoryAgentBenchConflict:
    "reports/eval/research/phase-72/mab/run-phase72-mab-generalized-cr-terra/smoke-report.json",
  memoryAgentBenchTtl:
    "reports/eval/research/phase-72/mab/run-phase72-mab-generalized-ttl-terra/smoke-report.json",
  memgym:
    "reports/eval/research/phase-72/memgym/run-20260712-memgym-fixed4-v1/memgym-report.json",
  minteval:
    "reports/eval/research/phase-72/minteval/run-20260712-minteval-state-tracking-smoke-v1/minteval-smoke-report.json",
} as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPath(value: unknown, path: readonly (number | string)[]): unknown {
  let current = value;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current)) {
        throw new Error(`Expected array at ${path.join(".")}.`);
      }
      current = current[segment];
      continue;
    }
    if (!isRecord(current)) {
      throw new Error(`Expected object at ${path.join(".")}.`);
    }
    current = current[segment];
  }
  return current;
}

function numberAt(value: unknown, path: readonly (number | string)[]): number {
  const result = readPath(value, path);
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error(`Expected finite number at ${path.join(".")}.`);
  }
  return result;
}

function booleanAt(value: unknown, path: readonly (number | string)[]): boolean {
  const result = readPath(value, path);
  if (typeof result !== "boolean") {
    throw new Error(`Expected boolean at ${path.join(".")}.`);
  }
  return result;
}

function findCompetencyScore(value: unknown, competency: string): number {
  const competencies = readPath(value, ["competencies"]);
  if (!Array.isArray(competencies)) {
    throw new Error("MemoryAgentBench competencies must be an array.");
  }
  const row = competencies.find(
    (entry) => isRecord(entry) && entry.competency === competency,
  );
  if (!row) {
    throw new Error(`MemoryAgentBench competency ${competency} is missing.`);
  }
  return numberAt(row, ["answerAccuracy"]);
}

async function loadEvidence(
  repoRoot: string,
  relativePath: string,
): Promise<LoadedEvidence> {
  const bytes = await readFile(join(repoRoot, relativePath));
  return {
    bytes: bytes.byteLength,
    path: relativePath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    value: JSON.parse(bytes.toString("utf8")),
  };
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRootFromScriptUrl(import.meta.url);
  const sources: Partial<Record<keyof typeof SOURCE_PATHS, LoadedEvidence>> = {};
  for (const [name, path] of Object.entries(SOURCE_PATHS)) {
    sources[name as keyof typeof SOURCE_PATHS] = await loadEvidence(repoRoot, path);
  }
  const source = (name: keyof typeof SOURCE_PATHS): unknown => {
    const loaded = sources[name];
    if (!loaded) {
      throw new Error(`Phase 72 source ${name} is missing.`);
    }
    return loaded.value;
  };

  const halumemComparison = readPath(source("halumem"), [
    "officialProtocol",
    "comparison",
  ]);
  const metrics: Phase72ReleaseMetrics = {
    beam: {
      evidenceRecall: numberAt(source("beamReport"), [
        "summary",
        "evidenceChatRecall",
      ]),
      executionFailures: numberAt(source("beamReport"), [
        "summary",
        "executionFailures",
      ]),
      officialJudgeFailures: numberAt(source("beamOfficial"), ["judgeFailures"]),
      officialPaperScore: numberAt(source("beamPaper"), [
        "overallMacroByAbility",
      ]),
      officialRubricItems: numberAt(source("beamOfficial"), [
        "selectedRubricItems",
      ]),
      officialUnifiedScore: numberAt(source("beamOfficial"), [
        "overallMicroByQuestion",
      ]),
      publicReferenceScore: 0.49,
      strictBinaryGateEligible: booleanAt(source("beamAudit"), [
        "audit",
        "summary",
        "strictBinaryGateEligible",
      ]),
      strictBinaryScore:
        numberAt(source("beamReport"), ["summary", "correctCases"]) /
        numberAt(source("beamReport"), ["summary", "totalCases"]),
      totalQuestions: numberAt(source("beamReport"), ["summary", "totalCases"]),
    },
    halumem: {
      baseline: {
        extractionF1: numberAt(halumemComparison, [
          "baseline",
          "extractionF1",
        ]),
        questionAnsweringAccuracy: numberAt(halumemComparison, [
          "baseline",
          "questionAnsweringAccuracy",
        ]),
        updateAccuracy: numberAt(halumemComparison, [
          "baseline",
          "updateAccuracy",
        ]),
      },
      baselineExecutionFailures: numberAt(halumemComparison, [
        "baseline",
        "executionFailures",
      ]),
      goodmemory: {
        extractionF1: numberAt(halumemComparison, [
          "goodmemory",
          "extractionF1",
        ]),
        questionAnsweringAccuracy: numberAt(halumemComparison, [
          "goodmemory",
          "questionAnsweringAccuracy",
        ]),
        updateAccuracy: numberAt(halumemComparison, [
          "goodmemory",
          "updateAccuracy",
        ]),
      },
      goodmemoryExecutionFailures: numberAt(halumemComparison, [
        "goodmemory",
        "executionFailures",
      ]),
    },
    implicitMemBench: {
      executionFailures: numberAt(source("implicitMemBench"), [
        "profiles",
        "goodmemory-distilled-feedback+controlled-priming",
        "executionFailures",
      ]),
      score: numberAt(source("implicitMemBench"), [
        "profiles",
        "goodmemory-distilled-feedback+controlled-priming",
        "full300OverallScore",
        "rate",
      ]),
    },
    locomo: {
      executionFailures: numberAt(source("locomoReport"), ["executionFailures"]),
      officialJudgeFailures: numberAt(source("locomoOfficial"), [
        "judgeFailures",
      ]),
      officialScore: numberAt(source("locomoOfficial"), ["overallAccuracy"]),
      openDomainScore: numberAt(source("locomoOfficial"), [
        "categories",
        "open_domain",
        "accuracy",
      ]),
      strictScore: numberAt(source("locomoReport"), ["answerAccuracyOverall"]),
    },
    longMemEval: {
      executionFailures: numberAt(source("longMemEvalReport"), [
        "summary",
        "executionFailures",
      ]),
      officialJudgeFailures: numberAt(source("longMemEvalOfficial"), [
        "judgeFailures",
      ]),
      officialScore: numberAt(source("longMemEvalOfficial"), [
        "overallAccuracy",
      ]),
      strictScore: numberAt(source("longMemEvalReport"), [
        "profiles",
        "goodmemory-recommended",
        "summary",
        "accuracy",
      ]),
    },
    memoryAgentBench: {
      conflictResolutionExecutionFailures: numberAt(
        source("memoryAgentBenchConflict"),
        ["executionFailures"],
      ),
      conflictResolutionScore: findCompetencyScore(
        source("memoryAgentBenchConflict"),
        "CR",
      ),
      testTimeLearningExecutionFailures: numberAt(
        source("memoryAgentBenchTtl"),
        ["executionFailures"],
      ),
      testTimeLearningScore: findCompetencyScore(
        source("memoryAgentBenchTtl"),
        "TTL",
      ),
    },
    memgym: {
      goodmemoryExecutionFailures: numberAt(source("memgym"), [
        "profiles",
        "goodmemory",
        "executionFailures",
      ]),
      goodmemoryScore: numberAt(source("memgym"), [
        "profiles",
        "goodmemory",
        "qaAccuracy",
      ]),
      noMemoryExecutionFailures: numberAt(source("memgym"), [
        "profiles",
        "noMemory",
        "executionFailures",
      ]),
      noMemoryScore: numberAt(source("memgym"), [
        "profiles",
        "noMemory",
        "qaAccuracy",
      ]),
    },
    minteval: {
      executionFailures: numberAt(source("minteval"), [
        "diagnostics",
        "executionFailures",
      ]),
      passed: readPath(source("minteval"), ["gate", "status"]) === "passed",
      scored: booleanAt(source("minteval"), ["scored"]),
    },
  };
  const evaluation = evaluatePhase72ReleaseGate(metrics);
  const packageJson = JSON.parse(
    await readFile(join(repoRoot, "package.json"), "utf8"),
  ) as { version?: unknown };
  const outputPath = resolve(
    repoRoot,
    resolveCliFlagValueStrict(process.argv.slice(2), "--output") ??
      "reports/quality-gates/phase-72/run-20260716-final/phase-72-release-gate.json",
  );
  const report = {
    benchmarkGate: evaluation,
    claimBoundary: {
      beam:
        "The 0.620 strict binary and 0.80 official targets remain disclosed stretch diagnostics. The hard comparable gate uses complete independent unified-rubric scoring against the 0.49 same-protocol public reference because the frozen event-ordering audit invalidates a strict hard gate for this dataset snapshot.",
      implicitMemBench:
        "The 0.6923666667 result is a disclosed retry-merged internal release check, not a replacement monolithic Full-300 public claim.",
      minteval: "Smoke-only and unscored for this release.",
    },
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/run-phase-72-release-gate.ts",
    metrics,
    packageVersion: packageJson.version,
    phase: "phase-72",
    sources: Object.fromEntries(
      Object.entries(sources).map(([name, loaded]) => [
        name,
        loaded && {
          bytes: loaded.bytes,
          path: loaded.path,
          sha256: loaded.sha256,
        },
      ]),
    ),
    status: evaluation.passed ? "passed" : "failed",
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!evaluation.passed) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}
