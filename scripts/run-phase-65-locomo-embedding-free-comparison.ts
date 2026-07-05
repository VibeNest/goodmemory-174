// Reproducible, GATEWAY-FREE certification of the embedding-free LoCoMo retrieval
// finding. One command runs the Jaccard floor, the Okapi BM25 leg, and the full
// deterministic stack (BM25 + query decomposition + N-hop iterative recall +
// lexical-coverage rerank) over a benchmark root, then prints + banks a
// comparison. No model gateway is required: every arm here is deterministic.
// Conversational extraction (the LLM phrasing-gap lever) is intentionally
// excluded so the comparison reproduces fully offline.
//
//   bun run scripts/run-phase-65-locomo-embedding-free-comparison.ts \
//     --benchmark-root /private/tmp/LOCOMO3
import {
  overallLocomoEvidenceRecall,
  runLocomoSmoke,
  type LocomoSmokeCliOptions,
  type LocomoSmokeReport,
} from "./run-phase-65-locomo-smoke";
import {
  assertDistinctCliPathValues,
  resolveCliFlagValueStrict,
  resolveEnvValueStrict,
} from "./cli-options";

export interface EmbeddingFreeComparisonArm {
  label: string;
  options: Pick<
    LocomoSmokeCliOptions,
    "bm25" | "decompose" | "multiHop" | "rerank"
  >;
}

// The deterministic, gateway-free arms, in increasing-capability order.
export const EMBEDDING_FREE_COMPARISON_ARMS: readonly EmbeddingFreeComparisonArm[] = [
  { label: "jaccard-rules-only", options: {} },
  { label: "bm25", options: { bm25: true } },
  {
    label: "bm25+decompose+nhop+rerank",
    options: { bm25: true, decompose: true, multiHop: true, rerank: true },
  },
];

export interface EmbeddingFreeComparisonRow {
  label: string;
  overallEvidenceRecall: number;
  executionFailures: number;
  questionCount: number;
}

export interface EmbeddingFreeComparisonCliOptions {
  benchmarkRoot?: string;
  limit?: number;
  outputDir?: string;
}

function parsePositiveIntegerFlag(
  argv: readonly string[],
  flagName: string,
): number | undefined {
  const raw = resolveCliFlagValueStrict(argv, flagName);
  if (raw === undefined) {
    return undefined;
  }
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return value;
}

export function parseEmbeddingFreeComparisonCliOptions(
  argv: readonly string[],
): EmbeddingFreeComparisonCliOptions {
  const benchmarkRoot =
    resolveCliFlagValueStrict(argv, "--benchmark-root") ??
    resolveEnvValueStrict(process.env, "GOODMEMORY_LOCOMO_ROOT");
  const outputDir = resolveCliFlagValueStrict(argv, "--output-dir");
  if (benchmarkRoot !== undefined && outputDir !== undefined) {
    assertDistinctCliPathValues({
      firstFlag: "--benchmark-root",
      firstValue: benchmarkRoot,
      secondFlag: "--output-dir",
      secondValue: outputDir,
    });
  }

  return {
    benchmarkRoot,
    limit: parsePositiveIntegerFlag(argv, "--limit"),
    outputDir,
  };
}

export function buildEmbeddingFreeComparisonRow(
  label: string,
  report: LocomoSmokeReport,
): EmbeddingFreeComparisonRow {
  return {
    label,
    overallEvidenceRecall: overallLocomoEvidenceRecall(report.cases),
    executionFailures: report.executionFailures,
    questionCount: report.questionCount,
  };
}

export function renderEmbeddingFreeComparison(
  rows: readonly EmbeddingFreeComparisonRow[],
): string {
  const lines = [
    "# Embedding-free LoCoMo retrieval comparison (gateway-free)",
    "",
    "| arm | overall evidence recall | exec failures | questions |",
    "|---|---:|---:|---:|",
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.label} | ${(row.overallEvidenceRecall * 100).toFixed(1)}% | ${row.executionFailures} | ${row.questionCount} |`,
    );
  }
  return lines.join("\n");
}

export async function runEmbeddingFreeComparison(
  input: {
    benchmarkRoot?: string;
    outputDir?: string;
    limit?: number;
  },
  dependencies?: Parameters<typeof runLocomoSmoke>[1],
): Promise<EmbeddingFreeComparisonRow[]> {
  if (input.benchmarkRoot !== undefined && input.outputDir !== undefined) {
    assertDistinctCliPathValues({
      firstFlag: "--benchmark-root",
      firstValue: input.benchmarkRoot,
      secondFlag: "--output-dir",
      secondValue: input.outputDir,
    });
  }

  const rows: EmbeddingFreeComparisonRow[] = [];
  for (const arm of EMBEDDING_FREE_COMPARISON_ARMS) {
    const report = await runLocomoSmoke(
      {
        ...arm.options,
        benchmarkRoot: input.benchmarkRoot,
        limit: input.limit,
        outputDir: input.outputDir,
        runId: `run-phase65-locomo-embedding-free-${arm.label}`,
      },
      dependencies,
    );
    rows.push(buildEmbeddingFreeComparisonRow(arm.label, report));
  }
  return rows;
}

async function main(): Promise<void> {
  const rows = await runEmbeddingFreeComparison(
    parseEmbeddingFreeComparisonCliOptions(Bun.argv),
  );
  console.log(renderEmbeddingFreeComparison(rows));
}

if (import.meta.main) {
  await main();
}
