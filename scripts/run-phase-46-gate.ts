#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase46GateOptions {
  outputDir?: string;
  qualityReportPath?: string;
  runId?: string;
  skipCommands?: boolean;
}

export interface Phase46GateCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label: string;
}

export interface Phase46GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase46GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase46GateCommand) => Promise<Phase46GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase46GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase46GateOptions) => Promise<Phase46GateReport>;
}

export interface Phase46QualityReportEvidence {
  artifactKind: "ignored_generated";
  ignoredReportPath: string;
  reason: string;
  regenerateCommand: string;
  status: "accepted" | "blocked";
}

export interface Phase46GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Array<Phase46GateCommandResult & { label: string }>;
  evidence: {
    docsAligned: boolean;
    noRootApiWidening: boolean;
    packageScriptsRegistered: boolean;
    qualityReport: Phase46QualityReportEvidence;
    qualityReportMetrics: {
      failureSampleCount: number;
      maintenanceGuardrailCount: number;
      observedFailureSampleCount: number;
      overRememberingDemotedCount: number;
      providerBackedPromotionSeparated: boolean;
      repairPassCount: number;
      staleRepairDemotedCount: number;
    };
    qualityRepairBoundary: boolean;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-46-gate.ts";
  outputDir: string;
  phase: "phase-46";
  runDirectory: string;
  runId: string;
}

interface Phase46QualityReportSnapshot {
  acceptance?: {
    decision?: unknown;
  };
  diagnosis?: {
    providerBackedPromotionSeparated?: unknown;
    rulesOnlyFailureSampleIds?: unknown;
  };
  failureSamples?: unknown;
  generatedBy?: unknown;
  guardedRepairScenarios?: unknown;
  inputs?: {
    phase45AdoptionReport?: {
      reportPath?: unknown;
      runId?: unknown;
      status?: unknown;
    };
  };
  metrics?: {
    failureSampleCount?: unknown;
    maintenanceGuardrailCount?: unknown;
    observedFailureSampleCount?: unknown;
    overRememberingDemotedCount?: unknown;
    providerBackedPromotionSeparated?: unknown;
    repairPassCount?: unknown;
    staleRepairDemotedCount?: unknown;
  };
  mode?: unknown;
  phase?: unknown;
  rawTranscriptPersistence?: {
    persistedRawTranscripts?: unknown;
  };
  repairs?: unknown;
  runId?: unknown;
  scope?: {
    outOfScope?: unknown;
  };
}

interface ParsedPhase46QualityReport {
  acceptance: { decision: "accepted" | "blocked" };
  failureSamples: Array<{
    baselineObservedFailure?: unknown;
    label?: unknown;
    sampleId?: unknown;
  }>;
  guardedRepairScenarios: Array<{
    family?: unknown;
    observedPhase45Failure?: unknown;
    scenarioId?: unknown;
  }>;
  inputs: {
    phase45AdoptionReport: {
      reportPath: string;
      runId: string;
      status: "accepted" | "blocked";
    };
  };
  metrics: {
    failureSampleCount: number;
    maintenanceGuardrailCount: number;
    observedFailureSampleCount: number;
    overRememberingDemotedCount: number;
    providerBackedPromotionSeparated: boolean;
    repairPassCount: number;
    staleRepairDemotedCount: number;
  };
  repairs: Array<{
    evidenceKind?: unknown;
    family?: unknown;
    status?: unknown;
  }>;
  runId: typeof CANONICAL_PHASE46_QUALITY_RUN_ID;
}

const GENERATED_BY = "scripts/run-phase-46-gate.ts";
const CANONICAL_PHASE45_ADOPTION_RUN_ID = "run-20260427104530-adoption-eval";
const CANONICAL_PHASE46_QUALITY_RUN_ID = "run-20260427123000-quality-eval";
const CANONICAL_PHASE45_ADOPTION_REPORT_RELATIVE_PATH = join(
  "reports/eval/adoption/phase-45",
  CANONICAL_PHASE45_ADOPTION_RUN_ID,
  "report.json",
);

export function resolvePhase46GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-46");
}

export function resolvePhase46CanonicalQualityReportPath(root: string): string {
  return join(
    root,
    "reports/eval/fallback/phase-46",
    CANONICAL_PHASE46_QUALITY_RUN_ID,
    "report.json",
  );
}

function normalizeRepoRelativePath(root: string, path: string): string {
  return isAbsolute(path) ? relative(root, path) : path;
}

export function buildPhase46GateRunId(nowIso: string): string {
  return `run-${nowIso.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "")}`;
}

export function parsePhase46GateCliOptions(
  argv: readonly string[],
): Phase46GateOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    qualityReportPath: resolveCliFlagValue(argv, "--quality-report-path"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    skipCommands: argv.includes("--skip-commands"),
  };
}

export function buildPhase46GateCommands(root: string): Phase46GateCommand[] {
  return [
    {
      args: ["bun", "run", "typecheck"],
      cwd: root,
      label: "typecheck",
    },
    {
      args: [
        "bun",
        "test",
        "tests/unit/run-phase-46.quality-eval.test.ts",
        "tests/unit/run-phase-46-gate.test.ts",
        "tests/integration/maintenance.runner.test.ts",
        "tests/integration/maintenance.api.test.ts",
        "tests/integration/recall.touch-helpers.test.ts",
        "tests/integration/recall.outcome-scoring.test.ts",
        "tests/eval/runners.test.ts",
        "--test-name-pattern",
        "run-phase-46|qualityRepair|maintenance|verification pressure|stale action-driving|same recall raises|unsurfaced|caps persisted",
      ],
      cwd: root,
      label: "phase-46-quality-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-46",
        "--run-id",
        CANONICAL_PHASE46_QUALITY_RUN_ID,
      ],
      cwd: root,
      label: "phase-46-quality-eval",
    },
    {
      args: [
        "bun",
        "test",
        "tests/release/release.test.ts",
        "--test-name-pattern",
        "phase-46|package metadata exposes bin|current status doc points|task-board current note|root exports stay aligned|models fallback eval evidence",
      ],
      cwd: root,
      env: {
        PHASE46_GATE_IN_PROGRESS: "1",
      },
      label: "phase-46-release-regressions",
    },
  ];
}

export async function runPhase46QualityGate(
  options: Phase46GateOptions = {},
  dependencies: Phase46GateDependencies = {},
): Promise<Phase46GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now?.() ?? new Date().toISOString();
  const outputDir = options.outputDir ?? resolvePhase46GateOutputDir(root);
  const runId = options.runId ?? buildPhase46GateRunId(now);
  const runDirectory = join(outputDir, runId);
  const expectedCommands = buildPhase46GateCommands(root);
  const commands = options.skipCommands
    ? []
    : await runGateCommands(expectedCommands, dependencies);
  const qualityReportPath =
    options.qualityReportPath ?? resolvePhase46CanonicalQualityReportPath(root);
  const qualityReport = parseQualityReport(
    await readText(qualityReportPath, dependencies),
  );
  const packageJson = JSON.parse(
    await readText(join(root, "package.json"), dependencies),
  ) as {
    scripts?: Record<string, unknown>;
  };
  const rootSource = await readText(join(root, "src/index.ts"), dependencies);
  const maintenanceRunner = await readText(
    join(root, "src/maintenance/runner.ts"),
    dependencies,
  );
  const evalRunners = await readText(join(root, "src/eval/runners.ts"), dependencies);
  const currentStatus = await readText(
    join(root, "docs/GoodMemory-Current-Status-and-Evidence.md"),
    dependencies,
  );
  const archiveDoc = await readText(
    join(root, "docs/archive/quality-gates/GoodMemory-Phase-46-Quality-Gate.md"),
    dependencies,
  );
  const archiveIndex = await readText(
    join(root, "docs/archive/quality-gates/README.md"),
    dependencies,
  );
  const taskBoard = await readText(
    join(root, "task-board/51-phase-46-memory-quality-and-maintenance-2-0.txt"),
    dependencies,
  );
  const breakdown = await readText(
    join(root, "task-board/phase-46-memory-quality-and-maintenance-2-0/04-regressions-and-gate.txt"),
    dependencies,
  );
  const qualityReportEvidence = validateQualityReport({
    report: qualityReport,
    reportPath: qualityReportPath,
    root,
  });
  const evidence = {
    docsAligned: docsAreAligned({
      archiveDoc,
      archiveIndex,
      breakdown,
      currentStatus,
      taskBoard,
    }),
    noRootApiWidening:
      !rootSource.includes("runPhase46") &&
      !rootSource.includes("qualityRepair") &&
      !rootSource.includes("memoryQuality"),
    packageScriptsRegistered:
      packageJson.scripts?.["eval:phase-46"] ===
        "bun run scripts/run-phase-46-quality-eval.ts" &&
      packageJson.scripts?.["gate:phase-46"] ===
        "bun run scripts/run-phase-46-gate.ts",
    qualityReport: qualityReportEvidence,
    qualityReportMetrics: qualityReport.metrics,
    qualityRepairBoundary:
      maintenanceRunner.includes("qualityRepair") &&
      maintenanceRunner.includes("quality_repair_guardrail") === false &&
      maintenanceRunner.includes("jobs: MaintenanceJobName[] = [") &&
      maintenanceRunner.includes('"dedupe"') &&
      maintenanceRunner.includes('"embeddingRepair"') &&
      evalRunners.includes("OUTCOME_AWARE_MAINTENANCE_JOBS") &&
      evalRunners.includes('"qualityRepair"') &&
      evalRunners.indexOf('"qualityRepair"') <
        evalRunners.indexOf('"dedupe"', evalRunners.indexOf("OUTCOME_AWARE")),
  };
  const accepted =
    qualityReportEvidence.status === "accepted" &&
    qualityReport.metrics.failureSampleCount === 2 &&
    qualityReport.metrics.observedFailureSampleCount === 2 &&
    qualityReport.metrics.maintenanceGuardrailCount >= 1 &&
    qualityReport.metrics.repairPassCount === 3 &&
    qualityReport.metrics.overRememberingDemotedCount === 1 &&
    qualityReport.metrics.staleRepairDemotedCount === 1 &&
    qualityReport.metrics.providerBackedPromotionSeparated &&
    evidence.docsAligned &&
    evidence.noRootApiWidening &&
    evidence.packageScriptsRegistered &&
    evidence.qualityRepairBoundary &&
    commands.length === expectedCommands.length &&
    commands.every((command) => command.exitCode === 0);
  const report: Phase46GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 46 quality and maintenance repair is accepted with Phase 45 observed failure samples, guarded stale repair, provider-backed separation, docs alignment, and no root API widening."
        : "Phase 46 gate blocked because quality evidence, regressions, docs, or boundary assertions failed.",
    },
    commands,
    evidence,
    generatedAt: now,
    generatedBy: GENERATED_BY,
    outputDir,
    phase: "phase-46",
    runDirectory,
    runId,
  };

  await (dependencies.ensureDir ?? mkdir)(runDirectory, { recursive: true });
  await (dependencies.writeTextFile ?? writeFile)(
    join(runDirectory, "phase-46-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

function validateQualityReport(input: {
  report: ParsedPhase46QualityReport;
  reportPath: string;
  root: string;
}): Phase46QualityReportEvidence {
  const accepted =
    input.report.acceptance.decision === "accepted" &&
    input.report.runId === CANONICAL_PHASE46_QUALITY_RUN_ID &&
    input.report.inputs.phase45AdoptionReport.runId ===
      CANONICAL_PHASE45_ADOPTION_RUN_ID &&
    input.report.inputs.phase45AdoptionReport.status === "accepted" &&
    normalizeRepoRelativePath(
      input.root,
      input.report.inputs.phase45AdoptionReport.reportPath,
    ) === CANONICAL_PHASE45_ADOPTION_REPORT_RELATIVE_PATH &&
    input.report.metrics.failureSampleCount === 2 &&
    input.report.metrics.observedFailureSampleCount === 2 &&
    input.report.failureSamples.every((sample) =>
      sample.baselineObservedFailure === true
    ) &&
    input.report.failureSamples.some((sample) =>
      sample.label === "missed_recall"
    ) &&
    input.report.failureSamples.some((sample) =>
      sample.label === "over_remembering"
    ) &&
    input.report.guardedRepairScenarios.some((scenario) =>
      scenario.family === "stale_recall" &&
      scenario.observedPhase45Failure === false
    ) &&
    input.report.repairs.some((repair) =>
      repair.family === "stale_recall" &&
      repair.evidenceKind === "maintenance_guardrail" &&
      repair.status === "passed"
    ) &&
    input.report.repairs.every((repair) => repair.status === "passed");

  return {
    artifactKind: "ignored_generated",
    ignoredReportPath: relative(input.root, input.reportPath),
    reason: accepted
      ? "Phase 46 quality eval evidence is accepted."
      : "Phase 46 quality eval evidence is incomplete.",
    regenerateCommand:
      `bun run eval:phase-46 --run-id ${CANONICAL_PHASE46_QUALITY_RUN_ID}`,
    status: accepted ? "accepted" : "blocked",
  };
}

function parseQualityReport(raw: string): ParsedPhase46QualityReport {
  const parsed = JSON.parse(raw) as Phase46QualityReportSnapshot;
  const metrics = parsed.metrics;
  const failureSamples = Array.isArray(parsed.failureSamples)
    ? parsed.failureSamples as ParsedPhase46QualityReport["failureSamples"]
    : [];
  const guardedRepairScenarios = Array.isArray(parsed.guardedRepairScenarios)
    ? parsed.guardedRepairScenarios as ParsedPhase46QualityReport["guardedRepairScenarios"]
    : [];
  const repairs = Array.isArray(parsed.repairs)
    ? parsed.repairs as ParsedPhase46QualityReport["repairs"]
    : [];
  const phase45Input = parsed.inputs?.phase45AdoptionReport;
  const outOfScope = parsed.scope?.outOfScope;

  if (
    (parsed.acceptance?.decision !== "accepted" &&
      parsed.acceptance?.decision !== "blocked") ||
    parsed.generatedBy !== "scripts/run-phase-46-quality-eval.ts" ||
    parsed.mode !== "memory-quality-and-maintenance-2-0" ||
    parsed.phase !== "phase-46" ||
    parsed.runId !== CANONICAL_PHASE46_QUALITY_RUN_ID ||
    typeof phase45Input?.runId !== "string" ||
    (phase45Input.status !== "accepted" && phase45Input.status !== "blocked") ||
    typeof phase45Input.reportPath !== "string" ||
    parsed.rawTranscriptPersistence?.persistedRawTranscripts !== false ||
    parsed.diagnosis?.providerBackedPromotionSeparated !== true ||
    !Array.isArray(parsed.diagnosis.rulesOnlyFailureSampleIds) ||
    parsed.diagnosis.rulesOnlyFailureSampleIds.length !== 0 ||
    typeof metrics?.failureSampleCount !== "number" ||
    typeof metrics.maintenanceGuardrailCount !== "number" ||
    typeof metrics.observedFailureSampleCount !== "number" ||
    typeof metrics.overRememberingDemotedCount !== "number" ||
    typeof metrics.providerBackedPromotionSeparated !== "boolean" ||
    typeof metrics.repairPassCount !== "number" ||
    typeof metrics.staleRepairDemotedCount !== "number" ||
    failureSamples.length === 0 ||
    metrics.failureSampleCount !== failureSamples.length ||
    metrics.observedFailureSampleCount !==
      failureSamples.filter((sample) => sample.baselineObservedFailure === true)
        .length ||
    failureSamples.some((sample) =>
      sample.baselineObservedFailure !== true ||
      sample.label === "stale_recall"
    ) ||
    guardedRepairScenarios.length === 0 ||
    metrics.maintenanceGuardrailCount !== guardedRepairScenarios.length ||
    repairs.length === 0 ||
    !Array.isArray(outOfScope) ||
    !outOfScope.includes("provider-backed retrieval default promotion") ||
    !outOfScope.includes("root public API widening")
  ) {
    throw new Error("Phase 46 quality report does not match the expected schema.");
  }

  return {
    acceptance: { decision: parsed.acceptance.decision },
    failureSamples,
    guardedRepairScenarios,
    inputs: {
      phase45AdoptionReport: {
        reportPath: phase45Input.reportPath,
        runId: phase45Input.runId,
        status: phase45Input.status,
      },
    },
    metrics: {
      failureSampleCount: metrics.failureSampleCount,
      maintenanceGuardrailCount: metrics.maintenanceGuardrailCount,
      observedFailureSampleCount: metrics.observedFailureSampleCount,
      overRememberingDemotedCount: metrics.overRememberingDemotedCount,
      providerBackedPromotionSeparated: metrics.providerBackedPromotionSeparated,
      repairPassCount: metrics.repairPassCount,
      staleRepairDemotedCount: metrics.staleRepairDemotedCount,
    },
    repairs,
    runId: CANONICAL_PHASE46_QUALITY_RUN_ID,
  };
}

function docsAreAligned(input: {
  archiveDoc: string;
  archiveIndex: string;
  breakdown: string;
  currentStatus: string;
  taskBoard: string;
}): boolean {
  return (
    input.currentStatus.includes(
      "Phase 46 is now closed as the Memory Quality and Maintenance 2.0 slice",
    ) &&
    input.currentStatus.includes(
      "reports/eval/fallback/phase-46/run-20260427123000-quality-eval/report.json",
    ) &&
    input.currentStatus.includes(
      "reports/quality-gates/phase-46/run-20260428110000/phase-46-quality-gate.json",
    ) &&
    input.currentStatus.includes(
      "docs/archive/quality-gates/GoodMemory-Phase-46-Quality-Gate.md",
    ) &&
    input.archiveDoc.includes("Canonical accepted gate run: `run-20260428110000`") &&
    input.archiveDoc.includes(CANONICAL_PHASE46_QUALITY_RUN_ID) &&
    input.archiveDoc.includes("maintenance guardrail") &&
    input.archiveDoc.includes("provider-backed retrieval default promotion") &&
    input.archiveIndex.includes("GoodMemory-Phase-46-Quality-Gate.md") &&
    input.taskBoard.includes("[DONE] Phase 46 is closed") &&
    input.taskBoard.includes(
      "reports/eval/fallback/phase-46/run-20260427123000-quality-eval/report.json",
    ) &&
    input.taskBoard.includes(
      "reports/quality-gates/phase-46/run-20260428110000/phase-46-quality-gate.json",
    ) &&
    input.breakdown.includes("[DONE] P46.4-T002") &&
    input.breakdown.includes("GoodMemory-Phase-46-Quality-Gate.md")
  );
}

async function runGateCommands(
  commands: Phase46GateCommand[],
  dependencies: Phase46GateDependencies,
): Promise<Array<Phase46GateCommandResult & { label: string }>> {
  const results: Array<Phase46GateCommandResult & { label: string }> = [];
  for (const command of commands) {
    const result = await (dependencies.runCommand ?? runCommand)(command);
    results.push({
      ...result,
      label: command.label,
    });
    if (result.exitCode !== 0) {
      break;
    }
  }
  return results;
}

async function readText(
  path: string,
  dependencies: Phase46GateDependencies,
): Promise<string> {
  if (dependencies.readTextFile) {
    return await dependencies.readTextFile(path);
  }
  return await readFile(path, "utf8");
}

async function runCommand(
  command: Phase46GateCommand,
): Promise<Phase46GateCommandResult> {
  const started = Date.now();
  const child = Bun.spawn({
    cmd: command.args,
    cwd: command.cwd,
    env: {
      ...process.env,
      ...(command.env ?? {}),
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return {
    durationMs: Date.now() - started,
    exitCode,
    stderr,
    stdout,
  };
}

export async function runPhase46GateCli(
  dependencies: Phase46GateCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? process.argv;
  const options = parsePhase46GateCliOptions(argv);
  try {
    const report = await (dependencies.runGate ?? runPhase46QualityGate)(options);
    dependencies.log?.(
      `Phase 46 quality gate ${report.acceptance.decision}: ${report.runDirectory}`,
    );
    if (report.acceptance.decision !== "accepted") {
      dependencies.exit?.(1);
      if (!dependencies.exit) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    dependencies.log?.(
      error instanceof Error ? error.message : String(error),
    );
    dependencies.exit?.(1);
    if (!dependencies.exit) {
      process.exitCode = 1;
    }
  }
}

if (import.meta.main) {
  await runPhase46GateCli();
}
