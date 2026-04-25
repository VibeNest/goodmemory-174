import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { listScenarioFixtures } from "../src/eval/dataset";
import type { ScenarioFixture } from "../src/eval/dataset";
import type { EvalRuntimeMetadata } from "../src/eval/contracts";
import {
  buildPhase27DeterministicReport,
  createPhase27FallbackCreateMemory,
  inspectPhase27FallbackReferenceSetup,
  resolvePhase27FallbackScenarioIds,
  runPhase27CodexHandoffFamily,
} from "../src/eval/phase27";
import type {
  Phase27ContractCheck,
  Phase27PublicSurfacePurityMetric,
  Phase27ReferenceSetupMetric,
} from "../src/eval/phase27";
import type { EvalAnswerGeneratorInput } from "../src/eval/runners";
import { findAffirmedSignals } from "../src/eval/signalMatching";
import { runEvalSuite } from "../src/eval/suite";
import {
  createFallbackAdapterDescriptor,
  createProviderRuntimeMetadata,
} from "../src/provider/layer";
import {
  buildFallbackGoodMemoryAnswer,
  buildFallbackJudgeContent,
  resolveFlagValue,
  resolveRepeatedFlagValues,
} from "./run-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase27EvalOptions {
  limit?: number;
  outputDir?: string;
  runId?: string;
  scenarioIds?: string[];
}

export interface Phase27EvalDependencies {
  ensureDir?: (path: string) => Promise<void>;
  loadScenarios?: (scenarioDir: string) => Promise<ScenarioFixture[]>;
  buildPublicSurfacePurityMetric?: (
    root: string,
  ) => Promise<Phase27PublicSurfacePurityMetric>;
  buildReferenceSetupMetric?: (root: string) => Phase27ReferenceSetupMetric;
  now?: () => string;
  runCodexHandoffFamily?: typeof runPhase27CodexHandoffFamily;
  runSuite?: typeof runEvalSuite;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

const GENERATED_BY = "scripts/run-phase-27-eval.ts";
const PHASE27_PUBLIC_SURFACE_FILES = [
  "README.md",
  "docs/GoodMemory-Reference-Integration-Guide.md",
  "docs/GoodMemory-Codex-Handoff-Setup-Guide.md",
  "examples/basic-chat.ts",
  "examples/coding-agent.ts",
  "examples/host-claude-artifacts.ts",
  "examples/host-codex-handoff.ts",
  "examples/vercel-ai-chat.ts",
  "tests/consumers/reference-package-smoke/smoke.mjs",
  "tests/consumers/reference-package-smoke/smoke-types.ts",
] as const;
const PHASE27_ALLOWED_PACKAGE_IMPORTS = [
  "goodmemory",
  "goodmemory/ai-sdk",
  "goodmemory/host",
  "goodmemory/http",
] as const;
const PHASE27_ALLOWED_TYPE_PACKAGE_IMPORTS = [
  "goodmemory",
  "goodmemory/ai-sdk",
  "goodmemory/host",
  "goodmemory/http",
] as const;

function uniqueSignals(signals: readonly string[]): string[] {
  return [...new Set(signals)];
}

function buildVisibleTranscriptContext(
  input: EvalAnswerGeneratorInput,
): string {
  const candidateSignals = uniqueSignals([
    ...input.scenario.evaluation.expected_identity_signals,
    ...input.scenario.evaluation.expected_history_signals,
    ...input.scenario.evaluation.expected_transfer_signals,
    ...input.scenario.evaluation.expected_update_wins,
  ]);
  const surfacedSignals = findAffirmedSignals(candidateSignals, input.transcript);

  if (surfacedSignals.length === 0) {
    return "";
  }

  return [
    "Visible transcript context:",
    ...surfacedSignals.map((signal) => `- ${signal}`),
  ].join("\n");
}

function buildPhase27BaselineAnswer(
  input: EvalAnswerGeneratorInput,
): string {
  const memoryContext = buildVisibleTranscriptContext(input);
  if (!memoryContext) {
    return "I need more context before I can answer reliably.";
  }

  return buildFallbackGoodMemoryAnswer({
    ...input,
    memoryContext,
  });
}

function buildPhase27GoodMemoryAnswer(
  input: EvalAnswerGeneratorInput,
): string {
  return buildFallbackGoodMemoryAnswer(input);
}

function buildPhase27FallbackRuntime(): EvalRuntimeMetadata {
  return {
    ...createProviderRuntimeMetadata({
      generation: createFallbackAdapterDescriptor(),
      judge: createFallbackAdapterDescriptor(),
    }),
    memoryBackend: "sqlite",
    embeddingEnabled: false,
    assistedExtractionEnabled: false,
  };
}

function buildPhase27FallbackRunId(timestamp: string): string {
  const digits = timestamp.replace(/\D/g, "");
  return `run-${digits.slice(0, 17)}`;
}

function buildCheck(
  name: string,
  passed: boolean,
  details: string,
): Phase27ContractCheck {
  return {
    details,
    name,
    passed,
  };
}

export function buildPhase27ReferenceSetupMetric(
  root: string,
): Phase27ReferenceSetupMetric {
  const referenceSetup = inspectPhase27FallbackReferenceSetup(root);
  const checks = [
    buildCheck(
      "public-default-entrypoint",
      referenceSetup.createMemoryEntrypoint === "createGoodMemory({})",
      `Deterministic createMemory entrypoint: ${referenceSetup.createMemoryEntrypoint}.`,
    ),
    buildCheck(
      "no-explicit-storage",
      !referenceSetup.explicitStorageConfigured,
      referenceSetup.explicitStorageConfigured
        ? "Deterministic createMemory configured explicit storage."
        : "Deterministic createMemory passes no explicit storage config.",
    ),
    buildCheck(
      "no-explicit-adapters",
      !referenceSetup.explicitAdaptersConfigured,
      referenceSetup.explicitAdaptersConfigured
        ? "Deterministic createMemory configured explicit adapters."
        : "Deterministic createMemory passes no explicit adapters.",
    ),
    buildCheck(
      "local-default-sqlite",
      referenceSetup.runtimeStorage === "local-default-sqlite",
      referenceSetup.resolvedSqliteUrl
        ? `Resolved runtime storage: ${referenceSetup.runtimeStorage} at ${referenceSetup.resolvedSqliteUrl}.`
        : `Resolved runtime storage: ${referenceSetup.runtimeStorage}.`,
    ),
    buildCheck(
      "rules-only-defaults",
      !referenceSetup.embeddingEnabled && !referenceSetup.assistedExtractionEnabled,
      `Embedding enabled: ${referenceSetup.embeddingEnabled}; assisted extraction enabled: ${referenceSetup.assistedExtractionEnabled}.`,
    ),
  ];

  return {
    assistedExtractionEnabled: referenceSetup.assistedExtractionEnabled,
    checks,
    createMemoryEntrypoint: referenceSetup.createMemoryEntrypoint,
    embeddingEnabled: referenceSetup.embeddingEnabled,
    explicitAdaptersConfigured: referenceSetup.explicitAdaptersConfigured,
    explicitStorageConfigured: referenceSetup.explicitStorageConfigured,
    passed: checks.every((check) => check.passed),
    runtimeStorage: referenceSetup.runtimeStorage,
    threshold:
      "Deterministic Phase 27 setup must use createGoodMemory({}) on the local-first default runtime with rules-only behavior.",
  };
}

export async function buildPhase27PublicSurfacePurityMetric(
  root: string,
): Promise<Phase27PublicSurfacePurityMetric> {
  const checks: Phase27ContractCheck[] = [];

  for (const relativePath of PHASE27_PUBLIC_SURFACE_FILES) {
    const content = await readFile(join(root, relativePath), "utf8");
    const hasInternalImport =
      content.includes("../src") || content.includes("../../src");
    checks.push(
      buildCheck(
        `public-imports:${relativePath}`,
        !hasInternalImport,
        hasInternalImport
          ? `${relativePath} references repo-internal source paths.`
          : `${relativePath} stays on public package/docs paths.`,
      ),
    );
  }

  const smokeSource = await readFile(
    join(root, "tests/consumers/reference-package-smoke/smoke.mjs"),
    "utf8",
  );
  const importSpecifiers = [...smokeSource.matchAll(/from "([^"]+)"/g)].map(
    (match) => match[1],
  );
  const smokeTypesSource = await readFile(
    join(root, "tests/consumers/reference-package-smoke/smoke-types.ts"),
    "utf8",
  );
  const smokeTypeImportSpecifiers = [
    ...smokeTypesSource.matchAll(/from "([^"]+)"/g),
  ].map((match) => match[1]);
  const uniqueSmokeTypeImportSpecifiers = [
    ...new Set(smokeTypeImportSpecifiers),
  ];
  checks.push(
    buildCheck(
      "package-boundary-imports",
      JSON.stringify(importSpecifiers) ===
        JSON.stringify(PHASE27_ALLOWED_PACKAGE_IMPORTS),
      `Package-boundary smoke imports: ${importSpecifiers.join(", ")}`,
    ),
  );
  checks.push(
    buildCheck(
      "package-boundary-type-imports",
      JSON.stringify(uniqueSmokeTypeImportSpecifiers) ===
        JSON.stringify(PHASE27_ALLOWED_TYPE_PACKAGE_IMPORTS),
      `Package-boundary type smoke imports: ${uniqueSmokeTypeImportSpecifiers.join(", ")}`,
    ),
  );

  return {
    allowedImports: [...PHASE27_ALLOWED_PACKAGE_IMPORTS],
    checkedFiles: [...PHASE27_PUBLIC_SURFACE_FILES],
    checks,
    packageBoundarySmoke: "package-name-imports",
    passed: checks.every((check) => check.passed),
    threshold:
      "Canonical Phase 27 docs, examples, and consumer smoke must stay on public package imports and avoid repo-internal source paths.",
  };
}

export function resolvePhase27FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-27");
}

export function parsePhase27EvalCliOptions(
  argv: readonly string[],
): Phase27EvalOptions {
  const args = [...argv];
  const limitValue = resolveFlagValue(args, "--limit");

  return {
    limit: limitValue ? Number(limitValue) : undefined,
    outputDir: resolveFlagValue(args, "--output-dir"),
    runId: resolveFlagValue(args, "--run-id"),
    scenarioIds: resolveRepeatedFlagValues(args, "--scenario-id"),
  };
}

export async function runPhase27FallbackEval(
  input?: Phase27EvalOptions,
  dependencies?: Phase27EvalDependencies,
) {
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
  const buildReferenceSetupMetric =
    dependencies?.buildReferenceSetupMetric ?? buildPhase27ReferenceSetupMetric;
  const buildPublicSurfacePurityMetric =
    dependencies?.buildPublicSurfacePurityMetric ??
    buildPhase27PublicSurfacePurityMetric;
  const runSuite = dependencies?.runSuite ?? runEvalSuite;
  const runCodexHandoffFamily =
    dependencies?.runCodexHandoffFamily ?? runPhase27CodexHandoffFamily;

  const outputDir = input?.outputDir ?? resolvePhase27FallbackOutputDir(root);
  const generatedAt = now();
  const runId = input?.runId ?? buildPhase27FallbackRunId(generatedAt);
  const runDirectory = join(outputDir, runId);
  const scenarioIds = resolvePhase27FallbackScenarioIds(input?.scenarioIds);
  const scenarioDir = join(root, "fixtures/scenarios/eval");

  await ensureDir(runDirectory);

  const suiteResult = await runSuite({
    mode: "fallback",
    personaDir: join(root, "fixtures/personas/eval"),
    scenarioDir,
    outputDir: runDirectory,
    runId: "suite",
    limit: input?.limit,
    scenarioIds,
    strategies: ["rules-only"],
    rememberExtractionStrategy: "auto",
    createMemory: createPhase27FallbackCreateMemory(),
    baselineGenerator: async (payload) => ({
      content: buildPhase27BaselineAnswer(payload),
    }),
    goodmemoryGenerator: async (payload) => ({
      content: buildPhase27GoodMemoryAnswer(payload),
    }),
    judge: {
      async complete({ prompt }: { prompt: string }) {
        return {
          content: buildFallbackJudgeContent(prompt),
        };
      },
    },
    runtime: buildPhase27FallbackRuntime(),
  });

  const scenarios = (await loadScenarios(scenarioDir)).filter((scenario) =>
    scenarioIds.includes(scenario.scenario_id),
  );
  const handoffSummary = await runCodexHandoffFamily();
  const referenceSetup = buildReferenceSetupMetric(root);
  const publicSurfacePurity = await buildPublicSurfacePurityMetric(root);
  const report = buildPhase27DeterministicReport({
    generatedAt,
    generatedBy: GENERATED_BY,
    handoffSummary,
    outputDir,
    publicSurfacePurity,
    referenceSetup,
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
  const report = await runPhase27FallbackEval(
    parsePhase27EvalCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));

  if (!report.summary.accepted) {
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
