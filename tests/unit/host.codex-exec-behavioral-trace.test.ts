import { describe, expect, it } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCodexBehavioralTrace,
  parseCodexExecEventLine,
  resolveCodexExecRuntime,
  unwrapCodexShellCommand,
} from "../../src/host/codexExecBehavioralTrace";

function parseCommandAction(command: string) {
  const [name, ...args] = command.trim().split(/\s+/u);
  if (!name) {
    return undefined;
  }

  return {
    kind: name === "QuickCheck" ? "tool_call" : "command",
    name,
    ...(args.length > 0 ? { args } : {}),
    raw: command.trim(),
  } as const;
}

function parseWarningAction(text: string) {
  const trimmed = text.trim();
  if (!/^warning\b/iu.test(trimmed)) {
    return undefined;
  }

  return {
    kind: "warning",
    name: trimmed.includes("approval") ? "approval_required" : "warning",
    raw: trimmed,
  } as const;
}

describe("host codex exec behavioral trace", () => {
  it("parses Codex exec event lines and unwraps shell wrappers", () => {
    expect(
      parseCodexExecEventLine(
        `{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"/bin/zsh -lc 'printf ok'","aggregated_output":"ok","exit_code":0,"status":"completed"}}`,
      ),
    ).toMatchObject({
      type: "item.completed",
      item: {
        aggregated_output: "ok",
        command: "/bin/zsh -lc 'printf ok'",
        exit_code: 0,
        id: "item_1",
        status: "completed",
        type: "command_execution",
      },
    });

    expect(unwrapCodexShellCommand("/bin/zsh -lc 'printf ok'")).toBe("printf ok");
    expect(unwrapCodexShellCommand("/bin/zsh -lc QuickCheck --network")).toBe(
      "QuickCheck --network",
    );
  });

  it("resolves runtime binaries from env overrides first, injected lookup second, and PATH fallback when Bun.which is unavailable", async () => {
    expect(
      resolveCodexExecRuntime({
        env: {
          GOODMEMORY_CODEX_BINARY: "/tmp/codex-custom",
          GOODMEMORY_NODE_BINARY: "/tmp/node-custom",
        },
        processExecPath: "/opt/bun/bin/bun",
        which: () => "/usr/local/bin/codex",
      }),
    ).toEqual({
      codexBinary: "/tmp/codex-custom",
      nodeBinary: "/tmp/node-custom",
    });

    expect(
      resolveCodexExecRuntime({
        env: {},
        processExecPath: "/opt/bun/bin/bun",
        which: () => "/usr/local/bin/codex",
      }),
    ).toEqual({
      codexBinary: "/usr/local/bin/codex",
      nodeBinary: "/opt/bun/bin/bun",
    });

    const originalBunWhich = Bun.which;
    const pathDir = await mkdtemp(join(tmpdir(), "goodmemory-codex-bin-"));
    const codexBinary = join(
      pathDir,
      process.platform === "win32" ? "codex.cmd" : "codex",
    );

    try {
      await writeFile(
        codexBinary,
        process.platform === "win32"
          ? "@echo off\r\necho codex\r\n"
          : "#!/bin/sh\necho codex\n",
        "utf8",
      );

      if (process.platform !== "win32") {
        await chmod(codexBinary, 0o755);
      }

      Bun.which = undefined as unknown as typeof Bun.which;

      expect(
        resolveCodexExecRuntime({
          env: {
            PATH: pathDir,
            ...(process.platform === "win32"
              ? {
                  PATHEXT: ".CMD;.EXE",
                }
              : {}),
          },
          processExecPath: "/opt/node/bin/node",
        }),
      ).toEqual({
        codexBinary,
        nodeBinary: "/opt/node/bin/node",
      });
    } finally {
      Bun.which = originalBunWhich;
      await rm(pathDir, { recursive: true, force: true });
    }

    const finalBunWhich = Bun.which;

    try {
      Bun.which = undefined as unknown as typeof Bun.which;

      expect(() =>
        resolveCodexExecRuntime({
          env: {
            PATH: "",
          },
          processExecPath: "/opt/node/bin/node",
        }),
      ).toThrow("Could not resolve the Codex binary");
    } finally {
      Bun.which = finalBunWhich;
    }
  });

  it("maps native command lifecycle events to host-lifecycle success/failure trace events", () => {
    const success = buildCodexBehavioralTrace({
      cue: "printf ok",
      parseCommandAction,
      parseWarningAction,
      traceId: "trace-success",
      turn: {
        events: [
          {
            type: "item.completed",
            item: {
              id: "item_0",
              text: "Running `printf ok` and returning its output.",
              type: "agent_message",
            },
          },
          {
            type: "item.started",
            item: {
              command: "/bin/zsh -lc 'printf ok'",
              exit_code: null,
              id: "item_1",
              status: "in_progress",
              type: "command_execution",
            },
          },
          {
            type: "item.completed",
            item: {
              aggregated_output: "ok",
              command: "/bin/zsh -lc 'printf ok'",
              exit_code: 0,
              id: "item_1",
              status: "completed",
              type: "command_execution",
            },
          },
        ],
        stderr: "",
        stdout: "",
      },
    });

    expect(success.answer).toBe("printf ok");
    expect(success.trace?.events).toEqual([
      {
        actionKind: "command",
        actionName: "printf",
        args: ["ok"],
        outcome: "success",
        outcomeSource: "host_lifecycle",
        raw: "printf ok",
        stepIndex: 0,
      },
    ]);

    const failure = buildCodexBehavioralTrace({
      cue: "missing command",
      parseCommandAction,
      parseWarningAction,
      traceId: "trace-failure",
      turn: {
        events: [
          {
            type: "item.started",
            item: {
              command: "/bin/zsh -lc does_not_exist_123",
              exit_code: null,
              id: "item_1",
              status: "in_progress",
              type: "command_execution",
            },
          },
          {
            type: "item.completed",
            item: {
              aggregated_output: "zsh:1: command not found: does_not_exist_123\n",
              command: "/bin/zsh -lc does_not_exist_123",
              exit_code: 127,
              id: "item_1",
              status: "failed",
              type: "command_execution",
            },
          },
        ],
        stderr: "",
        stdout: "",
      },
    });

    expect(failure.trace?.events).toEqual([
      {
        actionKind: "command",
        actionName: "does_not_exist_123",
        evidenceExcerpt: "zsh:1: command not found: does_not_exist_123",
        outcome: "failure",
        outcomeSource: "host_lifecycle",
        raw: "does_not_exist_123",
        stepIndex: 0,
      },
    ]);
  });

  it("records native targeted correction lineage after a failed command", () => {
    const result = buildCodexBehavioralTrace({
      cue: "timeout then warn",
      parseCommandAction,
      parseWarningAction,
      traceId: "trace-correction",
      turn: {
        events: [
          {
            type: "item.started",
            item: {
              command: "/bin/zsh -lc does_not_exist_123",
              exit_code: null,
              id: "item_1",
              status: "in_progress",
              type: "command_execution",
            },
          },
          {
            type: "item.completed",
            item: {
              aggregated_output: "zsh:1: command not found: does_not_exist_123\n",
              command: "/bin/zsh -lc does_not_exist_123",
              exit_code: 127,
              id: "item_1",
              status: "failed",
              type: "command_execution",
            },
          },
          {
            type: "item.completed",
            item: {
              id: "item_2",
              text: "Warning: switch to QuickCheck --network.",
              type: "agent_message",
            },
          },
          {
            type: "item.started",
            item: {
              command: "/bin/zsh -lc 'QuickCheck --network'",
              exit_code: null,
              id: "item_3",
              status: "in_progress",
              type: "command_execution",
            },
          },
          {
            type: "item.completed",
            item: {
              aggregated_output: "network ok",
              command: "/bin/zsh -lc 'QuickCheck --network'",
              exit_code: 0,
              id: "item_3",
              status: "completed",
              type: "command_execution",
            },
          },
        ],
        stderr: "",
        stdout: "",
      },
    });

    expect(result.trace?.events).toEqual([
      {
        actionKind: "command",
        actionName: "does_not_exist_123",
        evidenceExcerpt: "zsh:1: command not found: does_not_exist_123",
        outcome: "failure",
        outcomeSource: "host_lifecycle",
        raw: "does_not_exist_123",
        stepIndex: 0,
      },
      {
        actionKind: "warning",
        actionName: "warning",
        correctionOfStepIndex: 0,
        outcome: "user_corrected",
        outcomeSource: "warning_message",
        raw: "Warning: switch to QuickCheck --network.",
        stepIndex: 1,
        turnId: "item_2",
      },
      {
        actionKind: "tool_call",
        actionName: "QuickCheck",
        args: ["--network"],
        correctionOfStepIndex: 0,
        outcome: "success",
        outcomeSource: "host_lifecycle",
        raw: "QuickCheck --network",
        stepIndex: 2,
      },
    ]);
  });

  it("turns unfinished command executions into timeout outcomes and preserves warning-only provenance", () => {
    const timeout = buildCodexBehavioralTrace({
      cue: "timeout",
      parseCommandAction,
      parseWarningAction,
      traceId: "trace-timeout",
      turn: {
        events: [
          {
            type: "item.started",
            item: {
              command: "/bin/zsh -lc 'printf still-running'",
              exit_code: null,
              id: "item_1",
              status: "in_progress",
              type: "command_execution",
            },
          },
        ],
        stderr: "",
        stdout: "",
        timedOut: true,
        timeoutMessage: "Codex host turn timed out after 90s.",
      },
    });

    expect(timeout.trace?.events).toEqual([
      {
        actionKind: "command",
        actionName: "printf",
        args: ["still-running"],
        evidenceExcerpt: "Codex host turn timed out after 90s.",
        outcome: "timeout",
        outcomeSource: "host_lifecycle",
        raw: "printf still-running",
        stepIndex: 0,
      },
    ]);

    const warningOnly = buildCodexBehavioralTrace({
      cue: "approval warning",
      parseCommandAction,
      parseWarningAction,
      traceId: "trace-warning",
      turn: {
        events: [
          {
            type: "item.completed",
            item: {
              id: "item_0",
              text: "Warning: approval required.",
              type: "agent_message",
            },
          },
        ],
        stderr: "",
        stdout: "",
      },
    });

    expect(warningOnly.trace?.events).toEqual([
      {
        actionKind: "warning",
        actionName: "approval_required",
        outcome: "success",
        outcomeSource: "warning_message",
        raw: "Warning: approval required.",
        stepIndex: 0,
        turnId: "item_0",
      },
    ]);
  });

  it("preserves warning-first provenance when a later command runs in the same turn", () => {
    const warningThenCommand = buildCodexBehavioralTrace({
      cue: "deploy with approval warning",
      parseCommandAction,
      parseWarningAction,
      traceId: "trace-warning-first",
      turn: {
        events: [
          {
            type: "item.completed",
            item: {
              id: "item_0",
              text: "Warning: approval required before deploy --prod 512.",
              type: "agent_message",
            },
          },
          {
            type: "item.started",
            item: {
              command: "/bin/zsh -lc 'deploy --prod 512'",
              exit_code: null,
              id: "item_1",
              status: "in_progress",
              type: "command_execution",
            },
          },
          {
            type: "item.completed",
            item: {
              aggregated_output: "deployed",
              command: "/bin/zsh -lc 'deploy --prod 512'",
              exit_code: 0,
              id: "item_1",
              status: "completed",
              type: "command_execution",
            },
          },
        ],
        stderr: "",
        stdout: "",
      },
    });

    expect(warningThenCommand.trace?.events).toEqual([
      {
        actionKind: "warning",
        actionName: "approval_required",
        outcome: "success",
        outcomeSource: "warning_message",
        raw: "Warning: approval required before deploy --prod 512.",
        stepIndex: 0,
        turnId: "item_0",
      },
      {
        actionKind: "command",
        actionName: "deploy",
        args: ["--prod", "512"],
        outcome: "success",
        outcomeSource: "host_lifecycle",
        raw: "deploy --prod 512",
        stepIndex: 1,
      },
    ]);
  });
});
