import { createGoodMemory, type GoodMemory } from "../index";
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
  const judgedCases: JudgedEvalCase[] = [];

  for (const { persona, scenario } of selectedCases) {
    const memory =
      input.createMemory?.({ persona, scenario }) ?? defaultCreateMemory();
    const baseline = await runBaselineScenario({
      persona,
      scenario,
      answerGenerator: input.baselineGenerator,
    });
    const goodmemory = await runGoodMemoryScenario({
      memory,
      persona,
      scenario,
      answerGenerator: input.goodmemoryGenerator,
    });
    const judge = await runJudgeComparison({
      persona,
      scenario,
      baseline,
      goodmemory,
      judge: input.judge,
    });

    judgedCases.push({
      caseId: scenario.scenario_id,
      baseline,
      goodmemory,
      judge,
    });
  }

  const summary = aggregateJudgedCases(judgedCases);
  const runId = input.runId ?? `run-${Date.now()}`;
  const runtime = input.runtime ?? {
    generationMode: input.mode,
    judgeMode: input.mode,
  };
  const artifacts = await persistEvalArtifacts({
    mode: input.mode,
    outputDir: input.outputDir,
    runId,
    cases: judgedCases,
    summary,
    runtime,
  });

  return {
    mode: input.mode,
    runId,
    runDirectory: artifacts.runDirectory,
    summary,
    runtime,
    cases: judgedCases,
  };
}
