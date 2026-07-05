import { describe, expect, it } from "bun:test";
import {
  buildPhase64MemoryAgentBenchReadiness,
  parsePhase64ReadinessAnalysisCliOptions,
  runPhase64ReadinessAnalysis,
} from "../../scripts/analyze-phase-64-readiness";
import type {
  Phase63RecallDiagnosticBucketSummary,
  Phase63RecallDiagnosticWorkbenchAnalysis,
} from "../../scripts/analyze-phase-63-recall-diagnostic";

function bucket(input: {
  averageEvidenceChatRecall: number | null;
  category: string;
  evidenceCases?: number;
  incompleteRecallCases: number;
  totalHitEvidenceIds: number;
  totalMissingEvidenceIds: number;
  totalNoiseChatIds: number;
  wrongRecallCases: number;
  zeroRecallCases: number;
}): Phase63RecallDiagnosticBucketSummary {
  const evidenceCases = input.evidenceCases ?? 10;
  return {
    averageEvidenceChatRecall: input.averageEvidenceChatRecall,
    averageNoiseChatIds: 0,
    averageRetrievedChatIds: 0,
    category: input.category,
    evidenceCases,
    incompleteRecallCases: input.incompleteRecallCases,
    totalCases: evidenceCases,
    totalExpectedEvidenceIds:
      input.totalHitEvidenceIds + input.totalMissingEvidenceIds,
    totalHitEvidenceIds: input.totalHitEvidenceIds,
    totalMissingEvidenceIds: input.totalMissingEvidenceIds,
    totalNoiseChatIds: input.totalNoiseChatIds,
    totalRetrievedChatIds:
      input.totalHitEvidenceIds + input.totalNoiseChatIds,
    wrongRecallCases: input.wrongRecallCases,
    zeroRecallCases: input.zeroRecallCases,
  };
}

function analysis(): Phase63RecallDiagnosticWorkbenchAnalysis {
  const bucketSummaries = [
    bucket({
      averageEvidenceChatRecall: 0.25,
      category: "knowledge_update",
      incompleteRecallCases: 8,
      totalHitEvidenceIds: 4,
      totalMissingEvidenceIds: 12,
      totalNoiseChatIds: 40,
      wrongRecallCases: 8,
      zeroRecallCases: 4,
    }),
    bucket({
      averageEvidenceChatRecall: 0.5,
      category: "contradiction_resolution",
      incompleteRecallCases: 5,
      totalHitEvidenceIds: 8,
      totalMissingEvidenceIds: 8,
      totalNoiseChatIds: 20,
      wrongRecallCases: 5,
      zeroRecallCases: 2,
    }),
    bucket({
      averageEvidenceChatRecall: 0.7,
      category: "preference_following",
      incompleteRecallCases: 3,
      totalHitEvidenceIds: 11,
      totalMissingEvidenceIds: 5,
      totalNoiseChatIds: 55,
      wrongRecallCases: 9,
      zeroRecallCases: 1,
    }),
    bucket({
      averageEvidenceChatRecall: 0.6,
      category: "event_ordering",
      incompleteRecallCases: 4,
      totalHitEvidenceIds: 10,
      totalMissingEvidenceIds: 6,
      totalNoiseChatIds: 80,
      wrongRecallCases: 10,
      zeroRecallCases: 2,
    }),
  ];

  return {
    bucketSummaries,
    generatedAt: "2026-05-24T00:00:00.000Z",
    generatedBy: "scripts/analyze-phase-63-recall-diagnostic.ts",
    globalSummary: {
      evidenceCases: 40,
      missedRecallCases: 20,
      totalCases: 40,
      totalExpectedEvidenceIds: 64,
      totalHitEvidenceIds: 33,
      totalMissingEvidenceIds: 31,
      totalNoiseChatIds: 195,
      totalRetrievedChatIds: 228,
      wrongRecallCases: 32,
      zeroRecallCases: 9,
    },
    incompleteRecallCases: [],
    phase: "phase-63",
    profile: "goodmemory-rules-only",
    profileSummary: {
      accuracy: 0,
      abstentionCorrectCases: 0,
      correctCases: 0,
      evidenceCaseCount: 40,
      evidenceChatRecall: 0.45,
      missedRecallCases: 20,
      totalCases: 40,
      wrongAnswerCases: 40,
      wrongRecallCases: 32,
    },
    reportPath: "/tmp/phase63/recall-diagnostic.json",
    runId: "phase63-current",
    zeroRecallCases: [],
  };
}

describe("analyze phase-64 readiness", () => {
  it("parses readiness cli flags", () => {
    expect(
      parsePhase64ReadinessAnalysisCliOptions([
        "bun",
        "run",
        "scripts/analyze-phase-64-readiness.ts",
        "--phase63-analysis-path",
        "/tmp/phase63/recall-diagnostic-analysis.json",
        "--output-dir",
        "/tmp/phase64",
        "--run-id",
        "prep",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase64",
      outputPath: undefined,
      phase63AnalysisPath: "/tmp/phase63/recall-diagnostic-analysis.json",
      runId: "prep",
    });
  });

  it("rejects duplicate scalar cli selectors before reading Phase 63 analysis", () => {
    for (const flagName of [
      "--output-dir",
      "--output-path",
      "--phase63-analysis-path",
      "--run-id",
    ]) {
      expect(() =>
        parsePhase64ReadinessAnalysisCliOptions([
          "bun",
          "run",
          "scripts/analyze-phase-64-readiness.ts",
          flagName,
          "first",
          flagName,
          "second",
        ]),
      ).toThrow(`${flagName} cannot be specified more than once.`);
    }
  });

  it("rejects run ids that escape the readiness output directory", async () => {
    expect(() =>
      parsePhase64ReadinessAnalysisCliOptions([
        "bun",
        "run",
        "scripts/analyze-phase-64-readiness.ts",
        "--phase63-analysis-path",
        "/tmp/phase63/recall-diagnostic-analysis.json",
        "--run-id",
        "../outside-mab",
      ]),
    ).toThrow("--run-id must be a single path segment.");

    await expect(
      runPhase64ReadinessAnalysis(
        {
          outputDir: "/tmp/phase64",
          phase63AnalysisPath: "/tmp/phase63/recall-diagnostic-analysis.json",
          runId: "../outside-mab",
        },
        {
          readFile: async () => {
            throw new Error("should not read Phase 63 analysis");
          },
        },
      ),
    ).rejects.toThrow("--run-id must be a single path segment.");
  });

  it("maps Phase 63 update and noise risks into MemoryAgentBench prep", () => {
    const report = buildPhase64MemoryAgentBenchReadiness({
      analysis: analysis(),
      generatedAt: "2026-05-24T00:05:00.000Z",
      runId: "prep",
    });

    expect(report.status).toBe("phase63_risk_prep_required");
    expect(report.benchmark.competencies).toEqual([
      "Accurate Retrieval",
      "Test-Time Learning",
      "Long-Range Understanding",
      "Conflict Resolution",
    ]);

    const conflictPriority = report.priorities.find(
      (priority) => priority.area === "conflict_update_resolution",
    );
    expect(conflictPriority).toMatchObject({
      blocking: true,
      phase63Signal: {
        categories: ["knowledge_update", "contradiction_resolution"],
        totalMissingEvidenceIds: 20,
        zeroRecallCases: 6,
      },
    });
    expect(conflictPriority?.recommendedPreparation[0]).toContain(
      "old-vs-new facts",
    );

    const noisePriority = report.priorities.find(
      (priority) => priority.area === "noise_budgeting",
    );
    expect(noisePriority?.phase63Signal.categories).toEqual([
      "event_ordering",
      "preference_following",
      "knowledge_update",
      "contradiction_resolution",
    ]);
    expect(noisePriority?.blocking).toBe(true);
  });

  it("writes a readiness report beside the requested output directory", async () => {
    const writes = new Map<string, string>();
    const createdDirs: string[] = [];

    const result = await runPhase64ReadinessAnalysis(
      {
        outputDir: "/tmp/phase64",
        phase63AnalysisPath: "/tmp/phase63/recall-diagnostic-analysis.json",
        runId: "prep",
      },
      {
        mkdir: async (path) => {
          createdDirs.push(path.toString());
          return undefined;
        },
        now: () => new Date("2026-05-24T00:10:00.000Z"),
        readFile: async () => JSON.stringify(analysis()),
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(result.outputPath).toBe(
      "/tmp/phase64/prep/phase-64-readiness.json",
    );
    expect(createdDirs).toEqual(["/tmp/phase64/prep"]);
    expect(writes.has(result.outputPath)).toBe(true);
    expect(JSON.parse(writes.get(result.outputPath) ?? "{}")).toMatchObject({
      phase: "phase-64",
      runId: "prep",
      sourcePhase63Analysis: {
        runId: "phase63-current",
      },
    });
  });

  it("rejects output paths that overwrite the Phase 63 analysis before reading it", async () => {
    await expect(
      runPhase64ReadinessAnalysis(
        {
          outputPath: "/tmp/phase63/recall-diagnostic-analysis.json",
          phase63AnalysisPath:
            "/tmp/phase63/../phase63/recall-diagnostic-analysis.json",
          runId: "prep",
        },
        {
          readFile: async () => {
            throw new Error("should not read Phase 63 analysis");
          },
        },
      ),
    ).rejects.toThrow(
      "--output-path and --phase63-analysis-path must refer to different paths",
    );
  });
});
