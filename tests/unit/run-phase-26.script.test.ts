import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildPhase26GateCommands,
  buildPhase26GateRunId,
  buildPhase26GateScope,
  parsePhase26GateCliOptions,
  resolvePhase26CanonicalReportPath,
  resolvePhase26CanonicalRunDirectory,
  resolvePhase26GateOutputDir,
  resolvePhase26RunOutputDir,
  runPhase26GateCli,
  runPhase26QualityGate,
} from "../../scripts/run-phase-26-gate";

const EXPECTED_DETERMINISTIC_TEST_ENV = {
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
};
const CANONICAL_REPORT_PATH = resolvePhase26CanonicalReportPath(
  join(import.meta.dir, "../.."),
);

describe("run-phase-26 gate script", () => {
  it("resolves the phase-26 gate output directory", () => {
    expect(resolvePhase26GateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-26",
    );
  });

  it("normalizes relative output dirs against the repo root", () => {
    expect(
      resolvePhase26RunOutputDir(
        "/tmp/goodmemory",
        "reports/quality-gates/phase-26",
      ),
    ).toBe("/tmp/goodmemory/reports/quality-gates/phase-26");
  });

  it("builds the canonical phase-26 gate command list", () => {
    expect(buildPhase26GateCommands("/tmp/goodmemory")).toEqual([
      {
        label: "typecheck",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "typecheck"],
      },
      {
        label: "phase-26-targeted-regressions",
        cwd: "/tmp/goodmemory",
        env: EXPECTED_DETERMINISTIC_TEST_ENV,
        args: [
          "bun",
          "test",
          "tests/unit/runtime-resolution.test.ts",
          "tests/unit/storage.postgres.test.ts",
          "tests/unit/sqlite.runtime.test.ts",
          "tests/unit/sqlite.vector-extension.search.test.ts",
          "tests/integration/api.smoke.test.ts",
          "tests/integration/api.auto-storage.test.ts",
          "tests/integration/storage.sqlite.test.ts",
          "tests/cli/cli.test.ts",
        ],
      },
      {
        label: "phase-26-closure-contract",
        cwd: "/tmp/goodmemory",
        env: EXPECTED_DETERMINISTIC_TEST_ENV,
        args: [
          "bun",
          "test",
          "tests/unit/run-phase-26.script.test.ts",
          "tests/release/release.test.ts",
        ],
      },
    ]);
  });

  it("keeps the canonical accepted artifact aligned with the current command list and scope", async () => {
    const canonicalReport = JSON.parse(
      await readFile(CANONICAL_REPORT_PATH, "utf8"),
    ) as {
      commands: Array<{ command: string; label: string }>;
      runDirectory: string;
      scope: {
        inScope: string[];
        outOfScope: string[];
      };
    };

    expect(
      canonicalReport.commands.map((command) => ({
        label: command.label,
        command: command.command,
      })),
    ).toEqual(
      buildPhase26GateCommands("/tmp/goodmemory").map((command) => ({
        label: command.label,
        command: command.args.join(" "),
      })),
    );
    expect(canonicalReport.runDirectory).toBe(
      resolvePhase26CanonicalRunDirectory(join(import.meta.dir, "../..")),
    );
    expect(canonicalReport.scope).toEqual(buildPhase26GateScope());
  });

  it("creates a deterministic run id from the generation timestamp", () => {
    expect(buildPhase26GateRunId("2026-04-20T10:21:32.123Z")).toBe(
      "run-20260420102132",
    );
  });

  it("keeps the default gate run validation-only and does not persist a new report", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];
    const commands: string[] = [];
    const report = await runPhase26QualityGate(undefined, {
      ensureDir: async (path) => {
        directories.push(path);
      },
      now: () => "2026-04-20T10:21:32.123Z",
      readTextFile: async (path) => {
        expect(path).toBe(CANONICAL_REPORT_PATH);
        return readFile(path, "utf8");
      },
      runCommand: async (command) => {
        commands.push(command.label);
        return {
          durationMs: 10,
          exitCode: 0,
          stderr: "",
          stdout: `${command.label} ok`,
        };
      },
      writeTextFile: async (path, content) => {
        writes.push({ path, content });
      },
    });

    expect(report.acceptance.decision).toBe("accepted");
    expect(report.runId).toBe("run-20260420193000");
    expect(commands).toEqual([
      "typecheck",
      "phase-26-targeted-regressions",
      "phase-26-closure-contract",
    ]);
    expect(directories).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("blocks the default gate when the archived canonical artifact is missing", async () => {
    let ranCommands = false;
    const report = await runPhase26QualityGate(undefined, {
      now: () => "2026-04-20T10:21:32.123Z",
      readTextFile: async () => {
        throw new Error("ENOENT");
      },
      runCommand: async () => {
        ranCommands = true;
        return {
          durationMs: 10,
          exitCode: 0,
          stderr: "",
          stdout: "ok",
        };
      },
      writeTextFile: async () => {},
    });

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.acceptance.reason).toContain("missing or unreadable");
    expect(report.commands).toEqual([]);
    expect(ranCommands).toBe(false);
  });

  it("blocks the default gate when the archived canonical artifact drifts", async () => {
    let ranCommands = false;
    const canonicalReport = await readFile(CANONICAL_REPORT_PATH, "utf8");
    const report = await runPhase26QualityGate(undefined, {
      now: () => "2026-04-20T10:21:32.123Z",
      readTextFile: async () => `${canonicalReport} `,
      runCommand: async () => {
        ranCommands = true;
        return {
          durationMs: 10,
          exitCode: 0,
          stderr: "",
          stdout: "ok",
        };
      },
      writeTextFile: async () => {},
    });

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.acceptance.reason).toContain("drifted from the accepted snapshot");
    expect(report.commands).toEqual([]);
    expect(ranCommands).toBe(false);
  });

  it("writes an ad hoc report with a fresh run id when only outputDir is overridden", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];
    const report = await runPhase26QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-26-reruns",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-20T10:21:32.123Z",
        readTextFile: async () => {
          throw new Error("should not read canonical artifact for ad hoc reruns");
        },
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
    expect(report.runId).toBe("run-20260420102132");
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/quality-gates/phase-26-reruns/run-20260420102132",
    ]);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-26-reruns/run-20260420102132/phase-26-quality-gate.json",
    );
  });

  it("writes an accepted report when all required commands pass", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];
    const report = await runPhase26QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-26",
        runId: "run-phase26",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-20T10:21:32.123Z",
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
    expect(report.acceptance.reason).toContain("Phase 26");
    expect(report.acceptance.reason).toContain("closure contract");
    expect(report.scope.inScope).toContain(
      "default storage resolution with explicit-over-auto precedence",
    );
    expect(report.scope.inScope).toContain(
      "phase-26 closure contract for the gate script and canonical accepted evidence chain",
    );
    expect(report.scope.outOfScope).toContain(
      "promoting sqlite-vss indexed acceleration as the canonical default backend",
    );
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/quality-gates/phase-26/run-phase26",
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-26/run-phase26/phase-26-quality-gate.json",
    );
    expect(writes[0]?.content).toContain("\"phase\": \"phase-26\"");
  });

  it("blocks the report when a required command fails", async () => {
    const report = await runPhase26QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-26",
        runId: "run-phase26",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-20T10:21:32.123Z",
        runCommand: async (command) => ({
          durationMs: 10,
          exitCode: command.label === "phase-26-closure-contract" ? 1 : 0,
          stderr: command.label === "phase-26-closure-contract" ? "failed" : "",
          stdout: "",
        }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.acceptance.reason).toContain("phase-26-closure-contract");
    expect(report.commands).toHaveLength(3);
    expect(report.commands[2]?.status).toBe("failed");
  });

  it("parses CLI options for output dir and run id", () => {
    expect(
      parsePhase26GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-26-gate.ts",
        "--output-dir",
        "/tmp/phase26",
        "--run-id",
        "run-custom",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase26",
      runId: "run-custom",
    });
  });

  it("prints the acceptance line in the CLI wrapper", async () => {
    const logs: string[] = [];
    const exits: number[] = [];

    const report = await runPhase26GateCli({
      argv: ["bun", "run", "scripts/run-phase-26-gate.ts"],
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
        generatedAt: "2026-04-20T10:21:32.123Z",
        generatedBy: "tests",
        phase: "phase-26",
        runDirectory: "/tmp/goodmemory/reports/quality-gates/phase-26/run-phase26",
        runId: "run-phase26",
        scope: {
          inScope: [],
          outOfScope: [],
        },
      }),
    });

    expect(report.phase).toBe("phase-26");
    expect(logs.some((line) => line.includes("Phase 26 quality gate: accepted"))).toBe(
      true,
    );
    expect(exits).toEqual([]);
  });
});
