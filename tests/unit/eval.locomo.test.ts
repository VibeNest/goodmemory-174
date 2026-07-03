import { describe, expect, it } from "bun:test";
import {
  buildLocomoSmokeCases,
  deriveLocomoMatchMode,
  LOCOMO_QA_CATEGORIES,
  locomoExactMatch,
  locomoTokenF1,
  type LocomoQuestion,
  type LocomoQuestionResult,
  normalizeLocomoAnswer,
  normalizeLocomoCategoryCode,
  parseLocomoSession,
  scoreLocomoAnswer,
  summarizeLocomoResults,
} from "../../src/eval/locomo";

function questionById(id: string): LocomoQuestion {
  for (const testCase of buildLocomoSmokeCases()) {
    for (const question of testCase.questions) {
      if (question.questionId === id) {
        return question;
      }
    }
  }
  throw new Error(`smoke question not found: ${id}`);
}

describe("LoCoMo smoke contract", () => {
  it("provides one synthetic smoke case per QA category", () => {
    const cases = buildLocomoSmokeCases();
    const categories = cases.map((testCase) => testCase.questions[0]?.category);
    expect([...categories].sort()).toEqual([...LOCOMO_QA_CATEGORIES].sort());

    for (const testCase of cases) {
      expect(testCase.questions.length).toBeGreaterThan(0);
      const turnIds = new Set(testCase.turns.map((turn) => turn.diaId));
      for (const question of testCase.questions) {
        expect(question.matchMode).toBe(deriveLocomoMatchMode(question.category));
        for (const evidenceId of question.evidenceTurnIds) {
          expect(turnIds.has(evidenceId)).toBe(true);
        }
        // Only adversarial cases carry a tempting answer.
        if (question.category === "adversarial") {
          expect(question.adversarialAnswer).not.toBeNull();
        } else {
          expect(question.adversarialAnswer).toBeNull();
        }
      }
    }
  });

  it("maps upstream integer category codes and parses dia_id sessions", () => {
    expect(normalizeLocomoCategoryCode(1)).toBe("multi_hop");
    expect(normalizeLocomoCategoryCode(2)).toBe("temporal");
    expect(normalizeLocomoCategoryCode(3)).toBe("open_domain");
    expect(normalizeLocomoCategoryCode(4)).toBe("single_hop");
    expect(normalizeLocomoCategoryCode(5)).toBe("adversarial");
    expect(() => normalizeLocomoCategoryCode(9)).toThrow(
      "Unknown LoCoMo category code",
    );

    expect(parseLocomoSession("D1:3")).toBe(1);
    expect(parseLocomoSession("D12:7")).toBe(12);
    expect(() => parseLocomoSession("1:3")).toThrow("Malformed LoCoMo dia_id");
  });

  it("computes token-F1, exact match, and normalization deterministically", () => {
    expect(normalizeLocomoAnswer("  Room   301 ")).toBe("room 301");
    expect(locomoTokenF1("Seattle", "Seattle")).toBe(1);
    // Articles and punctuation are dropped before overlap is measured.
    expect(locomoTokenF1("The Seattle.", "seattle")).toBe(1);
    expect(locomoTokenF1("Boston", "Seattle")).toBe(0);
    // Both empty -> 1; exactly one empty -> 0 (SQuAD convention).
    expect(locomoTokenF1("", "")).toBe(1);
    expect(locomoTokenF1("anything", "")).toBe(0);
    expect(locomoExactMatch("Thai", "thai")).toBe(true);
    expect(locomoExactMatch("Thai food", "thai")).toBe(false);
  });

  it("scores answerable categories by F1 threshold and resists the adversarial bait", () => {
    const single = questionById("synthetic-single-hop-dog:1");
    expect(
      scoreLocomoAnswer({
        adversarialAnswer: single.adversarialAnswer,
        answer: "Pepper",
        goldAnswer: single.goldAnswer,
        matchMode: single.matchMode,
      }),
    ).toBe(true);
    expect(
      scoreLocomoAnswer({
        adversarialAnswer: single.adversarialAnswer,
        answer: "Rex",
        goldAnswer: single.goldAnswer,
        matchMode: single.matchMode,
      }),
    ).toBe(false);

    const adversarial = questionById("synthetic-adversarial-bowl:1");
    // The correct (non-tempting) answer passes.
    expect(
      scoreLocomoAnswer({
        adversarialAnswer: adversarial.adversarialAnswer,
        answer: "No",
        goldAnswer: adversarial.goldAnswer,
        matchMode: adversarial.matchMode,
      }),
    ).toBe(true);
    // Taking the bait ("Yes") fails.
    expect(
      scoreLocomoAnswer({
        adversarialAnswer: adversarial.adversarialAnswer,
        answer: "Yes",
        goldAnswer: adversarial.goldAnswer,
        matchMode: adversarial.matchMode,
      }),
    ).toBe(false);

    // Upstream adversarial roots often use "No information available" as gold.
    // The live prompt asks the model to say "I do not know" when context lacks
    // support; score that as a correct abstention, while still rejecting bait.
    expect(
      scoreLocomoAnswer({
        adversarialAnswer: "sunflowers",
        answer: "I do not know",
        goldAnswer: "No information available",
        matchMode: "adversarial_abstention",
      }),
    ).toBe(true);
    for (const answer of ["I do not know.", "I don't know", "I don’t know."]) {
      expect(
        scoreLocomoAnswer({
          adversarialAnswer: "sunflowers",
          answer,
          goldAnswer: "No information available",
          matchMode: "adversarial_abstention",
        }),
      ).toBe(true);
    }
    expect(
      scoreLocomoAnswer({
        adversarialAnswer: "sunflowers",
        answer: "sunflowers",
        goldAnswer: "No information available",
        matchMode: "adversarial_abstention",
      }),
    ).toBe(false);
  });

  it("summarizes per-category accuracy, recall, and noise", () => {
    const results: LocomoQuestionResult[] = [
      {
        answerCorrect: true,
        caseId: "synthetic-single-hop-dog",
        category: "single_hop",
        evidenceRecall: 1,
        noiseTurnCount: 0,
        questionId: "synthetic-single-hop-dog:1",
      },
      {
        answerCorrect: false,
        caseId: "synthetic-multi-hop-visit",
        category: "multi_hop",
        evidenceRecall: 0.5,
        noiseTurnCount: 2,
        questionId: "synthetic-multi-hop-visit:1",
      },
    ];
    const summary = summarizeLocomoResults(results);
    expect(summary.length).toBe(LOCOMO_QA_CATEGORIES.length);

    const single = summary.find((entry) => entry.category === "single_hop");
    expect(single?.answerAccuracy).toBe(1);
    expect(single?.questionCount).toBe(1);
    expect(single?.averageEvidenceRecall).toBe(1);

    const multi = summary.find((entry) => entry.category === "multi_hop");
    expect(multi?.answerAccuracy).toBe(0);
    expect(multi?.averageEvidenceRecall).toBe(0.5);
    expect(multi?.noiseTurnTotal).toBe(2);

    // Empty buckets report 0, never NaN.
    const adversarial = summary.find((entry) => entry.category === "adversarial");
    expect(adversarial?.questionCount).toBe(0);
    expect(adversarial?.answerAccuracy).toBe(0);
    expect(adversarial?.averageEvidenceRecall).toBe(0);
  });
});
