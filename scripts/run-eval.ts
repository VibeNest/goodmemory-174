import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AISDKModelConfig } from "../src/llm/ai-sdk";
import {
  countAffirmedSignals,
  countConflictedSignals,
  countNegatedSignals,
} from "../src/eval/signalMatching";
import { runEvalSuite, type EvalSuiteResult } from "../src/eval/suite";
import type { JudgeScores } from "../src/eval/judge";
import type { EvalAnswerGeneratorInput } from "../src/eval/runners";
import {
  createProviderJudgeModel,
  createProviderRuntimeMetadata,
  createProviderTextGenerator,
  createAISDKProviderDescriptor,
  createFallbackProviderDescriptor,
} from "../src/provider/layer";

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
  createTextGenerator?: typeof createProviderTextGenerator;
  createJudgeModel?: typeof createProviderJudgeModel;
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

function normalize(value: string): string {
  return value.toLowerCase();
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(10, Math.round(value)));
}

function ratio(matched: number, total: number): number {
  if (total <= 0) {
    return 1;
  }

  return matched / total;
}

function scoreFromRatio(matched: number, total: number, base = 2): number {
  return clampScore(base + ratio(matched, total) * 8);
}

function parseSignalList(value: string): string[] {
  if (!isNonEmpty(value)) {
    return [];
  }

  return value
    .split(" | ")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function extractLineField(prompt: string, label: string): string {
  const markers = [`\n${label}: `, `${label}: `];

  for (const marker of markers) {
    const start = prompt.indexOf(marker);
    if (start === -1) {
      continue;
    }

    const valueStart = start + marker.length;
    const valueEnd = prompt.indexOf("\n", valueStart);
    return prompt.slice(valueStart, valueEnd === -1 ? prompt.length : valueEnd).trim();
  }

  return "";
}

function extractBlockField(
  prompt: string,
  label: string,
  nextLabel?: string,
): string {
  const marker = `\n${label}: `;
  const start = prompt.indexOf(marker);
  if (start === -1) {
    return "";
  }

  const valueStart = start + marker.length;
  const nextMarker = nextLabel ? `\n${nextLabel}: ` : "";
  const valueEnd = nextLabel ? prompt.indexOf(nextMarker, valueStart) : -1;

  return prompt.slice(valueStart, valueEnd === -1 ? prompt.length : valueEnd).trim();
}

function buildFallbackGoodMemoryAnswer(
  input: EvalAnswerGeneratorInput,
): string {
  const expectedUpdateWins = input.scenario?.evaluation?.expected_update_wins ?? [];
  const expectedTransferSignals =
    input.scenario?.evaluation?.expected_transfer_signals ?? [];

  if (!input.memoryContext) {
    return "I may be missing remembered context.";
  }

  const sections = [
    "Confirmed from memory:",
    input.memoryContext,
  ];

  if (expectedUpdateWins.length > 0 || expectedTransferSignals.length > 0) {
    sections.push(
      "Next step: continue from the latest remembered state before introducing new changes.",
    );
  }

  return sections.join("\n\n");
}

function buildFallbackScores(input: {
  answer: string;
  evaluationSetting: "single_domain" | "cross_domain";
  expectedIdentitySignals: string[];
  expectedHistorySignals: string[];
  expectedTransferSignals: string[];
  expectedNonTransferSignals: string[];
  expectedUpdateWins: string[];
  expectedStaleSuppression: string[];
  wrongPersonalizationSignals: string[];
}): JudgeScores {
  const answer = input.answer.trim();
  const normalized = normalize(answer);
  const needsMoreContext =
    normalized.includes("need more context") ||
    normalized.includes("missing remembered context");

  const identityMatches = countAffirmedSignals(
    input.expectedIdentitySignals,
    answer,
  );
  const historyMatches = countAffirmedSignals(input.expectedHistorySignals, answer);
  const transferMatches = countAffirmedSignals(
    input.expectedTransferSignals,
    answer,
  );
  const updateMatches = countAffirmedSignals(input.expectedUpdateWins, answer);
  const staleMatches = countAffirmedSignals(
    input.expectedStaleSuppression,
    answer,
  );
  const contaminationSignals = [
    ...input.expectedNonTransferSignals,
    ...input.wrongPersonalizationSignals,
  ];
  const contaminationMatches = countAffirmedSignals(
    contaminationSignals,
    answer,
  );
  const rejectedTransferMatches = countNegatedSignals(
    input.expectedTransferSignals,
    answer,
  );
  const rejectedUpdateMatches = countNegatedSignals(
    input.expectedUpdateWins,
    answer,
  );
  const conflictedTransferMatches = countConflictedSignals(
    input.expectedTransferSignals,
    answer,
  );
  const conflictedUpdateMatches = countConflictedSignals(
    input.expectedUpdateWins,
    answer,
  );
  const effectiveTransferMatches = Math.max(
    0,
    transferMatches - conflictedTransferMatches,
  );
  const effectiveUpdateMatches = Math.max(0, updateMatches - conflictedUpdateMatches);
  const provenanceBase = answer.includes("## ")
    ? 8
    : answer.length > 0 && !needsMoreContext
      ? 6
      : 2;
  const factualRatio = averageRatios([
    ratio(identityMatches, input.expectedIdentitySignals.length),
    ratio(historyMatches, input.expectedHistorySignals.length),
  ]);
  const personalizationRatio = averageRatios([
    ratio(effectiveTransferMatches, input.expectedTransferSignals.length),
    ratio(effectiveUpdateMatches, input.expectedUpdateWins.length),
  ]);
  const contaminationRatio = averageRatios([
    ratio(contaminationMatches, contaminationSignals.length),
    ratio(staleMatches, input.expectedStaleSuppression.length),
  ]);
  const base = needsMoreContext ? 0 : 2;

  return {
    factual_recall: scoreFromRatio(
      identityMatches + historyMatches,
      input.expectedIdentitySignals.length + input.expectedHistorySignals.length,
      base,
    ),
    preference_consistency: clampScore(
      scoreFromRatio(
        effectiveTransferMatches,
        input.expectedTransferSignals.length,
        base,
      ) -
        rejectedTransferMatches * 4 -
        conflictedTransferMatches * 2,
    ),
    cross_domain_transfer: input.evaluationSetting === "cross_domain"
      ? clampScore(
          scoreFromRatio(
            effectiveTransferMatches,
            input.expectedTransferSignals.length,
            base,
          ) -
            rejectedTransferMatches * 4 -
            conflictedTransferMatches * 2,
        )
      : clampScore(
          base +
            personalizationRatio * 6 -
            rejectedTransferMatches * 4 -
            conflictedTransferMatches * 2,
        ),
    contamination_penalty: clampScore(base + (1 - contaminationRatio) * 8),
    update_correctness: clampScore(
      base +
        Math.max(
          0,
          factualRatio +
            ratio(effectiveUpdateMatches, input.expectedUpdateWins.length) -
            ratio(staleMatches, input.expectedStaleSuppression.length),
        ) *
          5 -
        rejectedUpdateMatches * 4 -
        conflictedUpdateMatches * 2,
    ),
    personalization_usefulness: clampScore(
      base +
        personalizationRatio * 8 -
        (rejectedTransferMatches + rejectedUpdateMatches) * 3 -
        (conflictedTransferMatches + conflictedUpdateMatches) * 2,
    ),
    provenance_explainability: clampScore(
      provenanceBase - staleMatches - contaminationMatches,
    ),
  };
}

function averageRatios(values: number[]): number {
  if (values.length === 0) {
    return 1;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreTotal(scores: JudgeScores): number {
  return (
    scores.factual_recall +
    scores.preference_consistency +
    scores.cross_domain_transfer +
    scores.contamination_penalty +
    scores.update_correctness +
    scores.personalization_usefulness +
    scores.provenance_explainability
  );
}

function buildFallbackJudgeContent(prompt: string): string {
  const baselineAnswer = extractBlockField(prompt, "baseline", "goodmemory");
  const goodmemoryAnswer = extractBlockField(prompt, "goodmemory");
  const evaluationSetting =
    extractLineField(prompt, "evaluation setting") === "cross_domain"
      ? "cross_domain"
      : "single_domain";
  const expectedIdentitySignals = parseSignalList(
    extractLineField(prompt, "expected identity signals"),
  );
  const expectedHistorySignals = parseSignalList(
    extractLineField(prompt, "expected history signals"),
  );
  const expectedTransferSignals = parseSignalList(
    extractLineField(prompt, "expected transfer signals"),
  );
  const expectedNonTransferSignals = parseSignalList(
    extractLineField(prompt, "expected non-transfer signals"),
  );
  const expectedUpdateWins = parseSignalList(
    extractLineField(prompt, "expected update wins"),
  );
  const expectedStaleSuppression = parseSignalList(
    extractLineField(prompt, "expected stale suppression"),
  );
  const wrongPersonalizationSignals = parseSignalList(
    extractLineField(prompt, "wrong personalization signals"),
  );
  const baselineScores = buildFallbackScores({
    answer: baselineAnswer,
    evaluationSetting,
    expectedIdentitySignals,
    expectedHistorySignals,
    expectedTransferSignals,
    expectedNonTransferSignals,
    expectedUpdateWins,
    expectedStaleSuppression,
    wrongPersonalizationSignals,
  });
  const goodmemoryScores = buildFallbackScores({
    answer: goodmemoryAnswer,
    evaluationSetting,
    expectedIdentitySignals,
    expectedHistorySignals,
    expectedTransferSignals,
    expectedNonTransferSignals,
    expectedUpdateWins,
    expectedStaleSuppression,
    wrongPersonalizationSignals,
  });
  const baselineTotal = scoreTotal(baselineScores);
  const goodmemoryTotal = scoreTotal(goodmemoryScores);
  const rejectedRequiredSignalCount =
    countNegatedSignals(expectedUpdateWins, goodmemoryAnswer) +
    countNegatedSignals(expectedTransferSignals, goodmemoryAnswer);
  let winner =
    Math.abs(goodmemoryTotal - baselineTotal) < 1
      ? "tie"
      : goodmemoryTotal > baselineTotal
        ? "goodmemory"
        : "baseline";
  if (winner === "goodmemory" && rejectedRequiredSignalCount > 0) {
    winner = "baseline";
  }
  const failureTags: string[] = [];

  if (
    countAffirmedSignals(goodmemoryAnswer ? expectedUpdateWins : [], goodmemoryAnswer) <
    expectedUpdateWins.length
  ) {
    failureTags.push("goodmemory_missed_update_signal");
  }
  if (
    countAffirmedSignals(expectedTransferSignals, goodmemoryAnswer) <
    expectedTransferSignals.length
  ) {
    failureTags.push("goodmemory_missed_preference_signal");
  }
  if (countAffirmedSignals(expectedStaleSuppression, goodmemoryAnswer) > 0) {
    failureTags.push("goodmemory_stale_memory_leak");
  }
  if (
    countAffirmedSignals(
      [...expectedNonTransferSignals, ...wrongPersonalizationSignals],
      goodmemoryAnswer,
    ) > 0
  ) {
    failureTags.push("goodmemory_wrong_personalization");
  }
  if (countNegatedSignals(expectedUpdateWins, goodmemoryAnswer) > 0) {
    failureTags.push("goodmemory_rejected_update_signal");
  }
  if (countNegatedSignals(expectedTransferSignals, goodmemoryAnswer) > 0) {
    failureTags.push("goodmemory_rejected_preference_signal");
  }

  return JSON.stringify({
    winner,
    scores: winner === "baseline" ? baselineScores : goodmemoryScores,
    baseline_scores: baselineScores,
    goodmemory_scores: goodmemoryScores,
    reasoning:
      winner === "goodmemory"
        ? "GoodMemory surfaced more of the required user state, personalization cues, and current updates."
        : winner === "baseline"
          ? "The baseline answer avoided errors while GoodMemory failed to surface enough current memory."
          : "Both answers surfaced a similar amount of relevant user state.",
    failure_tags: failureTags,
  });
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

export function resolveLiveModelConfig(prefix: "GOODMEMORY_EVAL" | "GOODMEMORY_JUDGE"): AISDKModelConfig {
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

export function resolveEvalMaxConcurrency(
  envVar = "GOODMEMORY_EVAL_MAX_CONCURRENCY",
): number | undefined {
  const raw = process.env[envVar];
  if (!isNonEmpty(raw)) {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${envVar} must be a positive integer`);
  }

  return parsed;
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
      .map((entry) => entry.name.replace(/(?:\.execution)?\.json$/, ""))
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
      content: buildFallbackGoodMemoryAnswer(payload),
    }),
    judge: {
      async complete({ prompt }: { prompt: string }) {
        return {
          content: buildFallbackJudgeContent(prompt),
        };
      },
    },
    runtime: createProviderRuntimeMetadata({
      generation: createFallbackProviderDescriptor(),
      judge: createFallbackProviderDescriptor(),
    }),
  });
}

export function buildLiveGoodMemorySystemPrompt(): string {
  return [
    "Answer using the provided memory context when it is relevant.",
    "Prefer explicit confirmation of role, corrected references, and open loops.",
    "When you rely on remembered context, make provenance explicit with phrases like 'From remembered context' or 'Based on prior sessions'.",
    "Restate open loops and unresolved items as closely as the memory records them; do not generalize them into a broader plan.",
    "Distinguish professional identity from project responsibility: when the user asks for their role, use the Profile role as the primary answer.",
    "When the prompt asks only for role, answer only with the Profile role unless the prompt also asks for current focus, project context, or ownership.",
    "If memory contains an explicit current-role update such as 'my current role is ...', treat that as the most current role statement and restate it directly before decomposing it.",
    "Do not replace the user's profession with a project name or ownership fact.",
    "Do not volunteer project ownership or leadership when the requested slots are role, blocker, open loop, or runbook.",
    "Do not surface unrelated scoped facts or preferences unless they directly help answer the prompt.",
    "When the user asks for the updated runbook or source of truth, prefer naming only the current source of truth.",
    "If the prompt is specifically about an update or correction, briefly mark the previous version as no longer current.",
    "Do not repeat the full stale pointer unless the user explicitly asks for it.",
    "Avoid surfacing stale references elsewhere, and do not dwell on them when the user is mainly asking about role, blocker, or open loops.",
  ].join(" ");
}

export async function runLiveEval(
  input?: FixtureEvalOptions,
  dependencies?: LiveEvalDependencies,
): Promise<EvalSuiteResult> {
  const root = new URL("..", import.meta.url).pathname;
  const createTextGenerator =
    dependencies?.createTextGenerator ?? createProviderTextGenerator;
  const createJudgeModel =
    dependencies?.createJudgeModel ?? createProviderJudgeModel;
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
      system: buildLiveGoodMemorySystemPrompt(),
    }),
    judge: createJudgeModel({
      model: judgeModel,
    }),
    maxConcurrency: resolveEvalMaxConcurrency(),
    runtime: createProviderRuntimeMetadata({
      generation: createAISDKProviderDescriptor(evalModel),
      judge: createAISDKProviderDescriptor(judgeModel),
    }),
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
  process.exit(0);
}
