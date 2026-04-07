import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

type PersistedEvalMode = "live" | "fallback";

interface EvalSummary {
  totalCases: number;
  winnerCounts: {
    baseline: number;
    goodmemory: number;
    tie: number;
  };
  uplift: Record<string, number | undefined>;
}

export interface EvalReport {
  mode: PersistedEvalMode;
  runId: string;
  summary: EvalSummary;
  runtime?: {
    generationMode?: string;
    judgeMode?: string;
  };
}

export function resolveArgument(argv: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function resolveMode(argv: string[]): PersistedEvalMode | undefined {
  const value = resolveArgument(argv, "--mode");
  if (value === "live" || value === "fallback") {
    return value;
  }

  return undefined;
}

export async function resolveRunDirectoryFromArgv(argv: string[]): Promise<string> {
  const explicit = argv[2];
  if (explicit && !explicit.startsWith("--")) {
    return explicit;
  }

  const mode = resolveMode(argv);
  if (!mode) {
    throw new Error("Provide an explicit run directory or --mode=live|fallback");
  }

  const outputDir = resolveArgument(argv, "--output-dir") ?? join("reports/eval", mode);
  const entries = await readdir(outputDir, { withFileTypes: true });
  const runs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("run-"))
    .map((entry) => entry.name)
    .sort();

  const latest = runs.at(-1);
  if (!latest) {
    throw new Error(`No ${mode} eval runs found in ${outputDir}`);
  }

  return join(outputDir, latest);
}

export async function loadEvalReport(runDirectory: string): Promise<EvalReport> {
  return JSON.parse(
    await readFile(join(runDirectory, "report.json"), "utf8"),
  ) as EvalReport;
}

export async function collectTopFailurePaths(
  runDirectory: string,
  limit = 5,
): Promise<string[]> {
  const failuresDir = join(runDirectory, "failures");
  const failureFiles = await readdir(failuresDir).catch(() => []);

  return failureFiles
    .filter((name) => name.endsWith(".json") && name !== "summary.json")
    .sort()
    .slice(0, limit)
    .map((name) => join(runDirectory, "failures", name));
}

export function formatEvalSummary(report: EvalReport, topFailures: string[]): string {
  const overallIdentity = report.summary.uplift.identity_understanding?.toFixed(2) ?? "n/a";
  const overallHistory = report.summary.uplift.history_continuation?.toFixed(2) ?? "n/a";
  const overallFactual = report.summary.uplift.factual_alignment?.toFixed(2) ?? "n/a";
  const overallRelevance = report.summary.uplift.relevance?.toFixed(2) ?? "n/a";

  const lines = [
    `# Eval Summary`,
    ``,
    `- Mode: \`${report.mode}\``,
    `- Run: \`${report.runId}\``,
    `- Runtime: generation=${report.runtime?.generationMode ?? "unknown"}, judge=${report.runtime?.judgeMode ?? "unknown"}`,
    `- Total cases: ${report.summary.totalCases}`,
    `- Winner counts: GoodMemory ${report.summary.winnerCounts.goodmemory}, Baseline ${report.summary.winnerCounts.baseline}, Tie ${report.summary.winnerCounts.tie}`,
    `- Overall uplift: identity ${report.summary.uplift.identity_understanding?.toFixed(2) ?? "n/a"}, history ${report.summary.uplift.history_continuation?.toFixed(2) ?? "n/a"}, factual ${report.summary.uplift.factual_alignment?.toFixed(2) ?? "n/a"}, relevance ${report.summary.uplift.relevance?.toFixed(2) ?? "n/a"}`,
    ``,
    `## Failure Paths`,
    ...(topFailures.length > 0 ? topFailures.map((path) => `- \`${path}\``) : ["- none"]),
  ];

  return lines.join("\n");
}

export async function summarizeRunDirectory(runDirectory: string): Promise<string> {
  const report = await loadEvalReport(runDirectory);
  const topFailures = await collectTopFailurePaths(runDirectory);
  return formatEvalSummary(report, topFailures);
}

export async function runSummaryFromArgv(
  argv: string[],
  write: (summary: string) => void = console.log,
): Promise<string> {
  const runDirectory = await resolveRunDirectoryFromArgv(argv);
  const summary = await summarizeRunDirectory(runDirectory);
  write(summary);
  return summary;
}

if (import.meta.main) {
  await runSummaryFromArgv(process.argv);
}
