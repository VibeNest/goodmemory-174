import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CodexRunResult } from "../../scripts/codex-coding-effect/codex-runner";
import type { WorkspacePatch } from "../../scripts/codex-coding-effect/patch";
import {
  runEvaluatorTest,
  scoreCodexStage,
} from "../../scripts/codex-coding-effect/test-scoring";
import type {
  EvaluatorTestResult,
} from "../../scripts/codex-coding-effect/test-scoring";

function codex(status: CodexRunResult["status"] = "completed"): CodexRunResult {
  return {
    durationMs: 1,
    events: [],
    exitCode: status === "non-zero-exit" ? 1 : 0,
    normalized: status === "completed" ? {
      commands: [],
      fileChanges: [],
      finalMessage: "Done",
      finalMessageEventIndex: 0,
      threadId: "thread-1",
      threadStartedEventIndex: 0,
      usage: null,
      usageEventIndex: null,
    } : null,
    status,
    stderr: "",
    stdout: "",
    timedOut: status === "timed-out",
  };
}

function patch(overrides: Partial<WorkspacePatch> = {}): WorkspacePatch {
  return {
    baseCommit: "a".repeat(40),
    changedFiles: ["src/value.ts"],
    diff: "diff",
    forbiddenFiles: [],
    hasPatch: true,
    sha256: "b".repeat(64),
    untrackedFiles: [],
    ...overrides,
  };
}

function testResult(
  kind: EvaluatorTestResult["kind"],
  status: EvaluatorTestResult["status"] = "passed",
): EvaluatorTestResult {
  return {
    command: ["bun", "test"],
    durationMs: 1,
    exitCode: status === "failed" ? 1 : 0,
    kind,
    status,
    stderr: "",
    stdout: "",
  };
}

describe("Codex coding-effect evaluator tests", () => {
  it("resolves evaluatorRoot placeholders outside the agent workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-evaluator-test-"));
    try {
      const workspace = join(root, "workspace");
      const evaluatorRoot = join(root, "evaluator");
      await mkdir(workspace, { recursive: true });
      await mkdir(evaluatorRoot, { recursive: true });
      await writeFile(join(evaluatorRoot, "pass.ts"), "process.exit(0);\n");

      const result = await runEvaluatorTest({
        command: [process.execPath, "{evaluatorRoot}/pass.ts"],
        cwd: workspace,
        evaluatorRoot,
        kind: "fail-to-pass",
        timeoutMs: 2_000,
      });

      expect(result.status).toBe("passed");
      expect(result.command[1]).toBe(join(evaluatorRoot, "pass.ts"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("classifies test failure, timeout, and harness startup separately", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "goodmemory-evaluator-status-"));
    try {
      const evaluatorRoot = `${cwd}-external-evaluator`;
      const failed = await runEvaluatorTest({
        command: [process.execPath, "-e", "process.exit(3)"],
        cwd,
        evaluatorRoot,
        kind: "fail-to-pass",
        timeoutMs: 2_000,
      });
      expect(failed.status).toBe("failed");
      expect(failed.exitCode).toBe(3);

      const timedOut = await runEvaluatorTest({
        command: [process.execPath, "-e", "await Bun.sleep(5000)"],
        cwd,
        evaluatorRoot,
        kind: "fail-to-pass",
        timeoutMs: 30,
      });
      expect(timedOut.status).toBe("timed-out");

      const broken = await runEvaluatorTest({
        command: [join(cwd, "missing-evaluator")],
        cwd,
        evaluatorRoot,
        kind: "fail-to-pass",
        timeoutMs: 2_000,
      });
      expect(broken.status).toBe("infrastructure-failure");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("rejects unknown command placeholders", async () => {
    await expect(runEvaluatorTest({
      command: [process.execPath, "{goldPatch}/answer.ts"],
      cwd: "/tmp",
      evaluatorRoot: "/evaluator",
      kind: "fail-to-pass",
      timeoutMs: 2_000,
    })).rejects.toThrow("unsupported evaluator command placeholder {goldPatch}");
  });

  it("rejects an evaluator root that overlaps the agent workspace", async () => {
    await expect(runEvaluatorTest({
      command: [process.execPath, "-e", "process.exit(0)"],
      cwd: "/tmp/codex-workspace",
      evaluatorRoot: "/tmp/codex-workspace/evaluator",
      kind: "fail-to-pass",
      timeoutMs: 2_000,
    })).rejects.toThrow("evaluatorRoot must not overlap the agent workspace");
  });
});

describe("Codex coding-effect deterministic stage score", () => {
  it("resolves only when patch and both hidden test classes pass", () => {
    expect(scoreCodexStage({
      codex: codex(),
      failToPass: testResult("fail-to-pass"),
      passToPass: testResult("pass-to-pass"),
      patch: patch(),
    })).toEqual({
      disposition: "finalized",
      executionFailureStage: null,
      resolved: true,
      taskFailureReasons: [],
    });
  });

  it("retains fail-to-pass failures and protection regressions", () => {
    expect(scoreCodexStage({
      codex: codex(),
      failToPass: testResult("fail-to-pass", "failed"),
      passToPass: testResult("pass-to-pass"),
      patch: patch(),
    }).taskFailureReasons).toContain("hidden-fail-to-pass-failed");

    expect(scoreCodexStage({
      codex: codex(),
      failToPass: testResult("fail-to-pass"),
      passToPass: testResult("pass-to-pass", "failed"),
      patch: patch(),
    }).taskFailureReasons).toContain("pass-to-pass-regression");
  });

  it("retains no-patch, forbidden-path, untracked, and agent timeout semantics", () => {
    expect(scoreCodexStage({
      codex: codex(),
      failToPass: testResult("fail-to-pass"),
      passToPass: testResult("pass-to-pass"),
      patch: patch({ changedFiles: [], diff: "", hasPatch: false, sha256: null }),
    }).taskFailureReasons).toContain("no-patch");

    expect(scoreCodexStage({
      codex: codex(),
      failToPass: testResult("fail-to-pass"),
      passToPass: testResult("pass-to-pass"),
      patch: patch({ forbiddenFiles: ["evaluator/hidden.test.ts"] }),
    }).taskFailureReasons).toContain("forbidden-file-change");

    expect(scoreCodexStage({
      codex: codex(),
      failToPass: testResult("fail-to-pass"),
      passToPass: testResult("pass-to-pass"),
      patch: patch({
        changedFiles: ["src/new.ts"],
        untrackedFiles: [{ path: "src/new.ts", sha256: "c".repeat(64), size: 4 }],
      }),
    }).resolved).toBe(true);

    expect(scoreCodexStage({
      codex: codex("timed-out"),
      failToPass: testResult("fail-to-pass"),
      passToPass: testResult("pass-to-pass"),
      patch: patch(),
    })).toMatchObject({
      disposition: "finalized",
      resolved: false,
      taskFailureReasons: ["codex-timeout"],
    });
  });

  it("classifies a broken evaluator as infrastructure, not a task failure", () => {
    expect(scoreCodexStage({
      codex: codex(),
      failToPass: testResult("fail-to-pass", "infrastructure-failure"),
      passToPass: testResult("pass-to-pass"),
      patch: patch(),
    })).toEqual({
      disposition: "infrastructure-failure",
      executionFailureStage: "test-harness-startup",
      resolved: false,
      taskFailureReasons: [],
    });
  });

  it("counts a running hidden test timeout as a finalized task failure", () => {
    expect(scoreCodexStage({
      codex: codex(),
      failToPass: testResult("fail-to-pass", "timed-out"),
      passToPass: testResult("pass-to-pass"),
      patch: patch(),
    })).toMatchObject({
      disposition: "finalized",
      resolved: false,
      taskFailureReasons: ["hidden-test-timeout"],
    });
  });
});
