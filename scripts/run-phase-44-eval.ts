import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ExportMemoryResult,
  RecallInput,
  RecallResult,
} from "../src/api/contracts";
import type { MemoryScope } from "../src/domain/scope";
import type { InstalledHostWritebackAuditInspection } from "../src/install/hostWritebackAuditRuntime";
import {
  buildProgressiveScopeDigest,
  createProgressiveRecallService,
  encodeGoodMemoryRecordRef,
} from "../src/progressive/recall";
import {
  createRuntimeViewerApp,
  normalizeRuntimeViewerBindHost,
} from "../src/runtime-viewer/public";
import type { RuntimeWorkerStatusResult } from "../src/runtime-worker/contracts";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase44EvalOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase44EvalDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase44EvalCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runEval?: (options?: Phase44EvalOptions) => Promise<Phase44EvalReport>;
}

export interface Phase44EvalReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  cases: {
    auditTraceSessionViewsPass: boolean;
    handoffReadOnlyPass: boolean;
    localBindPass: boolean;
    noCorsPass: boolean;
    noMutationRoutesPass: boolean;
    noRawTranscriptPass: boolean;
    noRootApiWideningPass: boolean;
    packageLicenseHygienePass: boolean;
    progressiveDrilldownPass: boolean;
    staticShellPass: boolean;
    tokenSecurityPass: boolean;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-44-eval.ts";
  mode: "fallback";
  outputDir: string;
  phase: "phase-44";
  runDirectory: string;
  runId: string;
  summary: {
    passCount: number;
    totalChecks: number;
  };
}

const GENERATED_BY = "scripts/run-phase-44-eval.ts";
const PHASE44_TOKEN = "phase44-local-viewer-token";
const PHASE44_SCOPE: MemoryScope = {
  agentId: "codex",
  sessionId: "phase44-session-secret",
  tenantId: "phase44-tenant-secret",
  userId: "phase44-user-secret",
  workspaceId: "phase44-workspace-secret",
};
const PHASE44_SCOPE_DIGEST_SECRET = "phase44-progressive-scope-secret";

export function resolvePhase44FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-44");
}

export function buildPhase44FallbackRunId(nowIso: string): string {
  return `run-${nowIso.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "")}`;
}

export function parsePhase44EvalCliOptions(
  argv: readonly string[],
): Phase44EvalOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export async function runPhase44FallbackEval(
  options: Phase44EvalOptions = {},
  dependencies: Phase44EvalDependencies = {},
): Promise<Phase44EvalReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now?.() ?? new Date().toISOString();
  const outputDir = options.outputDir ?? resolvePhase44FallbackOutputDir(root);
  const runId = options.runId ?? buildPhase44FallbackRunId(now);
  const runDirectory = join(outputDir, runId);
  await (dependencies.ensureDir ?? mkdir)(runDirectory, { recursive: true });

  const memory = createPhase44Memory();
  const scopeDigest = buildProgressiveScopeDigest({
    scope: PHASE44_SCOPE,
    secret: PHASE44_SCOPE_DIGEST_SECRET,
  });
  const app = createRuntimeViewerApp({
    host: "codex",
    loadRuntimeWorkerStatus: async () => createPhase44WorkerStatus(),
    loadWritebackAudit: async () => createPhase44Audit(),
    memory,
    now: () => new Date(now),
    progressiveRecall: createProgressiveRecallService({
      memory,
      scopeDigestSecret: PHASE44_SCOPE_DIGEST_SECRET,
    }),
    scope: PHASE44_SCOPE,
    scopeDigest,
    token: PHASE44_TOKEN,
  });

  const unauthorized = await app.fetch(new Request("http://127.0.0.1/api/summary"));
  const summaryResponse = await app.fetch(authorized("/api/summary?query=viewer"));
  const summary = await summaryResponse.json() as Record<string, unknown>;
  const summaryJson = JSON.stringify(summary);
  const shellResponse = await app.fetch(authorized("/?token=phase44-local-viewer-token"));
  const shell = await shellResponse.text();
  const mutation = await app.fetch(new Request("http://127.0.0.1/api/records", {
    headers: { authorization: `Bearer ${PHASE44_TOKEN}` },
    method: "POST",
  }));
  const indexResponse = await app.fetch(authorized("/api/recall-index?query=viewer"));
  const index = await indexResponse.json() as {
    records?: Array<{ recordKind: string; recordRef: string }>;
  };
  const recordRef = index.records?.find((record) => record.recordKind === "fact")
    ?.recordRef;
  const detail = recordRef
    ? await app.fetch(authorized(`/api/records?recordRef=${encodeURIComponent(recordRef)}`))
    : null;
  const crossScopeRef = encodeGoodMemoryRecordRef({
    id: "phase44-fact-1",
    recordKind: "fact",
    scopeDigest: "scope_other",
  });
  const crossScope = await app.fetch(
    authorized(`/api/records?recordRef=${encodeURIComponent(crossScopeRef)}`),
  );
  const handoff = recordRef
    ? await (await app.fetch(
        authorized(`/api/handoff?action=forget&recordRef=${encodeURIComponent(recordRef)}`),
      )).json() as Record<string, unknown>
    : {};
  const crossScopeHandoff = await app.fetch(
    authorized(`/api/handoff?action=forget&recordRef=${encodeURIComponent(crossScopeRef)}`),
  );
  const detailJson = detail ? JSON.stringify(await detail.json()) : "";
  const rootSource = await readText(join(root, "src/index.ts"), dependencies);
  const packageJson = JSON.parse(
    await readText(join(root, "package.json"), dependencies),
  ) as {
    exports?: Record<string, unknown>;
    files?: string[];
  };

  const tokenSecurityPass = unauthorized.status === 401 && summaryResponse.status === 200;
  const noCorsPass =
    !summaryResponse.headers.has("access-control-allow-origin") &&
    !shellResponse.headers.has("access-control-allow-origin");
  const noMutationRoutesPass = mutation.status === 405;
  const staticShellPass =
    shell.includes("GoodMemory Local Viewer") &&
    shell.includes("/api/summary") &&
    shell.includes("function html(value)") &&
    !shell.includes("https://") &&
    !shell.includes("raw transcript");
  const progressiveDrilldownPass =
    Boolean(recordRef?.startsWith("gmrec:v1:")) &&
    detail?.status === 200 &&
    crossScope.status === 403;
  const auditTraceSessionViewsPass =
    summaryJson.includes("writebackAudit") &&
    summaryJson.includes("runtimeSessions") &&
    summaryJson.includes("traceSummaries") &&
    summaryJson.includes("phase44-trace-1");
  const handoffReadOnlyPass =
    handoff.executed === false &&
    typeof handoff.command === "string" &&
    String(handoff.command).includes("goodmemory forget") &&
    crossScopeHandoff.status >= 400;
  const noRawTranscriptPass =
    !summaryJson.includes("raw phase44 transcript") &&
    !summaryJson.includes("phase44@example.com") &&
    !summaryJson.includes("sk-phase44secret") &&
    !detailJson.includes("raw phase44 transcript") &&
    !detailJson.includes(PHASE44_SCOPE.userId) &&
    !detailJson.includes(PHASE44_SCOPE.sessionId ?? "");
  const localBindPass =
    normalizeRuntimeViewerBindHost(undefined) === "127.0.0.1" &&
    throwsLocalBindError("0.0.0.0");
  const noRootApiWideningPass =
    !rootSource.includes("runtime-viewer") &&
    !rootSource.includes("createRuntimeViewerApp") &&
    !rootSource.includes("serveRuntimeViewer");
  const packageLicenseHygienePass =
    packageJson.exports?.["./runtime-viewer"] === undefined &&
    !(packageJson.files ?? []).includes("third-party") &&
    !(packageJson.files ?? []).includes("third-party/claude-mem-main");

  const cases = {
    auditTraceSessionViewsPass,
    handoffReadOnlyPass,
    localBindPass,
    noCorsPass,
    noMutationRoutesPass,
    noRawTranscriptPass,
    noRootApiWideningPass,
    packageLicenseHygienePass,
    progressiveDrilldownPass,
    staticShellPass,
    tokenSecurityPass,
  };
  const passCount = Object.values(cases).filter(Boolean).length;
  const totalChecks = Object.values(cases).length;
  const accepted = passCount === totalChecks;
  const report: Phase44EvalReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Local Viewer passed token, 127.0.0.1, no-CORS, no-mutation, static shell, progressive drill-down, audit/trace/session, handoff, redaction, and package-boundary checks."
        : "Local Viewer failed one or more deterministic checks.",
    },
    cases,
    generatedAt: now,
    generatedBy: GENERATED_BY,
    mode: "fallback",
    outputDir,
    phase: "phase-44",
    runDirectory,
    runId,
    summary: {
      passCount,
      totalChecks,
    },
  };

  await (dependencies.writeTextFile ?? writeFile)(
    join(runDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

function createPhase44Memory() {
  const exported = createPhase44ExportedMemory();
  return {
    async exportMemory(input: { includeRuntime?: boolean; scope: MemoryScope }) {
      return {
        ...exported,
        runtime: input.includeRuntime === true ? exported.runtime : undefined,
        scope: input.scope,
      };
    },
    async recall(input: RecallInput): Promise<RecallResult> {
      return {
        archives: exported.durable.archives,
        episodes: exported.durable.episodes,
        evidence: exported.durable.evidence,
        facts: exported.durable.facts,
        feedback: exported.durable.feedback,
        journal: exported.runtime?.journal ?? null,
        metadata: {
          candidateTraces: [
            {
              explicitnessScore: 1,
              fallback: "none",
              freshnessScore: 1,
              intentScore: 1,
              lexicalScore: 1,
              memoryId: "phase44-fact-1",
              memoryType: "fact",
              returned: true,
              slot: "generic",
            },
          ],
          hits: [{ id: "phase44-fact-1", type: "fact" }],
          latencyMs: 1,
          policyApplied: ["phase44-viewer-read-only"],
          routingDecision: {
            actionDriving: false,
            continuation: false,
            intent: "general_assistance",
            referenceSeeking: false,
            requestedSlots: [],
            retrievalProfile: input.retrievalProfile ?? "coding_agent",
            sourcePriorities: [],
            strategy: "rules-only",
            strategyExplanation: {
              hardFloor: "lexical_runtime_procedural_priors",
              llmRefinement: false,
              requestedStrategy: "rules-only",
              resolvedStrategy: "rules-only",
              semanticTieBreaking: false,
              summary: "phase44 eval",
            },
            supportSlots: [],
          },
          tokenCount: 8,
          traceId: "phase44-trace-1",
          verificationHints: [],
        },
        packet: {},
        preferences: exported.durable.preferences,
        profile: exported.durable.profile,
        references: exported.durable.references,
        workingMemory: exported.runtime?.workingMemory ?? null,
      };
    },
  };
}

function createPhase44ExportedMemory(): ExportMemoryResult {
  return {
    artifacts: { files: [], rootPath: "." },
    durable: {
      archives: [
        {
          archivedAt: "2026-04-26T15:25:00.000Z",
          createdAt: "2026-04-26T15:20:00.000Z",
          id: "phase44-archive-1",
          keyDecisions: ["Viewer stays local and read-only."],
          normalizedTranscript: "raw phase44 transcript must stay hidden",
          referencedArtifacts: [],
          scopeLineage: [],
          sessionId: PHASE44_SCOPE.sessionId!,
          sourceSessionIds: [PHASE44_SCOPE.sessionId!],
          summary: "Phase 44 viewer closure.",
          unresolvedItems: [],
          userId: PHASE44_SCOPE.userId,
          workspaceId: PHASE44_SCOPE.workspaceId,
        },
      ],
      episodes: [],
      evidence: [],
      experiences: [],
      facts: [
        {
          accessCount: 0,
          category: "project",
          confidence: 1,
          content: "Phase 44 viewer is read-only.",
          createdAt: "2026-04-26T15:15:00.000Z",
          id: "phase44-fact-1",
          importance: 1,
          isActive: true,
          lifecycle: "active",
          source: {
            extractedAt: "2026-04-26T15:15:00.000Z",
            method: "explicit",
          },
          updatedAt: "2026-04-26T15:15:00.000Z",
          userId: PHASE44_SCOPE.userId,
          workspaceId: PHASE44_SCOPE.workspaceId,
        },
      ],
      feedback: [],
      preferences: [],
      profile: null,
      promotions: [],
      proposals: [],
      references: [],
    },
    exportedAt: "2026-04-26T15:30:00.000Z",
    runtime: {
      journal: {
        currentState: "Inspect phase44-session-secret safely.",
        errorsAndCorrections: [],
        filesAndFunctions: [],
        keyResults: [],
        learnings: ["Viewer has no mutation routes."],
        sessionId: PHASE44_SCOPE.sessionId!,
        systemDocumentation: [],
        title: "Phase 44 local viewer",
        updatedAt: "2026-04-26T15:30:00.000Z",
        userId: PHASE44_SCOPE.userId,
        workflow: [],
        worklog: ["Rendered local shell."],
      },
      spills: [],
      workingMemory: null,
    },
    scope: PHASE44_SCOPE,
  };
}

function createPhase44Audit(): InstalledHostWritebackAuditInspection {
  return {
    events: [
      {
        candidateKey: "phase44-candidate",
        command: "turn-end",
        contentPreview: "phase44@example.com token sk-phase44secret",
        eventId: "wb-phase44-1",
        forgottenLinkedRecordIds: [],
        forgottenMemoryIds: [],
        host: "codex",
        kind: "fact",
        linkedRecordExistsCount: 1,
        linkedRecordIds: [{ id: "phase44-fact-1", type: "memory" }],
        memoryExistsCount: 1,
        memoryIds: ["phase44-fact-1"],
        mode: "observe",
        occurredAt: "2026-04-26T15:25:00.000Z",
        reason: "token sk-phase44secret",
        recallHitCount: 0,
        recalledBy: [],
        scopeDigest: "scope:phase44-safe",
        source: "user",
        status: "observed",
        updatedAt: "2026-04-26T15:25:00.000Z",
      },
    ],
    host: "codex",
    legacyEventCount: 0,
    legacyUnscopedEventCount: 0,
    pendingCount: 0,
    scope: PHASE44_SCOPE,
  };
}

function createPhase44WorkerStatus(): RuntimeWorkerStatusResult {
  return {
    audits: [],
    counts: {
      coalesced: 0,
      failed: 0,
      queued: 0,
      running: 0,
      stuck: 0,
      succeeded: 0,
      total: 0,
    },
    daemon: { enabled: false, updatedAt: "2026-04-26T15:30:00.000Z" },
    jobs: [],
    jobsJson: "[]",
    queueFile: "/tmp/goodmemory-runtime-worker.json",
    stuckJobs: [],
  };
}

function authorized(path: string): Request {
  return new Request(`http://127.0.0.1${path}`, {
    headers: { authorization: `Bearer ${PHASE44_TOKEN}` },
  });
}

function throwsLocalBindError(value: string): boolean {
  try {
    normalizeRuntimeViewerBindHost(value);
    return false;
  } catch {
    return true;
  }
}

async function readText(
  path: string,
  dependencies: Phase44EvalDependencies,
): Promise<string> {
  if (dependencies.readTextFile) {
    return await dependencies.readTextFile(path);
  }
  return await readFile(path, "utf8");
}

export async function runPhase44EvalCli(
  dependencies: Phase44EvalCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? process.argv;
  const options = parsePhase44EvalCliOptions(argv);
  try {
    const report = await (dependencies.runEval ?? runPhase44FallbackEval)(options);
    dependencies.log?.(
      `Phase 44 deterministic eval ${report.acceptance.decision}: ${report.runDirectory}`,
    );
    if (report.acceptance.decision !== "accepted") {
      dependencies.exit?.(1);
      if (!dependencies.exit) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    dependencies.log?.(error instanceof Error ? error.message : String(error));
    dependencies.exit?.(1);
    if (!dependencies.exit) {
      process.exitCode = 1;
    }
  }
}

if (import.meta.main) {
  await runPhase44EvalCli({
    log: console.log,
  });
}
