import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  PHASE63_BEAM_CLOSURE_GATE_RUN_ID,
  parsePhase63BeamClosureGateCliOptions,
  runPhase63BeamClosureGate,
} from "../../scripts/run-phase-63-beam-closure-gate";
import {
  PHASE63_BEAM_LIVE_CLOSURE_REPORT_FILE_NAME,
  parsePhase63BeamLiveClosureCliOptions,
  runPhase63BeamLiveClosure,
} from "../../scripts/run-phase-63-beam-live-closure";
import type {
  Phase63BeamLiveClosureReport,
} from "../../scripts/run-phase-63-beam-live-closure";
import type {
  Phase63BeamLiveSliceReport,
} from "../../scripts/run-phase-63-beam-live-slice";
import type { BeamProfile } from "../../src/eval/beam";

function buildBeamRows(): unknown[] {
  return [
    {
      chat: [
        [
          {
            content: "Mira prefers terse rollback notes.",
            id: 1,
            index: "1,1",
            question_type: "preference",
            role: "user",
            time_anchor: "March-15-2024",
          },
          {
            content: "Theo owns the rollback checklist.",
            id: 2,
            index: null,
            question_type: null,
            role: "assistant",
            time_anchor: null,
          },
        ],
      ],
      conversation_id: "beam-live-closure",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 1,
        subtopics: ["Rollback"],
        theme: "Release operations",
        title: "Rollback Planning",
      },
      narratives: "Release planning labels",
      probing_questions: {
        information_extraction: [
          {
            answer: "Theo.",
            evidence_chat_ids: [2],
            question: "Who owns the rollback checklist?",
            question_id: "beam-live-q1",
            question_type: "information_extraction",
          },
        ],
        preference_following: [
          {
            answer: "Keep rollback notes terse.",
            evidence_chat_ids: [1],
            question: "How should rollback notes be written?",
            question_id: "beam-live-q2",
            question_type: "preference_following",
          },
        ],
        abstention: [
          {
            evidence_chat_ids: [],
            question: "Which deployment window did Mira approve?",
            question_id: "beam-live-q3",
            question_type: "abstention",
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Mira",
        user_relationships: "None",
      },
      user_questions: [],
    },
  ];
}

function buildRecallReport(profile: BeamProfile = "goodmemory-rules-only"): string {
  return JSON.stringify({
    benchmarkRoot: "/tmp/BEAM",
    generatedAt: "2026-06-15T20:00:00.000Z",
    generatedBy: "scripts/run-phase-63-beam-recall-diagnostic.ts",
    mode: "full",
    outputDir: "/tmp/out",
    phase: "phase-63",
    profiles: {
      [profile]: {
        cases: [],
        summary: {
          evidenceChatRecall: 0.9,
        },
      },
    },
    runDirectory: "/tmp/out/run-recall",
    runId: "run-recall",
    source: {
      benchmark: "BEAM",
      license: "cc-by-sa-4.0 dataset; paper external",
      url: "https://huggingface.co/datasets/Mohammadta/BEAM",
    },
    summary: {
      caseCountsByQuestionType: {},
      executionFailures: 0,
      profilesCompared: [profile],
      scale: "100K",
      totalCases: 3,
    },
  });
}

function buildLiveCases(
  totalCases: number,
): Phase63BeamLiveSliceReport["cases"] {
  return Array.from({ length: totalCases }, (_, index) => ({
    answerScore: {
      correct: index < 2,
      method: index < 2 ? "exact" : "mismatch",
      reasoning: "fixture",
    },
    answerable: true,
    conversationId: "beam-live-closure",
    correct: index < 2,
    evidenceChatIds: [1],
    evidenceChatRecall: index === 0 ? 1 : 0.5,
    expectedAnswer: `expected-${index}`,
    hypothesis: `actual-${index}`,
    memoryContextChars: 42,
    questionId: `beam-live-q${index + 1}`,
    questionType: index === 1 ? "preference_following" : "information_extraction",
    retrievedChatIds: [1],
  }));
}

function buildLiveReport(
  totalCases = 3,
  profile: BeamProfile = "goodmemory-rules-only",
  selection?: Phase63BeamLiveSliceReport["selection"],
): Phase63BeamLiveSliceReport {
  return {
    benchmarkRoot: "/tmp/BEAM",
    cases: buildLiveCases(totalCases),
    generatedAt: "2026-06-15T20:30:00.000Z",
    generatedBy: "scripts/run-phase-63-beam-live-slice.ts",
    mode: "live-answer-slice",
    outputDir: "/tmp/out",
    phase: "phase-63",
    profile,
    recallReportPath: "/tmp/recall.json",
    runDirectory: "/tmp/out/run-closure",
    runId: "run-closure",
    ...(selection === undefined ? {} : { selection }),
    source: {
      benchmark: "BEAM",
      license: "cc-by-sa-4.0 dataset; paper external",
      url: "https://huggingface.co/datasets/Mohammadta/BEAM",
    },
    summary: {
      caseCountsByQuestionType: {},
      correctCases: 2,
      evidenceCaseCount: 2,
      evidenceChatRecall: 0.9,
      executionFailures: 0,
      missedRecallCases: 1,
      profilesCompared: [profile],
      scale: "100K",
      totalCases,
      wrongAnswerCases: totalCases - 2,
      wrongRecallCases: 1,
    },
  };
}

function buildClosureReport(
  profile: BeamProfile = "goodmemory-rules-only",
): Phase63BeamLiveClosureReport {
  return {
    benchmarkRoot: "/tmp/BEAM",
    evidencePack: false,
    generatedAt: "2026-06-15T20:45:00.000Z",
    generatedBy: "scripts/run-phase-63-beam-live-closure.ts",
    liveReportPath: "/tmp/out/run-closure/live-slice-report.json",
    mode: "live-answer-closure",
    outputDir: "/tmp/out",
    phase: "phase-63",
    profile,
    recallReportPath: "/tmp/recall.json",
    runDirectory: "/tmp/out/run-closure",
    runId: "run-closure",
    source: {
      benchmark: "BEAM",
      license: "cc-by-sa-4.0 dataset; paper external",
      url: "https://huggingface.co/datasets/Mohammadta/BEAM",
    },
    status: "ready-for-gate",
    summary: {
      answerAccuracy: 2 / 3,
      correctCases: 2,
      evidenceCaseCount: 2,
      evidenceChatRecall: 0.9,
      executionFailures: 0,
      expectedTotalCases: 3,
      missedRecallCases: 1,
      profilesCompared: [profile],
      recallDiagnosticEvidenceChatRecall: 0.9,
      recallDiagnosticExecutionFailures: 0,
      recallDiagnosticRunId: "run-recall",
      recallDiagnosticTotalCases: 3,
      scale: "100K",
      totalCases: 3,
      wrongAnswerCases: 1,
      wrongRecallCases: 1,
    },
  };
}

describe("phase-63 BEAM live closure runner", () => {
  it("parses live closure cli flags", () => {
    expect(
      parsePhase63BeamLiveClosureCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-closure.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--recall-report",
        "/tmp/recall.json",
        "--profile",
        "goodmemory-rules-only",
        "--run-id",
        "run-closure",
        "--scale",
        "100K",
      ]),
    ).toEqual({
      benchmarkRoot: "/tmp/BEAM",
      evidencePack: false,
      outputDir: undefined,
      profile: "goodmemory-rules-only",
      recallReportPath: "/tmp/recall.json",
      resume: false,
      runId: "run-closure",
      scale: "100K",
    });
  });

  it("rejects duplicate live closure mode flags before report generation", () => {
    expect(() =>
      parsePhase63BeamLiveClosureCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-closure.ts",
        "--evidence-pack",
        "--evidence-pack",
      ]),
    ).toThrow("--evidence-pack cannot be specified more than once.");

    expect(() =>
      parsePhase63BeamLiveClosureCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-closure.ts",
        "--resume",
        "--resume",
      ]),
    ).toThrow("--resume cannot be specified more than once.");
  });

  it("rejects duplicate live closure scalar source and output flags before report generation", () => {
    expect(() =>
      parsePhase63BeamLiveClosureCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-closure.ts",
        "--recall-report",
        "/tmp/recall-a.json",
        "--recall-report",
        "/tmp/recall-b.json",
      ]),
    ).toThrow("--recall-report cannot be specified more than once.");

    expect(() =>
      parsePhase63BeamLiveClosureCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-closure.ts",
        "--run-id",
        "run-a",
        "--run-id",
        "run-b",
      ]),
    ).toThrow("--run-id cannot be specified more than once.");

    expect(() =>
      parsePhase63BeamLiveClosureCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-closure.ts",
        "--run-id",
        "nested/live-closure",
      ]),
    ).toThrow("--run-id must be a single path segment.");
  });

  it("rejects empty or whitespace-padded BEAM root environment values", async () => {
    const original = process.env.GOODMEMORY_BEAM_ROOT;
    try {
      process.env.GOODMEMORY_BEAM_ROOT = "/tmp/BEAM-env";
      expect(
        parsePhase63BeamLiveClosureCliOptions([
          "bun",
          "run",
          "scripts/run-phase-63-beam-live-closure.ts",
        ]).benchmarkRoot,
      ).toBe("/tmp/BEAM-env");
      expect(
        parsePhase63BeamLiveClosureCliOptions([
          "bun",
          "run",
          "scripts/run-phase-63-beam-live-closure.ts",
          "--benchmark-root",
          "/tmp/BEAM-cli",
        ]).benchmarkRoot,
      ).toBe("/tmp/BEAM-cli");

      process.env.GOODMEMORY_BEAM_ROOT = " /tmp/BEAM-env ";
      expect(() =>
        parsePhase63BeamLiveClosureCliOptions([
          "bun",
          "run",
          "scripts/run-phase-63-beam-live-closure.ts",
        ]),
      ).toThrow("GOODMEMORY_BEAM_ROOT cannot be empty or whitespace-padded.");
      await expect(runPhase63BeamLiveClosure()).rejects.toThrow(
        "GOODMEMORY_BEAM_ROOT cannot be empty or whitespace-padded.",
      );

      process.env.GOODMEMORY_BEAM_ROOT = "";
      expect(() =>
        parsePhase63BeamLiveClosureCliOptions([
          "bun",
          "run",
          "scripts/run-phase-63-beam-live-closure.ts",
        ]),
      ).toThrow("GOODMEMORY_BEAM_ROOT cannot be empty or whitespace-padded.");
    } finally {
      if (original === undefined) {
        delete process.env.GOODMEMORY_BEAM_ROOT;
      } else {
        process.env.GOODMEMORY_BEAM_ROOT = original;
      }
    }
  });

  it("accepts the hybrid live closure profile", () => {
    expect(
      parsePhase63BeamLiveClosureCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-closure.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--recall-report",
        "/tmp/recall.json",
        "--profile",
        "goodmemory-hybrid",
      ]).profile,
    ).toBe("goodmemory-hybrid");
  });

  it("wraps a full all-cases live answer run as closure evidence", async () => {
    const writes = new Map<string, string>();
    const report = await runPhase63BeamLiveClosure(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        recallReportPath: "/tmp/recall.json",
        runId: "run-closure",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-15T21:00:00.000Z"),
        readFile: async (path) => {
          if (path === "/tmp/recall.json") {
            return buildRecallReport();
          }
          expect(path).toBe(join("/tmp/BEAM", "100K.json"));
          return JSON.stringify(buildBeamRows());
        },
        runLiveSlice: async (options) => {
          const resolved = options ?? {};
          expect(resolved.caseSelection).toBe("all-cases");
          expect(resolved.limit).toBeUndefined();
          expect(resolved.recallReportPath).toBe("/tmp/recall.json");
          return buildLiveReport();
        },
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(report.status).toBe("ready-for-gate");
    expect(report.summary.totalCases).toBe(3);
    expect(report.summary.expectedTotalCases).toBe(3);
    expect(report.summary.answerAccuracy).toBe(2 / 3);
    expect(report.liveReportPath).toBe("/tmp/out/run-closure/live-slice-report.json");
    expect(
      writes.has(
        `/tmp/out/run-closure/${PHASE63_BEAM_LIVE_CLOSURE_REPORT_FILE_NAME}`,
      ),
    ).toBe(true);
  });

  it("wraps a hybrid full live answer run as closure evidence", async () => {
    const report = await runPhase63BeamLiveClosure(
      {
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profile: "goodmemory-hybrid",
        recallReportPath: "/tmp/recall-hybrid.json",
        runId: "run-hybrid-closure",
      },
      {
        mkdir: async () => undefined,
        readFile: async (path) => {
          if (path === "/tmp/recall-hybrid.json") {
            return buildRecallReport("goodmemory-hybrid");
          }
          return JSON.stringify(buildBeamRows());
        },
        runLiveSlice: async (options) => {
          const resolved = options ?? {};
          expect(resolved.caseSelection).toBe("all-cases");
          expect(resolved.profile).toBe("goodmemory-hybrid");
          return buildLiveReport(3, "goodmemory-hybrid");
        },
        writeFile: async () => undefined,
      },
    );

    expect(report.profile).toBe("goodmemory-hybrid");
    expect(report.summary.profilesCompared).toEqual(["goodmemory-hybrid"]);
  });

  it("rejects partial live coverage", async () => {
    await expect(
      runPhase63BeamLiveClosure(
        {
          benchmarkRoot: "/tmp/BEAM",
          outputDir: "/tmp/out",
          recallReportPath: "/tmp/recall.json",
          runId: "run-closure",
        },
        {
          mkdir: async () => undefined,
          readFile: async (path) => {
            if (path === "/tmp/recall.json") {
              return buildRecallReport();
            }
            return JSON.stringify(buildBeamRows());
          },
          runLiveSlice: async () => buildLiveReport(2),
          writeFile: async () => undefined,
        },
      ),
    ).rejects.toThrow("Phase 63 BEAM live report covers 2 cases; expected 3");
  });

  it("rejects live reports whose case rows do not cover the reported closure total", async () => {
    await expect(
      runPhase63BeamLiveClosure(
        {
          benchmarkRoot: "/tmp/BEAM",
          outputDir: "/tmp/out",
          recallReportPath: "/tmp/recall.json",
          runId: "run-closure",
        },
        {
          mkdir: async () => undefined,
          readFile: async (path) => {
            if (path === "/tmp/recall.json") {
              return buildRecallReport();
            }
            return JSON.stringify(buildBeamRows());
          },
          runLiveSlice: async () => ({
            ...buildLiveReport(3),
            cases: buildLiveCases(2),
          }),
          writeFile: async () => undefined,
        },
      ),
    ).rejects.toThrow("Phase 63 BEAM live report contains 2 case rows; expected 3");
  });

  it("rejects focused live-slice selection metadata as closure evidence", async () => {
    await expect(
      runPhase63BeamLiveClosure(
        {
          benchmarkRoot: "/tmp/BEAM",
          outputDir: "/tmp/out",
          recallReportPath: "/tmp/recall.json",
          runId: "run-closure",
        },
        {
          mkdir: async () => undefined,
          readFile: async (path) => {
            if (path === "/tmp/recall.json") {
              return buildRecallReport();
            }
            return JSON.stringify(buildBeamRows());
          },
          runLiveSlice: async () =>
            buildLiveReport(3, "goodmemory-rules-only", {
              answerGapBuckets: ["summarization"],
              answerGapReportPath: "/tmp/answer-gap.json",
              answerGapSourceCoverageStatuses: ["covered-or-no-warning"],
              caseIds: null,
              caseSelection: null,
              limit: null,
              recallReportPath: "/tmp/recall.json",
            }),
          writeFile: async () => undefined,
        },
      ),
    ).rejects.toThrow(
      "Phase 63 BEAM closure requires an all-cases live report selection",
    );
  });
});

describe("phase-63 BEAM closure gate", () => {
  it("rejects duplicate scalar closure-gate flags before running checks", () => {
    for (const flag of ["--closure-report", "--output-dir", "--run-id"]) {
      expect(() =>
        parsePhase63BeamClosureGateCliOptions([
          "bun",
          "run",
          "scripts/run-phase-63-beam-closure-gate.ts",
          flag,
          "first",
          flag,
          "second",
        ]),
      ).toThrow(`${flag} cannot be specified more than once.`);
    }
  });

  it("rejects path-like closure-gate run ids before running checks", () => {
    expect(() =>
      parsePhase63BeamClosureGateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-closure-gate.ts",
        "--closure-report",
        "/tmp/out/run-closure/phase-63-beam-closure-report.json",
        "--run-id",
        "../outside-gates",
      ]),
    ).toThrow("--run-id must be a single path segment.");
  });

  it("accepts a complete live closure report without rerunning live models", async () => {
    const commands: string[][] = [];
    const writes = new Map<string, string>();
    const result = await runPhase63BeamClosureGate(
      {
        closureReportPath: "/tmp/out/run-closure/phase-63-beam-closure-report.json",
        outputDir: "/tmp/gates",
        runId: "run-gate",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-15T21:30:00.000Z"),
        readFile: async () => JSON.stringify(buildClosureReport()),
        runCommand: async (command) => {
          commands.push(command);
        },
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(commands).toContainEqual([
      "bun",
      "test",
      "tests/unit/run-phase-63.beam-live-closure.test.ts",
      "tests/unit/run-phase-63.beam-live-slice.test.ts",
    ]);
    expect(result.status).toBe("accepted");
    expect(result.summary.closureRunId).toBe("run-closure");
    expect(result.summary.profile).toBe("goodmemory-rules-only");
    expect(
      writes.has("/tmp/gates/run-gate/phase-63-beam-closure-gate.json"),
    ).toBe(true);
  });

  it("uses the canonical closure gate run id by default", async () => {
    const writes = new Map<string, string>();
    await runPhase63BeamClosureGate(
      {
        closureReportPath: "/tmp/out/run-closure/phase-63-beam-closure-report.json",
        outputDir: "/tmp/gates",
      },
      {
        mkdir: async () => undefined,
        readFile: async () => JSON.stringify(buildClosureReport()),
        runCommand: async () => undefined,
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(
      writes.has(
        `/tmp/gates/${PHASE63_BEAM_CLOSURE_GATE_RUN_ID}/phase-63-beam-closure-gate.json`,
      ),
    ).toBe(true);
  });
});
