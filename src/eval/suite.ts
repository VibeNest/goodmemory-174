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
  type EvalRuntimeMetadata,
  type PersistedEvalMode,
  type EvalSuiteSummary,
  type JudgedEvalCase,
} from "./reporting";
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
}

export interface EvalSuiteResult {
  mode: PersistedEvalMode;
  runId: string;
  runDirectory: string;
  summary: EvalSuiteSummary;
  runtime: EvalRuntimeMetadata;
  cases: JudgedEvalCase[];
}

function defaultCreateMemory(): GoodMemory {
  return createGoodMemory({
    storage: { provider: "memory" },
  });
}

function resolveMaxConcurrency(
  mode: PersistedEvalMode,
  totalCases: number,
  requested?: number,
): number {
  if (totalCases <= 0) {
    return 1;
  }

  if (typeof requested === "number" && Number.isFinite(requested)) {
    return Math.max(1, Math.min(Math.floor(requested), totalCases));
  }

  if (mode === "live") {
    return Math.min(4, totalCases);
  }

  return 1;
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
  const runId = input.runId ?? `run-${Date.now()}`;
  const runtime = input.runtime ?? {
    generationMode: input.mode,
    judgeMode: input.mode,
  };
  const initialArtifacts = await persistEvalArtifacts({
    mode: input.mode,
    outputDir: input.outputDir,
    runId,
    cases: [],
    summary: aggregateJudgedCases([]),
    runtime,
  });
  const maxConcurrency = resolveMaxConcurrency(
    input.mode,
    selectedCases.length,
    input.maxConcurrency,
  );
  let nextCaseIndex = 0;
  let firstError: unknown;
  let persistQueue = Promise.resolve();

  const persistCurrentState = () => {
    const completedCases = judgedCases.filter(
      (item): item is JudgedEvalCase => item !== undefined,
    );

    persistQueue = persistQueue.then(() =>
      persistEvalArtifacts({
        mode: input.mode,
        outputDir: input.outputDir,
        runId,
        cases: completedCases,
        summary: aggregateJudgedCases(completedCases),
        runtime,
      }).then(() => undefined),
    );

    return persistQueue;
  };

  const runWorker = async () => {
    while (firstError === undefined) {
      const currentIndex = nextCaseIndex;
      nextCaseIndex += 1;

      if (currentIndex >= selectedCases.length) {
        return;
      }

      const { persona, scenario } = selectedCases[currentIndex]!;

      try {
        const judgedCase = await evaluateCase({
          persona,
          scenario,
          createMemory: input.createMemory,
          baselineGenerator: input.baselineGenerator,
          goodmemoryGenerator: input.goodmemoryGenerator,
          judge: input.judge,
        });
        judgedCases[currentIndex] = judgedCase;
        persistCurrentState();
      } catch (error) {
        firstError = error;
        return;
      }
    }
  };

  await Promise.all(
    Array.from({ length: maxConcurrency }, () => runWorker()),
  );
  await persistQueue;

  if (firstError !== undefined) {
    throw firstError;
  }

  const completedCases = judgedCases.filter(
    (item): item is JudgedEvalCase => item !== undefined,
  );
  const summary = aggregateJudgedCases(completedCases);

  return {
    mode: input.mode,
    runId,
    runDirectory: initialArtifacts.runDirectory,
    summary,
    runtime,
    cases: completedCases,
  };
}
