import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvalSuiteSummary } from "../src/eval/contracts";
import { listScenarioFixtures } from "../src/eval/dataset";
import { createRetrievalPromotionAuthorization } from "../src/eval/strategy-promotion-gate";
import type { EvalSuiteResult } from "../src/eval/suite";
import type { RecallRouterStrategy } from "../src/recall/router";
import type { RetrievalStrategyPromotionAuthorization } from "../src/eval/strategy-rollout";
import type { FixtureEvalOptions } from "./run-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";
import {
  resolveFlagValue,
  resolveRepeatedFlagValues,
  runLiveMemoryEval,
} from "./run-eval";

export interface Phase17LiveMemoryOptions extends FixtureEvalOptions {
  runId?: string;
}

export interface Phase17LiveMemoryDependencies {
  createAuthorization?: typeof createRetrievalPromotionAuthorization;
  runEval?: typeof runLiveMemoryEval;
  writeFileImpl?: typeof writeFile;
}

export interface Phase17LiveMemoryReport {
  assist: EvalSuiteResult;
  authorization: RetrievalStrategyPromotionAuthorization;
  authorizationPath: string;
  observe: EvalSuiteResult;
  outputDir: string;
}

interface PersistedPhase17RunSummary {
  runDirectory: string;
  runId: string;
  summary: EvalSuiteSummary;
}

const PHASE_17_REQUIRED_GATE_ARTIFACTS = [
  "public-surface-decision.json",
  "regression-dashboard.json",
  "report.json",
  "shadow-executed-path-comparisons.json",
  "strategy-promotion-gate.json",
] as const;
const PHASE_17_LIVE_MEMORY_CLI_POLL_MS = 1000;
const PHASE_17_LIVE_MEMORY_CLI_TIMEOUT_MS = 15 * 60 * 1000;
const RECALL_ROUTER_STRATEGIES = [
  "rules-only",
  "hybrid",
  "llm-assisted",
] as const satisfies RecallRouterStrategy[];

export function resolvePhase17LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-17");
}

function resolvePhase17BaseRunId(runId?: string): string {
  return runId ?? `run-${Date.now()}`;
}

function resolvePhase17RunId(
  baseRunId: string,
  suffix: "assist" | "observe",
): string {
  return `${baseRunId}-${suffix}`;
}

function resolvePhase17ScenarioIds(explicit?: string[]): string[] | undefined {
  if (!explicit || explicit.length === 0) {
    return undefined;
  }

  return [...new Set(explicit)];
}

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readPersistedPhase17RunSummary(
  runDirectory: string,
): Promise<PersistedPhase17RunSummary | undefined> {
  const requiredPaths = PHASE_17_REQUIRED_GATE_ARTIFACTS.map((artifact) =>
    join(runDirectory, artifact),
  );
  const readiness = await Promise.all(
    requiredPaths.map((artifactPath) => pathExists(artifactPath)),
  );
  if (readiness.some((ready) => !ready)) {
    return undefined;
  }

  const report = JSON.parse(
    await readFile(join(runDirectory, "report.json"), "utf8"),
  ) as {
    runId: string;
    summary: EvalSuiteSummary;
  };

  return {
    runDirectory,
    runId: report.runId,
    summary: report.summary,
  };
}

function isCompletedPhase17RunSummary(
  summary: EvalSuiteSummary,
  mode: "assist" | "observe",
  expectedCaseCount: number,
): boolean {
  const completedCases =
    typeof summary.completedCases === "number" ? summary.completedCases : 0;

  if (
    summary.totalCases < expectedCaseCount ||
    completedCases < expectedCaseCount
  ) {
    return false;
  }

  if (!summary.promotionGate || summary.promotionGate.mode !== mode) {
    return false;
  }

  if (mode === "observe") {
    return (summary.shadowSummary?.totalCases ?? 0) > 0;
  }

  return Boolean(summary.promotionGate.targetStrategyLabel);
}

function resolveCompletedCaseCount(summary: EvalSuiteSummary): number {
  return typeof summary.completedCases === "number" ? summary.completedCases : 0;
}

function resolveRequiredObserveCaseCount(
  summary: EvalSuiteSummary,
  expectedCaseCount?: number,
): number {
  if (typeof expectedCaseCount === "number" && expectedCaseCount > 0) {
    return expectedCaseCount;
  }

  return Math.max(
    1,
    summary.totalCases,
    resolveCompletedCaseCount(summary),
    summary.shadowSummary?.totalCases ?? 0,
  );
}

function assertObserveAssistPromotionChain(input: {
  assist: PersistedPhase17RunSummary;
  expectedCaseCount?: number;
  observe: PersistedPhase17RunSummary;
}) {
  const observeGate = input.observe.summary.promotionGate;
  if (!observeGate || observeGate.mode !== "observe") {
    throw new Error(
      "Phase 17 live-memory promotion authorization requires an observe promotion gate result before assist can authorize promotion.",
    );
  }

  const observeShadowSummary = input.observe.summary.shadowSummary;
  if (!observeShadowSummary) {
    throw new Error(
      "Phase 17 live-memory promotion authorization requires persisted observe shadow evidence.",
    );
  }

  const requiredObserveCases = resolveRequiredObserveCaseCount(
    input.observe.summary,
    input.expectedCaseCount,
  );
  if (
    input.observe.summary.totalCases < requiredObserveCases ||
    resolveCompletedCaseCount(input.observe.summary) < requiredObserveCases
  ) {
    throw new Error(
      `Phase 17 live-memory promotion authorization requires observe to complete ${requiredObserveCases} cases before assist can authorize promotion.`,
    );
  }
  if ((input.observe.summary.executionFailures ?? 0) > 0) {
    throw new Error(
      "Phase 17 live-memory promotion authorization requires observe to finish without execution failures.",
    );
  }
  if (
    observeGate.decision === "rejected" ||
    observeGate.outcome === "blocked"
  ) {
    throw new Error(
      `Phase 17 live-memory promotion authorization requires observe to stay clean and known-safe; observe ended ${observeGate.decision}/${observeGate.outcome}.`,
    );
  }
  if (observeShadowSummary.totalCases < requiredObserveCases) {
    throw new Error(
      `Phase 17 live-memory promotion authorization requires observe shadow evidence for ${requiredObserveCases} cases before assist can authorize promotion.`,
    );
  }
  if (observeShadowSummary.regressionCases.length > 0) {
    throw new Error(
      "Phase 17 live-memory promotion authorization requires observe shadow evidence with zero regressions.",
    );
  }
  if (observeShadowSummary.unknownObserveCases > 0) {
    throw new Error(
      "Phase 17 live-memory promotion authorization requires observe execution safety to be known for every case.",
    );
  }
  if (observeShadowSummary.safeObserveCases < requiredObserveCases) {
    throw new Error(
      "Phase 17 live-memory promotion authorization requires observe to prove every executed path stayed on the promoted/default strategy.",
    );
  }
  if (input.observe.summary.assertions.passRate < 1) {
    throw new Error(
      "Phase 17 live-memory promotion authorization requires observe deterministic assertions to pass before assist can authorize promotion.",
    );
  }

  const assistGate = input.assist.summary.promotionGate;
  if (!assistGate || assistGate.mode !== "assist") {
    throw new Error(
      "Phase 17 live-memory promotion authorization requires an assist promotion gate result.",
    );
  }
  if (
    observeGate.targetStrategyLabel &&
    assistGate.targetStrategyLabel &&
    observeGate.targetStrategyLabel !== assistGate.targetStrategyLabel
  ) {
    throw new Error(
      `Phase 17 live-memory promotion authorization requires observe and assist to target the same strategy; observe targeted ${observeGate.targetStrategyLabel}, assist targeted ${assistGate.targetStrategyLabel}.`,
    );
  }
  if (observeGate.promotedStrategyLabel !== assistGate.promotedStrategyLabel) {
    throw new Error(
      "Phase 17 live-memory promotion authorization requires observe and assist to share the same promoted baseline strategy.",
    );
  }
}

async function resolveExpectedPhase17CaseCount(
  input: Phase17LiveMemoryOptions,
): Promise<number> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const scenarios = await listScenarioFixtures(join(root, "fixtures/scenarios/eval"));
  const requestedStrategies = input.strategies?.length
    ? [...new Set(input.strategies)]
    : ["rules-only", "hybrid"];
  const scenariosById = new Map(
    scenarios.map((scenario) => [scenario.scenario_id, scenario]),
  );
  const selectedCaseIds = new Set<string>();
  const addScenarioStrategies = (
    scenarioId: string,
    includeStrategyInCaseId: boolean,
  ) => {
    for (const strategy of requestedStrategies) {
      selectedCaseIds.add(
        includeStrategyInCaseId ? `${scenarioId}__${strategy}` : scenarioId,
      );
    }
  };

  const allowedScenarioIds =
    input.scenarioIds && input.scenarioIds.length > 0
      ? new Set(input.scenarioIds)
      : null;
  const limitedRequestedCaseIds =
    input.caseIds && input.caseIds.length > 0 ? input.caseIds : undefined;
  const runAllScenarios = !allowedScenarioIds && !limitedRequestedCaseIds;
  const filteredScenarios = runAllScenarios
    ? scenarios
    : allowedScenarioIds
      ? scenarios.filter((scenario) => allowedScenarioIds.has(scenario.scenario_id))
      : [];
  const limitedScenarios = filteredScenarios.slice(
    0,
    input.limit ?? filteredScenarios.length,
  );
  const limitedCaseIds = limitedRequestedCaseIds?.slice(
    0,
    input.limit ?? limitedRequestedCaseIds.length,
  ) ?? [];

  for (const scenario of limitedScenarios) {
    addScenarioStrategies(scenario.scenario_id, requestedStrategies.length > 1);
  }

  for (const requestedCaseId of limitedCaseIds) {
    const { scenarioId, strategy } = parseRequestedCaseId(requestedCaseId);
    const scenario = scenariosById.get(scenarioId);
    if (!scenario) {
      continue;
    }

    if (strategy) {
      selectedCaseIds.add(requestedCaseId);
      continue;
    }

    addScenarioStrategies(scenario.scenario_id, requestedStrategies.length > 1);
  }

  return selectedCaseIds.size;
}

function buildPhase17LiveMemoryCliSummary(input: {
  assist: PersistedPhase17RunSummary;
  authorization: RetrievalStrategyPromotionAuthorization;
  authorizationPath: string;
  observe: PersistedPhase17RunSummary;
  outputDir: string;
}) {
  return {
    authorization: input.authorization,
    authorizationPath: input.authorizationPath,
    outputDir: input.outputDir,
    observe: {
      runDirectory: input.observe.runDirectory,
      runId: input.observe.runId,
      summary: {
        assertions: input.observe.summary.assertions,
        executionFailures: input.observe.summary.executionFailures,
        promotionGate: input.observe.summary.promotionGate,
        publicSurfaceDecision: input.observe.summary.publicSurfaceDecision?.surfaces,
        regressionDashboardSummary: input.observe.summary.regressionDashboardSummary,
        shadowSummary: input.observe.summary.shadowSummary,
        totalCases: input.observe.summary.totalCases,
        winnerCounts: input.observe.summary.winnerCounts,
      },
    },
    assist: {
      runDirectory: input.assist.runDirectory,
      runId: input.assist.runId,
      summary: {
        assertions: input.assist.summary.assertions,
        executionFailures: input.assist.summary.executionFailures,
        judgeUplift: input.assist.summary.uplift,
        promotionGate: input.assist.summary.promotionGate,
        publicSurfaceDecision: input.assist.summary.publicSurfaceDecision?.surfaces,
        regressionDashboardSummary: input.assist.summary.regressionDashboardSummary,
        shadowSummary: input.assist.summary.shadowSummary,
        totalCases: input.assist.summary.totalCases,
        winnerCounts: input.assist.summary.winnerCounts,
      },
    },
  };
}

async function waitForPersistedPhase17LiveMemoryCliSummary(
  input: Phase17LiveMemoryOptions,
  dependencies?: Pick<
    Phase17LiveMemoryDependencies,
    "createAuthorization" | "writeFileImpl"
  > & {
    getGateError?: () => unknown;
    pollIntervalMs?: number;
    timeoutMs?: number;
  },
) {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = input.outputDir ?? resolvePhase17LiveMemoryOutputDir(root);
  const baseRunId = resolvePhase17BaseRunId(input.runId);
  const createAuthorization =
    dependencies?.createAuthorization ?? createRetrievalPromotionAuthorization;
  const writeFileImpl = dependencies?.writeFileImpl ?? writeFile;
  const pollIntervalMs =
    dependencies?.pollIntervalMs ?? PHASE_17_LIVE_MEMORY_CLI_POLL_MS;
  const timeoutMs =
    dependencies?.timeoutMs ?? PHASE_17_LIVE_MEMORY_CLI_TIMEOUT_MS;
  const expectedCaseCount = await resolveExpectedPhase17CaseCount({
    ...input,
    strategies: input.strategies ?? ["rules-only", "hybrid"],
  });
  const observeRunDirectory = join(
    outputDir,
    "observe",
    resolvePhase17RunId(baseRunId, "observe"),
  );
  const assistRunDirectory = join(
    outputDir,
    "assist",
    resolvePhase17RunId(baseRunId, "assist"),
  );
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const gateError = dependencies?.getGateError?.();
    if (gateError) {
      throw gateError;
    }

    const [observe, assist] = await Promise.all([
      readPersistedPhase17RunSummary(observeRunDirectory),
      readPersistedPhase17RunSummary(assistRunDirectory),
    ]);
    if (
      observe &&
      assist &&
      isCompletedPhase17RunSummary(
        observe.summary,
        "observe",
        expectedCaseCount,
      ) &&
      isCompletedPhase17RunSummary(
        assist.summary,
        "assist",
        expectedCaseCount,
      )
    ) {
      assertObserveAssistPromotionChain({
        assist,
        expectedCaseCount,
        observe,
      });

      const authorizationPath = join(
        assist.runDirectory,
        "strategy-promotion-authorization.json",
      );
      const authorization = await (async () => {
        if (await pathExists(authorizationPath)) {
          return JSON.parse(
            await readFile(authorizationPath, "utf8"),
          ) as RetrievalStrategyPromotionAuthorization;
        }

        const generated = createAuthorization({
          generatedBy: "scripts/run-phase-17-live-memory.ts",
          observe: {
            runDirectory: observe.runDirectory,
            runId: observe.runId,
            summary: observe.summary,
          },
          runDirectory: assist.runDirectory,
          runId: assist.runId,
          summary: assist.summary,
        });
        await writeFileImpl(
          authorizationPath,
          `${JSON.stringify(generated, null, 2)}\n`,
          "utf8",
        );
        return generated;
      })();

      return buildPhase17LiveMemoryCliSummary({
        assist,
        authorization,
        authorizationPath,
        observe,
        outputDir,
      });
    }

    await delay(pollIntervalMs);
  }

  throw new Error(
    `Timed out waiting for persisted Phase 17 live-memory gate artifacts under ${outputDir}.`,
  );
}

export async function runPhase17LiveMemoryGate(
  input?: Phase17LiveMemoryOptions,
  dependencies?: Phase17LiveMemoryDependencies,
): Promise<Phase17LiveMemoryReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = input?.outputDir ?? resolvePhase17LiveMemoryOutputDir(root);
  const baseRunId = resolvePhase17BaseRunId(input?.runId);
  const runEval = dependencies?.runEval ?? runLiveMemoryEval;
  const createAuthorization =
    dependencies?.createAuthorization ?? createRetrievalPromotionAuthorization;
  const writeFileImpl = dependencies?.writeFileImpl ?? writeFile;
  const scenarioIds = resolvePhase17ScenarioIds(input?.scenarioIds);

  const sharedInput = {
    caseIds: input?.caseIds,
    limit: input?.limit,
    rememberExtractionStrategy: input?.rememberExtractionStrategy ?? "auto",
    scenarioIds,
    strategies: input?.strategies ?? ["rules-only", "hybrid"],
  } satisfies FixtureEvalOptions;

  const observe = await runEval({
    ...sharedInput,
    outputDir: join(outputDir, "observe"),
    runId: resolvePhase17RunId(baseRunId, "observe"),
    strategyRollout: {
      family: "retrieval",
      mode: "observe",
      promotedStrategy: "rules-only",
    },
  });
  const assist = await runEval({
    ...sharedInput,
    outputDir: join(outputDir, "assist"),
    runId: resolvePhase17RunId(baseRunId, "assist"),
    strategyRollout: {
      family: "retrieval",
      mode: "assist",
      promotedStrategy: "rules-only",
    },
  });

  assertObserveAssistPromotionChain({
    assist: {
      runDirectory: assist.runDirectory,
      runId: assist.runId,
      summary: assist.summary,
    },
    observe: {
      runDirectory: observe.runDirectory,
      runId: observe.runId,
      summary: observe.summary,
    },
  });

  const authorization = createAuthorization({
    generatedBy: "scripts/run-phase-17-live-memory.ts",
    observe: {
      runDirectory: observe.runDirectory,
      runId: observe.runId,
      summary: observe.summary,
    },
    runDirectory: assist.runDirectory,
    runId: assist.runId,
    summary: assist.summary,
  });
  const authorizationPath = join(
    assist.runDirectory,
    "strategy-promotion-authorization.json",
  );
  await writeFileImpl(
    authorizationPath,
    `${JSON.stringify(authorization, null, 2)}\n`,
    "utf8",
  );

  return {
    assist,
    authorization,
    authorizationPath,
    observe,
    outputDir,
  };
}

function parsePhase17LiveMemoryCliOptions(
  argv: string[],
): Phase17LiveMemoryOptions {
  const limitValue = resolveFlagValue(argv, "--limit");

  return {
    limit: limitValue ? Number(limitValue) : undefined,
    outputDir: resolveFlagValue(argv, "--output-dir"),
    runId: resolveFlagValue(argv, "--run-id"),
    scenarioIds: resolveRepeatedFlagValues(argv, "--scenario-id"),
  };
}

async function main(): Promise<void> {
  const parsedOptions = parsePhase17LiveMemoryCliOptions(process.argv);
  const options = {
    ...parsedOptions,
    runId: resolvePhase17BaseRunId(parsedOptions.runId),
  } satisfies Phase17LiveMemoryOptions;
  let gateError: unknown;
  void runPhase17LiveMemoryGate(options).catch((error) => {
    gateError = error;
  });

  const summary = await waitForPersistedPhase17LiveMemoryCliSummary(options, {
    getGateError: () => gateError,
  });
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.main) {
  await main();
  process.exit(0);
}
