import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertC4BaselineCeilingReportBindings,
  buildC4BaselineCeilingTargets,
  buildC4BaselinePrompt,
  runC4AdaptiveBaselineCeiling,
} from "../../scripts/codex-coding-effect/c4-baseline-ceiling";
import type {
  C4BaselineCeilingTarget,
} from "../../scripts/codex-coding-effect/c4-baseline-ceiling";
import { loadCodexCodingEffectDataset } from "../../scripts/codex-coding-effect/dataset";
import {
  assertC4BaselinePathIsolation,
  parseC4BaselineOptions,
  runC4BaselineCli,
} from "../../scripts/run-codex-coding-effect-c4-baseline-ceiling";

describe("Codex coding-effect C4 baseline ceiling", () => {
  it("stops after six stage-3 calls when no-memory reaches the ceiling", async () => {
    const calls: string[] = [];
    const report = await runC4AdaptiveBaselineCeiling({
      executeStage: async (target) => {
        calls.push(`${target.episodeId}/${target.stageId}`);
        return result(target, true);
      },
      runIdentity: identity("ceiling-high"),
      targets: targets(),
    });

    expect(() => assertC4BaselineCeilingReportBindings(report)).not.toThrow();
    expect(() => assertC4BaselineCeilingReportBindings({
      ...report,
      model: "drifted-model",
    })).toThrow("C4 baseline run identity hash is inconsistent");
    expect(() => assertC4BaselineCeilingReportBindings({
      ...report,
      results: report.results.map((result, index) =>
        index === 0
          ? { ...result, changedFiles: ["src/drift.ts"] }
          : result
      ),
    })).toThrow("C4 baseline stage evidence aggregate is inconsistent");
    expect(() => assertC4BaselineCeilingReportBindings({
      ...report,
      decision: "proceed-to-c5-pilot",
    })).toThrow("C4 baseline ceiling decision is inconsistent");
    expect(calls).toHaveLength(6);
    expect(calls.every((call) => call.endsWith("/stage-3"))).toBe(true);
    expect(report).toMatchObject({
      attemptedCount: 6,
      ceilingRisk: true,
      decision: "redesign-episodes-before-c5",
      infrastructureFailureCount: 0,
      manifestSha256: "c".repeat(64),
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
      resolvedCount: 6,
      runIdentitySha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      stageEvidenceAggregateSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(report.rounds).toHaveLength(1);
    expect(report.publicClaimEligible).toBe(false);
  });

  it("adds only stage 2 when the first six calls stay below the early ceiling", async () => {
    const calls: string[] = [];
    const report = await runC4AdaptiveBaselineCeiling({
      executeStage: async (target) => {
        calls.push(`${target.episodeId}/${target.stageId}`);
        const episode = Number(target.episodeId.slice("episode-".length));
        return result(target, episode <= 4);
      },
      runIdentity: identity("ceiling-low"),
      targets: targets(),
    });

    expect(calls).toHaveLength(12);
    expect(calls.slice(0, 6).every((call) => call.endsWith("/stage-3")))
      .toBe(true);
    expect(calls.slice(6).every((call) => call.endsWith("/stage-2")))
      .toBe(true);
    expect(report).toMatchObject({
      attemptedCount: 12,
      ceilingRisk: false,
      decision: "proceed-to-c5-pilot",
      resolvedCount: 8,
    });
    expect(report.rounds).toHaveLength(2);
  });

  it("marks the diagnostic inconclusive when a live stage has infrastructure failure", async () => {
    const report = await runC4AdaptiveBaselineCeiling({
      executeStage: async (target) =>
        target.episodeId === "episode-1"
          ? {
              ...result(target, false),
              disposition: "infrastructure-failure",
              executionFailureStage: "codex-launch",
            }
          : result(target, false),
      runIdentity: identity("ceiling-inconclusive"),
      targets: targets(),
    });

    expect(report).toMatchObject({
      ceilingRisk: null,
      decision: "inconclusive",
      infrastructureFailureCount: 1,
    });
  });

  it("selects only later-stage targets from all six controlled episodes", async () => {
    const loaded = await loadCodexCodingEffectDataset(
      "fixtures/codex-coding-effect/c4-controlled-pilot",
    );
    const selected = buildC4BaselineCeilingTargets(loaded.dataset);

    expect(selected).toHaveLength(12);
    expect(selected.filter((target) => target.position === 2)).toHaveLength(6);
    expect(selected.filter((target) => target.position === 3)).toHaveLength(6);
    expect(selected.every((target) => target.position > 1)).toBe(true);
  });

  it("adds only declared user-visible feedback to the frozen stage prompt", () => {
    const prompt = buildC4BaselinePrompt({
      allowedFeedback: ["Use the validated first-delimiter pattern."],
      prompt: "Repair the parser.",
    });

    expect(prompt).toBe([
      "Repair the parser.",
      "",
      "Prior user-visible feedback:",
      "Use the validated first-delimiter pattern.",
    ].join("\n"));
  });

  it("pins the low-cost pilot defaults unless explicitly overridden", () => {
    const options = parseC4BaselineOptions([
      "--run-id=c4-baseline-test",
      "--stage-timeout-ms=1234",
    ]);

    expect(options).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
      runId: "c4-baseline-test",
      stageTimeoutMs: 1234,
    });
    expect(() => parseC4BaselineOptions([
      "--run-id=c4-baseline-test",
      "--unknown=value",
    ])).toThrow("unknown C4 baseline option --unknown");
    expect(() => parseC4BaselineOptions([
      "--run-id=first",
      "--run-id=second",
    ])).toThrow("duplicate C4 baseline option --run-id");
    expect(() => parseC4BaselineOptions([
      "--run-id=../escape",
    ])).toThrow("--run-id must be one safe path segment");
  });

  it("rejects output paths that overlap frozen inputs or disposable work roots", () => {
    const options = parseC4BaselineOptions([
      "--run-id=c4-baseline-test",
      "--dataset-root=/tmp/c4-dataset",
      "--output-root=/tmp/c4-output",
      "--report-output=/tmp/c4-dataset/manifest.json",
      "--work-root=/tmp/c4-work",
    ]);

    expect(() => assertC4BaselinePathIsolation(options)).toThrow(
      "C4 baseline report output overlaps the frozen dataset",
    );
  });

  it("rejects report paths that reach the frozen dataset through a symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c4-paths-"));
    const datasetRoot = join(root, "dataset");
    const datasetAlias = join(root, "dataset-alias");
    try {
      await mkdir(datasetRoot);
      await symlink(datasetRoot, datasetAlias, "dir");
      const options = parseC4BaselineOptions([
        "--run-id=c4-baseline-test",
        `--dataset-root=${datasetRoot}`,
        `--output-root=${join(root, "output")}`,
        `--report-output=${join(datasetAlias, "report.json")}`,
        `--work-root=${join(root, "work")}`,
        `--auth-file=${join(root, "auth.json")}`,
      ]);

      expect(() => assertC4BaselinePathIsolation(options)).toThrow(
        "C4 baseline report output overlaps the frozen dataset",
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("validates physical paths before creating the owned work root", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c4-cli-paths-"));
    const datasetRoot = join(root, "dataset");
    const datasetAlias = join(root, "dataset-alias");
    const workRoot = join(datasetAlias, "work");
    try {
      await mkdir(datasetRoot);
      await symlink(datasetRoot, datasetAlias, "dir");

      await expect(runC4BaselineCli([
        "--run-id=c4-baseline-test",
        `--dataset-root=${datasetRoot}`,
        `--output-root=${join(root, "output")}`,
        `--report-output=${join(root, "report.json")}`,
        `--work-root=${workRoot}`,
        `--auth-file=${join(root, "auth.json")}`,
      ])).rejects.toThrow(
        "C4 baseline frozen dataset overlaps disposable work root",
      );
      expect(await Bun.file(workRoot).exists()).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

function targets(): C4BaselineCeilingTarget[] {
  return Array.from({ length: 6 }, (_, index) => {
    const episodeId = `episode-${index + 1}`;
    return [
      { episodeId, position: 2, stageId: "stage-2" } satisfies
        C4BaselineCeilingTarget,
      { episodeId, position: 3, stageId: "stage-3" } satisfies
        C4BaselineCeilingTarget,
    ];
  }).flat();
}

function identity(runId: string) {
  return {
    assetLockSha256: "a".repeat(64),
    assetRootSha256: "b".repeat(64),
    claimBoundary: "diagnostic-no-memory-ceiling-only" as const,
    codexExecutableSha256: "d".repeat(64),
    codexVersion: "codex-cli 0.144.5",
    datasetId: "codex-c4-controlled-pilot-v2",
    generatedAt: "2026-07-16T08:00:00.000Z",
    host: "codex" as const,
    manifestSha256: "c".repeat(64),
    model: "gpt-5.6-sol",
    networkAccess: false as const,
    publicClaimEligible: false as const,
    reasoningEffort: "xhigh",
    runId,
    schemaVersion: 1 as const,
    strategy: "stage-3-first-then-stage-2-if-needed" as const,
  };
}

function result(
  target: C4BaselineCeilingTarget,
  resolved: boolean,
) {
  return {
    changedFiles: resolved ? ["src/tasks.ts"] : [],
    codexStatus: "completed" as const,
    disposition: "finalized" as const,
    episodeId: target.episodeId,
    executionFailureStage: null,
    failToPassStatus: resolved ? "passed" as const : "failed" as const,
    passToPassStatus: "passed" as const,
    patchSha256: resolved ? "a".repeat(64) : null,
    resolved,
    stageEvidenceSha256: "b".repeat(64),
    stageId: target.stageId,
    taskFailureReasons: resolved ? [] : ["no-patch"],
    threadId: `${target.episodeId}-${target.stageId}`,
  };
}
