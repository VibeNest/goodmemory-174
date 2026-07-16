import { describe, expect, it } from "bun:test";

import {
  parseCodexC3PilotOptions,
} from "../../scripts/codex-coding-effect/c3-pilot-options";

const defaults = {
  bunBinary: "/opt/bun/bin/bun",
  cwd: "/repo",
  homeDir: "/home/tester",
};

describe("Codex coding-effect C3 pilot CLI", () => {
  it("freezes the real paired pilot identity and isolated roots", () => {
    expect(parseCodexC3PilotOptions([
      "--package-tarball",
      "artifacts/goodmemory.tgz",
      "--run-id",
      "c3-pilot-001",
      "--codex-model",
      "gpt-5.6-sol",
      "--reasoning-effort",
      "xhigh",
    ], defaults)).toEqual({
      authFile: "/home/tester/.codex/auth.json",
      bunBinary: "/opt/bun/bin/bun",
      codexBinary: "codex",
      codexModel: "gpt-5.6-sol",
      fixtureRoot:
        "/home/tester/.goodmemory-eval/codex-coding-effect/c3-pilot-001/c3-pilot/fixture",
      goodMemorySourceRoot: "/repo",
      npmBinary: "npm",
      outputDir: "/home/tester/.goodmemory-eval/codex-coding-effect/raw",
      packageTarball: "/repo/artifacts/goodmemory.tgz",
      reasoningEffort: "xhigh",
      runId: "c3-pilot-001",
      runOutputDir:
        "/home/tester/.goodmemory-eval/codex-coding-effect/raw/c3-pilot-001",
      runtimeRoot:
        "/home/tester/.goodmemory-eval/codex-coding-effect/c3-pilot-001/c3-pilot/runtime",
      stageTimeoutMs: 900_000,
      testTimeoutMs: 300_000,
      workspaceRoot:
        "/home/tester/.goodmemory-eval/codex-coding-effect/c3-pilot-001/c3-pilot/workspaces",
    });
  });

  it("requires a tarball, run id, model, and reasoning effort", () => {
    expect(() => parseCodexC3PilotOptions([], defaults))
      .toThrow("--package-tarball is required");
    expect(() => parseCodexC3PilotOptions([
      "--package-tarball",
      "goodmemory.tgz",
      "--run-id",
      "c3",
      "--codex-model",
      "gpt-5.6-sol",
    ], defaults)).toThrow("--reasoning-effort is required");
  });

  it("rejects duplicate, unknown, traversing, and overlapping values", () => {
    const required = [
      "--package-tarball",
      "goodmemory.tgz",
      "--run-id",
      "c3",
      "--codex-model",
      "gpt-5.6-sol",
      "--reasoning-effort",
      "xhigh",
    ];
    expect(() => parseCodexC3PilotOptions([
      ...required,
      "--reasoning-effort",
      "high",
    ], defaults)).toThrow(
      "--reasoning-effort cannot be specified more than once",
    );
    expect(() => parseCodexC3PilotOptions([
      ...required.slice(0, 2),
      "--run-id",
      "../c3",
      ...required.slice(4),
    ], defaults)).toThrow("--run-id must be a single path segment");
    expect(() => parseCodexC3PilotOptions([
      ...required,
      "--surprise",
    ], defaults)).toThrow("unknown option --surprise");
    expect(() => parseCodexC3PilotOptions([
      ...required,
      "--runtime-root",
      "/repo",
    ], defaults)).toThrow(
      "--runtime-root must not overlap --package-tarball",
    );
    expect(() => parseCodexC3PilotOptions([
      ...required,
      "--output-dir",
      "/repo/reports/c3",
    ], defaults)).toThrow(
      "--output-dir must not overlap --runner-checkout",
    );
  });
});
