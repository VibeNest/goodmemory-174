import {
  createLongMemEvalGoodMemoryContextBuilder,
  runLongMemEvalSuite,
  type LongMemEvalAnswerJudge,
  type LongMemEvalAnswerJudgeInput,
  type LongMemEvalAnswerGenerator,
  type LongMemEvalReport,
  type RunLongMemEvalOptions,
} from "../src/eval/longmemeval";
import { createGoodMemory } from "../src/api/createGoodMemory";
import type { GoodMemory, GoodMemoryConfig } from "../src/api/contracts";
import type { PersonaSpec, ScenarioFixture } from "../src/eval/dataset";
import {
  createProviderEmbeddingAdapter,
  createProviderMemoryExtractor,
  createProviderTextGenerator,
} from "../src/provider/layer";
import type { AISDKModelConfig } from "../src/provider/ai-sdk-runtime";
import {
  requestOpenAICompatibleObject,
  resolveAISDKModel,
  withAISDKRetries,
} from "../src/provider/ai-sdk-runtime";
import {
  resolveLiveModelConfig,
  resolveProviderBackedModelConfig,
} from "./run-eval";
import {
  assertPhase62Readiness,
  checkPhase62Readiness,
  parsePhase62CliOptions,
  resolvePhase62BenchmarkRoot,
  resolvePhase62OutputDir,
  resolvePhase62RepoRoot,
  type Phase62CliOptions,
} from "./run-phase-62-shared";
import { generateObject } from "ai";
import { z } from "zod";

export const PHASE62_CANONICAL_RUN_ID = "run-phase62-longmemeval-smoke-current";

const GENERATED_BY = "scripts/run-phase-62-eval.ts";

export interface Phase62EvalDependencies {
  createMemory?: typeof createGoodMemory;
  runSuite?: typeof runLongMemEvalSuite;
}

const LONGMEMEVAL_PERSONA: PersonaSpec = {
  age_range: "unknown",
  background: "External LongMemEval benchmark persona.",
  communication_preferences: [],
  current_projects: [],
  domain_specific_preferences: [],
  domains: ["external-benchmark"],
  drift_events: [],
  expertise: [],
  growth_path: [],
  known_relationships: [],
  lifecycle_bucket: "medium",
  locale: "en",
  long_term_goals: [],
  memory_risks: [],
  name: "LongMemEval",
  negative_personalization_risks: [],
  persona_id: "longmemeval",
  profession: "benchmark",
  scenario_ids: ["longmemeval"],
  stable_preferences: [],
  work_style_preferences: [],
};

const LONGMEMEVAL_SCENARIO: ScenarioFixture = {
  domain: "external-benchmark",
  evaluation: {
    expected_history_signals: [],
    expected_identity_signals: [],
    expected_non_transfer_signals: [],
    expected_stale_suppression: [],
    expected_transfer_signals: [],
    expected_update_wins: [],
    improvement_hypothesis: "External LongMemEval answer generation.",
    prompt: "",
    rubric_focus: ["history_open_loop"],
    user_satisfaction_hypothesis: "Answers use only provided context.",
    wrong_personalization_signals: [],
  },
  evaluation_setting: "single_domain",
  lifecycle_bucket: "medium",
  memory_source_domains: ["external-benchmark"],
  persona_id: "longmemeval",
  required_phenomena: ["historical_task_continuation"],
  scenario_id: "longmemeval",
  sessions: [],
  task_family: "preference_continuation",
};

const NO_PROVIDER_EMBEDDING_ADAPTER = {
  embed: async (texts: string[]) => texts.map(() => [0]),
} satisfies NonNullable<GoodMemoryConfig["adapters"]>["embeddingAdapter"];

const NO_PROVIDER_ASSISTED_EXTRACTOR = {
  extract: async (input) => ({
    candidates: [],
    ignoredMessageCount: input.messages.length,
  }),
} satisfies NonNullable<GoodMemoryConfig["adapters"]>["assistedExtractor"];

const LONGMEMEVAL_REMEMBER_CONFIG = {
  profiles: [
    {
      assistantOutputs: { mode: "verified_only" },
      id: "phase-62-longmemeval",
    },
  ],
} satisfies GoodMemoryConfig["remember"];

const longMemEvalAnswerJudgeSchema = z.object({
  correct: z.boolean(),
  reasoning: z.string().min(1),
});

export function buildLongMemEvalPrompt(input: {
  memoryContext?: string;
  prompt: string;
  questionDate?: string;
  transcript: string;
}): string {
  return [
    input.transcript ? `Visible conversation history:\n${input.transcript}` : undefined,
    input.memoryContext ? `Memory context:\n${input.memoryContext}` : undefined,
    input.questionDate ? `Question date:\n${input.questionDate}` : undefined,
    `Question:\n${input.prompt}`,
    "For recommendation-style questions, answer with the user's remembered preference or constraints that should guide recommendations; do not list generic recommendations.",
    "For recommendation-style questions about a requested object category, include that category in the answer, such as resources, accessories, publications, conferences, or gear.",
    "For count questions, count distinct matching evidence items only. Include both past and current matches when the question asks for both; ignore related facts that do not satisfy the wording.",
    "Return only the short answer. If the answer is not present in the visible history or memory context, return exactly: No answer.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function createLongMemEvalAnswerGenerator(): LongMemEvalAnswerGenerator {
  const model = resolveLiveModelConfig("GOODMEMORY_EVAL");
  const system =
    "You answer LongMemEval questions using only the supplied conversation history or GoodMemory context. Do not invent missing details.";

  return async (input) => {
    const generator = createProviderTextGenerator({
      model,
      system,
      promptBuilder: (payload) =>
        buildLongMemEvalPrompt({
          memoryContext: payload.memoryContext,
          prompt: payload.prompt,
          questionDate: input.testCase.questionDate,
          transcript: payload.transcript,
        }),
    });
    const output = await generator({
      memoryContext: input.memoryContext,
      persona: LONGMEMEVAL_PERSONA,
      prompt: input.prompt,
      scenario: LONGMEMEVAL_SCENARIO,
      transcript: input.transcript,
    });
    return output.content;
  };
}

function buildLongMemEvalJudgePrompt(input: LongMemEvalAnswerJudgeInput): string {
  return [
    "You are judging LongMemEval answer correctness.",
    "Return strict JSON with keys: correct (boolean), reasoning (string).",
    "Mark correct when the candidate answer is semantically equivalent to the expected answer for the question.",
    "Accept concise numeric, entity, date, duration, or preference answers when they preserve the expected answer's core content.",
    "For recommendation-style questions, require the candidate to preserve the remembered user preference or constraint; do not require identical wording.",
    "Reject answers that are generic, contradict the expected answer, say no answer when the expected answer is present, or omit the core answer.",
    `Question id: ${input.questionId}`,
    `Question type: ${input.questionType}`,
    `Question: ${input.question}`,
    `Expected answer: ${input.expectedAnswer}`,
    `Candidate answer: ${input.actualAnswer}`,
  ].join("\n\n");
}

async function runLongMemEvalLiveAnswerJudge(
  model: AISDKModelConfig,
  input: LongMemEvalAnswerJudgeInput,
): Promise<Awaited<ReturnType<LongMemEvalAnswerJudge>>> {
  const prompt = buildLongMemEvalJudgePrompt(input);
  const system =
    "You are a strict benchmark judge. Return only valid JSON matching the requested shape.";

  if (model.provider === "openai" && model.baseURL) {
    return withAISDKRetries(() =>
      requestOpenAICompatibleObject({
        model,
        prompt,
        schema: longMemEvalAnswerJudgeSchema,
        system,
      }),
    );
  }

  const { object } = await withAISDKRetries(async () =>
    generateObject({
      model: resolveAISDKModel(model),
      prompt,
      schema: longMemEvalAnswerJudgeSchema,
      system,
    }),
  );
  return object;
}

export function createLongMemEvalAnswerJudge(): LongMemEvalAnswerJudge {
  const model = resolveLiveModelConfig("GOODMEMORY_JUDGE");

  return (input) => runLongMemEvalLiveAnswerJudge(model, input);
}

export function createLongMemEvalMemoryFactory(
  createMemory: typeof createGoodMemory,
): (profile: "goodmemory-hybrid" | "goodmemory-rules-only") => GoodMemory {
  return (profile) => {
    if (profile === "goodmemory-rules-only") {
      return createMemory({
        adapters: {
          assistedExtractor: NO_PROVIDER_ASSISTED_EXTRACTOR,
          embeddingAdapter: NO_PROVIDER_EMBEDDING_ADAPTER,
        },
        remember: LONGMEMEVAL_REMEMBER_CONFIG,
        storage: {
          provider: "memory",
        },
      });
    }

    if (!process.env.GOODMEMORY_TEST_POSTGRES_URL) {
      throw new Error(
        "LongMemEval goodmemory-hybrid full mode requires GOODMEMORY_TEST_POSTGRES_URL.",
      );
    }

    const embeddingModel = resolveProviderBackedModelConfig("GOODMEMORY_EMBEDDING");
    const extractorModel = resolveProviderBackedModelConfig(
      "GOODMEMORY_ASSISTED_EXTRACTOR",
    );

    return createMemory({
      adapters: {
        assistedExtractor: createProviderMemoryExtractor({
          model: extractorModel,
        }),
        embeddingAdapter: createProviderEmbeddingAdapter({
          model: embeddingModel,
        }),
      },
      remember: LONGMEMEVAL_REMEMBER_CONFIG,
      storage: {
        provider: "postgres",
        url: process.env.GOODMEMORY_TEST_POSTGRES_URL,
      },
    });
  };
}

function buildRunOptions(
  root: string,
  options: Phase62CliOptions,
): RunLongMemEvalOptions {
  const smoke = options.mode === "smoke";
  return {
    benchmarkRoot:
      options.benchmarkRoot ?? resolvePhase62BenchmarkRoot(root, smoke),
    caseIds: options.caseIds,
    generatedBy: GENERATED_BY,
    limit: options.limit,
    maxConcurrency: options.maxConcurrency,
    mode: options.mode,
    offset: options.offset,
    outputDir: options.outputDir ?? resolvePhase62OutputDir(root),
    profiles: options.profiles,
    questionTypes: options.questionTypes,
    runId: options.runId ?? PHASE62_CANONICAL_RUN_ID,
  };
}

export async function runPhase62LongMemEval(
  options: Partial<Phase62CliOptions> = {},
  dependencies: Phase62EvalDependencies = {},
): Promise<LongMemEvalReport> {
  const root = resolvePhase62RepoRoot();
  const runSuite = dependencies.runSuite ?? runLongMemEvalSuite;
  const runOptions = buildRunOptions(root, {
    mode: "smoke",
    ...options,
  });

  if (runOptions.mode === "full" && !dependencies.runSuite) {
    assertPhase62Readiness(
      checkPhase62Readiness({
        benchmarkRoot: runOptions.benchmarkRoot,
        mode: runOptions.mode,
        profiles: runOptions.profiles,
      }),
    );

    return runSuite(runOptions, {
      answerGenerator: createLongMemEvalAnswerGenerator(),
      answerJudge: createLongMemEvalAnswerJudge(),
      memoryContextBuilder: createLongMemEvalGoodMemoryContextBuilder({
        createMemory: createLongMemEvalMemoryFactory(
          dependencies.createMemory ?? createGoodMemory,
        ),
        runId: runOptions.runId,
      }),
    });
  }

  return runSuite(runOptions);
}

if (import.meta.main) {
  const report = await runPhase62LongMemEval(
    parsePhase62CliOptions(Bun.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}
