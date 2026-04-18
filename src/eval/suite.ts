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
  EvalCaseExecutionFailureStage,
  EvalRuntimeMetadata,
  EvalSuiteSummary,
  JudgedEvalCase,
  PersistedEvalMode,
} from "./contracts";
import type {
  JudgeModel,
  JudgeResult,
} from "./judge";
import { runJudgeComparison } from "./judge";
import {
  aggregateJudgedCases,
  persistEvalArtifacts,
} from "./reporting";
import { normalizeProviderRuntimeMetadata } from "../provider/layer";
import type { RecallRouterStrategy } from "../recall/router";
import {
  isEvalGoodMemoryScenarioStageError,
  runBaselineScenario,
  runGoodMemoryScenario,
  type EvalAnswerPackage,
  type EvalAnswerGenerator,
} from "./runners";
import type { MemoryExtractionStrategy } from "../remember/candidates";
import type { RetrievalStrategyRolloutConfig } from "./strategy-rollout";
import {
  buildRetrievalStrategyRolloutConfig,
  buildStrategyRolloutMetadata,
  resolveRetrievalStrategyRollout,
} from "./strategy-rollout";
import {
  assertRetrievalPromotionGateAllowsDefaultRollout,
} from "./strategy-promotion-gate";

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
    caseId: string;
    persona: PersonaSpec;
    scenario: ScenarioFixture;
    scopeNamespace: string;
  }) => GoodMemory | { cleanup?: () => Promise<void>; memory: GoodMemory };
  runId?: string;
  runtime?: EvalRuntimeMetadata;
  maxConcurrency?: number;
  caseRetryLimit?: number;
  strategies?: RecallRouterStrategy[];
  rememberExtractionStrategy?: MemoryExtractionStrategy;
  strategyRollout?: RetrievalStrategyRolloutConfig;
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

interface EvalMemoryHandle {
  cleanup?: () => Promise<void>;
  memory: GoodMemory;
}

function defaultCreateMemory(): GoodMemory {
  return createGoodMemory({
    storage: { provider: "memory" },
  });
}

function resolveEvalMemoryHandle(input: {
  caseId: string;
  createMemory?: EvalSuiteInput["createMemory"];
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  scopeNamespace: string;
}): EvalMemoryHandle {
  const memoryHandle =
    input.createMemory?.({
      caseId: input.caseId,
      persona: input.persona,
      scenario: input.scenario,
      scopeNamespace: input.scopeNamespace,
    }) ?? defaultCreateMemory();

  if ("memory" in memoryHandle) {
    return memoryHandle;
  }

  return {
    memory: memoryHandle,
  };
}

function combineCleanups(
  cleanups: Array<(() => Promise<void>) | undefined>,
): () => Promise<void> {
  return async () => {
    const available = cleanups.filter(
      (cleanup): cleanup is () => Promise<void> => cleanup !== undefined,
    );
    if (available.length === 0) {
      return;
    }

    const errors: unknown[] = [];
    for (const cleanup of available) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Multiple eval cleanup handlers failed.");
    }
  };
}

function buildObserveShadowReplay(input: {
  caseId: string;
  scopeNamespace: string;
  strategy: RecallRouterStrategy;
  strategyRollout?: RetrievalStrategyRolloutConfig;
}):
  | {
      caseId: string;
      scopeNamespace: string;
      strategyRollout: RetrievalStrategyRolloutConfig;
    }
  | undefined {
  if (
    input.strategyRollout?.mode !== "observe" ||
    input.strategy === "auto"
  ) {
    return undefined;
  }

  const promotedStrategy =
    input.strategyRollout.promotedStrategy ?? "rules-only";
  if (input.strategy === promotedStrategy) {
    return undefined;
  }

  return {
    caseId: `${input.caseId}__shadow`,
    scopeNamespace: `${input.scopeNamespace}__shadow`,
    strategyRollout: {
      family: "retrieval",
      mode: "assist",
      promotedStrategy,
    },
  };
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

interface EvalCaseStageError extends Error {
  cause?: unknown;
  stage: EvalCaseExecutionFailureStage;
}

function wrapCaseStageError(
  stage: EvalCaseExecutionFailureStage,
  error: unknown,
): EvalCaseStageError {
  const wrapped = new Error(
    error instanceof Error ? error.message : String(error),
  ) as EvalCaseStageError;
  wrapped.name = "EvalCaseStageError";
  wrapped.stage = stage;
  wrapped.cause = error;
  if (error instanceof Error && error.stack) {
    wrapped.stack = error.stack;
  }

  return wrapped;
}

function isEvalCaseStageError(error: unknown): error is EvalCaseStageError {
  return (
    error instanceof Error &&
    "stage" in error &&
    typeof error.stage === "string"
  );
}

function findEvalCaseStageError(error: unknown): EvalCaseStageError | undefined {
  if (isEvalCaseStageError(error)) {
    return error;
  }

  if (error instanceof AggregateError) {
    for (const cause of error.errors) {
      const found = findEvalCaseStageError(cause);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

function resolveExecutionFailureStage(
  error: unknown,
): EvalCaseExecutionFailureStage {
  return findEvalCaseStageError(error)?.stage ?? "unknown";
}

function buildExecutionFailureMetadata(input: {
  failureStage: EvalCaseExecutionFailureStage;
  scenario: ScenarioFixture;
  strategy: RecallRouterStrategy;
  strategyRollout?: RetrievalStrategyRolloutConfig;
}): EvalCaseExecutionFailure["metadata"] {
  const rolloutDecision = resolveRetrievalStrategyRollout({
    requestedStrategy: input.strategy,
    rollout: input.strategyRollout,
  });
  const resolvedStrategyLabel =
    input.failureStage === "primary_execution"
      ? rolloutDecision.executedStrategy
      : input.failureStage === "shadow_execution" && input.strategy !== "auto"
        ? input.strategy
        : undefined;

  return {
    taskFamily: input.scenario.task_family,
    targetDomain: input.scenario.domain,
    memorySourceDomains: input.scenario.memory_source_domains,
    evaluationSetting: input.scenario.evaluation_setting,
    strategyLabel: rolloutDecision.requestedStrategyLabel,
    ...(resolvedStrategyLabel ? { resolvedStrategyLabel } : {}),
    ...(rolloutDecision.family
      ? { strategyFamily: rolloutDecision.family }
      : {}),
    ...(rolloutDecision.mode
      ? { strategyMode: rolloutDecision.mode }
      : {}),
    ...(rolloutDecision.promotedStrategyLabel
      ? { promotedStrategyLabel: rolloutDecision.promotedStrategyLabel }
      : {}),
  };
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

function resolveEvalSuiteStrategyRollout(input: {
  strategyRollout?: RetrievalStrategyRolloutConfig;
  runtimeStrategyRollout?: EvalRuntimeMetadata["strategyRollout"];
}): {
  effectiveStrategyRollout?: RetrievalStrategyRolloutConfig;
  runtimeStrategyRollout?: EvalRuntimeMetadata["strategyRollout"];
} {
  if (input.strategyRollout) {
    assertRetrievalPromotionGateAllowsDefaultRollout({
      rollout: input.strategyRollout,
    });
    return {
      effectiveStrategyRollout: input.strategyRollout,
      runtimeStrategyRollout: buildStrategyRolloutMetadata(input.strategyRollout),
    };
  }

  if (!input.runtimeStrategyRollout) {
    return {};
  }

  if (input.runtimeStrategyRollout.family !== "retrieval") {
    throw new Error(
      `runEvalSuite currently supports only retrieval strategy rollouts; received ${input.runtimeStrategyRollout.family}.`,
    );
  }

  const effectiveStrategyRollout = buildRetrievalStrategyRolloutConfig(
    input.runtimeStrategyRollout,
  );
  assertRetrievalPromotionGateAllowsDefaultRollout({
    rollout: effectiveStrategyRollout,
  });

  return {
    effectiveStrategyRollout,
    runtimeStrategyRollout: input.runtimeStrategyRollout,
  };
}

function indentErrorBlock(value: string): string {
  return value
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function formatCaseError(error: unknown): string {
  if (isEvalCaseStageError(error)) {
    return error.cause === undefined ? "undefined" : formatCaseError(error.cause);
  }

  if (isEvalGoodMemoryScenarioStageError(error)) {
    return error.cause === undefined ? "undefined" : formatCaseError(error.cause);
  }

  if (error instanceof AggregateError) {
    const header = error.stack ?? `${error.name}: ${error.message}`;
    const causes = error.errors.map((cause, index) =>
      `Cause ${index + 1}:\n${indentErrorBlock(formatCaseError(cause))}`
    );

    return [header, ...causes].join("\n");
  }

  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

async function runWithCaseCleanup<T>(
  execute: () => Promise<T>,
  cleanup?: () => Promise<void>,
): Promise<T> {
  let executionFailed = false;
  let primaryError: unknown;
  let result: T | undefined;

  try {
    result = await execute();
  } catch (error) {
    executionFailed = true;
    primaryError = error;
  }

  try {
    await cleanup?.();
  } catch (cleanupError) {
    const stagedCleanupError = wrapCaseStageError("cleanup", cleanupError);
    if (executionFailed) {
      throw new AggregateError(
        [primaryError, stagedCleanupError],
        "Eval case execution failed and cleanup also failed.",
      );
    }

    throw stagedCleanupError;
  }

  if (executionFailed) {
    throw primaryError;
  }

  return result as T;
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
  scopeNamespace: string;
  baseline: EvalAnswerPackage;
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  strategy: RecallRouterStrategy;
  createMemory?: EvalSuiteInput["createMemory"];
  goodmemoryGenerator: EvalAnswerGenerator;
  judge: JudgeModel;
  rememberExtractionStrategy?: MemoryExtractionStrategy;
  strategyRollout?: RetrievalStrategyRolloutConfig;
}): Promise<JudgedEvalCase> {
  const cleanups: Array<(() => Promise<void>) | undefined> = [];
  const cleanup = combineCleanups(cleanups);

  return runWithCaseCleanup(async () => {
    let primaryHandle: EvalMemoryHandle;
    try {
      primaryHandle = resolveEvalMemoryHandle({
        caseId: input.caseId,
        createMemory: input.createMemory,
        persona: input.persona,
        scenario: input.scenario,
        scopeNamespace: input.scopeNamespace,
      });
    } catch (error) {
      throw wrapCaseStageError("primary_setup", error);
    }
    cleanups.push(primaryHandle.cleanup);

    const shadowReplay = buildObserveShadowReplay({
      caseId: input.caseId,
      scopeNamespace: input.scopeNamespace,
      strategy: input.strategy,
      strategyRollout: input.strategyRollout,
    });
    let shadowHandle: EvalMemoryHandle | undefined;
    if (shadowReplay) {
      try {
        shadowHandle = resolveEvalMemoryHandle({
          caseId: shadowReplay.caseId,
          createMemory: input.createMemory,
          persona: input.persona,
          scenario: input.scenario,
          scopeNamespace: shadowReplay.scopeNamespace,
        });
      } catch (error) {
        throw wrapCaseStageError("shadow_setup", error);
      }
    }
    if (shadowHandle) {
      cleanups.push(shadowHandle.cleanup);
    }

    let goodmemory: EvalAnswerPackage;
    try {
      goodmemory = await runGoodMemoryScenario({
        memory: primaryHandle.memory,
        persona: input.persona,
        scenario: input.scenario,
        answerGenerator: input.goodmemoryGenerator,
        strategy: input.strategy,
        strategyRollout: input.strategyRollout,
        rememberExtractionStrategy: input.rememberExtractionStrategy,
        scopeNamespace: input.scopeNamespace,
      });
    } catch (error) {
      throw wrapCaseStageError(
        isEvalGoodMemoryScenarioStageError(error) &&
          error.boundary === "pre_recall"
          ? "primary_pre_recall"
          : "primary_execution",
        error,
      );
    }
    const shadow =
      shadowReplay && shadowHandle
        ? await (async () => {
            try {
              return await runGoodMemoryScenario({
                memory: shadowHandle.memory,
                persona: input.persona,
                scenario: input.scenario,
                answerGenerator: input.goodmemoryGenerator,
                strategy: input.strategy,
                strategyRollout: shadowReplay.strategyRollout,
                rememberExtractionStrategy: input.rememberExtractionStrategy,
                scopeNamespace: shadowReplay.scopeNamespace,
              });
            } catch (error) {
              throw wrapCaseStageError(
                isEvalGoodMemoryScenarioStageError(error) &&
                  error.boundary === "pre_recall"
                  ? "shadow_pre_recall"
                  : "shadow_execution",
                error,
              );
            }
          })()
        : undefined;
    let judge: JudgeResult;
    try {
      judge = await runJudgeComparison({
        persona: input.persona,
        scenario: input.scenario,
        baseline: input.baseline,
        goodmemory,
        judge: input.judge,
      });
    } catch (error) {
      throw wrapCaseStageError("judge", error);
    }
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
        strategyLabel:
          goodmemory.strategyLabel as Exclude<
            EvalAnswerPackage["strategyLabel"],
            "baseline"
          >,
        resolvedStrategyLabel:
          goodmemory.resolvedStrategyLabel as Exclude<
            EvalAnswerPackage["resolvedStrategyLabel"],
            "baseline"
          > | undefined,
        strategyFamily: goodmemory.strategyFamily,
        strategyMode: goodmemory.strategyMode,
        promotedStrategyLabel: goodmemory.promotedStrategyLabel,
      },
      baseline: input.baseline,
      goodmemory,
      ...(shadow ? { shadow } : {}),
      judge,
      assertions,
    };
  }, cleanup);
}

async function evaluateCaseWithRetries(input: {
  caseId: string;
  scopeNamespace: string;
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
  rememberExtractionStrategy?: MemoryExtractionStrategy;
  strategyRollout?: RetrievalStrategyRolloutConfig;
}): Promise<
  | { judgedCase: JudgedEvalCase; failure?: undefined }
  | { judgedCase?: undefined; failure: EvalCaseExecutionFailure }
> {
  const attempts: EvalCaseExecutionFailure["attempts"] = [];

  for (let attempt = 1; attempt <= input.retryLimit; attempt += 1) {
    try {
      let baseline: EvalAnswerPackage;
      try {
        baseline = await input.getBaseline({
          persona: input.persona,
          scenario: input.scenario,
        });
      } catch (error) {
        throw wrapCaseStageError("baseline_execution", error);
      }
      const judgedCase = await evaluateCase({
        caseId: input.caseId,
        scopeNamespace: input.scopeNamespace,
        baseline,
        persona: input.persona,
        scenario: input.scenario,
        strategy: input.strategy,
        createMemory: input.createMemory,
        goodmemoryGenerator: input.goodmemoryGenerator,
        judge: input.judge,
        rememberExtractionStrategy: input.rememberExtractionStrategy,
        strategyRollout: input.strategyRollout,
      });

      return { judgedCase };
    } catch (error) {
      const failureStage = resolveExecutionFailureStage(error);
      attempts.push({
        attempt,
        error: formatCaseError(error),
      });

      if (attempt === input.retryLimit) {
        return {
          failure: {
            caseId: input.caseId,
            failureStage,
            metadata: buildExecutionFailureMetadata({
              scenario: input.scenario,
              failureStage,
              strategy: input.strategy,
              strategyRollout: input.strategyRollout,
            }),
            retryLimit: input.retryLimit,
            attempts,
            lastError:
              attempts[attempts.length - 1]?.error ?? "Unknown case failure",
          },
        };
      }
    }
  }

  return {
    failure: {
      caseId: input.caseId,
      failureStage: "unknown",
      metadata: buildExecutionFailureMetadata({
        scenario: input.scenario,
        failureStage: "unknown",
        strategy: input.strategy,
        strategyRollout: input.strategyRollout,
      }),
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
  const { effectiveStrategyRollout, runtimeStrategyRollout } =
    resolveEvalSuiteStrategyRollout({
      strategyRollout: input.strategyRollout,
      runtimeStrategyRollout: input.runtime?.strategyRollout,
    });
  const runtime = {
    ...normalizeProviderRuntimeMetadata(
      input.runtime ?? {
        generationMode: input.mode,
        judgeMode: input.mode,
      },
    ),
    ...(runtimeStrategyRollout ? { strategyRollout: runtimeStrategyRollout } : {}),
  } as EvalRuntimeMetadata;
  const initialArtifacts = await persistEvalArtifacts({
    mode: input.mode,
    outputDir: input.outputDir,
    runId,
    cases: [],
    summary: aggregateJudgedCases([], 0, runtime),
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
        summary: aggregateJudgedCases(
          completedCases,
          completedFailures,
          runtime,
        ),
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
      const scopeNamespace = `${runId}-${caseId}`;

      const outcome = await evaluateCaseWithRetries({
        caseId,
        scopeNamespace,
        persona,
        scenario,
        strategy,
        getBaseline,
        createMemory: input.createMemory,
        goodmemoryGenerator: input.goodmemoryGenerator,
        judge: input.judge,
        retryLimit,
        rememberExtractionStrategy: input.rememberExtractionStrategy,
        strategyRollout: effectiveStrategyRollout,
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
  const summary = aggregateJudgedCases(
    completedCases,
    completedFailures,
    runtime,
  );

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
