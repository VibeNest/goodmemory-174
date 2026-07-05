/**
 * P5 BEAM live closure with the shipped opt-in union16 profile and an
 * INDEPENDENT judge, through the committed harness seams (no changes to the
 * phase-63 scripts): dependencies.createMemory flows closure -> slice.
 *
 * - Memory: retrieval.semanticCandidates topK 16 + provider embedding
 *   (GOODMEMORY_EMBEDDING_*), wrapped for BEAM's oversized texts: each input
 *   is embedded as a 16k-char prefix, requests are packed under a 120k-char /
 *   48-text budget (the endpoint caps per-input AND per-request tokens), and
 *   vectors are disk-cached (content-addressed JSONL under the phase-63
 *   reports dir) so killed runs replay finished batches for free.
 * - Narrow gates stay ON (product behavior; ADR-005 dual-metric disclosure).
 * - Judge: GOODMEMORY_JUDGE_* must point at an independent (gemini) model;
 *   answers use GOODMEMORY_EVAL_* unchanged, so sameModelJudge is false.
 * - Resumable: the live slice's per-case sidecar makes relaunches cheap.
 *
 * Usage:
 *   bun run scripts/run-beam-union16-live-closure.ts --run-id <id> \
 *     [--no-evidence-pack] [--benchmark-root <dir>] [--recall-run-id <id>]
 */
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { GoodMemory } from "../src/api/contracts";
import type { EmbeddingAdapter } from "../src/embedding/contracts";
import { createGoodMemory } from "../src/api/createGoodMemory";
import { createProviderEmbeddingAdapter } from "../src/provider/layer";
import { resolveCliFlagValue } from "./cli-options";
import { runPhase63BeamLiveClosure } from "./run-phase-63-beam-live-closure";
import { runPhase63BeamRecallDiagnostic } from "./run-phase-63-beam-recall-diagnostic";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

const MAX_EMBED_CHARS = 16000;
const MAX_REQUEST_CHARS = 120000;
const MAX_REQUEST_TEXTS = 48;

const repoRoot = resolveRepoRootFromScriptUrl(import.meta.url);
const OUTPUT_DIR = join(repoRoot, "reports", "eval", "research", "phase-63", "beam");
const CACHE_PATH = join(OUTPUT_DIR, "beam-embed-cache.jsonl");

function hashText(value: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h1 ^= value.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return `${value.length.toString(36)}-${h1.toString(36)}`;
}

async function loadEmbedCache(): Promise<Map<string, number[]>> {
  const cache = new Map<string, number[]>();
  const file = Bun.file(CACHE_PATH);
  if (await file.exists()) {
    for (const line of (await file.text()).split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as { k: string; v: number[] };
        cache.set(row.k, row.v);
      } catch {
        // torn tail line from a killed run - ignore
      }
    }
  }
  return cache;
}

const embedCache = await loadEmbedCache();
console.log(`embed cache: ${embedCache.size} entries (${CACHE_PATH})`);

function chunkedCachedEmbeddingAdapter(inner: EmbeddingAdapter): EmbeddingAdapter {
  return {
    async embed(texts: string[]): Promise<number[][]> {
      const bounded = texts.map((text) => text.slice(0, MAX_EMBED_CHARS));
      const missing = [...new Set(bounded.filter((t) => !embedCache.has(hashText(t))))];
      let batch: string[] = [];
      let batchChars = 0;
      const flush = async (): Promise<void> => {
        if (batch.length === 0) {
          return;
        }
        const current = batch;
        batch = [];
        batchChars = 0;
        let lastError: unknown;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            const vectors = await inner.embed(current);
            const lines: string[] = [];
            for (let i = 0; i < current.length; i += 1) {
              const key = hashText(current[i]!);
              embedCache.set(key, vectors[i]!);
              lines.push(JSON.stringify({ k: key, v: vectors[i] }));
            }
            await appendFile(CACHE_PATH, `${lines.join("\n")}\n`);
            return;
          } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
          }
        }
        throw lastError;
      };
      for (const text of missing) {
        if (
          batch.length >= MAX_REQUEST_TEXTS ||
          (batch.length > 0 && batchChars + text.length > MAX_REQUEST_CHARS)
        ) {
          await flush();
        }
        batch.push(text);
        batchChars += text.length;
      }
      await flush();
      return bounded.map((text) => {
        const vector = embedCache.get(hashText(text));
        if (!vector) {
          throw new Error("embed cache miss after flush - hash collision or write failure");
        }
        return vector;
      });
    },
  };
}

function createUnion16Memory(): GoodMemory {
  let idCounter = 0;
  let clockTick = 0;
  return createGoodMemory({
    adapters: {
      embeddingAdapter: chunkedCachedEmbeddingAdapter(
        createProviderEmbeddingAdapter({
          model: {
            provider: "openai",
            model: process.env.GOODMEMORY_EMBEDDING_MODEL ?? "text-embedding-3-small",
            apiKey: process.env.GOODMEMORY_EMBEDDING_API_KEY,
            baseURL: process.env.GOODMEMORY_EMBEDDING_BASE_URL,
          },
        }),
      ),
    },
    retrieval: { semanticCandidates: { topK: 16 } },
    storage: { provider: "memory" },
    testing: {
      createId: () => `beam-lever-${String((idCounter += 1)).padStart(6, "0")}`,
      now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, (clockTick += 1))),
    },
  });
}

async function main(): Promise<void> {
  const argv = Bun.argv;
  const runId = resolveCliFlagValue(argv, "--run-id");
  if (!runId) {
    throw new Error("--run-id is required");
  }
  const benchmarkRoot =
    resolveCliFlagValue(argv, "--benchmark-root") ?? `${process.env.HOME}/.goodmemory-beam`;
  const recallRunId =
    resolveCliFlagValue(argv, "--recall-run-id") ?? "run-p5-beam-union16-fitted-recall";
  const evidencePack = !argv.includes("--no-evidence-pack");

  if (process.env.GOODMEMORY_DISABLED_NARROW_GATES) {
    throw new Error("narrow gates must stay ON for closure runs (product behavior)");
  }
  const judgeModel = process.env.GOODMEMORY_JUDGE_MODEL ?? "";
  if (!judgeModel.includes("gemini")) {
    throw new Error(
      `GOODMEMORY_JUDGE_MODEL must be the independent gemini judge, got "${judgeModel}"`,
    );
  }
  console.log(`independent judge: ${judgeModel} | evidencePack: ${evidencePack} | run: ${runId}`);

  const recallReportPath = join(OUTPUT_DIR, recallRunId, "recall-diagnostic.json");
  if (!(await Bun.file(recallReportPath).exists())) {
    console.log("building fitted union16 recall diagnostic (gates ON)...");
    const recall = await runPhase63BeamRecallDiagnostic(
      {
        benchmarkRoot,
        outputDir: OUTPUT_DIR,
        profiles: ["goodmemory-hybrid"],
        runId: recallRunId,
      },
      { createMemory: createUnion16Memory },
    );
    console.log(
      `fitted union16 recall: ${recall.profiles["goodmemory-hybrid"]?.summary.evidenceChatRecall}`,
    );
  }

  const report = await runPhase63BeamLiveClosure(
    {
      benchmarkRoot,
      evidencePack,
      outputDir: OUTPUT_DIR,
      profile: "goodmemory-hybrid",
      recallReportPath,
      resume: true,
      runId,
      scale: "100K",
    },
    { createMemory: createUnion16Memory },
  );
  console.log(
    JSON.stringify(
      {
        answerAccuracy: report.summary.answerAccuracy,
        correctCases: report.summary.correctCases,
        evidencePack,
        executionFailures: report.summary.executionFailures,
        runDirectory: report.runDirectory,
        totalCases: report.summary.totalCases,
      },
      null,
      2,
    ),
  );
}

await main();
