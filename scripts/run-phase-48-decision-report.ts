#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase48DecisionReportOptions {
  outputDir?: string;
  phase44GatePath?: string;
  phase45ReportPath?: string;
  phase46GatePath?: string;
  phase47GatePath?: string;
  runId?: string;
}

export interface Phase48DecisionReportDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase48DecisionReportCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runReport?: (
    options?: Phase48DecisionReportOptions,
  ) => Promise<Phase48DecisionReport>;
}

export type Phase48HostedSurface =
  | "cloud_sync"
  | "hosted_dashboard"
  | "team_workspace";

export type Phase48SurfaceDecision = "no_go" | "requires_pilot_design";

export interface Phase48DecisionReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  decision: {
    decision: Phase48SurfaceDecision;
    reason: string;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-48-decision-report.ts";
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
  mode: "dashboard-cloud-sync-team-workspace-decision";
  outputDir: string;
  phase: "phase-48";
  pilot: {
    decision: Phase48SurfaceDecision;
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
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
  surfaceDecisions: Array<{
    blockers: string[];
    decision: Phase48SurfaceDecision;
    requiredBeforeReconsideration: string[];
    surface: Phase48HostedSurface;
  }>;
  threatModel: {
    auditRequired: true;
    authRequired: true;
    deletionRequired: true;
    exportRequired: true;
    rawTranscriptDefault: "blocked";
    redactionRequired: true;
    tenancyRequired: true;
  };
  viewerBoundary: {
    browserExecutedMutationAllowed: false;
    localViewerRemainsLocalOnly: boolean;
    localViewerRemainsReadOnly: boolean;
    separateHostedSurfaceRequired: true;
  };
}

interface Phase44GateSnapshot {
  acceptance?: { decision?: unknown };
  evidence?: {
    noRootApiWidening?: unknown;
    readOnlySecurityContracts?: unknown;
  };
  generatedBy?: unknown;
  phase?: unknown;
  runId?: unknown;
}

interface Phase45ReportSnapshot {
  acceptance?: { decision?: unknown };
  generatedBy?: unknown;
  metrics?: {
    firstUsefulRecallRate?: unknown;
    missedRecallRate?: unknown;
    noMemoryLeakRate?: unknown;
    staleMemoryRate?: unknown;
    wrongRecallRate?: unknown;
  };
  mode?: unknown;
  phase?: unknown;
  rawTranscriptPersistence?: { persistedRawTranscripts?: unknown };
  runId?: unknown;
  scenarios?: unknown;
  scope?: {
    inScope?: unknown;
    outOfScope?: unknown;
  };
}

interface Phase46GateSnapshot {
  acceptance?: { decision?: unknown };
  commands?: unknown;
  evidence?: {
    noRootApiWidening?: unknown;
    qualityRepairBoundary?: unknown;
    qualityReportMetrics?: {
      providerBackedPromotionSeparated?: unknown;
    };
  };
  generatedBy?: unknown;
  phase?: unknown;
  runId?: unknown;
}

interface Phase47GateSnapshot {
  acceptance?: { decision?: unknown };
  commands?: unknown;
  evidence?: {
    noRootApiWidening?: unknown;
    providerReportMetrics?: {
      fallbackVisibleCount?: unknown;
      providerBackedObservedCount?: unknown;
      rulesOnlyDefaultPreserved?: unknown;
      setupFragilityDelta?: unknown;
      staleRecallDelta?: unknown;
      usefulRecallDelta?: unknown;
      wrongRecallDelta?: unknown;
    };
  };
  generatedBy?: unknown;
  phase?: unknown;
  runId?: unknown;
}

interface ParsedPhase44Gate {
  readOnlySecurityContracts: boolean;
  runId: string;
  status: "accepted" | "blocked";
}

interface ParsedPhase45Report {
  hostedSurfaceEvidenceObserved: boolean;
  localViewerInspectionObserved: boolean;
  noMemoryBaselineObserved: boolean;
  runId: string;
  scenarioCount: number;
  status: "accepted" | "blocked";
}

interface ParsedPhase46Gate {
  hostedSurfaceEvidenceObserved: boolean;
  providerBackedPromotionSeparated: boolean;
  qualityRepairBoundary: boolean;
  runId: string;
  status: "accepted" | "blocked";
}

interface ParsedPhase47Gate {
  explicitHybridOnly: boolean;
  hostedSurfaceEvidenceObserved: boolean;
  rulesOnlyDefaultPreserved: boolean;
  runId: string;
  status: "accepted" | "blocked";
}

const GENERATED_BY = "scripts/run-phase-48-decision-report.ts";
const CANONICAL_PHASE44_GATE_RUN_ID = "run-20260426160000";
const CANONICAL_PHASE45_ADOPTION_RUN_ID = "run-20260427104530-adoption-eval";
const CANONICAL_PHASE46_GATE_RUN_ID = "run-20260428110000";
const CANONICAL_PHASE47_GATE_RUN_ID = "run-20260428123000";
const HOSTED_SURFACES: Phase48HostedSurface[] = [
  "hosted_dashboard",
  "cloud_sync",
  "team_workspace",
];
const HOSTED_SURFACE_KEYWORDS = [
  "account",
  "analytics",
  "cloud",
  "dashboard",
  "hosted",
  "team workspace",
  "team_workspace",
];
const PHASE48_IN_SCOPE = [
  "Phase 45-47 evidence-backed hosted surface decision",
  "dashboard, cloud sync, and team workspace privacy boundary",
  "local viewer versus hosted product split",
  "pilot or no-go closure path",
] as const;
const PHASE48_OUT_OF_SCOPE = [
  "implementing hosted dashboard, account, cloud sync, or team workspace runtime",
  "turning the Phase 44 local viewer into a hosted dashboard",
  "browser-executed mutation on the local viewer",
  "raw transcript archive as a default product feature",
  "root public API widening",
] as const;
const RECONSIDERATION_TRIGGERS = [
  "reference-product users cannot complete core memory workflows without cross-device sync",
  "team adoption requires shared memory review with explicit tenancy and deletion semantics",
  "local-only inspectability becomes a measured adoption blocker after redacted product evidence",
] as const;
const NO_GO_REASONS = [
  "Phase 45 proved reference-product value without hosted dashboard, cloud sync, team workspace, account, or analytics scope.",
  "Phase 46 quality gaps were addressed through local memory-quality repair, not a hosted surface.",
  "Phase 47 provider-backed need was explicit hybrid retrieval, not dashboard, cloud, or team workspace infrastructure.",
  "Phase 44 already preserves local inspectability as token-gated, local-only, read-only viewer behavior.",
] as const;
const REQUIRED_BEFORE_RECONSIDERATION = [
  "concrete adoption blocker tied to the hosted/shared surface",
  "auth and tenancy model",
  "redaction and raw-transcript persistence policy",
  "export, deletion, and audit semantics",
  "separate hosted product design that does not mutate the local viewer contract",
] as const;

export function resolvePhase48DecisionReportOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-48");
}

export function resolvePhase48CanonicalPhase44GatePath(root: string): string {
  return join(
    root,
    "reports/quality-gates/phase-44",
    CANONICAL_PHASE44_GATE_RUN_ID,
    "phase-44-quality-gate.json",
  );
}

export function resolvePhase48CanonicalPhase45ReportPath(root: string): string {
  return join(
    root,
    "reports/eval/adoption/phase-45",
    CANONICAL_PHASE45_ADOPTION_RUN_ID,
    "report.json",
  );
}

export function resolvePhase48CanonicalPhase46GatePath(root: string): string {
  return join(
    root,
    "reports/quality-gates/phase-46",
    CANONICAL_PHASE46_GATE_RUN_ID,
    "phase-46-quality-gate.json",
  );
}

export function resolvePhase48CanonicalPhase47GatePath(root: string): string {
  return join(
    root,
    "reports/quality-gates/phase-47",
    CANONICAL_PHASE47_GATE_RUN_ID,
    "phase-47-quality-gate.json",
  );
}

export function buildPhase48DecisionReportRunId(timestamp: string): string {
  const value =
    timestamp.replace(/\D/gu, "").slice(0, 14) || "phase48decision";
  return `run-${value}-dashboard-cloud-decision`;
}

export function parsePhase48DecisionReportCliOptions(
  argv: readonly string[],
): Phase48DecisionReportOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    phase44GatePath: resolveCliFlagValue(argv, "--phase44-gate-path"),
    phase45ReportPath: resolveCliFlagValue(argv, "--phase45-report-path"),
    phase46GatePath: resolveCliFlagValue(argv, "--phase46-gate-path"),
    phase47GatePath: resolveCliFlagValue(argv, "--phase47-gate-path"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function isAcceptedStatus(value: unknown): value is "accepted" | "blocked" {
  return value === "accepted" || value === "blocked";
}

function hasText(value: unknown, pattern: RegExp): boolean {
  return typeof value === "string" && pattern.test(value);
}

function includesText(values: unknown, pattern: RegExp): boolean {
  return Array.isArray(values) && values.some((value) => hasText(value, pattern));
}

function hasHostedSurfaceSignal(values: unknown): boolean {
  return HOSTED_SURFACE_KEYWORDS.some((keyword) =>
    includesText(values, new RegExp(keyword.replace("_", "[ _-]"), "iu"))
  );
}

function parseCommandJson(commands: unknown, label: string): unknown {
  if (!Array.isArray(commands)) {
    return undefined;
  }

  const command = commands.find((candidate) =>
    typeof candidate === "object" &&
    candidate !== null &&
    "label" in candidate &&
    candidate.label === label &&
    "stdout" in candidate &&
    typeof candidate.stdout === "string"
  );

  if (
    typeof command !== "object" ||
    command === null ||
    !("stdout" in command) ||
    typeof command.stdout !== "string"
  ) {
    return undefined;
  }

  try {
    return JSON.parse(command.stdout);
  } catch {
    return undefined;
  }
}

function parseScopeFromCommandReport(
  commands: unknown,
  label: string,
): { hostedSurfaceEvidenceObserved: boolean; hostedSurfaceOutOfScope: boolean } {
  const report = parseCommandJson(commands, label);
  const scope =
    typeof report === "object" && report !== null && "scope" in report
      ? report.scope
      : undefined;
  const inScope =
    typeof scope === "object" && scope !== null && "inScope" in scope
      ? scope.inScope
      : undefined;
  const outOfScope =
    typeof scope === "object" && scope !== null && "outOfScope" in scope
      ? scope.outOfScope
      : undefined;

  return {
    hostedSurfaceEvidenceObserved: hasHostedSurfaceSignal(inScope),
    hostedSurfaceOutOfScope:
      includesText(outOfScope, /hosted dashboard/u) &&
      includesText(outOfScope, /cloud sync/u) &&
      includesText(outOfScope, /team workspace/u),
  };
}

function parsePhase44Gate(raw: string): ParsedPhase44Gate {
  const parsed = JSON.parse(raw) as Phase44GateSnapshot;

  if (
    !isAcceptedStatus(parsed.acceptance?.decision) ||
    parsed.generatedBy !== "scripts/run-phase-44-gate.ts" ||
    parsed.phase !== "phase-44" ||
    parsed.runId !== CANONICAL_PHASE44_GATE_RUN_ID ||
    parsed.evidence?.noRootApiWidening !== true ||
    typeof parsed.evidence.readOnlySecurityContracts !== "boolean"
  ) {
    throw new Error("Phase 44 local viewer gate does not match the expected schema.");
  }

  return {
    readOnlySecurityContracts: parsed.evidence.readOnlySecurityContracts,
    runId: parsed.runId,
    status: parsed.acceptance.decision,
  };
}

function parsePhase45Report(raw: string): ParsedPhase45Report {
  const parsed = JSON.parse(raw) as Phase45ReportSnapshot;
  const scenarios = Array.isArray(parsed.scenarios) ? parsed.scenarios : [];
  const scenarioFamilies = scenarios
    .map((scenario) =>
      typeof scenario === "object" &&
      scenario !== null &&
      "family" in scenario &&
      typeof scenario.family === "string"
        ? scenario.family
        : ""
    )
    .filter((family) => family.length > 0);
  const outOfScope = parsed.scope?.outOfScope;
  const inScope = parsed.scope?.inScope;

  if (
    !isAcceptedStatus(parsed.acceptance?.decision) ||
    parsed.generatedBy !== "scripts/run-phase-45-adoption-eval.ts" ||
    parsed.mode !== "reference-product-adoption-eval" ||
    parsed.phase !== "phase-45" ||
    parsed.runId !== CANONICAL_PHASE45_ADOPTION_RUN_ID ||
    parsed.rawTranscriptPersistence?.persistedRawTranscripts !== false ||
    !Array.isArray(outOfScope) ||
    !includesText(outOfScope, /hosted dashboard/u) ||
    !includesText(outOfScope, /cloud sync/u) ||
    !includesText(outOfScope, /team workspace/u) ||
    !includesText(outOfScope, /raw transcript archive/u) ||
    typeof parsed.metrics?.firstUsefulRecallRate !== "number" ||
    typeof parsed.metrics.missedRecallRate !== "number" ||
    typeof parsed.metrics.wrongRecallRate !== "number" ||
    typeof parsed.metrics.staleMemoryRate !== "number" ||
    scenarios.length < 1 ||
    !scenarioFamilies.includes("local_viewer_trace_writeback_session_inspection")
  ) {
    throw new Error("Phase 45 adoption report does not match the expected schema.");
  }

  const noMemoryBaselineObserved = scenarios.some((scenario) =>
    typeof scenario === "object" &&
    scenario !== null &&
    "noMemory" in scenario &&
    typeof scenario.noMemory === "object" &&
    scenario.noMemory !== null &&
    "observed" in scenario.noMemory &&
    scenario.noMemory.observed === true
  );
  const hostedSurfaceEvidenceObserved =
    hasHostedSurfaceSignal(inScope) || hasHostedSurfaceSignal(scenarioFamilies);

  return {
    hostedSurfaceEvidenceObserved,
    localViewerInspectionObserved: scenarioFamilies.includes(
      "local_viewer_trace_writeback_session_inspection",
    ),
    noMemoryBaselineObserved,
    runId: parsed.runId,
    scenarioCount: scenarios.length,
    status: parsed.acceptance.decision,
  };
}

function parsePhase46Gate(raw: string): ParsedPhase46Gate {
  const parsed = JSON.parse(raw) as Phase46GateSnapshot;
  const qualityReportScope = parseScopeFromCommandReport(
    parsed.commands,
    "phase-46-quality-eval",
  );

  if (
    !isAcceptedStatus(parsed.acceptance?.decision) ||
    parsed.generatedBy !== "scripts/run-phase-46-gate.ts" ||
    parsed.phase !== "phase-46" ||
    parsed.runId !== CANONICAL_PHASE46_GATE_RUN_ID ||
    parsed.evidence?.noRootApiWidening !== true ||
    typeof parsed.evidence.qualityRepairBoundary !== "boolean" ||
    typeof parsed.evidence.qualityReportMetrics?.providerBackedPromotionSeparated !==
      "boolean" ||
    !qualityReportScope.hostedSurfaceOutOfScope
  ) {
    throw new Error("Phase 46 quality gate does not match the expected schema.");
  }

  return {
    hostedSurfaceEvidenceObserved:
      qualityReportScope.hostedSurfaceEvidenceObserved,
    providerBackedPromotionSeparated:
      parsed.evidence.qualityReportMetrics.providerBackedPromotionSeparated,
    qualityRepairBoundary: parsed.evidence.qualityRepairBoundary,
    runId: parsed.runId,
    status: parsed.acceptance.decision,
  };
}

function parsePhase47Gate(raw: string): ParsedPhase47Gate {
  const parsed = JSON.parse(raw) as Phase47GateSnapshot;
  const metrics = parsed.evidence?.providerReportMetrics;
  const providerReportScope = parseScopeFromCommandReport(
    parsed.commands,
    "phase-47-provider-rollout-eval",
  );

  if (
    !isAcceptedStatus(parsed.acceptance?.decision) ||
    parsed.generatedBy !== "scripts/run-phase-47-gate.ts" ||
    parsed.phase !== "phase-47" ||
    parsed.runId !== CANONICAL_PHASE47_GATE_RUN_ID ||
    parsed.evidence?.noRootApiWidening !== true ||
    typeof metrics?.fallbackVisibleCount !== "number" ||
    typeof metrics.providerBackedObservedCount !== "number" ||
    typeof metrics.rulesOnlyDefaultPreserved !== "boolean" ||
    typeof metrics.setupFragilityDelta !== "number" ||
    typeof metrics.staleRecallDelta !== "number" ||
    typeof metrics.usefulRecallDelta !== "number" ||
    typeof metrics.wrongRecallDelta !== "number" ||
    !providerReportScope.hostedSurfaceOutOfScope
  ) {
    throw new Error("Phase 47 provider rollout gate does not match the expected schema.");
  }

  const explicitHybridOnly =
    metrics.providerBackedObservedCount > 0 &&
    metrics.fallbackVisibleCount > 0 &&
    metrics.usefulRecallDelta >= 1 &&
    metrics.wrongRecallDelta <= 0 &&
    metrics.staleRecallDelta <= 0 &&
    metrics.setupFragilityDelta <= 0 &&
    metrics.rulesOnlyDefaultPreserved;

  return {
    explicitHybridOnly,
    hostedSurfaceEvidenceObserved:
      providerReportScope.hostedSurfaceEvidenceObserved,
    rulesOnlyDefaultPreserved: metrics.rulesOnlyDefaultPreserved,
    runId: parsed.runId,
    status: parsed.acceptance.decision,
  };
}

function buildSurfaceDecisions(
  decision: Phase48SurfaceDecision,
): Phase48DecisionReport["surfaceDecisions"] {
  return HOSTED_SURFACES.map((surface) => ({
    blockers: [...NO_GO_REASONS],
    decision,
    requiredBeforeReconsideration: [...REQUIRED_BEFORE_RECONSIDERATION],
    surface,
  }));
}

async function readText(
  path: string,
  dependencies: Phase48DecisionReportDependencies,
): Promise<string> {
  if (dependencies.readTextFile) {
    return await dependencies.readTextFile(path);
  }
  return await readFile(path, "utf8");
}

export async function runPhase48DecisionReport(
  options: Phase48DecisionReportOptions = {},
  dependencies: Phase48DecisionReportDependencies = {},
): Promise<Phase48DecisionReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now?.() ?? new Date().toISOString();
  const outputDir = options.outputDir ?? resolvePhase48DecisionReportOutputDir(root);
  const runId = options.runId ?? buildPhase48DecisionReportRunId(now);
  const runDirectory = join(outputDir, runId);
  const phase44GatePath =
    options.phase44GatePath ?? resolvePhase48CanonicalPhase44GatePath(root);
  const phase45ReportPath =
    options.phase45ReportPath ?? resolvePhase48CanonicalPhase45ReportPath(root);
  const phase46GatePath =
    options.phase46GatePath ?? resolvePhase48CanonicalPhase46GatePath(root);
  const phase47GatePath =
    options.phase47GatePath ?? resolvePhase48CanonicalPhase47GatePath(root);
  const phase44 = parsePhase44Gate(await readText(phase44GatePath, dependencies));
  const phase45 = parsePhase45Report(await readText(phase45ReportPath, dependencies));
  const phase46 = parsePhase46Gate(await readText(phase46GatePath, dependencies));
  const phase47 = parsePhase47Gate(await readText(phase47GatePath, dependencies));
  const productEvidence = {
    hostedSurfaceEvidenceObserved:
      phase45.hostedSurfaceEvidenceObserved ||
      phase46.hostedSurfaceEvidenceObserved ||
      phase47.hostedSurfaceEvidenceObserved,
    memoryQualityNeedAddressedLocally:
      phase46.qualityRepairBoundary &&
      phase46.providerBackedPromotionSeparated,
    providerBackedNeedAddressedByExplicitHybrid:
      phase47.explicitHybridOnly &&
      phase47.rulesOnlyDefaultPreserved,
    referenceProductAdoptionProven:
      phase45.noMemoryBaselineObserved &&
      phase45.localViewerInspectionObserved &&
      phase45.scenarioCount >= 12,
  };
  const viewerBoundary = {
    browserExecutedMutationAllowed: false,
    localViewerRemainsLocalOnly: phase44.readOnlySecurityContracts,
    localViewerRemainsReadOnly: phase44.readOnlySecurityContracts,
    separateHostedSurfaceRequired: true,
  } as const;
  const decision: Phase48SurfaceDecision =
    productEvidence.hostedSurfaceEvidenceObserved
      ? "requires_pilot_design"
      : "no_go";
  const accepted =
    phase44.status === "accepted" &&
    phase45.status === "accepted" &&
    phase46.status === "accepted" &&
    phase47.status === "accepted" &&
    decision === "no_go" &&
    productEvidence.referenceProductAdoptionProven &&
    productEvidence.memoryQualityNeedAddressedLocally &&
    productEvidence.providerBackedNeedAddressedByExplicitHybrid &&
    viewerBoundary.localViewerRemainsLocalOnly &&
    viewerBoundary.localViewerRemainsReadOnly;
  const report: Phase48DecisionReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 48 accepts a no-go decision for hosted dashboard, cloud sync, and team workspace because Phase 45-47 evidence proves local/reference-product value, quality repair, and explicit provider-backed retrieval without a concrete hosted-surface adoption blocker."
        : "Phase 48 decision report blocked because prerequisite evidence, local viewer boundaries, or hosted-surface decision inputs are incomplete.",
    },
    decision: {
      decision,
      reason:
        decision === "no_go"
          ? "No concrete hosted dashboard, cloud sync, or team workspace adoption blocker is present in Phase 45-47 evidence."
          : "Hosted/shared evidence appeared, so a separate pilot design is required before closure.",
    },
    generatedAt: now,
    generatedBy: GENERATED_BY,
    inputs: {
      phase44LocalViewerGate: {
        readOnlySecurityContracts: phase44.readOnlySecurityContracts,
        reportPath: phase44GatePath,
        runId: phase44.runId,
        status: phase44.status,
      },
      phase45AdoptionReport: {
        localViewerInspectionObserved: phase45.localViewerInspectionObserved,
        noMemoryBaselineObserved: phase45.noMemoryBaselineObserved,
        reportPath: phase45ReportPath,
        runId: phase45.runId,
        scenarioCount: phase45.scenarioCount,
        status: phase45.status,
      },
      phase46QualityGate: {
        hostedSurfaceEvidenceObserved: phase46.hostedSurfaceEvidenceObserved,
        providerBackedPromotionSeparated: phase46.providerBackedPromotionSeparated,
        qualityRepairBoundary: phase46.qualityRepairBoundary,
        reportPath: phase46GatePath,
        runId: phase46.runId,
        status: phase46.status,
      },
      phase47ProviderRolloutGate: {
        explicitHybridOnly: phase47.explicitHybridOnly,
        hostedSurfaceEvidenceObserved: phase47.hostedSurfaceEvidenceObserved,
        reportPath: phase47GatePath,
        rulesOnlyDefaultPreserved: phase47.rulesOnlyDefaultPreserved,
        runId: phase47.runId,
        status: phase47.status,
      },
    },
    mode: "dashboard-cloud-sync-team-workspace-decision",
    outputDir,
    phase: "phase-48",
    pilot: {
      decision,
      noGoReasons: [...NO_GO_REASONS],
      reconsiderationTriggers: [...RECONSIDERATION_TRIGGERS],
      smallestSafePilot: null,
    },
    productEvidence,
    rawTranscriptPersistence: {
      persistedRawTranscripts: false,
      policy: "blocked_by_default",
    },
    runDirectory,
    runId,
    scope: {
      inScope: [...PHASE48_IN_SCOPE],
      outOfScope: [...PHASE48_OUT_OF_SCOPE],
    },
    surfaceDecisions: buildSurfaceDecisions(decision),
    threatModel: {
      auditRequired: true,
      authRequired: true,
      deletionRequired: true,
      exportRequired: true,
      rawTranscriptDefault: "blocked",
      redactionRequired: true,
      tenancyRequired: true,
    },
    viewerBoundary,
  };

  await (dependencies.ensureDir ?? mkdir)(runDirectory, { recursive: true });
  await (dependencies.writeTextFile ?? writeFile)(
    join(runDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

export async function runPhase48DecisionReportCli(
  dependencies: Phase48DecisionReportCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? Bun.argv;
  const exit = dependencies.exit ?? process.exit;
  const log = dependencies.log ?? console.log;
  const runReport = dependencies.runReport ?? runPhase48DecisionReport;
  const report = await runReport(parsePhase48DecisionReportCliOptions(argv));
  log(JSON.stringify(report, null, 2));
  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }
}

if (import.meta.main) {
  await runPhase48DecisionReportCli();
}
