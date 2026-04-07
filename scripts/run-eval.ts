import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { VercelAIModelConfig } from "../src/llm/vercel-ai-sdk";
import { runEvalSuite, type EvalSuiteResult } from "../src/eval/suite";
import type { EvalAnswerGeneratorInput } from "../src/eval/runners";
import {
  createVercelAIJudgeModel,
  createVercelAITextGenerator,
} from "../src/llm/vercel-ai-sdk";

export type EvalMode = "live" | "fallback";
export type EvalCLIExecutionMode = EvalMode | "smoke";

export interface SmokeEvalCase {
  caseId: string;
  name: string;
  status: "passed";
}

export interface SmokeEvalReport {
  mode: "smoke";
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

export interface LiveEvalDependencies {
  createTextGenerator?: typeof createVercelAITextGenerator;
  createJudgeModel?: typeof createVercelAIJudgeModel;
  runSuite?: typeof runEvalSuite;
}

export interface FallbackEvalDependencies {
  runSuite?: typeof runEvalSuite;
}

interface CLIOptions extends FixtureEvalOptions {
  mode: EvalCLIExecutionMode;
}

interface PersistedEvalReport {
  mode?: EvalMode;
  runId: string;
}

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveFlagValue(argv: string[], name: string): string | undefined {
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
  const values: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token.startsWith(`${name}=`)) {
      values.push(token.slice(name.length + 1));
      continue;
    }

    if (token !== name) {
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      continue;
    }

    values.push(next);
    index += 1;
  }

  return values;
}

export function parseCliOptionsFromArgv(argv: string[]): CLIOptions {
  const mode = resolveFlagValue(argv, "--mode");
  if (mode !== "live" && mode !== "fallback" && mode !== "smoke") {
    throw new Error("Missing or invalid required flag --mode=smoke|fallback|live");
  }

  const limitValue = resolveFlagValue(argv, "--limit");

  return {
    mode,
    limit: limitValue ? Number(limitValue) : undefined,
    scenarioIds: resolveRepeatedFlagValues(argv, "--scenario-id"),
    outputDir: resolveFlagValue(argv, "--output-dir"),
    failuresFrom: resolveFlagValue(argv, "--failures-from"),
  };
}

export function resolveDefaultOutputDir(root: string, mode: EvalMode): string {
  return join(root, "reports/eval", mode);
}

export function resolveLiveModelConfig(prefix: "GOODMEMORY_EVAL" | "GOODMEMORY_JUDGE"): VercelAIModelConfig {
  const provider = process.env[`${prefix}_PROVIDER`];
  const model = process.env[`${prefix}_MODEL`];
  const apiKey = process.env[`${prefix}_API_KEY`];
  const baseURL = process.env[`${prefix}_BASE_URL`];
  const missingVars = [
    !isNonEmpty(provider) ? `${prefix}_PROVIDER` : null,
    !isNonEmpty(model) ? `${prefix}_MODEL` : null,
    !isNonEmpty(apiKey) ? `${prefix}_API_KEY` : null,
  ].filter(Boolean) as string[];

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required ${prefix} live eval environment variables: ${missingVars.join(", ")}`,
    );
  }

  if (provider !== "openai" && provider !== "anthropic") {
    throw new Error(`Unsupported Vercel AI SDK provider for ${prefix}: ${provider}`);
  }

  return {
    provider,
    model: model as string,
    apiKey: apiKey as string,
    baseURL: isNonEmpty(baseURL) ? baseURL : undefined,
  };
}

async function readPersistedEvalReport(runDirectory: string): Promise<PersistedEvalReport> {
  return JSON.parse(
    await readFile(join(runDirectory, "report.json"), "utf8"),
  ) as PersistedEvalReport;
}

export async function resolveFailedScenarioIds(
  runDirectory: string,
  expectedMode?: EvalMode,
): Promise<string[]> {
  const report = await readPersistedEvalReport(runDirectory);

  if (!report.mode) {
    throw new Error(`Eval report at ${runDirectory} is missing report.mode`);
  }

  if (expectedMode && report.mode !== expectedMode) {
    throw new Error(
      `Eval rerun mode mismatch: requested ${expectedMode}, but ${runDirectory} is ${report.mode}`,
    );
  }

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
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".json") &&
          entry.name !== "summary.json",
      )
      .map((entry) => entry.name.replace(/\.json$/, ""))
      .sort();
  }
}

export function mergeScenarioIds(
  explicitScenarioIds: string[] | undefined,
  failedScenarioIds: string[],
): string[] | undefined {
  const merged = new Set<string>([
    ...(explicitScenarioIds ?? []),
    ...failedScenarioIds,
  ]);
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
    mode: "smoke",
    runId: `run-${Date.now()}`,
    summary: {
      totalCases: cases.length,
      passedCases: cases.length,
    },
    cases,
  };
}

export async function runFallbackEval(
  input?: FixtureEvalOptions,
  dependencies?: FallbackEvalDependencies,
): Promise<EvalSuiteResult> {
  const root = new URL("..", import.meta.url).pathname;
  const runSuite = dependencies?.runSuite ?? runEvalSuite;
  const failedScenarioIds = input?.failuresFrom
    ? await resolveFailedScenarioIds(input.failuresFrom, "fallback")
    : [];
  const scenarioIds = mergeScenarioIds(input?.scenarioIds, failedScenarioIds);

  return runSuite({
    mode: "fallback",
    personaDir: join(root, "fixtures/personas/eval"),
    scenarioDir: join(root, "fixtures/scenarios/eval"),
    outputDir: input?.outputDir ?? resolveDefaultOutputDir(root, "fallback"),
    limit: input?.limit,
    scenarioIds,
    baselineGenerator: async () => ({
      content: "I need more context before I can answer reliably.",
    }),
    goodmemoryGenerator: async (payload: EvalAnswerGeneratorInput) => ({
      content: payload.memoryContext?.includes("runbook-v2")
        ? "You are a robotics engineer and the updated runbook is v2."
        : "I may be missing remembered context.",
    }),
    judge: {
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
    },
    runtime: {
      generationMode: "fallback",
      judgeMode: "fallback",
    },
  });
}

export async function runLiveEval(
  input?: FixtureEvalOptions,
  dependencies?: LiveEvalDependencies,
): Promise<EvalSuiteResult> {
  const root = new URL("..", import.meta.url).pathname;
  const createTextGenerator =
    dependencies?.createTextGenerator ?? createVercelAITextGenerator;
  const createJudgeModel =
    dependencies?.createJudgeModel ?? createVercelAIJudgeModel;
  const runSuite = dependencies?.runSuite ?? runEvalSuite;
  const failedScenarioIds = input?.failuresFrom
    ? await resolveFailedScenarioIds(input.failuresFrom, "live")
    : [];
  const scenarioIds = mergeScenarioIds(input?.scenarioIds, failedScenarioIds);
  const evalModel = resolveLiveModelConfig("GOODMEMORY_EVAL");
  const judgeModel = resolveLiveModelConfig("GOODMEMORY_JUDGE");

  return runSuite({
    mode: "live",
    personaDir: join(root, "fixtures/personas/eval"),
    scenarioDir: join(root, "fixtures/scenarios/eval"),
    outputDir: input?.outputDir ?? resolveDefaultOutputDir(root, "live"),
    limit: input?.limit,
    scenarioIds,
    baselineGenerator: createTextGenerator({
      model: evalModel,
      system:
        "Answer using only the visible transcript. If critical history is missing, say that you need more context.",
    }),
    goodmemoryGenerator: createTextGenerator({
      model: evalModel,
      system:
        "Answer using the provided memory context when it is relevant. Prefer explicit confirmation of role, corrected references, and open loops.",
    }),
    judge: createJudgeModel({
      model: judgeModel,
    }),
    runtime: {
      generationMode: "live",
      judgeMode: "live",
    },
  });
}

async function main(): Promise<void> {
  const options = parseCliOptionsFromArgv(process.argv);

  if (options.mode === "smoke") {
    console.log(JSON.stringify(await runSmokeEval(), null, 2));
    return;
  }

  const report = options.mode === "live"
    ? await runLiveEval({
        limit: options.limit,
        scenarioIds: options.scenarioIds,
        outputDir: options.outputDir,
        failuresFrom: options.failuresFrom,
      })
    : await runFallbackEval({
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
