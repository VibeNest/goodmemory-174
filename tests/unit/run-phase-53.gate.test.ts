import { describe, expect, it } from "bun:test";
import {
  PHASE53_CANONICAL_GATE_RUN_ID,
  parsePhase53GateCliOptions,
  resolvePhase53CanonicalFallbackReportPath,
  resolvePhase53CanonicalLiveReportPath,
  resolvePhase53GateOutputDir,
  runPhase53Gate,
} from "../../scripts/run-phase-53-gate";

const REQUIRED_TASK_FILES = [
  "conditioned_api_aversion.json",
  "conditioned_directory_restriction.json",
  "conditioned_distrust_escalation.json",
  "conditioned_filetype_replacement.json",
  "conditioned_jargon_avoidance.json",
  "conditioned_protocol_preference.json",
  "context_dependent_api_behavior.json",
  "corporate_etiquette_mandate.json",
  "logiql_query_language.json",
  "reversed_parameter_protocol.json",
  "the_modified_recurrence_sequence.json",
  "the_omega_operation.json",
  "the_scribe_s_signature.json",
  "side_effect_backup_requirement.json",
  "tool_use_with_side_effects.json",
] as const;

function buildCases(input: {
  passedTaskFiles: readonly string[];
  profile: "goodmemory-distilled-feedback" | "goodmemory-raw-experience";
}): Array<Record<string, unknown>> {
  return REQUIRED_TASK_FILES.map((taskFile) => ({
    blocking: true,
    caseId: `${input.profile}:${taskFile}`,
    datasetFamily: taskFile.startsWith("conditioned_") ||
      taskFile === "context_dependent_api_behavior.json" ||
      taskFile === "side_effect_backup_requirement.json" ||
      taskFile === "tool_use_with_side_effects.json"
      ? "classical_conditioning"
      : "procedural_memory",
    explicitRecallLeak: false,
    feedbackSignalApplied: input.profile === "goodmemory-distilled-feedback",
    judgeReason: input.passedTaskFiles.includes(taskFile) ? "pass" : "fail",
    passed: input.passedTaskFiles.includes(taskFile),
    profile: input.profile,
    scorerFamily:
      taskFile === "logiql_query_language.json" ||
      taskFile === "reversed_parameter_protocol.json"
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
      "conditioned_protocol_preference.json",
      "conditioned_directory_restriction.json",
      "the_modified_recurrence_sequence.json",
      "the_omega_operation.json",
      "logiql_query_language.json",
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
    benchmarkRoot: "/tmp/goodmemory/fixtures/implicitmembench-phase-53",
    generatedAt: "2026-05-02T00:00:00.000Z",
    generatedBy: "scripts/run-phase-53-live-memory.ts",
    kind: "goodmemory",
    manifestPath:
      "/tmp/goodmemory/fixtures/implicitmembench-phase-53/adapter-manifest.json",
    mode: "live",
    outputDir: "/tmp/goodmemory/reports/eval/live-memory/phase-53",
    profiles: {
      "goodmemory-raw-experience": {
        caseCountsByDataset: {
          classical_conditioning: 9,
          priming: 0,
          procedural_memory: 6,
        },
        caseCountsByScorer: {
          priming_pair_judge: 0,
          structured_first_action: 2,
          text_behavior_judge: 13,
        },
        cases: rawCases,
        executionFailures: 0,
        explicitRecallLeakCount: input?.rawLeakCount ?? 1,
        passedBlockingCases: rawPassedTaskFiles.length,
        primingAverageScore: null,
        totalBlockingCases: 15,
        totalCases: 15,
      },
      "goodmemory-distilled-feedback": {
        caseCountsByDataset: {
          classical_conditioning: 9,
          priming: 0,
          procedural_memory: 6,
        },
        caseCountsByScorer: {
          priming_pair_judge: 0,
          structured_first_action: 2,
          text_behavior_judge: 13,
        },
        cases: distilledCases,
        executionFailures: 0,
        explicitRecallLeakCount: input?.distilledLeakCount ?? 0,
        passedBlockingCases: distilledPassedTaskFiles.length,
        primingAverageScore: null,
        totalBlockingCases: 15,
        totalCases: 15,
      },
    },
    runDirectory: "/tmp/goodmemory/reports/eval/live-memory/phase-53/run-phase53-live-current",
    runId: "run-phase53-live-current",
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: {
      caseCountsByDataset: {
        classical_conditioning: 18,
        priming: 0,
        procedural_memory: 12,
      },
      caseCountsByScorer: {
        priming_pair_judge: 0,
        structured_first_action: 4,
        text_behavior_judge: 26,
      },
      executionFailures: 0,
      explicitRecallLeakCount:
        (input?.rawLeakCount ?? 1) + (input?.distilledLeakCount ?? 0),
      passedBlockingCases:
        rawPassedTaskFiles.length + distilledPassedTaskFiles.length,
      primingAverageScore: null,
      totalBlockingCases: 30,
      totalCases: 30,
    },
  };
}

function buildSmokeReport(liveReport: Record<string, unknown>): Record<string, unknown> {
  return {
    ...liveReport,
    generatedBy: "scripts/run-phase-53-eval.ts",
    mode: "smoke",
    outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-53",
    runDirectory:
      "/tmp/goodmemory/reports/eval/fallback/phase-53/run-phase53-fallback-current",
    runId: "run-phase53-fallback-current",
  };
}

describe("run-phase-53 gate", () => {
  it("resolves phase-53 gate output and canonical report paths", () => {
    expect(resolvePhase53GateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-53",
    );
    expect(resolvePhase53CanonicalFallbackReportPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-53/run-phase53-fallback-current/report.json",
    );
    expect(resolvePhase53CanonicalLiveReportPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-53/run-phase53-live-current/report.json",
    );
  });

  it("parses phase-53 gate cli flags", () => {
    expect(
      parsePhase53GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-53-gate.ts",
        "--live-report-path",
        "/tmp/live.json",
        "--output-dir",
        "/tmp/out",
        "--run-id",
        "run-phase53-gate",
      ]),
    ).toEqual({
      liveReportPath: "/tmp/live.json",
      outputDir: "/tmp/out",
      runId: "run-phase53-gate",
    });
  });

  it("accepts when the live report passes every targeted task file", async () => {
    const writes = new Map<string, string>();
    const commands: string[] = [];
    const liveReport = buildLiveReport();
    const smokeReport = buildSmokeReport(liveReport);

    const report = await runPhase53Gate(
      {
        liveReportPath: "/tmp/live.json",
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-53",
        runId: "run-phase53-gate-test",
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
      "reports/eval/fallback/phase-53/run-phase53-fallback-current/report.json",
    );
    expect(report.evidence.liveMemoryReport.requiredTaskFilesPresent).toHaveLength(15);
    expect(report.evidence.liveMemoryReport.structuredDistilledPasses).toBe(2);
    expect(report.evidence.liveMemoryReport.explicitRecallLeakDelta).toBe(-1);
    expect(commands).toContain(
      "bun run eval:phase-53 -- --run-id run-phase53-fallback-current",
    );
    expect(commands).toContain(
      "bun run eval:phase-53-live-memory -- --run-id run-phase53-live-current",
    );
    expect(
      writes.has(
        "/tmp/goodmemory/reports/quality-gates/phase-53/run-phase53-gate-test/phase-53-quality-gate.json",
      ),
    ).toBe(true);
  });

  it("blocks when distilled feedback misses any targeted task file", async () => {
    const liveReport = buildLiveReport({
      distilledPassedTaskFiles: REQUIRED_TASK_FILES.filter(
        (taskFile) => taskFile !== "tool_use_with_side_effects.json",
      ),
    });
    const smokeReport = buildSmokeReport(liveReport);

    const report = await runPhase53Gate(
      {
        liveReportPath: "/tmp/live.json",
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-53",
        runId: "run-phase53-gate-test",
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
    expect(report.evidence.liveMemoryReport.distilledPassedBlockingCases).toBe(14);
  });

  it("uses the canonical phase-53 gate run id by default", async () => {
    const writes = new Map<string, string>();
    const liveReport = buildLiveReport();
    const smokeReport = buildSmokeReport(liveReport);

    await runPhase53Gate(
      {
        liveReportPath: "/tmp/live.json",
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-53",
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
        `/tmp/goodmemory/reports/quality-gates/phase-53/${PHASE53_CANONICAL_GATE_RUN_ID}/phase-53-quality-gate.json`,
      ),
    ).toBe(true);
  });
});
