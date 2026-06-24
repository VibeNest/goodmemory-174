import { describe, expect, it } from "bun:test";
import { analyzeLocomoRetrievalGap } from "../../scripts/analyze-phase-65-locomo-retrieval-gap";

const cases = [
  {
    caseId: "c1",
    turns: [
      { diaId: "D1:1", speaker: "Anna", content: "Anna visits the downtown clinic weekly" },
      { diaId: "D1:2", speaker: "Anna", content: "yesterday felt really tiring honestly" },
      { diaId: "D2:1", speaker: "Bob", content: "the dog Max loves long walks" },
      { diaId: "D2:2", speaker: "Bob", content: "the weather outside is nice" },
    ],
    questions: [
      { questionId: "q1", question: "which clinic does Anna attend" },
      { questionId: "q2", question: "what is the dog Max" },
      { questionId: "q3", question: "when is the weather nice" },
    ],
  },
];

function report() {
  return {
    runId: "test-run",
    cases: [
      {
        // gold turn (D1:2) shares no words with the question, but its neighbor
        // D1:1 does -> zero retrieval + neighbor-beats-gold.
        answerCorrect: false,
        caseId: "c1",
        category: "single_hop",
        evidenceRecall: 0,
        evidenceTurnIds: ["D1:2"],
        goldEvidenceFullyRetrieved: false,
        missingEvidenceTurnIds: ["D1:2"],
        noiseTurnIds: [],
        questionId: "q1",
        retrievedTurnIds: [],
      },
      {
        answerCorrect: true,
        caseId: "c1",
        category: "single_hop",
        evidenceRecall: 1,
        evidenceTurnIds: ["D2:1"],
        goldEvidenceFullyRetrieved: true,
        missingEvidenceTurnIds: [],
        noiseTurnIds: [],
        questionId: "q2",
        retrievedTurnIds: ["D2:1"],
      },
      {
        // partial recall but the answer is still wrong.
        answerCorrect: false,
        caseId: "c1",
        category: "temporal",
        evidenceRecall: 0.5,
        evidenceTurnIds: ["D2:2", "D2:1"],
        goldEvidenceFullyRetrieved: false,
        missingEvidenceTurnIds: ["D2:1"],
        noiseTurnIds: [],
        questionId: "q3",
        retrievedTurnIds: ["D2:2"],
      },
    ],
  };
}

describe("LoCoMo retrieval-gap analyzer", () => {
  it("splits retrieval into zero / partial / full and tracks recall-positive wrong answers", () => {
    const analysis = analyzeLocomoRetrievalGap({ cases, report: report() }) as {
      overall: {
        answerVsRecall: { recallPositiveAnswerWrong: number };
        neighborLift: { neighborBeatsGoldShare: number };
        retrieval: {
          fullRetrievalShare: number;
          partialRetrievalShare: number;
          zeroRetrievalShare: number;
        };
        total: number;
      };
    };
    expect(analysis.overall.total).toBe(3);
    expect(analysis.overall.retrieval.zeroRetrievalShare).toBeCloseTo(1 / 3, 4);
    expect(analysis.overall.retrieval.partialRetrievalShare).toBeCloseTo(1 / 3, 4);
    expect(analysis.overall.retrieval.fullRetrievalShare).toBeCloseTo(1 / 3, 4);
    // q3 retrieved some gold but answered wrong.
    expect(analysis.overall.answerVsRecall.recallPositiveAnswerWrong).toBe(1);
    // q1's gold turn shares no question words, but neighbor D1:1 ("clinic") does.
    expect(analysis.overall.neighborLift.neighborBeatsGoldShare).toBeGreaterThan(0);
  });

  it("shows retrieved gold turns out-overlap missed gold turns (lexical-driven recall)", () => {
    const analysis = analyzeLocomoRetrievalGap({ cases, report: report() }) as {
      overall: {
        retrievedVsMissedOverlap: {
          meanMissedGoldOverlap: number;
          meanRetrievedGoldOverlap: number;
        };
      };
    };
    const o = analysis.overall.retrievedVsMissedOverlap;
    expect(o.meanRetrievedGoldOverlap).toBeGreaterThan(o.meanMissedGoldOverlap);
  });
});
