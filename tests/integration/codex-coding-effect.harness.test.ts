import { describe, expect, it } from "bun:test";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runCodexCodingEffectDeterministicSmoke,
} from "../../scripts/codex-coding-effect/deterministic-harness";
import type {
  CodexCodingEffectLogEvent,
} from "../../scripts/codex-coding-effect/logging";

const TEXT_DECODER = new TextDecoder();
const FAKE_CODEX = join(
  import.meta.dir,
  "../../fixtures/codex-coding-effect/fake-codex.ts",
);

describe("Codex coding-effect deterministic harness", () => {
  it("runs a fake two-arm episode end to end and lets hidden tests decide", async () => {
    await withFixture(async (fixture) => {
      const logs: CodexCodingEffectLogEvent[] = [];
      const result = await runSmoke(
        fixture,
        "run-a",
        "2026-07-15T01:00:00.000Z",
        "run-a",
        { onLog: (event) => logs.push(event) },
      );

      expect(result.cases).toHaveLength(2);
      expect(result.cases.map((row) => ({
        arm: row.arm,
        codexStatus: row.codexStatus,
        resolved: row.resolved,
        taskFailureReasons: row.taskFailureReasons,
      }))).toEqual([
        {
          arm: "no-memory",
          codexStatus: "completed",
          resolved: false,
          taskFailureReasons: ["hidden-fail-to-pass-failed"],
        },
        {
          arm: "goodmemory-installed",
          codexStatus: "completed",
          resolved: true,
          taskFailureReasons: [],
        },
      ]);
      expect(result.cases.every((row) => row.patchSha256 !== null)).toBe(true);
      expect(result.summary).toMatchObject({
        attemptedCount: 2,
        finalizedCount: 2,
        generatedAt: "2026-07-15T01:00:00.000Z",
        infrastructureFailureCount: 0,
        paired: {
          comparablePairs: 1,
          regressions: 0,
          rescues: 1,
        },
        resolvedCount: 1,
      });
      expect(result.summary.arms).toEqual([
        {
          arm: "no-memory",
          attemptedCount: 1,
          finalizedCount: 1,
          resolvedCount: 0,
        },
        {
          arm: "goodmemory-installed",
          attemptedCount: 1,
          finalizedCount: 1,
          resolvedCount: 1,
        },
      ]);

      const outputDirectory = join(fixture.root, "run-a-output");
      expect(await readFile(join(outputDirectory, "summary.json"), "utf8"))
        .toBe(result.summaryBytes);
      expect(nonEmptyLines(await readFile(
        join(outputDirectory, "attempts.jsonl"),
        "utf8",
      ))).toHaveLength(2);
      expect(nonEmptyLines(await readFile(
        join(outputDirectory, "progress.jsonl"),
        "utf8",
      ))).toHaveLength(2);
      await expect(access(join(fixture.root, "run-a-workspaces")))
        .rejects.toThrow();
      expect(logs.map((event) => event.event)).toEqual([
        "run_preflight_started",
        "run_preflight_completed",
        "pair_started",
        "workspace_prepared",
        "codex_process_started",
        "codex_process_exited",
        "patch_captured",
        "workspace_prepared",
        "patch_applied_for_evaluation",
        "hidden_tests_started",
        "hidden_tests_completed",
        "hidden_tests_started",
        "hidden_tests_completed",
        "stage_finalized",
        "workspace_prepared",
        "codex_process_started",
        "codex_process_exited",
        "patch_captured",
        "workspace_prepared",
        "patch_applied_for_evaluation",
        "hidden_tests_started",
        "hidden_tests_completed",
        "hidden_tests_started",
        "hidden_tests_completed",
        "stage_finalized",
        "pair_completed",
        "run_aggregated",
      ]);
    });
  });

  it("produces byte-identical summaries when only the timestamp changes", async () => {
    await withFixture(async (fixture) => {
      const first = await runSmoke(
        fixture,
        "reproducible-run",
        "2026-07-15T02:00:00.000Z",
        "first",
      );
      const second = await runSmoke(
        fixture,
        "reproducible-run",
        "2026-07-15T03:00:00.000Z",
        "second",
      );

      expect(withoutGeneratedAt(first.summaryBytes))
        .toBe(withoutGeneratedAt(second.summaryBytes));
      expect(first.casesBytes).toBe(second.casesBytes);
    });
  });

  it("rejects a pre-existing workspace root without deleting its contents", async () => {
    await withFixture(async (fixture) => {
      const workspaceRoot = join(fixture.root, "existing-workspaces");
      const sentinel = join(workspaceRoot, "sentinel.txt");
      await mkdir(workspaceRoot, { recursive: true });
      await writeFile(sentinel, "owned by caller\n", "utf8");

      await expect(runSmoke(
        fixture,
        "existing-run",
        "2026-07-15T04:00:00.000Z",
        "existing",
      )).rejects.toThrow("workspace root already exists");
      expect(await readFile(sentinel, "utf8")).toBe("owned by caller\n");
    });
  });

  it("rejects an evaluator root inside the source repository", async () => {
    await withFixture(async (fixture) => {
      await expect(runSmoke(
        {
          ...fixture,
          evaluatorRoot: join(fixture.sourceRepository, "evaluator"),
        },
        "overlap-run",
        "2026-07-15T05:00:00.000Z",
        "overlap",
      )).rejects.toThrow(
        "source repository and evaluator root must be disjoint",
      );
    });
  });

  it("recovers persisted stage evidence without rerunning a finalized arm", async () => {
    await withFixture(async (fixture) => {
      await expect(runSmoke(
        fixture,
        "resume-run",
        "2026-07-15T06:00:00.000Z",
        "resume",
        {
          testHooks: {
            afterStageEvidencePersisted() {
              throw new Error("injected crash after evidence persistence");
            },
          },
        },
      )).rejects.toThrow("injected crash after evidence persistence");

      const logs: CodexCodingEffectLogEvent[] = [];
      const resumed = await runSmoke(
        fixture,
        "resume-run",
        "2026-07-15T06:00:00.000Z",
        "resume",
        {
          onLog: (event) => logs.push(event),
          resume: true,
        },
      );

      expect(resumed.cases).toHaveLength(2);
      expect(resumed.summary).toMatchObject({
        attemptedCount: 2,
        finalizedCount: 2,
        resolvedCount: 1,
      });
      expect(logs.filter((event) => event.event === "codex_process_started")
        .map((event) => event.arm)).toEqual(["goodmemory-installed"]);
      expect(nonEmptyLines(await readFile(
        join(fixture.root, "resume-output", "attempts.jsonl"),
        "utf8",
      ))).toHaveLength(2);
    });
  });
});

interface HarnessFixture {
  commit: string;
  evaluatorRoot: string;
  root: string;
  sourceRepository: string;
}

async function withFixture(
  run: (fixture: HarnessFixture) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "goodmemory-codex-harness-"));
  const sourceRepository = join(root, "source");
  const evaluatorRoot = join(root, "evaluator");
  try {
    await mkdir(sourceRepository, { recursive: true });
    await mkdir(evaluatorRoot, { recursive: true });
    await writeFile(
      join(sourceRepository, "protected.txt"),
      "must-stay-unchanged\n",
      "utf8",
    );
    await writeFile(join(sourceRepository, ".gitignore"), ".hidden-pass\n", "utf8");
    runGit(sourceRepository, ["init", "--quiet"]);
    runGit(sourceRepository, ["config", "user.email", "fixture@example.test"]);
    runGit(sourceRepository, ["config", "user.name", "Fixture"]);
    runGit(sourceRepository, ["add", "."]);
    runGit(sourceRepository, ["commit", "--quiet", "-m", "fixture base"]);
    const commit = runGit(sourceRepository, ["rev-parse", "HEAD"]);

    await writeFile(
      join(evaluatorRoot, "fail-to-pass.ts"),
      [
        'import { readFile } from "node:fs/promises";',
        'import { join } from "node:path";',
        "",
        "let value = \"\";",
        "try {",
        '  if (await Bun.file(join(process.cwd(), ".hidden-pass")).exists()) {',
        "    process.exit(0);",
        "  }",
        '  value = await readFile(join(process.cwd(), "deterministic-result.txt"), "utf8");',
        "} catch {",
        "  process.exit(1);",
        "}",
        'process.exit(value === "resolved\\n" ? 0 : 1);',
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(evaluatorRoot, "pass-to-pass.ts"),
      [
        'import { readFile } from "node:fs/promises";',
        'import { join } from "node:path";',
        "",
        'const value = await readFile(join(process.cwd(), "protected.txt"), "utf8");',
        'process.exit(value === "must-stay-unchanged\\n" ? 0 : 1);',
        "",
      ].join("\n"),
      "utf8",
    );

    await run({ commit, evaluatorRoot, root, sourceRepository });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function runSmoke(
  fixture: HarnessFixture,
  runId: string,
  generatedAt: string,
  pathSuffix = runId,
  runtime: {
    onLog?: (event: CodexCodingEffectLogEvent) => void;
    resume?: boolean;
    testHooks?: {
      afterStageEvidencePersisted?: () => void | Promise<void>;
    };
  } = {},
) {
  return runCodexCodingEffectDeterministicSmoke({
    arms: [
      {
        arm: "no-memory",
        codexArgs: [FAKE_CODEX, "ignored-cheat"],
        codexExecutable: process.execPath,
      },
      {
        arm: "goodmemory-installed",
        codexArgs: [FAKE_CODEX, "success"],
        codexExecutable: process.execPath,
      },
    ],
    episodeId: "fixture-episode",
    evaluatorRoot: fixture.evaluatorRoot,
    expectedCommit: fixture.commit,
    failToPassCommand: [
      process.execPath,
      "{evaluatorRoot}/fail-to-pass.ts",
    ],
    generatedAt,
    onLog: runtime.onLog,
    outputDirectory: join(fixture.root, `${pathSuffix}-output`),
    passToPassCommand: [
      process.execPath,
      "{evaluatorRoot}/pass-to-pass.ts",
    ],
    repetition: 1,
    resume: runtime.resume,
    runId,
    seed: 7,
    sourceRepository: fixture.sourceRepository,
    stageId: "stage-2",
    stageTimeoutMs: 2_000,
    testTimeoutMs: 2_000,
    testHooks: runtime.testHooks,
    workspaceRoot: join(fixture.root, `${pathSuffix}-workspaces`),
  });
}

function nonEmptyLines(value: string): string[] {
  return value.split("\n").filter((line) => line.length > 0);
}

function withoutGeneratedAt(value: string): string {
  return value.replace(
    /"generatedAt": "[^"]+"/u,
    '"generatedAt": "<timestamp>"',
  );
}

function runGit(cwd: string, args: readonly string[]): string {
  const result = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(TEXT_DECODER.decode(result.stderr));
  }
  return TEXT_DECODER.decode(result.stdout).trim();
}
