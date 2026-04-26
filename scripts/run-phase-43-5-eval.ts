import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCLI } from "../src/cli";
import type { GoodMemoryScopeDigest } from "../src/observability/contracts";
import {
  createRuntimeWorkerJobEnvelope,
  createRuntimeWorkerQueue,
} from "../src/runtime-worker/public";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase435EvalOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase435EvalDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase435EvalCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runEval?: (options?: Phase435EvalOptions) => Promise<Phase435EvalReport>;
}

export interface Phase435EvalReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  cases: {
    cliSurfacePass: boolean;
    coalescingPass: boolean;
    daemonOptionalPass: boolean;
    drainOnceIdempotencyPass: boolean;
    envelopeRedactionPass: boolean;
    noRootApiWideningPass: boolean;
    recoverDryRunPass: boolean;
    workerFailureIsolationPass: boolean;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-43-5-eval.ts";
  mode: "fallback";
  outputDir: string;
  phase: "phase-43-5";
  runDirectory: string;
  runId: string;
  summary: {
    passCount: number;
    totalChecks: number;
  };
}

const GENERATED_BY = "scripts/run-phase-43-5-eval.ts";
const PHASE435_SCOPE_DIGEST: GoodMemoryScopeDigest = {
  userIdHash: "hmac-sha256:phase435-user",
  workspaceIdHash: "hmac-sha256:phase435-workspace",
  sessionIdHash: "hmac-sha256:phase435-session",
};

export function resolvePhase435FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-43-5");
}

export function buildPhase435FallbackRunId(nowIso: string): string {
  return `run-${nowIso.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "")}`;
}

export function parsePhase435EvalCliOptions(
  argv: readonly string[],
): Phase435EvalOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export async function runPhase435FallbackEval(
  options: Phase435EvalOptions = {},
  dependencies: Phase435EvalDependencies = {},
): Promise<Phase435EvalReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now?.() ?? new Date().toISOString();
  const outputDir = options.outputDir ?? resolvePhase435FallbackOutputDir(root);
  const runId = options.runId ?? buildPhase435FallbackRunId(now);
  const runDirectory = join(outputDir, runId);
  await (dependencies.ensureDir ?? mkdir)(runDirectory, { recursive: true });
  const queueFile = join(runDirectory, "runtime-worker-queue.json");
  const failureQueueFile = join(runDirectory, "runtime-worker-failure-queue.json");
  await rm(queueFile, { force: true });
  await rm(failureQueueFile, { force: true });

  const envelope = createRuntimeWorkerJobEnvelope({
    boundedJob: {
      jobId: "runtime-kit-phase435-candidate",
      operation: "remember",
      payloadPreview:
        "user: phase435@example.com | assistant: use token sk-phase435secret",
      rawTranscriptPersisted: false,
      reason: "after_model_call",
      status: "candidate",
    },
    createdAt: now,
    hostKind: "codex",
    scopeDigest: PHASE435_SCOPE_DIGEST,
    traceId: "phase435-trace",
  });
  const envelopeJson = JSON.stringify(envelope);
  const envelopeRedactionPass =
    envelope.payload.rawTranscriptPersisted === false &&
    envelope.payload.fullAssistantOutputPersisted === false &&
    !envelopeJson.includes("phase435@example.com") &&
    !envelopeJson.includes("sk-phase435secret");

  const queue = createRuntimeWorkerQueue({
    queueFile,
    now: () => new Date(now),
  });
  const first = await queue.enqueue(envelope);
  const duplicate = await queue.enqueue({
    ...envelope,
    jobId: "runtime-kit-phase435-duplicate",
  });
  const queuedStatus = await queue.status();
  const coalescingPass =
    first.coalesced === false &&
    duplicate.coalesced === true &&
    duplicate.job.jobId === first.job.jobId &&
    queuedStatus.counts.queued === 1 &&
    queuedStatus.counts.coalesced === 1;
  const drained = await queue.drainOnce();
  const secondDrain = await queue.drainOnce();
  const drainOnceIdempotencyPass =
    drained.processed === 1 &&
    drained.jobs[0]?.status === "succeeded" &&
    secondDrain.processed === 0;

  const failureQueue = createRuntimeWorkerQueue({
    queueFile: failureQueueFile,
    now: () => new Date(now),
    async processor() {
      throw new Error("phase43.5 worker sink unavailable");
    },
  });
  await failureQueue.enqueue({
    ...envelope,
    dedupeKey: `${envelope.dedupeKey}:failure`,
    jobId: "runtime-kit-phase435-failure",
  });
  const failedDrain = await failureQueue.drainOnce();
  const recover = await failureQueue.recover({ dryRun: true });
  const failureStatus = await failureQueue.status();
  const workerFailureIsolationPass =
    failedDrain.processed === 1 &&
    failedDrain.jobs[0]?.status === "failed" &&
    recover.mutationApplied === false &&
    recover.repairs[0]?.action === "requeue" &&
    failureStatus.counts.failed === 1;
  const recoverDryRunPass =
    recover.dryRun === true &&
    recover.repairs[0]?.fromStatus === "failed" &&
    failureStatus.counts.failed === 1;

  const started = await queue.start();
  const stopped = await queue.stop();
  const daemonOptionalPass =
    started.daemon.enabled === true && stopped.daemon.enabled === false;

  const cliStatus = await runCLI([
    "runtime",
    "worker",
    "status",
    "--queue-file",
    queueFile,
    "--json",
  ]);
  const cliSurfacePass =
    cliStatus.exitCode === 0 &&
    JSON.parse(cliStatus.stdout).queueFile === queueFile;

  const rootSource = await readText(join(root, "src/index.ts"), dependencies);
  const noRootApiWideningPass =
    !rootSource.includes("runtime-worker") &&
    !rootSource.includes("createRuntimeWorkerQueue");

  const cases = {
    cliSurfacePass,
    coalescingPass,
    daemonOptionalPass,
    drainOnceIdempotencyPass,
    envelopeRedactionPass,
    noRootApiWideningPass,
    recoverDryRunPass,
    workerFailureIsolationPass,
  };
  const passCount = Object.values(cases).filter(Boolean).length;
  const totalChecks = Object.values(cases).length;
  const accepted = passCount === totalChecks;
  const report: Phase435EvalReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Optional Runtime Worker passed envelope redaction, coalescing, drain-once, recover dry-run, failure isolation, daemon marker, CLI surface, and no-root-widening checks."
        : "Optional Runtime Worker failed one or more deterministic checks.",
    },
    cases,
    generatedAt: now,
    generatedBy: GENERATED_BY,
    mode: "fallback",
    outputDir,
    phase: "phase-43-5",
    runDirectory,
    runId,
    summary: {
      passCount,
      totalChecks,
    },
  };

  await (dependencies.writeTextFile ?? writeFile)(
    join(runDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

async function readText(
  path: string,
  dependencies: Phase435EvalDependencies,
): Promise<string> {
  if (dependencies.readTextFile) {
    return await dependencies.readTextFile(path);
  }
  return await readFile(path, "utf8");
}

export async function runPhase435EvalCli(
  dependencies: Phase435EvalCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? process.argv;
  const options = parsePhase435EvalCliOptions(argv);
  try {
    const report = await (dependencies.runEval ?? runPhase435FallbackEval)(options);
    dependencies.log?.(
      `Phase 43.5 deterministic eval ${report.acceptance.decision}: ${report.runDirectory}`,
    );
    if (report.acceptance.decision !== "accepted") {
      dependencies.exit?.(1);
      if (!dependencies.exit) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    dependencies.log?.(error instanceof Error ? error.message : String(error));
    dependencies.exit?.(1);
    if (!dependencies.exit) {
      process.exitCode = 1;
    }
  }
}

if (import.meta.main) {
  await runPhase435EvalCli({
    log: console.log,
  });
}
