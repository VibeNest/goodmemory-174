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
    expect(plan.sourcePriorities.includes("evidence")).toBe(false);
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

    expect(plan.sourcePriorities.slice(0, 5)).toEqual([
      "working_memory",
      "session_journal",
      "session_archive",
      "episode",
      "fact",
    ]);
    expect(plan.sourcePriorities.includes("evidence")).toBe(true);
    expect(plan.intent).toBe("task_continuation");
  });

  it("detects Chinese continuation intent through the language service", () => {
    const plan = planRecall({
      retrievalProfile: "general_chat",
      query: "继续上次的运行时重构。",
      locale: "zh-CN",
      runtime: {
        hasWorkingMemory: true,
        hasJournal: true,
      },
    });

    expect(plan.intent).toBe("task_continuation");
    expect(plan.sourcePriorities.slice(0, 5)).toEqual([
      "working_memory",
      "session_journal",
      "session_archive",
      "episode",
      "fact",
    ]);
    expect(plan.sourcePriorities.includes("evidence")).toBe(true);
  });

  it("plans role queries with action-driving support as separate slots", () => {
    const plan = planRecall({
      retrievalProfile: "general_chat",
      query: "What is my current role, and what should I do next for the migration rollout?",
      runtime: {
        hasWorkingMemory: false,
        hasJournal: false,
      },
    });

    expect(plan.requestedSlots).toEqual(["role"]);
    expect(plan.supportSlots).toEqual(["project_state_support"]);
    expect(plan.actionDriving).toBe(true);
  });

  it("plans reference queries with next-step support without widening primary slots", () => {
    const plan = planRecall({
      retrievalProfile: "general_chat",
      query: "Which runbook is the source of truth, and what should I do next?",
      runtime: {
        hasWorkingMemory: false,
        hasJournal: false,
      },
    });

    expect(plan.requestedSlots).toEqual(["reference"]);
    expect(plan.supportSlots).toEqual(["project_state_support"]);
    expect(plan.referenceSeeking).toBe(true);
    expect(plan.actionDriving).toBe(true);
    expect(plan.sourcePriorities.includes("evidence")).toBe(true);
  });

  it("plans Chinese blocker queries as blocker-only recalls", () => {
    const plan = planRecall({
      retrievalProfile: "general_chat",
      query: "当前阻塞是什么？",
      locale: "zh-CN",
      runtime: {
        hasWorkingMemory: false,
        hasJournal: false,
      },
    });

    expect(plan.requestedSlots).toEqual(["blocker"]);
    expect(plan.supportSlots).toEqual([]);
    expect(plan.actionDriving).toBe(false);
    expect(plan.sourcePriorities.includes("evidence")).toBe(false);
  });
});
