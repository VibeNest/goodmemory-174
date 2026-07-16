import { describe, expect, it } from "bun:test";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseCodexCodingEffectCliOptions,
} from "../../scripts/codex-coding-effect/cli-options";
import { resolveCodexCodingEffectDryRun } from "../../scripts/run-codex-coding-effect";

const GIT_SHA = "a".repeat(40);
const SNAPSHOT_SHA = "b".repeat(40);
const SHA256 = "c".repeat(64);

function requiredArgs() {
  return [
    "--dataset-root",
    "/dataset",
    "--run-id",
    "run-c0",
    "--output-dir",
    "/reports",
    "--workspace-root",
    "/workspaces",
    "--attempts-root",
    "/attempts",
    "--evidence-class",
    "deterministic-smoke",
    "--dry-run",
  ];
}

function validDataset() {
  return {
    datasetId: "dry-run-fixture",
    episodes: [{
      author: "GoodMemory maintainers",
      claimEligibility: "pilot-only",
      ecosystem: "bun",
      forbiddenLeakage: {
        fileSha256: [SHA256],
        strings: [],
      },
      goldPatchPath: "evaluator/gold/episode-001.patch",
      id: "episode-001",
      language: "typescript",
      preparation: {
        command: ["bun", "install", "--frozen-lockfile"],
        networkMode: "dependency-setup-only",
      },
      prehistory: {
        forbiddenLeakageSha256: [],
        path: "prehistory/episode-001.jsonl",
        sha256: SHA256,
        source: "frozen-artifact",
      },
      provenance: "Deterministic test fixture.",
      repository: {
        baseCommit: GIT_SHA,
        license: "MIT",
        url: "https://example.invalid/fixture.git",
      },
      sourceType: "controlled-mutation",
      stages: [{
        allowedFeedback: [],
        expectedMemoryDependencies: [],
        hiddenFailToPass: [
          "bun",
          "test",
          "{evaluatorRoot}/hidden/stage-1.test.ts",
        ],
        hiddenPassToPass: ["bun", "test", "tests/regression.test.ts"],
        id: "stage-1",
        position: 1,
        promptPath: "prompts/episode-001-stage-1.md",
        snapshot: SNAPSHOT_SHA,
        timeoutMs: 900_000,
      }],
      stateMode: "canonical-snapshot",
      strata: ["no-history-negative-control"],
    }],
    schemaVersion: 1,
  };
}

describe("Codex coding-effect CLI", () => {
  it("parses strict options and de-duplicates unordered selectors", () => {
    const options = parseCodexCodingEffectCliOptions([
      ...requiredArgs(),
      "--episode-id",
      "episode-002",
      "--episode-id",
      "episode-001",
      "--episode-id",
      "episode-002",
      "--arm",
      "goodmemory-installed",
      "--arm",
      "no-memory",
      "--arm",
      "goodmemory-installed",
      "--seed",
      "2",
      "--seed",
      "1",
      "--seed",
      "2",
      "--repetition-count",
      "3",
      "--codex-model",
      "gpt-5.6-codex",
      "--reasoning-effort",
      "high",
      "--max-concurrency",
      "2",
      "--stage-timeout-ms",
      "600000",
      "--test-timeout-ms",
      "120000",
      "--network-mode",
      "disabled",
      "--keep-workspaces",
    ]);

    expect(options).toMatchObject({
      arms: ["goodmemory-installed", "no-memory"],
      attemptsRoot: "/attempts",
      codexModel: "gpt-5.6-codex",
      datasetRoot: "/dataset",
      dryRun: true,
      episodeIds: ["episode-002", "episode-001"],
      evidenceClass: "deterministic-smoke",
      keepWorkspaces: true,
      maxConcurrency: 2,
      networkMode: "disabled",
      outputDir: "/reports",
      reasoningEffort: "high",
      repetitionCount: 3,
      resume: false,
      runId: "run-c0",
      seeds: [2, 1],
      stageTimeoutMs: 600_000,
      testTimeoutMs: 120_000,
      workspaceRoot: "/workspaces",
    });
  });

  it("rejects duplicate scalar and boolean flags", () => {
    expect(() => parseCodexCodingEffectCliOptions([
      ...requiredArgs(),
      "--run-id",
      "run-other",
    ])).toThrow("--run-id cannot be specified more than once.");

    expect(() => parseCodexCodingEffectCliOptions([
      ...requiredArgs(),
      "--dry-run",
    ])).toThrow("--dry-run cannot be specified more than once.");
  });

  it("rejects malformed positive integers", () => {
    for (const value of ["0", "-1", "1e2", "2.0", "02"]) {
      expect(() => parseCodexCodingEffectCliOptions([
        ...requiredArgs(),
        "--max-concurrency",
        value,
      ])).toThrow("--max-concurrency must be a positive integer.");
    }
  });

  it("rejects empty, whitespace-padded, path-traversing, and unknown values", () => {
    expect(() => parseCodexCodingEffectCliOptions([
      ...requiredArgs(),
      "--codex-model",
      " gpt-5.6-codex",
    ])).toThrow("--codex-model cannot be empty or whitespace-padded.");

    expect(() => parseCodexCodingEffectCliOptions([
      ...requiredArgs().map((value) => value === "run-c0" ? "../escape" : value),
    ])).toThrow("--run-id must be a single path segment.");

    expect(() => parseCodexCodingEffectCliOptions([
      ...requiredArgs(),
      "--codxe-model",
      "typo",
    ])).toThrow("unknown option --codxe-model");
  });

  it("rejects output, dataset, package, workspace, and attempts path overlap", () => {
    expect(() => parseCodexCodingEffectCliOptions([
      ...requiredArgs().map((value) => value === "/reports" ? "/dataset" : value),
    ])).toThrow("--output-dir must not overlap --dataset-root");

    expect(() => parseCodexCodingEffectCliOptions([
      ...requiredArgs().map((value) => value === "/workspaces"
        ? "/reports/run-c0/workspaces"
        : value),
    ])).toThrow("--output-dir must not overlap --workspace-root");

    expect(() => parseCodexCodingEffectCliOptions([
      ...requiredArgs(),
      "--package-tarball",
      "/reports/run-c0/package.tgz",
    ])).toThrow("--output-dir must not overlap --package-tarball");

    expect(() => parseCodexCodingEffectCliOptions([
      ...requiredArgs().map((value) => value === "/attempts" ? "/workspaces" : value),
    ])).toThrow("--workspace-root must not overlap --attempts-root");
  });

  it("fails incompatible arm and evidence-class combinations before setup", () => {
    expect(() => parseCodexCodingEffectCliOptions([
      ...requiredArgs().map((value) => value === "deterministic-smoke"
        ? "host-canary"
        : value),
      "--arm",
      "no-memory",
    ])).toThrow("host-canary runs require only the goodmemory-installed arm");

    expect(() => parseCodexCodingEffectCliOptions([
      ...requiredArgs().map((value) => value === "deterministic-smoke"
        ? "codex-coding-effect-candidate"
        : value),
      "--arm",
      "no-memory",
      "--arm",
      "goodmemory-installed",
    ])).toThrow("claim-candidate runs require the flat-summary arm");

    expect(() => parseCodexCodingEffectCliOptions([
      ...requiredArgs().map((value) => value === "deterministic-smoke"
        ? "codex-coding-effect-accepted"
        : value),
    ])).toThrow("codex-coding-effect-accepted is produced by the gate, not the runner");
  });

  it("fails closed when a frozen-prehistory live identity is not fully pinned", () => {
    const pilotArgs = requiredArgs().map((value) =>
      value === "deterministic-smoke" ? "frozen-prehistory-pilot" : value
    );
    expect(() => parseCodexCodingEffectCliOptions(pilotArgs)).toThrow(
      "frozen-prehistory-pilot requires --package-tarball",
    );
    expect(() => parseCodexCodingEffectCliOptions([
      ...pilotArgs,
      "--package-tarball",
      "/artifacts/goodmemory.tgz",
    ])).toThrow("frozen-prehistory-pilot requires --codex-model");
    expect(() => parseCodexCodingEffectCliOptions([
      ...pilotArgs,
      "--package-tarball",
      "/artifacts/goodmemory.tgz",
      "--codex-model",
      "gpt-5.6-sol",
    ])).toThrow("frozen-prehistory-pilot requires --reasoning-effort");

    expect(parseCodexCodingEffectCliOptions([
      ...pilotArgs,
      "--package-tarball",
      "/artifacts/goodmemory.tgz",
      "--codex-model",
      "gpt-5.6-sol",
      "--reasoning-effort",
      "xhigh",
    ])).toMatchObject({
      codexModel: "gpt-5.6-sol",
      evidenceClass: "frozen-prehistory-pilot",
      packageTarball: "/artifacts/goodmemory.tgz",
      reasoningEffort: "xhigh",
    });
  });

  it("resolves a frozen dry-run selection without writing result artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-codex-c0-"));
    try {
      const datasetRoot = join(root, "dataset");
      const outputDir = join(root, "reports");
      const workspaceRoot = join(root, "workspaces");
      const attemptsRoot = join(root, "attempts");
      await mkdir(datasetRoot, { recursive: true });
      await writeFile(
        join(datasetRoot, "manifest.json"),
        `${JSON.stringify(validDataset(), null, 2)}\n`,
        "utf8",
      );

      const selection = await resolveCodexCodingEffectDryRun([
        "--dataset-root",
        datasetRoot,
        "--run-id",
        "dry-run-c0",
        "--output-dir",
        outputDir,
        "--workspace-root",
        workspaceRoot,
        "--attempts-root",
        attemptsRoot,
        "--evidence-class",
        "deterministic-smoke",
        "--arm",
        "no-memory",
        "--arm",
        "goodmemory-installed",
        "--seed",
        "1",
        "--episode-id",
        "episode-001",
        "--dry-run",
      ]);

      expect(selection).toMatchObject({
        arms: ["no-memory", "goodmemory-installed"],
        datasetId: "dry-run-fixture",
        episodeIds: ["episode-001"],
        evidenceClass: "deterministic-smoke",
        runId: "dry-run-c0",
        schemaVersion: 1,
        seeds: [1],
        stageIds: ["episode-001/stage-1"],
      });
      expect(selection.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(Object.isFrozen(selection)).toBe(true);
      expect(Object.isFrozen(selection.arms)).toBe(true);
      expect(Object.isFrozen(selection.episodeIds)).toBe(true);
      await expect(access(outputDir)).rejects.toThrow();
      await expect(access(workspaceRoot)).rejects.toThrow();
      await expect(access(attemptsRoot)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
