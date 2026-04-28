import { join } from "node:path";
import { createInternalGoodMemory } from "../src/api/createGoodMemory";
import type { GoodMemory } from "../src/api/contracts";
import type { MemoryScope } from "../src/domain/scope";
import {
  createImplicitMemBenchLiveDependencies,
  type ImplicitMemBenchResearchDependencies,
  type ImplicitMemBenchResearchProfile,
} from "../src/eval/implicitmembench-research";
import {
  createProviderEmbeddingAdapter,
  createProviderMemoryExtractor,
} from "../src/provider/layer";
import type { AISDKModelConfig } from "../src/provider/ai-sdk-runtime";
import { resolveCliFlagValue } from "./cli-options";
import {
  resolveLiveModelConfig,
  resolveProviderBackedModelConfig,
} from "./run-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase49CliOptions {
  benchmarkRoot?: string;
  limit?: number;
  outputDir?: string;
  runId?: string;
  smoke: boolean;
}

export interface Phase49LiveDependencyFactories {
  createEmbeddingAdapter?: typeof createProviderEmbeddingAdapter;
  createMemory?: typeof createInternalGoodMemory;
  createMemoryExtractor?: typeof createProviderMemoryExtractor;
}

export function resolvePhase49FixtureRoot(root: string): string {
  return join(root, "fixtures/implicitmembench-research");
}

export function resolvePhase49AdapterManifestPath(root: string): string {
  return join(resolvePhase49FixtureRoot(root), "adapter-manifest.json");
}

export function resolvePhase49SmokeBenchmarkRoot(root: string): string {
  return resolvePhase49FixtureRoot(root);
}

export function resolvePhase49BaselineOutputDir(root: string): string {
  return join(root, "reports/eval/research/phase-49/baseline");
}

export function resolvePhase49GoodMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/research/phase-49/goodmemory");
}

export function resolvePhase49ComparisonOutputDir(root: string): string {
  return join(root, "reports/eval/research/phase-49");
}

function parseLimit(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("--limit must be a positive integer");
  }

  return parsed;
}

export function parsePhase49CliOptions(
  argv: readonly string[],
): Phase49CliOptions {
  return {
    benchmarkRoot:
      resolveCliFlagValue(argv, "--benchmark-root") ??
      process.env.GOODMEMORY_IMPLICITMEMBENCH_ROOT,
    limit: parseLimit(resolveCliFlagValue(argv, "--limit")),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    smoke: argv.includes("--smoke"),
  };
}

function buildPhase49AutoStorageMemoryFactory(input: {
  createEmbeddingAdapter: typeof createProviderEmbeddingAdapter;
  createMemory: typeof createInternalGoodMemory;
  createMemoryExtractor: typeof createProviderMemoryExtractor;
  embeddingModel: AISDKModelConfig;
  extractorModel: AISDKModelConfig;
}): (input: {
  profile: ImplicitMemBenchResearchProfile;
  scope: MemoryScope;
}) => GoodMemory {
  return () =>
    input.createMemory(
      {
        adapters: {
          assistedExtractor: input.createMemoryExtractor({
            model: input.extractorModel,
          }),
          embeddingAdapter: input.createEmbeddingAdapter({
            model: input.embeddingModel,
          }),
        },
      },
      {
        behavioralOutcomeRecorder: true,
      },
    );
}

export function resolvePhase49LiveDependencies(
  dependencies?: Phase49LiveDependencyFactories,
): ImplicitMemBenchResearchDependencies {
  const evalModel = resolveLiveModelConfig("GOODMEMORY_EVAL");
  const judgeModel = resolveLiveModelConfig("GOODMEMORY_JUDGE");
  const embeddingModel = resolveProviderBackedModelConfig("GOODMEMORY_EMBEDDING");
  const extractorModel = resolveProviderBackedModelConfig(
    "GOODMEMORY_ASSISTED_EXTRACTOR",
  );

  return createImplicitMemBenchLiveDependencies({
    answerModel: evalModel,
    createMemory: buildPhase49AutoStorageMemoryFactory({
      createEmbeddingAdapter:
        dependencies?.createEmbeddingAdapter ?? createProviderEmbeddingAdapter,
      createMemory: dependencies?.createMemory ?? createInternalGoodMemory,
      createMemoryExtractor:
        dependencies?.createMemoryExtractor ?? createProviderMemoryExtractor,
      embeddingModel,
      extractorModel,
    }),
    judgeModel,
  });
}

export function resolvePhase49RepoRoot(): string {
  return resolveRepoRootFromScriptUrl(import.meta.url);
}
