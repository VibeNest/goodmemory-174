import { describe, expect, it } from "bun:test";
import {
  PHASE51_CANONICAL_GATE_RUN_ID,
  parsePhase51GateCliOptions,
  resolvePhase51CanonicalFallbackReportPath,
  resolvePhase51CanonicalLiveReportPath,
  resolvePhase51GateOutputDir,
  runPhase51Gate,
} from "../../scripts/run-phase-51-gate";

function buildLiveReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    benchmarkRoot: "/tmp/goodmemory/fixtures/implicitmembench-phase-51",
    generatedAt: "2026-04-30T00:00:00.000Z",
    generatedBy: "scripts/run-phase-51-live-memory.ts",
    kind: "goodmemory",
    manifestPath:
      "/tmp/goodmemory/fixtures/implicitmembench-phase-51/adapter-manifest.json",
    mode: "live",
    outputDir: "/tmp/goodmemory/reports/eval/live-memory/phase-51",
    profiles: {
      "goodmemory-raw-experience": {
        caseCountsByDataset: {
          classical_conditioning: 2,
          priming: 1,
          procedural_memory: 6,
        },
        caseCountsByScorer: {
          priming_pair_judge: 1,
          structured_first_action: 2,
          text_behavior_judge: 6,
        },
        cases: [
          {
            blocking: true,
            caseId: "a",
            datasetFamily: "procedural_memory",
            explicitRecallLeak: false,
            feedbackSignalApplied: false,
            judgeReason: "fail",
            passed: false,
            profile: "goodmemory-raw-experience",
            scorerFamily: "text_behavior_judge",
            sourceFile: "/tmp/a",
            taskFile: "the_modified_recurrence_sequence.json",
            taskName: "A",
          },
          {
            blocking: true,
            caseId: "b",
            datasetFamily: "procedural_memory",
            explicitRecallLeak: false,
            feedbackSignalApplied: false,
            judgeReason: "pass",
            passed: true,
            profile: "goodmemory-raw-experience",
            scorerFamily: "structured_first_action",
            sourceFile: "/tmp/b",
            taskFile: "reversed_parameter_protocol.json",
            taskName: "B",
          },
          {
            blocking: false,
            caseId: "p",
            datasetFamily: "priming",
            explicitRecallLeak: false,
            feedbackSignalApplied: false,
            judgeReason: "priming",
            passed: undefined,
            primingControlAnswer: "{}",
            primingExperimentalAnswer: "{}",
            primingInfluenceScore: 20,
            profile: "goodmemory-raw-experience",
            scorerFamily: "priming_pair_judge",
            sourceFile: "/tmp/p",
            taskFile: "volcanic_eruption.json",
            taskName: "P",
          },
          {
            blocking: true,
            caseId: "c",
            datasetFamily: "classical_conditioning",
            explicitRecallLeak: false,
            feedbackSignalApplied: false,
            judgeReason: "pass",
            passed: true,
            profile: "goodmemory-raw-experience",
            scorerFamily: "text_behavior_judge",
            sourceFile: "/tmp/c",
            taskFile: "conditioned_protocol_preference.json",
            taskName: "C",
          },
          {
            blocking: true,
            caseId: "d",
            datasetFamily: "classical_conditioning",
            explicitRecallLeak: true,
            feedbackSignalApplied: false,
            judgeReason: "pass",
            passed: true,
            profile: "goodmemory-raw-experience",
            scorerFamily: "text_behavior_judge",
            sourceFile: "/tmp/d",
            taskFile: "conditioned_directory_restriction.json",
            taskName: "D",
          },
          {
            blocking: true,
            caseId: "e",
            datasetFamily: "procedural_memory",
            explicitRecallLeak: false,
            feedbackSignalApplied: false,
            judgeReason: "fail",
            passed: false,
            profile: "goodmemory-raw-experience",
            scorerFamily: "text_behavior_judge",
            sourceFile: "/tmp/e",
            taskFile: "the_omega_operation.json",
            taskName: "E",
          },
          {
            blocking: true,
            caseId: "f",
            datasetFamily: "procedural_memory",
            explicitRecallLeak: false,
            feedbackSignalApplied: false,
            judgeReason: "fail",
            passed: false,
            profile: "goodmemory-raw-experience",
            scorerFamily: "text_behavior_judge",
            sourceFile: "/tmp/f",
            taskFile: "the_scribe_s_signature.json",
            taskName: "F",
          },
          {
            blocking: true,
            caseId: "g",
            datasetFamily: "procedural_memory",
            explicitRecallLeak: false,
            feedbackSignalApplied: false,
            judgeReason: "fail",
            passed: false,
            profile: "goodmemory-raw-experience",
            scorerFamily: "text_behavior_judge",
            sourceFile: "/tmp/g",
            taskFile: "corporate_etiquette_mandate.json",
            taskName: "G",
          },
          {
            blocking: true,
            caseId: "h",
            datasetFamily: "procedural_memory",
            explicitRecallLeak: false,
            feedbackSignalApplied: false,
            judgeReason: "fail",
            passed: false,
            profile: "goodmemory-raw-experience",
            scorerFamily: "structured_first_action",
            sourceFile: "/tmp/h",
            taskFile: "logiql_query_language.json",
            taskName: "H",
          }
        ],
        executionFailures: 0,
        explicitRecallLeakCount: 1,
        passedBlockingCases: 3,
        primingAverageScore: 20,
        totalBlockingCases: 8,
        totalCases: 9,
      },
      "goodmemory-distilled-feedback": {
        caseCountsByDataset: {
          classical_conditioning: 2,
          priming: 0,
          procedural_memory: 6,
        },
        caseCountsByScorer: {
          priming_pair_judge: 0,
          structured_first_action: 2,
          text_behavior_judge: 6,
        },
        cases: [
          {
            blocking: true,
            caseId: "a",
            datasetFamily: "procedural_memory",
            explicitRecallLeak: false,
            feedbackSignalApplied: true,
            judgeReason: "pass",
            passed: true,
            profile: "goodmemory-distilled-feedback",
            scorerFamily: "text_behavior_judge",
            sourceFile: "/tmp/a",
            taskFile: "the_modified_recurrence_sequence.json",
            taskName: "A",
          },
          {
            blocking: true,
            caseId: "b",
            datasetFamily: "procedural_memory",
            explicitRecallLeak: false,
            feedbackSignalApplied: true,
            judgeReason: "pass",
            passed: true,
            profile: "goodmemory-distilled-feedback",
            scorerFamily: "structured_first_action",
            sourceFile: "/tmp/b",
            taskFile: "reversed_parameter_protocol.json",
            taskName: "B",
          },
          {
            blocking: true,
            caseId: "c",
            datasetFamily: "classical_conditioning",
            explicitRecallLeak: false,
            feedbackSignalApplied: true,
            judgeReason: "pass",
            passed: true,
            profile: "goodmemory-distilled-feedback",
            scorerFamily: "text_behavior_judge",
            sourceFile: "/tmp/c",
            taskFile: "conditioned_protocol_preference.json",
            taskName: "C",
          },
          {
            blocking: true,
            caseId: "d",
            datasetFamily: "classical_conditioning",
            explicitRecallLeak: false,
            feedbackSignalApplied: true,
            judgeReason: "pass",
            passed: true,
            profile: "goodmemory-distilled-feedback",
            scorerFamily: "text_behavior_judge",
            sourceFile: "/tmp/d",
            taskFile: "conditioned_directory_restriction.json",
            taskName: "D",
          },
          {
            blocking: true,
            caseId: "e",
            datasetFamily: "procedural_memory",
            explicitRecallLeak: false,
            feedbackSignalApplied: true,
            judgeReason: "pass",
            passed: true,
            profile: "goodmemory-distilled-feedback",
            scorerFamily: "text_behavior_judge",
            sourceFile: "/tmp/e",
            taskFile: "the_omega_operation.json",
            taskName: "E",
          },
          {
            blocking: true,
            caseId: "f",
            datasetFamily: "procedural_memory",
            explicitRecallLeak: false,
            feedbackSignalApplied: true,
            judgeReason: "pass",
            passed: true,
            profile: "goodmemory-distilled-feedback",
            scorerFamily: "text_behavior_judge",
            sourceFile: "/tmp/f",
            taskFile: "the_scribe_s_signature.json",
            taskName: "F",
          },
          {
            blocking: true,
            caseId: "g",
            datasetFamily: "procedural_memory",
            explicitRecallLeak: false,
            feedbackSignalApplied: true,
            judgeReason: "pass",
            passed: true,
            profile: "goodmemory-distilled-feedback",
            scorerFamily: "text_behavior_judge",
            sourceFile: "/tmp/g",
            taskFile: "corporate_etiquette_mandate.json",
            taskName: "G",
          },
          {
            blocking: true,
            caseId: "h",
            datasetFamily: "procedural_memory",
            explicitRecallLeak: false,
            feedbackSignalApplied: true,
            judgeReason: "pass",
            passed: true,
            profile: "goodmemory-distilled-feedback",
            scorerFamily: "structured_first_action",
            sourceFile: "/tmp/h",
            taskFile: "logiql_query_language.json",
            taskName: "H",
          }
        ],
        executionFailures: 0,
        explicitRecallLeakCount: 0,
        passedBlockingCases: 8,
        primingAverageScore: null,
        totalBlockingCases: 8,
        totalCases: 8,
      }
    },
    runDirectory: "/tmp/goodmemory/reports/eval/live-memory/phase-51/run-phase51-live-current",
    runId: "run-phase51-live-current",
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: {
      caseCountsByDataset: {
        classical_conditioning: 4,
        priming: 1,
        procedural_memory: 12,
      },
      caseCountsByScorer: {
        priming_pair_judge: 1,
        structured_first_action: 4,
        text_behavior_judge: 12,
      },
      executionFailures: 0,
      explicitRecallLeakCount: 1,
      passedBlockingCases: 11,
      primingAverageScore: 20,
      totalBlockingCases: 16,
      totalCases: 17,
    },
    ...overrides,
  };
}

describe("run-phase-51 gate", () => {
  it("resolves phase-51 gate output and canonical live report paths", () => {
    expect(resolvePhase51GateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-51",
    );
    expect(resolvePhase51CanonicalFallbackReportPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-51/run-phase51-fallback-current/report.json",
    );
    expect(resolvePhase51CanonicalLiveReportPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-51/run-phase51-live-current/report.json",
    );
  });

  it("parses phase-51 gate cli flags", () => {
    expect(
      parsePhase51GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-51-gate.ts",
        "--live-report-path",
        "/tmp/live.json",
        "--output-dir",
        "/tmp/out",
        "--run-id",
        "run-phase51-gate",
      ]),
    ).toEqual({
      liveReportPath: "/tmp/live.json",
      outputDir: "/tmp/out",
      runId: "run-phase51-gate",
    });
  });

  it("accepts when the live report improves distilled over raw and covers every targeted task file", async () => {
    const writes = new Map<string, string>();
    const commands: string[] = [];

    const report = await runPhase51Gate(
      {
        liveReportPath: "/tmp/live.json",
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-51",
        runId: "run-phase51-gate-test",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-04-30T00:00:00.000Z",
        readTextFile: async (path) =>
          path === "/tmp/live.json"
            ? JSON.stringify(buildLiveReport())
            : JSON.stringify({
                benchmarkRoot: "/tmp/goodmemory/fixtures/implicitmembench-phase-51",
                generatedAt: "2026-04-30T00:00:00.000Z",
                generatedBy: "scripts/run-phase-51-eval.ts",
                kind: "goodmemory",
                manifestPath:
                  "/tmp/goodmemory/fixtures/implicitmembench-phase-51/adapter-manifest.json",
                mode: "smoke",
                outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-51",
                profiles: buildLiveReport().profiles,
                runDirectory:
                  "/tmp/goodmemory/reports/eval/fallback/phase-51/run-phase51-fallback-current",
                runId: "run-phase51-fallback-current",
                source: {
                  benchmark: "ImplicitMemBench",
                  license: "CC BY 4.0",
                  url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
                },
                summary: buildLiveReport().summary,
              }),
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
      "reports/eval/fallback/phase-51/run-phase51-fallback-current/report.json",
    );
    expect(report.evidence.liveMemoryReport.requiredTaskFilesPresent).toHaveLength(9);
    expect(report.evidence.liveMemoryReport.structuredDistilledPasses).toBe(2);
    expect(commands).toContain(
      "bun run eval:phase-51 -- --run-id run-phase51-fallback-current",
    );
    expect(
      writes.has(
        "/tmp/goodmemory/reports/quality-gates/phase-51/run-phase51-gate-test/phase-51-quality-gate.json",
      ),
    ).toBe(true);
  });

  it("blocks when the canonical live report does not improve over raw", async () => {
    const broken = buildLiveReport();
    (
      broken.profiles["goodmemory-distilled-feedback"] as {
        passedBlockingCases: number;
      }
    ).passedBlockingCases = 3;

    const report = await runPhase51Gate(
      {
        liveReportPath: "/tmp/live.json",
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-51",
        runId: "run-phase51-gate-test",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-04-30T00:00:00.000Z",
        readTextFile: async (path) =>
          path === "/tmp/live.json"
            ? JSON.stringify(broken)
            : JSON.stringify({
                benchmarkRoot: "/tmp/goodmemory/fixtures/implicitmembench-phase-51",
                generatedAt: "2026-04-30T00:00:00.000Z",
                generatedBy: "scripts/run-phase-51-eval.ts",
                kind: "goodmemory",
                manifestPath:
                  "/tmp/goodmemory/fixtures/implicitmembench-phase-51/adapter-manifest.json",
                mode: "smoke",
                outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-51",
                profiles: broken.profiles,
                runDirectory:
                  "/tmp/goodmemory/reports/eval/fallback/phase-51/run-phase51-fallback-current",
                runId: "run-phase51-fallback-current",
                source: {
                  benchmark: "ImplicitMemBench",
                  license: "CC BY 4.0",
                  url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
                },
                summary: broken.summary,
              }),
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
    expect(report.evidence.deterministicReport.status).toBe("accepted");
  });

  it("uses the canonical phase-51 gate run id by default", async () => {
    const writes = new Map<string, string>();

    await runPhase51Gate(
      {
        liveReportPath: "/tmp/live.json",
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-51",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-04-30T00:00:00.000Z",
        readTextFile: async (path) =>
          path === "/tmp/live.json"
            ? JSON.stringify(buildLiveReport())
            : JSON.stringify({
                benchmarkRoot: "/tmp/goodmemory/fixtures/implicitmembench-phase-51",
                generatedAt: "2026-04-30T00:00:00.000Z",
                generatedBy: "scripts/run-phase-51-eval.ts",
                kind: "goodmemory",
                manifestPath:
                  "/tmp/goodmemory/fixtures/implicitmembench-phase-51/adapter-manifest.json",
                mode: "smoke",
                outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-51",
                profiles: buildLiveReport().profiles,
                runDirectory:
                  "/tmp/goodmemory/reports/eval/fallback/phase-51/run-phase51-fallback-current",
                runId: "run-phase51-fallback-current",
                source: {
                  benchmark: "ImplicitMemBench",
                  license: "CC BY 4.0",
                  url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
                },
                summary: buildLiveReport().summary,
              }),
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
        `/tmp/goodmemory/reports/quality-gates/phase-51/${PHASE51_CANONICAL_GATE_RUN_ID}/phase-51-quality-gate.json`,
      ),
    ).toBe(true);
  });
});
