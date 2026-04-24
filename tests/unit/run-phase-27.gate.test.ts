import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildPhase27GateCommands,
  buildPhase27GateRunId,
  buildPhase27GateScope,
  parsePhase27GateCliOptions,
  resolvePhase27CanonicalDeterministicReportPath,
  resolvePhase27CanonicalLiveReportPath,
  resolvePhase27GateOutputDir,
  resolvePhase27RunOutputDir,
  runPhase27GateCli,
  runPhase27QualityGate,
} from "../../scripts/run-phase-27-gate";

const EXPECTED_DETERMINISTIC_TEST_ENV = {
  GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY: "",
  GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL: "",
  GOODMEMORY_ASSISTED_EXTRACTOR_MODEL: "",
  GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER: "",
  GOODMEMORY_EMBEDDING_API_KEY: "",
  GOODMEMORY_EMBEDDING_BASE_URL: "",
  GOODMEMORY_EMBEDDING_MODEL: "",
  GOODMEMORY_EMBEDDING_PROVIDER: "",
  GOODMEMORY_JUDGE_API_KEY: "",
  GOODMEMORY_JUDGE_BASE_URL: "",
  GOODMEMORY_JUDGE_MODEL: "",
  GOODMEMORY_JUDGE_PROVIDER: "",
  GOODMEMORY_RECALL_ROUTER_API_KEY: "",
  GOODMEMORY_RECALL_ROUTER_BASE_URL: "",
  GOODMEMORY_RECALL_ROUTER_MODEL: "",
  GOODMEMORY_RECALL_ROUTER_PROVIDER: "",
  GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH: "",
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT: "",
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: "",
  GOODMEMORY_SQLITE_VECTOR_MODE: "",
  GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION: "",
  GOODMEMORY_STORAGE_PROVIDER: "",
  GOODMEMORY_STORAGE_URL: "",
  GOODMEMORY_TEST_POSTGRES_URL: "",
};
const ROOT = join(import.meta.dir, "../..");
const CANONICAL_DETERMINISTIC_REPORT_PATH = resolvePhase27CanonicalDeterministicReportPath(
  ROOT,
);
const CANONICAL_LIVE_REPORT_PATH = resolvePhase27CanonicalLiveReportPath(ROOT);
const CANONICAL_QUALITY_GATE_PATH = join(
  ROOT,
  "reports/quality-gates/phase-27/run-20260421172000/phase-27-quality-gate.json",
);

function buildAcceptedCanonicalDeterministicReport(
  metrics: Record<string, unknown> = {
    publicSurfacePurity: { passed: true },
    referenceSetup: { passed: true },
  },
): string {
  return JSON.stringify({
    metrics,
    mode: "fallback",
    runId: "run-20260421165000",
    summary: {
      accepted: true,
      totalScenarioCases: 13,
    },
  });
}

function buildAcceptedCanonicalLiveReport(): string {
  return JSON.stringify({
    mode: "live-memory",
    runId: "run-20260421170500",
    summary: {
      accepted: true,
      totalScenarioCases: 4,
    },
  });
}

describe("run-phase-27 gate script", () => {
  it("resolves the phase-27 gate output directory", () => {
    expect(resolvePhase27GateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-27",
    );
  });

  it("normalizes relative output dirs against the repo root", () => {
    expect(
      resolvePhase27RunOutputDir(
        "/tmp/goodmemory",
        "reports/quality-gates/phase-27",
      ),
    ).toBe("/tmp/goodmemory/reports/quality-gates/phase-27");
  });

  it("builds the canonical phase-27 gate command list", () => {
    expect(buildPhase27GateCommands("/tmp/goodmemory")).toEqual([
      {
        label: "typecheck",
        cwd: "/tmp/goodmemory",
        args: ["bun", "run", "typecheck"],
      },
      {
        label: "phase-27-targeted-regressions",
        cwd: "/tmp/goodmemory",
        env: EXPECTED_DETERMINISTIC_TEST_ENV,
        args: [
          "bun",
          "test",
          "tests/unit/run-phase-27.script.test.ts",
          "tests/unit/run-phase-27.gate.test.ts",
          "tests/examples/examples.test.ts",
          "tests/release/release.test.ts",
        ],
      },
      {
        label: "phase-27-fallback-eval",
        cwd: "/tmp/goodmemory",
        env: EXPECTED_DETERMINISTIC_TEST_ENV,
        args: ["bun", "run", "eval:phase-27"],
      },
    ]);
  });

  it("creates a deterministic run id from the generation timestamp", () => {
    expect(buildPhase27GateRunId("2026-04-20T18:10:00.000Z")).toBe(
      "run-20260420181000",
    );
  });

  it("keeps the canonical accepted artifacts aligned with the current gate scope", async () => {
    const gateReport = JSON.parse(
      await readFile(CANONICAL_QUALITY_GATE_PATH, "utf8"),
    ) as {
      evidence: {
        deterministicReport: {
          artifactKind: string;
          ignoredReportPath: string;
          regenerateCommand: string;
        };
      };
    };
    const liveReport = JSON.parse(
      await readFile(CANONICAL_LIVE_REPORT_PATH, "utf8"),
    ) as {
      runId: string;
      summary: { accepted: boolean; totalScenarioCases: number };
    };

    expect(gateReport.evidence.deterministicReport).toEqual({
      artifactKind: "ignored_generated",
      ignoredReportPath:
        "reports/eval/fallback/phase-27/run-20260421165000/report.json",
      regenerateCommand: "bun run eval:phase-27 --run-id run-20260421165000",
    });
    expect(liveReport.runId).toBe("run-20260421170500");
    expect(liveReport.summary.accepted).toBe(true);
    expect(liveReport.summary.totalScenarioCases).toBe(4);
    expect(buildPhase27GateScope().inScope).toContain(
      "canonical provider-backed live adoption evidence for continuation/open-loop and repeated correction",
    );
  });

  it("writes an accepted report when canonical artifacts validate and all commands pass", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];
    const report = await runPhase27QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-27",
        runId: "run-phase27",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-20T18:10:00.000Z",
        readTextFile: async (path) => {
          if (path === CANONICAL_DETERMINISTIC_REPORT_PATH) {
            return buildAcceptedCanonicalDeterministicReport();
          }
          if (path === CANONICAL_LIVE_REPORT_PATH) {
            return buildAcceptedCanonicalLiveReport();
          }
          throw new Error(`Unexpected read: ${path}`);
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
    expect(report.acceptance.reason).toContain("Phase 27");
    expect(report.evidence.deterministicReport).toEqual({
      artifactKind: "ignored_generated",
      ignoredReportPath:
        "reports/eval/fallback/phase-27/run-20260421165000/report.json",
      regenerateCommand: "bun run eval:phase-27 --run-id run-20260421165000",
    });
    expect(report.scope).toEqual(buildPhase27GateScope());
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/quality-gates/phase-27/run-phase27",
    ]);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-27/run-phase27/phase-27-quality-gate.json",
    );
  });

  it("blocks when the canonical live artifact is missing", async () => {
    const report = await runPhase27QualityGate(undefined, {
      now: () => "2026-04-20T18:10:00.000Z",
      readTextFile: async (path) => {
        if (path === CANONICAL_DETERMINISTIC_REPORT_PATH) {
          return buildAcceptedCanonicalDeterministicReport();
        }
        throw new Error("ENOENT");
      },
      runCommand: async () => ({
        durationMs: 10,
        exitCode: 0,
        stderr: "",
        stdout: "ok",
      }),
      writeTextFile: async () => {},
    });

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.acceptance.reason).toContain("live-memory report is missing or unreadable");
    expect(report.commands).toEqual([]);
  });

  it("blocks when the canonical fallback artifact lacks explicit setup and purity metrics", async () => {
    const report = await runPhase27QualityGate(undefined, {
      now: () => "2026-04-20T18:10:00.000Z",
      readTextFile: async (path) => {
        if (path === CANONICAL_DETERMINISTIC_REPORT_PATH) {
          return buildAcceptedCanonicalDeterministicReport({});
        }
        if (path === CANONICAL_LIVE_REPORT_PATH) {
          return buildAcceptedCanonicalLiveReport();
        }
        throw new Error(`Unexpected read: ${path}`);
      },
      runCommand: async () => ({
        durationMs: 10,
        exitCode: 0,
        stderr: "",
        stdout: "ok",
      }),
      writeTextFile: async () => {},
    });

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.acceptance.reason).toContain("referenceSetup");
    expect(report.commands).toHaveLength(3);
  });

  it("blocks when a required command fails", async () => {
    const report = await runPhase27QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-27",
        runId: "run-phase27",
      },
      {
        ensureDir: async () => {},
        now: () => "2026-04-20T18:10:00.000Z",
        readTextFile: async (path) => {
          if (path === CANONICAL_DETERMINISTIC_REPORT_PATH) {
            return buildAcceptedCanonicalDeterministicReport();
          }
          if (path === CANONICAL_LIVE_REPORT_PATH) {
            return buildAcceptedCanonicalLiveReport();
          }
          throw new Error(`Unexpected read: ${path}`);
        },
        runCommand: async (command) => ({
          durationMs: 10,
          exitCode: command.label === "phase-27-fallback-eval" ? 1 : 0,
          stderr: command.label === "phase-27-fallback-eval" ? "failed" : "",
          stdout: "",
        }),
        writeTextFile: async () => {},
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.acceptance.reason).toContain("phase-27-fallback-eval");
    expect(report.commands).toHaveLength(3);
    expect(report.commands[2]?.status).toBe("failed");
  });

  it("parses CLI options for output dir and run id", () => {
    expect(
      parsePhase27GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-27-gate.ts",
        "--output-dir",
        "/tmp/phase27",
        "--run-id",
        "run-custom",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase27",
      runId: "run-custom",
    });
  });

  it("prints the acceptance line in the CLI wrapper", async () => {
    const logs: string[] = [];
    const exits: number[] = [];

    const report = await runPhase27GateCli({
      argv: ["bun", "run", "scripts/run-phase-27-gate.ts"],
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
        evidence: {
          deterministicReport: {
            artifactKind: "ignored_generated",
            ignoredReportPath:
              "reports/eval/fallback/phase-27/run-20260421165000/report.json",
            regenerateCommand:
              "bun run eval:phase-27 --run-id run-20260421165000",
          },
        },
        generatedAt: "2026-04-20T18:10:00.000Z",
        generatedBy: "tests",
        phase: "phase-27",
        runDirectory: "/tmp/goodmemory/reports/quality-gates/phase-27/run-phase27",
        runId: "run-phase27",
        scope: buildPhase27GateScope(),
      }),
    });

    expect(report.runId).toBe("run-phase27");
    expect(exits).toEqual([]);
    expect(logs[0]).toContain("\"phase\": \"phase-27\"");
  });
});
