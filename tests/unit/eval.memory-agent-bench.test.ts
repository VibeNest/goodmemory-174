import { describe, expect, it } from "bun:test";
import {
  buildMemoryAgentBenchSmokeCases,
  exactMatch,
  MEMORY_AGENT_BENCH_COMPETENCIES,
  type MemoryAgentBenchQuestion,
  type MemoryAgentBenchQuestionResult,
  normalizeMemoryAgentBenchAnswer,
  scoreMemoryAgentBenchAnswer,
  substringExactMatch,
  summarizeMemoryAgentBenchResults,
} from "../../src/eval/memoryAgentBench";

function questionById(id: string): MemoryAgentBenchQuestion {
  for (const testCase of buildMemoryAgentBenchSmokeCases()) {
    for (const question of testCase.questions) {
      if (question.questionId === id) {
        return question;
      }
    }
  }
  throw new Error(`smoke question not found: ${id}`);
}

describe("MemoryAgentBench smoke contract", () => {
  it("provides one synthetic smoke case per competency", () => {
    const cases = buildMemoryAgentBenchSmokeCases();
    const competencies = cases.map((testCase) => testCase.competency).sort();
    expect(competencies).toEqual([...MEMORY_AGENT_BENCH_COMPETENCIES].sort());

    for (const testCase of cases) {
      expect(testCase.questions.length).toBeGreaterThan(0);
      const chunkIds = new Set(testCase.chunks.map((chunk) => chunk.id));
      for (const question of testCase.questions) {
        expect(question.competency).toBe(testCase.competency);
        for (const evidenceId of question.evidenceChunkIds) {
          expect(chunkIds.has(evidenceId)).toBe(true);
        }
        for (const staleId of question.staleChunkIds) {
          expect(chunkIds.has(staleId)).toBe(true);
        }
      }
    }
  });

  it("scores substring_exact_match and exact_match deterministically", () => {
    expect(normalizeMemoryAgentBenchAnswer("  Room   301 ")).toBe("room 301");
    expect(substringExactMatch("The launch is in Room 301 today", "Room 301")).toBe(
      true,
    );
    expect(substringExactMatch("It is in room 118", "Room 301")).toBe(false);
    expect(exactMatch("urgent", "Urgent")).toBe(true);
    expect(exactMatch("urgent now", "urgent")).toBe(false);
    expect(substringExactMatch("anything at all", "")).toBe(false);
  });

  it("accepts each smoke case gold answer and rejects the stale or wrong one", () => {
    const cr = questionById("synthetic-cr-travel-budget:1");
    expect(
      scoreMemoryAgentBenchAnswer({
        answer: "The current quarterly travel budget is $8,000.",
        goldAnswer: cr.goldAnswer,
        matchMode: cr.matchMode,
      }),
    ).toBe(true);
    // Conflict resolution must reject the superseded value.
    expect(
      scoreMemoryAgentBenchAnswer({
        answer: "The travel budget is $5,000.",
        goldAnswer: cr.goldAnswer,
        matchMode: cr.matchMode,
      }),
    ).toBe(false);

    const lru = questionById("synthetic-lru-badge-holder:1");
    expect(
      scoreMemoryAgentBenchAnswer({
        answer: "Carol",
        goldAnswer: lru.goldAnswer,
        matchMode: lru.matchMode,
      }),
    ).toBe(true);
    expect(
      scoreMemoryAgentBenchAnswer({
        answer: "Bob",
        goldAnswer: lru.goldAnswer,
        matchMode: lru.matchMode,
      }),
    ).toBe(false);

    const ttl = questionById("synthetic-ttl-priority-rule:1");
    expect(
      scoreMemoryAgentBenchAnswer({
        answer: "urgent",
        goldAnswer: ttl.goldAnswer,
        matchMode: ttl.matchMode,
      }),
    ).toBe(true);
    expect(
      scoreMemoryAgentBenchAnswer({
        answer: "low",
        goldAnswer: ttl.goldAnswer,
        matchMode: ttl.matchMode,
      }),
    ).toBe(false);

    const ar = questionById("synthetic-ar-launch-room:1");
    expect(
      scoreMemoryAgentBenchAnswer({
        answer: "It is scheduled in Room 301.",
        goldAnswer: ar.goldAnswer,
        matchMode: ar.matchMode,
      }),
    ).toBe(true);
    expect(
      scoreMemoryAgentBenchAnswer({
        answer: "It is in Room 118.",
        goldAnswer: ar.goldAnswer,
        matchMode: ar.matchMode,
      }),
    ).toBe(false);
  });

  it("summarizes per-competency accuracy, recall, noise, and stale selection", () => {
    const results: MemoryAgentBenchQuestionResult[] = [
      {
        answerCorrect: true,
        caseId: "synthetic-ar-launch-room",
        competency: "AR",
        evidenceRecall: 1,
        noiseChunkCount: 0,
        questionId: "synthetic-ar-launch-room:1",
        staleChunkSelected: false,
      },
      {
        answerCorrect: false,
        caseId: "synthetic-cr-travel-budget",
        competency: "CR",
        evidenceRecall: 0.5,
        noiseChunkCount: 2,
        questionId: "synthetic-cr-travel-budget:1",
        staleChunkSelected: true,
      },
    ];
    const summary = summarizeMemoryAgentBenchResults(results);
    expect(summary.length).toBe(MEMORY_AGENT_BENCH_COMPETENCIES.length);

    const ar = summary.find((entry) => entry.competency === "AR");
    expect(ar?.answerAccuracy).toBe(1);
    expect(ar?.questionCount).toBe(1);
    expect(ar?.averageEvidenceRecall).toBe(1);

    const cr = summary.find((entry) => entry.competency === "CR");
    expect(cr?.answerAccuracy).toBe(0);
    expect(cr?.staleSelectedCount).toBe(1);
    expect(cr?.noiseChunkTotal).toBe(2);

    // Empty buckets report 0, never NaN.
    const ttl = summary.find((entry) => entry.competency === "TTL");
    expect(ttl?.questionCount).toBe(0);
    expect(ttl?.answerAccuracy).toBe(0);
    expect(ttl?.averageEvidenceRecall).toBe(0);
  });
});
