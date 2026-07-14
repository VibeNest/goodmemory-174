import { describe, expect, it } from "bun:test";
import {
  extractMemoryAgentBenchScoredAnswer,
  scoreMemoryAgentBenchAnswer,
} from "../../src/eval/memoryAgentBench";
import {
  buildMemoryAgentBenchCompetencyPrompt,
  resolveMemoryAgentBenchAnswerSystem,
} from "../../scripts/run-phase-64-memory-agent-bench-smoke";

describe("MAB scored-answer extraction (JSON-tolerant)", () => {
  it("pulls the answer field from a JSON envelope (LRU detective_qa format)", () => {
    expect(
      extractMemoryAgentBenchScoredAnswer('{"answer": "C. The Brandt couple", "reasoning": "x"}'),
    ).toBe("C. The Brandt couple");
  });

  it("scores a JSON-wrapped option correct under exact_match", () => {
    expect(
      scoreMemoryAgentBenchAnswer({
        answer: '{"answer":"C. The Brandt couple","reasoning":"because"}',
        goldAnswer: "C. The Brandt couple",
        matchMode: "exact_match",
      }),
    ).toBe(true);
  });

  it("leaves a plain answer untouched and still strips reasoning", () => {
    expect(extractMemoryAgentBenchScoredAnswer("28")).toBe("28");
    expect(extractMemoryAgentBenchScoredAnswer("<think>let me see</think>\n28")).toBe("28");
  });

  it("does not break substring scoring for a plain AR answer", () => {
    expect(
      scoreMemoryAgentBenchAnswer({
        answer: "Miss Rosie criticized Kayla's late husband.",
        goldAnswer: "Miss Rosie criticized Kayla's late husband.",
        matchMode: "substring_exact_match",
      }),
    ).toBe(true);
  });
});

describe("MAB per-competency answer harness", () => {
  it("routes each competency to a distinct system prompt; CR keeps the general one", () => {
    const ar = resolveMemoryAgentBenchAnswerSystem("AR");
    const ttl = resolveMemoryAgentBenchAnswerSystem("TTL");
    const lru = resolveMemoryAgentBenchAnswerSystem("LRU");
    const cr = resolveMemoryAgentBenchAnswerSystem("CR");
    expect(new Set([ar, ttl, lru, cr]).size).toBe(4);
    expect(ttl).toContain("label number");
    expect(lru).toContain("full correct option");
    expect(cr).toContain("answer questions using only the supplied memory context");
    expect(cr).toContain("authoritative even when it conflicts with world knowledge");
  });

  it("builds format-strict prompts for AR/TTL/LRU and the general prompt for CR", () => {
    const args = { memoryContext: "ctx", question: "Q?" };
    expect(buildMemoryAgentBenchCompetencyPrompt({ ...args, competency: "AR" })).toContain(
      "copied verbatim from the list",
    );
    expect(buildMemoryAgentBenchCompetencyPrompt({ ...args, competency: "TTL" })).toContain(
      "label number of the demonstration",
    );
    expect(buildMemoryAgentBenchCompetencyPrompt({ ...args, competency: "LRU" })).toContain(
      "full correct option, copied verbatim",
    );
    expect(buildMemoryAgentBenchCompetencyPrompt({ ...args, competency: "CR" })).toContain(
      "Return only the answer",
    );
  });
});
