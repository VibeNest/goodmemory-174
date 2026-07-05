/**
 * P5 BEAM general-lever recall remeasure.
 *
 * Runs one recall-diagnostic arm through the committed Phase 63 diagnostic seam.
 * By default it disables every registered narrow gate so the run measures the
 * BEAM generalization floor, not the fitted 0.9621 checkpoint.
 */
import type { GoodMemory } from "../src/api/contracts";
import type {
  BeamProfile,
  BeamProfileSummary,
  BeamReport,
} from "../src/eval/beam";
import type {
  Phase63BeamRecallDiagnosticCliOptions,
  Phase63BeamRecallDiagnosticDependencies,
} from "./run-phase-63-beam-recall-diagnostic";
import { createGoodMemory } from "../src/api/createGoodMemory";
import { createProviderEmbeddingAdapter } from "../src/provider/layer";
import { createDeterministicMemoryExtractor } from "../src/remember/deterministicExtractor";
import {
  __resetNarrowGateDisablesForTest,
  listRegisteredNarrowGateIds,
} from "../src/recall/narrowGates";
import {
  assertCliPathSegmentValue,
  hasCliFlagStrict,
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "./cli-options";
import {
  runPhase63BeamRecallDiagnostic,
} from "./run-phase-63-beam-recall-diagnostic";

export const BEAM_GENERAL_LEVER_ARM_NAMES = [
  "floor",
  "bm25",
  "union16",
  "bm25-union16",
] as const;

export type BeamGeneralLeverArmName =
  (typeof BEAM_GENERAL_LEVER_ARM_NAMES)[number];

export interface BeamGeneralLeverCliOptions {
  arm: BeamGeneralLeverArmName;
  benchmarkRoot?: string;
  keepGates: boolean;
  limit?: number;
  outputDir?: string;
  runId?: string;
  semanticTopK: number;
}

export interface BeamGeneralLeverCliSummary {
  arm: BeamGeneralLeverArmName;
  gatesDisabled: boolean;
  profile: BeamProfile;
  runId: string;
  semanticTopK: number | null;
  summary: BeamProfileSummary | undefined;
}

export type BeamGeneralLeverRecallDiagnosticRunner = (
  options: Phase63BeamRecallDiagnosticCliOptions,
  dependencies?: Phase63BeamRecallDiagnosticDependencies,
) => Promise<BeamReport>;

export interface BeamGeneralLeverRunDependencies {
  env?: Record<string, string | undefined>;
  listNarrowGateIds?: () => string[];
  log?: (message: string) => void;
  resetNarrowGateDisables?: () => void;
  runRecallDiagnostic?: BeamGeneralLeverRecallDiagnosticRunner;
}

interface ArmSpec {
  createMemory: () => GoodMemory;
  profile: "goodmemory-rules-only" | "goodmemory-hybrid";
}

const EMBEDDING_ENV_KEYS = [
  "GOODMEMORY_EMBEDDING_API_KEY",
  "GOODMEMORY_EMBEDDING_BASE_URL",
  "GOODMEMORY_EMBEDDING_MODEL",
  "GOODMEMORY_EMBEDDING_PROVIDER",
] as const;

function parsePositiveIntegerFlag(
  argv: readonly string[],
  flag: string,
): number | undefined {
  const raw = resolveCliFlagValueStrict(argv, flag);
  if (raw === undefined) {
    return undefined;
  }
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return value;
}

export function parseBeamGeneralLeverArmName(
  raw: string | undefined,
): BeamGeneralLeverArmName {
  if (
    raw !== undefined &&
    (BEAM_GENERAL_LEVER_ARM_NAMES as readonly string[]).includes(raw)
  ) {
    return raw as BeamGeneralLeverArmName;
  }
  throw new Error(
    `--arm must be one of: ${BEAM_GENERAL_LEVER_ARM_NAMES.join(", ")}`,
  );
}

export function parseBeamGeneralLeverCliOptions(
  argv: readonly string[],
): BeamGeneralLeverCliOptions {
  return {
    arm: parseBeamGeneralLeverArmName(resolveCliFlagValueStrict(argv, "--arm")),
    benchmarkRoot: resolveCliFlagValueStrict(argv, "--benchmark-root"),
    keepGates: hasCliFlagStrict(argv, "--keep-gates"),
    limit: parsePositiveIntegerFlag(argv, "--limit"),
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir"),
    runId: resolveCliPathSegmentFlagValueStrict(argv, "--run-id"),
    semanticTopK: parsePositiveIntegerFlag(argv, "--semantic-topk") ?? 16,
  };
}

function withEmbeddingEnvDisabled<T>(factory: () => T): T {
  const previous = Object.fromEntries(
    EMBEDDING_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<(typeof EMBEDDING_ENV_KEYS)[number], string | undefined>;
  try {
    for (const key of EMBEDDING_ENV_KEYS) {
      delete process.env[key];
    }
    return factory();
  } finally {
    for (const key of EMBEDDING_ENV_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

function createLeverMemory(input: {
  bm25: boolean;
  env: Record<string, string | undefined>;
  idPrefix?: string;
  providerEmbedding: boolean;
  union?: { topK: number };
}): GoodMemory {
  let idCounter = 0;
  let clockTick = 0;
  const extractor = createDeterministicMemoryExtractor();
  const createMemory = () =>
    createGoodMemory({
      adapters: {
        // Keep diagnostics independent from partial assisted-extractor env in the
        // invoking shell. The runner seeds all BEAM turns via rules-only
        // annotations, so this does not add LLM extraction.
        assistedExtractor: extractor,
        ...(input.providerEmbedding
          ? {
              embeddingAdapter: createProviderEmbeddingAdapter({
                model: {
                  apiKey: input.env.GOODMEMORY_EMBEDDING_API_KEY,
                  baseURL: input.env.GOODMEMORY_EMBEDDING_BASE_URL,
                  model:
                    input.env.GOODMEMORY_EMBEDDING_MODEL ??
                    "text-embedding-3-small",
                  provider: "openai",
                },
              }),
            }
          : {}),
      },
      retrieval: {
        ...(input.bm25 ? { bm25Ranking: true } : {}),
        ...(input.union
          ? { semanticCandidates: { topK: input.union.topK } }
          : {}),
      },
      storage: { provider: "memory" },
      testing: {
        createId: () =>
          `${input.idPrefix ?? "beam-diagnostic"}-${String((idCounter += 1)).padStart(6, "0")}`,
        extractor,
        now: () =>
          new Date(Date.UTC(2026, 0, 1, 0, 0, 0, (clockTick += 1))),
      },
    });

  return input.providerEmbedding
    ? createMemory()
    : withEmbeddingEnvDisabled(createMemory);
}

function resolveArmSpec(input: {
  arm: BeamGeneralLeverArmName;
  env: Record<string, string | undefined>;
  semanticTopK: number;
}): ArmSpec {
  switch (input.arm) {
    case "floor":
      return {
        createMemory: () =>
          createLeverMemory({
            bm25: false,
            env: input.env,
            providerEmbedding: false,
          }),
        profile: "goodmemory-rules-only",
      };
    case "bm25":
      return {
        createMemory: () =>
          createLeverMemory({
            bm25: true,
            env: input.env,
            providerEmbedding: false,
          }),
        profile: "goodmemory-hybrid",
      };
    case "union16":
      return {
        createMemory: () =>
          createLeverMemory({
            bm25: false,
            env: input.env,
            providerEmbedding: true,
            union: { topK: input.semanticTopK },
          }),
        profile: "goodmemory-hybrid",
      };
    case "bm25-union16":
      return {
        createMemory: () =>
          createLeverMemory({
            bm25: true,
            env: input.env,
            providerEmbedding: true,
            union: { topK: input.semanticTopK },
          }),
        profile: "goodmemory-hybrid",
      };
  }
}

function resolveBenchmarkRoot(input: {
  env: Record<string, string | undefined>;
  value: string | undefined;
}): string {
  if (input.value !== undefined) {
    return input.value;
  }
  if (!input.env.HOME) {
    throw new Error("--benchmark-root is required when HOME is unset.");
  }
  return `${input.env.HOME}/.goodmemory-beam`;
}

function buildDefaultRunId(input: {
  arm: BeamGeneralLeverArmName;
  keepGates: boolean;
  semanticTopK: number;
}): string {
  const armRunId =
    input.arm.includes("union") && input.semanticTopK !== 16
      ? input.arm.replace("union16", `union${input.semanticTopK}`)
      : input.arm;
  return `run-p5-beam-levers-${armRunId}${
    input.keepGates ? "-fitted" : "-generalization"
  }`;
}

export async function runBeamGeneralLeverMeasure(
  options: BeamGeneralLeverCliOptions,
  dependencies: BeamGeneralLeverRunDependencies = {},
): Promise<BeamGeneralLeverCliSummary> {
  const env = dependencies.env ?? process.env;
  const log = dependencies.log ?? console.log;
  const resetNarrowGateDisables =
    dependencies.resetNarrowGateDisables ?? __resetNarrowGateDisablesForTest;
  const benchmarkRoot = resolveBenchmarkRoot({
    env,
    value: options.benchmarkRoot,
  });
  const runId =
    options.runId ??
    buildDefaultRunId({
      arm: options.arm,
      keepGates: options.keepGates,
      semanticTopK: options.semanticTopK,
    });
  assertCliPathSegmentValue({ flag: "--run-id", value: runId });
  const previousDisabledNarrowGates = env.GOODMEMORY_DISABLED_NARROW_GATES;

  if (options.keepGates) {
    delete env.GOODMEMORY_DISABLED_NARROW_GATES;
    resetNarrowGateDisables();
    log("narrow gates enabled (--keep-gates)");
  } else {
    const gateIds =
      dependencies.listNarrowGateIds?.() ?? listRegisteredNarrowGateIds();
    env.GOODMEMORY_DISABLED_NARROW_GATES = gateIds.join(",");
    resetNarrowGateDisables();
    log(`narrow gates disabled: ${gateIds.length}`);
  }

  const spec = resolveArmSpec({
    arm: options.arm,
    env,
    semanticTopK: options.semanticTopK,
  });
  let report: BeamReport;
  try {
    report = await (dependencies.runRecallDiagnostic ??
      runPhase63BeamRecallDiagnostic)(
      {
        benchmarkRoot,
        limit: options.limit,
        outputDir: options.outputDir,
        profiles: [spec.profile],
        runId,
      },
      { createMemory: spec.createMemory },
    );
  } finally {
    if (previousDisabledNarrowGates === undefined) {
      delete env.GOODMEMORY_DISABLED_NARROW_GATES;
    } else {
      env.GOODMEMORY_DISABLED_NARROW_GATES = previousDisabledNarrowGates;
    }
    resetNarrowGateDisables();
  }

  return {
    arm: options.arm,
    gatesDisabled: !options.keepGates,
    profile: spec.profile,
    runId: report.runId,
    semanticTopK: options.arm.includes("union") ? options.semanticTopK : null,
    summary: report.profiles[spec.profile]?.summary,
  };
}

export async function main(
  argv: readonly string[] = Bun.argv,
  dependencies?: BeamGeneralLeverRunDependencies,
): Promise<void> {
  const summary = await runBeamGeneralLeverMeasure(
    parseBeamGeneralLeverCliOptions(argv),
    dependencies,
  );
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.main) {
  await main();
}
