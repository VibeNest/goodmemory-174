import { describe, expect, it } from "bun:test";
import {
  planRecall,
  resolveRetrievalProfile,
} from "../../src/recall/router";

describe("recall router", () => {
  it("defaults to general_chat when no retrieval profile is supplied", () => {
    expect(resolveRetrievalProfile()).toBe("general_chat");
  });

  it("prioritizes profile and procedural memory for general chat", () => {
    const plan = planRecall({
      retrievalProfile: "general_chat",
      query: "How should I respond to this user?",
      runtime: {
        hasWorkingMemory: true,
        hasJournal: true,
      },
    });

    expect(plan.sourcePriorities.slice(0, 3)).toEqual([
      "profile",
      "feedback",
      "fact",
    ]);
  });

  it("prioritizes runtime continuity for coding-agent recalls", () => {
    const plan = planRecall({
      retrievalProfile: "coding_agent",
      query: "Continue the runtime refactor from last time.",
      runtime: {
        hasWorkingMemory: true,
        hasJournal: true,
      },
    });

    expect(plan.sourcePriorities.slice(0, 4)).toEqual([
      "working_memory",
      "session_journal",
      "episode",
      "fact",
    ]);
    expect(plan.intent).toBe("task_continuation");
  });
});
