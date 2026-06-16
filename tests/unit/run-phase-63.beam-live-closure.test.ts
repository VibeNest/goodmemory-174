import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  PHASE63_BEAM_CLOSURE_GATE_RUN_ID,
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

function buildRecallReport(): string {
  return JSON.stringify({
    benchmarkRoot: "/tmp/BEAM",
    generatedAt: "2026-06-15T20:00:00.000Z",
    generatedBy: "scripts/run-phase-63-beam-recall-diagnostic.ts",
    mode: "full",
    outputDir: "/tmp/out",
    phase: "phase-63",
    profiles: {
      "goodmemory-rules-only": {
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
      profilesCompared: ["goodmemory-rules-only"],
      scale: "100K",
      totalCases: 3,
    },
  });
}

function buildLiveReport(totalCases = 3): Phase63BeamLiveSliceReport {
  return {
    benchmarkRoot: "/tmp/BEAM",
    cases: [],
    generatedAt: "2026-06-15T20:30:00.000Z",
    generatedBy: "scripts/run-phase-63-beam-live-slice.ts",
    mode: "live-answer-slice",
    outputDir: "/tmp/out",
    phase: "phase-63",
    profile: "goodmemory-rules-only",
    recallReportPath: "/tmp/recall.json",
    runDirectory: "/tmp/out/run-closure",
    runId: "run-closure",
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
      profilesCompared: ["goodmemory-rules-only"],
      scale: "100K",
      totalCases,
      wrongAnswerCases: totalCases - 2,
      wrongRecallCases: 1,
    },
  };
}

function buildClosureReport(): Phase63BeamLiveClosureReport {
  return {
    benchmarkRoot: "/tmp/BEAM",
    generatedAt: "2026-06-15T20:45:00.000Z",
    generatedBy: "scripts/run-phase-63-beam-live-closure.ts",
    liveReportPath: "/tmp/out/run-closure/live-slice-report.json",
    mode: "live-answer-closure",
    outputDir: "/tmp/out",
    phase: "phase-63",
    profile: "goodmemory-rules-only",
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
      profilesCompared: ["goodmemory-rules-only"],
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
      outputDir: undefined,
      profile: "goodmemory-rules-only",
      recallReportPath: "/tmp/recall.json",
      runId: "run-closure",
      scale: "100K",
    });
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
});

describe("phase-63 BEAM closure gate", () => {
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
