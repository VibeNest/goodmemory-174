import { describe, expect, it } from "bun:test";
import {
  PHASE54_CANONICAL_GATE_RUN_ID,
  parsePhase54GateCliOptions,
  resolvePhase54CanonicalFallbackReportPath,
  resolvePhase54CanonicalLiveReportPath,
  resolvePhase54GateOutputDir,
  runPhase54Gate,
} from "../../scripts/run-phase-54-gate";

const REQUIRED_TASK_FILES = [
  "conditioned_api_aversion.json",
  "conditioned_directory_restriction.json",
  "conditioned_jargon_avoidance.json",
  "conditioned_protocol_preference.json",
  "context_dependent_api_behavior.json",
  "logiql_query_language.json",
  "reversed_parameter_protocol.json",
  "session_key_prefix_rule.json",
  "the_alien_filesystem.json",
  "the_eccentric_api_call.json",
  "the_modified_recurrence_sequence.json",
  "the_omega_operation.json",
] as const;

function buildCases(input: {
  passedTaskFiles: readonly string[];
  profile: "goodmemory-distilled-feedback" | "goodmemory-raw-experience";
}): Array<Record<string, unknown>> {
  return REQUIRED_TASK_FILES.map((taskFile) => ({
    blocking: true,
    caseId: `${input.profile}:${taskFile}`,
    datasetFamily: taskFile.startsWith("conditioned_") ||
      taskFile === "context_dependent_api_behavior.json"
      ? "classical_conditioning"
      : "procedural_memory",
    explicitRecallLeak: false,
    feedbackSignalApplied: input.profile === "goodmemory-distilled-feedback",
    judgeReason: input.passedTaskFiles.includes(taskFile) ? "pass" : "fail",
    passed: input.passedTaskFiles.includes(taskFile),
    profile: input.profile,
    scorerFamily:
      taskFile === "logiql_query_language.json" ||
      taskFile === "reversed_parameter_protocol.json" ||
      taskFile === "session_key_prefix_rule.json" ||
      taskFile === "the_alien_filesystem.json" ||
      taskFile === "the_eccentric_api_call.json"
        ? "structured_first_action"
        : "text_behavior_judge",
    sourceFile: `/tmp/${taskFile}`,
    taskFile,
    taskName: taskFile.replace(/\.json$/u, ""),
  }));
}

function buildLiveReport(input?: {
  distilledLeakCount?: number;
  distilledPassedTaskFiles?: readonly string[];
  rawLeakCount?: number;
  rawPassedTaskFiles?: readonly string[];
}): Record<string, unknown> {
  const rawPassedTaskFiles =
    input?.rawPassedTaskFiles ??
    [
      "conditioned_api_aversion.json",
      "conditioned_protocol_preference.json",
      "conditioned_directory_restriction.json",
      "context_dependent_api_behavior.json",
      "the_modified_recurrence_sequence.json",
      "the_omega_operation.json",
      "logiql_query_language.json",
      "reversed_parameter_protocol.json",
      "the_alien_filesystem.json",
    ];
  const distilledPassedTaskFiles =
    input?.distilledPassedTaskFiles ?? REQUIRED_TASK_FILES;
  const rawCases = buildCases({
    passedTaskFiles: rawPassedTaskFiles,
    profile: "goodmemory-raw-experience",
  });
  const distilledCases = buildCases({
    passedTaskFiles: distilledPassedTaskFiles,
    profile: "goodmemory-distilled-feedback",
  });

  return {
    benchmarkRoot: "/tmp/goodmemory/fixtures/implicitmembench-phase-54",
    generatedAt: "2026-05-02T00:00:00.000Z",
    generatedBy: "scripts/run-phase-54-live-memory.ts",
    kind: "goodmemory",
    manifestPath:
      "/tmp/goodmemory/fixtures/implicitmembench-phase-54/adapter-manifest.json",
    mode: "live",
    outputDir: "/tmp/goodmemory/reports/eval/live-memory/phase-54",
    profiles: {
      "goodmemory-raw-experience": {
        caseCountsByDataset: {
          classical_conditioning: 5,
          priming: 0,
          procedural_memory: 7,
        },
        caseCountsByScorer: {
          priming_pair_judge: 0,
          structured_first_action: 5,
          text_behavior_judge: 7,
        },
        cases: rawCases,
        executionFailures: 0,
        explicitRecallLeakCount: input?.rawLeakCount ?? 1,
        passedBlockingCases: rawPassedTaskFiles.length,
        primingAverageScore: null,
        totalBlockingCases: 12,
        totalCases: 12,
      },
      "goodmemory-distilled-feedback": {
        caseCountsByDataset: {
          classical_conditioning: 5,
          priming: 0,
          procedural_memory: 7,
        },
        caseCountsByScorer: {
          priming_pair_judge: 0,
          structured_first_action: 5,
          text_behavior_judge: 7,
        },
        cases: distilledCases,
        executionFailures: 0,
        explicitRecallLeakCount: input?.distilledLeakCount ?? 0,
        passedBlockingCases: distilledPassedTaskFiles.length,
        primingAverageScore: null,
        totalBlockingCases: 12,
        totalCases: 12,
      },
    },
    runDirectory: "/tmp/goodmemory/reports/eval/live-memory/phase-54/run-phase54-live-current",
    runId: "run-phase54-live-current",
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: {
      caseCountsByDataset: {
        classical_conditioning: 10,
        priming: 0,
        procedural_memory: 14,
      },
      caseCountsByScorer: {
        priming_pair_judge: 0,
        structured_first_action: 10,
        text_behavior_judge: 14,
      },
      executionFailures: 0,
      explicitRecallLeakCount:
        (input?.rawLeakCount ?? 1) + (input?.distilledLeakCount ?? 0),
      passedBlockingCases:
        rawPassedTaskFiles.length + distilledPassedTaskFiles.length,
      primingAverageScore: null,
      totalBlockingCases: 24,
      totalCases: 24,
    },
  };
}

function buildSmokeReport(liveReport: Record<string, unknown>): Record<string, unknown> {
  return {
    ...liveReport,
    generatedBy: "scripts/run-phase-54-eval.ts",
    mode: "smoke",
    outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-54",
    runDirectory:
      "/tmp/goodmemory/reports/eval/fallback/phase-54/run-phase54-fallback-current",
    runId: "run-phase54-fallback-current",
  };
}

describe("run-phase-54 gate", () => {
  it("resolves phase-54 gate output and canonical report paths", () => {
    expect(resolvePhase54GateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-54",
    );
    expect(resolvePhase54CanonicalFallbackReportPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-54/run-phase54-fallback-current/report.json",
    );
    expect(resolvePhase54CanonicalLiveReportPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-54/run-phase54-live-current/report.json",
    );
  });

  it("parses phase-54 gate cli flags", () => {
    expect(
      parsePhase54GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-54-gate.ts",
        "--live-report-path",
        "/tmp/live.json",
        "--output-dir",
        "/tmp/out",
        "--run-id",
        "run-phase54-gate",
      ]),
    ).toEqual({
      liveReportPath: "/tmp/live.json",
      outputDir: "/tmp/out",
      runId: "run-phase54-gate",
    });
  });

  it("accepts when the live report passes every targeted task file", async () => {
    const writes = new Map<string, string>();
    const commands: string[] = [];
    const liveReport = buildLiveReport();
    const smokeReport = buildSmokeReport(liveReport);

    const report = await runPhase54Gate(
      {
        liveReportPath: "/tmp/live.json",
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-54",
        runId: "run-phase54-gate-test",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-05-02T00:00:00.000Z",
        readTextFile: async (path) =>
          path === "/tmp/live.json"
            ? JSON.stringify(liveReport)
            : JSON.stringify(smokeReport),
        runCommand: async (command) => {
          commands.push(command.args.join(" "));
          return {
            durationMs: 1,
            exitCode: 0,
            stderr: "",
            stdout: "ok",
          };
        },
        writeTextFile: async (path, content) => {
          writes.set(path, content);
        },
      },
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.deterministicReport.status).toBe("accepted");
    expect(report.evidence.deterministicReport.ignoredReportPath).toBe(
      "reports/eval/fallback/phase-54/run-phase54-fallback-current/report.json",
    );
    expect(report.evidence.liveMemoryReport.requiredTaskFilesPresent).toHaveLength(12);
    expect(report.evidence.liveMemoryReport.structuredRawPasses).toBe(3);
    expect(report.evidence.liveMemoryReport.structuredDistilledPasses).toBe(5);
    expect(report.evidence.liveMemoryReport.explicitRecallLeakDelta).toBe(-1);
    expect(commands).toContain(
      "bun run eval:phase-54 -- --run-id run-phase54-fallback-current",
    );
    expect(commands).toContain(
      "bun run eval:phase-54-live-memory -- --run-id run-phase54-live-current",
    );
    expect(
      writes.has(
        "/tmp/goodmemory/reports/quality-gates/phase-54/run-phase54-gate-test/phase-54-quality-gate.json",
      ),
    ).toBe(true);
  });

  it("blocks when distilled feedback misses any targeted task file", async () => {
    const liveReport = buildLiveReport({
      distilledPassedTaskFiles: REQUIRED_TASK_FILES.filter(
        (taskFile) => taskFile !== "the_eccentric_api_call.json",
      ),
    });
    const smokeReport = buildSmokeReport(liveReport);

    const report = await runPhase54Gate(
      {
        liveReportPath: "/tmp/live.json",
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-54",
        runId: "run-phase54-gate-test",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-05-02T00:00:00.000Z",
        readTextFile: async (path) =>
          path === "/tmp/live.json"
            ? JSON.stringify(liveReport)
            : JSON.stringify(smokeReport),
        runCommand: async () => ({
          durationMs: 1,
          exitCode: 0,
          stderr: "",
          stdout: "ok",
        }),
        writeTextFile: async () => undefined,
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.acceptance.reason).toContain("did not meet the targeted bar");
    expect(report.evidence.liveMemoryReport.distilledPassedBlockingCases).toBe(11);
  });

  it("blocks when raw carryover does not beat the frozen baseline", async () => {
    const liveReport = buildLiveReport({
      rawPassedTaskFiles: [
        "conditioned_api_aversion.json",
        "conditioned_jargon_avoidance.json",
        "the_modified_recurrence_sequence.json",
      ],
    });
    const smokeReport = buildSmokeReport(liveReport);

    const report = await runPhase54Gate(
      {
        liveReportPath: "/tmp/live.json",
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-54",
        runId: "run-phase54-gate-test",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-05-02T00:00:00.000Z",
        readTextFile: async (path) =>
          path === "/tmp/live.json"
            ? JSON.stringify(liveReport)
            : JSON.stringify(smokeReport),
        runCommand: async () => ({
          durationMs: 1,
          exitCode: 0,
          stderr: "",
          stdout: "ok",
        }),
        writeTextFile: async () => undefined,
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.liveMemoryReport.rawPassedBlockingCases).toBe(3);
    expect(report.evidence.liveMemoryReport.structuredRawPasses).toBe(0);
  });

  it("uses the canonical phase-54 gate run id by default", async () => {
    const writes = new Map<string, string>();
    const liveReport = buildLiveReport();
    const smokeReport = buildSmokeReport(liveReport);

    await runPhase54Gate(
      {
        liveReportPath: "/tmp/live.json",
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-54",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-05-02T00:00:00.000Z",
        readTextFile: async (path) =>
          path === "/tmp/live.json"
            ? JSON.stringify(liveReport)
            : JSON.stringify(smokeReport),
        runCommand: async () => ({
          durationMs: 1,
          exitCode: 0,
          stderr: "",
          stdout: "ok",
        }),
        writeTextFile: async (path, content) => {
          writes.set(path, content);
        },
      },
    );

    expect(
      writes.has(
        `/tmp/goodmemory/reports/quality-gates/phase-54/${PHASE54_CANONICAL_GATE_RUN_ID}/phase-54-quality-gate.json`,
      ),
    ).toBe(true);
  });
});
