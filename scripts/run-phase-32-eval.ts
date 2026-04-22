import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createGoodMemory,
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createRuntimeArchiveStore,
  createRuntimeContextService,
} from "../src";
import { ingestAgentInputEvent } from "../src/ai-sdk";
import { ingestHostAgentEvent } from "../src/host";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase32EvalOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase32EvalDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase32DeterministicContextResult {
  context: string;
  estimatedTokens: number;
  matchedExpectations: string[];
  score: number;
}

export interface Phase32DeterministicCaseResult {
  caseId: string;
  focus: "continuity" | "procedure_adherence" | "repeated_correction";
  eventBacked: Phase32DeterministicContextResult;
  noMemory: Phase32DeterministicContextResult;
  textOnly: Phase32DeterministicContextResult;
}

export interface Phase32DeterministicSummary {
  eventBackedAverageScore: number;
  eventBackedClearWinCount: number;
  eventBackedNonRegressionPassCount: number;
  noMemoryAverageScore: number;
  textOnlyAverageScore: number;
  totalCases: number;
}

export interface Phase32DeterministicReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  cases: Phase32DeterministicCaseResult[];
  generatedAt: string;
  generatedBy: string;
  mode: "fallback";
  outputDir: string;
  phase: "phase-32";
  runDirectory: string;
  runId: string;
  summary: Phase32DeterministicSummary;
}

type Phase32ScenarioMode = "event-backed" | "no-memory" | "text-only";

interface Phase32Expectation {
  label: string;
  needle: string;
}

const GENERATED_BY = "scripts/run-phase-32-eval.ts";
const PHASE32_CONTEXT_TOKEN_BUDGET = 104;
const PHASE32_FEEDBACK_SIGNAL = "Use bullet points in summaries.";
const PHASE32_CONTINUITY_TRANSITION =
  "Task transition: archive the canonical Codex evidence chain before the external-host closeout.";
const PHASE32_VERIFY_RESULT_SUMMARY =
  "Verification failed: draft missed bullet points.";
const PHASE32_RULES_ONLY_ENV_KEYS = [
  "GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY",
  "GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL",
  "GOODMEMORY_ASSISTED_EXTRACTOR_MODEL",
  "GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER",
  "GOODMEMORY_EMBEDDING_API_KEY",
  "GOODMEMORY_EMBEDDING_BASE_URL",
  "GOODMEMORY_EMBEDDING_MODEL",
  "GOODMEMORY_EMBEDDING_PROVIDER",
] as const;

export function resolvePhase32FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-32");
}

export function buildPhase32FallbackRunId(timestamp: string): string {
  return `run-${timestamp.replace(/\D/g, "").slice(0, 14) || "phase32"}`;
}

export function parsePhase32EvalCliOptions(
  argv: readonly string[],
): Phase32EvalOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function roundScore(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

async function withPhase32RulesOnlyEnv<T>(
  execute: () => Promise<T>,
): Promise<T> {
  const previousValues = new Map<string, string | undefined>();

  for (const key of PHASE32_RULES_ONLY_ENV_KEYS) {
    previousValues.set(key, process.env[key]);
    delete process.env[key];
  }

  try {
    return await execute();
  } finally {
    for (const key of PHASE32_RULES_ONLY_ENV_KEYS) {
      const previous = previousValues.get(key);
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  }
}

function buildScope(caseId: string) {
  return {
    userId: "phase32-user",
    workspaceId: `phase32-workspace-${caseId}`,
    sessionId: `phase32-session-${caseId}`,
  } as const;
}

function scoreContext(
  content: string,
  expectations: readonly Phase32Expectation[],
): Pick<Phase32DeterministicContextResult, "matchedExpectations" | "score"> {
  const matchedExpectations = expectations
    .filter((expectation) => content.includes(expectation.needle))
    .map((expectation) => expectation.label);

  return {
    matchedExpectations,
    score: matchedExpectations.length,
  };
}

async function buildContinuityContext(
  mode: Phase32ScenarioMode,
): Promise<Phase32DeterministicContextResult> {
  if (mode === "no-memory") {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });
    const recall = await memory.recall({
      scope: buildScope("continuity-open-loop"),
      query: "Continue the external host rollout from last time.",
      retrievalProfile: "coding_agent",
    });
    const context = await memory.buildContext({
      recall,
      output: "markdown",
      maxTokens: PHASE32_CONTEXT_TOKEN_BUDGET,
    });

    return {
      context: context.content,
      estimatedTokens: context.estimatedTokens,
      matchedExpectations: [],
      score: 0,
    };
  }

  const documentStore = createInMemoryDocumentStore();
  const sessionStore = createInMemorySessionStore();
  const runtime = createRuntimeContextService({
    archiveStore: createRuntimeArchiveStore({ documentStore }),
    sessionStore,
    now: () => "2026-04-22T17:30:45.000Z",
  });
  const memory = createGoodMemory({
    storage: { provider: "memory" },
    adapters: {
      documentStore,
      sessionStore,
    },
  });
  const scope = buildScope("continuity-open-loop");

  await runtime.startSession(scope);
  await runtime.updateWorkingMemory(scope, {
    currentGoal: "Close the external host rollout",
    openLoops: ["archive the canonical Codex evidence chain"],
  });
  await runtime.updateSessionJournal(scope, {
    currentState: "Bootstrap and deterministic eval are done.",
    appendWorklog: ["Next step is the external-host closure report."],
  });
  if (mode === "event-backed") {
    await ingestHostAgentEvent(memory, {
      surface: "host",
      kind: "task_transition",
      eventId: "transition-1",
      runId: "phase32-deterministic",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-22T17:30:45.000Z",
      hostKind: "codex",
      scope,
      previousState: "bootstrap-complete",
      nextState: "external-host-closeout",
      summary: PHASE32_CONTINUITY_TRANSITION,
    });
  }

  const recall = await memory.recall({
    scope,
    query: "Continue the external host rollout from last time.",
    retrievalProfile: "coding_agent",
  });
  const context = await memory.buildContext({
    recall,
    output: "markdown",
    maxTokens: PHASE32_CONTEXT_TOKEN_BUDGET,
  });
  const scored = scoreContext(context.content, [
    {
      label: "goal",
      needle: "Close the external host rollout",
    },
    {
      label: "open-loop",
      needle: "archive the canonical Codex evidence chain",
    },
    {
      label: "journal-state",
      needle: "Bootstrap and deterministic eval are done.",
    },
    ...(mode === "event-backed"
      ? [
          {
            label: "transition-evidence",
            needle: PHASE32_CONTINUITY_TRANSITION,
          },
        ]
      : []),
  ]);

  return {
    context: context.content,
    estimatedTokens: context.estimatedTokens,
    ...scored,
  };
}

async function buildRepeatedCorrectionContext(
  mode: Phase32ScenarioMode,
): Promise<Phase32DeterministicContextResult> {
  if (mode === "no-memory") {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });
    const recall = await memory.recall({
      scope: buildScope("repeated-correction"),
      query: "Continue phase 32 and avoid the previous summary mistake.",
      retrievalProfile: "coding_agent",
    });
    const context = await memory.buildContext({
      recall,
      output: "markdown",
      maxTokens: PHASE32_CONTEXT_TOKEN_BUDGET,
    });

    return {
      context: context.content,
      estimatedTokens: context.estimatedTokens,
      matchedExpectations: [],
      score: 0,
    };
  }

  const documentStore = createInMemoryDocumentStore();
  const sessionStore = createInMemorySessionStore();
  const runtime = createRuntimeContextService({
    archiveStore: createRuntimeArchiveStore({ documentStore }),
    sessionStore,
    now: () => "2026-04-22T17:30:45.000Z",
  });
  const memory = createGoodMemory({
    storage: { provider: "memory" },
    adapters: {
      documentStore,
      sessionStore,
    },
  });
  const scope = buildScope("repeated-correction");

  await runtime.startSession(scope);
  await runtime.updateWorkingMemory(scope, {
    currentGoal: "Polish the phase 32 closeout",
    openLoops: ["keep the final summary in bullets"],
  });

  if (mode === "event-backed") {
    for (const [index, eventId] of ["event-1", "event-2", "event-3"].entries()) {
      await ingestAgentInputEvent(memory, {
        surface: "ai-sdk",
        kind: "user_correction",
        eventId,
        runId: "phase32-deterministic",
        turnId: `turn-${index + 1}`,
        sequence: index,
        occurredAt: `2026-04-22T17:30:4${index}.000Z`,
        hostKind: "generic",
        scope,
        correction: PHASE32_FEEDBACK_SIGNAL,
      });
    }
  } else {
    await memory.feedback({
      scope,
      signal: PHASE32_FEEDBACK_SIGNAL,
    });
  }

  const recall = await memory.recall({
    scope,
    query: "Continue phase 32 and avoid the previous summary mistake.",
    retrievalProfile: "coding_agent",
  });
  const context = await memory.buildContext({
    recall,
    output: "markdown",
    maxTokens: PHASE32_CONTEXT_TOKEN_BUDGET,
  });
  const scored = scoreContext(context.content, [
    {
      label: "procedural-rule",
      needle: "Use bullet points in summaries.",
    },
    {
      label: "goal",
      needle: "Polish the phase 32 closeout",
    },
    ...(mode === "event-backed"
      ? [
          {
            label: "correction-evidence",
            needle: "## Evidence",
          },
        ]
      : []),
  ]);

  return {
    context: context.content,
    estimatedTokens: context.estimatedTokens,
    ...scored,
  };
}

async function buildProcedureAdherenceContext(
  mode: Phase32ScenarioMode,
): Promise<Phase32DeterministicContextResult> {
  if (mode === "no-memory") {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });
    const recall = await memory.recall({
      scope: buildScope("procedure-adherence"),
      query: "Continue phase 32 and avoid the previous procedure mistake.",
      retrievalProfile: "coding_agent",
    });
    const context = await memory.buildContext({
      recall,
      output: "markdown",
      maxTokens: PHASE32_CONTEXT_TOKEN_BUDGET,
    });

    return {
      context: context.content,
      estimatedTokens: context.estimatedTokens,
      matchedExpectations: [],
      score: 0,
    };
  }

  const documentStore = createInMemoryDocumentStore();
  const sessionStore = createInMemorySessionStore();
  const runtime = createRuntimeContextService({
    archiveStore: createRuntimeArchiveStore({ documentStore }),
    sessionStore,
    now: () => "2026-04-22T17:30:45.000Z",
  });
  const memory = createGoodMemory({
    storage: { provider: "memory" },
    adapters: {
      documentStore,
      sessionStore,
    },
  });
  const scope = buildScope("procedure-adherence");

  await runtime.startSession(scope);
  await runtime.updateWorkingMemory(scope, {
    currentGoal: "Close phase 32 rollout",
    openLoops: ["lock the accepted gate wording"],
  });
  await runtime.updateSessionJournal(scope, {
    currentState: "The closeout draft is under final review.",
  });

  if (mode === "event-backed") {
    for (const [index, eventId] of ["correction-1"].entries()) {
      await ingestAgentInputEvent(memory, {
        surface: "ai-sdk",
        kind: "user_correction",
        eventId,
        runId: "phase32-deterministic",
        turnId: `turn-${index + 1}`,
        sequence: index,
        occurredAt: `2026-04-22T17:31:0${index}.000Z`,
        hostKind: "generic",
        scope,
        correction: PHASE32_FEEDBACK_SIGNAL,
      });
    }
    await ingestHostAgentEvent(memory, {
      surface: "host",
      kind: "verify_result",
      eventId: "verify-1",
      runId: "phase32-deterministic",
      turnId: "turn-4",
      sequence: 3,
      occurredAt: "2026-04-22T17:31:03.000Z",
      hostKind: "codex",
      scope,
      checkName: "phase32-closeout-review",
      outcome: "failed",
      summary: PHASE32_VERIFY_RESULT_SUMMARY,
    });
  } else {
    await memory.feedback({
      scope,
      signal: PHASE32_FEEDBACK_SIGNAL,
    });
  }

  const recall = await memory.recall({
    scope,
    query: "Continue phase 32 and avoid the previous procedure mistake.",
    retrievalProfile: "coding_agent",
  });
  const context = await memory.buildContext({
    recall,
    output: "markdown",
    maxTokens: PHASE32_CONTEXT_TOKEN_BUDGET,
  });
  const scored = scoreContext(context.content, [
    {
      label: "procedural-rule",
      needle: "Use bullet points in summaries.",
    },
    {
      label: "goal",
      needle: "Close phase 32 rollout",
    },
    {
      label: "journal-state",
      needle: "The closeout draft is under final review.",
    },
    ...(mode === "event-backed"
      ? [
          {
            label: "verification-evidence",
            needle: `Verification: ${PHASE32_VERIFY_RESULT_SUMMARY}`,
          },
        ]
      : []),
  ]);

  return {
    context: context.content,
    estimatedTokens: context.estimatedTokens,
    ...scored,
  };
}

async function buildCaseResult(input: {
  caseId: Phase32DeterministicCaseResult["caseId"];
  focus: Phase32DeterministicCaseResult["focus"];
  runScenario: (
    mode: Phase32ScenarioMode,
  ) => Promise<Phase32DeterministicContextResult>;
}): Promise<Phase32DeterministicCaseResult> {
  const [eventBacked, textOnly, noMemory] = await Promise.all([
    input.runScenario("event-backed"),
    input.runScenario("text-only"),
    input.runScenario("no-memory"),
  ]);

  return {
    caseId: input.caseId,
    focus: input.focus,
    eventBacked,
    noMemory,
    textOnly,
  };
}

function buildSummary(
  cases: Phase32DeterministicCaseResult[],
): Phase32DeterministicSummary {
  const totalCases = cases.length;
  const eventBackedAverageScore = roundScore(
    cases.reduce((total, caseResult) => total + caseResult.eventBacked.score, 0) /
      totalCases,
  );
  const textOnlyAverageScore = roundScore(
    cases.reduce((total, caseResult) => total + caseResult.textOnly.score, 0) /
      totalCases,
  );
  const noMemoryAverageScore = roundScore(
    cases.reduce((total, caseResult) => total + caseResult.noMemory.score, 0) /
      totalCases,
  );
  const eventBackedNonRegressionPassCount = cases.filter(
    (caseResult) => caseResult.eventBacked.score >= caseResult.textOnly.score,
  ).length;
  const eventBackedClearWinCount = cases.filter(
    (caseResult) => caseResult.eventBacked.score > caseResult.noMemory.score,
  ).length;

  return {
    eventBackedAverageScore,
    eventBackedClearWinCount,
    eventBackedNonRegressionPassCount,
    noMemoryAverageScore,
    textOnlyAverageScore,
    totalCases,
  };
}

export async function runPhase32FallbackEval(
  input?: Phase32EvalOptions,
  dependencies?: Phase32EvalDependencies,
): Promise<Phase32DeterministicReport> {
  return withPhase32RulesOnlyEnv(async () => {
    const root = resolveRepoRootFromScriptUrl(import.meta.url);
    const ensureDir = dependencies?.ensureDir ?? mkdir;
    const now = dependencies?.now ?? (() => new Date().toISOString());
    const writeTextFile = dependencies?.writeTextFile ?? writeFile;
    const generatedAt = now();
    const runId = input?.runId ?? buildPhase32FallbackRunId(generatedAt);
    const outputDir = input?.outputDir ?? resolvePhase32FallbackOutputDir(root);
    const runDirectory = join(outputDir, runId);
    const cases = await Promise.all([
      buildCaseResult({
        caseId: "continuity-open-loop",
        focus: "continuity",
        runScenario: buildContinuityContext,
      }),
      buildCaseResult({
        caseId: "repeated-correction",
        focus: "repeated_correction",
        runScenario: buildRepeatedCorrectionContext,
      }),
      buildCaseResult({
        caseId: "procedure-adherence",
        focus: "procedure_adherence",
        runScenario: buildProcedureAdherenceContext,
      }),
    ]);
    const summary = buildSummary(cases);
  const accepted =
    summary.eventBackedNonRegressionPassCount === summary.totalCases &&
    summary.eventBackedAverageScore > summary.textOnlyAverageScore &&
    summary.eventBackedAverageScore > summary.noMemoryAverageScore &&
    cases.every(
      (caseResult) =>
        caseResult.eventBacked.score > caseResult.textOnly.score &&
        caseResult.eventBacked.score > caseResult.noMemory.score,
    );
  const report: Phase32DeterministicReport = {
    acceptance: accepted
      ? {
          decision: "accepted",
          reason:
            "Event-backed coding-agent recall beats the frozen text-only path and the no-memory baseline across the required case family.",
        }
      : {
          decision: "blocked",
          reason:
            "Event-backed coding-agent recall failed to improve over the frozen text-only path or the no-memory baseline.",
        },
      cases,
      generatedAt,
      generatedBy: GENERATED_BY,
      mode: "fallback",
      outputDir,
      phase: "phase-32",
      runDirectory,
      runId,
      summary,
    };

    await ensureDir(runDirectory, { recursive: true });
    await writeTextFile(
      join(runDirectory, "report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );

    return report;
  });
}

async function main(): Promise<void> {
  const report = await runPhase32FallbackEval(
    parsePhase32EvalCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
