import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { z } from "zod";

import { runBoundaryProcess } from "./process";
import type {
  BoundaryProcessRequest,
  BoundaryProcessResult,
} from "./process";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const gitObjectSchema = z.string().regex(/^[a-f0-9]{40}$/u);

const probeEvidenceSchema = z.object({
  bootstrapSha256: sha256Schema.nullable(),
  command: z.array(z.string().min(1)).min(1),
  durationMs: z.number().nonnegative(),
  executableSha256: sha256Schema,
  exitCode: z.number().int().nullable(),
  expectation: z.enum(["fail-with-fingerprint", "pass"]),
  fingerprintMatched: z.boolean().nullable(),
  fingerprintSha256: z.array(sha256Schema),
  outputSha256: sha256Schema,
  spawnError: z.string().min(1).optional(),
  sourceSha256: sha256Schema.nullable(),
  status: z.enum(["failed-as-expected", "not-started", "passed", "unexpected-result"]),
  timedOut: z.boolean(),
}).strict();

const baseHealthEvidenceSchema = z.object({
  commit: gitObjectSchema,
  dependencyLocks: z.array(z.object({
    path: z.string().min(1),
    sha256: sha256Schema,
  }).strict()),
  hiddenEvaluatorLifecycle: z.literal("stdin-data-url-no-file"),
  passed: z.boolean(),
  probes: z.object({
    failToPass: probeEvidenceSchema,
    passToPass: probeEvidenceSchema,
    visible: probeEvidenceSchema,
  }).strict(),
  reasons: z.array(z.string().min(1)),
  schemaVersion: z.literal(1),
  statusAfter: z.string(),
  statusBefore: z.string(),
  tree: gitObjectSchema,
}).strict().superRefine((evidence, context) => {
  if (
    evidence.passed !== (evidence.reasons.length === 0) ||
    evidence.probes.visible.expectation !== "pass" ||
    evidence.probes.passToPass.expectation !== "pass" ||
    evidence.probes.failToPass.expectation !== "fail-with-fingerprint" ||
    evidence.probes.visible.fingerprintMatched !== null ||
    evidence.probes.passToPass.fingerprintMatched !== null ||
    evidence.probes.failToPass.fingerprintMatched === null ||
    evidence.probes.visible.sourceSha256 !== null ||
    evidence.probes.visible.bootstrapSha256 !== null ||
    evidence.probes.failToPass.sourceSha256 === null ||
    evidence.probes.failToPass.bootstrapSha256 === null ||
    evidence.probes.passToPass.sourceSha256 === null ||
    evidence.probes.passToPass.bootstrapSha256 === null
  ) {
    context.addIssue({
      code: "custom",
      message: "C3 base-health probe semantics are inconsistent",
    });
  }
});

export type C3BaseHealthEvidence = z.infer<typeof baseHealthEvidenceSchema>;

const DEPENDENCY_LOCK_NAMES = [
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
] as const;

const HIDDEN_EVALUATOR_BOOTSTRAP = [
  "const source = await new Response(Bun.stdin.stream()).text();",
  "const encoded = Buffer.from(source).toString('base64');",
  "await import(`data:text/javascript;base64,${encoded}`);",
].join("\n");

export async function runC3BaseHealthProbe(input: {
  bunExecutable: string;
  env?: Record<string, string | undefined>;
  expectedCommit: string;
  expectedFailToPassOutputFragments: readonly string[];
  failToPassSource: string;
  passToPassSource: string;
  runProcess?: (
    request: BoundaryProcessRequest,
  ) => Promise<BoundaryProcessResult>;
  timeoutMs?: number;
  visibleCommand: readonly string[];
  workspace: string;
}): Promise<C3BaseHealthEvidence> {
  if (input.expectedFailToPassOutputFragments.length === 0) {
    throw new Error("C3 base-health requires a frozen failure fingerprint");
  }
  const [commit, dependencyLocks, statusBefore, tree] = await Promise.all([
    runGit(input.workspace, ["rev-parse", "HEAD"]),
    collectDependencyLocks(input.workspace),
    runGit(input.workspace, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]),
    runGit(input.workspace, ["rev-parse", "HEAD^{tree}"]),
  ]);
  const reasons: string[] = [];
  if (commit !== input.expectedCommit) {
    reasons.push("base snapshot commit does not match the frozen commit");
  }
  if (statusBefore.length > 0) {
    reasons.push("base workspace was dirty before the health probe");
  }

  const run = input.runProcess ?? runBoundaryProcess;
  const shouldRun = reasons.length === 0;
  const visible = await runProbe({
    command: input.visibleCommand,
    env: input.env,
    expectation: "pass",
    run,
    shouldRun,
    timeoutMs: input.timeoutMs,
    workspace: input.workspace,
  });
  const [failToPass, passToPass] = await Promise.all([
    runProbe({
      command: [input.bunExecutable, "-e", HIDDEN_EVALUATOR_BOOTSTRAP],
      env: input.env,
      expectation: "fail-with-fingerprint",
      expectedOutputFragments: input.expectedFailToPassOutputFragments,
      run,
      shouldRun: shouldRun && visible.status === "passed",
      source: input.failToPassSource,
      timeoutMs: input.timeoutMs,
      workspace: input.workspace,
    }),
    runProbe({
      command: [input.bunExecutable, "-e", HIDDEN_EVALUATOR_BOOTSTRAP],
      env: input.env,
      expectation: "pass",
      run,
      shouldRun: shouldRun && visible.status === "passed",
      source: input.passToPassSource,
      timeoutMs: input.timeoutMs,
      workspace: input.workspace,
    }),
  ]);
  if (visible.status !== "passed") {
    reasons.push("visible base-health probe did not pass");
  }
  if (failToPass.status !== "failed-as-expected") {
    reasons.push(
      failToPass.fingerprintMatched === false
        ? "fail-to-pass probe did not match the frozen failure fingerprint"
        : failToPass.exitCode === 0
        ? "fail-to-pass probe unexpectedly passed on the base snapshot"
        : "fail-to-pass probe did not fail predictably",
    );
  }
  if (passToPass.status !== "passed") {
    reasons.push("pass-to-pass protection probe did not pass");
  }

  const [commitAfter, dependencyLocksAfter, statusAfter, treeAfter] =
    await Promise.all([
      runGit(input.workspace, ["rev-parse", "HEAD"]),
      collectDependencyLocks(input.workspace),
      runGit(input.workspace, [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ]),
      runGit(input.workspace, ["rev-parse", "HEAD^{tree}"]),
    ]);
  if (statusAfter !== statusBefore) {
    reasons.push("base-health command changed the live workspace");
  }
  if (commitAfter !== commit || treeAfter !== tree) {
    reasons.push("base-health command changed the frozen snapshot identity");
  }
  if (JSON.stringify(dependencyLocksAfter) !== JSON.stringify(dependencyLocks)) {
    reasons.push("base-health command changed dependency lock files");
  }

  return parseC3BaseHealthEvidence({
    commit,
    dependencyLocks,
    hiddenEvaluatorLifecycle: "stdin-data-url-no-file",
    passed: reasons.length === 0,
    probes: { failToPass, passToPass, visible },
    reasons,
    schemaVersion: 1,
    statusAfter,
    statusBefore,
    tree,
  });
}

export function parseC3BaseHealthEvidence(
  value: unknown,
): C3BaseHealthEvidence {
  const result = baseHealthEvidenceSchema.safeParse(value);
  if (!result.success) {
    throw new Error("invalid C3 base-health evidence");
  }
  return result.data;
}

export function assertC3BaseHealthPassed(
  evidence: C3BaseHealthEvidence,
): C3BaseHealthEvidence & { passed: true; reasons: [] } {
  const parsed = parseC3BaseHealthEvidence(evidence);
  if (!parsed.passed) {
    throw new Error(`C3 live base-health failed: ${parsed.reasons.join("; ")}`);
  }
  return parsed as C3BaseHealthEvidence & { passed: true; reasons: [] };
}

export function serializeC3BaseHealthEvidence(
  evidence: C3BaseHealthEvidence,
): string {
  return `${JSON.stringify(parseC3BaseHealthEvidence(evidence), null, 2)}\n`;
}

async function runProbe(input: {
  command: readonly string[];
  env?: Record<string, string | undefined>;
  expectation: "fail-with-fingerprint" | "pass";
  expectedOutputFragments?: readonly string[];
  run: (request: BoundaryProcessRequest) => Promise<BoundaryProcessResult>;
  shouldRun: boolean;
  source?: string;
  timeoutMs?: number;
  workspace: string;
}) {
  const command = [...input.command];
  const executable = command[0];
  if (executable === undefined) {
    throw new Error("C3 base-health probe command cannot be empty");
  }
  const executablePath = await resolveExecutable(executable);
  const result = input.shouldRun
    ? await input.run({
        args: command.slice(1),
        cwd: input.workspace,
        ...(input.env === undefined ? {} : { env: input.env }),
        executable: executablePath,
        ...(input.source === undefined ? {} : { stdin: input.source }),
        timeoutMs: input.timeoutMs ?? 300_000,
      })
    : notStartedProcessResult();
  const output = `${result.stdout}\n${result.stderr}`;
  const expectedOutputFragments = input.expectedOutputFragments ?? [];
  const fingerprintMatched = input.expectation === "fail-with-fingerprint"
    ? expectedOutputFragments.every((fragment) => output.includes(fragment))
    : null;
  const processCompleted = result.spawnError === undefined && !result.timedOut;
  const status = !input.shouldRun
    ? "not-started"
    : input.expectation === "pass"
    ? processCompleted && result.exitCode === 0
      ? "passed"
      : "unexpected-result"
    : processCompleted && result.exitCode !== 0 && fingerprintMatched
    ? "failed-as-expected"
    : "unexpected-result";
  return {
    bootstrapSha256: input.source === undefined
      ? null
      : sha256(HIDDEN_EVALUATOR_BOOTSTRAP),
    command,
    durationMs: result.durationMs,
    executableSha256: sha256(await readFile(executablePath)),
    exitCode: result.exitCode,
    expectation: input.expectation,
    fingerprintMatched,
    fingerprintSha256: expectedOutputFragments.map(sha256),
    outputSha256: sha256(output),
    ...(result.spawnError === undefined ? {} : { spawnError: result.spawnError }),
    sourceSha256: input.source === undefined ? null : sha256(input.source),
    status,
    timedOut: result.timedOut,
  } as const;
}

async function collectDependencyLocks(
  workspace: string,
): Promise<Array<{ path: string; sha256: string }>> {
  const locks: Array<{ path: string; sha256: string }> = [];
  for (const name of DEPENDENCY_LOCK_NAMES) {
    const path = join(workspace, name);
    try {
      const stats = await lstat(path);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new Error(`C3 dependency lock must be a regular file: ${name}`);
      }
      locks.push({ path: name, sha256: sha256(await readFile(path)) });
    } catch (error) {
      if (!hasErrorCode(error, "ENOENT")) {
        throw error;
      }
    }
  }
  return locks;
}

async function resolveExecutable(value: string): Promise<string> {
  const candidate = isAbsolute(value) || value.includes("/") || value.includes("\\")
    ? resolve(value)
    : Bun.which(value);
  if (candidate === null || candidate === undefined) {
    throw new Error(`C3 base-health executable is unavailable: ${value}`);
  }
  return realpath(candidate);
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await runBoundaryProcess({
    args,
    cwd,
    executable: "git",
    timeoutMs: 60_000,
  });
  if (
    result.spawnError !== undefined ||
    result.timedOut ||
    result.exitCode !== 0
  ) {
    throw new Error(`C3 base-health git ${args[0] ?? "command"} failed`);
  }
  return result.stdout.trim();
}

function notStartedProcessResult(): BoundaryProcessResult {
  return {
    durationMs: 0,
    exitCode: null,
    spawnError: "base snapshot preconditions failed",
    stderr: "",
    stdout: "",
    timedOut: false,
  };
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code;
}
