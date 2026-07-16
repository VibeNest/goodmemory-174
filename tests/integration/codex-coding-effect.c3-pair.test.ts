import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  access,
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
  runC3FrozenPrehistoryPair,
} from "../../scripts/codex-coding-effect/c3-pair-runner";
import type {
  C3InstalledArmRuntime,
  C3NoMemoryArmRuntime,
  C3PermissionIsolationEvidence,
} from "../../scripts/codex-coding-effect/c3-runtime";
import type { CodexRunRequest, CodexRunResult } from "../../scripts/codex-coding-effect/codex-runner";

describe("Codex coding-effect C3 paired runner", () => {
  it("writes identity before selective seeding and lets hidden tests score both arms", async () => {
    await withPairFixture(async (fixture) => {
      let identityExistedAtSeed = false;
      const sequence: string[] = [];
      const result = await runPair(fixture, "paired-success", {
        onSeed: async (outputDirectory) => {
          identityExistedAtSeed = await Bun.file(
            join(outputDirectory, "run-identity.json"),
          ).exists();
        },
        sequence,
      });

      expect(identityExistedAtSeed).toBe(true);
      expect(sequence).toEqual([
        "codex:no-memory",
        "materialize-prehistory",
        "seed-installed",
        "preflight-recall",
        "codex:goodmemory-installed",
        "materialize-evaluator",
      ]);
      expect(result.cases.map((row) => ({
        arm: row.arm,
        disposition: row.disposition,
        resolved: row.resolved,
      }))).toEqual([
        { arm: "no-memory", disposition: "finalized", resolved: false },
        {
          arm: "goodmemory-installed",
          disposition: "finalized",
          resolved: true,
        },
      ]);
      expect(result.summary).toMatchObject({
        comparablePairs: 1,
        evidenceClass: "frozen-prehistory-pilot",
        memoryDiagnosticsUsedForTaskScore: false,
        outcome: "rescue",
        resolvedCount: 1,
        taskScoringSource: "deterministic-hidden-tests",
      });
      await access(join(
        fixture.root,
        "paired-success-output",
        "sealed-prehistory",
        "rollout-2026-07-15T00-00-00-11111111-1111-1111-1111-111111111111.jsonl",
      ));
      const stageEvidence = await readStageEvidence(
        join(fixture.root, "paired-success-output", "stage-evidence"),
      );
      expect(stageEvidence.find((row) =>
        row.armEvidence.arm === "goodmemory-installed"
      )?.armEvidence.hostCanary).toMatchObject({
        injectedExpectedMemoryIds: ["memory-001"],
        passed: true,
        stopCursorAdvanced: true,
      });
    });
  });

  it("keeps a missing installed injection as infrastructure failure instead of fallback", async () => {
    await withPairFixture(async (fixture) => {
      const result = await runPair(fixture, "paired-canary-failure", {
        canaryFailure: true,
      });

      expect(result.cases[1]).toMatchObject({
        arm: "goodmemory-installed",
        disposition: "infrastructure-failure",
        executionFailureStage: "goodmemory-injection",
        failToPassStatus: "passed",
        passToPassStatus: "passed",
        resolved: false,
        taskFailureReasons: [],
      });
      expect(result.summary).toMatchObject({
        comparablePairs: 0,
        infrastructureFailureCount: 1,
        outcome: "incomparable",
        resolvedCount: 0,
      });
    });
  });

  it("persists a failed recall preflight without launching the installed Codex arm", async () => {
    await withPairFixture(async (fixture) => {
      const sequence: string[] = [];
      const result = await runPair(fixture, "paired-recall-preflight-failure", {
        recallPreflightFailure: true,
        sequence,
      });

      expect(sequence).toEqual([
        "codex:no-memory",
        "materialize-prehistory",
        "seed-installed",
        "preflight-recall",
        "materialize-evaluator",
      ]);
      expect(result.cases[1]).toMatchObject({
        arm: "goodmemory-installed",
        codexStatus: "not-started",
        disposition: "infrastructure-failure",
        executionFailureStage: "goodmemory-recall-preflight",
        resolved: false,
      });
      expect(result.summary).toMatchObject({
        comparablePairs: 0,
        infrastructureFailureCount: 1,
        outcome: "incomparable",
      });
      const evidence = await readStageEvidence(join(
        fixture.root,
        "paired-recall-preflight-failure-output",
        "stage-evidence",
      ));
      expect(evidence.find((row) =>
        row.armEvidence.arm === "goodmemory-installed"
      )?.armEvidence).toMatchObject({
        hostCanary: null,
        recallPreflight: { passed: false },
      });
    });
  });

  it("converts a thrown recall preflight into durable incomparable evidence", async () => {
    await withPairFixture(async (fixture) => {
      const sequence: string[] = [];
      const result = await runPair(fixture, "paired-recall-preflight-throw", {
        recallPreflightThrow: true,
        sequence,
      });

      expect(sequence).toEqual([
        "codex:no-memory",
        "materialize-prehistory",
        "seed-installed",
        "preflight-recall",
        "materialize-evaluator",
      ]);
      expect(result.cases[1]).toMatchObject({
        arm: "goodmemory-installed",
        codexStatus: "not-started",
        disposition: "infrastructure-failure",
        executionFailureStage: "goodmemory-recall-preflight",
        resolved: false,
      });
      expect(result.summary).toMatchObject({
        comparablePairs: 0,
        infrastructureFailureCount: 1,
        outcome: "incomparable",
      });
      const evidence = await readStageEvidence(join(
        fixture.root,
        "paired-recall-preflight-throw-output",
        "stage-evidence",
      ));
      expect(evidence.find((row) =>
        row.armEvidence.arm === "goodmemory-installed"
      )?.armEvidence).toMatchObject({
        hostCanary: null,
        recallPreflight: {
          passed: false,
          reason: "injected preflight boundary failure",
        },
      });
    });
  });

  it("persists an incomparable pair when a Codex process cannot start", async () => {
    await withPairFixture(async (fixture) => {
      const result = await runPair(fixture, "paired-codex-failure", {
        noMemoryLaunchFailure: true,
      });

      expect(result.cases[0]).toMatchObject({
        arm: "no-memory",
        disposition: "infrastructure-failure",
        executionFailureStage: "codex-launch",
        resolved: false,
      });
      expect(result.summary).toMatchObject({
        comparablePairs: 0,
        infrastructureFailureCount: 1,
        outcome: "incomparable",
      });
      await access(join(
        fixture.root,
        "paired-codex-failure-output",
        "summary.json",
      ));
    });
  });

  it("persists evaluator materialization drift as infrastructure evidence", async () => {
    await withPairFixture(async (fixture) => {
      const result = await runPair(fixture, "paired-evaluator-drift", {
        corruptEvaluator: true,
      });

      expect(result.cases.every((row) =>
        row.disposition === "infrastructure-failure" &&
        row.executionFailureStage === "test-harness-startup"
      )).toBe(true);
      expect(result.summary).toMatchObject({
        comparablePairs: 0,
        infrastructureFailureCount: 2,
        outcome: "incomparable",
      });
    });
  });
});

interface PairFixture {
  authFile: string;
  commit: string;
  evaluatorFiles: ReadonlyArray<{ relativePath: string; sha256: string }>;
  failToPassBytes: string;
  evaluatorRoot: string;
  packageTarball: string;
  passToPassBytes: string;
  prehistoryBytes: string;
  prehistoryPath: string;
  prehistorySha256: string;
  root: string;
  sourceRepository: string;
}

async function withPairFixture(
  run: (fixture: PairFixture) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "goodmemory-c3-pair-"));
  const sourceRepository = join(root, "source");
  const evaluatorRoot = join(root, "evaluator");
  const authFile = join(root, "auth.json");
  const packageTarball = join(root, "goodmemory.tgz");
  const prehistoryPath = join(
    root,
    "rollout-2026-07-15T00-00-00-11111111-1111-1111-1111-111111111111.jsonl",
  );
  const prehistory = `${rolloutLine(
    "user",
    "Remember that C3 deterministic result should be resolved.",
  )}\n`;
  const failToPassBytes = [
    'import { readFile } from "node:fs/promises";',
    'const value = await readFile("deterministic-result.txt", "utf8").catch(() => "");',
    'process.exit(value === "resolved\\n" ? 0 : 1);',
    "",
  ].join("\n");
  const passToPassBytes = [
    'import { readFile } from "node:fs/promises";',
    'const value = await readFile("protected.txt", "utf8");',
    'process.exit(value === "protected\\n" ? 0 : 1);',
    "",
  ].join("\n");
  try {
    await mkdir(sourceRepository, { recursive: true });
    await Promise.all([
      writeFile(authFile, "{}\n", "utf8"),
      writeFile(packageTarball, "fake package\n", "utf8"),
      writeFile(
        join(sourceRepository, "AGENTS.md"),
        "# Shared deterministic instructions\n",
        "utf8",
      ),
      writeFile(join(sourceRepository, "protected.txt"), "protected\n", "utf8"),
    ]);
    await runGit(sourceRepository, ["init", "--quiet"]);
    await runGit(sourceRepository, ["config", "user.email", "fixture@example.test"]);
    await runGit(sourceRepository, ["config", "user.name", "Fixture"]);
    await runGit(sourceRepository, ["add", "."]);
    await runGit(sourceRepository, ["commit", "--quiet", "-m", "fixture"]);
    const commit = (await runGit(sourceRepository, ["rev-parse", "HEAD"])).trim();
    await run({
      authFile,
      commit,
      evaluatorFiles: [
        { relativePath: "fail-to-pass.ts", sha256: sha256(failToPassBytes) },
        { relativePath: "pass-to-pass.ts", sha256: sha256(passToPassBytes) },
      ],
      failToPassBytes,
      evaluatorRoot,
      packageTarball,
      passToPassBytes,
      prehistoryBytes: prehistory,
      prehistoryPath,
      prehistorySha256: sha256(prehistory),
      root,
      sourceRepository,
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function runPair(
  fixture: PairFixture,
  suffix: string,
  options: {
    canaryFailure?: boolean;
    corruptEvaluator?: boolean;
    noMemoryLaunchFailure?: boolean;
    onSeed?: (outputDirectory: string) => Promise<void>;
    recallPreflightFailure?: boolean;
    recallPreflightThrow?: boolean;
    sequence?: string[];
  } = {},
) {
  const outputDirectory = join(fixture.root, `${suffix}-output`);
  const instructionSha256 = sha256(
    `AGENTS.md\0# Shared deterministic instructions\n\0`,
  );
  return runC3FrozenPrehistoryPair({
    authFile: fixture.authFile,
    bunExecutable: process.execPath,
    codexExecutable: "/fake/codex",
    episodeId: "episode-001",
    evaluatorRoot: fixture.evaluatorRoot,
    evaluatorFiles: fixture.evaluatorFiles,
    expectedCommit: fixture.commit,
    failToPassCommand: [process.execPath, "{evaluatorRoot}/fail-to-pass.ts"],
    declaredForbiddenSourceSha256: [],
    forbiddenSources: [],
    forbiddenStrings: [],
    generatedAt: "2026-07-15T12:00:00.000Z",
    historySourceSha256: fixture.prehistorySha256,
    historySourcePath: fixture.prehistoryPath,
    materializeEvaluator: async () => {
      options.sequence?.push("materialize-evaluator");
      await mkdir(fixture.evaluatorRoot);
      await Promise.all([
        writeFile(
          join(fixture.evaluatorRoot, "fail-to-pass.ts"),
          options.corruptEvaluator
            ? `${fixture.failToPassBytes}// drift\n`
            : fixture.failToPassBytes,
          { encoding: "utf8", flag: "wx" },
        ),
        writeFile(
          join(fixture.evaluatorRoot, "pass-to-pass.ts"),
          fixture.passToPassBytes,
          { encoding: "utf8", flag: "wx" },
        ),
      ]);
    },
    materializePrehistory: async () => {
      options.sequence?.push("materialize-prehistory");
      await writeFile(fixture.prehistoryPath, fixture.prehistoryBytes, {
        encoding: "utf8",
        flag: "wx",
      });
    },
    model: "gpt-5.6-sol",
    npmExecutable: "/fake/npm",
    outputDirectory,
    packageTarball: fixture.packageTarball,
    passToPassCommand: [process.execPath, "{evaluatorRoot}/pass-to-pass.ts"],
    prompt: "Create deterministic-result.txt for the current C3 task.",
    reasoningEffort: "xhigh",
    repetition: 1,
    runId: suffix,
    runtimeRoot: join(fixture.root, `${suffix}-runtime`),
    seed: 1,
    sourceRepository: fixture.sourceRepository,
    stageId: "stage-2",
    stageTimeoutMs: 2_000,
    testTimeoutMs: 2_000,
    workspaceRoot: join(fixture.root, `${suffix}-workspaces`),
    dependencies: {
      auditPermissionIsolation: async () => permissionIsolation(),
      cleanupRuntime: async () => undefined,
      collectInstalledCanary: async ({ seed, runtime }) => ({
        expectedMemoryIds: seed.receipt.writtenMemoryIds,
        failureStage: options.canaryFailure
          ? "goodmemory-injection"
          : null,
        injectedExpectedMemoryIds: options.canaryFailure
          ? []
          : seed.receipt.writtenMemoryIds,
        passed: !options.canaryFailure,
        rawTranscriptPersisted: false,
        reasons: options.canaryFailure
          ? ["expected frozen-prehistory memory was not injected"]
          : [],
        sessionDigest: "session:installed",
        stateEvidenceSha256: SHA256,
        stopCursorAdvanced: true,
        terminalWritebackStatuses: ["committed"],
        threadId: "thread-installed",
        transcriptSourceSha256: runtime.package.sha256,
      }),
      prepareInstalled: async ({ plan }) => ({
        codex: {
          executable: "/fake/codex",
          executableSha256: SHA256,
          hooksEnabled: true,
          version: "codex-cli 0.144.3",
        },
        env: { C3_ARM: "goodmemory-installed", PATH: process.env.PATH ?? "" },
        goodmemoryExecutable: "/fake/goodmemory",
        instructionSha256,
        package: { sha256: SHA256, version: "0.5.1" },
        permissionProfile: permissionProfile(),
        plan,
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
        storagePath: "/fake/memory.sqlite",
      } satisfies C3InstalledArmRuntime),
      prepareNoMemory: async ({ plan }) => ({
        codex: {
          executable: "/fake/codex",
          executableSha256: SHA256,
          version: "codex-cli 0.144.3",
        },
        env: { C3_ARM: "no-memory", PATH: process.env.PATH ?? "" },
        instructionSha256,
        isolation: {
          codexHomeEntryNames: ["auth.json", "config.toml"],
          goodMemoryFileCount: 0,
          hookConfigPresent: false,
          mcpConfigPresent: false,
          passed: true,
          preexistingSessionCount: 0,
          reasons: [],
        },
        permissionProfile: permissionProfile(),
        plan,
      } satisfies C3NoMemoryArmRuntime),
      preflightInstalledRecall: async ({ seed }) => {
        options.sequence?.push("preflight-recall");
        if (options.recallPreflightThrow) {
          throw new Error("injected preflight boundary failure");
        }
        if (options.recallPreflightFailure) {
          return {
            expectedMemoryIds: [...seed.receipt.writtenMemoryIds],
            injectedMemoryIds: [],
            outputSha256: SHA256,
            passed: false,
            reason: "frozen prehistory is not retrievable before Codex execution",
            schemaVersion: 1,
            stateSha256: SHA256,
          };
        }
        return recallPreflight(seed.receipt.writtenMemoryIds);
      },
      runCodex: async (request) => {
        options.sequence?.push(`codex:${request.env?.C3_ARM ?? "unknown"}`);
        if (
          options.noMemoryLaunchFailure &&
          request.env?.C3_ARM === "no-memory"
        ) {
          return {
            durationMs: 1,
            events: [],
            exitCode: null,
            normalized: null,
            status: "spawn-failed",
            stderr: "failed to launch",
            stdout: "",
            timedOut: false,
          };
        }
        return fakeCodexRun(request);
      },
      seedInstalled: async ({ artifact, receiptPath }) => {
        options.sequence?.push("seed-installed");
        await options.onSeed?.(outputDirectory);
        const receipt = {
          historySourceSha256: artifact.sourceSha256,
          memoryExportSha256: SHA256,
          rawTranscriptPersisted: false as const,
          schemaVersion: 1 as const,
          seedSurface: "codex-writeback-from-rollout" as const,
          sourceSessionDigest: "session:prehistory",
          writebackOutcome: "written" as const,
          writtenMemoryIds: ["memory-001"],
        };
        await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
        return {
          exportLeakageAudit: {
            declaredForbiddenSourceSha256: [],
            overlaps: [],
            passed: true,
            sourceSha256: SHA256,
          },
          receipt,
        };
      },
    },
  });
}

const SHA256 = "a".repeat(64);

function permissionProfile() {
  return {
    configSha256: SHA256,
    filesystemDefault: "deny" as const,
    minimalRead: true as const,
    name: "c3-task" as const,
    networkAccess: false as const,
    workspaceWrite: true as const,
  };
}

function permissionIsolation(): C3PermissionIsolationEvidence {
  return {
    audit: {
      configSha256: SHA256,
      deniedReads: [{
        denied: true,
        exitCode: 1,
        label: "runner-source",
        pathSha256: SHA256,
      }],
      networkAccess: false as const,
      passed: true,
      profileName: "c3-task" as const,
      reasons: [],
      schemaVersion: 1 as const,
      workspaceRead: true,
      workspaceWrite: true,
    },
    evidenceSha256: SHA256,
  };
}

function recallPreflight(memoryIds: readonly string[]) {
  return {
    expectedMemoryIds: [...memoryIds],
    injectedMemoryIds: [...memoryIds],
    outputSha256: SHA256,
    passed: true as const,
    schemaVersion: 1 as const,
    stateSha256: SHA256,
  };
}

async function fakeCodexRun(request: CodexRunRequest): Promise<CodexRunResult> {
  const arm = request.env?.C3_ARM;
  await writeFile(
    join(request.cwd, "deterministic-result.txt"),
    arm === "goodmemory-installed" ? "resolved\n" : "plausible-but-wrong\n",
    "utf8",
  );
  const threadId = arm === "goodmemory-installed"
    ? "thread-installed"
    : "thread-no-memory";
  return {
    durationMs: 1,
    events: [],
    exitCode: 0,
    normalized: {
      commands: [],
      fileChanges: [{
        kind: "add",
        path: "deterministic-result.txt",
        sourceEventIndex: 0,
      }],
      finalMessage: "done",
      finalMessageEventIndex: 1,
      threadId,
      threadStartedEventIndex: 0,
      usage: { cachedInputTokens: 0, inputTokens: 1, outputTokens: 1 },
      usageEventIndex: 2,
    },
    status: "completed",
    stderr: "",
    stdout: "{}\n",
    timedOut: false,
  };
}

async function readStageEvidence(directory: string): Promise<Array<{
  armEvidence: Record<string, unknown> & {
    arm: string;
    hostCanary?: Record<string, unknown>;
  };
}>> {
  const entries = await readdir(directory);
  return Promise.all(entries.map(async (entry) =>
    JSON.parse(await readFile(join(directory, entry), "utf8")) as {
      armEvidence: Record<string, unknown> & {
        arm: string;
        hostCanary?: Record<string, unknown>;
      };
    }
  ));
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const child = Bun.spawn({
    cmd: ["git", ...args],
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`git ${args[0]} failed: ${stderr}`);
  }
  return stdout;
}

function rolloutLine(role: "assistant" | "user", text: string): string {
  return JSON.stringify({
    payload: {
      content: [{
        text,
        type: role === "user" ? "input_text" : "output_text",
      }],
      role,
      type: "message",
    },
    type: "response_item",
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
