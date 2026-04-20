import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createGoodMemory } from "goodmemory";
import type { EvalRuntimeMetadata } from "../src/eval/contracts";
import { listScenarioFixtures, type ScenarioFixture } from "../src/eval/dataset";
import {
  buildPhase27LiveMemoryReport,
  resolvePhase27LiveScenarioIds,
  type Phase27LiveMemoryReport,
} from "../src/eval/phase27";
import {
  buildEvalUserId,
  buildEvalWorkspaceId,
} from "../src/eval/runners";
import { runEvalSuite } from "../src/eval/suite";
import {
  createProviderJudgeModel,
  createProviderRuntimeMetadata,
  createProviderTextGenerator,
} from "../src/provider/layer";
import type { AISDKModelConfig } from "../src/provider/ai-sdk-runtime";
import { canBootstrapPostgresStorageBackend } from "../src/storage/postgres";
import {
  buildLiveGoodMemorySystemPrompt,
  resolveEvalMaxConcurrency,
  resolveFlagValue,
  resolveLiveModelConfig,
  resolveProviderBackedModelConfig,
  resolveRepeatedFlagValues,
  type FixtureEvalOptions,
} from "./run-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase27LiveMemoryOptions extends FixtureEvalOptions {
  runId?: string;
}

export interface Phase27LiveMemoryDependencies {
  assertProviderBackedStorage?: (postgresUrl: string) => Promise<void>;
  ensureDir?: (path: string) => Promise<void>;
  loadScenarios?: (scenarioDir: string) => Promise<ScenarioFixture[]>;
  now?: () => string;
  runSuite?: typeof runEvalSuite;
  writeTextFile?: (path: string, content: string) => Promise<void>;
  createJudgeModel?: typeof createProviderJudgeModel;
  createMemory?: typeof createGoodMemory;
  createTextGenerator?: typeof createProviderTextGenerator;
}

const GENERATED_BY = "scripts/run-phase-27-live-memory.ts";

function resolvePostgresUrl(): string {
  const postgresUrl = process.env.GOODMEMORY_TEST_POSTGRES_URL;
  if (!postgresUrl || postgresUrl.trim().length === 0) {
    throw new Error(
      "Missing required provider-backed eval environment variables: GOODMEMORY_TEST_POSTGRES_URL",
    );
  }

  return postgresUrl;
}

async function assertPhase27ProviderBackedStorage(
  postgresUrl: string,
): Promise<void> {
  let usable = false;

  try {
    usable = await canBootstrapPostgresStorageBackend({
      url: postgresUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : String(error);
    throw new Error(
      [
        "Phase 27 live provider-backed evidence requires a bootstrap-usable Postgres backend.",
        "Silent sqlite fallback is not acceptable for provider-backed closure evidence.",
        `Underlying error: ${message}`,
      ].join(" "),
    );
  }

  if (!usable) {
    throw new Error(
      [
        "Phase 27 live provider-backed evidence requires a bootstrap-usable Postgres backend.",
        "Auto fallback to sqlite would invalidate provider-backed runtime metadata.",
      ].join(" "),
    );
  }
}

async function withPhase27LiveProviderStorageEnv<T>(
  postgresUrl: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previousStorageProvider = process.env.GOODMEMORY_STORAGE_PROVIDER;
  const previousStorageUrl = process.env.GOODMEMORY_STORAGE_URL;

  process.env.GOODMEMORY_STORAGE_PROVIDER = "postgres";
  process.env.GOODMEMORY_STORAGE_URL = postgresUrl;

  try {
    return await operation();
  } finally {
    if (previousStorageProvider === undefined) {
      delete process.env.GOODMEMORY_STORAGE_PROVIDER;
    } else {
      process.env.GOODMEMORY_STORAGE_PROVIDER = previousStorageProvider;
    }

    if (previousStorageUrl === undefined) {
      delete process.env.GOODMEMORY_STORAGE_URL;
    } else {
      process.env.GOODMEMORY_STORAGE_URL = previousStorageUrl;
    }
  }
}

function buildPhase27LiveRuntime(input: {
  evalModel: AISDKModelConfig;
  judgeModel: AISDKModelConfig;
}): EvalRuntimeMetadata {
  return {
    ...createProviderRuntimeMetadata({
      generation: {
        adapterId: "live-adapter",
        mode: "live",
        providerId: input.evalModel.provider,
        modelId: input.evalModel.model,
      },
      judge: {
        adapterId: "live-adapter",
        mode: "live",
        providerId: input.judgeModel.provider,
        modelId: input.judgeModel.model,
      },
    }),
    memoryBackend: "provider-backed",
    embeddingEnabled: true,
    assistedExtractionEnabled: true,
    generationProviderId: input.evalModel.provider,
    generationModelId: input.evalModel.model,
    judgeProviderId: input.judgeModel.provider,
    judgeModelId: input.judgeModel.model,
    recallRouterProviderId: undefined,
    recallRouterModelId: undefined,
  };
}

export function resolvePhase27LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-27");
}

export function parsePhase27LiveMemoryCliOptions(
  argv: readonly string[],
): Phase27LiveMemoryOptions {
  const args = [...argv];
  const limitValue = resolveFlagValue(args, "--limit");

  return {
    limit: limitValue ? Number(limitValue) : undefined,
    outputDir: resolveFlagValue(args, "--output-dir"),
    runId: resolveFlagValue(args, "--run-id"),
    scenarioIds: resolveRepeatedFlagValues(args, "--scenario-id"),
  };
}

export async function runPhase27LiveMemoryEval(
  input?: Phase27LiveMemoryOptions,
  dependencies?: Phase27LiveMemoryDependencies,
): Promise<Phase27LiveMemoryReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const ensureDir = dependencies?.ensureDir ?? (async (path: string) => {
    await mkdir(path, { recursive: true });
  });
  const writeTextFile = dependencies?.writeTextFile ?? (async (
    path: string,
    content: string,
  ) => {
    await writeFile(path, content);
  });
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const loadScenarios = dependencies?.loadScenarios ?? listScenarioFixtures;
  const runSuite = dependencies?.runSuite ?? runEvalSuite;
  const evalModel = resolveLiveModelConfig("GOODMEMORY_EVAL");
  const judgeModel = resolveLiveModelConfig("GOODMEMORY_JUDGE");
  resolveProviderBackedModelConfig("GOODMEMORY_EMBEDDING");
  resolveProviderBackedModelConfig(
    "GOODMEMORY_ASSISTED_EXTRACTOR",
  );
  const createTextGenerator =
    dependencies?.createTextGenerator ?? createProviderTextGenerator;
  const createJudgeModel =
    dependencies?.createJudgeModel ?? createProviderJudgeModel;
  const createMemory = dependencies?.createMemory ?? createGoodMemory;
  const assertProviderBackedStorage =
    dependencies?.assertProviderBackedStorage ?? assertPhase27ProviderBackedStorage;

  const outputDir = input?.outputDir ?? resolvePhase27LiveMemoryOutputDir(root);
  const generatedAt = now();
  const runId = input?.runId ?? `run-${generatedAt.replace(/\D/g, "").slice(0, 17)}`;
  const runDirectory = join(outputDir, runId);
  const scenarioIds = resolvePhase27LiveScenarioIds(input?.scenarioIds);
  const scenarioDir = join(root, "fixtures/scenarios/eval");
  const postgresUrl = resolvePostgresUrl();

  await assertProviderBackedStorage(postgresUrl);
  await ensureDir(runDirectory);

  const suiteResult = await withPhase27LiveProviderStorageEnv(postgresUrl, async () =>
    runSuite({
      mode: "live",
      personaDir: join(root, "fixtures/personas/eval"),
      scenarioDir,
      outputDir: runDirectory,
      runId: "suite",
      limit: input?.limit,
      scenarioIds,
      strategies: ["rules-only"],
      rememberExtractionStrategy: input?.rememberExtractionStrategy ?? "auto",
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
      createMemory: ({ persona, scopeNamespace }) => {
        const memory = createMemory({});

        return {
          memory,
          cleanup: async () => {
            await memory.deleteAllMemory({
              scope: {
                userId: buildEvalUserId(persona, scopeNamespace),
                workspaceId: buildEvalWorkspaceId(persona, scopeNamespace),
              },
              includeRuntime: true,
            });
          },
        };
      },
      maxConcurrency: resolveEvalMaxConcurrency(),
      runtime: buildPhase27LiveRuntime({
        evalModel,
        judgeModel,
      }),
    }),
  );

  const scenarios = (await loadScenarios(scenarioDir)).filter((scenario) =>
    scenarioIds.includes(scenario.scenario_id),
  );
  const report = buildPhase27LiveMemoryReport({
    generatedAt,
    generatedBy: GENERATED_BY,
    outputDir,
    runDirectory,
    runId,
    scenarios,
    suiteResult,
  });

  await writeTextFile(
    join(runDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

async function main(): Promise<void> {
  const report = await runPhase27LiveMemoryEval(
    parsePhase27LiveMemoryCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
