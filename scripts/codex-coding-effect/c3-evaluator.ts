import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { applyWorkspacePatch } from "./patch";
import type { WorkspacePatch } from "./patch";
import type { CodexRunResult } from "./codex-runner";
import type { CodexCodingEffectLogger } from "./logging";
import { runEvaluatorTest, scoreCodexStage } from "./test-scoring";
import type {
  CodexStageScore,
  EvaluatorTestResult,
} from "./test-scoring";
import {
  prepareIsolatedWorkspace,
  releaseIsolatedWorkspace,
} from "./workspace";
import type {
  BoundaryProcessRequest,
  BoundaryProcessResult,
} from "./process";

export interface C3AgentArmExecution {
  codex: CodexRunResult;
  patch: WorkspacePatch;
}

export interface C3EvaluatedArmExecution extends C3AgentArmExecution {
  failToPass: EvaluatorTestResult;
  passToPass: EvaluatorTestResult;
  score: CodexStageScore;
}

export interface C3EvaluateArmInput {
  agent: C3AgentArmExecution;
  evaluationWorkspace: string;
  evaluatorEnv: Record<string, string>;
  evaluatorRoot: string;
  expectedCommit: string;
  failToPassCommand: readonly string[];
  logger: CodexCodingEffectLogger;
  passToPassCommand: readonly string[];
  runProcess?: (
    request: BoundaryProcessRequest,
  ) => Promise<BoundaryProcessResult>;
  sourceRepository: string;
  testTimeoutMs: number;
}

export async function evaluateC3ArmSafely(
  input: C3EvaluateArmInput,
): Promise<C3EvaluatedArmExecution> {
  try {
    return await evaluateArm(input);
  } catch (error) {
    return c3EvaluatorInfrastructureFailure(input, errorMessage(error));
  }
}

export function c3EvaluatorInfrastructureFailure(
  input: C3EvaluateArmInput,
  reason: string,
): C3EvaluatedArmExecution {
  const failure = (
    kind: "fail-to-pass" | "pass-to-pass",
    command: readonly string[],
  ): EvaluatorTestResult => ({
    command: [...command],
    durationMs: 0,
    exitCode: null,
    kind,
    status: "infrastructure-failure",
    stderr: `C3 evaluator infrastructure failed: ${reason}`,
    stdout: "",
  });
  const failToPass = failure("fail-to-pass", input.failToPassCommand);
  const passToPass = failure("pass-to-pass", input.passToPassCommand);
  return {
    ...input.agent,
    failToPass,
    passToPass,
    score: scoreCodexStage({
      codex: input.agent.codex,
      failToPass,
      passToPass,
      patch: input.agent.patch,
    }),
  };
}

export async function verifyC3EvaluatorFiles(
  evaluatorRoot: string,
  commitments: ReadonlyArray<{ relativePath: string; sha256: string }>,
): Promise<void> {
  validateC3EvaluatorCommitments(commitments);
  const rootInfo = await lstat(evaluatorRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("C3 evaluator root must be a real directory");
  }
  const actualFiles = await collectEvaluatorFiles(evaluatorRoot, evaluatorRoot);
  const expected = [...commitments].sort((first, second) =>
    first.relativePath.localeCompare(second.relativePath)
  );
  if (
    actualFiles.length !== expected.length ||
    actualFiles.some((file, index) => file.relativePath !== expected[index]?.relativePath)
  ) {
    throw new Error("C3 evaluator files do not match the committed manifest");
  }
  for (const [index, file] of actualFiles.entries()) {
    if (await sha256File(file.path) !== expected[index]?.sha256) {
      throw new Error(`C3 evaluator hash mismatch: ${file.relativePath}`);
    }
  }
}

export function validateC3EvaluatorCommitments(
  commitments: ReadonlyArray<{ relativePath: string; sha256: string }>,
): void {
  if (commitments.length === 0) {
    throw new Error("C3 evaluator manifest must not be empty");
  }
  const paths = new Set<string>();
  for (const commitment of commitments) {
    const normalized = commitment.relativePath.replaceAll("\\", "/");
    if (
      normalized !== commitment.relativePath ||
      normalized.length === 0 ||
      isAbsolute(normalized) ||
      normalized.split("/").some((segment) => segment === "" || segment === "..") ||
      !/^[a-f0-9]{64}$/u.test(commitment.sha256) ||
      paths.has(normalized)
    ) {
      throw new Error("invalid C3 evaluator file commitment");
    }
    paths.add(normalized);
  }
}

export async function assertC3WorkspaceClean(workspace: string): Promise<void> {
  const child = Bun.spawn({
    cmd: ["git", "status", "--porcelain=v1", "--untracked-files=all"],
    cwd: workspace,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`failed to audit C3 workspace status: ${stderr.trim()}`);
  }
  if (stdout.trim().length > 0) {
    throw new Error(`C3 workspace changed before Codex execution: ${stdout.trim()}`);
  }
}

export async function createC3EvaluatorEnvironment(input: {
  bunExecutable: string;
  outputDirectory: string;
}): Promise<Record<string, string>> {
  const home = join(input.outputDirectory, "evaluator-home");
  const temp = join(input.outputDirectory, "evaluator-tmp");
  await Promise.all([
    mkdir(home, { recursive: true }),
    mkdir(temp, { recursive: true }),
  ]);
  return {
    CI: "1",
    HOME: home,
    LANG: process.env.LANG ?? "en_US.UTF-8",
    NO_COLOR: "1",
    PATH: [...new Set([
      dirname(resolve(input.bunExecutable)),
      "/usr/bin",
      "/bin",
    ])].join(":"),
    TMPDIR: temp,
  };
}

async function evaluateArm(
  input: C3EvaluateArmInput,
): Promise<C3EvaluatedArmExecution> {
  await prepareIsolatedWorkspace({
    destination: input.evaluationWorkspace,
    expectedCommit: input.expectedCommit,
    logger: input.logger,
    sourceRepository: input.sourceRepository,
  });
  try {
    await applyWorkspacePatch({
      logger: input.logger,
      patch: input.agent.patch,
      workspace: input.evaluationWorkspace,
    });
    const failToPass = await runEvaluatorTest({
      command: input.failToPassCommand,
      cwd: input.evaluationWorkspace,
      env: input.evaluatorEnv,
      evaluatorRoot: input.evaluatorRoot,
      kind: "fail-to-pass",
      logger: input.logger,
      runProcess: input.runProcess,
      timeoutMs: input.testTimeoutMs,
    });
    const passToPass = await runEvaluatorTest({
      command: input.passToPassCommand,
      cwd: input.evaluationWorkspace,
      env: input.evaluatorEnv,
      evaluatorRoot: input.evaluatorRoot,
      kind: "pass-to-pass",
      logger: input.logger,
      runProcess: input.runProcess,
      timeoutMs: input.testTimeoutMs,
    });
    return {
      ...input.agent,
      failToPass,
      passToPass,
      score: scoreCodexStage({
        codex: input.agent.codex,
        failToPass,
        passToPass,
        patch: input.agent.patch,
      }),
    };
  } finally {
    await releaseIsolatedWorkspace({
      path: input.evaluationWorkspace,
      sourceRepository: input.sourceRepository,
    });
  }
}

async function collectEvaluatorFiles(
  root: string,
  directory: string,
): Promise<Array<{ path: string; relativePath: string }>> {
  const files: Array<{ path: string; relativePath: string }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error("C3 evaluator tree must not contain symbolic links");
    }
    if (entry.isDirectory()) {
      files.push(...await collectEvaluatorFiles(root, path));
    } else if (entry.isFile()) {
      files.push({
        path,
        relativePath: relative(root, path).split(sep).join("/"),
      });
    } else {
      throw new Error("C3 evaluator tree contains an unsupported entry");
    }
  }
  return files.sort((first, second) =>
    first.relativePath.localeCompare(second.relativePath)
  );
}

async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
