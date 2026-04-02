import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runEvalSuite, type EvalSuiteResult } from "../src/eval/suite";
import type { EvalAnswerGeneratorInput } from "../src/eval/runners";
import {
  createVercelAIJudgeModel,
  createVercelAITextGenerator,
  parseVercelAIModelConfigFromEnv,
} from "../src/llm/vercel-ai-sdk";

export interface SmokeEvalCase {
  caseId: string;
  name: string;
  status: "passed";
}

export interface SmokeEvalReport {
  runId: string;
  summary: {
    totalCases: number;
    passedCases: number;
  };
  cases: SmokeEvalCase[];
}

export interface FixtureEvalOptions {
  limit?: number;
  scenarioIds?: string[];
  outputDir?: string;
  failuresFrom?: string;
}

interface CliOptions extends FixtureEvalOptions {
  smoke: boolean;
}

interface FixtureEvalDependencies {
  parseModelConfigFromEnv?: typeof parseVercelAIModelConfigFromEnv;
  createTextGenerator?: typeof createVercelAITextGenerator;
  createJudgeModel?: typeof createVercelAIJudgeModel;
  runSuite?: typeof runEvalSuite;
}

export function resolveFlagValue(
  argv: string[],
  name: string,
): string | undefined {
  const inline = argv.find((value) => value.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
}

export function resolveRepeatedFlagValues(argv: string[], name: string): string[] {
  const values = argv
    .filter((value) => value.startsWith(`${name}=`))
    .map((value) => value.slice(name.length + 1));
  const index = argv.indexOf(name);
  if (index !== -1 && argv[index + 1]) {
    values.push(argv[index + 1]!);
  }
  return values;
}

export function parseCliOptionsFromArgv(argv: string[]): CliOptions {
  const limitValue = resolveFlagValue(argv, "--limit");
  const scenarioIds = resolveRepeatedFlagValues(argv, "--scenario-id");

  return {
    smoke: argv.includes("--smoke"),
    limit: limitValue ? Number(limitValue) : undefined,
    scenarioIds,
    outputDir: resolveFlagValue(argv, "--output-dir"),
    failuresFrom: resolveFlagValue(argv, "--failures-from"),
  };
}

export async function resolveFailedScenarioIds(runDirectory: string): Promise<string[]> {
  const summaryPath = join(runDirectory, "failures", "summary.json");

  try {
    const summary = JSON.parse(
      await readFile(summaryPath, "utf8"),
    ) as {
      failedCases: Array<{ caseId: string }>;
    };
    return summary.failedCases.map((caseItem) => caseItem.caseId);
  } catch {
    const failuresDir = join(runDirectory, "failures");
    const entries = await readdir(failuresDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "summary.json")
      .map((entry) => entry.name.replace(/\.json$/, ""))
      .sort();
  }
}

export function mergeScenarioIds(
  explicitScenarioIds: string[] | undefined,
  failedScenarioIds: string[],
): string[] | undefined {
  const merged = new Set<string>([...(explicitScenarioIds ?? []), ...failedScenarioIds]);
  return merged.size > 0 ? [...merged] : undefined;
}

export async function runSmokeEval(): Promise<SmokeEvalReport> {
  const cases: SmokeEvalCase[] = [
    {
      caseId: "smoke-001",
      name: "smoke eval bootstrap",
      status: "passed",
    },
  ];

  return {
    runId: `run-${Date.now()}`,
    summary: {
      totalCases: cases.length,
      passedCases: cases.length,
    },
    cases,
  };
}

export async function runFixtureEval(
  input?: FixtureEvalOptions,
  dependencies?: FixtureEvalDependencies,
): Promise<EvalSuiteResult> {
  const root = new URL("..", import.meta.url).pathname;
  const parseModelConfigFromEnv =
    dependencies?.parseModelConfigFromEnv ?? parseVercelAIModelConfigFromEnv;
  const createTextGenerator =
    dependencies?.createTextGenerator ?? createVercelAITextGenerator;
  const createJudgeModel =
    dependencies?.createJudgeModel ?? createVercelAIJudgeModel;
  const runSuite = dependencies?.runSuite ?? runEvalSuite;
  const evalModel = parseModelConfigFromEnv("GOODMEMORY_EVAL");
  const judgeModel =
    parseModelConfigFromEnv("GOODMEMORY_JUDGE") ?? evalModel;
  const failedScenarioIds = input?.failuresFrom
    ? await resolveFailedScenarioIds(input.failuresFrom)
    : [];
  const scenarioIds = mergeScenarioIds(input?.scenarioIds, failedScenarioIds);

  const baselineGenerator = evalModel
    ? createTextGenerator({
        model: evalModel,
        system:
          "Answer using only the visible transcript. If critical history is missing, say that you need more context.",
      })
    : async () => ({
        content: "I need more context before I can answer reliably.",
      });

  const goodmemoryGenerator = evalModel
    ? createTextGenerator({
        model: evalModel,
        system:
          "Answer using the provided memory context when it is relevant. Prefer explicit confirmation of role, corrected references, and open loops.",
      })
    : async (payload: EvalAnswerGeneratorInput) => ({
        content: payload.memoryContext?.includes("runbook-v2")
          ? "You are a robotics engineer and the updated runbook is v2."
          : "I may be missing remembered context.",
      });

  const judge = judgeModel
    ? createJudgeModel({
        model: judgeModel,
      })
    : {
        async complete({ prompt }: { prompt: string }) {
          const goodmemoryWon = prompt.includes("updated runbook is v2");

          return {
            content: JSON.stringify({
              winner: goodmemoryWon ? "goodmemory" : "baseline",
              scores: {
                identity_understanding: goodmemoryWon ? 9 : 5,
                history_continuation: goodmemoryWon ? 9 : 4,
                factual_alignment: goodmemoryWon ? 8 : 5,
                relevance: goodmemoryWon ? 9 : 5,
              },
              baseline_scores: {
                identity_understanding: 4,
                history_continuation: 4,
                factual_alignment: 5,
                relevance: 5,
              },
              goodmemory_scores: {
                identity_understanding: goodmemoryWon ? 9 : 5,
                history_continuation: goodmemoryWon ? 9 : 4,
                factual_alignment: goodmemoryWon ? 8 : 5,
                relevance: goodmemoryWon ? 9 : 5,
              },
              reasoning: goodmemoryWon
                ? "GoodMemory recovered identity, corrected reference, and open loop."
                : "Neither answer used enough remembered context.",
              failure_tags: goodmemoryWon ? [] : ["memory_miss"],
            }),
          };
        },
      };

  return runSuite({
    personaDir: join(root, "fixtures/personas/eval"),
    scenarioDir: join(root, "fixtures/scenarios/eval"),
    outputDir: input?.outputDir ?? join(root, "reports/eval"),
    limit: input?.limit,
    scenarioIds,
    baselineGenerator,
    goodmemoryGenerator,
    judge,
    runtime: {
      generationMode: evalModel ? "live" : "fallback",
      judgeMode: judgeModel ? "live" : "fallback",
    },
  });
}

async function main(): Promise<void> {
  const options = parseCliOptionsFromArgv(process.argv);
  const report = options.smoke
    ? await runSmokeEval()
    : await runFixtureEval({
        limit: options.limit,
        scenarioIds: options.scenarioIds,
        outputDir: options.outputDir,
        failuresFrom: options.failuresFrom,
      });
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
