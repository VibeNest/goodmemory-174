import { describe, expect, it } from "bun:test";

import {
  buildLongMemEvalOfficialJudgePrompt,
  isLongMemEvalOfficialAbstentionCase,
  LONGMEMEVAL_OFFICIAL_SCORER_IDENTITY,
  parseLongMemEvalOfficialJudgeVerdict,
} from "../../src/eval/longmemevalOfficialScorer";

describe("LongMemEval official scorer", () => {
  it("pins the upstream scorer source", () => {
    expect(LONGMEMEVAL_OFFICIAL_SCORER_IDENTITY).toEqual({
      commit: "9e0b455f4ef0e2ab8f2e582289761153549043fc",
      fileSha256:
        "ecce9c4c79dc89d99534ac17b383a5cbb5b9f0c69ee98adaf0684742e3d95251",
      metric: "longmemeval-official-qa-accuracy-v1",
      path: "src/evaluation/evaluate_qa.py",
      repository: "https://github.com/xiaowu0162/LongMemEval",
    });
  });

  it("routes temporal, update, preference, and default question types", () => {
    const shared = {
      candidateAnswer: "candidate",
      expectedAnswer: "gold",
      question: "question",
    };

    expect(buildLongMemEvalOfficialJudgePrompt({
      ...shared,
      questionType: "temporal-reasoning",
    })).toContain("do not penalize off-by-one errors");
    expect(buildLongMemEvalOfficialJudgePrompt({
      ...shared,
      questionType: "knowledge-update",
    })).toContain("some previous information along with an updated answer");
    expect(buildLongMemEvalOfficialJudgePrompt({
      ...shared,
      questionType: "single-session-preference",
    })).toContain("Rubric: gold");
    expect(buildLongMemEvalOfficialJudgePrompt({
      ...shared,
      questionType: "multi-session",
    })).toContain("Correct Answer: gold");
  });

  it("uses the official abstention suffix and prompt", () => {
    expect(isLongMemEvalOfficialAbstentionCase("sample_abs")).toBe(true);
    expect(isLongMemEvalOfficialAbstentionCase("sample")).toBe(false);
    expect(buildLongMemEvalOfficialJudgePrompt({
      abstention: true,
      candidateAnswer: "It cannot be determined.",
      expectedAnswer: "No supporting evidence.",
      question: "What happened?",
      questionType: "multi-session",
    })).toContain("Does the model correctly identify the question as unanswerable?");
  });

  it("matches the upstream yes-substring verdict rule", () => {
    expect(parseLongMemEvalOfficialJudgeVerdict("Yes")).toBe(true);
    expect(parseLongMemEvalOfficialJudgeVerdict("The answer is yes.")).toBe(true);
    expect(parseLongMemEvalOfficialJudgeVerdict("No")).toBe(false);
  });

  it("interpolates upstream template fields exactly once", () => {
    const prompt = buildLongMemEvalOfficialJudgePrompt({
      candidateAnswer: "candidate {q}",
      expectedAnswer: "gold {r}",
      question: "literal {a}",
      questionType: "multi-session",
    });

    expect(prompt).toContain("Question: literal {a}");
    expect(prompt).toContain("Correct Answer: gold {r}");
    expect(prompt).toContain("Model Response: candidate {q}");
  });

  it("rejects unsupported question types instead of silently changing protocol", () => {
    expect(() => buildLongMemEvalOfficialJudgePrompt({
      candidateAnswer: "candidate",
      expectedAnswer: "gold",
      question: "question",
      questionType: "new-upstream-type",
    })).toThrow("Unsupported LongMemEval question type");
  });
});
