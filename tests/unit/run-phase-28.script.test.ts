import { describe, expect, it } from "bun:test";
import {
  buildPhase28GateCommands,
  buildPhase28GateRunId,
  buildPhase28GateScope,
  parsePhase28GateCliOptions,
  resolvePhase28GateOutputDir,
  runPhase28GateCli,
  runPhase28QualityGate,
} from "../../scripts/run-phase-28-gate";

const EXPECTED_PHASE28_TEST_ENV = {
  GOODMEMORY_EMBEDDING_API_KEY: "",
  GOODMEMORY_EMBEDDING_BASE_URL: "",
  GOODMEMORY_EMBEDDING_MODEL: "",
  GOODMEMORY_EMBEDDING_PROVIDER: "",
  GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH: "",
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT: "",
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: "",
  GOODMEMORY_SQLITE_VECTOR_MODE: "",
  GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION: "",
  GOODMEMORY_STORAGE_PROVIDER: "",
  GOODMEMORY_STORAGE_URL: "",
} as const;

describe("run-phase-28 gate script", () => {
  it("resolves the phase-28 gate output directory", () => {
    expect(resolvePhase28GateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-28",
    );
  });

  it("builds the canonical phase-28 gate command list", () => {
    expect(buildPhase28GateCommands("/tmp/goodmemory")).toEqual([
      {
        label: "typecheck",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "typecheck"],
      },
      {
        label: "phase-28-targeted-regressions",
        cwd: "/tmp/goodmemory",
        env: EXPECTED_PHASE28_TEST_ENV,
        args: [
          "bun",
          "test",
          "tests/unit/sqlite.runtime.test.ts",
          "tests/unit/sqlite.vector-extension.search.test.ts",
          "tests/unit/run-phase-28.script.test.ts",
          "tests/integration/storage.sqlite.test.ts",
          "tests/integration/storage.sqlite-vss.test.ts",
          "tests/integration/api.auto-storage.test.ts",
          "tests/cli/cli.test.ts",
        ],
      },
    ]);
  });

  it("creates a deterministic run id from the generation timestamp", () => {
    expect(buildPhase28GateRunId("2026-04-21T09:30:00.000Z")).toBe(
      "run-20260421093000",
    );
  });

  it("describes the accepted phase-28 scope", () => {
    expect(buildPhase28GateScope().inScope).toContain(
      "real sqlite-vss indexed local backend on supported runtimes",
    );
    expect(buildPhase28GateScope().outOfScope).toContain(
      "bundled local embedding generation",
    );
  });

  it("blocks when the canonical sqlite-vss runtime is not available", async () => {
    const report = await runPhase28QualityGate(undefined, {
      detectBundledRuntime: () => false,
      now: () => "2026-04-21T09:30:00.000Z",
      runCommand: async () => ({
        durationMs: 10,
        exitCode: 0,
        stderr: "",
        stdout: "ok",
      }),
      writeTextFile: async () => {},
    });

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.acceptance.reason).toContain("supported sqlite-vss runtime");
    expect(report.commands).toEqual([]);
  });

  it("writes an accepted report when the runtime preflight passes and all commands succeed", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];
    const report = await runPhase28QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-28",
        runId: "run-phase28",
      },
      {
        detectBundledRuntime: () => true,
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-21T09:30:00.000Z",
        runCommand: async (command) => ({
          durationMs: 10,
          exitCode: 0,
          stderr: "",
          stdout: `${command.label} ok`,
        }),
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(report.scope).toEqual(buildPhase28GateScope());
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/quality-gates/phase-28/run-phase28",
    ]);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-28/run-phase28/phase-28-quality-gate.json",
    );
  });

  it("parses CLI options for output dir and run id", () => {
    expect(
      parsePhase28GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-28-gate.ts",
        "--output-dir",
        "/tmp/phase28",
        "--run-id",
        "run-custom",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase28",
      runId: "run-custom",
    });
  });

  it("prints the acceptance line in the CLI wrapper", async () => {
    const logs: string[] = [];
    const exits: number[] = [];

    const report = await runPhase28GateCli({
      argv: ["bun", "run", "scripts/run-phase-28-gate.ts"],
      exit: (code) => {
        exits.push(code);
      },
      log: (message) => {
        logs.push(message);
      },
      runGate: async () => ({
        acceptance: {
          decision: "accepted",
          reason: "ok",
        },
        commands: [],
        generatedAt: "2026-04-21T09:30:00.000Z",
        generatedBy: "tests",
        phase: "phase-28",
        runDirectory: "/tmp/goodmemory/reports/quality-gates/phase-28/run-phase28",
        runId: "run-phase28",
        scope: buildPhase28GateScope(),
      }),
    });

    expect(report.phase).toBe("phase-28");
    expect(logs.some((line) => line.includes("Phase 28 quality gate: accepted"))).toBe(
      true,
    );
    expect(exits).toEqual([]);
  });
});
