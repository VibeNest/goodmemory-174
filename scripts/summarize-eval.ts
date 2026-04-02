import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

interface EvalSummary {
  totalCases: number;
  winnerCounts: {
    baseline: number;
    goodmemory: number;
    tie: number;
  };
  uplift: Record<string, number | undefined>;
}

interface EvalReport {
  runId: string;
  summary: EvalSummary;
}

function resolveArgument(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function resolveRunDirectory(): Promise<string> {
  const explicit = process.argv[2];
  if (explicit && !explicit.startsWith("--")) {
    return explicit;
  }

  const outputDir = resolveArgument("--output-dir") ?? "reports/eval";
  const entries = await readdir(outputDir, { withFileTypes: true });
  const runs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("run-"))
    .map((entry) => entry.name)
    .sort();

  const latest = runs.at(-1);
  if (!latest) {
    throw new Error(`No eval runs found in ${outputDir}`);
  }

  return join(outputDir, latest);
}

async function main(): Promise<void> {
  const runDirectory = await resolveRunDirectory();
  const report = JSON.parse(
    await readFile(join(runDirectory, "report.json"), "utf8"),
  ) as EvalReport;
  const failuresDir = join(runDirectory, "failures");
  const failureFiles = await readdir(failuresDir).catch(() => []);
  const topFailures = failureFiles
    .filter((name) => name.endsWith(".json") && name !== "summary.json")
    .sort()
    .slice(0, 5);

  const lines = [
    `# Eval Summary`,
    ``,
    `- Run: \`${report.runId}\``,
    `- Total cases: ${report.summary.totalCases}`,
    `- Winner counts: GoodMemory ${report.summary.winnerCounts.goodmemory}, Baseline ${report.summary.winnerCounts.baseline}, Tie ${report.summary.winnerCounts.tie}`,
    `- Overall uplift: identity ${report.summary.uplift.identity_understanding?.toFixed(2) ?? "n/a"}, history ${report.summary.uplift.history_continuation?.toFixed(2) ?? "n/a"}, factual ${report.summary.uplift.factual_alignment?.toFixed(2) ?? "n/a"}, relevance ${report.summary.uplift.relevance?.toFixed(2) ?? "n/a"}`,
    ``,
    `## Failure Paths`,
    ...(topFailures.length > 0
      ? topFailures.map((name) => `- \`${join(runDirectory, "failures", name)}\``)
      : ["- none"]),
  ];

  console.log(lines.join("\n"));
}

await main();
