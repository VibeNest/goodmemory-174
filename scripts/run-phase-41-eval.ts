import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createEvidenceRecord,
  createFeedbackMemory,
  createGoodMemory,
  createMemorySource,
  createSQLiteDocumentStore,
  createSQLiteSessionStore,
  EVIDENCE_COLLECTION,
} from "../src";
import type { GoodMemory } from "../src";
import { resolveHostActionExecutionPlan, createHostAdapter } from "../src/host";
import type {
  HostActionAssessmentResult,
  HostActionIntent,
  HostPlannedAction,
  HostRecommendedFirstStep,
} from "../src/host";
import { executeInstalledHostAction } from "../src/install/hostActionRuntime";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

type Phase41CaseId =
  | "command-rewrite"
  | "command-blocked-veto"
  | "low-risk-guidance";

type Phase41DeterministicFocus =
  | "rewrite"
  | "blocked_veto"
  | "low_risk_guidance";

interface Phase41MeasuredVariant {
  blocked: boolean;
  decision: "allow" | "allow_with_guidance" | "review_required" | "blocked";
  executed: boolean;
  executedStep?: string;
  guidance: string[];
  originalAction: string;
  reason: string;
  rewritten: boolean;
}

export interface Phase41DeterministicCaseResult {
  caseId: Phase41CaseId;
  focus: Phase41DeterministicFocus;
  frozenPhase34Wrapper: Phase41MeasuredVariant;
  installedPolicyBacked: Phase41MeasuredVariant;
  noMemory: Phase41MeasuredVariant;
  nonRegressionAgainstPhase34: boolean;
  winOverNoMemory: boolean;
}

export interface Phase41StorageParityCaseResult {
  actionTraceRecorded: boolean;
  caseId: "installed-storage-parity";
  configuredStoragePath: string;
  followupTraceRecorded: boolean;
  observedStoragePath: string;
  sharedInstalledStorage: boolean;
  toolResultEvidenceRecorded: boolean;
}

export interface Phase41DeterministicSummary {
  installedNonRegressionPassCount: number;
  installedWinOverNoMemoryCount: number;
  storageParityPassCount: number;
  totalCases: number;
}

export interface Phase41DeterministicReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  cases: Phase41DeterministicCaseResult[];
  comparison: {
    baselines: {
      frozenPhase34Wrapper: "frozen-phase34-wrapper";
      installedPolicyBacked: "installed-policy-backed";
      noMemory: "no-memory";
    };
  };
  evidence: {
    installedStorageParity: Phase41StorageParityCaseResult;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-41-eval.ts";
  mode: "fallback";
  outputDir: string;
  phase: "phase-41";
  runDirectory: string;
  runId: string;
  summary: Phase41DeterministicSummary;
}

export interface Phase41EvalOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase41EvalDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  removeDir?: (
    path: string,
    options?: {
      force?: boolean;
      recursive?: boolean;
    },
  ) => Promise<void>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase41EvalCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runEval?: (options?: Phase41EvalOptions) => Promise<Phase41DeterministicReport>;
}

interface Phase41CaseSpec {
  caseId: Phase41CaseId;
  command: string;
  focus: Phase41DeterministicFocus;
  prepare(
    memory: GoodMemory,
    documentStore: ReturnType<typeof createSQLiteDocumentStore>,
    scope: Phase41Scope,
  ): Promise<void>;
}

interface Phase41Scope {
  sessionId: string;
  userId: string;
  workspaceId: string;
}

const GENERATED_BY = "scripts/run-phase-41-eval.ts";
const PHASE41_USER_ID = "phase41-user";
const PHASE41_WORKSPACE_ID = "phase41-workspace";

const PHASE41_CASES: readonly Phase41CaseSpec[] = [
  {
    caseId: "command-rewrite",
    command: "./tools/DeepAnalyzer --detailed",
    focus: "rewrite",
    async prepare(_memory, documentStore, scope) {
      await seedPolicyMemory({
        documentStore,
        scope,
        evidenceExcerpt:
          "DeepAnalyzer detailed scan failed because QuickCheck had not run first.",
        rule: "Rather than DeepAnalyzer, use QuickCheck first.",
      });
    },
  },
  {
    caseId: "command-blocked-veto",
    command: "rm -rf AGENTS.md",
    focus: "blocked_veto",
    async prepare(_memory, documentStore, scope) {
      await seedPolicyMemory({
        documentStore,
        scope,
        evidenceExcerpt: "Deleting AGENTS.md broke the repo-local host bootstrap surface.",
        rule: "Never delete AGENTS.md from the host bootstrap surface.",
        why: "It breaks repo-local host wiring and package bootstrap continuity.",
      });
    },
  },
  {
    caseId: "low-risk-guidance",
    command: "./tools/QuickCheck --network",
    focus: "low_risk_guidance",
    async prepare(memory, _documentStore, scope) {
      await memory.runtime.startSession({ scope });
      await memory.runtime.updateWorkingMemory({
        scope,
        patch: {
          currentGoal: "Close the installed pre-action rollout.",
          temporaryDecisions: ["Use the current runbook before deploy."],
        },
      });
      await memory.runtime.updateSessionJournal({
        scope,
        patch: {
          currentState: "Deployment verification still needs the current runbook.",
          workflow: ["Review the exported session handoff"],
        },
      });
    },
  },
] as const;

export function resolvePhase41FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-41");
}

export function buildPhase41FallbackRunId(timestamp: string): string {
  return `run-${timestamp.replace(/\D/g, "").slice(0, 14) || "phase41"}`;
}

export function parsePhase41EvalCliOptions(
  argv: readonly string[],
): Phase41EvalOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function summarizeStep(
  step: HostPlannedAction | HostRecommendedFirstStep | undefined,
): string | undefined {
  if (!step) {
    return undefined;
  }

  switch (step.kind) {
    case "warning":
      return step.message;
    case "command":
      return step.command;
    case "tool_call":
      return step.raw?.trim() || step.toolName;
    case "file_edit":
      return `${step.operation} ${step.relativePath}`;
  }
}

function createScope(caseId: Phase41CaseId): Phase41Scope {
  return {
    sessionId: `phase41-session-${caseId}`,
    userId: PHASE41_USER_ID,
    workspaceId: PHASE41_WORKSPACE_ID,
  };
}

async function createSqliteMemory(sqlitePath: string): Promise<GoodMemory> {
  await mkdir(dirname(sqlitePath), { recursive: true });
  const documentStore = createSQLiteDocumentStore(sqlitePath);
  const sessionStore = createSQLiteSessionStore(sqlitePath);
  return createGoodMemory({
    adapters: {
      documentStore,
      sessionStore,
    },
    storage: {
      provider: "sqlite",
      url: sqlitePath,
    },
  });
}

async function writeInstalledCodexConfig(input: {
  homeRoot: string;
  sqlitePath: string;
  workspaceId: string;
  workspaceRoot: string;
}): Promise<void> {
  await mkdir(join(input.homeRoot, ".goodmemory"), { recursive: true });
  await mkdir(join(input.workspaceRoot, ".goodmemory"), { recursive: true });
  await writeFile(
    join(input.homeRoot, ".goodmemory/codex.json"),
    JSON.stringify(
      {
        activationMode: "workspace_opt_in",
        debug: false,
        host: "codex",
        maxTokens: 256,
        retrievalProfile: "coding_agent",
        storage: {
          path: input.sqlitePath,
          provider: "sqlite",
        },
        userId: PHASE41_USER_ID,
        version: 1,
        writeback: {
          allowAssistantOutput: "confirmed_or_verified",
          dryRun: false,
          maxChars: 12000,
          maxMessages: 12,
          minConfidence: 0.7,
          mode: "off",
          persistRawTranscript: false,
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await writeFile(
    join(input.workspaceRoot, ".goodmemory/codex.json"),
    JSON.stringify(
      {
        enabled: true,
        host: "codex",
        version: 1,
        workspaceId: input.workspaceId,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

async function seedPolicyMemory(input: {
  documentStore: ReturnType<typeof createSQLiteDocumentStore>;
  evidenceExcerpt: string;
  rule: string;
  scope: Phase41Scope;
  why?: string;
}): Promise<void> {
  const source = createMemorySource({
    method: "explicit",
    extractedAt: "2026-04-25T00:00:00.000Z",
    sessionId: input.scope.sessionId,
  });

  await input.documentStore.set(
    "feedback",
    `feedback-${input.scope.sessionId}`,
    createFeedbackMemory({
      id: `feedback-${input.scope.sessionId}`,
      userId: input.scope.userId,
      workspaceId: input.scope.workspaceId,
      sessionId: input.scope.sessionId,
      kind: "validated_pattern",
      appliesTo: "coding_agent",
      rule: input.rule,
      ...(input.why ? { why: input.why } : {}),
      evidence: [`evidence-${input.scope.sessionId}`],
      source,
    }),
  );
  await input.documentStore.set(
    EVIDENCE_COLLECTION,
    `evidence-${input.scope.sessionId}`,
    createEvidenceRecord({
      id: `evidence-${input.scope.sessionId}`,
      userId: input.scope.userId,
      workspaceId: input.scope.workspaceId,
      sessionId: input.scope.sessionId,
      kind: input.evidenceExcerpt.includes("broke")
        ? "verification_result"
        : "correction_context",
      excerpt: input.evidenceExcerpt,
      source,
      sourceMessageIds: [`message-${input.scope.sessionId}`],
    }),
  );
}

async function measureInstalledVariant(input: {
  caseId: Phase41CaseId;
  command: string;
  homeRoot: string;
  workspaceRoot: string;
}): Promise<Phase41MeasuredVariant & { actionId?: string; sqlitePath: string }> {
  const sessionId = createScope(input.caseId).sessionId;
  const sqlitePath = join(input.homeRoot, ".goodmemory", "memory.sqlite");
  const result = await executeInstalledHostAction(
    {
      command: input.command,
      cwd: input.workspaceRoot,
      homeRoot: input.homeRoot,
      host: "codex",
      sessionId,
      turnId: `turn-${input.caseId}`,
    },
    {
      runCommand: async (command) => ({
        exitCode: 0,
        stderr: "",
        stdout: command,
      }),
    },
  );
  const payload = result.payload as {
    actionId?: string;
    decision: Phase41MeasuredVariant["decision"];
    executed: boolean;
    executedStep?: string;
    guidance?: string[];
    originalAction: string;
    reason?: string;
    rewritten: boolean;
  };

  return {
    actionId: payload.actionId,
    blocked: payload.decision === "blocked",
    decision: payload.decision,
    executed: payload.executed,
    executedStep: payload.executedStep,
    guidance: payload.guidance ?? [],
    originalAction: payload.originalAction,
    reason: payload.reason ?? "",
    rewritten: payload.rewritten,
    sqlitePath,
  };
}

async function measureCompatibilityVariant(input: {
  caseId: Phase41CaseId;
  command: string;
  memory: Pick<GoodMemory, "exportMemory">;
}): Promise<Phase41MeasuredVariant> {
  const scope = createScope(input.caseId);
  const adapter = createHostAdapter({
    id: `phase41-${input.caseId}-compat`,
    hostKind: "codex",
    memory: input.memory,
  });
  const intent = createIntent({
    actionId: `phase41-${input.caseId}-compat-action`,
    command: input.command,
    scope,
  });
  const assessment = await adapter.assessAction(intent);
  const plan = resolveHostActionExecutionPlan({
    assessment,
    intent,
  });

  return measurePlanVariant({
    assessment,
    command: input.command,
    plan,
  });
}

function createIntent(input: {
  actionId: string;
  command: string;
  scope: Phase41Scope;
}): HostActionIntent {
  return {
    actionId: input.actionId,
    action: {
      kind: "command",
      command: input.command,
    },
    hostKind: "codex",
    occurredAt: "2026-04-25T00:00:00.000Z",
    runId: `run-${input.scope.sessionId}`,
    scope: input.scope,
    sequence: 0,
    turnId: `turn-${input.scope.sessionId}`,
  };
}

function measurePlanVariant(input: {
  assessment: HostActionAssessmentResult;
  command: string;
  plan: ReturnType<typeof resolveHostActionExecutionPlan>;
}): Phase41MeasuredVariant {
  return {
    blocked: input.plan.blocked,
    decision: input.assessment.decision,
    executed: !input.plan.blocked,
    executedStep: summarizeStep(input.plan.effectiveFirstStep),
    guidance: [...input.assessment.guidance],
    originalAction: input.command,
    reason: input.assessment.reason,
    rewritten: input.plan.rewritten,
  };
}

function createNonRegressionResult(input: {
  caseId: Phase41CaseId;
  frozenPhase34Wrapper: Phase41MeasuredVariant;
  installedPolicyBacked: Phase41MeasuredVariant;
}): boolean {
  const metadataParity =
    input.installedPolicyBacked.originalAction ===
      input.frozenPhase34Wrapper.originalAction &&
    input.installedPolicyBacked.reason === input.frozenPhase34Wrapper.reason &&
    sameStringArray(
      input.installedPolicyBacked.guidance,
      input.frozenPhase34Wrapper.guidance,
    );

  if (
    input.caseId === "command-rewrite" ||
    input.caseId === "command-blocked-veto"
  ) {
    return (
      input.installedPolicyBacked.decision === input.frozenPhase34Wrapper.decision &&
      input.installedPolicyBacked.executedStep ===
        input.frozenPhase34Wrapper.executedStep &&
      input.installedPolicyBacked.rewritten === input.frozenPhase34Wrapper.rewritten &&
      metadataParity
    );
  }

  return (
    !input.installedPolicyBacked.blocked &&
    input.installedPolicyBacked.decision === input.frozenPhase34Wrapper.decision &&
    metadataParity
  );
}

function createWinOverNoMemoryResult(input: {
  caseId: Phase41CaseId;
  installedPolicyBacked: Phase41MeasuredVariant;
  noMemory: Phase41MeasuredVariant;
}): boolean {
  if (input.caseId === "command-rewrite") {
    return (
      input.installedPolicyBacked.executedStep === "./tools/QuickCheck" &&
      input.noMemory.executedStep !== "./tools/QuickCheck"
    );
  }

  if (input.caseId === "command-blocked-veto") {
    return input.installedPolicyBacked.blocked && !input.noMemory.blocked;
  }

  return (
    !input.installedPolicyBacked.blocked &&
    input.installedPolicyBacked.decision === "allow_with_guidance" &&
    input.installedPolicyBacked.guidance.length > 0 &&
    input.noMemory.decision === "allow"
  );
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

async function measureStorageParity(input: {
  actionId?: string;
  caseId: Phase41CaseId;
  sqlitePath: string;
}): Promise<Phase41StorageParityCaseResult> {
  const scope = {
    ...createScope(input.caseId),
    agentId: "codex",
  };
  const memory = await createSqliteMemory(input.sqlitePath);
  const exported = await memory.exportMemory({
    includeRuntime: true,
    scope,
  });
  const actionId = input.actionId;
  const actionTraceRecorded = Boolean(
    actionId &&
      exported.durable.experiences.some((record) => record.traceId === actionId),
  );
  const followupTraceRecorded = Boolean(
    actionId &&
      exported.durable.experiences.some(
        (record) =>
          Array.isArray(record.sourceTraceIds) &&
          record.sourceTraceIds.includes(actionId) &&
          record.traceId !== actionId,
      ),
  );
  const toolResultEvidenceRecorded = exported.durable.evidence.some(
    (record) => record.kind === "tool_result_excerpt",
  );

  return {
    actionTraceRecorded,
    caseId: "installed-storage-parity",
    configuredStoragePath: input.sqlitePath,
    followupTraceRecorded,
    observedStoragePath: input.sqlitePath,
    sharedInstalledStorage:
      actionTraceRecorded && followupTraceRecorded && toolResultEvidenceRecorded,
    toolResultEvidenceRecorded,
  };
}

export async function runPhase41FallbackEval(
  options: Phase41EvalOptions = {},
  dependencies: Phase41EvalDependencies = {},
): Promise<Phase41DeterministicReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = options.outputDir ?? resolvePhase41FallbackOutputDir(root);
  const ensureDir = dependencies.ensureDir ?? mkdir;
  const removeDir = dependencies.removeDir ?? rm;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const timestamp = now();
  const runId = options.runId ?? buildPhase41FallbackRunId(timestamp);
  const runDirectory = join(outputDir, runId);
  const homeRoot = await mkdtemp(join(tmpdir(), "goodmemory-phase41-home-"));
  const workspaceRoot = await mkdtemp(join(tmpdir(), "goodmemory-phase41-workspace-"));
  const sqlitePath = join(homeRoot, ".goodmemory", "memory.sqlite");

  try {
    await ensureDir(runDirectory, { recursive: true });
    await writeInstalledCodexConfig({
      homeRoot,
      sqlitePath,
      workspaceId: PHASE41_WORKSPACE_ID,
      workspaceRoot,
    });

    const installedDocumentStore = createSQLiteDocumentStore(sqlitePath);
    const installedSessionStore = createSQLiteSessionStore(sqlitePath);
    const installedMemory = createGoodMemory({
      adapters: {
        documentStore: installedDocumentStore,
        sessionStore: installedSessionStore,
      },
      storage: {
        provider: "sqlite",
        url: sqlitePath,
      },
    });
    const compatibilitySqlitePath = join(
      homeRoot,
      ".goodmemory",
      "phase41-phase34.sqlite",
    );
    await mkdir(dirname(compatibilitySqlitePath), { recursive: true });
    const compatibilityDocumentStore = createSQLiteDocumentStore(
      compatibilitySqlitePath,
    );
    const compatibilitySessionStore = createSQLiteSessionStore(
      compatibilitySqlitePath,
    );
    const compatibilityMemory = createGoodMemory({
      adapters: {
        documentStore: compatibilityDocumentStore,
        sessionStore: compatibilitySessionStore,
      },
      storage: {
        provider: "sqlite",
        url: compatibilitySqlitePath,
      },
    });

    const cases: Phase41DeterministicCaseResult[] = [];
    let storageParity: Phase41StorageParityCaseResult | null = null;

    for (const caseSpec of PHASE41_CASES) {
      const scope = createScope(caseSpec.caseId);
      await caseSpec.prepare(installedMemory, installedDocumentStore, scope);
      await caseSpec.prepare(
        compatibilityMemory,
        compatibilityDocumentStore,
        scope,
      );

      const installedPolicyBacked = await measureInstalledVariant({
        caseId: caseSpec.caseId,
        command: caseSpec.command,
        homeRoot,
        workspaceRoot,
      });
      const frozenPhase34Wrapper = await measureCompatibilityVariant({
        caseId: caseSpec.caseId,
        command: caseSpec.command,
        memory: {
          exportMemory: compatibilityMemory.exportMemory.bind(compatibilityMemory),
        },
      });
      const emptyMemory = createGoodMemory({
        storage: {
          provider: "memory",
        },
      });
      const noMemory = await measureCompatibilityVariant({
        caseId: caseSpec.caseId,
        command: caseSpec.command,
        memory: {
          exportMemory: emptyMemory.exportMemory.bind(emptyMemory),
        },
      });

      cases.push({
        caseId: caseSpec.caseId,
        focus: caseSpec.focus,
        frozenPhase34Wrapper,
        installedPolicyBacked,
        noMemory,
        nonRegressionAgainstPhase34: createNonRegressionResult({
          caseId: caseSpec.caseId,
          frozenPhase34Wrapper,
          installedPolicyBacked,
        }),
        winOverNoMemory: createWinOverNoMemoryResult({
          caseId: caseSpec.caseId,
          installedPolicyBacked,
          noMemory,
        }),
      });

      if (caseSpec.caseId === "command-rewrite") {
        storageParity = await measureStorageParity({
          actionId: installedPolicyBacked.actionId,
          caseId: caseSpec.caseId,
          sqlitePath: installedPolicyBacked.sqlitePath,
        });
      }
    }

    if (storageParity === null) {
      throw new Error("Phase 41 deterministic eval failed to collect storage parity evidence.");
    }

    const summary: Phase41DeterministicSummary = {
      installedNonRegressionPassCount: cases.filter(
        (caseResult) => caseResult.nonRegressionAgainstPhase34,
      ).length,
      installedWinOverNoMemoryCount: cases.filter(
        (caseResult) => caseResult.winOverNoMemory,
      ).length,
      storageParityPassCount: storageParity.sharedInstalledStorage ? 1 : 0,
      totalCases: cases.length + 1,
    };

    const accepted =
      summary.installedNonRegressionPassCount === 3 &&
      summary.installedWinOverNoMemoryCount === 3 &&
      summary.storageParityPassCount === 1;
    const report: Phase41DeterministicReport = {
      acceptance: {
        decision: accepted ? "accepted" : "blocked",
        reason: accepted
          ? "Installed pre-action matched the frozen Phase 34 wrapper on rewrite, veto, and low-risk control, beat the no-memory baseline on every deterministic case, and wrote action evidence to the shared installed storage path."
          : "Installed pre-action did not satisfy the Phase 41 deterministic rewrite/veto/non-regression/storage parity contract.",
      },
      cases,
      comparison: {
        baselines: {
          frozenPhase34Wrapper: "frozen-phase34-wrapper",
          installedPolicyBacked: "installed-policy-backed",
          noMemory: "no-memory",
        },
      },
      evidence: {
        installedStorageParity: storageParity,
      },
      generatedAt: timestamp,
      generatedBy: GENERATED_BY,
      mode: "fallback",
      outputDir,
      phase: "phase-41",
      runDirectory,
      runId,
      summary,
    };

    await writeTextFile(
      join(runDirectory, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );

    return report;
  } finally {
    await removeDir(homeRoot, { force: true, recursive: true });
    await removeDir(workspaceRoot, { force: true, recursive: true });
  }
}

export async function main(
  dependencies: Phase41EvalCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? process.argv;
  const log = dependencies.log ?? console.log;
  const exit = dependencies.exit ?? process.exit;
  const runEval = dependencies.runEval ?? runPhase41FallbackEval;
  const report = await runEval(parsePhase41EvalCliOptions(argv));
  log(JSON.stringify(report, null, 2));
  exit(report.acceptance.decision === "accepted" ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
