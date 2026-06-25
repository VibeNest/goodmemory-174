// Measure REAL neural embedding retrieval on LoCoMo vs the lexical floor / BM25.
//
// The embedding endpoint (OpenRouter /v1/embeddings, text-embedding-3-small,
// 1536-dim) is the P65-R003 unlock: it is the only lever that can bridge the
// single_hop/multi_hop vocabulary gap BM25 cannot. This builds a GoodMemory
// instance with the provider embedding adapter + an in-memory vector store and
// runs hybrid recall (lexical floor + ADDITIVE neural semanticScore), reusing the
// harness's exported LoCoMo loader/seeder/scorer read-only (so it never edits the
// concurrent agent's harness). Metric = deterministic gold-turn evidence recall
// (no LLM judge, no answer generation; only the embedding calls hit the network).
//
//   bun run scripts/measure-locomo-neural.ts --benchmark-root /private/tmp/.../locomo-stable
import { readFile } from "node:fs/promises";
import { createGoodMemory, type GoodMemory } from "../src";
import { createProviderEmbeddingAdapter } from "../src/provider/layer";
import { resolveCliFlagValue } from "./cli-options";
import {
  buildLocomoScope,
  collectLocomoRetrievedTurnIds,
  loadLocomoCases,
  overallLocomoEvidenceRecall,
  scoreLocomoRetrieval,
  seedLocomoCase,
  summarizeLocomoRetrieval,
} from "./run-phase-65-locomo-smoke";

type Strategy = "rules-only" | "hybrid";
interface Arm {
  label: string;
  strategy: Strategy;
  bm25?: boolean;
  neural?: boolean;
  fakeEmbed?: boolean;
}

const ARMS: readonly Arm[] = [
  { label: "jaccard-baseline", strategy: "rules-only" },
  { label: "bm25", strategy: "hybrid", bm25: true },
  { label: "neural(text-embedding-3-small)", strategy: "hybrid", neural: true },
  // Diagnostic: strategy=hybrid but a CONSTANT embedding (uniform similarity ->
  // the additive semanticScore cannot differentiate). If this matches bm25/neural
  // recall, the lift is the hybrid candidate generation, not the signal.
  { label: "hybrid-constant-embed", strategy: "hybrid", fakeEmbed: true },
];

// A fake embedding adapter returning the same vector for every text, so all
// cosine similarities are equal and the additive ranking term is a no-op.
const CONSTANT_VECTOR = [1, 0, 0, 0, 0, 0, 0, 0];
const constantEmbeddingAdapter = {
  async embed(texts: readonly string[]): Promise<number[][]> {
    return texts.map(() => [...CONSTANT_VECTOR]);
  },
};

function buildMemory(arm: Arm): GoodMemory {
  let idCounter = 0;
  let clockTick = 0;
  // Mirror the harness's createLocomoSmokeMemory exactly: auto in-memory storage
  // (which provides the document/session/vector stores wired the way recall
  // expects) + only the adapter the arm needs. Passing explicit stores changed
  // the ranking, so we match the harness construction for comparability.
  const adapters = arm.neural
    ? {
        embeddingAdapter: createProviderEmbeddingAdapter({
          model: {
            provider: "openai",
            model:
              process.env.GOODMEMORY_EMBEDDING_MODEL ?? "text-embedding-3-small",
            apiKey: process.env.GOODMEMORY_EMBEDDING_API_KEY,
            baseURL: process.env.GOODMEMORY_EMBEDDING_BASE_URL,
          },
        }),
      }
    : arm.fakeEmbed
      ? { embeddingAdapter: constantEmbeddingAdapter as never }
      : undefined;
  return createGoodMemory({
    ...(arm.bm25 ? { retrieval: { bm25Ranking: true } } : {}),
    ...(adapters ? { adapters } : {}),
    storage: { provider: "memory" },
    testing: {
      createId: () => `locomo-neural-${String((idCounter += 1)).padStart(6, "0")}`,
      now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, (clockTick += 1))),
    },
  });
}

async function main(): Promise<void> {
  // The .env assisted-extractor block (MODEL/API_KEY/BASE_URL) is set but missing
  // _PROVIDER, which makes createGoodMemory reject the partial config. LoCoMo
  // seeding is rules-only so the assisted extractor is never used here; default
  // the missing var for this run only (does not touch .env).
  if (!process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER) {
    process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER = "openai";
  }
  const argv = Bun.argv;
  const benchmarkRoot =
    resolveCliFlagValue(argv, "--benchmark-root") ??
    process.env.GOODMEMORY_LOCOMO_ROOT;
  const limitRaw = resolveCliFlagValue(argv, "--limit");
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  const armsFilterRaw = resolveCliFlagValue(argv, "--arms");
  const armsFilter = armsFilterRaw
    ? new Set(armsFilterRaw.split(",").map((label) => label.trim()))
    : null;
  const arms = armsFilter
    ? ARMS.filter((arm) => armsFilter.has(arm.label))
    : ARMS;

  const { cases } = await loadLocomoCases({
    benchmarkRoot,
    limit,
    readFile: (path: string) => readFile(path, "utf8"),
  });
  const categories = ["single_hop", "multi_hop", "temporal", "open_domain"];
  const rows: Array<{
    label: string;
    overall: number;
    byCategory: Record<string, number>;
    failures: number;
    questions: number;
  }> = [];

  for (const arm of arms) {
    const memory = buildMemory(arm);
    const runId = `measure-locomo-neural-${arm.label}`;
    for (const testCase of cases) {
      await seedLocomoCase({ memory, runId, testCase });
    }
    const results = [];
    let failures = 0;
    for (const testCase of cases) {
      const scope = buildLocomoScope({ caseId: testCase.caseId, runId });
      for (const question of testCase.questions) {
        try {
          const recall = await memory.recall({
            query: question.question,
            scope,
            strategy: arm.strategy,
          });
          results.push(
            scoreLocomoRetrieval({
              question,
              retrievedTurnIds: collectLocomoRetrievedTurnIds(recall),
              testCase,
            }),
          );
        } catch {
          failures += 1;
        }
      }
    }
    const summary = summarizeLocomoRetrieval(results);
    const byCategory: Record<string, number> = {};
    for (const entry of summary) {
      byCategory[entry.category] = entry.averageEvidenceRecall;
    }
    rows.push({
      label: arm.label,
      overall: overallLocomoEvidenceRecall(results),
      byCategory,
      failures,
      questions: results.length,
    });
  }

  console.log("# LoCoMo gold-turn recall: lexical floor vs BM25 vs REAL neural embedding (deterministic, no judge)");
  console.log("");
  console.log(`| arm | overall | ${categories.join(" | ")} | failures | questions |`);
  console.log(`|---|---:|${categories.map(() => "---:").join("|")}|---:|---:|`);
  for (const row of rows) {
    const cells = categories.map(
      (category) => `${((row.byCategory[category] ?? 0) * 100).toFixed(1)}%`,
    );
    console.log(
      `| ${row.label} | ${(row.overall * 100).toFixed(1)}% | ${cells.join(" | ")} | ${row.failures} | ${row.questions} |`,
    );
  }
}

if (import.meta.main) {
  await main();
}
