import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAssistedExtractorModelConfigFromEnv } from "../src/api/runtimeResolution";
import {
  DEFAULT_INSTALLED_HOST_WRITEBACK,
  type InstalledHostModelProviderConfig,
} from "../src/install/hostConfigValidation";
import { executeInstalledHostHook } from "../src/install/hostHookRuntime";
import {
  enableHostWorkspace,
  installHost,
} from "../src/install/hostInstall";
import { executeInstalledHostWriteback } from "../src/install/hostWritebackRuntime";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase37LiveMemoryOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase37LiveMemoryDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  env?: Record<string, string | undefined>;
  makeTempDir?: (prefix: string) => Promise<string>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  removeDir?: (
    path: string,
    options?: {
      force?: boolean;
      recursive?: boolean;
    },
  ) => Promise<void>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase37LiveMemoryReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  evidence: {
    assistantUnconfirmedWritesBlocked: boolean;
    durableStorageProvider: "sqlite";
    host: "codex";
    manualSeedUsed: false;
    nextSessionRecallHit: boolean;
    providerBackedAssistedExtraction: boolean;
    rawTranscriptPersisted: boolean;
    resolvedExtractionStrategies: string[];
    wroteDurableMemory: boolean;
    writebackMode: "selective";
  };
  evidenceContract: {
    phase37: {
      runner: "scripts/run-phase-37-live-memory.ts";
      runtimePath: "provider_backed_assisted_extraction_installed_host_selective_writeback";
    };
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-37-live-memory.ts";
  mode: "live-memory";
  outputDir: string;
  phase: "phase-37";
  runDirectory: string;
  runId: string;
}

const GENERATED_BY = "scripts/run-phase-37-live-memory.ts";
const PHASE37_CANONICAL_LIVE_RUN_ID = "run-phase37-live-current";
const PHASE37_OPEN_LOOP = "Next step is to add the phase-37 live report.";

export function resolvePhase37LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-37");
}

export function parsePhase37LiveMemoryCliOptions(
  argv: readonly string[],
): Phase37LiveMemoryOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function extractHookAdditionalContext(
  output: Record<string, unknown> | null,
): string {
  const hookSpecificOutput = output?.hookSpecificOutput;
  if (!hookSpecificOutput || typeof hookSpecificOutput !== "object") {
    return "";
  }
  if (!("additionalContext" in hookSpecificOutput)) {
    return "";
  }

  const context = hookSpecificOutput.additionalContext;
  return typeof context === "string" ? context : "";
}

function toEnvWithDotEnv(input: {
  env?: Record<string, string | undefined>;
  root: string;
  readTextFile: (path: string) => Promise<string>;
}): Promise<Record<string, string | undefined>> {
  if (input.env) {
    return Promise.resolve(input.env);
  }

  return input.readTextFile(join(input.root, ".env"))
    .then((content) => ({
      ...parseDotEnv(content),
      ...process.env,
    }))
    .catch(() => ({ ...process.env }));
}

function parseDotEnv(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }

  return parsed;
}

function toInstalledHostModelProviderConfig(input: {
  apiKey?: string;
  baseURL?: string;
  model: string;
  provider: "anthropic" | "openai";
}): InstalledHostModelProviderConfig {
  if (!input.apiKey) {
    throw new Error("Assisted extractor provider config is missing apiKey.");
  }

  return {
    apiKey: input.apiKey,
    ...(input.baseURL ? { baseURL: input.baseURL } : {}),
    model: input.model,
    provider: input.provider,
  };
}

function createBlockedReport(input: {
  outputDir: string;
  reason: string;
  runDirectory: string;
  runId: string;
  timestamp: string;
}): Phase37LiveMemoryReport {
  return {
    acceptance: {
      decision: "blocked",
      reason: input.reason,
    },
    evidence: {
      assistantUnconfirmedWritesBlocked: false,
      durableStorageProvider: "sqlite",
      host: "codex",
      manualSeedUsed: false,
      nextSessionRecallHit: false,
      providerBackedAssistedExtraction: false,
      rawTranscriptPersisted: false,
      resolvedExtractionStrategies: [],
      wroteDurableMemory: false,
      writebackMode: "selective",
    },
    evidenceContract: {
      phase37: {
        runner: GENERATED_BY,
        runtimePath: "provider_backed_assisted_extraction_installed_host_selective_writeback",
      },
    },
    generatedAt: input.timestamp,
    generatedBy: GENERATED_BY,
    mode: "live-memory",
    outputDir: input.outputDir,
    phase: "phase-37",
    runDirectory: input.runDirectory,
    runId: input.runId,
  };
}

export async function runPhase37LiveMemoryEval(
  options: Phase37LiveMemoryOptions = {},
  dependencies: Phase37LiveMemoryDependencies = {},
): Promise<Phase37LiveMemoryReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = options.outputDir ?? resolvePhase37LiveMemoryOutputDir(root);
  const runId = options.runId ?? PHASE37_CANONICAL_LIVE_RUN_ID;
  const runDirectory = join(outputDir, runId);
  const ensureDir = dependencies.ensureDir ?? mkdir;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const readTextFile =
    dependencies.readTextFile ??
    ((path: string) => readFile(path, "utf8"));
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const makeTempDir =
    dependencies.makeTempDir ??
    ((prefix: string) => mkdtemp(join(tmpdir(), prefix)));
  const removeDir = dependencies.removeDir ?? rm;
  const timestamp = now();
  const env = await toEnvWithDotEnv({
    env: dependencies.env,
    readTextFile,
    root,
  });

  let report: Phase37LiveMemoryReport;
  try {
    const assistedExtractor = resolveAssistedExtractorModelConfigFromEnv(env);
    if (!assistedExtractor) {
      report = createBlockedReport({
        outputDir,
        reason:
          "GOODMEMORY_ASSISTED_EXTRACTOR_* is not configured, so provider-backed assisted-extraction Phase 37 installed-host writeback evidence cannot run.",
        runDirectory,
        runId,
        timestamp,
      });
    } else {
      const homeRoot = await makeTempDir("goodmemory-phase37-live-home-");
      const workspaceRoot = await makeTempDir(
        "goodmemory-phase37-live-workspace-",
      );
      try {
        const writeback = {
          ...DEFAULT_INSTALLED_HOST_WRITEBACK,
          mode: "selective" as const,
        };
        await installHost({
          activationMode: "workspace_opt_in",
          assistedExtractor: toInstalledHostModelProviderConfig(assistedExtractor),
          homeRoot,
          host: "codex",
          memoryPath: join(homeRoot, ".goodmemory/memory.sqlite"),
          userId: "phase37-live-user",
          writeback,
        });
        await enableHostWorkspace({
          homeRoot,
          host: "codex",
          workspaceRoot,
        });

        const writebackResult = await executeInstalledHostWriteback({
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: PHASE37_OPEN_LOOP,
                role: "user",
              },
            ],
            session_id: "phase37-live-session-1",
          },
        });
        const recall = await executeInstalledHostHook({
          command: "user-prompt-submit",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            prompt: "What should we continue for phase 37?",
            session_id: "phase37-live-session-2",
          },
        });
        const blockedAssistant = await executeInstalledHostWriteback({
          command: "session-end",
          homeRoot,
          host: "codex",
          payload: {
            cwd: workspaceRoot,
            messages: [
              {
                content: "We decided Codex is the canonical installed path.",
                role: "assistant",
              },
            ],
            session_id: "phase37-live-session-3",
          },
        });
        const resolvedExtractionStrategies = Array.isArray(
          writebackResult.trace.resolvedExtractionStrategies,
        )
          ? writebackResult.trace.resolvedExtractionStrategies.filter(
              (value): value is string => typeof value === "string",
            )
          : [];
        const context = extractHookAdditionalContext(recall.output);
        const providerBackedAssistedExtraction =
          resolvedExtractionStrategies.includes("llm-assisted");
        const wroteDurableMemory = writebackResult.wrote;
        const nextSessionRecallHit = context.includes("phase-37 live report");
        const rawTranscriptPersisted =
          writebackResult.trace.rawTranscriptPersisted === true;
        const assistantUnconfirmedWritesBlocked =
          !blockedAssistant.wrote &&
          blockedAssistant.candidates.some(
            (candidate) => candidate.reason === "assistant_policy_blocked",
          );
        const accepted =
          providerBackedAssistedExtraction &&
          wroteDurableMemory &&
          nextSessionRecallHit &&
          !rawTranscriptPersisted &&
          assistantUnconfirmedWritesBlocked;

        report = {
          acceptance: {
            decision: accepted ? "accepted" : "blocked",
            reason: accepted
              ? "Provider-backed assisted extraction ran through Codex installed writeback, wrote selective durable memory, and next-session recall consumed it without manual seeding."
              : "Phase 37 provider-backed assisted-extraction installed-host writeback did not satisfy the live-memory evidence contract.",
          },
          evidence: {
            assistantUnconfirmedWritesBlocked,
            durableStorageProvider: "sqlite",
            host: "codex",
            manualSeedUsed: false,
            nextSessionRecallHit,
            providerBackedAssistedExtraction,
            rawTranscriptPersisted,
            resolvedExtractionStrategies,
            wroteDurableMemory,
            writebackMode: "selective",
          },
          evidenceContract: {
            phase37: {
              runner: GENERATED_BY,
              runtimePath: "provider_backed_assisted_extraction_installed_host_selective_writeback",
            },
          },
          generatedAt: timestamp,
          generatedBy: GENERATED_BY,
          mode: "live-memory",
          outputDir,
          phase: "phase-37",
          runDirectory,
          runId,
        };
      } finally {
        await removeDir(homeRoot, { force: true, recursive: true });
        await removeDir(workspaceRoot, { force: true, recursive: true });
      }
    }
  } catch (error) {
    report = createBlockedReport({
      outputDir,
      reason: error instanceof Error
        ? error.message
        : "Phase 37 provider-backed assisted-extraction installed-host writeback smoke failed.",
      runDirectory,
      runId,
      timestamp,
    });
  }

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  return report;
}

if (import.meta.main) {
  const report = await runPhase37LiveMemoryEval(
    parsePhase37LiveMemoryCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}
