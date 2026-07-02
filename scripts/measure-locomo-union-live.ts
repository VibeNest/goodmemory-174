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
import { createProviderEmbeddingAdapter } from "../src/provider/layer";
import { scoreLocomoAnswer } from "../src/eval/locomo";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";
import {
  buildLocomoEvidencePackContext,
  buildLocomoScope,
  collectLocomoRetrievedTurnIds,
  createLocomoLiveAnswerGenerator,
  loadLocomoCases,
  locomoQuestionKey,
  overallLocomoEvidenceRecall,
  parseLocomoProgressLines,
  scoreLocomoRetrieval,
  summarizeLocomoRetrieval,
  type LocomoQuestionRetrieval,
} from "./run-phase-65-locomo-smoke";

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
  const answerGenerator = createLocomoLiveAnswerGenerator();
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
    const memory = buildUnionMemory(union);
    const scope = buildLocomoScope({ caseId: testCase.caseId, runId });
    // Raw-turn seeding only (extraction is a separate lever measured by the
    // harness's --conversational-extraction arm).
    const { seedLocomoCase } = await import("./run-phase-65-locomo-smoke");
    try {
      await seedLocomoCase({ memory, runId, testCase });
    } catch {
      executionFailures += pending.length;
      continue;
    }
    for (const question of pending) {
      try {
        const recall = await memory.recall({
          query: question.question,
          scope,
          strategy: "hybrid",
        });
        const retrievedTurnIds = collectLocomoRetrievedTurnIds(recall);
        const retrieval = scoreLocomoRetrieval({ question, retrievedTurnIds, testCase });
        const generatedAnswer = await answerGenerator({
          memoryContext: buildLocomoEvidencePackContext({
            question,
            retrievedTurnIds,
            testCase,
          }),
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
  }

  const categories = summarizeLocomoRetrieval(results);
  const answered = results.filter((entry) => entry.answerCorrect !== null);
  const report = {
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
    resume,
    runDirectory,
    runId,
    union,
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
