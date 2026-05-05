import { describe, expect, it } from "bun:test";
import {
  PHASE60_CANONICAL_GATE_RUN_ID,
  parsePhase60GateCliOptions,
  resolvePhase60GateOutputDir,
  runPhase60Gate,
} from "../../scripts/run-phase-60-gate";

function buildOverallSummary(input?: {
  contaminatedPositiveCreditCount?: number;
  controlledPrimingCases?: number;
}) {
  const controlledPrimingCases = input?.controlledPrimingCases ?? 1;

  return {
    benchmark: {
      blockingCases: 2,
      primingCases: controlledPrimingCases,
      totalCases: 2 + controlledPrimingCases,
    },
    claimBoundary: {
      publicClaim: false,
      releaseGate: false,
      scope: "internal research evidence only",
    },
    comparison: {
      bestGoodMemoryBlockingOnlyRate: 1,
      bestGoodMemoryOverallRate: null,
      goodmemoryImprovesBaselineOverall: true,
      profilesExceedingReferenceLine: [
        "goodmemory-distilled-feedback+controlled-priming",
      ],
      referenceLine: 0.66,
    },
    generatedAt: "2026-05-05T00:00:00.000Z",
    generatedBy: "tests",
    kind: "phase-60-implicitmembench-overall-summary",
    mode: "smoke",
    outputDir: "/tmp/out",
    phase: "phase-60",
    profiles: {
      "goodmemory-distilled-feedback+controlled-priming": {
        blockingScore: {
          passed: 2,
          rate: 1,
          total: 2,
        },
        full300OverallScore: {
          passedEquivalent: 2.8,
          rate: 0.9333333333333332,
          total: 3,
        },
        overallComparableToOfficial: false,
        primingContaminationCount: 0,
        primingExplicitLeakCount: 0,
        primingViolationCounts: {},
        primingViolationExamples: [],
        primingScore: {
          contaminatedPositiveCreditCount:
            input?.contaminatedPositiveCreditCount ?? 0,
          passedEquivalent: 0.8,
          rate: 0.8,
          total: controlledPrimingCases,
        },
        primingTaskViolationCount: 0,
      },
      "goodmemory-raw-experience": {
        blockingScore: {
          passed: 2,
          rate: 1,
          total: 2,
        },
        full300OverallScore: {
          passedEquivalent: 2.8,
          rate: 0.9333333333333332,
          total: 3,
        },
        overallComparableToOfficial: false,
        primingContaminationCount: 0,
        primingExplicitLeakCount: 0,
        primingViolationCounts: {},
        primingViolationExamples: [],
        primingScore: {
          contaminatedPositiveCreditCount: 0,
          passedEquivalent: 0.8,
          rate: 0.8,
          total: controlledPrimingCases,
        },
        primingTaskViolationCount: 0,
      },
    },
    protocol: {
      legacyPhase49SemanticsPreserved: true,
      requiredFields: [
        "blockingScore",
        "primingScore",
        "full300OverallScore",
        "overallComparableToOfficial",
        "primingContaminationCount",
        "primingTaskViolationCount",
        "primingExplicitLeakCount",
        "primingViolationCounts",
        "primingViolationExamples",
      ],
    },
    runDirectory: "/tmp/out/run",
    runId: "run-phase60",
  };
}

describe("run-phase-60 gate", () => {
  it("resolves output and parses flags", () => {
    expect(resolvePhase60GateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-60",
    );
    expect(
      parsePhase60GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-60-gate.ts",
        "--output-dir",
        "/tmp/out",
        "--run-id",
        PHASE60_CANONICAL_GATE_RUN_ID,
      ]),
    ).toEqual({
      outputDir: "/tmp/out",
      runId: PHASE60_CANONICAL_GATE_RUN_ID,
    });
  });

  it("accepts protocol summaries that include controlled priming and claim boundaries", async () => {
    const writes = new Map<string, string>();

    const report = await runPhase60Gate(
      {
        outputDir: "/tmp/gate",
        runId: "run-gate",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-05-05T00:00:00.000Z",
        readTextFile: async () => JSON.stringify(buildOverallSummary()),
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

    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.overallSummary.status).toBe("accepted");
    expect(report.evidence.overallSummary.ignoredArtifactPath).toContain(
      "reports/eval/fallback/phase-60",
    );
    expect([...writes.keys()][0]).toEndWith("phase-60-quality-gate.json");
  });

  it("rejects protocol summaries where contaminated priming raised the score", async () => {
    const report = await runPhase60Gate(
      {
        outputDir: "/tmp/gate",
        runId: "run-gate",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-05-05T00:00:00.000Z",
        readTextFile: async () =>
          JSON.stringify(
            buildOverallSummary({
              contaminatedPositiveCreditCount: 1,
            }),
          ),
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
    expect(report.acceptance.reason).toContain("contaminated priming");
  });
});
