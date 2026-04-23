import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createGoodMemory,
  rememberRules,
} from "../src";
import { resolveAssistedExtractorModelConfigFromEnv } from "../src/api/runtimeResolution";
import { createProviderMemoryExtractor } from "../src/provider/layer";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase36LiveMemoryOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase36LiveMemoryDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  env?: Record<string, string | undefined>;
  now?: () => string;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase36LiveMemoryReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  evidence: {
    providerBacked: boolean;
    publicConfigOnly: boolean;
    resolvedExtractionStrategy?: string;
    wroteDomainMemory: boolean;
  };
  evidenceContract: {
    phase36: {
      runner: "scripts/run-phase-36-live-memory.ts";
      runtimePath: "provider_backed_public_write_smoke";
    };
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-36-live-memory.ts";
  mode: "live-memory";
  outputDir: string;
  phase: "phase-36";
  runDirectory: string;
  runId: string;
}

const GENERATED_BY = "scripts/run-phase-36-live-memory.ts";
const PHASE36_CANONICAL_LIVE_RUN_ID = "run-phase36-live-current";

export function resolvePhase36LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-36");
}

export function parsePhase36LiveMemoryCliOptions(
  argv: readonly string[],
): Phase36LiveMemoryOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export async function runPhase36LiveMemoryEval(
  options: Phase36LiveMemoryOptions = {},
  dependencies: Phase36LiveMemoryDependencies = {},
): Promise<Phase36LiveMemoryReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = options.outputDir ?? resolvePhase36LiveMemoryOutputDir(root);
  const runId = options.runId ?? PHASE36_CANONICAL_LIVE_RUN_ID;
  const runDirectory = join(outputDir, runId);
  const ensureDir = dependencies.ensureDir ?? mkdir;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const writeTextFile = dependencies.writeTextFile ?? writeFile;

  let report: Phase36LiveMemoryReport;
  try {
    const model = resolveAssistedExtractorModelConfigFromEnv(
      dependencies.env ?? process.env,
    );
    if (!model) {
      report = {
        acceptance: {
          decision: "blocked",
          reason:
            "GOODMEMORY_ASSISTED_EXTRACTOR_* is not configured, so provider-backed Phase 36 live-memory evidence cannot run.",
        },
        evidence: {
          providerBacked: false,
          publicConfigOnly: true,
          wroteDomainMemory: false,
        },
        evidenceContract: {
          phase36: {
            runner: GENERATED_BY,
            runtimePath: "provider_backed_public_write_smoke",
          },
        },
        generatedAt: now(),
        generatedBy: GENERATED_BY,
        mode: "live-memory",
        outputDir,
        phase: "phase-36",
        runDirectory,
        runId,
      };
    } else {
      const memory = createGoodMemory({
        adapters: {
          assistedExtractor: createProviderMemoryExtractor({ model }),
        },
        storage: { provider: "memory" },
        remember: {
          profiles: [
            {
              id: "life-coach",
              when: { agentId: "life-coach" },
              rules: [
                rememberRules.fact(/my top priority this quarter is (.+)/i, {
                  id: "life-goal-priority",
                  category: "goal",
                  tags: ["life_coach", "live_memory"],
                  content: ({ match }) => match[1] ?? "",
                }),
              ],
            },
          ],
        },
      });
      const scope = { agentId: "life-coach", userId: "phase36-live-user" };
      const remember = await memory.remember({
        extractionStrategy: "llm-assisted",
        messages: [
          {
            content:
              "My top priority this quarter is rebuilding my sleep routine.",
            role: "user",
          },
        ],
        scope,
      });
      const exported = await memory.exportMemory({ scope });
      const providerBacked =
        remember.metadata?.resolvedExtractionStrategy === "llm-assisted";
      const wroteDomainMemory =
        exported.durable.facts[0]?.category === "goal" &&
        exported.durable.facts[0]?.tags?.includes("live_memory") === true;
      const accepted = providerBacked && wroteDomainMemory;

      report = {
        acceptance: {
          decision: accepted ? "accepted" : "blocked",
          reason: accepted
            ? "Provider-backed assisted extraction ran while public profile rules wrote domain memory through the normal pipeline."
            : "Provider-backed assisted extraction did not complete or domain memory was not written.",
        },
        evidence: {
          providerBacked,
          publicConfigOnly: true,
          resolvedExtractionStrategy: remember.metadata?.resolvedExtractionStrategy,
          wroteDomainMemory,
        },
        evidenceContract: {
          phase36: {
            runner: GENERATED_BY,
            runtimePath: "provider_backed_public_write_smoke",
          },
        },
        generatedAt: now(),
        generatedBy: GENERATED_BY,
        mode: "live-memory",
        outputDir,
        phase: "phase-36",
        runDirectory,
        runId,
      };
    }
  } catch (error) {
    report = {
      acceptance: {
        decision: "blocked",
        reason: error instanceof Error
          ? error.message
          : "Phase 36 provider-backed live-memory smoke failed.",
      },
      evidence: {
        providerBacked: false,
        publicConfigOnly: true,
        wroteDomainMemory: false,
      },
      evidenceContract: {
        phase36: {
          runner: GENERATED_BY,
          runtimePath: "provider_backed_public_write_smoke",
        },
      },
      generatedAt: now(),
      generatedBy: GENERATED_BY,
      mode: "live-memory",
      outputDir,
      phase: "phase-36",
      runDirectory,
      runId,
    };
  }

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  return report;
}

if (import.meta.main) {
  const report = await runPhase36LiveMemoryEval(
    parsePhase36LiveMemoryCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}
