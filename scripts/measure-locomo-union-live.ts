// P65-R004 live-answer measurement for the semantic candidate-generation UNION.
//
// The retrieval probe (measure-locomo-neural.ts) showed the union breaks the
// additive ~38% conv-1 recall ceiling (union8 63.4% / union16 72.2% / union32
// 79.2%) at a linear noise cost. This script measures what that buys END TO END:
// real neural embeddings (GOODMEMORY_EMBEDDING_*, OpenRouter) + union admission
// + the shared answer evidence pack + the real gpt-5.5 answer generator, scored
// DETERMINISTICALLY by the upstream LoCoMo match mode (token-F1 / adversarial
// abstention) — no LLM judge.
//
// Reuses the harness's exported loader/seeder/scorer/generator read-only (never
// edits the smoke runner, which the concurrent workstream holds in-flight) and
// the same per-question checkpoint pattern so a gateway flake resumes with
// --resume instead of restarting 199 answer calls.
//
//   bun run scripts/measure-locomo-union-live.ts --benchmark-root /private/tmp/LOCOMO-conv1 \
//     --union-topk 16 --run-id run-p3-conv1-union16-live [--resume]
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createGoodMemory, type GoodMemory } from "../src";
import {
  createProviderConversationalMemoryExtractor,
  createProviderEmbeddingAdapter,
} from "../src/provider/layer";
import { scoreLocomoAnswer } from "../src/eval/locomo";
import {
  requestOpenAICompatibleText,
  stripThinkingBlocks,
  withAISDKRetries,
} from "../src/provider/ai-sdk-runtime";
import { resolveCliFlagValue } from "./cli-options";
import { resolveLiveModelConfig } from "./run-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";
import {
  buildLocomoEvidencePackContext,
  buildLocomoPrompt,
  buildLocomoScope,
  collectLocomoRetrievedTurnIds,
  loadLocomoCases,
  LOCOMO_EXTRACTION_CACHE_FILE_NAME,
  locomoQuestionKey,
  overallLocomoEvidenceRecall,
  parseLocomoExtractionCacheLines,
  parseLocomoProgressLines,
  scoreLocomoRetrieval,
  seedLocomoCase,
  seedLocomoCaseConversational,
  summarizeLocomoRetrieval,
  wrapMemoryExtractorWithJsonlCache,
  type LocomoAnswerGenerator,
  type LocomoQuestionRetrieval,
} from "./run-phase-65-locomo-smoke";

// Same instruction set as the harness generator, PLUS the exact abstention
// token the upstream contract expects. LoCoMo normalizes every adversarial
// gold to the literal string "No information available" and scores abstention
// by token-F1 against it — an answer model that correctly abstains with "I
// don't know" is scored WRONG on format alone (the same failure mode as MAB
// TTL's 0/30, fixed there by teaching the expected answer FORM, scorer
// untouched). Telling the model the expected abstention form is an
// answer-format fix, not gold leakage: it applies to every question and
// contains no per-question information.
const UNION_LIVE_ANSWER_SYSTEM =
  "You answer questions about a long multi-session conversation using only the supplied dialog context. Combining facts across sessions is expected. Answer with the shortest phrase that is correct. For questions about WHEN something happened, give the absolute date (resolve relative references like \"last week\" or \"yesterday\" using the session dates shown in the context). If the dialog context does not contain the information needed to answer, reply exactly: No information available. Never guess. Output only the final answer with no explanation.";

const LIVE_REQUEST_TIMEOUT_MS = 120000;

function createUnionLiveAnswerGenerator(): LocomoAnswerGenerator {
  const model = resolveLiveModelConfig("GOODMEMORY_EVAL");
  return async (input) => {
    const raw = await withAISDKRetries(() =>
      requestOpenAICompatibleText({
        model,
        prompt: buildLocomoPrompt({
          memoryContext: input.memoryContext,
          question: input.question.question,
        }),
        system: UNION_LIVE_ANSWER_SYSTEM,
        timeoutMs: LIVE_REQUEST_TIMEOUT_MS,
      }),
    );
    return stripThinkingBlocks(raw);
  };
}

function parseNumberFlag(argv: readonly string[], flag: string): number | undefined {
  const raw = resolveCliFlagValue(argv, flag);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${flag} must be a non-negative number.`);
  }
  return value;
}

function buildUnionMemory(union: {
  maxAdditions?: number;
  minSimilarity?: number;
  topK: number;
}): GoodMemory {
  let idCounter = 0;
  let clockTick = 0;
  return createGoodMemory({
    adapters: {
      embeddingAdapter: createProviderEmbeddingAdapter({
        model: {
          provider: "openai",
          model: process.env.GOODMEMORY_EMBEDDING_MODEL ?? "text-embedding-3-small",
          apiKey: process.env.GOODMEMORY_EMBEDDING_API_KEY,
          baseURL: process.env.GOODMEMORY_EMBEDDING_BASE_URL,
        },
      }),
    },
    retrieval: { semanticCandidates: union },
    storage: { provider: "memory" },
    testing: {
      createId: () => `locomo-union-live-${String((idCounter += 1)).padStart(6, "0")}`,
      now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, (clockTick += 1))),
    },
  });
}

async function main(): Promise<void> {
  // Same .env workaround as measure-locomo-neural.ts: the assisted-extractor env
  // group is set but missing _PROVIDER; seeding is rules-only so it is unused.
  if (!process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER) {
    process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER = "openai";
  }
  const argv = Bun.argv;
  const repoRoot = resolveRepoRootFromScriptUrl(import.meta.url);
  const benchmarkRoot =
    resolveCliFlagValue(argv, "--benchmark-root") ?? process.env.GOODMEMORY_LOCOMO_ROOT;
  const topK = parseNumberFlag(argv, "--union-topk") ?? 16;
  const maxAdditions = parseNumberFlag(argv, "--max-additions");
  const minSimilarity = parseNumberFlag(argv, "--min-similarity");
  const limitRaw = resolveCliFlagValue(argv, "--limit");
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  const resume = argv.includes("--resume");
  const withExtraction = argv.includes("--with-extraction");
  // Per-question LLM concurrency (recall + answer are independent across
  // questions once a case is seeded; the JSONL checkpoint is key-based so
  // completion order does not matter). Seeding/extraction stays sequential.
  const concurrencyRaw = parseNumberFlag(argv, "--concurrency");
  const concurrency = Math.max(1, Math.floor(concurrencyRaw ?? 1));
  // Gate-required ablation: answer every question with NO memory context (no
  // seeding, no recall). With the abstention-format instruction the honest
  // baseline is abstention on unanswerable probes and near-zero elsewhere.
  const noMemory = argv.includes("--no-memory");
  const runId = resolveCliFlagValue(argv, "--run-id") ?? `run-locomo-union${topK}-live`;
  const outputDir =
    resolveCliFlagValue(argv, "--output-dir") ??
    join(repoRoot, "reports", "eval", "research", "phase-65", "locomo");
  const runDirectory = join(outputDir, runId);
  const progressPath = join(runDirectory, "live-progress.jsonl");

  const { cases } = await loadLocomoCases({
    benchmarkRoot,
    limit,
    readFile: (path: string) => readFile(path, "utf8"),
  });

  await mkdir(runDirectory, { recursive: true });
  const completed = new Map<string, LocomoQuestionRetrieval>();
  if (resume) {
    try {
      for (const entry of parseLocomoProgressLines(await readFile(progressPath, "utf8"))) {
        completed.set(locomoQuestionKey(entry.caseId, entry.questionId), entry);
      }
    } catch {
      // fresh run
    }
  } else {
    await writeFile(progressPath, "");
  }

  const union = {
    topK,
    ...(maxAdditions !== undefined ? { maxAdditions } : {}),
    ...(minSimilarity !== undefined ? { minSimilarity } : {}),
  };
  const answerGenerator = createUnionLiveAnswerGenerator();
  // Optional write-time conversational atomic-fact extraction (additive, never
  // destructive), reusing the harness's seeder + the content-addressed cache so
  // a cache file copied from a prior run skips every extraction LLM call.
  const extractor = withExtraction
    ? await (async () => {
        const cachePath = join(runDirectory, LOCOMO_EXTRACTION_CACHE_FILE_NAME);
        let initialCache: Map<string, unknown> = new Map();
        try {
          initialCache = parseLocomoExtractionCacheLines(
            await readFile(cachePath, "utf8"),
          );
        } catch {
          // no cache yet
        }
        return wrapMemoryExtractorWithJsonlCache(
          createProviderConversationalMemoryExtractor({
            model: resolveLiveModelConfig("GOODMEMORY_EVAL"),
            requestTimeoutMs: LIVE_REQUEST_TIMEOUT_MS,
          }),
          {
            appendFile: (path, data) => appendFile(path, data),
            cachePath,
            configTag: process.env.GOODMEMORY_EVAL_MODEL ?? "eval-model",
            initialCache,
          },
        );
      })()
    : undefined;
  const results: LocomoQuestionRetrieval[] = [];
  let executionFailures = 0;

  for (const testCase of cases) {
    const pending = testCase.questions.filter(
      (question) => !completed.has(locomoQuestionKey(testCase.caseId, question.questionId)),
    );
    for (const question of testCase.questions) {
      const cached = completed.get(locomoQuestionKey(testCase.caseId, question.questionId));
      if (cached) {
        results.push(cached);
      }
    }
    if (pending.length === 0) {
      continue;
    }
    const memory = noMemory ? null : buildUnionMemory(union);
    const scope = buildLocomoScope({ caseId: testCase.caseId, runId });
    if (memory) {
      try {
        // Raw turns always; extraction facts additively when --with-extraction.
        await seedLocomoCase({ memory, runId, testCase });
        if (extractor) {
          await seedLocomoCaseConversational({
            extractor,
            memory,
            runId,
            testCase,
          });
        }
      } catch {
        executionFailures += pending.length;
        continue;
      }
    }
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= pending.length) {
          return;
        }
        const question = pending[index]!;
        try {
          const retrievedTurnIds = memory
            ? collectLocomoRetrievedTurnIds(
                await memory.recall({
                  query: question.question,
                  scope,
                  strategy: "hybrid",
                }),
              )
            : [];
          const retrieval = scoreLocomoRetrieval({ question, retrievedTurnIds, testCase });
          const generatedAnswer = await answerGenerator({
            memoryContext: memory
              ? buildLocomoEvidencePackContext({
                  question,
                  retrievedTurnIds,
                  testCase,
                })
              : "",
            question,
            retrievedTurnIds,
            testCase,
          });
          const result: LocomoQuestionRetrieval = {
            ...retrieval,
            answerCorrect: scoreLocomoAnswer({
              adversarialAnswer: question.adversarialAnswer,
              answer: generatedAnswer,
              goldAnswer: question.goldAnswer,
              matchMode: question.matchMode,
            }),
            generatedAnswer,
          };
          results.push(result);
          try {
            await appendFile(progressPath, `${JSON.stringify(result)}\n`);
          } catch {
            // best-effort checkpoint
          }
        } catch {
          executionFailures += 1;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, pending.length) }, () => worker()),
    );
  }

  const categories = summarizeLocomoRetrieval(results);
  const answered = results.filter((entry) => entry.answerCorrect !== null);
  const report = {
    concurrency,
    answerAccuracyOverall:
      answered.length === 0
        ? null
        : answered.filter((entry) => entry.answerCorrect === true).length / answered.length,
    benchmark: "locomo",
    categories,
    cases: results,
    executionFailures,
    evidenceRecallOverall: overallLocomoEvidenceRecall(results),
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/measure-locomo-union-live.ts",
    mode: "live-answer",
    phase: "phase-65",
    questionCount: results.length,
    noMemory,
    resume,
    runDirectory,
    runId,
    union,
    withExtraction,
    // The abstention-format instruction is part of the measured configuration.
    answerSystem: "union-live-abstention-format-v1",
  };
  await writeFile(
    join(runDirectory, "union-live-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        answerAccuracyOverall: report.answerAccuracyOverall,
        answeredCount: answered.length,
        categories: categories.map((entry) => ({
          answerAccuracy: entry.answerAccuracy,
          averageEvidenceRecall: entry.averageEvidenceRecall,
          category: entry.category,
          noiseTurnTotal: entry.noiseTurnTotal,
          questionCount: entry.questionCount,
        })),
        evidenceRecallOverall: report.evidenceRecallOverall,
        executionFailures,
        reportPath: join(runDirectory, "union-live-report.json"),
        runId,
        union,
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) {
  await main();
}
