import { describe, expect, it } from "bun:test";
import type {
  ImplicitMemBenchCaseResult,
  ImplicitMemBenchResearchReport,
  PrimingImplicitMemBenchCase,
} from "../../src/eval/implicitmembench-research";
import {
  analyzePhase60PrimingResult,
  buildPhase60OverallSummary,
} from "../../src/eval/phase60";

const source = {
  benchmark: "ImplicitMemBench",
  license: "CC BY 4.0",
  url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
} as const;

function buildPrimingCase(): PrimingImplicitMemBenchCase {
  return {
    caseId: "priming/volcanic.json#001",
    datasetFamily: "priming",
    fixture: {
      scorer: "priming_pair_judge",
      themeKeywords: ["ash", "basalt", "pressure"],
    },
    instance: {
      control_instance: {
        group: "control",
        interference_phase: [
          {
            content: "Use neutral terms.",
            role: "user",
          },
        ],
        priming_phase: [
          {
            content: "Classification systems keep names orderly.",
            role: "assistant",
          },
        ],
        test_probe: {
          prompt: "Return strict JSON with codenames. Do NOT reuse nouns from earlier messages. No markdown, no commentary.",
        },
      },
      experimental_instance: {
        group: "experimental",
        interference_phase: [
          {
            content: "Use neutral terms.",
            role: "user",
          },
        ],
        priming_phase: [
          {
            content: "Ash drifts over basalt while pressure gathers underground.",
            role: "assistant",
          },
        ],
        test_probe: {
          prompt: "Return strict JSON with codenames. Do NOT reuse nouns from earlier messages. No markdown, no commentary.",
        },
      },
      pair_id: "volcanic-001",
      selected_control_theme: "catalog",
      selected_probe_id: "creative_naming",
      selected_source_theme: "Volcanic Eruption",
      task_id: "001",
    },
    scorerFamily: "priming_pair_judge",
    sourceFile: "/tmp/volcanic.json",
    taskFile: "volcanic.json",
    taskName: "Volcanic Eruption / creative_naming",
  };
}

function buildPrimingResult(input?: {
  explicitRecallLeak?: boolean;
  experimentalAnswer?: string;
  score?: number;
}): ImplicitMemBenchCaseResult {
  return {
    blocking: false,
    caseId: "priming/volcanic.json#001",
    datasetFamily: "priming",
    explicitRecallLeak: input?.explicitRecallLeak ?? false,
    feedbackSignalApplied: false,
    judgeReason: "test",
    primingControlAnswer:
      "{\"candidates\":[{\"codename\":\"Ledger\",\"rationale\":\"It suggests orderly storage without thematic residue.\"}]}",
    primingExperimentalAnswer:
      input?.experimentalAnswer ??
      "{\"candidates\":[{\"codename\":\"Kilnveil\",\"rationale\":\"It suggests contained force transforming material into a smaller durable form.\"}]}",
    primingInfluenceScore: input?.score ?? 80,
    profile: "goodmemory-raw-experience",
    scorerFamily: "priming_pair_judge",
    sourceFile: "/tmp/volcanic.json",
    taskFile: "volcanic.json",
    taskName: "Volcanic Eruption / creative_naming",
  };
}

function buildReport(input: {
  kind: "baseline" | "goodmemory";
  primingResult?: ImplicitMemBenchCaseResult;
}): ImplicitMemBenchResearchReport {
  const blockingCase = {
    answer: "safe",
    blocking: true,
    caseId: `${input.kind}/blocking#001`,
    datasetFamily: "procedural_memory",
    explicitRecallLeak: false,
    feedbackSignalApplied: input.kind === "goodmemory",
    judgeReason: "passed",
    passed: true,
    profile:
      input.kind === "baseline"
        ? "baseline-upstream-chat"
        : "goodmemory-distilled-feedback",
    scorerFamily: "text_behavior_judge",
    sourceFile: "/tmp/blocking.json",
    taskFile: "blocking.json",
    taskName: "Blocking",
  } satisfies ImplicitMemBenchCaseResult;
  const primingResult = input.primingResult ?? buildPrimingResult();
  const profiles =
    input.kind === "baseline"
      ? {
          "baseline-upstream-chat": {
            caseCountsByDataset: {
              classical_conditioning: 0,
              priming: 1,
              procedural_memory: 1,
            },
            caseCountsByScorer: {
              priming_pair_judge: 1,
              structured_first_action: 0,
              text_behavior_judge: 1,
            },
            cases: [
              {
                ...blockingCase,
                profile: "baseline-upstream-chat",
              },
              {
                ...primingResult,
                profile: "baseline-upstream-chat",
              },
            ],
            executionFailures: 0,
            explicitRecallLeakCount: 0,
            passedBlockingCases: 1,
            primingAverageScore: 20,
            totalBlockingCases: 1,
            totalCases: 2,
          },
        }
      : {
          "goodmemory-distilled-feedback": {
            caseCountsByDataset: {
              classical_conditioning: 0,
              priming: 0,
              procedural_memory: 1,
            },
            caseCountsByScorer: {
              priming_pair_judge: 0,
              structured_first_action: 0,
              text_behavior_judge: 1,
            },
            cases: [blockingCase],
            distilledCompiledPolicyCount: 0,
            distilledContextEmptyCount: 0,
            distilledContextExamples: [],
            distilledContextPassRate: 1,
            distilledFallbackPolicyCount: 1,
            executionFailures: 0,
            explicitRecallLeakCount: 0,
            passedBlockingCases: 1,
            primingAverageScore: null,
            totalBlockingCases: 1,
            totalCases: 1,
          },
          "goodmemory-raw-experience": {
            caseCountsByDataset: {
              classical_conditioning: 0,
              priming: 1,
              procedural_memory: 1,
            },
            caseCountsByScorer: {
              priming_pair_judge: 1,
              structured_first_action: 0,
              text_behavior_judge: 1,
            },
            cases: [
              {
                ...blockingCase,
                profile: "goodmemory-raw-experience",
              },
              primingResult,
            ],
            executionFailures: 0,
            explicitRecallLeakCount: primingResult.explicitRecallLeak ? 1 : 0,
            passedBlockingCases: 1,
            primingAverageScore: primingResult.primingInfluenceScore ?? null,
            totalBlockingCases: 1,
            totalCases: 2,
          },
        };

  return {
    benchmarkRoot: "/tmp/bench",
    generatedAt: "2026-05-05T00:00:00.000Z",
    generatedBy: "tests",
    kind: input.kind,
    manifestPath: "/tmp/bench/adapter-manifest.json",
    mode: "smoke",
    outputDir: "/tmp/out",
    profiles: profiles as ImplicitMemBenchResearchReport["profiles"],
    runDirectory: "/tmp/out/run",
    runId: "run",
    source,
    summary: {
      caseCountsByDataset: {
        classical_conditioning: 0,
        priming: input.kind === "baseline" ? 1 : 1,
        procedural_memory: input.kind === "baseline" ? 1 : 2,
      },
      caseCountsByScorer: {
        priming_pair_judge: input.kind === "baseline" ? 1 : 1,
        structured_first_action: 0,
        text_behavior_judge: input.kind === "baseline" ? 1 : 2,
      },
      executionFailures: 0,
      explicitRecallLeakCount: 0,
      passedBlockingCases: input.kind === "baseline" ? 1 : 2,
      primingAverageScore: input.kind === "baseline" ? 20 : 80,
      totalBlockingCases: input.kind === "baseline" ? 1 : 2,
      totalCases: input.kind === "baseline" ? 2 : 3,
    },
  };
}

describe("phase60 overall protocol", () => {
  it("excludes contaminated priming influence from positive credit", () => {
    const caseDefinition = buildPrimingCase();
    const contaminated = buildPrimingResult({
      explicitRecallLeak: true,
      experimentalAnswer:
        "From memory, Basalt Archive uses ash and pressure in the codename.",
      score: 100,
    });

    const audit = analyzePhase60PrimingResult({
      caseDefinition,
      result: contaminated,
    });

    expect(audit.contaminated).toBe(true);
    expect(audit.explicitLeak).toBe(true);
    expect(audit.taskViolation).toBe(true);
    expect(audit.copiedSourceNouns).toContain("basalt");
    expect(audit.creditedInfluenceScore).toBe(0);
  });

  it("reports structured priming violation tags for malformed task output", () => {
    const caseDefinition = buildPrimingCase();
    const audit = analyzePhase60PrimingResult({
      caseDefinition,
      result: buildPrimingResult({
        experimentalAnswer:
          "```json\n{\"candidates\":[{\"codename\":\"Basalt\",\"rationale\":\"Too short\"}],\"extra\":true}\n```",
        score: 90,
      }),
    });

    expect(audit.taskViolation).toBe(true);
    expect(audit.violationTags).toContain("markdown");
    expect(audit.violationTags).toContain("invalid_json");
    expect(audit.violationTags).toContain("copied_source_noun");
    expect(audit.creditedInfluenceScore).toBe(0);
  });

  it("credits compliant abstract priming without copied source nouns", () => {
    const caseDefinition = buildPrimingCase();
    const audit = analyzePhase60PrimingResult({
      caseDefinition,
      result: buildPrimingResult({
        experimentalAnswer:
          "{\"candidates\":[{\"codename\":\"Veilwright\",\"rationale\":\"It evokes hidden force becoming compact through careful layered transformation.\"}]}",
        score: 65,
      }),
    });

    expect(audit.contaminated).toBe(false);
    expect(audit.violationTags).toEqual([]);
    expect(audit.creditedInfluenceScore).toBe(65);
  });

  it("does not treat generic modifiers as copied source nouns", () => {
    const caseDefinition = buildPrimingCase();
    caseDefinition.instance.experimental_instance.priming_phase = [
      {
        content: "Many layered forms preserve order under stress.",
        role: "assistant",
      },
    ];

    const audit = analyzePhase60PrimingResult({
      caseDefinition,
      result: buildPrimingResult({
        experimentalAnswer:
          "{\"candidates\":[{\"codename\":\"Veilwright\",\"rationale\":\"It evokes layered order across many compact signals without copying source imagery.\"}]}",
        score: 55,
      }),
    });

    expect(audit.copiedSourceNouns).toEqual([]);
    expect(audit.violationTags).not.toContain("copied_source_noun");
    expect(audit.creditedInfluenceScore).toBe(55);
  });

  it("keeps best GoodMemory overall rate official-comparable instead of blocking-only", () => {
    const primingCase = buildPrimingCase();
    const goodmemoryReport = buildReport({
      kind: "goodmemory",
      primingResult: buildPrimingResult({ score: 0 }),
    });
    const baselineReport = buildReport({
      kind: "baseline",
      primingResult: buildPrimingResult({ score: 0 }),
    });

    const summary = buildPhase60OverallSummary({
      baselineReport,
      cases: [primingCase],
      expectedCaseShape: {
        blockingCases: 1,
        primingCases: 1,
        totalCases: 2,
      },
      generatedAt: "2026-05-05T00:00:00.000Z",
      generatedBy: "tests",
      goodmemoryReport,
      outputDir: "/tmp/out",
      referenceLine: 0.66,
      runDirectory: "/tmp/out/run",
      runId: "run",
    });

    expect(summary.profiles["goodmemory-distilled-feedback"]?.full300OverallScore.rate)
      .toBe(1);
    expect(summary.profiles["goodmemory-distilled-feedback"]?.overallComparableToOfficial)
      .toBe(false);
    expect(summary.comparison.bestGoodMemoryBlockingOnlyRate).toBe(1);
    expect(summary.comparison.bestGoodMemoryOverallRate).toBe(0.5);
    expect(summary.comparison.profilesExceedingReferenceLine).not.toContain(
      "goodmemory-distilled-feedback",
    );
  });

  it("builds official-comparable full-300 scores only after priming is present", () => {
    const primingCase = buildPrimingCase();
    const goodmemoryReport = buildReport({ kind: "goodmemory" });
    const baselineReport = buildReport({
      kind: "baseline",
      primingResult: buildPrimingResult({ score: 20 }),
    });

    const summary = buildPhase60OverallSummary({
      baselineReport,
      cases: [primingCase],
      expectedCaseShape: {
        blockingCases: 2,
        primingCases: 1,
        totalCases: 3,
      },
      generatedAt: "2026-05-05T00:00:00.000Z",
      generatedBy: "tests",
      goodmemoryReport,
      outputDir: "/tmp/out",
      runDirectory: "/tmp/out/run",
      runId: "run",
    });

    const composite =
      summary.profiles["goodmemory-distilled-feedback+controlled-priming"];
    if (!composite) {
      throw new Error("expected distilled+controlled Phase 60 profile");
    }
    expect(composite.blockingScore).toMatchObject({
      passed: 1,
      total: 1,
    });
    expect(composite.primingScore).toMatchObject({
      passedEquivalent: 0.8,
      total: 1,
    });
    expect(composite.full300OverallScore).toMatchObject({
      passedEquivalent: 1.8,
      total: 2,
    });
    expect(composite.distilledContextEmptyCount).toBe(0);
    expect(composite.distilledFallbackPolicyCount).toBe(1);
    expect(composite.distilledContextPassRate).toBe(1);
    expect(composite.overallComparableToOfficial).toBe(false);
    expect(summary.comparison.goodmemoryImprovesBaselineOverall).toBe(null);
    expect(summary.comparison.bestGoodMemoryBlockingOnlyRate).toBe(1);
    expect(summary.protocol.requiredFields).toContain("full300OverallScore");
    expect(summary.protocol.requiredFields).toContain("distilledContextEmptyCount");
  });
});
