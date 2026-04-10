import { createGoodMemory, type GoodMemory } from "../index";
import { evaluateScenarioAssertions } from "./assertions";
import {
  listPersonaSpecs,
  listScenarioFixtures,
  validateScenarioDatasetLinks,
  type PersonaSpec,
  type ScenarioFixture,
} from "./dataset";
import type { JudgeModel } from "./judge";
import { runJudgeComparison } from "./judge";
import {
  aggregateJudgedCases,
  persistEvalArtifacts,
  type EvalCaseExecutionFailure,
  type EvalRuntimeMetadata,
  type PersistedEvalMode,
  type EvalSuiteSummary,
  type JudgedEvalCase,
} from "./reporting";
import { normalizeProviderRuntimeMetadata } from "../provider/layer";
import {
  runBaselineScenario,
  runGoodMemoryScenario,
  type EvalAnswerGenerator,
} from "./runners";

export interface EvalSuiteInput {
  mode: PersistedEvalMode;
  personaDir: string;
  scenarioDir: string;
  outputDir: string;
  judge: JudgeModel;
  baselineGenerator: EvalAnswerGenerator;
  goodmemoryGenerator: EvalAnswerGenerator;
  limit?: number;
  scenarioIds?: string[];
  createMemory?: (input: {
    persona: PersonaSpec;
    scenario: ScenarioFixture;
  }) => GoodMemory;
  runId?: string;
  runtime?: EvalRuntimeMetadata;
  maxConcurrency?: number;
  caseRetryLimit?: number;
}

export interface EvalSuiteResult {
  mode: PersistedEvalMode;
  runId: string;
  runDirectory: string;
  summary: EvalSuiteSummary;
  runtime: EvalRuntimeMetadata;
  cases: JudgedEvalCase[];
  failedCases?: EvalCaseExecutionFailure[];
}

function defaultCreateMemory(): GoodMemory {
  return createGoodMemory({
    storage: { provider: "memory" },
  });
}

function resolveMaxConcurrency(
  totalCases: number,
  requested?: number,
): number {
  if (totalCases <= 0) {
    return 1;
  }

  if (typeof requested === "number" && Number.isFinite(requested)) {
    return Math.max(1, Math.min(Math.floor(requested), totalCases));
  }

  return 1;
}

function resolveCaseRetryLimit(
  mode: PersistedEvalMode,
  requested?: number,
): number {
  if (typeof requested === "number" && Number.isFinite(requested)) {
    return Math.max(1, Math.floor(requested));
  }

  return mode === "live" ? 3 : 1;
}

function formatCaseError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function evaluateCase(input: {
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  createMemory?: EvalSuiteInput["createMemory"];
  baselineGenerator: EvalAnswerGenerator;
  goodmemoryGenerator: EvalAnswerGenerator;
  judge: JudgeModel;
}): Promise<JudgedEvalCase> {
  const memory =
    input.createMemory?.({ persona: input.persona, scenario: input.scenario }) ??
    defaultCreateMemory();
  const baseline = await runBaselineScenario({
    persona: input.persona,
    scenario: input.scenario,
    answerGenerator: input.baselineGenerator,
  });
  const goodmemory = await runGoodMemoryScenario({
    memory,
    persona: input.persona,
    scenario: input.scenario,
    answerGenerator: input.goodmemoryGenerator,
  });
  const judge = await runJudgeComparison({
    persona: input.persona,
    scenario: input.scenario,
    baseline,
    goodmemory,
    judge: input.judge,
  });
  const assertions = evaluateScenarioAssertions({
    scenario: input.scenario,
    goodmemory,
  });

  return {
    caseId: input.scenario.scenario_id,
    metadata: {
      taskFamily: input.scenario.task_family,
      targetDomain: input.scenario.domain,
      memorySourceDomains: input.scenario.memory_source_domains,
      evaluationSetting: input.scenario.evaluation_setting,
    },
    baseline,
    goodmemory,
    judge,
    assertions,
  };
}

async function evaluateCaseWithRetries(input: {
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  createMemory?: EvalSuiteInput["createMemory"];
  baselineGenerator: EvalAnswerGenerator;
  goodmemoryGenerator: EvalAnswerGenerator;
  judge: JudgeModel;
  retryLimit: number;
}): Promise<
  | { judgedCase: JudgedEvalCase; failure?: undefined }
  | { judgedCase?: undefined; failure: EvalCaseExecutionFailure }
> {
  const attempts: EvalCaseExecutionFailure["attempts"] = [];

  for (let attempt = 1; attempt <= input.retryLimit; attempt += 1) {
    try {
      const judgedCase = await evaluateCase({
        persona: input.persona,
        scenario: input.scenario,
        createMemory: input.createMemory,
        baselineGenerator: input.baselineGenerator,
        goodmemoryGenerator: input.goodmemoryGenerator,
        judge: input.judge,
      });

      return { judgedCase };
    } catch (error) {
      attempts.push({
        attempt,
        error: formatCaseError(error),
      });
    }
  }

  return {
    failure: {
      caseId: input.scenario.scenario_id,
      metadata: {
        taskFamily: input.scenario.task_family,
        targetDomain: input.scenario.domain,
        memorySourceDomains: input.scenario.memory_source_domains,
        evaluationSetting: input.scenario.evaluation_setting,
      },
      retryLimit: input.retryLimit,
      attempts,
      lastError: attempts[attempts.length - 1]?.error ?? "Unknown case failure",
    },
  };
}

function resolveCases(
  personas: PersonaSpec[],
  scenarios: ScenarioFixture[],
  scenarioIds?: string[],
  limit?: number,
): Array<{ persona: PersonaSpec; scenario: ScenarioFixture }> {
  const personasById = new Map(personas.map((persona) => [persona.persona_id, persona]));
  const allowedScenarioIds = scenarioIds ? new Set(scenarioIds) : null;

  return scenarios
    .filter((scenario) => (allowedScenarioIds ? allowedScenarioIds.has(scenario.scenario_id) : true))
    .slice(0, limit ?? scenarios.length)
    .map((scenario) => {
      const persona = personasById.get(scenario.persona_id);
      if (!persona) {
        throw new Error(`Missing persona ${scenario.persona_id} for scenario ${scenario.scenario_id}`);
      }

      return {
        persona,
        scenario,
      };
    });
}

export async function runEvalSuite(input: EvalSuiteInput): Promise<EvalSuiteResult> {
  const personas = await listPersonaSpecs(input.personaDir);
  const scenarios = await listScenarioFixtures(input.scenarioDir);
  validateScenarioDatasetLinks(personas, scenarios);

  const selectedCases = resolveCases(personas, scenarios, input.scenarioIds, input.limit);
  const judgedCases = new Array<JudgedEvalCase | undefined>(selectedCases.length);
  const failedCases = new Array<EvalCaseExecutionFailure | undefined>(selectedCases.length);
  const runId = input.runId ?? `run-${Date.now()}`;
  const runtime = normalizeProviderRuntimeMetadata(
    input.runtime ?? {
      generationMode: input.mode,
      judgeMode: input.mode,
    },
  );
  const initialArtifacts = await persistEvalArtifacts({
    mode: input.mode,
    outputDir: input.outputDir,
    runId,
    cases: [],
    summary: aggregateJudgedCases([], 0),
    runtime,
    executionFailures: [],
  });
  const maxConcurrency = resolveMaxConcurrency(
    selectedCases.length,
    input.maxConcurrency,
  );
  const retryLimit = resolveCaseRetryLimit(input.mode, input.caseRetryLimit);
  let nextCaseIndex = 0;
  let persistQueue = Promise.resolve();

  const persistCurrentState = () => {
    const completedCases = judgedCases.filter(
      (item): item is JudgedEvalCase => item !== undefined,
    );
    const completedFailures = failedCases.filter(
      (item): item is EvalCaseExecutionFailure => item !== undefined,
    );

    persistQueue = persistQueue.then(() =>
      persistEvalArtifacts({
        mode: input.mode,
        outputDir: input.outputDir,
        runId,
        cases: completedCases,
        summary: aggregateJudgedCases(completedCases, completedFailures.length),
        runtime,
        executionFailures: completedFailures,
      }).then(() => undefined),
    );

    return persistQueue;
  };

  const runWorker = async () => {
    while (true) {
      const currentIndex = nextCaseIndex;
      nextCaseIndex += 1;

      if (currentIndex >= selectedCases.length) {
        return;
      }

      const { persona, scenario } = selectedCases[currentIndex]!;

      const outcome = await evaluateCaseWithRetries({
        persona,
        scenario,
        createMemory: input.createMemory,
        baselineGenerator: input.baselineGenerator,
        goodmemoryGenerator: input.goodmemoryGenerator,
        judge: input.judge,
        retryLimit,
      });

      if (outcome.judgedCase) {
        judgedCases[currentIndex] = outcome.judgedCase;
      } else {
        failedCases[currentIndex] = outcome.failure;
      }

      persistCurrentState();
    }
  };

  await Promise.all(
    Array.from({ length: maxConcurrency }, () => runWorker()),
  );
  await persistQueue;

  const completedCases = judgedCases.filter(
    (item): item is JudgedEvalCase => item !== undefined,
  );
  const completedFailures = failedCases.filter(
    (item): item is EvalCaseExecutionFailure => item !== undefined,
  );
  const summary = aggregateJudgedCases(completedCases, completedFailures.length);

  return {
    mode: input.mode,
    runId,
    runDirectory: initialArtifacts.runDirectory,
    summary,
    runtime,
    cases: completedCases,
    failedCases: completedFailures,
  };
}
