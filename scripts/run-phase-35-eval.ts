import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createGoodMemory,
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createRuntimeArchiveStore,
  createRuntimeContextService,
} from "../src";
import { createHostAdapter } from "../src/host";
import { executeInstalledHostHook } from "../src/install/hostHookRuntime";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase35EvalOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase35EvalDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase35DeterministicContextResult {
  context: string;
  estimatedTokens: number;
  matchedExpectations: string[];
  score: number;
}

export interface Phase35DeterministicCaseResult {
  caseId: "continuity-open-loop" | "procedure-adherence" | "repeated-correction";
  focus: "continuity" | "procedure_adherence" | "repeated_correction";
  middleware: Phase35DeterministicContextResult;
  noMemory: Phase35DeterministicContextResult;
  textOnly: Phase35DeterministicContextResult;
  nonRegressionAgainstTextOnly: boolean;
  winOverNoMemory: boolean;
}

export interface Phase35DeterministicSummary {
  middlewareAverageScore: number;
  middlewareNonRegressionPassCount: number;
  middlewareWinOverNoMemoryCount: number;
  noMemoryAverageScore: number;
  textOnlyAverageScore: number;
  totalCases: number;
}

export interface Phase35DeterministicReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  cases: Phase35DeterministicCaseResult[];
  generatedAt: string;
  generatedBy: string;
  mode: "fallback";
  outputDir: string;
  phase: "phase-35";
  runDirectory: string;
  runId: string;
  summary: Phase35DeterministicSummary;
}

interface Phase35Expectation {
  label: string;
  needle: string;
}

interface Phase35CaseSpec {
  caseId: Phase35DeterministicCaseResult["caseId"];
  command: "session-start" | "user-prompt-submit";
  expectations: readonly Phase35Expectation[];
  focus: Phase35DeterministicCaseResult["focus"];
  prompt?: string;
}

type Phase35ScenarioMode = "middleware" | "no-memory" | "text-only";

const GENERATED_BY = "scripts/run-phase-35-eval.ts";
const PHASE35_CONTEXT_TOKEN_BUDGET = 120;
const PHASE35_RULES_ONLY_ENV_KEYS = [
  "GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY",
  "GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL",
  "GOODMEMORY_ASSISTED_EXTRACTOR_MODEL",
  "GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER",
  "GOODMEMORY_EMBEDDING_API_KEY",
  "GOODMEMORY_EMBEDDING_BASE_URL",
  "GOODMEMORY_EMBEDDING_MODEL",
  "GOODMEMORY_EMBEDDING_PROVIDER",
  "GOODMEMORY_RECALL_ROUTER_API_KEY",
  "GOODMEMORY_RECALL_ROUTER_BASE_URL",
  "GOODMEMORY_RECALL_ROUTER_MODEL",
  "GOODMEMORY_RECALL_ROUTER_PROVIDER",
  "GOODMEMORY_STORAGE_PROVIDER",
  "GOODMEMORY_STORAGE_URL",
  "GOODMEMORY_TEST_POSTGRES_URL",
] as const;
const PHASE35_CURRENT_GOAL = "Finish the phase 35 middleware closeout.";
const PHASE35_OPEN_LOOP = "Archive the canonical phase 35 quality gate.";
const PHASE35_SUMMARY_RULE = "Use short next-step bullets in coding summaries.";
const PHASE35_DEPLOY_BLOCKER = "The deploy is blocked on smoke verification.";

const PHASE35_CASES: readonly Phase35CaseSpec[] = [
  {
    caseId: "continuity-open-loop",
    command: "session-start",
    expectations: [
      {
        label: "goal",
        needle: PHASE35_CURRENT_GOAL,
      },
      {
        label: "open-loop",
        needle: PHASE35_OPEN_LOOP,
      },
      {
        label: "journal-state",
        needle: "Global install and automatic hook wiring are done.",
      },
    ],
    focus: "continuity",
  },
  {
    caseId: "repeated-correction",
    command: "user-prompt-submit",
    expectations: [
      {
        label: "summary-rule",
        needle: PHASE35_SUMMARY_RULE,
      },
    ],
    focus: "repeated_correction",
    prompt: "What standing summary style should you follow before answering?",
  },
  {
    caseId: "procedure-adherence",
    command: "user-prompt-submit",
    expectations: [
      {
        label: "deploy-blocker",
        needle: PHASE35_DEPLOY_BLOCKER,
      },
      {
        label: "middleware-procedure",
        needle: "Use installed hook middleware before fallback bootstrap.",
      },
    ],
    focus: "procedure_adherence",
    prompt: "What blocker and middleware rule should you respect before deployment?",
  },
] as const;

export function resolvePhase35FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-35");
}

export function buildPhase35FallbackRunId(timestamp: string): string {
  return `run-${timestamp.replace(/\D/g, "").slice(0, 14) || "phase35"}`;
}

export function parsePhase35EvalCliOptions(
  argv: readonly string[],
): Phase35EvalOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function approximateTokens(value: string): number {
  return value.trim().length === 0 ? 0 : Math.ceil(value.length / 4);
}

function buildScope(caseId: Phase35CaseSpec["caseId"]) {
  return {
    agentId: "codex",
    sessionId: `phase35-session-${caseId}`,
    userId: "phase35-user",
    workspaceId: `phase35-workspace-${caseId}`,
  } as const;
}

function scoreContext(
  content: string,
  expectations: readonly Phase35Expectation[],
): Pick<Phase35DeterministicContextResult, "matchedExpectations" | "score"> {
  const matchedExpectations = expectations
    .filter((expectation) => content.includes(expectation.needle))
    .map((expectation) => expectation.label);

  return {
    matchedExpectations,
    score: matchedExpectations.length,
  };
}

async function withPhase35RulesOnlyEnv<T>(
  execute: () => Promise<T>,
): Promise<T> {
  const previousValues = new Map<string, string | undefined>();

  for (const key of PHASE35_RULES_ONLY_ENV_KEYS) {
    previousValues.set(key, process.env[key]);
    delete process.env[key];
  }

  try {
    return await execute();
  } finally {
    for (const key of PHASE35_RULES_ONLY_ENV_KEYS) {
      const previous = previousValues.get(key);
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  }
}

async function createScenarioMemory(caseSpec: Phase35CaseSpec) {
  const documentStore = createInMemoryDocumentStore();
  const sessionStore = createInMemorySessionStore();
  const runtime = createRuntimeContextService({
    archiveStore: createRuntimeArchiveStore({ documentStore }),
    now: () => "2026-04-23T18:30:00.000Z",
    sessionStore,
  });
  const memory = createGoodMemory({
    storage: { provider: "memory" },
    adapters: {
      documentStore,
      sessionStore,
    },
  });
  const scope = buildScope(caseSpec.caseId);

  await runtime.startSession(scope);

  switch (caseSpec.caseId) {
    case "continuity-open-loop":
      await runtime.updateWorkingMemory(scope, {
        currentGoal: PHASE35_CURRENT_GOAL,
        openLoops: [PHASE35_OPEN_LOOP],
      });
      await runtime.updateSessionJournal(scope, {
        appendWorklog: ["Next step is the canonical gate archive."],
        currentState: "Global install and automatic hook wiring are done.",
      });
      break;
    case "repeated-correction":
      await memory.feedback({
        scope,
        signal: PHASE35_SUMMARY_RULE,
      });
      break;
    case "procedure-adherence":
      await memory.feedback({
        scope,
        signal:
          `${PHASE35_DEPLOY_BLOCKER} Use installed hook middleware before fallback bootstrap.`,
      });
      break;
  }

  return {
    memory,
    scope,
  };
}

async function evaluateMiddlewareContext(
  caseSpec: Phase35CaseSpec,
  mode: Extract<Phase35ScenarioMode, "middleware" | "no-memory">,
): Promise<Phase35DeterministicContextResult> {
  const homeRoot = await mkdtemp(join(tmpdir(), "goodmemory-phase35-home-"));
  const workspaceRoot = await mkdtemp(join(tmpdir(), "goodmemory-phase35-workspace-"));

  try {
    await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
    await mkdir(join(workspaceRoot, ".goodmemory"), { recursive: true });

    const { memory, scope } =
      mode === "middleware"
        ? await createScenarioMemory(caseSpec)
        : {
            memory: createGoodMemory({
              storage: { provider: "memory" },
            }),
            scope: buildScope(caseSpec.caseId),
          };

    await writeFile(
      join(homeRoot, ".goodmemory/codex.json"),
      JSON.stringify(
        {
          debug: false,
          host: "codex",
          maxTokens: PHASE35_CONTEXT_TOKEN_BUDGET,
          retrievalProfile: "coding_agent",
          storage: {
            path: `memory://phase35-${caseSpec.caseId}-${mode}`,
            provider: "memory",
          },
          userId: scope.userId,
          version: 1,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    await writeFile(
      join(workspaceRoot, ".goodmemory/codex.json"),
      JSON.stringify(
        {
          enabled: true,
          host: "codex",
          version: 1,
          workspaceId: scope.workspaceId,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    const payload =
      caseSpec.command === "session-start"
        ? {
            cwd: workspaceRoot,
            hook_event_name: "SessionStart",
            session_id: scope.sessionId,
            source: "startup",
          }
        : {
            cwd: workspaceRoot,
            hook_event_name: "UserPromptSubmit",
            prompt: caseSpec.prompt,
            session_id: scope.sessionId,
          };
    const result = await executeInstalledHostHook(
      {
        command: caseSpec.command,
        host: "codex",
        homeRoot,
        payload,
      },
      {
        createMemory: () => memory,
      },
    );
    const context = result.context ?? "";
    const scored = scoreContext(context, caseSpec.expectations);

    return {
      context,
      estimatedTokens: approximateTokens(context),
      ...scored,
    };
  } finally {
    await rm(homeRoot, { force: true, recursive: true });
    await rm(workspaceRoot, { force: true, recursive: true });
  }
}

async function evaluateTextOnlyContext(
  caseSpec: Phase35CaseSpec,
): Promise<Phase35DeterministicContextResult> {
  const { memory, scope } = await createScenarioMemory(caseSpec);
  const adapter = createHostAdapter({
    hostKind: "codex",
    id: `phase35-text-only-${caseSpec.caseId}`,
    memory,
  });
  const artifacts = await adapter.readArtifacts({
    includeRuntime: true,
    scope,
  });
  const context = artifacts.artifacts
    .map((artifact) => artifact.content.trim())
    .filter((artifact) => artifact.length > 0)
    .join("\n\n");
  const scored = scoreContext(context, caseSpec.expectations);

  return {
    context,
    estimatedTokens: approximateTokens(context),
    ...scored,
  };
}

function roundScore(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export async function runPhase35FallbackEval(
  options: Phase35EvalOptions = {},
  dependencies: Phase35EvalDependencies = {},
): Promise<Phase35DeterministicReport> {
  return withPhase35RulesOnlyEnv(async () => {
    const root = resolveRepoRootFromScriptUrl(import.meta.url);
    const outputDir =
      options.outputDir ?? resolvePhase35FallbackOutputDir(root);
    const now = dependencies.now ?? (() => new Date().toISOString());
    const runId = options.runId ?? buildPhase35FallbackRunId(now());
    const runDirectory = join(outputDir, runId);
    const ensureDir = dependencies.ensureDir ?? mkdir;
    const writeTextFile = dependencies.writeTextFile ?? writeFile;
    const cases: Phase35DeterministicCaseResult[] = [];

    for (const caseSpec of PHASE35_CASES) {
      const middleware = await evaluateMiddlewareContext(caseSpec, "middleware");
      const noMemory = await evaluateMiddlewareContext(caseSpec, "no-memory");
      const textOnly = await evaluateTextOnlyContext(caseSpec);

      cases.push({
        caseId: caseSpec.caseId,
        focus: caseSpec.focus,
        middleware,
        noMemory,
        textOnly,
        nonRegressionAgainstTextOnly: middleware.score >= textOnly.score,
        winOverNoMemory: middleware.score > noMemory.score,
      });
    }

    const summary: Phase35DeterministicSummary = {
      middlewareAverageScore: roundScore(
        cases.reduce((sum, caseResult) => sum + caseResult.middleware.score, 0) /
          cases.length,
      ),
      middlewareNonRegressionPassCount: cases.filter(
        (caseResult) => caseResult.nonRegressionAgainstTextOnly,
      ).length,
      middlewareWinOverNoMemoryCount: cases.filter(
        (caseResult) => caseResult.winOverNoMemory,
      ).length,
      noMemoryAverageScore: roundScore(
        cases.reduce((sum, caseResult) => sum + caseResult.noMemory.score, 0) /
          cases.length,
      ),
      textOnlyAverageScore: roundScore(
        cases.reduce((sum, caseResult) => sum + caseResult.textOnly.score, 0) /
          cases.length,
      ),
      totalCases: cases.length,
    };
    const accepted =
      summary.middlewareNonRegressionPassCount === cases.length &&
      summary.middlewareWinOverNoMemoryCount === cases.length;
    const report: Phase35DeterministicReport = {
      acceptance: {
        decision: accepted ? "accepted" : "blocked",
        reason: accepted
          ? "Installed-host hook middleware stayed non-regressive against the frozen Phase 32 text-only path and beat the no-memory baseline on every deterministic case."
          : "Installed-host hook middleware regressed against the frozen Phase 32 text-only path or failed to beat the no-memory baseline on at least one deterministic case.",
      },
      cases,
      generatedAt: now(),
      generatedBy: GENERATED_BY,
      mode: "fallback",
      outputDir,
      phase: "phase-35",
      runDirectory,
      runId,
      summary,
    };

    await ensureDir(runDirectory, { recursive: true });
    await writeTextFile(
      join(runDirectory, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    return report;
  });
}

if (import.meta.main) {
  const report = await runPhase35FallbackEval(
    parsePhase35EvalCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}
