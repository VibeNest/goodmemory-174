import { describe, expect, it } from "bun:test";
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

      expect(result.report).toMatchObject({
        attemptedCount: 12,
        ceilingRisk: false,
        decision: "proceed-to-c5-pilot",
        infrastructureFailureCount: 0,
        resolvedCount: 0,
        runIdentitySha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        stageEvidenceAggregateSha256:
          expect.stringMatching(/^[a-f0-9]{64}$/u),
      });
      expect(result.report.results.every((stage) =>
        stage.codexStatus === "completed" &&
        stage.disposition === "finalized" &&
        stage.threadId !== null
      )).toBe(true);
      expect(new Set(result.report.results.map((stage) => stage.threadId)).size)
        .toBe(12);
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
});

function fakeCodexSource(): string {
  return `#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

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
