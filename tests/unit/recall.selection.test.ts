import { describe, expect, it } from "bun:test";
import {
  createFeedbackMemory,
  createFactMemory,
  createReferenceMemory,
} from "../../src/domain/records";
import { createLanguageService } from "../../src/language";
import type { RoutingDecision } from "../../src/recall/router";
import {
  selectFeedbackForProfile,
  selectFacts,
  selectReferences,
} from "../../src/recall/selection";

const TIMESTAMP = "2026-01-10T00:00:00.000Z";
const SOURCE = {
  method: "explicit" as const,
  extractedAt: TIMESTAMP,
};

function buildRoutingDecision(
  overrides: Partial<RoutingDecision>,
): RoutingDecision {
  return {
    retrievalProfile: "general_chat",
    intent: "general_assistance",
    strategy: "rules-only",
    strategyExplanation: {
      requestedStrategy: "rules-only",
      resolvedStrategy: "rules-only",
      summary: "rules-only",
      hardFloor: "lexical_runtime_procedural_priors",
      semanticTieBreaking: false,
      llmRefinement: false,
    },
    sourcePriorities: ["profile", "fact", "feedback"],
    requestedSlots: [],
    supportSlots: [],
    actionDriving: false,
    referenceSeeking: false,
    continuation: false,
    ...overrides,
  };
}

describe("recall selection", () => {
  it("selects the blocker fact for blocker slot queries", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-blocker",
        userId: "user-1",
        category: "project",
        content: "The runtime rollout is blocked by legal signoff.",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-focus",
        userId: "user-1",
        category: "project",
        content: "Current focus is improving eval traceability.",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "What is the blocker right now?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({
        requestedSlots: ["blocker"],
      }),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual(["fact-blocker"]);
    expect(result.traces.find((trace) => trace.memoryId === "fact-blocker")?.returned).toBe(true);
  });

  it("falls back to a unique reference candidate for reference slot queries", () => {
    const language = createLanguageService();
    const references = [
      createReferenceMemory({
        id: "ref-1",
        userId: "user-1",
        title: "Operational Notes",
        pointer: "docs/ops-notes.md",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectReferences(
      references,
      "Where is the current source of truth?",
      language,
      "en",
      buildRoutingDecision({
        requestedSlots: ["reference"],
        referenceSeeking: true,
      }),
      TIMESTAMP,
    );

    expect(result.references.map((reference) => reference.id)).toEqual(["ref-1"]);
    expect(result.traces[0]?.fallback).toBe("same_slot_unique_candidate");
  });

  it("prefers better-supported fact candidates when slot signals tie", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-weak",
        userId: "user-1",
        category: "project",
        content: "The runtime rollout is blocked by legal signoff.",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-strong",
        userId: "user-1",
        category: "project",
        content: "The runtime rollout is blocked by legal signoff.",
        source: SOURCE,
        accessCount: 5,
        lastAccessedAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "What is the blocker right now?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({
        requestedSlots: ["blocker"],
      }),
      null,
      TIMESTAMP,
      undefined,
      new Map([["fact-strong", 3]]),
    );

    expect(result.facts.map((fact) => fact.id)).toEqual(["fact-strong"]);
    expect(result.traces.find((trace) => trace.memoryId === "fact-strong")?.outcomeScore).toBeGreaterThan(0);
    expect(result.traces.find((trace) => trace.memoryId === "fact-strong")?.whyReturned).toContain("outcomeScore=");
  });

  it("keeps explicit personal evidence recallable when the query has weak lexical overlap", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-play",
        userId: "user-1",
        category: "event",
        content:
          "The play I attended was actually a production of The Glass Menagerie, have you heard of it?",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "What play did I attend at the local community theater?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual(["fact-play"]);
    expect(result.traces.find((trace) => trace.memoryId === "fact-play")?.lexicalScore).toBeLessThan(0.2);
  });

  it("returns weak-overlap quantified facts for aggregate count queries", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-yellowstone",
        userId: "user-1",
        category: "event",
        content:
          "I just got back from an amazing 5-day camping trip to Yellowstone National Park last month.",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-bigsur",
        userId: "user-1",
        category: "event",
        content:
          "I just got back from a 3-day solo camping trip to Big Sur in early April.",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-noise",
        userId: "user-1",
        category: "event",
        content:
          "A generic article lists 10 business days, 20 business days, and several strict timeframes.",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "How many days did I spend on camping trips in the United States this year?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id))).toEqual(
      new Set(["fact-yellowstone", "fact-bigsur"]),
    );
    expect(result.traces.find((trace) => trace.memoryId === "fact-yellowstone")?.lexicalScore).toBeLessThan(0.2);
    expect(result.traces.find((trace) => trace.memoryId === "fact-noise")?.returned).toBe(false);
  });

  it("returns weak-overlap money facts for aggregate spending queries", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-chain",
        userId: "user-1",
        category: "event",
        content:
          "I replaced the bike chain during the April tune-up, and it cost me $25.",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-lights",
        userId: "user-1",
        category: "event",
        content:
          "I got a new set of bike lights installed, which were $40.",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-unrelated-price",
        userId: "user-1",
        category: "event",
        content: "The hotel room for the trip cost $140 per night.",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "How much total money have I spent on bike-related expenses since the start of the year?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id))).toEqual(
      new Set(["fact-chain", "fact-lights"]),
    );
    expect(result.traces.find((trace) => trace.memoryId === "fact-unrelated-price")?.returned).toBe(false);
  });

  it("returns medical provider facts for aggregate doctor count queries", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-patel-lee",
        userId: "user-1",
        category: "event",
        content:
          "I have a nasal spray prescription from Dr. Patel and had a follow-up appointment with my dermatologist, Dr. Lee.",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-smith",
        userId: "user-1",
        category: "event",
        content:
          "I had a UTI and was prescribed antibiotics by my primary care physician, Dr. Smith.",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-no-provider",
        userId: "user-1",
        category: "event",
        content: "I read a general article about appointments and prescriptions.",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "How many different doctors did I visit?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id))).toEqual(
      new Set(["fact-patel-lee", "fact-smith"]),
    );
    expect(result.traces.find((trace) => trace.memoryId === "fact-no-provider")?.returned).toBe(false);
  });

  it("returns ownership facts for aggregate current-count queries", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-three-bikes",
        userId: "user-1",
        category: "event",
        content:
          "I currently have three bikes: a road bike, a mountain bike, and a commuter bike.",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-four-bikes",
        userId: "user-1",
        category: "event",
        content:
          "I just purchased a new hybrid bike, so I will have four bikes with me.",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-bike-advice",
        userId: "user-1",
        category: "event",
        content: "A bike maintenance article lists 10 generic safety checks.",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "How many bikes do I currently own?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id))).toEqual(
      new Set(["fact-three-bikes", "fact-four-bikes"]),
    );
    expect(result.traces.find((trace) => trace.memoryId === "fact-bike-advice")?.returned).toBe(false);
  });

  it("keeps appliesTo-distinct feedback variants separate and prioritizes coding-agent guidance", () => {
    const feedback = [
      createFeedbackMemory({
        id: "feedback-general",
        userId: "user-1",
        rule: "Use bullet points.",
        kind: "validated_pattern",
        appliesTo: "general_response",
        source: SOURCE,
        updatedAt: "2026-01-11T00:00:00.000Z",
      }),
      createFeedbackMemory({
        id: "feedback-coding",
        userId: "user-1",
        rule: "Use bullet points.",
        kind: "validated_pattern",
        appliesTo: "coding_agent",
        source: SOURCE,
        updatedAt: "2026-01-10T00:00:00.000Z",
      }),
    ];

    const selected = selectFeedbackForProfile(feedback, "coding_agent");

    expect(selected.map((record) => record.id)).toEqual([
      "feedback-coding",
      "feedback-general",
    ]);
  });
});
