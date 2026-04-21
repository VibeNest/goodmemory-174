import { join } from "node:path";
import { createInternalGoodMemory } from "../src/api/createGoodMemory";
import type { GoodMemoryConfig } from "../src/api/contracts";
import type {
  BehavioralAdaptationMemoryFactory,
  BehavioralAdaptationReport,
  BehavioralAnswerGenerator,
  RunBehavioralAdaptationEvaluationOptions,
} from "../src/eval/behavioral-adaptation";
import {
  behavioralFirstActionsEqual,
  type BehavioralFirstAction,
} from "../src/evolution/behavioralTelemetry";
import { createHostBehavioralTraceRecorder } from "../src/host/behavioralTraceRecorder";
import { runBehavioralAdaptationEvaluation } from "../src/eval/behavioral-adaptation";
import {
  createProviderEmbeddingAdapter,
  createProviderMemoryExtractor,
  createProviderTextGenerator,
} from "../src/provider/layer";
import type { AISDKModelConfig } from "../src/provider/ai-sdk-runtime";
import {
  resolveFlagValue,
  resolveLiveModelConfig,
  resolveProviderBackedModelConfig,
} from "./run-eval";
import {
  resolvePhase30FixtureDir,
  type Phase30EvalOptions,
} from "./run-phase-30-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";
import { canBootstrapPostgresStorageBackend } from "../src/storage/postgres";

export interface Phase30LiveMemoryDependencies {
  assertProviderBackedStorage?: (postgresUrl: string) => Promise<void>;
  createEmbeddingAdapter?: typeof createProviderEmbeddingAdapter;
  createMemory?: typeof createInternalGoodMemory;
  createMemoryExtractor?: typeof createProviderMemoryExtractor;
  createTextGenerator?: typeof createProviderTextGenerator;
  preflightLiveMemory?: () => Promise<void>;
  runEvaluation?: (
    input: RunBehavioralAdaptationEvaluationOptions,
  ) => Promise<BehavioralAdaptationReport>;
}

interface ParsedStructuredBehavioralResponse {
  answer?: string;
  first_action?: {
    args?: string[];
    kind?: "command" | "tool_call" | "warning";
    name?: string;
    raw?: string;
  };
}

const GENERATED_BY = "scripts/run-phase-30-live-memory.ts";
const PHASE30_LIVE_PREFLIGHT_SCOPE = {
  userId: "phase30-live-preflight",
  workspaceId: "phase30-live-preflight",
} as const;

export function resolvePhase30LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-30");
}

function resolvePostgresUrl(): string {
  const postgresUrl = process.env.GOODMEMORY_TEST_POSTGRES_URL;
  if (!postgresUrl || postgresUrl.trim().length === 0) {
    throw new Error(
      "Missing required provider-backed eval environment variables: GOODMEMORY_TEST_POSTGRES_URL",
    );
  }

  return postgresUrl;
}

async function assertPhase30ProviderBackedStorage(
  postgresUrl: string,
): Promise<void> {
  let usable = false;

  try {
    usable = await canBootstrapPostgresStorageBackend({
      url: postgresUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : String(error);
    throw new Error(
      [
        "Phase 30 live provider-backed evidence requires a bootstrap-usable Postgres backend.",
        "A report built on a broken provider-backed storage path is not closure-quality evidence.",
        `Underlying error: ${message}`,
      ].join(" "),
    );
  }

  if (!usable) {
    throw new Error(
      [
        "Phase 30 live provider-backed evidence requires a bootstrap-usable Postgres backend.",
        "A report built on a broken provider-backed storage path is not closure-quality evidence.",
      ].join(" "),
    );
  }
}

function buildPhase30LiveMemoryConfig(input: {
  createEmbeddingAdapter: typeof createProviderEmbeddingAdapter;
  createMemoryExtractor: typeof createProviderMemoryExtractor;
  embeddingModel: AISDKModelConfig;
  extractorModel: AISDKModelConfig;
  postgresUrl: string;
}): GoodMemoryConfig {
  return {
    storage: {
      provider: "postgres",
      url: input.postgresUrl,
    },
    adapters: {
      embeddingAdapter: input.createEmbeddingAdapter({
        model: input.embeddingModel,
      }),
      assistedExtractor: input.createMemoryExtractor({
        model: input.extractorModel,
      }),
    },
  };
}

async function assertPhase30LiveMemoryStackUsable(input: {
  createEmbeddingAdapter: typeof createProviderEmbeddingAdapter;
  createMemory: typeof createInternalGoodMemory;
  createMemoryExtractor: typeof createProviderMemoryExtractor;
  embeddingModel: AISDKModelConfig;
  extractorModel: AISDKModelConfig;
  postgresUrl: string;
}): Promise<void> {
  const memory = input.createMemory(
    buildPhase30LiveMemoryConfig({
      createEmbeddingAdapter: input.createEmbeddingAdapter,
      createMemoryExtractor: input.createMemoryExtractor,
      embeddingModel: input.embeddingModel,
      extractorModel: input.extractorModel,
      postgresUrl: input.postgresUrl,
    }),
    {
      behavioralOutcomeRecorder: true,
    },
  );
  let failure: unknown;

  try {
    await memory.remember({
      scope: PHASE30_LIVE_PREFLIGHT_SCOPE,
      messages: [
        {
          role: "user",
          content:
            "Before any deploy --prod action, request explicit approval first.",
        },
      ],
    });
    await memory.recall({
      scope: PHASE30_LIVE_PREFLIGHT_SCOPE,
      query: "What must happen before deploy --prod?",
    });
  } catch (error) {
    failure = error;
  }

  try {
    await memory.deleteAllMemory({
      scope: PHASE30_LIVE_PREFLIGHT_SCOPE,
      includeRuntime: true,
    });
  } catch (cleanupError) {
    failure ??= cleanupError;
  }

  if (!failure) {
    return;
  }

  const message =
    failure instanceof Error && failure.message.trim().length > 0
      ? failure.message
      : String(failure);
  throw new Error(
    [
      "Phase 30 live provider-backed evidence requires a bootstrap-usable memory stack.",
      "The runner must prove storage, extraction, and recall can initialize before case-level execution starts.",
      `Underlying error: ${message}`,
    ].join(" "),
  );
}

function buildLivePrompt(input: Parameters<BehavioralAnswerGenerator>[0]): string {
  const canonicalProbe =
    input.mode === "goodmemory" ? input.prompt : `Probe:\n${input.prompt}`;

  if (input.fixture.paradigm === "priming") {
    return [
      "Return exactly three codenames, one per line.",
      canonicalProbe,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    "Return valid JSON with keys answer and first_action.",
    "first_action.kind must be tool_call, command, or warning.",
    canonicalProbe,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function parseStructuredBehavioralResponse(
  value: string,
): ParsedStructuredBehavioralResponse {
  return JSON.parse(value) as ParsedStructuredBehavioralResponse;
}

function toBehavioralFirstAction(
  value: ParsedStructuredBehavioralResponse["first_action"],
): BehavioralFirstAction | undefined {
  if (!value?.kind || !value?.name) {
    return undefined;
  }

  return {
    kind: value.kind,
    name: value.name,
    ...(value.args ? { args: value.args } : {}),
    ...(value.raw ? { raw: value.raw } : {}),
  };
}

function resolveActionOutcome(input: {
  action: BehavioralFirstAction;
  payload: Parameters<BehavioralAnswerGenerator>[0];
}): "failure" | "success" {
  if (input.payload.fixture.paradigm === "priming") {
    return "success";
  }

  return behavioralFirstActionsEqual(
    input.action,
    input.payload.fixture.expected_first_action,
  )
    ? "success"
    : "failure";
}

export function buildPhase30LiveAnswerGenerator(input: {
  createTextGenerator: typeof createProviderTextGenerator;
  evalModel: AISDKModelConfig;
}): BehavioralAnswerGenerator {
  const generator = input.createTextGenerator({
    model: input.evalModel,
    system:
      "You are a strict first-action evaluator. Follow output format instructions exactly.",
    promptBuilder: (payload) => payload.prompt,
  });

  return async (payload) => {
    const result = await generator({
      persona: {} as never,
      scenario: {} as never,
      prompt: buildLivePrompt(payload),
      transcript: "",
      memoryContext: payload.memoryContext,
    });

    if (payload.fixture.paradigm === "priming") {
      return {
        answer: result.content.trim(),
      };
    }

    const parsed = parseStructuredBehavioralResponse(result.content);
    const firstAction = toBehavioralFirstAction(parsed.first_action);

    if (!firstAction) {
      return {
        answer: parsed.answer ?? result.content.trim(),
      };
    }

    const recorder = createHostBehavioralTraceRecorder({
      cue: payload.fixture.task_name,
      hostKind: "codex",
      traceId: [
        "phase30-live",
        payload.mode,
        payload.profile,
        payload.fixture.case_id,
        payload.branch ?? "default",
      ].join("-"),
    });
    recorder.appendEvent({
      actionKind: firstAction.kind,
      actionName: firstAction.name,
      ...(firstAction.args ? { args: firstAction.args } : {}),
      outcome: resolveActionOutcome({
        action: firstAction,
        payload,
      }),
      ...(firstAction.raw ? { raw: firstAction.raw } : {}),
    });
    const closeResult = await recorder.close();

    if (!closeResult.trace) {
      return {
        answer: parsed.answer ?? result.content.trim(),
      };
    }

    return {
      answer: parsed.answer ?? result.content.trim(),
      trace: closeResult.trace,
    };
  };
}

function buildLiveMemoryFactory(input: {
  createEmbeddingAdapter: typeof createProviderEmbeddingAdapter;
  createMemory: typeof createInternalGoodMemory;
  createMemoryExtractor: typeof createProviderMemoryExtractor;
  embeddingModel: AISDKModelConfig;
  extractorModel: AISDKModelConfig;
  postgresUrl: string;
}): BehavioralAdaptationMemoryFactory {
  return ({ scope }) => {
    const config = buildPhase30LiveMemoryConfig({
      createEmbeddingAdapter: input.createEmbeddingAdapter,
      createMemoryExtractor: input.createMemoryExtractor,
      embeddingModel: input.embeddingModel,
      extractorModel: input.extractorModel,
      postgresUrl: input.postgresUrl,
    });
    const memory = input.createMemory(config, {
      behavioralOutcomeRecorder: true,
    });

    return {
      memory,
      cleanup: async () => {
        await memory.deleteAllMemory({
          scope: {
            userId: scope.userId,
            workspaceId: scope.workspaceId,
          },
          includeRuntime: true,
        });
      },
    };
  };
}

export async function runPhase30LiveMemoryEval(
  input?: Phase30EvalOptions,
  dependencies?: Phase30LiveMemoryDependencies,
): Promise<BehavioralAdaptationReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const evalModel = resolveLiveModelConfig("GOODMEMORY_EVAL");
  const embeddingModel = resolveProviderBackedModelConfig("GOODMEMORY_EMBEDDING");
  const extractorModel = resolveProviderBackedModelConfig(
    "GOODMEMORY_ASSISTED_EXTRACTOR",
  );
  const createEmbeddingAdapter =
    dependencies?.createEmbeddingAdapter ?? createProviderEmbeddingAdapter;
  const createMemory = dependencies?.createMemory ?? createInternalGoodMemory;
  const createMemoryExtractor =
    dependencies?.createMemoryExtractor ?? createProviderMemoryExtractor;
  const createTextGenerator =
    dependencies?.createTextGenerator ?? createProviderTextGenerator;
  const assertProviderBackedStorage =
    dependencies?.assertProviderBackedStorage ?? assertPhase30ProviderBackedStorage;
  const postgresUrl = resolvePostgresUrl();
  const preflightLiveMemory =
    dependencies?.preflightLiveMemory ??
    (() =>
      assertPhase30LiveMemoryStackUsable({
        createEmbeddingAdapter,
        createMemory,
        createMemoryExtractor,
        embeddingModel,
        extractorModel,
        postgresUrl,
      }));
  const runEvaluation = dependencies?.runEvaluation ?? runBehavioralAdaptationEvaluation;

  await assertProviderBackedStorage(postgresUrl);
  await preflightLiveMemory();

  return runEvaluation({
    answerGenerator: buildPhase30LiveAnswerGenerator({
      createTextGenerator,
      evalModel,
    }),
    createMemory: buildLiveMemoryFactory({
      createEmbeddingAdapter,
      createMemory,
      createMemoryExtractor,
      embeddingModel,
      extractorModel,
      postgresUrl,
    }),
    fixtureDir: resolvePhase30FixtureDir(root),
    generatedBy: GENERATED_BY,
    mode: "live-memory",
    outputDir: input?.outputDir ?? resolvePhase30LiveMemoryOutputDir(root),
    requireTraceForStructuredCases: true,
    runId: input?.runId,
    scopePrefix: "phase30-live",
  });
}

export function parsePhase30LiveMemoryCliOptions(
  argv: readonly string[],
): Phase30EvalOptions {
  return {
    outputDir: resolveFlagValue([...argv], "--output-dir"),
    runId: resolveFlagValue([...argv], "--run-id"),
  };
}

async function main(): Promise<void> {
  const report = await runPhase30LiveMemoryEval(
    parsePhase30LiveMemoryCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
