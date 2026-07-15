import { describe, expect, it } from "bun:test";

import { parseCodexNativeCanaryOptions } from "../../scripts/codex-coding-effect/canary-options";

const defaults = {
  cwd: "/repo",
  homeDir: "/home/tester",
  tmpDir: "/tmp",
};

describe("Codex native canary CLI", () => {
  it("freezes an isolated packaged-host run", () => {
    expect(parseCodexNativeCanaryOptions([
      "--package-tarball",
      "artifacts/goodmemory.tgz",
      "--run-id",
      "c2-native-001",
      "--codex-model",
      "gpt-test",
      "--reasoning-effort",
      "high",
    ], defaults)).toEqual({
      authFile: "/home/tester/.codex/auth.json",
      codexBinary: "codex",
      codexModel: "gpt-test",
      keepRuntime: false,
      npmBinary: "npm",
      outputDir: "/repo/reports/eval/research/codex-coding-effect",
      packageTarball: "/repo/artifacts/goodmemory.tgz",
      reasoningEffort: "high",
      runId: "c2-native-001",
      runOutputDir:
        "/repo/reports/eval/research/codex-coding-effect/c2-native-001",
      runtimeRoot:
        "/tmp/goodmemory-codex-coding-effect/c2-native-001/native-canary",
      sourceRoot: "/repo",
      timeoutMs: 900_000,
    });
  });

  it("requires immutable package, run, and model inputs", () => {
    expect(() => parseCodexNativeCanaryOptions([], defaults))
      .toThrow("--package-tarball is required");
    expect(() => parseCodexNativeCanaryOptions([
      "--package-tarball",
      "goodmemory.tgz",
      "--run-id",
      "c2",
    ], defaults)).toThrow("--codex-model is required");
  });

  it("rejects duplicate, unknown, traversing, and overlapping values", () => {
    expect(() => parseCodexNativeCanaryOptions([
      "--package-tarball",
      "a.tgz",
      "--package-tarball",
      "b.tgz",
      "--run-id",
      "c2",
      "--codex-model",
      "gpt-test",
    ], defaults)).toThrow("--package-tarball cannot be specified more than once");

    expect(() => parseCodexNativeCanaryOptions([
      "--package-tarball",
      "a.tgz",
      "--run-id",
      "../c2",
      "--codex-model",
      "gpt-test",
    ], defaults)).toThrow("--run-id must be a single path segment");

    expect(() => parseCodexNativeCanaryOptions([
      "--package-tarball",
      "a.tgz",
      "--run-id",
      "c2",
      "--codex-model",
      "gpt-test",
      "--surprise",
    ], defaults)).toThrow("unknown option --surprise");

    expect(() => parseCodexNativeCanaryOptions([
      "--package-tarball",
      "/tmp/run/package.tgz",
      "--run-id",
      "c2",
      "--codex-model",
      "gpt-test",
      "--runtime-root",
      "/tmp/run",
    ], defaults)).toThrow("--runtime-root must not overlap --package-tarball");
  });
});
