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
    expect(
      inferAnswerOperation("What is my current database after the update?"),
    ).toBe("conflict_update");
    expect(inferAnswerOperation("What is the dog's name?")).toBe("general");
  });

  it("uses optional question type metadata without expected-answer rules", () => {
    expect(
      inferAnswerOperation(
        "How many weeks did it take after planning?",
        "temporal_reasoning",
      ),
    ).toBe("count");
    expect(
      inferAnswerOperation("Which topics did I mention?", "event_ordering"),
    ).toBe("order");
    expect(
      inferAnswerOperation("Did I do this?", "contradiction_resolution"),
    ).toBe("contradiction");
    expect(inferAnswerOperation("Did I do this?", "CR")).toBe(
      "conflict_update",
    );
    expect(inferAnswerOperation("What changed?", "knowledge_update")).toBe(
      "conflict_update",
    );
    expect(inferAnswerOperation("When did it happen?", "temporal")).toBe(
      "order",
    );
    expect(inferAnswerOperation("Summarize the work", "summarization")).toBe(
      "summary",
    );
    expect(
      inferAnswerOperation(
        "How did my publishing plan evolve?",
        "multi_session_reasoning",
      ),
    ).toBe("multi_session");
    expect(
      inferAnswerOperation(
        "What should the answer include?",
        "instruction_following",
      ),
    ).toBe("instruction");
  });

  it("builds a source-ordered, deduplicated, timestamped pack", () => {
    const pack = buildAnswerEvidencePack({
      question: "What is the dog's name?",
      turns: [
        {
          sourceId: 4,
          orderKey: 4,
          content: "later",
          role: "user",
          timeAnchor: "Mar",
        },
        {
          sourceId: 2,
          orderKey: 2,
          content: "earlier",
          role: "user",
          timeAnchor: "Jan",
        },
        {
          sourceId: 2,
          orderKey: 2,
          content: "dup",
          role: "user",
          timeAnchor: "Jan",
        },
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

  it("orders evidence by explicit orderKey rather than source identity", () => {
    const pack = buildAnswerEvidencePack({
      question: "What is current?",
      turns: [
        {
          sourceId: 2,
          orderKey: 20,
          content: "later by order key",
          role: "user",
          timeAnchor: "Mar",
        },
        {
          sourceId: 99,
          orderKey: 10,
          content: "earlier by order key",
          role: "user",
          timeAnchor: "Jan",
        },
      ],
    });
    expect(pack.indexOf("#99")).toBeLessThan(pack.indexOf("#2"));
  });

  it("adds count framing only for count questions", () => {
    const count = buildAnswerEvidencePack({
      question: "How many times did I submit?",
      turns: [
        {
          sourceId: 1,
          orderKey: 1,
          content: "x",
          role: "user",
          timeAnchor: "Jan",
        },
      ],
    });
    expect(count).toContain("count or total");
    expect(count).toContain("Value-bearing facts for counting:");
    expect(count).toContain("1. [t=Jan | #1 | user] x");
    expect(count).toContain("Count only distinct requested items");
    expect(count).toContain("Show the final count and name the counted items");
    expect(count).toContain("Do not count individual role names as separate security features");
    expect(count).toContain("When the question asks for concerns");
    expect(count).toContain("retry behavior");
    expect(count).toContain("group rapid or consecutive calls");
    const general = buildAnswerEvidencePack({
      question: "What is X?",
      turns: [
        {
          sourceId: 1,
          orderKey: 1,
          content: "x",
          role: "user",
          timeAnchor: "Jan",
        },
      ],
    });
    expect(general).not.toContain("count or total");
    expect(general).not.toContain("order or sequence");
  });

  it("adds order framing for order/sequence questions", () => {
    const order = buildAnswerEvidencePack({
      question:
        "In what order did I build the features? Mention ONLY and ONLY five items.",
      questionType: "event_ordering",
      turns: [
        {
          sourceId: 1,
          orderKey: 1,
          content: "x",
          role: "user",
          timeAnchor: "Jan",
        },
      ],
    });
    expect(order).toContain("order or sequence");
    expect(order).toContain("Timeline evidence:");
    expect(order).toContain("1. [t=Jan | #1 | user] x");
    expect(order).toContain("Do not reorder evidence by topical similarity");
    expect(order).toContain("Return exactly 5 numbered items");
    expect(order).toContain("Phrase each item as the aspect or topic");
    expect(order).toContain("Prefer one milestone per source entry");
    expect(order).toContain("split later multi-topic entries before splitting earlier setup");
    expect(order).toContain("Keep paired tasks joined by the same sprint/focus phrase");
    expect(order).toContain("use the concrete implementation/action");
    expect(order).toContain("prefer high-level user-stated aspects");
    expect(order).toContain("deployment/configuration plus testing or performance themes");
  });

  it("adds current-value framing for update/conflict questions", () => {
    const pack = buildAnswerEvidencePack({
      question: "What is my current database after the update?",
      questionType: "knowledge_update",
      turns: [
        {
          sourceId: 1,
          orderKey: 1,
          content: "I used SQLite first.",
          role: "user",
          timeAnchor: "Jan",
        },
        {
          sourceId: 2,
          orderKey: 2,
          content: "I switched the durable store to Postgres.",
          role: "user",
          timeAnchor: "Feb",
        },
      ],
    });
    expect(pack).toContain("Current-value resolution:");
    expect(pack).toContain("Earlier entries are history");
    expect(pack).toContain("latest supported value as current");
  });

  it("adds contradiction framing that forbids resolving yes/no conflicts", () => {
    const pack = buildAnswerEvidencePack({
      question: "Have I integrated Flask-Login?",
      questionType: "contradiction_resolution",
      turns: [
        {
          sourceId: 1,
          orderKey: 1,
          content: "I have never integrated Flask-Login.",
          role: "user",
          timeAnchor: "Jan",
        },
        {
          sourceId: 2,
          orderKey: 2,
          content: "I integrated Flask-Login v0.6.2 for session management.",
          role: "user",
          timeAnchor: "Feb",
        },
      ],
    });
    expect(pack).toContain("Contradiction resolution:");
    expect(pack).toContain("Contradiction evidence guide:");
    expect(pack).toContain("Potential denial/no side:");
    expect(pack).toContain("Potential affirmative/done side:");
    expect(pack).toContain("Do not answer yes or no first");
    expect(pack).toContain("I notice you've mentioned contradictory information");
    expect(pack).toContain("ask for clarification");
    expect(pack).not.toContain("latest supported value as current");
  });

  it("adds multi-session facet framing for cross-session reasoning", () => {
    const pack = buildAnswerEvidencePack({
      question: "How did my publishing plan evolve?",
      questionType: "multi_session_reasoning",
      turns: [
        {
          sourceId: 1,
          orderKey: 1,
          content: "I started with an outline and a B- target.",
          role: "user",
          timeAnchor: "Jan",
        },
        {
          sourceId: 2,
          orderKey: 2,
          content: "I later focused on journal feedback and revisions.",
          role: "user",
          timeAnchor: "Feb",
        },
      ],
    });
    expect(pack).toContain("Multi-session reasoning:");
    expect(pack).toContain("Cross-session facets:");
    expect(pack).toContain("Synthesize across all listed facets");
    expect(pack).toContain("Do not answer from only the latest entry");
  });

  it("adds standing/latest constraint framing for instruction questions", () => {
    const pack = buildAnswerEvidencePack({
      question: "What should the answer include?",
      questionType: "instruction_following",
      turns: [
        {
          sourceId: 1,
          orderKey: 1,
          content: "Always include library names and versions.",
          role: "user",
          timeAnchor: "Jan",
        },
        {
          sourceId: 2,
          orderKey: 2,
          content: "Also explain why each library is used.",
          role: "user",
          timeAnchor: "Feb",
        },
      ],
    });
    expect(pack).toContain("Instruction-following constraints:");
    expect(pack).toContain("standing instruction");
    expect(pack).toContain("latest companion");
    expect(pack).toContain("Ignore retrieved turns that do not constrain the requested response");
    expect(pack).toContain("answer with response requirements");
    expect(pack).toContain("do not just fulfill the underlying request");
    expect(pack).toContain("Return a requirements sentence such as: Response should include");
  });

  it("handles empty evidence", () => {
    const pack = buildAnswerEvidencePack({
      question: "What is X?",
      turns: [],
    });
    expect(pack).toContain("(no evidence)");
  });
});
