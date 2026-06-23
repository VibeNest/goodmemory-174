import { describe, expect, it } from "bun:test";
import {
  buildAnswerEvidencePack,
  inferAnswerOperation,
} from "../../src/answer/evidencePack";

describe("answer evidence pack", () => {
  it("infers the answer operation from question phrasing only", () => {
    expect(inferAnswerOperation("How many cards do I have in total?")).toBe(
      "count",
    );
    expect(inferAnswerOperation("What did I do before launch?")).toBe("order");
    expect(inferAnswerOperation("What is the dog's name?")).toBe("general");
  });

  it("builds a source-ordered, deduplicated, timestamped pack", () => {
    const pack = buildAnswerEvidencePack({
      question: "What is the dog's name?",
      turns: [
        { sourceId: 4, content: "later", role: "user", timeAnchor: "Mar" },
        { sourceId: 2, content: "earlier", role: "user", timeAnchor: "Jan" },
        { sourceId: 2, content: "dup", role: "user", timeAnchor: "Jan" },
      ],
    });
    const earlierIdx = pack.indexOf("#2");
    const laterIdx = pack.indexOf("#4");
    expect(earlierIdx).toBeGreaterThan(-1);
    expect(laterIdx).toBeGreaterThan(earlierIdx);
    expect(pack).toContain("[t=Jan | #2 | user] earlier");
    expect(pack).toContain("[t=Mar | #4 | user] later");
    expect(pack.match(/#2/g)?.length).toBe(1);
    expect(pack).toContain("the latest entry is the current value");
  });

  it("adds count framing only for count questions", () => {
    const count = buildAnswerEvidencePack({
      question: "How many times did I submit?",
      turns: [{ sourceId: 1, content: "x", role: "user", timeAnchor: "Jan" }],
    });
    expect(count).toContain("count or total");
    const general = buildAnswerEvidencePack({
      question: "What is X?",
      turns: [{ sourceId: 1, content: "x", role: "user", timeAnchor: "Jan" }],
    });
    expect(general).not.toContain("count or total");
    expect(general).not.toContain("order or sequence");
  });

  it("adds order framing for order/sequence questions", () => {
    const order = buildAnswerEvidencePack({
      question: "In what order did I build the features?",
      turns: [{ sourceId: 1, content: "x", role: "user", timeAnchor: "Jan" }],
    });
    expect(order).toContain("order or sequence");
  });

  it("handles empty evidence", () => {
    const pack = buildAnswerEvidencePack({
      question: "What is X?",
      turns: [],
    });
    expect(pack).toContain("(no evidence)");
  });
});
