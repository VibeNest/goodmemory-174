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

  it("does not route mentor role descriptions as identity role slots", () => {
    const plan = planRecall({
      retrievalProfile: "general_chat",
      query: "What was the age and role of the mentor who suggested I attend the workshop?",
      runtime: {
        hasWorkingMemory: false,
        hasJournal: false,
      },
    });

    expect(plan.requestedSlots).toEqual([]);
  });

  it("does not route role-did-the-mentor-play wording as an identity role slot", () => {
    const plan = planRecall({
      retrievalProfile: "general_chat",
      query: "How did I come to consider attending that event, and what role did my mentor play in influencing my decision and preparation?",
      runtime: {
        hasWorkingMemory: false,
        hasJournal: false,
      },
    });

    expect(plan.requestedSlots).toEqual([]);
  });

  it("does not route guide-my-essay-writing wording as a reference slot", () => {
    const plan = planRecall({
      retrievalProfile: "general_chat",
      query: "What steps did I plan to take to prepare for and follow up on my meeting with the person who agreed to guide my essay writing?",
      runtime: {
        hasWorkingMemory: false,
        hasJournal: false,
      },
    });

    expect(plan.requestedSlots).toEqual([]);
  });

  it("does not route support verification questions as open-loop slots", () => {
    const plan = planRecall({
      retrievalProfile: "general_chat",
      query: "I got a message that I need to verify my identity; what do I do?",
      runtime: {
        hasWorkingMemory: false,
        hasJournal: false,
      },
    });

    expect(plan.requestedSlots).toEqual([]);
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

// The autoStrategyBias seam exists for retrieval.preset "recommended": when
// the preset is active and an embedding resolves, "auto" routing biases to
// hybrid so the semantic candidate union fires without a per-call strategy.
// Explicit strategies bypass the auto branch, so per-call control is intact,
// and the bias is inert unless set (bare semanticCandidates users unchanged).
describe("recall router auto-strategy bias", () => {
  const signalsOff = {
    actionDriving: false,
    continuation: false,
    referenceSeeking: false,
    requestedSlots: [],
    retrievalProfile: "general_chat" as const,
    supportSlots: [],
  };

  it("biases auto to hybrid with no signals when semantic search is available", () => {
    const strategy = resolveRouterStrategy({
      autoSignals: signalsOff,
      autoStrategyBias: "hybrid",
      availability: { semanticSearch: true },
    });

    expect(strategy.requestedStrategy).toBe("auto");
    expect(strategy.resolvedStrategy).toBe("hybrid");
    expect(strategy.semanticTieBreaking).toBe(true);
    expect(strategy.summary).toContain("recommended retrieval preset");
  });

  it("keeps rules-only without the bias (existing behavior)", () => {
    const strategy = resolveRouterStrategy({
      autoSignals: signalsOff,
      availability: { semanticSearch: true },
    });

    expect(strategy.resolvedStrategy).toBe("rules-only");
  });

  it("preserves the signal summary verbatim when signals fire alongside the bias", () => {
    const withSignals = resolveRouterStrategy({
      autoSignals: { ...signalsOff, retrievalProfile: "coding_agent" },
      availability: { semanticSearch: true },
    });
    const withBiasAndSignals = resolveRouterStrategy({
      autoSignals: { ...signalsOff, retrievalProfile: "coding_agent" },
      autoStrategyBias: "hybrid",
      availability: { semanticSearch: true },
    });

    expect(withBiasAndSignals.resolvedStrategy).toBe("hybrid");
    expect(withBiasAndSignals.summary).toBe(withSignals.summary);
  });

  it("stays rules-only when semantic search is unavailable", () => {
    const strategy = resolveRouterStrategy({
      autoSignals: signalsOff,
      autoStrategyBias: "hybrid",
      availability: { semanticSearch: false },
    });

    expect(strategy.resolvedStrategy).toBe("rules-only");
  });

  it("never overrides an explicit strategy", () => {
    const strategy = resolveRouterStrategy({
      autoSignals: signalsOff,
      autoStrategyBias: "hybrid",
      availability: { semanticSearch: true },
      strategy: "rules-only",
    });

    expect(strategy.resolvedStrategy).toBe("rules-only");
  });

  it("threads through planRecall", () => {
    const plan = planRecall({
      autoStrategyBias: "hybrid",
      availability: { semanticSearch: true },
      query: "What is my current favorite tea?",
      retrievalProfile: "general_chat",
      runtime: {
        hasJournal: false,
        hasWorkingMemory: false,
      },
    });

    expect(plan.strategy).toBe("hybrid");
  });
});

// Silent degradation: when semantic recall was configured/requested but did not
// run (recall fell to the lexical floor), the router flags it so consumers can
// see they are on the floor rather than getting a silent bad result.
describe("recall router degradation warnings", () => {
  const signalsOff = {
    actionDriving: false,
    continuation: false,
    referenceSeeking: false,
    requestedSlots: [],
    retrievalProfile: "general_chat" as const,
    supportSlots: [],
  };

  it("warns semantic_recall_inactive when the preset bias wants hybrid but semantic search is unavailable", () => {
    const strategy = resolveRouterStrategy({
      autoSignals: signalsOff,
      autoStrategyBias: "hybrid",
      availability: { semanticSearch: false },
    });

    expect(strategy.resolvedStrategy).toBe("rules-only");
    expect(strategy.warnings ?? []).toContain("semantic_recall_inactive");
  });

  it("warns semantic_recall_inactive when explicit hybrid falls back to rules-only", () => {
    const strategy = resolveRouterStrategy({
      autoSignals: signalsOff,
      availability: { semanticSearch: false },
      strategy: "hybrid",
    });

    expect(strategy.resolvedStrategy).toBe("rules-only");
    expect(strategy.fallbackReason).toBe("semantic_search_unavailable");
    expect(strategy.warnings ?? []).toContain("semantic_recall_inactive");
  });

  it("does NOT warn on a correctly-configured rules-only floor (no bias, no request)", () => {
    const strategy = resolveRouterStrategy({
      autoSignals: signalsOff,
      availability: { semanticSearch: false },
    });

    expect(strategy.resolvedStrategy).toBe("rules-only");
    expect(strategy.warnings ?? []).toEqual([]);
  });

  it("does NOT warn when the preset bias resolves to hybrid", () => {
    const strategy = resolveRouterStrategy({
      autoSignals: signalsOff,
      autoStrategyBias: "hybrid",
      availability: { semanticSearch: true },
    });

    expect(strategy.resolvedStrategy).toBe("hybrid");
    expect(strategy.warnings ?? []).toEqual([]);
  });
});
