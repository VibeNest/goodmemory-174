import { describe, expect, it } from "bun:test";

import type { LocomoQuestionRetrieval } from "../../scripts/run-phase-65-locomo-smoke";
import {
  buildPhase72LocomoRerankerPacketGate,
  createPhase72LocomoListwiseReranker,
  createPhase72LocomoStoredCandidateReplayMemory,
  selectPhase72LocomoRerankerCohort,
  type Phase72LocomoRerankerProfile,
} from "../../scripts/run-phase-72-locomo-reranker-packet";

function row(
  questionId: string,
  overrides: Partial<LocomoQuestionRetrieval> = {},
): LocomoQuestionRetrieval {
  return {
    answerCorrect: false,
    answerTokenF1: 0,
    caseId: "locomo-case",
    category: "single_hop",
    evidenceRecall: 1,
    evidenceTurnIds: ["D1:1"],
    generatedAnswer: "wrong",
    goldEvidenceFullyRetrieved: true,
    missingEvidenceTurnIds: [],
    noiseTurnCount: 1,
    noiseTurnIds: ["D1:2"],
    questionId,
    retrievedTurnIds: ["D1:1", "D1:2"],
    ...overrides,
  };
}

const profile: Phase72LocomoRerankerProfile = {
  benchmarkFileSha256: "benchmark-file",
  benchmarkFingerprint: "benchmark-fingerprint",
  extractionCache: {
    path: "cache.jsonl",
    sha256: "cache-sha",
  },
  schemaVersion: 1,
  selection: {
    cohorts: {
      development: {
        count: 2,
        digest: "2da4982a07fcf4646a76d94799697c5feb6a09729a43efd71d35efb03f0f4822",
        offset: 0,
      },
      full: {
        count: 4,
        digest: "40dfa7f0112ed96521102ae48d6b7ddaeef2e5958651b4c208617d0c76f8d971",
        offset: 0,
      },
      holdout: {
        count: 2,
        digest: "6042c6ad877d2c1256e3810929d7b2bf1bb1ef615a2d10bfe383e53a7902c783",
        offset: 2,
      },
    },
    salt: "test-salt",
  },
  sourceReport: {
    path: "source.json",
    sha256: "source-sha",
  },
};

describe("Phase 72 LoCoMo reranker packet evaluation", () => {
  it("selects frozen hash cohorts without consulting outcomes", () => {
    const source = [row("q1"), row("q2"), row("q3"), row("q4")];
    const changedOutcomes = source.map((entry) => ({
      ...entry,
      answerCorrect: !entry.answerCorrect,
      answerTokenF1: 1,
      evidenceRecall: 0,
      generatedAnswer: "changed",
    }));

    expect(
      selectPhase72LocomoRerankerCohort({
        cohort: "development",
        profile,
        rows: source,
      }).map((entry) => entry.questionId),
    ).toEqual(
      selectPhase72LocomoRerankerCohort({
        cohort: "development",
        profile,
        rows: changedOutcomes,
      }).map((entry) => entry.questionId),
    );
    expect(
      selectPhase72LocomoRerankerCohort({
        cohort: "full",
        profile,
        rows: source,
      }).map((entry) => entry.questionId),
    ).toEqual(["q4", "q3", "q2", "q1"]);
  });

  it("rejects selection drift before any model call", () => {
    const drifted = structuredClone(profile);
    drifted.selection.cohorts.development.digest = "wrong";

    expect(() =>
      selectPhase72LocomoRerankerCohort({
        cohort: "development",
        profile: drifted,
        rows: [row("q1"), row("q2"), row("q3"), row("q4")],
      }),
    ).toThrow("development selection digest");
  });

  it("requires a three-point strict lift with zero execution failures", () => {
    const source = Array.from({ length: 100 }, (_, index) =>
      row(`q${index}`, {
        answerCorrect: index < 60,
        answerTokenF1: index < 60 ? 1 : 0,
      }),
    );
    const candidate = source.map((entry, index) => ({
      ...entry,
      answerCorrect: index < 64,
      answerTokenF1: index < 64 ? 1 : 0,
      noiseTurnCount: 0,
    }));

    const gate = buildPhase72LocomoRerankerPacketGate({ candidate, source });
    expect(gate).toMatchObject({
      failures: [],
      status: "passed",
      summary: {
        candidateStrictAccuracy: 0.64,
        sourceStrictAccuracy: 0.6,
      },
    });
    expect(gate.summary.strictAccuracyDelta).toBeCloseTo(0.04);

    const failed = candidate.map((entry, index) =>
      index === 99
        ? { ...entry, executionFailureStage: "answer" as const }
        : entry,
    );
    expect(
      buildPhase72LocomoRerankerPacketGate({ candidate: failed, source })
        .failures,
    ).toContain("candidate executionFailures 1 exceeds 0");
  });

  it("rejects missing or duplicate comparator rows", () => {
    expect(() =>
      buildPhase72LocomoRerankerPacketGate({
        candidate: [row("q1")],
        source: [row("q2")],
      }),
    ).toThrow("question sets differ");
    expect(() =>
      buildPhase72LocomoRerankerPacketGate({
        candidate: [row("q1"), row("q1")],
        source: [row("q1"), row("q2")],
      }),
    ).toThrow("duplicate candidate question q1");
  });

  it("adapts one listwise router call into stable reranker scores", async () => {
    const calls: string[][] = [];
    const reranker = createPhase72LocomoListwiseReranker({
      router: {
        async plan() {
          throw new Error("plan is not used by listwise reranking");
        },
        async rerank({ candidates }) {
          calls.push(candidates.map((candidate) => candidate.id));
          return {
            orderedCandidateIds: ["D1:3", "D1:1"],
            rationale: "third and first are complementary",
          };
        },
      },
    });

    const scores = await reranker.rerank({
      documents: [
        { id: "D1:1", text: "first" },
        { id: "D1:2", text: "second" },
        { id: "D1:3", text: "third" },
      ],
      query: "combine the relevant facts",
    });

    expect(calls).toEqual([["D1:1", "D1:2", "D1:3"]]);
    expect(
      [...scores].sort((left, right) => right.score - left.score),
    ).toEqual([
      { id: "D1:3", score: 1 },
      { id: "D1:1", score: 2 / 3 },
      { id: "D1:2", score: 1 / 3 },
    ]);
  });

  it("widens stored candidates with BM25 before reranking the packet top six", async () => {
    const caseWithSevenTurns = {
      caseId: "locomo-case",
      questions: [
        {
          adversarialAnswer: null,
          category: "single_hop" as const,
          evidenceTurnIds: ["D1:7"],
          goldAnswer: "seven",
          matchMode: "f1_token_overlap" as const,
          question: "Which turn matters?",
          questionId: "q-seven",
        },
      ],
      sourceConversation: "synthetic",
      speakers: ["A", "B"] as [string, string],
      turns: Array.from({ length: 7 }, (_, index) => ({
        content: index === 6 ? "This turn matters." : `turn ${index + 1}`,
        diaId: `D1:${index + 1}`,
        speaker: index % 2 === 0 ? "A" : "B",
      })),
    };
    const traces: unknown[] = [];
    const memory = createPhase72LocomoStoredCandidateReplayMemory({
      bm25Additions: 1,
      cases: [caseWithSevenTurns],
      recordTrace: async (trace) => {
        traces.push(trace);
      },
      reranker: {
        async rerank({ documents }) {
          return documents.map((document) => ({
            id: document.id,
            score: Number(document.id.split(":")[1]),
          }));
        },
      },
      sourceRows: [
        row("q-seven", {
          caseId: "locomo-case",
          retrievedTurnIds: Array.from(
            { length: 6 },
            (_, index) => `D1:${index + 1}`,
          ),
        }),
      ],
    });

    const recall = await memory.recall({
      query: "Which turn matters?",
      scope: {
        sessionId: "case-locomo-case",
        userId: "locomo:locomo-case",
      },
    });

    expect(recall.packet.factSummary).toContain("dia_id=D1:7");
    expect(recall.packet.factSummary).not.toContain("dia_id=D1:1");
    expect(traces).toHaveLength(1);
  });
});
