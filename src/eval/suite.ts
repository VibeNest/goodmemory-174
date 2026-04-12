import type { GoodMemory } from "../api/contracts";
import { createGoodMemory } from "../api/createGoodMemory";
import { evaluateScenarioAssertions } from "./assertions";
import {
  listPersonaSpecs,
  listScenarioFixtures,
  validateScenarioDatasetLinks,
  type PersonaSpec,
  type ScenarioFixture,
} from "./dataset";
import type {
  EvalCaseExecutionFailure,
  EvalRuntimeMetadata,
  EvalSuiteSummary,
  JudgedEvalCase,
  PersistedEvalMode,
} from "./contracts";
import type { JudgeModel } from "./judge";
import { runJudgeComparison } from "./judge";
import {
  aggregateJudgedCases,
  persistEvalArtifacts,
} from "./reporting";
import { normalizeProviderRuntimeMetadata } from "../provider/layer";
import type { RecallRouterStrategy } from "../recall/router";
import {
  runBaselineScenario,
  runGoodMemoryScenario,
  type EvalAnswerPackage,
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
  caseIds?: string[];
  createMemory?: (input: {
    persona: PersonaSpec;
    scenario: ScenarioFixture;
  }) => GoodMemory;
  runId?: string;
  runtime?: EvalRuntimeMetadata;
  maxConcurrency?: number;
  caseRetryLimit?: number;
  strategies?: RecallRouterStrategy[];
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

const RECALL_ROUTER_STRATEGIES = [
  "rules-only",
  "hybrid",
  "llm-assisted",
] as const satisfies RecallRouterStrategy[];

function parseRequestedCaseId(caseId: string): {
  scenarioId: string;
  strategy?: RecallRouterStrategy;
} {
  for (const strategy of RECALL_ROUTER_STRATEGIES) {
    const suffix = `__${strategy}`;
    if (caseId.endsWith(suffix)) {
      return {
        scenarioId: caseId.slice(0, -suffix.length),
        strategy,
      };
    }
  }

  return { scenarioId: caseId };
}

async function evaluateCase(input: {
  caseId: string;
  baseline: EvalAnswerPackage;
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  strategy: RecallRouterStrategy;
  createMemory?: EvalSuiteInput["createMemory"];
  goodmemoryGenerator: EvalAnswerGenerator;
  judge: JudgeModel;
}): Promise<JudgedEvalCase> {
  const memory =
    input.createMemory?.({ persona: input.persona, scenario: input.scenario }) ??
    defaultCreateMemory();
  const goodmemory = await runGoodMemoryScenario({
    memory,
    persona: input.persona,
    scenario: input.scenario,
    answerGenerator: input.goodmemoryGenerator,
    strategy: input.strategy,
  });
  const judge = await runJudgeComparison({
    persona: input.persona,
    scenario: input.scenario,
    baseline: input.baseline,
    goodmemory,
    judge: input.judge,
  });
  const assertions = evaluateScenarioAssertions({
    scenario: input.scenario,
    goodmemory,
  });

  return {
    caseId: input.caseId,
    metadata: {
      taskFamily: input.scenario.task_family,
      targetDomain: input.scenario.domain,
      memorySourceDomains: input.scenario.memory_source_domains,
      evaluationSetting: input.scenario.evaluation_setting,
      strategyLabel: goodmemory.strategyLabel,
      resolvedStrategyLabel: goodmemory.resolvedStrategyLabel,
    },
    baseline: input.baseline,
    goodmemory,
    judge,
    assertions,
  };
}

async function evaluateCaseWithRetries(input: {
  caseId: string;
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  strategy: RecallRouterStrategy;
  getBaseline: (input: {
    persona: PersonaSpec;
    scenario: ScenarioFixture;
  }) => Promise<EvalAnswerPackage>;
  createMemory?: EvalSuiteInput["createMemory"];
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
      const baseline = await input.getBaseline({
        persona: input.persona,
        scenario: input.scenario,
      });
      const judgedCase = await evaluateCase({
        caseId: input.caseId,
        baseline,
        persona: input.persona,
        scenario: input.scenario,
        strategy: input.strategy,
        createMemory: input.createMemory,
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
      caseId: input.caseId,
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
  caseIds?: string[],
  limit?: number,
  strategies?: RecallRouterStrategy[],
): Array<{
  caseId: string;
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  strategy: RecallRouterStrategy;
}> {
  const personasById = new Map(personas.map((persona) => [persona.persona_id, persona]));
  const scenariosById = new Map(scenarios.map((scenario) => [scenario.scenario_id, scenario]));
  const requestedStrategies: RecallRouterStrategy[] = strategies?.length
    ? [...new Set(strategies)]
    : ["rules-only"];
  const selected = new Map<
    string,
    {
      caseId: string;
      persona: PersonaSpec;
      scenario: ScenarioFixture;
      strategy: RecallRouterStrategy;
    }
  >();

  const addCase = (input: {
    caseId: string;
    persona: PersonaSpec;
    scenario: ScenarioFixture;
    strategy: RecallRouterStrategy;
  }) => {
    if (!selected.has(input.caseId)) {
      selected.set(input.caseId, input);
    }
  };

  const addScenarioStrategies = (
    scenario: ScenarioFixture,
    includeStrategyInCaseId: boolean,
  ) => {
    const persona = personasById.get(scenario.persona_id);
    if (!persona) {
      throw new Error(`Missing persona ${scenario.persona_id} for scenario ${scenario.scenario_id}`);
    }

    for (const strategy of requestedStrategies) {
      addCase({
        caseId: includeStrategyInCaseId
          ? `${scenario.scenario_id}__${strategy}`
          : scenario.scenario_id,
        persona,
        scenario,
        strategy,
      });
    }
  };

  const allowedScenarioIds = scenarioIds ? new Set(scenarioIds) : null;
  const runAllScenarios = !allowedScenarioIds && !(caseIds?.length);
  const filteredScenarios = runAllScenarios
    ? scenarios
    : allowedScenarioIds
      ? scenarios.filter((scenario) => allowedScenarioIds.has(scenario.scenario_id))
      : [];
  const limitedScenarios = filteredScenarios.slice(0, limit ?? filteredScenarios.length);
  const limitedCaseIds = caseIds?.slice(0, limit ?? caseIds.length) ?? [];

  for (const scenario of limitedScenarios) {
    addScenarioStrategies(scenario, requestedStrategies.length > 1);
  }

  for (const requestedCaseId of limitedCaseIds) {
    const { scenarioId, strategy } = parseRequestedCaseId(requestedCaseId);
    const scenario = scenariosById.get(scenarioId);

    if (!scenario) {
      continue;
    }

    const persona = personasById.get(scenario.persona_id);
    if (!persona) {
      throw new Error(`Missing persona ${scenario.persona_id} for scenario ${scenario.scenario_id}`);
    }

    if (strategy) {
      addCase({
        caseId: requestedCaseId,
        persona,
        scenario,
        strategy,
      });
      continue;
    }

    addScenarioStrategies(scenario, requestedStrategies.length > 1);
  }

  return [...selected.values()];
}

export async function runEvalSuite(input: EvalSuiteInput): Promise<EvalSuiteResult> {
  const personas = await listPersonaSpecs(input.personaDir);
  const scenarios = await listScenarioFixtures(input.scenarioDir);
  validateScenarioDatasetLinks(personas, scenarios);

  const selectedCases = resolveCases(
    personas,
    scenarios,
    input.scenarioIds,
    input.caseIds,
    input.limit,
    input.strategies,
  );
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
  const baselineCache = new Map<string, Promise<EvalAnswerPackage>>();
  let nextCaseIndex = 0;
  let persistQueue = Promise.resolve();

  const getBaseline = (baselineInput: {
    persona: PersonaSpec;
    scenario: ScenarioFixture;
  }): Promise<EvalAnswerPackage> => {
    const cacheKey = baselineInput.scenario.scenario_id;
    const cached = baselineCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const baselinePromise = runBaselineScenario({
      persona: baselineInput.persona,
      scenario: baselineInput.scenario,
      answerGenerator: input.baselineGenerator,
    }).catch((error) => {
      baselineCache.delete(cacheKey);
      throw error;
    });

    baselineCache.set(cacheKey, baselinePromise);
    return baselinePromise;
  };

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

      const { caseId, persona, scenario, strategy } = selectedCases[currentIndex]!;

      const outcome = await evaluateCaseWithRetries({
        caseId,
        persona,
        scenario,
        strategy,
        getBaseline,
        createMemory: input.createMemory,
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
