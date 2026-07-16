import { isAbsolute, relative, resolve, sep } from "node:path";

import type { CodexRunResult } from "./codex-runner";
import type { CodexCodingEffectLogger } from "./logging";
import type { WorkspacePatch } from "./patch";
import { runBoundaryProcess } from "./process";

export type EvaluatorTestKind = "fail-to-pass" | "pass-to-pass" | "visible";
export type EvaluatorTestStatus =
  | "failed"
  | "infrastructure-failure"
  | "passed"
  | "timed-out";

export interface EvaluatorTestResult {
  command: string[];
  durationMs: number;
  exitCode: number | null;
  kind: EvaluatorTestKind;
  status: EvaluatorTestStatus;
  stderr: string;
  stdout: string;
}

export interface CodexStageScore {
  disposition: "finalized" | "infrastructure-failure";
  executionFailureStage: string | null;
  resolved: boolean;
  taskFailureReasons: string[];
}

export async function runEvaluatorTest(input: {
  command: readonly string[];
  cwd: string;
  env?: Record<string, string | undefined>;
  evaluatorRoot: string;
  kind: EvaluatorTestKind;
  logger?: CodexCodingEffectLogger;
  timeoutMs: number;
}): Promise<EvaluatorTestResult> {
  if (pathsOverlap(input.cwd, input.evaluatorRoot)) {
    throw new Error("evaluatorRoot must not overlap the agent workspace");
  }
  const command = resolveEvaluatorCommand(input.command, input.evaluatorRoot);
  const executable = command[0];
  if (executable === undefined) {
    throw new Error("evaluator command cannot be empty");
  }

  input.logger?.("hidden_tests_started", { kind: input.kind });
  const result = await runBoundaryProcess({
    args: command.slice(1),
    cwd: input.cwd,
    env: input.env,
    executable,
    timeoutMs: input.timeoutMs,
  });
  const status: EvaluatorTestStatus = result.spawnError !== undefined
    ? "infrastructure-failure"
    : result.timedOut
    ? "timed-out"
    : result.exitCode === 0
    ? "passed"
    : "failed";
  input.logger?.("hidden_tests_completed", {
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    kind: input.kind,
    status,
  });
  return {
    command,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    kind: input.kind,
    status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

export function scoreCodexStage(input: {
  codex: CodexRunResult;
  failToPass: EvaluatorTestResult;
  passToPass: EvaluatorTestResult;
  patch: WorkspacePatch;
}): CodexStageScore {
  if (
    input.codex.status === "not-started" ||
    input.codex.status === "spawn-failed" ||
    input.codex.status === "event-parse-failed" ||
    input.codex.status === "missing-final-message"
  ) {
    return {
      disposition: "infrastructure-failure",
      executionFailureStage: input.codex.status === "not-started"
        ? "codex-not-started"
        : input.codex.status === "spawn-failed"
        ? "codex-launch"
        : "codex-events",
      resolved: false,
      taskFailureReasons: [],
    };
  }
  if (input.codex.status === "timed-out") {
    return finalizedFailure("codex-timeout");
  }
  if (input.codex.status === "non-zero-exit") {
    return finalizedFailure("codex-non-zero-exit");
  }
  if (
    input.failToPass.status === "infrastructure-failure" ||
    input.passToPass.status === "infrastructure-failure"
  ) {
    return {
      disposition: "infrastructure-failure",
      executionFailureStage: "test-harness-startup",
      resolved: false,
      taskFailureReasons: [],
    };
  }

  const taskFailureReasons: string[] = [];
  if (!input.patch.hasPatch) {
    taskFailureReasons.push("no-patch");
  }
  if (input.patch.forbiddenFiles.length > 0) {
    taskFailureReasons.push("forbidden-file-change");
  }
  if (
    input.failToPass.status === "timed-out" ||
    input.passToPass.status === "timed-out"
  ) {
    taskFailureReasons.push("hidden-test-timeout");
  }
  if (input.failToPass.status === "failed") {
    taskFailureReasons.push("hidden-fail-to-pass-failed");
  }
  if (input.passToPass.status === "failed") {
    taskFailureReasons.push("pass-to-pass-regression");
  }

  return {
    disposition: "finalized",
    executionFailureStage: null,
    resolved: taskFailureReasons.length === 0,
    taskFailureReasons,
  };
}

function finalizedFailure(reason: string): CodexStageScore {
  return {
    disposition: "finalized",
    executionFailureStage: null,
    resolved: false,
    taskFailureReasons: [reason],
  };
}

function resolveEvaluatorCommand(
  command: readonly string[],
  evaluatorRoot: string,
): string[] {
  return command.map((argument) => argument.replace(
    /\{[a-zA-Z][a-zA-Z0-9]*\}/gu,
    (placeholder) => {
      if (placeholder !== "{evaluatorRoot}") {
        throw new Error(
          `unsupported evaluator command placeholder ${placeholder}`,
        );
      }
      return resolve(evaluatorRoot);
    },
  ));
}

function pathsOverlap(firstPath: string, secondPath: string): boolean {
  return pathIsInsideOrEqual(firstPath, secondPath) ||
    pathIsInsideOrEqual(secondPath, firstPath);
}

function pathIsInsideOrEqual(parentPath: string, candidatePath: string): boolean {
  const relativePath = relative(resolve(parentPath), resolve(candidatePath));
  return relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) &&
      relativePath !== ".." &&
      !isAbsolute(relativePath));
}
