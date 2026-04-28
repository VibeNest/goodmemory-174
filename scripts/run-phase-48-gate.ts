#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase48GateOptions {
  decisionReportPath?: string;
  outputDir?: string;
  runId?: string;
  skipCommands?: boolean;
}

export interface Phase48GateCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label: string;
}

export interface Phase48GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase48GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase48GateCommand) => Promise<Phase48GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase48GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase48GateOptions) => Promise<Phase48GateReport>;
}

export interface Phase48DecisionReportEvidence {
  artifactKind: "ignored_generated";
  ignoredReportPath: string;
  reason: string;
  regenerateCommand: string;
  status: "accepted" | "blocked";
}

export interface Phase48GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Array<Phase48GateCommandResult & { label: string }>;
  evidence: {
    decisionReport: Phase48DecisionReportEvidence;
    decisionReportSummary: {
      decision: "no_go" | "requires_pilot_design";
      hostedSurfaceEvidenceObserved: boolean;
      localViewerPreserved: boolean;
      rawTranscriptPersistenceBlocked: boolean;
      surfaceDecisionCount: number;
      threatModelComplete: boolean;
    };
    docsAligned: boolean;
    localViewerBoundaryPreserved: boolean;
    noRootApiWidening: boolean;
    packageScriptsRegistered: boolean;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-48-gate.ts";
  outputDir: string;
  phase: "phase-48";
  runDirectory: string;
  runId: string;
}

interface Phase48DecisionReportSnapshot {
  acceptance?: { decision?: unknown };
  decision?: { decision?: unknown };
  generatedBy?: unknown;
  inputs?: {
    phase44LocalViewerGate?: {
      readOnlySecurityContracts?: unknown;
      reportPath?: unknown;
      runId?: unknown;
      status?: unknown;
    };
    phase45AdoptionReport?: {
      localViewerInspectionObserved?: unknown;
      noMemoryBaselineObserved?: unknown;
      reportPath?: unknown;
      runId?: unknown;
      scenarioCount?: unknown;
      status?: unknown;
    };
    phase46QualityGate?: {
      hostedSurfaceEvidenceObserved?: unknown;
      providerBackedPromotionSeparated?: unknown;
      qualityRepairBoundary?: unknown;
      reportPath?: unknown;
      runId?: unknown;
      status?: unknown;
    };
    phase47ProviderRolloutGate?: {
      explicitHybridOnly?: unknown;
      hostedSurfaceEvidenceObserved?: unknown;
      reportPath?: unknown;
      rulesOnlyDefaultPreserved?: unknown;
      runId?: unknown;
      status?: unknown;
    };
  };
  mode?: unknown;
  phase?: unknown;
  pilot?: {
    decision?: unknown;
    noGoReasons?: unknown;
    reconsiderationTriggers?: unknown;
    smallestSafePilot?: unknown;
  };
  productEvidence?: {
    hostedSurfaceEvidenceObserved?: unknown;
    memoryQualityNeedAddressedLocally?: unknown;
    providerBackedNeedAddressedByExplicitHybrid?: unknown;
    referenceProductAdoptionProven?: unknown;
  };
  rawTranscriptPersistence?: {
    persistedRawTranscripts?: unknown;
    policy?: unknown;
  };
  runId?: unknown;
  scope?: {
    outOfScope?: unknown;
  };
  surfaceDecisions?: unknown;
  threatModel?: {
    auditRequired?: unknown;
    authRequired?: unknown;
    deletionRequired?: unknown;
    exportRequired?: unknown;
    rawTranscriptDefault?: unknown;
    redactionRequired?: unknown;
    tenancyRequired?: unknown;
  };
  viewerBoundary?: {
    browserExecutedMutationAllowed?: unknown;
    localViewerRemainsLocalOnly?: unknown;
    localViewerRemainsReadOnly?: unknown;
    separateHostedSurfaceRequired?: unknown;
  };
}

interface ParsedPhase48DecisionReport {
  acceptance: { decision: "accepted" | "blocked" };
  decision: { decision: "no_go" | "requires_pilot_design" };
  inputs: {
    phase44LocalViewerGate: {
      readOnlySecurityContracts: boolean;
      reportPath: string;
      runId: string;
      status: "accepted" | "blocked";
    };
    phase45AdoptionReport: {
      localViewerInspectionObserved: boolean;
      noMemoryBaselineObserved: boolean;
      reportPath: string;
      runId: string;
      scenarioCount: number;
      status: "accepted" | "blocked";
    };
    phase46QualityGate: {
      hostedSurfaceEvidenceObserved: boolean;
      providerBackedPromotionSeparated: boolean;
      qualityRepairBoundary: boolean;
      reportPath: string;
      runId: string;
      status: "accepted" | "blocked";
    };
    phase47ProviderRolloutGate: {
      explicitHybridOnly: boolean;
      hostedSurfaceEvidenceObserved: boolean;
      reportPath: string;
      rulesOnlyDefaultPreserved: boolean;
      runId: string;
      status: "accepted" | "blocked";
    };
  };
  pilot: {
    decision: "no_go" | "requires_pilot_design";
    noGoReasons: string[];
    reconsiderationTriggers: string[];
    smallestSafePilot: null;
  };
  productEvidence: {
    hostedSurfaceEvidenceObserved: boolean;
    memoryQualityNeedAddressedLocally: boolean;
    providerBackedNeedAddressedByExplicitHybrid: boolean;
    referenceProductAdoptionProven: boolean;
  };
  rawTranscriptPersistence: {
    persistedRawTranscripts: false;
    policy: "blocked_by_default";
  };
  runId: typeof CANONICAL_PHASE48_DECISION_RUN_ID;
  surfaceDecisions: Array<{
    decision?: unknown;
    surface?: unknown;
  }>;
  threatModel: {
    auditRequired: boolean;
    authRequired: boolean;
    deletionRequired: boolean;
    exportRequired: boolean;
    rawTranscriptDefault: unknown;
    redactionRequired: boolean;
    tenancyRequired: boolean;
  };
  viewerBoundary: {
    browserExecutedMutationAllowed: boolean;
    localViewerRemainsLocalOnly: boolean;
    localViewerRemainsReadOnly: boolean;
    separateHostedSurfaceRequired: boolean;
  };
}

const GENERATED_BY = "scripts/run-phase-48-gate.ts";
const CANONICAL_PHASE44_GATE_RUN_ID = "run-20260426160000";
const CANONICAL_PHASE45_ADOPTION_RUN_ID = "run-20260427104530-adoption-eval";
const CANONICAL_PHASE46_GATE_RUN_ID = "run-20260428110000";
const CANONICAL_PHASE47_GATE_RUN_ID = "run-20260428123000";
const CANONICAL_PHASE48_DECISION_RUN_ID =
  "run-20260428170000-dashboard-cloud-decision";
const CANONICAL_PHASE44_GATE_RELATIVE_PATH = join(
  "reports/quality-gates/phase-44",
  CANONICAL_PHASE44_GATE_RUN_ID,
  "phase-44-quality-gate.json",
);
const CANONICAL_PHASE45_ADOPTION_REPORT_RELATIVE_PATH = join(
  "reports/eval/adoption/phase-45",
  CANONICAL_PHASE45_ADOPTION_RUN_ID,
  "report.json",
);
const CANONICAL_PHASE46_GATE_RELATIVE_PATH = join(
  "reports/quality-gates/phase-46",
  CANONICAL_PHASE46_GATE_RUN_ID,
  "phase-46-quality-gate.json",
);
const CANONICAL_PHASE47_GATE_RELATIVE_PATH = join(
  "reports/quality-gates/phase-47",
  CANONICAL_PHASE47_GATE_RUN_ID,
  "phase-47-quality-gate.json",
);
const HOSTED_SURFACE_VALUES = new Set([
  "cloud_sync",
  "hosted_dashboard",
  "team_workspace",
]);

export function resolvePhase48GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-48");
}

export function resolvePhase48CanonicalDecisionReportPath(root: string): string {
  return join(
    root,
    "reports/eval/fallback/phase-48",
    CANONICAL_PHASE48_DECISION_RUN_ID,
    "report.json",
  );
}

export function buildPhase48GateRunId(nowIso: string): string {
  return `run-${nowIso.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "")}`;
}

export function parsePhase48GateCliOptions(
  argv: readonly string[],
): Phase48GateOptions {
  return {
    decisionReportPath: resolveCliFlagValue(argv, "--decision-report-path"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    skipCommands: argv.includes("--skip-commands"),
  };
}

export function buildPhase48GateCommands(root: string): Phase48GateCommand[] {
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
        "tests/unit/run-phase-48.decision-report.test.ts",
        "tests/unit/run-phase-48-gate.test.ts",
        "--test-name-pattern",
        "run-phase-48",
      ],
      cwd: root,
      label: "phase-48-decision-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "gate:phase-47",
        "--run-id",
        CANONICAL_PHASE47_GATE_RUN_ID,
      ],
      cwd: root,
      env: {
        PHASE48_GATE_IN_PROGRESS: "1",
      },
      label: "phase-47-gate-prerequisite",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-48",
        "--run-id",
        CANONICAL_PHASE48_DECISION_RUN_ID,
      ],
      cwd: root,
      label: "phase-48-decision-report",
    },
    {
      args: [
        "bun",
        "test",
        "tests/release/release.test.ts",
        "--test-name-pattern",
        "phase-48|package metadata exposes bin|current status doc points|task-board current note|root exports stay aligned|models fallback eval evidence",
      ],
      cwd: root,
      env: {
        PHASE48_GATE_IN_PROGRESS: "1",
      },
      label: "phase-48-release-regressions",
    },
  ];
}

function normalizeRepoRelativePath(root: string, path: string): string {
  return isAbsolute(path) ? relative(root, path) : path;
}

function isAcceptedStatus(value: unknown): value is "accepted" | "blocked" {
  return value === "accepted" || value === "blocked";
}

function readDecision(value: unknown): "no_go" | "requires_pilot_design" | null {
  return value === "no_go" || value === "requires_pilot_design" ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function hasCompleteSurfaceNoGoDecisions(
  surfaces: ParsedPhase48DecisionReport["surfaceDecisions"],
): boolean {
  const seen = new Set<string>();
  for (const surface of surfaces) {
    if (
      surface.decision !== "no_go" ||
      typeof surface.surface !== "string" ||
      !HOSTED_SURFACE_VALUES.has(surface.surface)
    ) {
      return false;
    }
    seen.add(surface.surface);
  }
  return seen.size === HOSTED_SURFACE_VALUES.size;
}

function parseDecisionReport(raw: string): ParsedPhase48DecisionReport {
  const parsed = JSON.parse(raw) as Phase48DecisionReportSnapshot;
  const phase44 = parsed.inputs?.phase44LocalViewerGate;
  const phase45 = parsed.inputs?.phase45AdoptionReport;
  const phase46 = parsed.inputs?.phase46QualityGate;
  const phase47 = parsed.inputs?.phase47ProviderRolloutGate;
  const pilot = parsed.pilot;
  const productEvidence = parsed.productEvidence;
  const rawTranscriptPersistence = parsed.rawTranscriptPersistence;
  const threatModel = parsed.threatModel;
  const viewerBoundary = parsed.viewerBoundary;
  const decision = readDecision(parsed.decision?.decision);
  const pilotDecision = readDecision(parsed.pilot?.decision);
  const surfaceDecisions = Array.isArray(parsed.surfaceDecisions)
    ? parsed.surfaceDecisions as ParsedPhase48DecisionReport["surfaceDecisions"]
    : [];
  const outOfScope = parsed.scope?.outOfScope;

  if (
    !isAcceptedStatus(parsed.acceptance?.decision) ||
    parsed.generatedBy !== "scripts/run-phase-48-decision-report.ts" ||
    parsed.mode !== "dashboard-cloud-sync-team-workspace-decision" ||
    parsed.phase !== "phase-48" ||
    parsed.runId !== CANONICAL_PHASE48_DECISION_RUN_ID ||
    decision === null ||
    pilotDecision === null ||
    !isAcceptedStatus(phase44?.status) ||
    phase44.runId !== CANONICAL_PHASE44_GATE_RUN_ID ||
    typeof phase44.reportPath !== "string" ||
    typeof phase44.readOnlySecurityContracts !== "boolean" ||
    !isAcceptedStatus(phase45?.status) ||
    phase45.runId !== CANONICAL_PHASE45_ADOPTION_RUN_ID ||
    typeof phase45.reportPath !== "string" ||
    typeof phase45.localViewerInspectionObserved !== "boolean" ||
    typeof phase45.noMemoryBaselineObserved !== "boolean" ||
    typeof phase45.scenarioCount !== "number" ||
    !isAcceptedStatus(phase46?.status) ||
    phase46.runId !== CANONICAL_PHASE46_GATE_RUN_ID ||
    typeof phase46.reportPath !== "string" ||
    typeof phase46.hostedSurfaceEvidenceObserved !== "boolean" ||
    typeof phase46.providerBackedPromotionSeparated !== "boolean" ||
    typeof phase46.qualityRepairBoundary !== "boolean" ||
    !isAcceptedStatus(phase47?.status) ||
    phase47.runId !== CANONICAL_PHASE47_GATE_RUN_ID ||
    typeof phase47.reportPath !== "string" ||
    typeof phase47.explicitHybridOnly !== "boolean" ||
    typeof phase47.hostedSurfaceEvidenceObserved !== "boolean" ||
    typeof phase47.rulesOnlyDefaultPreserved !== "boolean" ||
    typeof productEvidence?.hostedSurfaceEvidenceObserved !== "boolean" ||
    typeof productEvidence.memoryQualityNeedAddressedLocally !== "boolean" ||
    typeof productEvidence.providerBackedNeedAddressedByExplicitHybrid !== "boolean" ||
    typeof productEvidence.referenceProductAdoptionProven !== "boolean" ||
    rawTranscriptPersistence?.persistedRawTranscripts !== false ||
    rawTranscriptPersistence.policy !== "blocked_by_default" ||
    typeof viewerBoundary?.browserExecutedMutationAllowed !== "boolean" ||
    typeof viewerBoundary.localViewerRemainsLocalOnly !== "boolean" ||
    typeof viewerBoundary.localViewerRemainsReadOnly !== "boolean" ||
    typeof viewerBoundary.separateHostedSurfaceRequired !== "boolean" ||
    typeof threatModel?.auditRequired !== "boolean" ||
    typeof threatModel.authRequired !== "boolean" ||
    typeof threatModel.deletionRequired !== "boolean" ||
    typeof threatModel.exportRequired !== "boolean" ||
    threatModel.rawTranscriptDefault !== "blocked" ||
    typeof threatModel.redactionRequired !== "boolean" ||
    typeof threatModel.tenancyRequired !== "boolean" ||
    !Array.isArray(pilot?.noGoReasons) ||
    !Array.isArray(pilot.reconsiderationTriggers) ||
    pilot.smallestSafePilot !== null ||
    surfaceDecisions.length !== 3 ||
    !Array.isArray(outOfScope) ||
    !stringArray(outOfScope).some((entry) => entry.includes("hosted dashboard")) ||
    !stringArray(outOfScope).some((entry) => entry.includes("cloud sync")) ||
    !stringArray(outOfScope).some((entry) => entry.includes("team workspace")) ||
    !stringArray(outOfScope).some((entry) => entry.includes("root public API"))
  ) {
    throw new Error("Phase 48 decision report does not match the expected schema.");
  }

  return {
    acceptance: { decision: parsed.acceptance.decision },
    decision: { decision },
    inputs: {
      phase44LocalViewerGate: {
        readOnlySecurityContracts: phase44.readOnlySecurityContracts,
        reportPath: phase44.reportPath,
        runId: phase44.runId,
        status: phase44.status,
      },
      phase45AdoptionReport: {
        localViewerInspectionObserved: phase45.localViewerInspectionObserved,
        noMemoryBaselineObserved: phase45.noMemoryBaselineObserved,
        reportPath: phase45.reportPath,
        runId: phase45.runId,
        scenarioCount: phase45.scenarioCount,
        status: phase45.status,
      },
      phase46QualityGate: {
        hostedSurfaceEvidenceObserved: phase46.hostedSurfaceEvidenceObserved,
        providerBackedPromotionSeparated:
          phase46.providerBackedPromotionSeparated,
        qualityRepairBoundary: phase46.qualityRepairBoundary,
        reportPath: phase46.reportPath,
        runId: phase46.runId,
        status: phase46.status,
      },
      phase47ProviderRolloutGate: {
        explicitHybridOnly: phase47.explicitHybridOnly,
        hostedSurfaceEvidenceObserved: phase47.hostedSurfaceEvidenceObserved,
        reportPath: phase47.reportPath,
        rulesOnlyDefaultPreserved: phase47.rulesOnlyDefaultPreserved,
        runId: phase47.runId,
        status: phase47.status,
      },
    },
    pilot: {
      decision: pilotDecision,
      noGoReasons: stringArray(pilot.noGoReasons),
      reconsiderationTriggers: stringArray(pilot.reconsiderationTriggers),
      smallestSafePilot: null,
    },
    productEvidence: {
      hostedSurfaceEvidenceObserved:
        productEvidence.hostedSurfaceEvidenceObserved,
      memoryQualityNeedAddressedLocally:
        productEvidence.memoryQualityNeedAddressedLocally,
      providerBackedNeedAddressedByExplicitHybrid:
        productEvidence.providerBackedNeedAddressedByExplicitHybrid,
      referenceProductAdoptionProven:
        productEvidence.referenceProductAdoptionProven,
    },
    rawTranscriptPersistence: {
      persistedRawTranscripts: false,
      policy: "blocked_by_default",
    },
    runId: CANONICAL_PHASE48_DECISION_RUN_ID,
    surfaceDecisions,
    threatModel: {
      auditRequired: threatModel.auditRequired,
      authRequired: threatModel.authRequired,
      deletionRequired: threatModel.deletionRequired,
      exportRequired: threatModel.exportRequired,
      rawTranscriptDefault: threatModel.rawTranscriptDefault,
      redactionRequired: threatModel.redactionRequired,
      tenancyRequired: threatModel.tenancyRequired,
    },
    viewerBoundary: {
      browserExecutedMutationAllowed:
        viewerBoundary.browserExecutedMutationAllowed,
      localViewerRemainsLocalOnly:
        viewerBoundary.localViewerRemainsLocalOnly,
      localViewerRemainsReadOnly:
        viewerBoundary.localViewerRemainsReadOnly,
      separateHostedSurfaceRequired:
        viewerBoundary.separateHostedSurfaceRequired,
    },
  };
}

type Phase48DecisionReportSummary =
  Phase48GateReport["evidence"]["decisionReportSummary"];

function summarizeDecisionReport(
  report: ParsedPhase48DecisionReport,
): Phase48DecisionReportSummary {
  return {
    decision: report.decision.decision,
    hostedSurfaceEvidenceObserved:
      report.productEvidence.hostedSurfaceEvidenceObserved,
    localViewerPreserved:
      report.viewerBoundary.localViewerRemainsLocalOnly &&
      report.viewerBoundary.localViewerRemainsReadOnly &&
      report.viewerBoundary.browserExecutedMutationAllowed === false,
    rawTranscriptPersistenceBlocked:
      report.rawTranscriptPersistence.persistedRawTranscripts === false &&
      report.rawTranscriptPersistence.policy === "blocked_by_default",
    surfaceDecisionCount: report.surfaceDecisions.filter((surface) =>
      surface.decision === "no_go"
    ).length,
    threatModelComplete:
      report.threatModel.auditRequired &&
      report.threatModel.authRequired &&
      report.threatModel.deletionRequired &&
      report.threatModel.exportRequired &&
      report.threatModel.rawTranscriptDefault === "blocked" &&
      report.threatModel.redactionRequired &&
      report.threatModel.tenancyRequired,
  };
}

function validateDecisionReport(input: {
  report: ParsedPhase48DecisionReport;
  reportPath: string;
  root: string;
  summary: Phase48DecisionReportSummary;
}): Phase48DecisionReportEvidence {
  const accepted =
    input.report.acceptance.decision === "accepted" &&
    input.report.decision.decision === "no_go" &&
    input.report.inputs.phase44LocalViewerGate.status === "accepted" &&
    input.report.inputs.phase44LocalViewerGate.readOnlySecurityContracts &&
    normalizeRepoRelativePath(
      input.root,
      input.report.inputs.phase44LocalViewerGate.reportPath,
    ) === CANONICAL_PHASE44_GATE_RELATIVE_PATH &&
    input.report.inputs.phase45AdoptionReport.status === "accepted" &&
    input.report.inputs.phase45AdoptionReport.localViewerInspectionObserved &&
    input.report.inputs.phase45AdoptionReport.noMemoryBaselineObserved &&
    input.report.inputs.phase45AdoptionReport.scenarioCount >= 12 &&
    normalizeRepoRelativePath(
      input.root,
      input.report.inputs.phase45AdoptionReport.reportPath,
    ) === CANONICAL_PHASE45_ADOPTION_REPORT_RELATIVE_PATH &&
    input.report.inputs.phase46QualityGate.status === "accepted" &&
    input.report.inputs.phase46QualityGate.qualityRepairBoundary &&
    input.report.inputs.phase46QualityGate.providerBackedPromotionSeparated &&
    normalizeRepoRelativePath(
      input.root,
      input.report.inputs.phase46QualityGate.reportPath,
    ) === CANONICAL_PHASE46_GATE_RELATIVE_PATH &&
    input.report.inputs.phase47ProviderRolloutGate.status === "accepted" &&
    normalizeRepoRelativePath(
      input.root,
      input.report.inputs.phase47ProviderRolloutGate.reportPath,
    ) === CANONICAL_PHASE47_GATE_RELATIVE_PATH &&
    input.report.productEvidence.referenceProductAdoptionProven &&
    input.report.productEvidence.memoryQualityNeedAddressedLocally &&
    input.report.productEvidence.providerBackedNeedAddressedByExplicitHybrid &&
    input.report.productEvidence.hostedSurfaceEvidenceObserved === false &&
    input.report.inputs.phase46QualityGate.hostedSurfaceEvidenceObserved === false &&
    input.report.inputs.phase47ProviderRolloutGate.hostedSurfaceEvidenceObserved === false &&
    input.report.inputs.phase47ProviderRolloutGate.explicitHybridOnly &&
    input.report.inputs.phase47ProviderRolloutGate.rulesOnlyDefaultPreserved &&
    input.report.pilot.decision === "no_go" &&
    input.report.pilot.smallestSafePilot === null &&
    input.report.pilot.noGoReasons.length >= 4 &&
    input.report.pilot.reconsiderationTriggers.length >= 3 &&
    input.summary.localViewerPreserved &&
    input.summary.rawTranscriptPersistenceBlocked &&
    input.summary.surfaceDecisionCount === 3 &&
    hasCompleteSurfaceNoGoDecisions(input.report.surfaceDecisions) &&
    input.summary.threatModelComplete;

  return {
    artifactKind: "ignored_generated",
    ignoredReportPath: relative(input.root, input.reportPath),
    reason: accepted
      ? "Phase 48 dashboard/cloud/team workspace decision report is accepted."
      : "Phase 48 dashboard/cloud/team workspace decision report is incomplete.",
    regenerateCommand:
      `bun run gate:phase-47 --run-id ${CANONICAL_PHASE47_GATE_RUN_ID} && bun run eval:phase-48 --run-id ${CANONICAL_PHASE48_DECISION_RUN_ID}`,
    status: accepted ? "accepted" : "blocked",
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
      "Phase 48 is now closed as the Dashboard, Cloud Sync, and Team Workspace Decision slice",
    ) &&
    input.currentStatus.includes("no-go decision") &&
    input.currentStatus.includes(
      "reports/eval/fallback/phase-48/run-20260428170000-dashboard-cloud-decision/report.json",
    ) &&
    input.currentStatus.includes(
      "reports/quality-gates/phase-48/run-20260428173000/phase-48-quality-gate.json",
    ) &&
    input.archiveDoc.includes("Canonical accepted gate run: `run-20260428173000`") &&
    input.archiveDoc.includes(CANONICAL_PHASE48_DECISION_RUN_ID) &&
    input.archiveDoc.includes("no-go") &&
    input.archiveDoc.includes("auth") &&
    input.archiveDoc.includes("tenancy") &&
    input.archiveDoc.includes("raw transcript") &&
    input.archiveDoc.includes("local viewer remains local-only") &&
    input.archiveIndex.includes("GoodMemory-Phase-48-Quality-Gate.md") &&
    input.taskBoard.includes("[DONE] Phase 48 is closed with an accepted no-go decision") &&
    input.taskBoard.includes(
      "reports/eval/fallback/phase-48/run-20260428170000-dashboard-cloud-decision/report.json",
    ) &&
    input.taskBoard.includes(
      "reports/quality-gates/phase-48/run-20260428173000/phase-48-quality-gate.json",
    ) &&
    input.breakdown.includes("[DONE] P48.4-T003") &&
    input.breakdown.includes("GoodMemory-Phase-48-Quality-Gate.md")
  );
}

async function readText(
  path: string,
  dependencies: Phase48GateDependencies,
): Promise<string> {
  if (dependencies.readTextFile) {
    return await dependencies.readTextFile(path);
  }
  return await readFile(path, "utf8");
}

async function runGateCommands(
  commands: Phase48GateCommand[],
  dependencies: Phase48GateDependencies,
): Promise<Array<Phase48GateCommandResult & { label: string }>> {
  const results: Array<Phase48GateCommandResult & { label: string }> = [];
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

async function runCommand(
  command: Phase48GateCommand,
): Promise<Phase48GateCommandResult> {
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

export async function runPhase48QualityGate(
  options: Phase48GateOptions = {},
  dependencies: Phase48GateDependencies = {},
): Promise<Phase48GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now?.() ?? new Date().toISOString();
  const outputDir = options.outputDir ?? resolvePhase48GateOutputDir(root);
  const runId = options.runId ?? buildPhase48GateRunId(now);
  const runDirectory = join(outputDir, runId);
  const expectedCommands = buildPhase48GateCommands(root);
  const commands = options.skipCommands
    ? []
    : await runGateCommands(expectedCommands, dependencies);
  const decisionReportPath =
    options.decisionReportPath ?? resolvePhase48CanonicalDecisionReportPath(root);
  const decisionReport = parseDecisionReport(
    await readText(decisionReportPath, dependencies),
  );
  const packageJson = JSON.parse(
    await readText(join(root, "package.json"), dependencies),
  ) as {
    exports?: Record<string, unknown>;
    scripts?: Record<string, unknown>;
  };
  const rootSource = await readText(join(root, "src/index.ts"), dependencies);
  const viewerSource = await readText(
    join(root, "src/runtime-viewer/public.ts"),
    dependencies,
  );
  const currentStatus = await readText(
    join(root, "docs/GoodMemory-Current-Status-and-Evidence.md"),
    dependencies,
  );
  const archiveDoc = await readText(
    join(root, "docs/archive/quality-gates/GoodMemory-Phase-48-Quality-Gate.md"),
    dependencies,
  );
  const archiveIndex = await readText(
    join(root, "docs/archive/quality-gates/README.md"),
    dependencies,
  );
  const taskBoard = await readText(
    join(root, "task-board/53-phase-48-dashboard-cloud-sync-and-team-workspace-decision.txt"),
    dependencies,
  );
  const breakdown = await readText(
    join(root, "task-board/phase-48-dashboard-cloud-sync-and-team-workspace-decision/04-pilot-or-no-go-gate.txt"),
    dependencies,
  );
  const normalizedViewerSource = viewerSource.toLowerCase();
  const decisionReportSummary = summarizeDecisionReport(decisionReport);
  const decisionReportEvidence = validateDecisionReport({
    report: decisionReport,
    reportPath: decisionReportPath,
    root,
    summary: decisionReportSummary,
  });
  const evidence = {
    decisionReport: decisionReportEvidence,
    decisionReportSummary,
    docsAligned: docsAreAligned({
      archiveDoc,
      archiveIndex,
      breakdown,
      currentStatus,
      taskBoard,
    }),
    localViewerBoundaryPreserved:
      viewerSource.includes("normalizeRuntimeViewerBindHost") &&
      viewerSource.includes("GoodMemory runtime viewer is read-only") &&
      normalizedViewerSource.includes("access-control-allow-origin") === false &&
      viewerSource.includes("rawTranscriptPersisted: false"),
    noRootApiWidening:
      !rootSource.includes("runPhase48") &&
      !rootSource.includes("hostedDashboard") &&
      !rootSource.includes("cloudSync") &&
      !rootSource.includes("teamWorkspace"),
    packageScriptsRegistered:
      packageJson.scripts?.["eval:phase-48"] ===
        "bun run scripts/run-phase-48-decision-report.ts" &&
      packageJson.scripts?.["gate:phase-48"] ===
        "bun run scripts/run-phase-48-gate.ts" &&
      packageJson.exports?.["./dashboard"] === undefined &&
      packageJson.exports?.["./cloud"] === undefined &&
      packageJson.exports?.["./team"] === undefined,
  };
  const accepted =
    decisionReportEvidence.status === "accepted" &&
    evidence.docsAligned &&
    evidence.localViewerBoundaryPreserved &&
    evidence.noRootApiWidening &&
    evidence.packageScriptsRegistered &&
    commands.length === expectedCommands.length &&
    commands.every((command) => command.exitCode === 0);
  const report: Phase48GateReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 48 dashboard/cloud/team workspace decision is accepted as no-go, with privacy and local-viewer boundaries preserved and no hosted surface implemented."
        : "Phase 48 gate blocked because decision evidence, regressions, docs, privacy boundaries, or public-surface assertions failed.",
    },
    commands,
    evidence,
    generatedAt: now,
    generatedBy: GENERATED_BY,
    outputDir,
    phase: "phase-48",
    runDirectory,
    runId,
  };

  await (dependencies.ensureDir ?? mkdir)(runDirectory, { recursive: true });
  await (dependencies.writeTextFile ?? writeFile)(
    join(runDirectory, "phase-48-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

export async function runPhase48GateCli(
  dependencies: Phase48GateCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? process.argv;
  const options = parsePhase48GateCliOptions(argv);
  try {
    const report = await (dependencies.runGate ?? runPhase48QualityGate)(options);
    dependencies.log?.(
      `Phase 48 quality gate ${report.acceptance.decision}: ${report.runDirectory}`,
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
  await runPhase48GateCli();
}
