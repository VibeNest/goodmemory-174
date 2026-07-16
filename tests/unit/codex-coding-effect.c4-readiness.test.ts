import { describe, expect, it } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runC4AdaptiveBaselineCeiling,
  serializeC4BaselineCeilingReport,
} from "../../scripts/codex-coding-effect/c4-baseline-ceiling";
import type {
  C4BaselineCeilingTarget,
} from "../../scripts/codex-coding-effect/c4-baseline-ceiling";
import {
  captureC4ChangedFiles,
  captureC4GoldReplay,
  validateC4BaselineCeilingEvidence,
} from "../../scripts/codex-coding-effect/c4-readiness";
import {
  freezeC4ControlledPilotDataset,
} from "../../scripts/freeze-codex-coding-effect-c4-dataset";
import { runC4ReadinessGate } from "../../scripts/run-codex-coding-effect-c4-readiness";

describe("Codex coding-effect C4 readiness", () => {
  it("captures replay bytes from every schema-v2 expected changed file", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "goodmemory-c4-replay-"));
    try {
      await runGit(repositoryRoot, ["init", "--quiet"]);
      await mkdir(join(repositoryRoot, "src"));
      await writeFile(join(repositoryRoot, "src/first.ts"), "export const first = 1;\n");
      await writeFile(join(repositoryRoot, "src/second.ts"), "export const second = 1;\n");
      await runGit(repositoryRoot, ["add", "."]);
      await runGit(repositoryRoot, [
        "-c",
        "user.name=GoodMemory Test",
        "-c",
        "user.email=test@goodmemory.local",
        "commit",
        "--quiet",
        "-m",
        "fixture",
      ]);
      await writeFile(join(repositoryRoot, "src/first.ts"), "export const first = 2;\n");
      await writeFile(join(repositoryRoot, "src/second.ts"), "export const second = 2;\n");

      const expected = await runGit(repositoryRoot, [
        "diff",
        "--binary",
        "--full-index",
        "--",
        "src/first.ts",
        "src/second.ts",
      ]);
      expect(await captureC4GoldReplay(repositoryRoot, [
        "src/second.ts",
        "src/first.ts",
      ])).toBe(expected);
    } finally {
      await rm(repositoryRoot, { force: true, recursive: true });
    }
  });

  it("captures schema-v2 expected files that are newly added", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "goodmemory-c4-new-file-"));
    try {
      await runGit(repositoryRoot, ["init", "--quiet"]);
      await writeFile(join(repositoryRoot, "README.md"), "fixture\n");
      await runGit(repositoryRoot, ["add", "."]);
      await runGit(repositoryRoot, [
        "-c",
        "user.name=GoodMemory Test",
        "-c",
        "user.email=test@goodmemory.local",
        "commit",
        "--quiet",
        "-m",
        "fixture",
      ]);
      await mkdir(join(repositoryRoot, "src"));
      await writeFile(
        join(repositoryRoot, "src/new-task.ts"),
        "export const newTask = true;\n",
      );

      expect(await captureC4ChangedFiles(repositoryRoot)).toEqual([
        "src/new-task.ts",
      ]);
      const replay = await captureC4GoldReplay(repositoryRoot, [
        "src/new-task.ts",
      ]);

      expect(replay).toContain("new file mode");
      expect(replay).toContain("+export const newTask = true;");
    } finally {
      await rm(repositoryRoot, { force: true, recursive: true });
    }
  });

  it("rejects realpath-equivalent inputs and outputs before dataset execution", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "goodmemory-c4-outputs-"));
    try {
      const datasetRoot = join(sandbox, "dataset");
      await mkdir(datasetRoot);
      const datasetAlias = join(sandbox, "dataset-alias");
      await symlink(datasetRoot, datasetAlias);
      const reportOutput = join(sandbox, "reports/readiness.json");
      const reviewInputs = {
        baselinePath: join(sandbox, "c4-baseline-ceiling-pilot.json"),
        dispatchPath: join(datasetRoot, "review/dispatch.json"),
        inputBundlePath: join(datasetRoot, "review/input-bundle.json"),
        provenancePath: join(datasetRoot, "review/provenance.json"),
        requestPath: join(datasetRoot, "review/request.md"),
        reviewPath: join(datasetRoot, "review/independent-review.json"),
      };

      await expect(runC4ReadinessGate({
        coreOutput: join(datasetAlias, "manifest.json"),
        datasetRoot,
        reportOutput,
        ...reviewInputs,
      })).rejects.toThrow("C4 core output must not overlap the dataset root");

      await expect(runC4ReadinessGate({
        coreOutput: reportOutput,
        datasetRoot,
        reportOutput,
        ...reviewInputs,
      })).rejects.toThrow("C4 core and report outputs must be physically distinct");

      await expect(runC4ReadinessGate({
        coreOutput: join(sandbox, "nested-output"),
        datasetRoot,
        reportOutput: join(sandbox, "nested-output/readiness.json"),
        ...reviewInputs,
      })).rejects.toThrow("C4 core and report outputs must be physically distinct");

      await expect(runC4ReadinessGate({
        coreOutput: join(sandbox, "reports/core.json"),
        datasetRoot,
        reportOutput,
        ...reviewInputs,
        baselinePath: reportOutput,
      })).rejects.toThrow(
        "C4 report output must not overlap the baseline report input",
      );
    } finally {
      await rm(sandbox, { force: true, recursive: true });
    }
  });

  it("fails closed when the canonical baseline report is absent", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "goodmemory-c4-no-baseline-"));
    try {
      const datasetRoot = join(sandbox, "dataset");
      await mkdir(datasetRoot);
      await expect(runC4ReadinessGate({
        baselinePath: join(sandbox, "missing-baseline.json"),
        coreOutput: join(sandbox, "core.json"),
        datasetRoot,
        dispatchPath: join(datasetRoot, "review/dispatch.json"),
        inputBundlePath: join(datasetRoot, "review/input-bundle.json"),
        provenancePath: join(datasetRoot, "review/provenance.json"),
        reportOutput: join(sandbox, "readiness.json"),
        requestPath: join(datasetRoot, "review/request.md"),
        reviewPath: join(datasetRoot, "review/independent-review.json"),
      })).rejects.toThrow();
    } finally {
      await rm(sandbox, { force: true, recursive: true });
    }
  });

  it("accepts only the current v2 dataset in canonical baseline evidence", async () => {
    const v1Bytes = await baselineBytes("codex-c4-controlled-pilot-v1");
    const v2Bytes = await baselineBytes("codex-c4-controlled-pilot-v2");

    expect(() => validateC4BaselineCeilingEvidence(v1Bytes)).toThrow();
    expect(validateC4BaselineCeilingEvidence(v2Bytes).report.datasetId).toBe(
      "codex-c4-controlled-pilot-v2",
    );
  });

  it("replaces only known v1 or v2 C4 dataset directories", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "goodmemory-c4-replace-"));
    try {
      for (const datasetId of [
        "codex-c4-controlled-pilot-v1",
        "codex-c4-controlled-pilot-v2",
      ]) {
        const outputRoot = join(sandbox, datasetId);
        await mkdir(outputRoot);
        await writeFile(
          join(outputRoot, "manifest.json"),
          `${JSON.stringify({ datasetId })}\n`,
        );

        await expect(freezeC4ControlledPilotDataset({
          outputRoot,
          replace: true,
        })).resolves.toMatchObject({ outputRoot });
      }

      const unrelatedRoot = join(sandbox, "unrelated");
      await mkdir(unrelatedRoot);
      await writeFile(
        join(unrelatedRoot, "manifest.json"),
        `${JSON.stringify({ datasetId: "unrelated-dataset" })}\n`,
      );
      await expect(freezeC4ControlledPilotDataset({
        outputRoot: unrelatedRoot,
        replace: true,
      })).rejects.toThrow("refusing to replace a non-C4 dataset directory");
      expect(JSON.parse(
        await readFile(join(unrelatedRoot, "manifest.json"), "utf8"),
      )).toEqual({ datasetId: "unrelated-dataset" });
    } finally {
      await rm(sandbox, { force: true, recursive: true });
    }
  }, 120_000);
});

async function baselineBytes(datasetId: string): Promise<string> {
  const targets = Array.from({ length: 6 }, (_, index) => {
    const episodeId = `episode-${index + 1}`;
    return [
      { episodeId, position: 2, stageId: "stage-2" },
      { episodeId, position: 3, stageId: "stage-3" },
    ] satisfies C4BaselineCeilingTarget[];
  }).flat();
  const report = await runC4AdaptiveBaselineCeiling({
    executeStage: async (target) => ({
      changedFiles: [],
      codexStatus: "completed",
      disposition: "finalized",
      episodeId: target.episodeId,
      executionFailureStage: null,
      failToPassStatus: "failed",
      passToPassStatus: "passed",
      patchSha256: null,
      resolved: false,
      stageEvidenceSha256: "a".repeat(64),
      stageId: target.stageId,
      taskFailureReasons: ["unresolved"],
      threadId: `${target.episodeId}-${target.stageId}`,
    }),
    runIdentity: {
      assetLockSha256: "a".repeat(64),
      assetRootSha256: "b".repeat(64),
      claimBoundary: "diagnostic-no-memory-ceiling-only",
      codexExecutableSha256: "c".repeat(64),
      codexVersion: "codex-cli test",
      datasetId,
      generatedAt: "2026-07-16T13:00:00.000Z",
      host: "codex",
      manifestSha256: "d".repeat(64),
      model: "gpt-5.6-sol",
      networkAccess: false,
      publicClaimEligible: false,
      reasoningEffort: "xhigh",
      runId: `baseline-${datasetId}`,
      schemaVersion: 1,
      strategy: "stage-3-first-then-stage-2-if-needed",
    },
    targets,
  });
  return serializeC4BaselineCeilingReport(report);
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
    throw new Error(stderr.trim());
  }
  return stdout;
}
