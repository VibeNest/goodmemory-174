import { describe, expect, it } from "bun:test";
import {
  planRecall,
  resolveRetrievalProfile,
  resolveRouterStrategy,
} from "../../src/recall/router";

describe("recall router", () => {
  it("defaults to general_chat when no retrieval profile is supplied", () => {
    expect(resolveRetrievalProfile()).toBe("general_chat");
  });

  it("defaults router strategy to auto and keeps a deterministic explanation", () => {
    const strategy = resolveRouterStrategy({});

    expect(strategy.resolvedStrategy).toBe("rules-only");
    expect(strategy.requestedStrategy).toBe("auto");
    expect(strategy.summary).toContain("auto routing");
    expect(strategy.semanticTieBreaking).toBe(false);
    expect(strategy.llmRefinement).toBe(false);
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
    expect(plan.strategy).toBe("rules-only");
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
    expect(plan.strategy).toBe("rules-only");
    expect(plan.sourcePriorities.includes("evidence")).toBe(true);
    expect(plan.intent).toBe("task_continuation");
  });

  it("keeps auto routing on rules-only for profile-style and procedural queries even when semantic search exists", () => {
    const rolePlan = planRecall({
      retrievalProfile: "general_chat",
      availability: {
        semanticSearch: true,
      },
      query: "What is my current role?",
      runtime: {
        hasWorkingMemory: false,
        hasJournal: false,
      },
    });
    const proceduralPlan = planRecall({
      retrievalProfile: "general_chat",
      availability: {
        semanticSearch: true,
      },
      query: "How should I respond to this user?",
      runtime: {
        hasWorkingMemory: false,
        hasJournal: false,
      },
    });

    expect(rolePlan.strategy).toBe("rules-only");
    expect(rolePlan.strategyExplanation.requestedStrategy).toBe("auto");
    expect(proceduralPlan.strategy).toBe("rules-only");
    expect(proceduralPlan.strategyExplanation.requestedStrategy).toBe("auto");
  });

  it("promotes auto routing to hybrid for reference and action-driving queries when semantic search exists", () => {
    const plan = planRecall({
      retrievalProfile: "general_chat",
      availability: {
        semanticSearch: true,
      },
      query: "Which runbook is the source of truth and what should I do next?",
      runtime: {
        hasWorkingMemory: false,
        hasJournal: false,
      },
    });

    expect(plan.strategy).toBe("hybrid");
    expect(plan.strategyExplanation.requestedStrategy).toBe("auto");
    expect(plan.strategyExplanation.resolvedStrategy).toBe("hybrid");
    expect(plan.strategyExplanation.semanticTieBreaking).toBe(true);
  });

  it("resolves hybrid strategy when semantic routing is available without changing rules-first priorities", () => {
    const plan = planRecall({
      retrievalProfile: "general_chat",
      strategy: "hybrid",
      availability: {
        semanticSearch: true,
      },
      query: "Which runbook should I use for the rollout?",
      runtime: {
        hasWorkingMemory: false,
        hasJournal: false,
      },
    });

    expect(plan.strategy).toBe("hybrid");
    expect(plan.strategyExplanation.semanticTieBreaking).toBe(true);
    expect(plan.strategyExplanation.llmRefinement).toBe(false);
    expect(plan.sourcePriorities.slice(0, 3)).toEqual([
      "profile",
      "feedback",
      "fact",
    ]);
  });

  it("falls back from llm-assisted to hybrid when llm routing is unavailable but semantic routing exists", () => {
    const plan = planRecall({
      retrievalProfile: "general_chat",
      strategy: "llm-assisted",
      availability: {
        semanticSearch: true,
        llmRouting: false,
      },
      query: "What should I do next and which source of truth applies?",
      runtime: {
        hasWorkingMemory: false,
        hasJournal: false,
      },
    });

    expect(plan.strategy).toBe("hybrid");
    expect(plan.strategyExplanation.requestedStrategy).toBe("llm-assisted");
    expect(plan.strategyExplanation.resolvedStrategy).toBe("hybrid");
    expect(plan.strategyExplanation.fallbackReason).toBe("llm_routing_unavailable");
    expect(plan.strategyExplanation.semanticTieBreaking).toBe(true);
    expect(plan.strategyExplanation.llmRefinement).toBe(false);
  });

  it("resolves llm-assisted when llm routing is available", () => {
    const plan = planRecall({
      retrievalProfile: "general_chat",
      strategy: "llm-assisted",
      availability: {
        semanticSearch: true,
        llmRouting: true,
      },
      query: "Which runbook is the source of truth and what should I do next?",
      runtime: {
        hasWorkingMemory: false,
        hasJournal: false,
      },
    });

    expect(plan.strategy).toBe("llm-assisted");
    expect(plan.strategyExplanation.requestedStrategy).toBe("llm-assisted");
    expect(plan.strategyExplanation.resolvedStrategy).toBe("llm-assisted");
    expect(plan.strategyExplanation.llmRefinement).toBe(true);
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
