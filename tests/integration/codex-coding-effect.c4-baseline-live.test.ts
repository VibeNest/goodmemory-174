import { describe, expect, it } from "bun:test";
import {
  chmod,
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildC4BaselineStageEvidenceBindings,
  buildC4BaselinePrompt,
  loadC4BaselineStageEvidenceFiles,
  verifyC4BaselineStageEvidenceFiles,
} from "../../scripts/codex-coding-effect/c4-baseline-ceiling";
import {
  runC4NoMemoryCeilingPilot,
} from "../../scripts/codex-coding-effect/c4-baseline-live";

describe("Codex coding-effect C4 no-memory ceiling pilot", () => {
  it("runs the full no-memory lifecycle through a fake Codex host", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c4-baseline-fake-"));
    const outputDirectory = join(root, "output");
    const sourceRoot = join(root, "sources");
    const codexExecutable = join(root, "fake-codex");
    const authFile = join(root, "auth.json");
    try {
      await Promise.all([
        writeFile(authFile, "{}\n", "utf8"),
        writeFile(codexExecutable, fakeCodexSource(), "utf8"),
      ]);
      await chmod(codexExecutable, 0o755);

      const result = await runC4NoMemoryCeilingPilot({
        authFile,
        bunExecutable: process.execPath,
        codexExecutable,
        datasetRoot: "fixtures/codex-coding-effect/c4-controlled-pilot",
        evaluatorNetworkProbe: async () => ({
          networkDenied: true,
          networkPositiveControl: true,
        }),
        generatedAt: "2026-07-16T09:30:00.000Z",
        model: "test-model",
        outputDirectory,
        reasoningEffort: "low",
        runId: "c4-baseline-fake-success",
        runtimeRoot: join(root, "runtime"),
        sourceRoot,
        stageTimeoutMs: 10_000,
        testTimeoutMs: 10_000,
        workspaceRoot: join(root, "workspaces"),
      });

      const preflightFailures = await Promise.all(
        (await readdir(join(outputDirectory, "stages"))).map(
          async (stageDirectory) => {
            const evidence = JSON.parse(await readFile(
              join(
                outputDirectory,
                "stages",
                stageDirectory,
                "stage-evidence.json",
              ),
              "utf8",
            )) as { failure?: { failureStage: string; reason: string } };
            return evidence.failure === undefined
              ? null
              : {
                  stageDirectory,
                  ...evidence.failure,
                };
          },
        ),
      );
      expect(preflightFailures.filter((failure) => failure !== null)).toEqual(
        [],
      );
      expect(result.report).toMatchObject({
        attemptedCount: 12,
        ceilingRisk: false,
        decision: "proceed-to-c5-pilot",
        infrastructureFailureCount: 0,
        resolvedCount: 0,
        runIdentitySha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        stageTimeoutMs: 10_000,
        stageEvidenceAggregateSha256:
          expect.stringMatching(/^[a-f0-9]{64}$/u),
        testTimeoutMs: 10_000,
      });
      expect(result.report.results.every((stage) =>
        stage.codexStatus === "completed" &&
        stage.disposition === "finalized" &&
        stage.threadId !== null
      )).toBe(true);
      expect(new Set(result.report.results.map((stage) => stage.threadId)).size)
        .toBe(12);
      const rawStageEvidence = await loadC4BaselineStageEvidenceFiles(
        join(outputDirectory, "stages"),
        result.report,
      );
      const trackedStageEvidence = buildC4BaselineStageEvidenceBindings(
        result.report,
        rawStageEvidence,
        result.frozenStageBindings,
      );
      expect(() => verifyC4BaselineStageEvidenceFiles(
        result.report,
        trackedStageEvidence,
        result.frozenStageBindings,
        rawStageEvidence,
      )).not.toThrow();
      expect(trackedStageEvidence.every((file) =>
        !file.bytes.includes(root) &&
        !file.bytes.includes("/Users/") &&
        file.bytes.includes('"schemaVersion": 2') &&
        file.bytes.includes('"stageInputSha256"') &&
        file.bytes.includes('"diff"')
      )).toBe(true);
      expect(await Bun.file(sourceRoot).exists()).toBe(false);
      for (const stageDirectory of await readdir(
        join(outputDirectory, "stages"),
      )) {
        const evidence = JSON.parse(await readFile(
          join(
            outputDirectory,
            "stages",
            stageDirectory,
            "stage-evidence.json",
          ),
          "utf8",
        )) as {
          evaluator: {
            materializedAfterCodexExit: boolean;
            sandbox: {
              copiedAuthRemovedBeforeEvaluator: boolean;
              configWriteDenied: boolean;
              evaluatorRead: boolean;
              evaluatorWriteDenied: boolean;
              networkAccess: false;
              networkDenied: boolean;
              networkPositiveControl: boolean;
              originalAuthAliasDenied: boolean;
              originalAuthDenied: boolean;
              profileName: string;
              workspaceRead: boolean;
              workspaceWrite: boolean;
            };
          };
        };
        expect(evidence.evaluator.materializedAfterCodexExit).toBe(true);
        expect(evidence.evaluator.sandbox).toMatchObject({
          copiedAuthRemovedBeforeEvaluator: true,
          configWriteDenied: true,
          evaluatorRead: true,
          evaluatorWriteDenied: true,
          networkAccess: false,
          networkDenied: true,
          networkPositiveControl: true,
          originalAuthAliasDenied: true,
          originalAuthDenied: true,
          profileName: "c4-evaluator",
          workspaceRead: true,
          workspaceWrite: true,
        });
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }, 120_000);

  it("fails closed with durable evidence before live Codex when auth preflight fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c4-baseline-test-"));
    const outputDirectory = join(root, "output");
    const sourceRoot = join(root, "sources");
    try {
      const result = await runC4NoMemoryCeilingPilot({
        authFile: join(root, "missing-auth.json"),
        bunExecutable: process.execPath,
        codexExecutable: process.execPath,
        datasetRoot: "fixtures/codex-coding-effect/c4-controlled-pilot",
        generatedAt: "2026-07-16T09:00:00.000Z",
        model: "test-model",
        outputDirectory,
        reasoningEffort: "low",
        runId: "c4-baseline-preflight-failure",
        runtimeRoot: join(root, "runtime"),
        sourceRoot,
        stageTimeoutMs: 1_000,
        testTimeoutMs: 1_000,
        workspaceRoot: join(root, "workspaces"),
      });

      expect(result.report).toMatchObject({
        attemptedCount: 6,
        ceilingRisk: null,
        decision: "inconclusive",
        infrastructureFailureCount: 6,
      });
      expect(result.report.results.every((stage) =>
        stage.executionFailureStage === "no-memory-runtime"
      )).toBe(true);
      expect(await Bun.file(sourceRoot).exists()).toBe(false);
      expect(await Bun.file(join(outputDirectory, "report.json")).exists())
        .toBe(true);
      const stageDirectories = await readdir(join(outputDirectory, "stages"));
      expect(stageDirectories).toHaveLength(6);
      for (const stageDirectory of stageDirectories) {
        const evidence = await readFile(
          join(outputDirectory, "stages", stageDirectory, "stage-evidence.json"),
          "utf8",
        );
        expect(evidence).toContain('"failureStage": "no-memory-runtime"');
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }, 30_000);

  it("retains formal Codex failure events as inconclusive infrastructure", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c4-baseline-auth-"));
    const outputDirectory = join(root, "output");
    const sourceRoot = join(root, "sources");
    const codexExecutable = join(root, "fake-codex");
    const authFile = join(root, "auth.json");
    try {
      await Promise.all([
        writeFile(authFile, "{}\n", "utf8"),
        writeFile(
          codexExecutable,
          fakeCodexSource("structured-failure"),
          "utf8",
        ),
      ]);
      await chmod(codexExecutable, 0o755);

      const result = await runC4NoMemoryCeilingPilot({
        authFile,
        bunExecutable: process.execPath,
        codexExecutable,
        datasetRoot: "fixtures/codex-coding-effect/c4-controlled-pilot",
        evaluatorNetworkProbe: async () => ({
          networkDenied: true,
          networkPositiveControl: true,
        }),
        generatedAt: "2026-07-16T10:00:00.000Z",
        model: "test-model",
        outputDirectory,
        reasoningEffort: "low",
        runId: "c4-baseline-authentication-failure",
        runtimeRoot: join(root, "runtime"),
        sourceRoot,
        stageTimeoutMs: 10_000,
        testTimeoutMs: 10_000,
        workspaceRoot: join(root, "workspaces"),
      });

      expect(result.report).toMatchObject({
        attemptedCount: 6,
        ceilingRisk: null,
        decision: "inconclusive",
        infrastructureFailureCount: 6,
        resolvedCount: 0,
      });
      expect(result.report.results.every((stage) =>
        stage.codexStatus === "non-zero-exit" &&
        stage.disposition === "infrastructure-failure" &&
        stage.executionFailureStage === "codex-execution"
      )).toBe(true);
      const rawStageEvidence = await loadC4BaselineStageEvidenceFiles(
        join(outputDirectory, "stages"),
        result.report,
      );
      expect(rawStageEvidence.every((file) => {
        const evidence = JSON.parse(file.bytes) as {
          codex: { failureEvents: Array<{ message: string; type: string }> };
        };
        return evidence.codex.failureEvents.length === 2 &&
          evidence.codex.failureEvents.every((event) =>
            event.message === "synthetic upstream usage limit" &&
            (event.type === "error" || event.type === "turn.failed")
          );
      })).toBe(true);
      const trackedStageEvidence = buildC4BaselineStageEvidenceBindings(
        result.report,
        rawStageEvidence,
        result.frozenStageBindings,
      );
      expect(() => verifyC4BaselineStageEvidenceFiles(
        result.report,
        trackedStageEvidence,
        result.frozenStageBindings,
        rawStageEvidence,
      )).not.toThrow();
      expect(trackedStageEvidence.every((file) => {
        const binding = JSON.parse(file.bytes) as {
          evidence: {
            codex: {
              failureEventCount: number;
              failureEventsSha256: string;
            };
          };
        };
        return binding.evidence.codex.failureEventCount === 2 &&
          /^[a-f0-9]{64}$/u.test(
            binding.evidence.codex.failureEventsSha256,
          ) &&
          !file.bytes.includes("synthetic upstream usage limit");
      })).toBe(true);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }, 120_000);

  it("runs every stage from the asset-locked dataset snapshot", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c4-baseline-snapshot-"));
    const datasetRoot = join(root, "dataset");
    const outputDirectory = join(root, "output");
    const sourceRoot = join(root, "sources");
    const codexExecutable = join(root, "fake-codex");
    const authFile = join(root, "auth.json");
    const promptRelativePath =
      "prompts/endpoint-open-loop-render-target-display.md";
    try {
      await cp(
        "fixtures/codex-coding-effect/c4-controlled-pilot",
        datasetRoot,
        { recursive: true },
      );
      const originalPrompt = await readFile(
        join(datasetRoot, promptRelativePath),
        "utf8",
      );
      const manifest = JSON.parse(await readFile(
        join(datasetRoot, "manifest.json"),
        "utf8",
      )) as {
        episodes: Array<{
          id: string;
          stages: Array<{
            allowedFeedback: string[];
            id: string;
          }>;
        }>;
      };
      const allowedFeedback = manifest.episodes.find((episode) =>
        episode.id === "endpoint-open-loop"
      )!.stages.find((stage) => stage.id === "stage-3")!.allowedFeedback;
      await Promise.all([
        writeFile(authFile, "{}\n", "utf8"),
        writeFile(codexExecutable, fakeCodexSource(), "utf8"),
      ]);
      await chmod(codexExecutable, 0o755);

      const result = await runC4NoMemoryCeilingPilot({
        authFile,
        bunExecutable: process.execPath,
        codexExecutable,
        datasetRoot,
        evaluatorNetworkProbe: async () => ({
          networkDenied: true,
          networkPositiveControl: true,
        }),
        generatedAt: "2026-07-16T11:00:00.000Z",
        model: "test-model",
        onLog: (event) => {
          if (event.event === "baseline_preflight_completed") {
            writeFileSync(
              join(datasetRoot, promptRelativePath),
              `${originalPrompt}MUTATED AFTER PREFLIGHT\n`,
              "utf8",
            );
          }
        },
        outputDirectory,
        reasoningEffort: "low",
        runId: "c4-baseline-dataset-snapshot",
        runtimeRoot: join(root, "runtime"),
        sourceRoot,
        stageTimeoutMs: 10_000,
        testTimeoutMs: 10_000,
        workspaceRoot: join(root, "workspaces"),
      });

      const target = result.report.results.find((stage) =>
        stage.episodeId === "endpoint-open-loop" &&
        stage.stageId === "stage-3"
      )!;
      const evidence = JSON.parse(await readFile(
        join(
          outputDirectory,
          "stages",
          `${target.episodeId}-${target.stageId}`,
          "stage-evidence.json",
        ),
        "utf8",
      )) as { dataset: { promptSha256: string } };
      expect(evidence.dataset.promptSha256).toBe(sha256(
        buildC4BaselinePrompt({
          allowedFeedback,
          prompt: originalPrompt,
        }),
      ));
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }, 120_000);
});

function sha256(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

function fakeCodexSource(
  mode: "structured-failure" | "success" = "success",
): string {
  return `#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const mode = ${JSON.stringify(mode)};
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--version") {
  console.log("codex-cli fake-0.1");
  process.exit(0);
}
if (args[0] === "sandbox") {
  const cwdIndex = args.indexOf("-C");
  const separator = args.indexOf("--");
  const workspace = resolve(args[cwdIndex + 1]);
  const command = args.slice(separator + 1);
  if (
    cwdIndex < 0 ||
    separator < 0 ||
    command.length === 0
  ) {
    process.exit(1);
  }
  const target = command[1] === undefined ? null : resolve(command[1]);
  if (
    command[0] === "/bin/cat" &&
    (target === null ||
      target.endsWith("/.auth-alias-probe") ||
      (!target.startsWith(workspace + "/") &&
        !target.includes("/evaluation-sandbox/evaluator/")))
  ) {
    process.exit(1);
  }
  if (
    command[0] === "/usr/bin/touch" &&
    (target === null ||
      target.includes("/evaluation-sandbox/codex-home/") ||
      target.includes("/evaluation-sandbox/evaluator/") ||
      !target.startsWith(workspace + "/"))
  ) {
    process.exit(1);
  }
  if (
    command[1] === "-e" &&
    command[2]?.includes("fetch(")
  ) {
    process.exit(1);
  }
  const child = Bun.spawnSync({
    cmd: command,
    cwd: workspace,
    env: process.env,
    stderr: "pipe",
    stdout: "pipe",
  });
  process.stdout.write(child.stdout);
  process.stderr.write(child.stderr);
  process.exit(child.exitCode);
}
if (mode === "structured-failure") {
  console.log(JSON.stringify({
    type: "error",
    error: { message: "synthetic upstream usage limit" },
  }));
  console.log(JSON.stringify({
    type: "turn.failed",
    error: { message: "synthetic upstream usage limit" },
  }));
  process.exit(1);
}
const threadId = \`fake-\${randomUUID()}\`;
console.log(JSON.stringify({ type: "thread.started", thread_id: threadId }));
console.log(JSON.stringify({
  type: "item.completed",
  item: { type: "agent_message", text: "Fake Codex completed without a patch." },
}));
console.log(JSON.stringify({
  type: "turn.completed",
  usage: { cached_input_tokens: 0, input_tokens: 1, output_tokens: 1 },
}));
`;
}
