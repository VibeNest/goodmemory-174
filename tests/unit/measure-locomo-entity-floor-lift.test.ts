import { describe, expect, it } from "bun:test";

import {
  type LocomoCase,
  LOCOMO_MATCH_MODES,
  type LocomoQuestion,
  type LocomoTurn,
} from "../../src/eval/locomo";
import {
  type EntityFloorLiftConfig,
  measureEntityFloorLift,
} from "../../scripts/measure-locomo-entity-floor-lift";

function turn(diaId: string, speaker: string, content: string): LocomoTurn {
  return { content, diaId, speaker };
}

function question(
  questionId: string,
  text: string,
  evidenceTurnIds: string[],
): LocomoQuestion {
  return {
    adversarialAnswer: null,
    category: "open_domain",
    evidenceTurnIds,
    goldAnswer: "n/a",
    matchMode: LOCOMO_MATCH_MODES[0]!,
    question: text,
    questionId,
  };
}

// Q1: the gold turn D1:1 shares only the rare entity "Skellig" with the query
// and is out-ranked lexically by D2:1 (which repeats expedition/happened/during),
// so a top-1 lexical floor MISSES it. The entity arm admits it via the rare
// entity. D3:1 also carries "Skellig" but is not gold -> one noise admission.
// Q2: a query with no entities whose gold the lexical floor already finds ->
// the entity arm is a no-op (safety).
const CASE: LocomoCase = {
  caseId: "fixture-conv-1",
  questions: [
    question("q1", "What happened during the Skellig expedition?", ["D1:1"]),
    question("q2", "expedition happened during what", ["D2:1"]),
  ],
  sourceConversation: "synthetic-entity-floor-lift",
  speakers: ["Alice", "Bob"],
  turns: [
    turn("D1:1", "Alice", "Alice fell ill on the Skellig climb"),
    turn("D2:1", "Bob", "The expedition happened during summer, expedition happened"),
    turn("D3:1", "Alice", "We discussed Skellig briefly"),
  ],
};

const CONFIG: EntityFloorLiftConfig = {
  baseTopK: 1,
  categories: ["open_domain"],
  gates: { minEntityOverlap: 2, rareEntityMaxDocFrequency: 2 },
  maxAdditions: 4,
};

describe("measureEntityFloorLift", () => {
  it("surfaces a gold turn the lexical floor missed, via a rare shared entity", () => {
    const report = measureEntityFloorLift([CASE], CONFIG);
    const open = report.categories.find((c) => c.category === "open_domain");
    expect(open).toBeDefined();
    // Q1 base misses D1:1 (recall 0), Q2 base finds D2:1 (recall 1) -> avg 0.5.
    expect(open!.baseAverageRecall).toBeCloseTo(0.5, 10);
    // Entity arm recovers D1:1 -> both fully retrieved -> avg 1.0.
    expect(open!.augmentedAverageRecall).toBeCloseTo(1.0, 10);
    expect(open!.fullyRetrievedGain).toBe(1);
    // Only D3:1 (Skellig, non-gold) was admitted as noise.
    expect(open!.addedNoiseTurns).toBe(1);
    expect(open!.recallGainPer100Noise).toBeCloseTo(100, 10);
    expect(open!.scoredQuestionCount).toBe(2);
  });

  it("aggregates the overall recall gain and added noise", () => {
    const report = measureEntityFloorLift([CASE], CONFIG);
    expect(report.overall.recallGain).toBeCloseTo(1.0, 10);
    expect(report.overall.fullyRetrievedGain).toBe(1);
    expect(report.overall.addedNoiseTurns).toBe(1);
    expect(report.overall.scoredQuestionCount).toBe(2);
  });

  it("is a no-op for a query with no entities", () => {
    // Restrict scope to Q2 only by using a case whose single question has no
    // entities; the entity arm cannot admit anything.
    const q2Only: LocomoCase = { ...CASE, questions: [CASE.questions[1]!] };
    const report = measureEntityFloorLift([q2Only], CONFIG);
    const open = report.categories.find((c) => c.category === "open_domain");
    expect(open!.recallGainPer100Noise).toBeNull();
    expect(open!.addedNoiseTurns).toBe(0);
    expect(open!.fullyRetrievedGain).toBe(0);
  });
});
