import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  evaluateInstalledArmCanary,
} from "./c3-arms";
import type {
  C3InstalledArmRuntime,
  C3SeedResult,
} from "./c3-runtime";
import {
  auditAndSanitizeCodexTranscript,
  findCodexTranscriptByThreadId,
} from "./codex-transcript";
import type { CodexRunResult } from "./codex-runner";
import {
  buildNativeCanarySessionDigest,
} from "./native-canary-contracts";
import type {
  NativeCanaryInjectionEvent,
  NativeCanaryWritebackEvent,
} from "./native-canary-contracts";
import {
  parseNativeCanaryCursorState,
  parseNativeCanaryInjectionState,
  parseNativeCanaryWritebackInspection,
} from "./native-canary-state";
import { runBoundaryProcess } from "./process";
import type {
  BoundaryProcessRequest,
  BoundaryProcessResult,
} from "./process";

const DEFAULT_INSPECTION_TIMEOUT_MS = 60_000;
const MISSING_THREAD_ID = "unavailable-current-thread";

export interface C3InstalledHostCanary {
  expectedMemoryIds: string[];
  failureStage: string | null;
  injectedExpectedMemoryIds: string[];
  passed: boolean;
  rawTranscriptPersisted: false;
  reasons: string[];
  sessionDigest: string;
  stateEvidenceSha256: string;
  stopCursorAdvanced: boolean;
  terminalWritebackStatuses: string[];
  threadId: string;
  transcriptSourceSha256: string;
}

export async function collectC3InstalledHostCanary(input: {
  codex: CodexRunResult;
  runProcess?: (
    request: BoundaryProcessRequest,
  ) => Promise<BoundaryProcessResult>;
  runtime: C3InstalledArmRuntime;
  seed: C3SeedResult;
  timeoutMs?: number;
}): Promise<C3InstalledHostCanary> {
  const expectedMemoryIds = [...new Set(
    input.seed.receipt.writtenMemoryIds,
  )].sort();
  const currentThreadId = input.codex.normalized?.threadId;
  const threadId = currentThreadId ?? MISSING_THREAD_ID;
  const sessionDigest = buildNativeCanarySessionDigest(threadId);
  const collectionFailures: Array<{ reason: string; stage: string }> = [];
  const fail = (stage: string, reason: string): void => {
    collectionFailures.push({ reason, stage });
  };

  if (input.codex.status !== "completed") {
    fail("codex-process", `current Codex stage status is ${input.codex.status}`);
  }
  if (currentThreadId === null || currentThreadId === undefined) {
    fail("codex-session-isolation", "current Codex stage has no thread.started id");
    const stateEvidenceSha256 = await persistSanitizedHostState({
      cursorSourceSha256: null,
      injectionEvents: [],
      injectionSourceSha256: null,
      runtime: input.runtime,
      sessionDigest,
      stopCursorSessionDigests: [],
      writebackEvents: [],
      writebackSourceSha256: null,
    });
    return finalizeCanary({
      collectionFailures,
      expectedMemoryIds,
      injectionEvents: [],
      runtime: input.runtime,
      sessionDigest,
      stateEvidenceSha256,
      stopCursorSessionDigests: [],
      threadId,
      transcriptSourceSha256: sha256(""),
      writebackEvents: [],
    });
  }

  let transcriptSourceSha256 = sha256("");
  try {
    const transcriptPath = await findCodexTranscriptByThreadId({
      sessionsRoot: join(input.runtime.plan.paths.codexHome, "sessions"),
      threadId,
    });
    const transcript = auditAndSanitizeCodexTranscript({
      codexVersion: input.runtime.codex.version,
      raw: await readFile(transcriptPath, "utf8"),
      threadId,
    });
    if (transcript.audit.conversationMessageCount < 2) {
      throw new Error("Codex transcript has fewer than two conversation messages");
    }
    await writeFile(
      join(
        input.runtime.plan.paths.result,
        "codex-rollout.sanitized.jsonl",
      ),
      transcript.sanitizedJsonl,
      { encoding: "utf8", flag: "wx" },
    );
    transcriptSourceSha256 = transcript.audit.sanitizedSha256;
  } catch (error) {
    fail(
      "codex-transcript",
      `current Codex transcript failed: ${errorMessage(error)}`,
    );
  }

  let injectionEvents: NativeCanaryInjectionEvent[] = [];
  let injectionSourceSha256: string | null = null;
  try {
    const raw = await readFile(
      join(
        input.runtime.plan.paths.home,
        ".goodmemory",
        "codex-injection-state.json",
      ),
      "utf8",
    );
    injectionSourceSha256 = sha256(raw);
    injectionEvents = parseNativeCanaryInjectionState(raw);
  } catch (error) {
    fail(
      "goodmemory-injection",
      `current GoodMemory injection state failed: ${errorMessage(error)}`,
    );
  }

  let stopCursorSessionDigests: string[] = [];
  let cursorSourceSha256: string | null = null;
  try {
    const raw = await readFile(
      join(
        input.runtime.plan.paths.home,
        ".goodmemory",
        "codex-transcript-cursors.json",
      ),
      "utf8",
    );
    cursorSourceSha256 = sha256(raw);
    stopCursorSessionDigests = parseNativeCanaryCursorState(raw);
  } catch (error) {
    fail(
      "goodmemory-stop",
      `current GoodMemory transcript cursor failed: ${errorMessage(error)}`,
    );
  }

  let writebackEvents: NativeCanaryWritebackEvent[] = [];
  let writebackSourceSha256: string | null = null;
  try {
    const run = input.runProcess ?? runBoundaryProcess;
    const inspection = await run({
      args: [
        "codex",
        "writeback",
        "inspect",
        "--workspace-root",
        input.runtime.plan.paths.workspace,
        "--limit",
        "50",
        "--json",
      ],
      cwd: input.runtime.plan.paths.workspace,
      env: input.runtime.env,
      executable: input.runtime.goodmemoryExecutable,
      timeoutMs: input.timeoutMs ?? DEFAULT_INSPECTION_TIMEOUT_MS,
    });
    assertInspectionSucceeded(inspection);
    writebackSourceSha256 = sha256(inspection.stdout);
    writebackEvents = parseNativeCanaryWritebackInspection(inspection.stdout);
  } catch (error) {
    fail(
      "goodmemory-stop",
      `public writeback inspection failed: ${errorMessage(error)}`,
    );
  }

  const stateEvidenceSha256 = await persistSanitizedHostState({
    cursorSourceSha256,
    injectionEvents,
    injectionSourceSha256,
    runtime: input.runtime,
    sessionDigest,
    stopCursorSessionDigests,
    writebackEvents,
    writebackSourceSha256,
  });

  return finalizeCanary({
    collectionFailures,
    expectedMemoryIds,
    injectionEvents,
    runtime: input.runtime,
    sessionDigest,
    stateEvidenceSha256,
    stopCursorSessionDigests,
    threadId,
    transcriptSourceSha256,
    writebackEvents,
  });
}

function finalizeCanary(input: {
  collectionFailures: ReadonlyArray<{ reason: string; stage: string }>;
  expectedMemoryIds: string[];
  injectionEvents: readonly NativeCanaryInjectionEvent[];
  runtime: C3InstalledArmRuntime;
  sessionDigest: string;
  stateEvidenceSha256: string;
  stopCursorSessionDigests: readonly string[];
  threadId: string;
  transcriptSourceSha256: string;
  writebackEvents: readonly NativeCanaryWritebackEvent[];
}): C3InstalledHostCanary {
  const evaluation = evaluateInstalledArmCanary({
    expectedMemoryIds: input.expectedMemoryIds,
    hostStatus: input.runtime.profile,
    injectionEvents: input.injectionEvents,
    preexistingSessionCount: input.runtime.preexistingSessionCount,
    sessionDigest: input.sessionDigest,
    stopCursorSessionDigests: input.stopCursorSessionDigests,
    threadId: input.threadId,
    writebackEvents: input.writebackEvents,
  });
  const reasons = [...new Set([
    ...input.collectionFailures.map(({ reason }) => reason),
    ...evaluation.reasons,
  ])];
  return {
    expectedMemoryIds: input.expectedMemoryIds,
    failureStage: input.collectionFailures[0]?.stage ?? evaluation.failureStage,
    injectedExpectedMemoryIds: evaluation.injectedExpectedMemoryIds,
    passed: input.collectionFailures.length === 0 && evaluation.passed,
    rawTranscriptPersisted: false,
    reasons,
    sessionDigest: input.sessionDigest,
    stateEvidenceSha256: input.stateEvidenceSha256,
    stopCursorAdvanced: evaluation.stopCursorAdvanced,
    terminalWritebackStatuses: evaluation.terminalWritebackStatuses,
    threadId: input.threadId,
    transcriptSourceSha256: input.transcriptSourceSha256,
  };
}

async function persistSanitizedHostState(input: {
  cursorSourceSha256: string | null;
  injectionEvents: readonly NativeCanaryInjectionEvent[];
  injectionSourceSha256: string | null;
  runtime: C3InstalledArmRuntime;
  sessionDigest: string;
  stopCursorSessionDigests: readonly string[];
  writebackEvents: readonly NativeCanaryWritebackEvent[];
  writebackSourceSha256: string | null;
}): Promise<string> {
  const evidence = {
    currentSession: {
      injectionEvents: input.injectionEvents
        .filter((event) => event.sessionDigest === input.sessionDigest)
        .map((event) => ({
          command: event.command,
          decision: event.decision,
          recordIds: [...event.recordIds].sort(),
          sessionDigest: event.sessionDigest,
        })),
      sessionDigest: input.sessionDigest,
      stopCursorAdvanced: input.stopCursorSessionDigests.includes(
        input.sessionDigest,
      ),
      writebackEvents: input.writebackEvents
        .filter((event) => event.sessionDigest === input.sessionDigest)
        .map((event) => ({
          command: event.command,
          linkedRecordIds: [...event.linkedRecordIds]
            .map((record) => ({ id: record.id, type: record.type }))
            .sort((first, second) =>
              `${first.type}:${first.id}`.localeCompare(`${second.type}:${second.id}`)
            ),
          sessionDigest: event.sessionDigest,
          status: event.status,
        })),
    },
    schemaVersion: 1,
    sources: {
      cursorSourceSha256: input.cursorSourceSha256,
      injectionSourceSha256: input.injectionSourceSha256,
      writebackSourceSha256: input.writebackSourceSha256,
    },
  };
  const bytes = `${JSON.stringify(evidence, null, 2)}\n`;
  await writeFile(
    join(
      input.runtime.plan.paths.result,
      "host-canary-state.sanitized.json",
    ),
    bytes,
    { encoding: "utf8", flag: "wx" },
  );
  return sha256(bytes);
}

function assertInspectionSucceeded(result: BoundaryProcessResult): void {
  if (result.spawnError !== undefined) {
    throw new Error(`public writeback inspection failed to start: ${result.spawnError}`);
  }
  if (result.timedOut) {
    throw new Error("public writeback inspection timed out");
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `public writeback inspection exited with code ${String(result.exitCode)}`,
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
