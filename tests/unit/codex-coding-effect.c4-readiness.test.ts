import { describe, expect, it } from "bun:test";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  captureC4ChangedFiles,
  captureC4GoldReplay,
} from "../../scripts/codex-coding-effect/c4-readiness";
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
});

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
