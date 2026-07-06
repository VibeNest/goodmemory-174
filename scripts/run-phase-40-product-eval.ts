import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createGoodMemory,
  type GoodMemory,
  type GoodMemoryTraceSpan,
  type MemoryScope,
  type RecallResult,
  type RememberResult,
  type ReviseMemoryResult,
} from "../src";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase40ProductEvalOptions {
  outputDir?: string;
  runId?: string;
}

export type Phase40ProductEvalFocus =
  | "identity_background"
  | "historical_task_continuation"
  | "open_loop_recall"
  | "user_correction"
  | "feedback_procedural_learning"
  | "background_remember";

export interface Phase40ProductEvalStatus {
  reason: string;
  status: "accepted" | "blocked";
}

export interface Phase40ProductEvalVariantResult {
  estimatedTokens: number;
  hitCount: number;
  matchedSignals: string[];
  missedSignals: string[];
  recallLatencyMs: number;
  score: number;
  traceId?: string;
  wrongSignals: string[];
}

export interface Phase40ProductEvalCaseResult {
  caseId: string;
  expectedSignals: string[];
  focus: Phase40ProductEvalFocus;
  goodMemory: Phase40ProductEvalVariantResult;
  noMemory: Phase40ProductEvalVariantResult;
  passed: boolean;
  wrongSignalLabels: string[];
}

export interface Phase40ProductEvalTraceEvidence {
  whyBlocked: Phase40ProductEvalStatus & {
    blockedJobStatus?: string;
    blockedReason?: string;
  };
  whyRecalled: Phase40ProductEvalStatus & {
    recallHitCount: number;
    returnedCandidateTraceCount: number;
  };
  whyRemembered: Phase40ProductEvalStatus & {
    acceptedEvents: number;
    writtenMemoryTypes: string[];
  };
  whyRevised: Phase40ProductEvalStatus & {
    memoryType?: string;
    outcome?: string;
  };
}

export interface Phase40ProductEvalReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  cases: Phase40ProductEvalCaseResult[];
  generatedAt: string;
  generatedBy: "scripts/run-phase-40-product-eval.ts";
  metrics: {
    correctness: {
      continuityUplift: number;
      correctionSuccessRate: number;
      goodMemoryPassCount: number;
      missedRecallRate: number;
      noMemoryPassCount: number;
      totalCases: number;
      wrongRecallRate: number;
    };
    costLatency: {
      backgroundRememberNonBlocking: boolean;
      noMemoryContextTokens: number;
      recallLatencyMs: {
        noMemoryAverage: number;
        withGoodMemoryAverage: number;
      };
      tokenCostDelta: number;
      withGoodMemoryContextTokens: number;
    };
    productQuality: {
      backgroundJobFailureVisibility: number;
      duplicateMemoryRate: number;
      policyBlockExplainability: number;
      traceCompletenessRate: number;
    };
  };
  mode: "product-eval-rollup";
  outputDir: string;
  phase: "phase-40";
  rawTranscriptPersistence: {
    defaultRuntimeArchive: "off";
    evidenceSource: "structured_eval_events_and_redaction_safe_traces";
    persistedRawTranscripts: false;
  };
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
  traceEvidence: Phase40ProductEvalTraceEvidence;
  variants: {
    noMemory: {
      mode: "no-memory";
      description: string;
    };
    withGoodMemory: {
      mode: "with-goodmemory";
      description: string;
      storage: "memory";
    };
  };
}

export interface Phase40ProductEvalDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase40ProductEvalCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runEval?: (options?: Phase40ProductEvalOptions) => Promise<Phase40ProductEvalReport>;
}

interface SignalNeedle {
  label: string;
  needle: string;
}

interface CaseExecutionInput {
  memory: GoodMemory;
  now: string;
  spans: GoodMemoryTraceSpan[];
}

interface ExecutedGoodMemoryCase {
  caseId: string;
  expectedSignals: string[];
  focus: Phase40ProductEvalFocus;
  goodMemory: Phase40ProductEvalVariantResult;
  noMemory: Phase40ProductEvalVariantResult;
  remember?: RememberResult;
  revise?: ReviseMemoryResult;
  wrongSignalLabels: string[];
}

interface BackgroundEvidence {
  duplicateJobCollapsed: boolean;
  failureVisible: boolean;
  nonBlocking: boolean;
}

interface BlockEvidence {
  blockedJobStatus?: string;
  blockedReason?: string;
  explainable: boolean;
}

const GENERATED_BY = "scripts/run-phase-40-product-eval.ts";
const PHASE40_IN_SCOPE = [
  "no-memory baseline versus with-GoodMemory deterministic product rollup",
  "identity/background carry-forward",
  "historical task continuation and open-loop recall",
  "targeted user correction through reviseMemory",
  "feedback procedural learning",
  "runtime session continuity",
  "background remember non-blocking and failure-visible jobs",
  "trace explainability for remember, recall, block, and revise",
] as const;
const PHASE40_OUT_OF_SCOPE = [
  "live model judging",
  "provider-backed embeddings or assisted extraction",
  "raw transcript archive as an eval artifact",
  "new public memory CRUD APIs",
] as const;
const ISOLATED_GOODMEMORY_ENV_KEYS = [
  "GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY",
  "GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL",
  "GOODMEMORY_ASSISTED_EXTRACTOR_MODEL",
  "GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER",
  "GOODMEMORY_EMBEDDING_API_KEY",
  "GOODMEMORY_EMBEDDING_BASE_URL",
  "GOODMEMORY_EMBEDDING_MODEL",
  "GOODMEMORY_EMBEDDING_PROVIDER",
  "GOODMEMORY_JUDGE_API_KEY",
  "GOODMEMORY_JUDGE_BASE_URL",
  "GOODMEMORY_JUDGE_MODEL",
  "GOODMEMORY_JUDGE_PROVIDER",
  "GOODMEMORY_RECALL_ROUTER_API_KEY",
  "GOODMEMORY_RECALL_ROUTER_BASE_URL",
  "GOODMEMORY_RECALL_ROUTER_MODEL",
  "GOODMEMORY_RECALL_ROUTER_PROVIDER",
  "GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH",
  "GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT",
  "GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH",
  "GOODMEMORY_SQLITE_VECTOR_MODE",
  "GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION",
  "GOODMEMORY_STORAGE_PROVIDER",
  "GOODMEMORY_STORAGE_URL",
  "GOODMEMORY_TEST_POSTGRES_URL",
] as const;

type GoodMemoryEnvSnapshot = Array<readonly [string, string | undefined]>;

function isolateGoodMemoryEvalEnv(): GoodMemoryEnvSnapshot {
  const snapshot = ISOLATED_GOODMEMORY_ENV_KEYS.map((key) => [
    key,
    process.env[key],
  ] as const);

  for (const key of ISOLATED_GOODMEMORY_ENV_KEYS) {
    delete process.env[key];
  }

  return snapshot;
}

function restoreGoodMemoryEvalEnv(snapshot: GoodMemoryEnvSnapshot): void {
  for (const [key, value] of snapshot) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

export function resolvePhase40ProductEvalOutputDir(root: string): string {
  return join(root, "reports/eval/product/phase-40");
}

export function buildPhase40ProductEvalRunId(timestamp: string): string {
  const value = timestamp.replace(/\D/g, "").slice(0, 14) || "phase40product";
  return `run-${value}-product-eval`;
}

export function parsePhase40ProductEvalCliOptions(
  argv: readonly string[],
): Phase40ProductEvalOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function signalLabels(signals: readonly SignalNeedle[]): string[] {
  return signals.map((signal) => signal.label);
}

function scoreText(
  content: string,
  expectedSignals: readonly SignalNeedle[],
  wrongSignals: readonly SignalNeedle[],
): Pick<
  Phase40ProductEvalVariantResult,
  "matchedSignals" | "missedSignals" | "score" | "wrongSignals"
> {
  const matchedSignals = expectedSignals
    .filter((signal) => content.includes(signal.needle))
    .map((signal) => signal.label);
  const missedSignals = expectedSignals
    .filter((signal) => !content.includes(signal.needle))
    .map((signal) => signal.label);
  const matchedWrongSignals = wrongSignals
    .filter((signal) => content.includes(signal.needle))
    .map((signal) => signal.label);

  return {
    matchedSignals,
    missedSignals,
    score: matchedSignals.length,
    wrongSignals: matchedWrongSignals,
  };
}

function scopeFor(caseId: string, sessionId: string): MemoryScope {
  return {
    userId: `phase40-product-user-${caseId}`,
    workspaceId: `phase40-product-${caseId}`,
    sessionId,
  };
}

function recallText(recall: RecallResult): string {
  return [
    recall.profile?.identity.name,
    recall.profile?.identity.role,
    recall.workingMemory?.currentGoal,
    ...(recall.workingMemory?.openLoops ?? []),
    recall.journal?.currentState,
    ...(recall.journal?.worklog ?? []),
    ...recall.preferences.map((item) =>
      typeof item.value === "string" ? item.value : JSON.stringify(item.value)
    ),
    ...recall.facts.map((item) => item.content),
    ...recall.feedback.map((item) => item.rule),
    ...recall.references.flatMap((item) => [item.title, item.pointer]),
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}

async function evaluateVariant(input: {
  expectedSignals: readonly SignalNeedle[];
  memory: GoodMemory;
  query: string;
  retrievalProfile?: "general_chat" | "coding_agent";
  scope: MemoryScope;
  wrongSignals: readonly SignalNeedle[];
}): Promise<Phase40ProductEvalVariantResult> {
  const recall = await input.memory.recall({
    scope: input.scope,
    query: input.query,
    retrievalProfile: input.retrievalProfile ?? "general_chat",
  });
  const context = await input.memory.buildContext({
    recall,
    output: "system_prompt_fragment",
  });
  const scored = scoreText(
    `${recallText(recall)}\n${context.content}`,
    input.expectedSignals,
    input.wrongSignals,
  );

  return {
    estimatedTokens: context.estimatedTokens,
    hitCount: recall.metadata.hits.length,
    matchedSignals: scored.matchedSignals,
    missedSignals: scored.missedSignals,
    recallLatencyMs: recall.metadata.latencyMs,
    score: scored.score,
    ...(recall.metadata.traceId ? { traceId: recall.metadata.traceId } : {}),
    wrongSignals: scored.wrongSignals,
  };
}

async function evaluateNoMemoryVariant(input: {
  expectedSignals: readonly SignalNeedle[];
  query: string;
  retrievalProfile?: "general_chat" | "coding_agent";
  scope: MemoryScope;
  wrongSignals: readonly SignalNeedle[];
}): Promise<Phase40ProductEvalVariantResult> {
  const memory = createGoodMemory({
    storage: { provider: "memory" },
  });

  return await evaluateVariant({
    expectedSignals: input.expectedSignals,
    memory,
    query: input.query,
    retrievalProfile: input.retrievalProfile,
    scope: input.scope,
    wrongSignals: input.wrongSignals,
  });
}

function toCaseResult(input: ExecutedGoodMemoryCase): Phase40ProductEvalCaseResult {
  return {
    caseId: input.caseId,
    expectedSignals: input.expectedSignals,
    focus: input.focus,
    goodMemory: input.goodMemory,
    noMemory: input.noMemory,
    passed:
      input.goodMemory.missedSignals.length === 0 &&
      input.goodMemory.wrongSignals.length === 0 &&
      input.goodMemory.score > input.noMemory.score,
    wrongSignalLabels: input.wrongSignalLabels,
  };
}

async function runIdentityBackgroundCase(
  input: CaseExecutionInput,
): Promise<ExecutedGoodMemoryCase> {
  const caseId = "identity-background";
  const scope = scopeFor(caseId, "session-1");
  const expectedSignals = [
    { label: "profile.name", needle: "Mina" },
    { label: "background.role", needle: "backend platform lead" },
  ] as const;
  const wrongSignals = [{ label: "wrong.role", needle: "frontend designer" }] as const;
  const remember = await input.memory.remember({
    scope,
    messages: [
      {
        role: "user",
        content: "My name is Mina. I am a backend platform lead.",
      },
    ],
  });
  const query = "What background should you account for when answering this user?";
  const goodMemory = await evaluateVariant({
    expectedSignals,
    memory: input.memory,
    query,
    scope,
    wrongSignals,
  });
  const noMemory = await evaluateNoMemoryVariant({
    expectedSignals,
    query,
    scope,
    wrongSignals,
  });

  return {
    caseId,
    expectedSignals: signalLabels(expectedSignals),
    focus: "identity_background",
    goodMemory,
    noMemory,
    remember,
    wrongSignalLabels: signalLabels(wrongSignals),
  };
}

async function runHistoricalTaskCase(
  input: CaseExecutionInput,
): Promise<ExecutedGoodMemoryCase> {
  const caseId = "historical-task-continuation";
  const writeScope = scopeFor(caseId, "session-1");
  const recallScope = scopeFor(caseId, "session-2");
  const expectedSignals = [
    { label: "phase40.next_step", needle: "product eval rollup" },
    { label: "phase40.release_gate", needle: "release gate" },
  ] as const;
  const wrongSignals = [{ label: "wrong.next_step", needle: "dashboard" }] as const;
  const remember = await input.memory.remember({
    scope: writeScope,
    messages: [
      {
        role: "user",
        content:
          "Remember that Phase 40 next step is the product eval rollup and the release gate must cite accepted evidence.",
      },
    ],
  });
  const query =
    "What product eval rollup or release gate evidence should continue for Phase 40?";
  const goodMemory = await evaluateVariant({
    expectedSignals,
    memory: input.memory,
    query,
    scope: recallScope,
    wrongSignals,
  });
  const noMemory = await evaluateNoMemoryVariant({
    expectedSignals,
    query,
    scope: recallScope,
    wrongSignals,
  });

  return {
    caseId,
    expectedSignals: signalLabels(expectedSignals),
    focus: "historical_task_continuation",
    goodMemory,
    noMemory,
    remember,
    wrongSignalLabels: signalLabels(wrongSignals),
  };
}

async function runOpenLoopCase(
  input: CaseExecutionInput,
): Promise<ExecutedGoodMemoryCase> {
  const caseId = "open-loop-runtime-continuity";
  const scope = scopeFor(caseId, "session-1");
  const expectedSignals = [
    { label: "runtime.open_loop", needle: "wire no-memory baseline report" },
    { label: "runtime.journal_state", needle: "Cross-consumer smoke is accepted" },
  ] as const;
  const wrongSignals = [{ label: "wrong.open_loop", needle: "publish dashboard" }] as const;

  await input.memory.runtime.startSession({ scope });
  await input.memory.runtime.updateWorkingMemory({
    scope,
    patch: {
      currentGoal: "Close Phase 40 product eval rollup",
      openLoops: ["wire no-memory baseline report"],
    },
  });
  await input.memory.runtime.updateSessionJournal({
    scope,
    patch: {
      currentState: "Cross-consumer smoke is accepted.",
      appendWorklog: ["Next step is product eval rollup."],
    },
  });
  const query = "What is the current Phase 40 product eval goal and open loop?";
  const goodMemory = await evaluateVariant({
    expectedSignals,
    memory: input.memory,
    query,
    retrievalProfile: "coding_agent",
    scope,
    wrongSignals,
  });
  const noMemory = await evaluateNoMemoryVariant({
    expectedSignals,
    query,
    retrievalProfile: "coding_agent",
    scope,
    wrongSignals,
  });
  await input.memory.runtime.endSession({ scope });

  return {
    caseId,
    expectedSignals: signalLabels(expectedSignals),
    focus: "open_loop_recall",
    goodMemory,
    noMemory,
    wrongSignalLabels: signalLabels(wrongSignals),
  };
}

async function runRevisionCase(
  input: CaseExecutionInput,
): Promise<ExecutedGoodMemoryCase> {
  const caseId = "targeted-user-correction";
  const scope = scopeFor(caseId, "session-1");
  const expectedSignals = [{ label: "editor.current", needle: "Cursor" }] as const;
  const wrongSignals = [{ label: "editor.stale", needle: "VS Code" }] as const;
  const remember = await input.memory.remember({
    scope,
    messages: [
      {
        role: "user",
        content: "I prefer VS Code as my editor.",
      },
    ],
  });
  const targetMemoryId = remember.events.find(
    (event) => event.memoryType === "preference",
  )?.memoryId;
  if (!targetMemoryId) {
    throw new Error("Phase 40 product eval could not find preference to revise.");
  }
  const revise = await input.memory.reviseMemory({
    scope,
    target: {
      memoryId: targetMemoryId,
    },
    revision: {
      content: "My preferred editor is Cursor.",
    },
    reason: "user_correction",
    evidence: {
      source: "user_message",
      message: "Actually I use Cursor now.",
    },
    idempotencyKey: "phase40-product-editor-correction",
  });
  const query = "Which editor should I use?";
  const goodMemory = await evaluateVariant({
    expectedSignals,
    memory: input.memory,
    query,
    scope,
    wrongSignals,
  });
  const noMemory = await evaluateNoMemoryVariant({
    expectedSignals,
    query,
    scope,
    wrongSignals,
  });

  return {
    caseId,
    expectedSignals: signalLabels(expectedSignals),
    focus: "user_correction",
    goodMemory,
    noMemory,
    remember,
    revise,
    wrongSignalLabels: signalLabels(wrongSignals),
  };
}

async function runFeedbackCase(
  input: CaseExecutionInput,
): Promise<ExecutedGoodMemoryCase> {
  const caseId = "feedback-procedural-learning";
  const scope = scopeFor(caseId, "session-1");
  const expectedSignals = [
    { label: "feedback.summary_style", needle: "checklist summaries" },
  ] as const;
  const wrongSignals = [{ label: "wrong.summary_style", needle: "long essay" }] as const;

  await input.memory.feedback({
    scope,
    signal: "Use checklist summaries after coaching sessions.",
  });
  const query = "How should coaching summaries be formatted?";
  const goodMemory = await evaluateVariant({
    expectedSignals,
    memory: input.memory,
    query,
    scope,
    wrongSignals,
  });
  const noMemory = await evaluateNoMemoryVariant({
    expectedSignals,
    query,
    scope,
    wrongSignals,
  });

  return {
    caseId,
    expectedSignals: signalLabels(expectedSignals),
    focus: "feedback_procedural_learning",
    goodMemory,
    noMemory,
    wrongSignalLabels: signalLabels(wrongSignals),
  };
}

async function runBackgroundRememberCase(
  input: CaseExecutionInput,
): Promise<{
  background: BackgroundEvidence;
  caseResult: ExecutedGoodMemoryCase;
}> {
  const caseId = "background-remember";
  const scope = scopeFor(caseId, "session-1");
  const expectedSignals = [
    { label: "background.fact", needle: "background writes should not block response rendering" },
  ] as const;
  const wrongSignals = [
    { label: "wrong.background", needle: "background writes must block the model response" },
  ] as const;
  const jobInput = {
    scope,
    messages: [
      {
        role: "user",
        content:
          "Remember that background writes should not block response rendering.",
      },
    ],
    idempotencyKey: "phase40-background-turn-1",
    reason: "post_response_memory_write",
  };
  const queued = await input.memory.jobs.enqueueRemember(jobInput);
  const duplicate = await input.memory.jobs.enqueueRemember(jobInput);
  const nonBlocking = queued.status === "queued" && queued.attempts === 0;
  const duplicateJobCollapsed = duplicate.jobId === queued.jobId;
  await input.memory.jobs.drain();
  const committed = await input.memory.jobs.getJob({ jobId: queued.jobId });
  const query = "What should background writes do to response rendering?";
  const goodMemory = await evaluateVariant({
    expectedSignals,
    memory: input.memory,
    query,
    scope,
    wrongSignals,
  });
  const noMemory = await evaluateNoMemoryVariant({
    expectedSignals,
    query,
    scope,
    wrongSignals,
  });

  return {
    background: {
      duplicateJobCollapsed,
      failureVisible: committed?.status === "succeeded",
      nonBlocking,
    },
    caseResult: {
      caseId,
      expectedSignals: signalLabels(expectedSignals),
      focus: "background_remember",
      goodMemory,
      noMemory,
      wrongSignalLabels: signalLabels(wrongSignals),
    },
  };
}

async function runBlockEvidence(input: {
  now: string;
  spans: GoodMemoryTraceSpan[];
}): Promise<BlockEvidence> {
  const memory = createGoodMemory({
    storage: { provider: "memory" },
    policy: {
      shouldRemember() {
        return false;
      },
    },
    observability: {
      traceSink: {
        emit(span) {
          input.spans.push(span);
        },
      },
    },
    testing: {
      now: () => new Date(input.now),
    },
  });
  const scope = scopeFor("policy-block", "session-1");
  const blockedRemember = await memory.remember({
    scope,
    messages: [
      {
        role: "user",
        content: "Remember that this private launch token must not be written.",
      },
    ],
  });
  const queued = await memory.jobs.enqueueRemember({
    scope,
    messages: [
      {
        role: "user",
        content: "Remember that this policy-blocked payload must not write.",
      },
    ],
    idempotencyKey: "phase40-policy-block-turn-1",
  });
  await memory.jobs.drain();
  const blockedJob = await memory.jobs.getJob({ jobId: queued.jobId });
  const reason = blockedRemember.events[0]?.reason;

  return {
    blockedJobStatus: blockedJob?.status,
    blockedReason: reason,
    explainable:
      reason === "policy_blocked" &&
      blockedJob?.status === "blocked" &&
      blockedJob.lastError?.code === "write_blocked",
  };
}

function summarizeRememberedEvents(
  cases: readonly ExecutedGoodMemoryCase[],
): {
  acceptedEvents: number;
  writtenMemoryTypes: string[];
} {
  const remembered = cases.flatMap((caseResult) => caseResult.remember?.events ?? []);
  const written = remembered.filter((event) => event.outcome !== "rejected");

  return {
    acceptedEvents: written.length,
    writtenMemoryTypes: [
      ...new Set(written.map((event) => event.memoryType)),
    ].sort(),
  };
}

function buildTraceEvidence(input: {
  background: BackgroundEvidence;
  block: BlockEvidence;
  cases: readonly ExecutedGoodMemoryCase[];
  spans: readonly GoodMemoryTraceSpan[];
}): Phase40ProductEvalTraceEvidence {
  const remembered = summarizeRememberedEvents(input.cases);
  const recallHitCount = input.cases.reduce(
    (sum, caseResult) => sum + caseResult.goodMemory.hitCount,
    0,
  );
  const returnedCandidateTraceCount = input.spans.filter(
    (span) => span.name === "memory.recall" && span.status === "succeeded",
  ).length;
  const revision = input.cases.find((caseResult) => caseResult.revise)?.revise;
  const hasRememberSpan = input.spans.some(
    (span) => span.name === "memory.remember" && span.status === "succeeded",
  );
  const hasRecallSpan = input.spans.some(
    (span) => span.name === "memory.recall" && span.status === "succeeded",
  );
  const hasRevisionSpan = input.spans.some(
    (span) => span.name === "memory.revise" && span.status === "succeeded",
  );
  const hasBlockedJobSpan = input.spans.some(
    (span) => span.name === "writeback.job.commit" && span.status === "blocked",
  );

  return {
    whyBlocked: {
      blockedJobStatus: input.block.blockedJobStatus,
      blockedReason: input.block.blockedReason,
      reason: input.block.explainable && hasBlockedJobSpan
        ? "Policy-blocked remember produced a rejected reason and a blocked write job with a write_blocked error."
        : "Policy block evidence did not include both rejected reason and blocked job receipt.",
      status: input.block.explainable && hasBlockedJobSpan ? "accepted" : "blocked",
    },
    whyRecalled: {
      reason: recallHitCount > 0 && hasRecallSpan
        ? "Recall produced hits and redaction-safe memory.recall spans for the product cases."
        : "Recall evidence did not produce enough hits or trace spans.",
      recallHitCount,
      returnedCandidateTraceCount,
      status: recallHitCount > 0 && hasRecallSpan ? "accepted" : "blocked",
    },
    whyRemembered: {
      acceptedEvents: remembered.acceptedEvents,
      reason: remembered.acceptedEvents > 0 && hasRememberSpan
        ? "Remember accepted structured events with written memory types and redaction-safe spans."
        : "Remember evidence did not include accepted structured events.",
      status: remembered.acceptedEvents > 0 && hasRememberSpan ? "accepted" : "blocked",
      writtenMemoryTypes: remembered.writtenMemoryTypes,
    },
    whyRevised: {
      memoryType: revision?.memoryType,
      outcome: revision?.outcome,
      reason: revision?.accepted === true && hasRevisionSpan
        ? "Targeted reviseMemory superseded the explicit memory id and emitted a redaction-safe revision span."
        : "Revision evidence did not show accepted targeted supersede lineage.",
      status: revision?.accepted === true && hasRevisionSpan ? "accepted" : "blocked",
    },
  };
}

function calculateMetrics(input: {
  background: BackgroundEvidence;
  block: BlockEvidence;
  cases: readonly Phase40ProductEvalCaseResult[];
  traceEvidence: Phase40ProductEvalTraceEvidence;
}): Phase40ProductEvalReport["metrics"] {
  const totalExpected = input.cases.reduce(
    (sum, caseResult) => sum + caseResult.expectedSignals.length,
    0,
  );
  const goodMatched = input.cases.reduce(
    (sum, caseResult) => sum + caseResult.goodMemory.matchedSignals.length,
    0,
  );
  const noMemoryMatched = input.cases.reduce(
    (sum, caseResult) => sum + caseResult.noMemory.matchedSignals.length,
    0,
  );
  const totalWrongSignals = input.cases.reduce(
    (sum, caseResult) => sum + caseResult.wrongSignalLabels.length,
    0,
  );
  const wrongMatches = input.cases.reduce(
    (sum, caseResult) => sum + caseResult.goodMemory.wrongSignals.length,
    0,
  );
  const revisionCases = input.cases.filter(
    (caseResult) => caseResult.focus === "user_correction",
  );
  const correctionSuccesses = revisionCases.filter(
    (caseResult) =>
      caseResult.goodMemory.missedSignals.length === 0 &&
      caseResult.goodMemory.wrongSignals.length === 0,
  ).length;
  const traceStatuses = [
    input.traceEvidence.whyRemembered.status,
    input.traceEvidence.whyRecalled.status,
    input.traceEvidence.whyBlocked.status,
    input.traceEvidence.whyRevised.status,
  ];
  const withGoodMemoryContextTokens = input.cases.reduce(
    (sum, caseResult) => sum + caseResult.goodMemory.estimatedTokens,
    0,
  );
  const noMemoryContextTokens = input.cases.reduce(
    (sum, caseResult) => sum + caseResult.noMemory.estimatedTokens,
    0,
  );

  return {
    correctness: {
      continuityUplift: roundMetric((goodMatched - noMemoryMatched) / totalExpected),
      correctionSuccessRate: roundMetric(
        correctionSuccesses / Math.max(revisionCases.length, 1),
      ),
      goodMemoryPassCount: input.cases.filter((caseResult) => caseResult.passed).length,
      missedRecallRate: roundMetric((totalExpected - goodMatched) / totalExpected),
      noMemoryPassCount: input.cases.filter(
        (caseResult) =>
          caseResult.noMemory.missedSignals.length === 0 &&
          caseResult.noMemory.wrongSignals.length === 0,
      ).length,
      totalCases: input.cases.length,
      wrongRecallRate: roundMetric(wrongMatches / Math.max(totalWrongSignals, 1)),
    },
    costLatency: {
      backgroundRememberNonBlocking: input.background.nonBlocking,
      noMemoryContextTokens,
      recallLatencyMs: {
        noMemoryAverage: average(
          input.cases.map((caseResult) => caseResult.noMemory.recallLatencyMs),
        ),
        withGoodMemoryAverage: average(
          input.cases.map((caseResult) => caseResult.goodMemory.recallLatencyMs),
        ),
      },
      tokenCostDelta: withGoodMemoryContextTokens - noMemoryContextTokens,
      withGoodMemoryContextTokens,
    },
    productQuality: {
      backgroundJobFailureVisibility: input.background.failureVisible &&
        input.block.explainable
        ? 1
        : 0,
      duplicateMemoryRate: input.background.duplicateJobCollapsed ? 0 : 1,
      policyBlockExplainability: input.block.explainable ? 1 : 0,
      traceCompletenessRate: roundMetric(
        traceStatuses.filter((status) => status === "accepted").length /
          traceStatuses.length,
      ),
    },
  };
}

function buildAcceptance(input: {
  cases: readonly Phase40ProductEvalCaseResult[];
  metrics: Phase40ProductEvalReport["metrics"];
  traceEvidence: Phase40ProductEvalTraceEvidence;
}): Phase40ProductEvalReport["acceptance"] {
  const accepted =
    input.cases.every((caseResult) => caseResult.passed) &&
    input.metrics.correctness.continuityUplift > 0 &&
    input.metrics.correctness.missedRecallRate === 0 &&
    input.metrics.correctness.wrongRecallRate === 0 &&
    input.metrics.correctness.correctionSuccessRate === 1 &&
    input.metrics.productQuality.policyBlockExplainability === 1 &&
    input.metrics.productQuality.backgroundJobFailureVisibility === 1 &&
    input.metrics.productQuality.traceCompletenessRate === 1 &&
    input.metrics.productQuality.duplicateMemoryRate === 0 &&
    Object.values(input.traceEvidence).every((status) => status.status === "accepted");

  return {
    decision: accepted ? "accepted" : "blocked",
    reason: accepted
      ? "With-GoodMemory beat the no-memory baseline across product continuity cases while preserving correction, policy block, job visibility, and trace evidence."
      : "Phase 40 product eval did not clear the no-memory baseline, correction, policy, job, or trace evidence thresholds.",
  };
}

export async function runPhase40ProductEval(
  options: Phase40ProductEvalOptions = {},
  dependencies: Phase40ProductEvalDependencies = {},
): Promise<Phase40ProductEvalReport> {
  const envSnapshot = isolateGoodMemoryEvalEnv();

  try {
    return await runPhase40ProductEvalIsolated(options, dependencies);
  } finally {
    restoreGoodMemoryEvalEnv(envSnapshot);
  }
}

async function runPhase40ProductEvalIsolated(
  options: Phase40ProductEvalOptions = {},
  dependencies: Phase40ProductEvalDependencies = {},
): Promise<Phase40ProductEvalReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now ?? (() => new Date().toISOString());
  const timestamp = now();
  const outputDir = options.outputDir ?? resolvePhase40ProductEvalOutputDir(root);
  const runId = options.runId ?? buildPhase40ProductEvalRunId(timestamp);
  const runDirectory = join(outputDir, runId);
  const ensureDir =
    dependencies.ensureDir ??
    (async (path: string, options?: { recursive?: boolean }) => {
      await mkdir(path, options);
    });
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const spans: GoodMemoryTraceSpan[] = [];
  const memory = createGoodMemory({
    storage: { provider: "memory" },
    observability: {
      traceSink: {
        emit(span) {
          spans.push(span);
        },
      },
    },
    testing: {
      now: () => new Date(timestamp),
    },
  });
  const input = { memory, now: timestamp, spans };
  const identity = await runIdentityBackgroundCase(input);
  const historicalTask = await runHistoricalTaskCase(input);
  const openLoop = await runOpenLoopCase(input);
  const revision = await runRevisionCase(input);
  const feedback = await runFeedbackCase(input);
  const background = await runBackgroundRememberCase(input);
  const block = await runBlockEvidence({ now: timestamp, spans });
  const executedCases = [
    identity,
    historicalTask,
    openLoop,
    revision,
    feedback,
    background.caseResult,
  ];
  const cases = executedCases.map(toCaseResult);
  const traceEvidence = buildTraceEvidence({
    background: background.background,
    block,
    cases: executedCases,
    spans,
  });
  const metrics = calculateMetrics({
    background: background.background,
    block,
    cases,
    traceEvidence,
  });
  const report: Phase40ProductEvalReport = {
    acceptance: buildAcceptance({ cases, metrics, traceEvidence }),
    cases,
    generatedAt: timestamp,
    generatedBy: GENERATED_BY,
    metrics,
    mode: "product-eval-rollup",
    outputDir,
    phase: "phase-40",
    rawTranscriptPersistence: {
      defaultRuntimeArchive: "off",
      evidenceSource: "structured_eval_events_and_redaction_safe_traces",
      persistedRawTranscripts: false,
    },
    runDirectory,
    runId,
    scope: {
      inScope: [...PHASE40_IN_SCOPE],
      outOfScope: [...PHASE40_OUT_OF_SCOPE],
    },
    traceEvidence,
    variants: {
      noMemory: {
        description: "Fresh memory instance with no durable or runtime state.",
        mode: "no-memory",
      },
      withGoodMemory: {
        description:
          "GoodMemory public runtime, recall, buildContext, jobs, feedback, and targeted revise APIs on in-memory storage.",
        mode: "with-goodmemory",
        storage: "memory",
      },
    },
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export async function runPhase40ProductEvalCli(
  dependencies: Phase40ProductEvalCliDependencies = {},
): Promise<Phase40ProductEvalReport> {
  const argv = dependencies.argv ?? process.argv;
  const exit = dependencies.exit ?? process.exit;
  const log = dependencies.log ?? console.log;
  const runEval = dependencies.runEval ?? runPhase40ProductEval;
  const report = await runEval(parsePhase40ProductEvalCliOptions(argv));

  if (report.acceptance.decision === "accepted") {
    log(`Phase 40 product eval accepted: ${report.runId}`);
  } else {
    log(`Phase 40 product eval blocked: ${report.acceptance.reason}`);
    exit(1);
  }

  return report;
}

if (import.meta.main) {
  await runPhase40ProductEvalCli();
}
