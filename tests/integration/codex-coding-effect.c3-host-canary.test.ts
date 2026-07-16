import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  collectC3InstalledHostCanary,
} from "../../scripts/codex-coding-effect/c3-host-canary";
import type {
  C3InstalledArmRuntime,
  C3SeedResult,
} from "../../scripts/codex-coding-effect/c3-runtime";
import type { CodexRunResult } from "../../scripts/codex-coding-effect/codex-runner";
import {
  buildNativeCanarySessionDigest,
} from "../../scripts/codex-coding-effect/native-canary-contracts";
import type {
  BoundaryProcessRequest,
  BoundaryProcessResult,
} from "../../scripts/codex-coding-effect/process";

describe("Codex coding-effect C3 installed host canary", () => {
  it("binds the current thread to seeded injection, cursor, sanitized transcript, and committed Stop", async () => {
    await withFixture(async ({ codex, root, runtime, seed, sessionDigest }) => {
      await writeCurrentHostState(runtime, sessionDigest);
      const rawTranscript = transcriptJsonl({
        assistantText: "private assistant answer",
        threadId: codex.normalized!.threadId!,
        userText: "private task prompt",
      });
      await writeTranscript(runtime, codex.normalized!.threadId!, rawTranscript);
      const requests: BoundaryProcessRequest[] = [];

      const result = await collectC3InstalledHostCanary({
        codex,
        runProcess: async (request) => {
          requests.push(request);
          return successfulInspection(sessionDigest);
        },
        runtime,
        seed,
      });

      const sanitizedPath = join(
        runtime.plan.paths.result,
        "codex-rollout.sanitized.jsonl",
      );
      const sanitized = await readFile(sanitizedPath, "utf8");
      const statePath = join(
        runtime.plan.paths.result,
        "host-canary-state.sanitized.json",
      );
      const state = await readFile(statePath, "utf8");
      expect(result).toEqual({
        expectedMemoryIds: ["memory-001"],
        failureStage: null,
        injectedExpectedMemoryIds: ["memory-001"],
        passed: true,
        rawTranscriptPersisted: false,
        reasons: [],
        sessionDigest,
        stateEvidenceSha256: sha256(state),
        stopCursorAdvanced: true,
        terminalWritebackStatuses: ["committed"],
        threadId: "thread-installed-001",
        transcriptSourceSha256: sha256(sanitized),
      });
      expect(sanitized).toContain("<redacted-user-text>");
      expect(sanitized).toContain("<redacted-assistant-text>");
      expect(sanitized).not.toContain("private task prompt");
      expect(sanitized).not.toContain("private assistant answer");
      expect(state).not.toContain("private task prompt");
      expect(state).not.toContain("private assistant answer");
      expect(JSON.parse(state) as unknown).toMatchObject({
        currentSession: {
          injectionEvents: [{
            decision: "injected",
            recordIds: ["memory-001"],
          }],
          stopCursorAdvanced: true,
          writebackEvents: [{ command: "turn-end", status: "committed" }],
        },
      });
      expect((await readdir(runtime.plan.paths.result)).sort()).toEqual([
        "codex-rollout.sanitized.jsonl",
        "host-canary-state.sanitized.json",
      ]);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        args: [
          "codex",
          "writeback",
          "inspect",
          "--workspace-root",
          runtime.plan.paths.workspace,
          "--limit",
          "50",
          "--json",
        ],
        cwd: runtime.plan.paths.workspace,
        env: runtime.env,
        executable: runtime.goodmemoryExecutable,
      });
      expect(requests[0]!.cwd.startsWith(root)).toBe(true);
    });
  });

  it("returns an explicit transcript infrastructure failure on format drift without persisting raw text", async () => {
    await withFixture(async ({ codex, runtime, seed, sessionDigest }) => {
      await writeCurrentHostState(runtime, sessionDigest);
      await writeTranscript(
        runtime,
        codex.normalized!.threadId!,
        `${JSON.stringify({ payload: { id: codex.normalized!.threadId }, type: "session_meta" })}\n`
          + "not-json private transcript bytes\n",
      );

      const result = await collectC3InstalledHostCanary({
        codex,
        runProcess: async () => successfulInspection(sessionDigest),
        runtime,
        seed,
      });

      expect(result).toMatchObject({
        failureStage: "codex-transcript",
        passed: false,
        rawTranscriptPersisted: false,
        sessionDigest,
        threadId: "thread-installed-001",
        transcriptSourceSha256: sha256(""),
      });
      expect(result.reasons.join("\n")).toContain("transcript format drift");
      expect(await readdir(runtime.plan.paths.result)).toEqual([
        "host-canary-state.sanitized.json",
      ]);
    });
  });

  it("fails closed when public writeback inspection is unavailable instead of accepting local state alone", async () => {
    await withFixture(async ({ codex, runtime, seed, sessionDigest }) => {
      await writeCurrentHostState(runtime, sessionDigest);
      await writeTranscript(
        runtime,
        codex.normalized!.threadId!,
        transcriptJsonl({
          assistantText: "answer",
          threadId: codex.normalized!.threadId!,
          userText: "prompt",
        }),
      );

      const result = await collectC3InstalledHostCanary({
        codex,
        runProcess: async () => ({
          durationMs: 1,
          exitCode: 7,
          stderr: "inspect unavailable",
          stdout: "",
          timedOut: false,
        }),
        runtime,
        seed,
      });

      expect(result).toMatchObject({
        failureStage: "goodmemory-stop",
        passed: false,
        stopCursorAdvanced: true,
        terminalWritebackStatuses: [],
      });
      expect(result.reasons.join("\n")).toContain(
        "public writeback inspection exited with code 7",
      );
    });
  });
});

async function withFixture(
  run: (fixture: {
    codex: CodexRunResult;
    root: string;
    runtime: C3InstalledArmRuntime;
    seed: C3SeedResult;
    sessionDigest: string;
  }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "goodmemory-c3-host-canary-"));
  const home = join(root, "home");
  const codexHome = join(home, ".codex");
  const result = join(root, "result");
  const workspace = join(root, "workspace");
  await Promise.all([
    mkdir(join(codexHome, "sessions", "2026", "07", "15"), { recursive: true }),
    mkdir(join(home, ".goodmemory"), { recursive: true }),
    mkdir(result, { recursive: true }),
    mkdir(workspace, { recursive: true }),
  ]);
  const threadId = "thread-installed-001";
  const sessionDigest = buildNativeCanarySessionDigest(threadId);
  const runtime: C3InstalledArmRuntime = {
    codex: {
      executable: "/fake/codex",
      executableSha256: "a".repeat(64),
      hooksEnabled: true,
      version: "codex-cli 0.144.3",
    },
    env: {
      CODEX_HOME: codexHome,
      HOME: home,
      PATH: "/fake/bin:/usr/bin:/bin",
    },
    goodmemoryExecutable: "/fake/bin/goodmemory",
    instructionSha256: "b".repeat(64),
    package: { sha256: "c".repeat(64), version: "0.5.1" },
    permissionProfile: {
      configSha256: "a".repeat(64),
      filesystemDefault: "deny",
      minimalRead: true,
      name: "c3-task",
      networkAccess: false,
      workspaceWrite: true,
    },
    plan: {
      arm: "goodmemory-installed",
      paths: {
        armRoot: root,
        cache: join(root, "cache"),
        codexHome,
        home,
        packagePrefix: join(root, "prefix"),
        result,
        temp: join(root, "tmp"),
        workspace,
      },
      scopes: {
        sessionId: "c3-session-installed",
        userId: "c3-user-installed",
        workspaceId: "workspace-installed",
      },
    },
    preexistingSessionCount: 0,
    profile: {
      activationMode: "global",
      hookRegistered: true,
      mcpRegistered: true,
      persistRawTranscript: false,
      retrievalProfile: "coding_agent",
      workspaceStatus: "ok",
      writebackMode: "selective",
    },
    storagePath: join(root, "memory.sqlite"),
  };
  const seed: C3SeedResult = {
    exportLeakageAudit: {
      declaredForbiddenSourceSha256: [],
      overlaps: [],
      passed: true,
      sourceSha256: "d".repeat(64),
    },
    receipt: {
      historySourceSha256: "e".repeat(64),
      memoryExportSha256: "f".repeat(64),
      rawTranscriptPersisted: false,
      schemaVersion: 1,
      seedSurface: "codex-writeback-from-rollout",
      sourceSessionDigest: "session:prehistory",
      writebackOutcome: "written",
      writtenMemoryIds: ["memory-001"],
    },
  };
  const codex: CodexRunResult = {
    durationMs: 1,
    events: [],
    exitCode: 0,
    normalized: {
      commands: [],
      fileChanges: [],
      finalMessage: "done",
      finalMessageEventIndex: 2,
      threadId,
      threadStartedEventIndex: 0,
      usage: { cachedInputTokens: 0, inputTokens: 1, outputTokens: 1 },
      usageEventIndex: 3,
    },
    status: "completed",
    stderr: "",
    stdout: "{}\n",
    timedOut: false,
  };

  try {
    await run({ codex, root, runtime, seed, sessionDigest });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function writeCurrentHostState(
  runtime: C3InstalledArmRuntime,
  sessionDigest: string,
): Promise<void> {
  await Promise.all([
    writeFile(
      join(runtime.plan.paths.home, ".goodmemory", "codex-injection-state.json"),
      `${JSON.stringify({
        events: [{
          command: "session-start",
          decision: "injected",
          recordIds: ["memory-001"],
          sessionDigest,
        }],
        version: 1,
      })}\n`,
      "utf8",
    ),
    writeFile(
      join(
        runtime.plan.paths.home,
        ".goodmemory",
        "codex-transcript-cursors.json",
      ),
      `${JSON.stringify({
        cursors: {
          [sessionDigest]: {
            offset: 42,
            updatedAt: "2026-07-15T12:00:00.000Z",
          },
        },
        version: 1,
      })}\n`,
      "utf8",
    ),
  ]);
}

async function writeTranscript(
  runtime: C3InstalledArmRuntime,
  threadId: string,
  raw: string,
): Promise<void> {
  await writeFile(
    join(
      runtime.plan.paths.codexHome,
      "sessions",
      "2026",
      "07",
      "15",
      `rollout-2026-07-15T12-00-00-${threadId}.jsonl`,
    ),
    raw,
    "utf8",
  );
}

function transcriptJsonl(input: {
  assistantText: string;
  threadId: string;
  userText: string;
}): string {
  return [
    { payload: { id: input.threadId }, type: "session_meta" },
    {
      payload: {
        content: [{ text: input.userText, type: "input_text" }],
        role: "user",
        type: "message",
      },
      type: "response_item",
    },
    {
      payload: {
        content: [{ text: input.assistantText, type: "output_text" }],
        role: "assistant",
        type: "message",
      },
      type: "response_item",
    },
  ].map((line) => JSON.stringify(line)).join("\n") + "\n";
}

function successfulInspection(
  sessionDigest: string,
): BoundaryProcessResult {
  return {
    durationMs: 1,
    exitCode: 0,
    stderr: "",
    stdout: `${JSON.stringify({
      events: [{
        command: "turn-end",
        contentPreview: "safe preview",
        linkedRecordIds: [{ id: "memory-stop-001", type: "memory" }],
        recallHitCount: 0,
        recalledBy: [],
        sessionDigest,
        status: "committed",
      }],
      host: "codex",
    })}\n`,
    timedOut: false,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
