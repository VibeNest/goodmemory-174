import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_INSTALLED_HOST_WRITEBACK,
  parseInstalledHostRuntimeConfig,
  type InstalledHostWritebackConfig,
} from "../src/install/hostConfigValidation";
import { executeInstalledHostHook } from "../src/install/hostHookRuntime";
import {
  enableHostWorkspace,
  installHost,
} from "../src/install/hostInstall";
import { executeInstalledHostWriteback } from "../src/install/hostWritebackRuntime";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase37EvalOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase37EvalDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase37CaseResult {
  assertions: Array<{
    label: string;
    passed: boolean;
  }>;
  blockedAssistantCount: number;
  caseId:
    | "assistant-confirmed-allowed"
    | "assistant-default-blocked"
    | "dedupe-cooldown"
    | "never-masking"
    | "next-session-recall"
    | "open-loop-writeback"
    | "procedural-correction"
    | "raw-transcript-rejected";
  durableWriteCount: number;
  focus:
    | "assistant_policy"
    | "dedupe"
    | "next_session_recall"
    | "open_loop"
    | "privacy"
    | "procedural_feedback"
    | "raw_transcript";
  passed: boolean;
  privacyMaskPassCount: number;
  writebackCandidateCount: number;
}

export interface Phase37EvalReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  cases: Phase37CaseResult[];
  generatedAt: string;
  generatedBy: "scripts/run-phase-37-eval.ts";
  mode: "fallback";
  outputDir: string;
  phase: "phase-37";
  runDirectory: string;
  runId: string;
  summary: {
    acceptedCaseCount: number;
    blockedAssistantCount: number;
    dedupePassCount: number;
    durableWriteCount: number;
    nextSessionRecallPassCount: number;
    privacyMaskPassCount: number;
    rawTranscriptRejectedPassCount: number;
    totalCases: number;
    writebackCandidateCount: number;
  };
}

const GENERATED_BY = "scripts/run-phase-37-eval.ts";

export function resolvePhase37FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-37");
}

export function buildPhase37FallbackRunId(timestamp: string): string {
  return `run-${timestamp.replace(/\D/g, "").slice(0, 14) || "phase37"}`;
}

export function parsePhase37EvalCliOptions(
  argv: readonly string[],
): Phase37EvalOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function assertCase(input: {
  assertions: Phase37CaseResult["assertions"];
  blockedAssistantCount?: number;
  caseId: Phase37CaseResult["caseId"];
  durableWriteCount?: number;
  focus: Phase37CaseResult["focus"];
  privacyMaskPassCount?: number;
  writebackCandidateCount?: number;
}): Phase37CaseResult {
  return {
    assertions: input.assertions,
    blockedAssistantCount: input.blockedAssistantCount ?? 0,
    caseId: input.caseId,
    durableWriteCount: input.durableWriteCount ?? 0,
    focus: input.focus,
    passed: input.assertions.every((assertion) => assertion.passed),
    privacyMaskPassCount: input.privacyMaskPassCount ?? 0,
    writebackCandidateCount: input.writebackCandidateCount ?? 0,
  };
}

async function withInstalledCodexScenario<T>(
  execute: (input: { homeRoot: string; workspaceRoot: string }) => Promise<T>,
  writeback: InstalledHostWritebackConfig = {
    ...DEFAULT_INSTALLED_HOST_WRITEBACK,
    mode: "selective",
  },
): Promise<T> {
  const homeRoot = await mkdtemp(join(tmpdir(), "goodmemory-phase37-home-"));
  const workspaceRoot = await mkdtemp(
    join(tmpdir(), "goodmemory-phase37-workspace-"),
  );

  try {
    await installHost({
      activationMode: "workspace_opt_in",
      homeRoot,
      host: "codex",
      userId: "phase37-user",
      writeback,
    });
    await enableHostWorkspace({
      homeRoot,
      host: "codex",
      workspaceRoot,
    });

    return await execute({ homeRoot, workspaceRoot });
  } finally {
    await rm(homeRoot, { force: true, recursive: true });
    await rm(workspaceRoot, { force: true, recursive: true });
  }
}

async function runOpenLoopWritebackCase(): Promise<Phase37CaseResult> {
  return await withInstalledCodexScenario(async ({ homeRoot, workspaceRoot }) => {
    const result = await executeInstalledHostWriteback({
      command: "session-end",
      homeRoot,
      host: "codex",
      payload: {
        cwd: workspaceRoot,
        messages: [
          {
            content: "Next step is to add the phase-37 live report.",
            role: "user",
          },
        ],
        session_id: "phase37-session-1",
      },
    });

    return assertCase({
      assertions: [
        { label: "writeback-written", passed: result.wrote },
        {
          label: "open-loop-candidate",
          passed: result.candidates.some(
            (candidate) =>
              candidate.durable &&
              candidate.kind === "fact" &&
              candidate.reason === "open_loop",
          ),
        },
        {
          label: "no-raw-transcript",
          passed: result.trace.rawTranscriptPersisted === false,
        },
      ],
      caseId: "open-loop-writeback",
      durableWriteCount: result.wrote ? 1 : 0,
      focus: "open_loop",
      writebackCandidateCount: result.candidates.length,
    });
  });
}

async function runNextSessionRecallCase(): Promise<Phase37CaseResult> {
  return await withInstalledCodexScenario(async ({ homeRoot, workspaceRoot }) => {
    const writeback = await executeInstalledHostWriteback({
      command: "session-end",
      homeRoot,
      host: "codex",
      payload: {
        cwd: workspaceRoot,
        messages: [
          {
            content: "Next step is to add the phase-37 live report.",
            role: "user",
          },
        ],
        session_id: "phase37-session-1",
      },
    });
    const recall = await executeInstalledHostHook({
      command: "user-prompt-submit",
      homeRoot,
      host: "codex",
      payload: {
        cwd: workspaceRoot,
        prompt: "What should we continue for phase 37?",
        session_id: "phase37-session-2",
      },
    });
    const context = String(
      recall.output?.hookSpecificOutput &&
        typeof recall.output.hookSpecificOutput === "object" &&
        "additionalContext" in recall.output.hookSpecificOutput
        ? recall.output.hookSpecificOutput.additionalContext
        : "",
    );

    return assertCase({
      assertions: [
        { label: "writeback-written", passed: writeback.wrote },
        { label: "recall-applied", passed: recall.applied },
        {
          label: "next-session-hit",
          passed: context.includes("phase-37 live report"),
        },
      ],
      caseId: "next-session-recall",
      durableWriteCount: writeback.wrote ? 1 : 0,
      focus: "next_session_recall",
      writebackCandidateCount: writeback.candidates.length,
    });
  });
}

async function runProceduralCorrectionCase(): Promise<Phase37CaseResult> {
  return await withInstalledCodexScenario(async ({ homeRoot, workspaceRoot }) => {
    const result = await executeInstalledHostWriteback({
      command: "session-end",
      homeRoot,
      host: "codex",
      payload: {
        cwd: workspaceRoot,
        messages: [
          {
            content: "That approach was wrong; next time run typecheck first.",
            role: "user",
          },
        ],
        session_id: "phase37-session-1",
      },
    });

    return assertCase({
      assertions: [
        { label: "writeback-written", passed: result.wrote },
        {
          label: "procedural-feedback",
          passed: result.candidates.some(
            (candidate) =>
              candidate.durable &&
              candidate.kind === "feedback" &&
              candidate.reason === "procedural_feedback",
          ),
        },
      ],
      caseId: "procedural-correction",
      durableWriteCount: result.wrote ? 1 : 0,
      focus: "procedural_feedback",
      writebackCandidateCount: result.candidates.length,
    });
  });
}

async function runAssistantDefaultBlockedCase(): Promise<Phase37CaseResult> {
  return await withInstalledCodexScenario(async ({ homeRoot, workspaceRoot }) => {
    const result = await executeInstalledHostWriteback({
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
        session_id: "phase37-session-1",
      },
    });
    const blocked = result.candidates.filter(
      (candidate) => candidate.reason === "assistant_policy_blocked",
    ).length;

    return assertCase({
      assertions: [
        { label: "no-write", passed: !result.wrote },
        { label: "assistant-blocked", passed: blocked === 1 },
      ],
      blockedAssistantCount: blocked,
      caseId: "assistant-default-blocked",
      focus: "assistant_policy",
      writebackCandidateCount: result.candidates.length,
    });
  });
}

async function runAssistantConfirmedAllowedCase(): Promise<Phase37CaseResult> {
  return await withInstalledCodexScenario(async ({ homeRoot, workspaceRoot }) => {
    const result = await executeInstalledHostWriteback({
      command: "session-end",
      homeRoot,
      host: "codex",
      payload: {
        annotations: [
          {
            confirmed: true,
            kindHint: "fact",
            messageIndex: 0,
            reason: "host_confirmed_decision",
            remember: "always",
          },
        ],
        cwd: workspaceRoot,
        messages: [
          {
            content: "We decided Codex is the canonical installed path.",
            role: "assistant",
          },
        ],
        session_id: "phase37-session-1",
      },
    });

    return assertCase({
      assertions: [
        { label: "writeback-written", passed: result.wrote },
        {
          label: "assistant-confirmed",
          passed: result.candidates.some(
            (candidate) =>
              candidate.durable &&
              candidate.source === "assistant" &&
              candidate.reason === "host_annotation",
          ),
        },
      ],
      caseId: "assistant-confirmed-allowed",
      durableWriteCount: result.wrote ? 1 : 0,
      focus: "assistant_policy",
      writebackCandidateCount: result.candidates.length,
    });
  });
}

async function runNeverMaskingCase(): Promise<Phase37CaseResult> {
  return await withInstalledCodexScenario(async ({ homeRoot, workspaceRoot }) => {
    const result = await executeInstalledHostWriteback({
      command: "session-end",
      homeRoot,
      host: "codex",
      payload: {
        annotations: [
          {
            messageIndex: 0,
            remember: "never",
          },
        ],
        cwd: workspaceRoot,
        messages: [
          {
            content: "Always keep this private preference out of memory.",
            role: "user",
          },
        ],
        session_id: "phase37-session-1",
      },
    });

    return assertCase({
      assertions: [
        { label: "no-write", passed: !result.wrote },
        { label: "masked-before-candidate", passed: result.candidates.length === 0 },
      ],
      caseId: "never-masking",
      focus: "privacy",
      privacyMaskPassCount: result.candidates.length === 0 ? 1 : 0,
    });
  });
}

async function runRawTranscriptRejectedCase(): Promise<Phase37CaseResult> {
  const validation = parseInstalledHostRuntimeConfig(
    {
      host: "codex",
      storage: {
        provider: "memory",
        url: "memory://phase37",
      },
      userId: "phase37-user",
      version: 1,
      writeback: {
        mode: "selective",
        persistRawTranscript: true,
      },
    },
    "codex",
  );

  return assertCase({
    assertions: [
      {
        label: "persist-raw-transcript-rejected",
        passed: validation.status === "invalid" &&
          validation.detail === "writeback.persistRawTranscript must be false",
      },
    ],
    caseId: "raw-transcript-rejected",
    focus: "raw_transcript",
    privacyMaskPassCount: validation.status === "invalid" ? 1 : 0,
  });
}

async function runDedupeCooldownCase(): Promise<Phase37CaseResult> {
  return await withInstalledCodexScenario(async ({ homeRoot, workspaceRoot }) => {
    const payload = {
      cwd: workspaceRoot,
      event_id: "stop-1",
      messages: [
        {
          content: "Next step is to add the phase-37 live report.",
          role: "user",
        },
      ],
      session_id: "phase37-session-1",
    };
    const first = await executeInstalledHostWriteback({
      command: "session-end",
      homeRoot,
      host: "codex",
      payload,
    });
    const second = await executeInstalledHostWriteback({
      command: "session-end",
      homeRoot,
      host: "codex",
      payload,
    });

    return assertCase({
      assertions: [
        { label: "first-write", passed: first.wrote },
        { label: "second-no-write", passed: !second.wrote },
        {
          label: "duplicate-counted",
          passed: second.trace.duplicateCandidateCount === 1,
        },
      ],
      caseId: "dedupe-cooldown",
      durableWriteCount: first.wrote ? 1 : 0,
      focus: "dedupe",
      writebackCandidateCount: first.candidates.length + second.candidates.length,
    });
  });
}

export async function runPhase37FallbackEval(
  options: Phase37EvalOptions = {},
  dependencies: Phase37EvalDependencies = {},
): Promise<Phase37EvalReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = options.outputDir ?? resolvePhase37FallbackOutputDir(root);
  const now = dependencies.now ?? (() => new Date().toISOString());
  const runId = options.runId ?? buildPhase37FallbackRunId(now());
  const runDirectory = join(outputDir, runId);
  const ensureDir = dependencies.ensureDir ?? mkdir;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const cases = await Promise.all([
    runOpenLoopWritebackCase(),
    runNextSessionRecallCase(),
    runProceduralCorrectionCase(),
    runAssistantDefaultBlockedCase(),
    runAssistantConfirmedAllowedCase(),
    runNeverMaskingCase(),
    runRawTranscriptRejectedCase(),
    runDedupeCooldownCase(),
  ]);
  const acceptedCaseCount = cases.filter((caseResult) => caseResult.passed).length;
  const accepted = acceptedCaseCount === cases.length;
  const countPassed = (caseId: Phase37CaseResult["caseId"]) =>
    cases.some((caseResult) => caseResult.caseId === caseId && caseResult.passed)
      ? 1
      : 0;
  const sum = (field: keyof Pick<
    Phase37CaseResult,
    | "blockedAssistantCount"
    | "durableWriteCount"
    | "privacyMaskPassCount"
    | "writebackCandidateCount"
  >) => cases.reduce((total, caseResult) => total + caseResult[field], 0);
  const report: Phase37EvalReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 37 installed-host selective writeback passed deterministic open-loop, policy, privacy, dedupe, and next-session recall evaluation."
        : "One or more Phase 37 installed-host selective writeback cases failed deterministic evaluation.",
    },
    cases,
    generatedAt: now(),
    generatedBy: GENERATED_BY,
    mode: "fallback",
    outputDir,
    phase: "phase-37",
    runDirectory,
    runId,
    summary: {
      acceptedCaseCount,
      blockedAssistantCount: sum("blockedAssistantCount"),
      dedupePassCount: countPassed("dedupe-cooldown"),
      durableWriteCount: sum("durableWriteCount"),
      nextSessionRecallPassCount: countPassed("next-session-recall"),
      privacyMaskPassCount: sum("privacyMaskPassCount"),
      rawTranscriptRejectedPassCount: countPassed("raw-transcript-rejected"),
      totalCases: cases.length,
      writebackCandidateCount: sum("writebackCandidateCount"),
    },
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  return report;
}

if (import.meta.main) {
  const report = await runPhase37FallbackEval(
    parsePhase37EvalCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}
