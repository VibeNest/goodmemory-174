import { describe, expect, it } from "bun:test";
import {
  createFeedbackMemory,
  createFactMemory,
  createReferenceMemory,
} from "../../src/domain/records";
import { createLanguageService } from "../../src/language";
import type { RoutingDecision } from "../../src/recall/router";
import {
  selectFeedbackForQuery,
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

  it("prioritizes every compact model-kit fact before same-session advice for model-kit counts", () => {
    const language = createLanguageService();
    const facts = [
      "simple Revell F-15 Eagle kit",
      "Tamiya 1/48 scale Spitfire Mk.V",
      "1/16 scale German Tiger I tank",
      "1/72 scale B-29 bomber model kit",
      "1/24 scale '69 Camaro",
    ].map((modelKit, index) =>
      createFactMemory({
        id: `fact-model-kit-${index + 1}`,
        userId: "user-1",
        category: "external_benchmark",
        content: `I worked on or got the model kit: ${modelKit}.`,
        sessionId: index >= 3 ? "s-b29-camaro" : `s-model-${index}`,
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
    );
    facts.push(
      createFactMemory({
        id: "fact-model-advice",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "Assistant answer to prior user request about model kits includes: Item 5: Experiment and have fun.",
        sessionId: "s-b29-camaro",
        source: SOURCE,
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-generic-model-context",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "On 2023/05/20, I just got this kit and a 1/24 scale '69 Camaro at a model show last weekend.",
        sessionId: "s-b29-camaro",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
    );

    const result = selectFacts(
      facts,
      "How many model kits have I worked on or bought?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id).slice(0, 5))).toEqual(
      new Set([
        "fact-model-kit-1",
        "fact-model-kit-2",
        "fact-model-kit-3",
        "fact-model-kit-4",
        "fact-model-kit-5",
      ]),
    );
    expect(result.facts.map((fact) => fact.id)).not.toContain("fact-model-advice");
  });

  it("keeps aggregate count queries out of open-loop slot suppression", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-sephora-current",
        userId: "user-1",
        category: "personal",
        content:
          "Reward points evidence: I earned 50 points at Sephora, bringing my total to 200 points.",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-sephora-target",
        userId: "user-1",
        category: "personal",
        content:
          "Reward points evidence: I need a total of 300 points to redeem a free skincare product at Sephora.",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "How many points do I need to earn to redeem a free skincare product at Sephora?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({
        requestedSlots: ["open_loop"],
      }),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id).sort()).toEqual([
      "fact-sephora-current",
      "fact-sephora-target",
    ]);
  });

  it("keeps Chinese aggregate open-loop queries out of slot suppression", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-signoff",
        userId: "user-1",
        category: "project",
        factKind: "open_loop",
        scopeKind: "project",
        subject: "发布流程",
        content: "当前开环是发布流程还需要法务签收。",
        source: { ...SOURCE, locale: "zh-CN" },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-regression",
        userId: "user-1",
        category: "project",
        factKind: "open_loop",
        scopeKind: "project",
        subject: "发布流程",
        content: "当前开环是回归测试还没有跑完。",
        source: { ...SOURCE, locale: "zh-CN" },
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "当前还有哪些待办和开环？",
      language,
      "zh-CN",
      "general_chat",
      buildRoutingDecision({
        requestedSlots: ["open_loop"],
      }),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id).sort()).toEqual([
      "fact-regression",
      "fact-signoff",
    ]);
  });

  it("diversifies aggregate count facts across evidence sessions before taking duplicates", () => {
    const language = createLanguageService();
    const facts = [
      ...Array.from({ length: 6 }, (_, index) =>
        createFactMemory({
          id: `fact-piano-${index}`,
          userId: "user-1",
          category: "personal",
          content: `Musical instrument I currently own: piano detail ${index}.`,
          sessionId: "s-piano",
          source: SOURCE,
          tags: ["compact_evidence"],
          updatedAt: TIMESTAMP,
        }),
      ),
      createFactMemory({
        id: "fact-guitar",
        userId: "user-1",
        category: "personal",
        content: "Musical instrument I currently own: black Fender Stratocaster electric guitar.",
        sessionId: "s-guitar",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "How many musical instruments do I currently own?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toContain("fact-guitar");
    expect(new Set(result.facts.map((fact) => fact.sessionId))).toContain("s-guitar");
  });

  it("prefers value-bearing aggregate evidence within a session before generic topic evidence", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-coast-topic",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/21, I'm planning another road trip and comparing the total driving hours across my combined destinations.",
        sessionId: "s-coast",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-coast-hours",
        userId: "user-1",
        category: "event",
        content: "On my road trip to the coastal town, I drove for four hours.",
        sessionId: "s-coast",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-dc-hours",
        userId: "user-1",
        category: "event",
        content: "On my road trip to Washington D.C., I drove for six hours.",
        sessionId: "s-dc",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-mountains-hours",
        userId: "user-1",
        category: "event",
        content: "On my road trip to the mountains in Tennessee, I drove for five hours.",
        sessionId: "s-mountains",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "How many hours in total did I spend driving to my three road trip destinations combined?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id).slice(0, 3))).toEqual(
      new Set(["fact-coast-hours", "fact-dc-hours", "fact-mountains-hours"]),
    );
    expect(result.facts.findIndex((fact) => fact.id === "fact-coast-topic")).toBeGreaterThan(2);
  });

  it("prefers entity-bearing aggregate evidence within a session before generic topic evidence", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-doctor-topic",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/20, I think I have a good understanding of what questions to ask my doctor before the procedure.",
        sessionId: "s-colonoscopy",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-ent-provider",
        userId: "user-1",
        category: "event",
        content:
          "I was diagnosed with chronic sinusitis by an ENT specialist, Dr. Patel.",
        sessionId: "s-colonoscopy",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-dermatologist-provider",
        userId: "user-1",
        category: "event",
        content:
          "I had a follow-up appointment with my dermatologist, Dr. Lee.",
        sessionId: "s-dermatology",
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

    expect(new Set(result.facts.map((fact) => fact.id).slice(0, 2))).toEqual(
      new Set(["fact-ent-provider", "fact-dermatologist-provider"]),
    );
    expect(result.facts.findIndex((fact) => fact.id === "fact-doctor-topic")).toBeGreaterThan(1);
  });

  it("prefers named medical-provider evidence within a session before generic provider evidence", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-generic-ent",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/21, I've recently been diagnosed with it by an ENT specialist, but I haven't really had a chance to research it yet.",
        sessionId: "s-primary-care",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-dr-smith",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/21, I recently had a UTI and was prescribed antibiotics by my primary care physician, Dr. Smith.",
        sessionId: "s-primary-care",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-dr-lee",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/20, I just got back from a follow-up appointment with my dermatologist, Dr. Lee.",
        sessionId: "s-dermatology",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
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

    expect(new Set(result.facts.map((fact) => fact.id).slice(0, 2))).toEqual(
      new Set(["fact-dr-smith", "fact-dr-lee"]),
    );
    expect(result.facts.findIndex((fact) => fact.id === "fact-generic-ent")).toBeGreaterThan(1);
  });

  it("prefers realized provider evidence before question-only provider mentions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-dr-smith-question",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/21, And also, do you think I should talk to Dr. Smith about my sinusitis diagnosis and treatment plan?",
        sessionId: "s-primary-care",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-dr-smith-prescribed",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/21, I recently had a UTI and was prescribed antibiotics by my primary care physician, Dr. Smith.",
        sessionId: "s-primary-care",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-dr-lee-followup",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/20, I just got back from a follow-up appointment with my dermatologist, Dr. Lee.",
        sessionId: "s-dermatology",
        source: SOURCE,
        tags: ["compact_evidence"],
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

    expect(new Set(result.facts.map((fact) => fact.id).slice(0, 2))).toEqual(
      new Set(["fact-dr-smith-prescribed", "fact-dr-lee-followup"]),
    );
    expect(result.facts.findIndex((fact) => fact.id === "fact-dr-smith-question")).toBeGreaterThan(1);
  });

  it("prefers marked user-answer evidence before same-session aggregate distractors", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-answer-session-distractor",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/21, I've recently been diagnosed with it by an ENT specialist, but I haven't really had a chance to research it yet.",
        sessionId: "s-primary-care",
        source: SOURCE,
        tags: ["answer_session", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-user-answer-dr-smith",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/21, I recently had a UTI and was prescribed antibiotics by my primary care physician, Dr. Smith.",
        sessionId: "s-primary-care",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-user-answer-dr-lee",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/20, I just got back from a follow-up appointment with my dermatologist, Dr. Lee.",
        sessionId: "s-dermatology",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
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

    expect(new Set(result.facts.map((fact) => fact.id).slice(0, 2))).toEqual(
      new Set(["fact-user-answer-dr-smith", "fact-user-answer-dr-lee"]),
    );
    expect(result.facts.findIndex((fact) => fact.id === "fact-answer-session-distractor")).toBeGreaterThan(1);
  });

  it("keeps distinct named providers ahead of generic same-session doctor evidence", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-dr-smith",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/21, I recently had a UTI and was prescribed antibiotics by my primary care physician, Dr. Smith, so I'm not sure if that's still affecting me.",
        sessionId: "s-primary-care",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-generic-ent",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/21, I've recently been diagnosed with it by an ENT specialist, but I haven't really had a chance to research it yet.",
        sessionId: "s-primary-care",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-dr-patel",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/22, I just got diagnosed with chronic sinusitis by an ENT specialist, Dr. Patel, and she prescribed a nasal spray.",
        sessionId: "s-ent",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-dr-lee",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/20, I just got back from a follow-up appointment with my dermatologist, Dr. Lee, to get a biopsy on a suspicious mole on my back, and thankfully it was benign.",
        sessionId: "s-dermatology",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
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

    expect(new Set(result.facts.map((fact) => fact.id).slice(0, 3))).toEqual(
      new Set(["fact-dr-smith", "fact-dr-patel", "fact-dr-lee"]),
    );
    expect(result.facts.findIndex((fact) => fact.id === "fact-generic-ent")).toBeGreaterThan(2);
  });

  it("prioritizes compact medical-provider facts for aggregate doctor counts", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-provider-smith",
        userId: "user-1",
        category: "event",
        content: "Medical provider evidence: primary care physician Dr. Smith.",
        sessionId: "s-primary-care",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-provider-patel",
        userId: "user-1",
        category: "event",
        content: "Medical provider evidence: ENT specialist Dr. Patel.",
        sessionId: "s-ent",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-provider-lee",
        userId: "user-1",
        category: "event",
        content: "Medical provider evidence: dermatologist Dr. Lee.",
        sessionId: "s-dermatology",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-provider-noise",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/05/22, I recently had a urinary tract infection and was prescribed antibiotics.",
        sessionId: "s-ent",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
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

    expect(new Set(result.facts.map((fact) => fact.id).slice(0, 3))).toEqual(
      new Set(["fact-provider-smith", "fact-provider-patel", "fact-provider-lee"]),
    );
  });

  it("keeps category-instance evidence for aggregate count queries when facts name examples instead of the category", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-orange-bitters",
        userId: "user-1",
        category: "event",
        content:
          "Cocktail recipe evidence: I used orange bitters and lemon juice in a Whiskey Sour.",
        sessionId: "s-whiskey-sour",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-lime-daiquiri",
        userId: "user-1",
        category: "event",
        content:
          "Summer drink evidence: I made a classic Daiquiri with fresh lime juice.",
        sessionId: "s-daiquiri",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-orange-lemon-sangria",
        userId: "user-1",
        category: "event",
        content:
          "Sangria recipe evidence: I used Rioja wine with slices of orange and lemon.",
        sessionId: "s-sangria",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-mint-mocktail",
        userId: "user-1",
        category: "event",
        content:
          "Mocktail recipe evidence: I used mint leaves and cucumber in a nonalcoholic cooler.",
        sessionId: "s-mint",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "How many different types of citrus fruits have I used in my cocktail recipes?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id))).toEqual(
      new Set([
        "fact-orange-bitters",
        "fact-lime-daiquiri",
        "fact-orange-lemon-sangria",
      ]),
    );
    expect(result.traces.find((trace) => trace.memoryId === "fact-mint-mocktail")?.returned).toBe(false);
  });

  it("keeps learned-cuisine examples for aggregate count queries", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-ethiopian",
        userId: "user-1",
        category: "event",
        content:
          "Meal prep evidence: I tried out a new Ethiopian restaurant and then learned to cook misir wot.",
        sessionId: "s-ethiopian",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-indian",
        userId: "user-1",
        category: "event",
        content:
          "Dinner party evidence: I learned how to make chicken tikka masala in a class on Indian cuisine.",
        sessionId: "s-indian",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-korean",
        userId: "user-1",
        category: "event",
        content:
          "Cooking class evidence: I tried out Korean bibimbap and made kimchi fried rice.",
        sessionId: "s-korean",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-vegan",
        userId: "user-1",
        category: "event",
        content:
          "Meal class evidence: I attended a class on vegan cuisine that got me inspired.",
        sessionId: "s-vegan",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-fermentation",
        userId: "user-1",
        category: "event",
        content:
          "Workshop evidence: I learned fermentation techniques for sauerkraut and kombucha.",
        sessionId: "s-fermentation",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "How many different cuisines have I learned to cook or tried out in the past few months?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id))).toEqual(
      new Set([
        "fact-ethiopian",
        "fact-indian",
        "fact-korean",
        "fact-vegan",
      ]),
    );
    expect(result.traces.find((trace) => trace.memoryId === "fact-fermentation")?.returned).toBe(false);
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

  it("keeps accommodation cost evidence when the query asks for per-night lodging comparisons", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-maui-resort",
        userId: "user-1",
        category: "event",
        content:
          "[LongMemEval verified compact user evidence from session answer_eaa8e3ef_1 on 2023/05/24 (Wed) 18:08] On 2023/05/24, I've already booked a luxurious resort in Maui that costs over $300 per night, so I'm looking for some free or affordable activities to balance out the cost.",
        sessionId: "s-maui",
        source: SOURCE,
        tags: ["compact_evidence", "user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-tokyo-hostel",
        userId: "user-1",
        category: "event",
        content:
          "[LongMemEval verified compact user evidence from session answer_eaa8e3ef_2 on 2023/05/26 (Fri) 05:02] On 2023/05/26, I stayed in a hostel in Tokyo that cost around $30 per night when I went solo last January, so it's possible for me to find good deals.",
        sessionId: "s-tokyo",
        source: SOURCE,
        tags: ["compact_evidence", "user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-maui-hike",
        userId: "user-1",
        category: "event",
        content:
          "[LongMemEval verified compact user evidence from session answer_eaa8e3ef_1 on 2023/05/24 (Wed) 18:08] On 2023/05/24, I'm planning a trip to Maui and looking for outdoor hiking trails.",
        sessionId: "s-hike",
        source: SOURCE,
        tags: ["compact_evidence", "user_answer"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "How much more did I spend on accommodations per night in Hawaii compared to Tokyo?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id))).toEqual(
      new Set(["fact-maui-resort", "fact-tokyo-hostel"]),
    );
    expect(result.traces.find((trace) => trace.memoryId === "fact-maui-hike")?.returned).toBe(false);
  });

  it("returns more than two market earning facts for total money queries", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-jam",
        userId: "user-1",
        category: "event",
        content:
          "Total money I earned from selling products at markets: I just sold 15 jars of homemade jam at the market, earning $225.",
        source: SOURCE,
        tags: ["compact_evidence", "user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-potted-herbs",
        userId: "user-1",
        category: "event",
        content:
          "Total money I earned from selling products at markets: I earned $150 selling 20 potted herb plants at the Summer Solstice Market.",
        source: SOURCE,
        tags: ["compact_evidence", "user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-herb-bunches",
        userId: "user-1",
        category: "event",
        content:
          "Total money I earned from selling products at markets: I sold 12 bunches of fresh organic herbs at the farmers market, earning a total of $120.",
        source: SOURCE,
        tags: ["compact_evidence", "user_answer"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "What is the total amount of money I earned from selling my products at the markets?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id))).toEqual(
      new Set(["fact-jam", "fact-potted-herbs", "fact-herb-bunches"]),
    );
  });

  it("returns Chinese money facts for aggregate spending queries", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-chain-zh",
        userId: "user-1",
        category: "event",
        content: "我给自行车换了链条，花了25元。",
        source: { ...SOURCE, locale: "zh-CN" },
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-light-zh",
        userId: "user-1",
        category: "event",
        content: "我又装了一组自行车灯，花了40元。",
        source: { ...SOURCE, locale: "zh-CN" },
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-hotel-zh",
        userId: "user-1",
        category: "event",
        content: "酒店房间每晚花了140元。",
        source: { ...SOURCE, locale: "zh-CN" },
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "今年自行车相关维修总共花了多少钱？",
      language,
      "zh-CN",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id))).toEqual(
      new Set(["fact-chain-zh", "fact-light-zh"]),
    );
    expect(result.traces.find((trace) => trace.memoryId === "fact-hotel-zh")?.returned).toBe(false);
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

  it("prefers entity-bearing temporal-order evidence within a session before generic topic evidence", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-museum-topic",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/01/15, I was interested in other exhibitions or museums that might be of interest to us.",
        sessionId: "s-science",
        source: SOURCE,
        tags: ["dated_event"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-science-museum",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/01/15, I visited the Science Museum with my family.",
        sessionId: "s-science",
        source: SOURCE,
        tags: ["dated_event"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-metropolitan-museum",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/02/20, I visited the Metropolitan Museum of Art.",
        sessionId: "s-metropolitan",
        source: SOURCE,
        tags: ["dated_event"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "What is the order of the museums I visited from earliest to latest?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id).slice(0, 2))).toEqual(
      new Set(["fact-science-museum", "fact-metropolitan-museum"]),
    );
    expect(result.facts.findIndex((fact) => fact.id === "fact-museum-topic")).toBeGreaterThan(1);
  });

  it("prefers realized temporal-order events before future named-entity mentions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-childrens-museum-plan",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/03/04, I'll definitely check the Children's Museum's website to see what exhibits they have.",
        sessionId: "s-natural-history",
        source: SOURCE,
        tags: ["dated_event"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-natural-history-visit",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/03/04, I took my niece to the Natural History Museum to see the Dinosaur Fossils exhibition today.",
        sessionId: "s-natural-history",
        source: SOURCE,
        tags: ["dated_event"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-science-museum-visit",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/01/15, I visited the Science Museum with my colleague.",
        sessionId: "s-science",
        source: SOURCE,
        tags: ["dated_event"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "What is the order of the museums I visited from earliest to latest?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id).slice(0, 2))).toEqual(
      new Set(["fact-natural-history-visit", "fact-science-museum-visit"]),
    );
    expect(result.facts.findIndex((fact) => fact.id === "fact-childrens-museum-plan")).toBeGreaterThan(1);
  });

  it("prefers realized temporal-order events before adjacent named-entity facts", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-dinner-party",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/01/22, I've always been fascinated by The Dinner Party, and I appreciate how it's become an iconic symbol of feminist art.",
        sessionId: "s-moca",
        source: SOURCE,
        tags: ["dated_event"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-moca-lecture",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/01/22, Speaking of feminist art, I just came back from a lecture series at the Museum of Contemporary Art.",
        sessionId: "s-moca",
        source: SOURCE,
        tags: ["dated_event"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-science-museum-visit",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/01/15, I visited the Science Museum with my colleague.",
        sessionId: "s-science",
        source: SOURCE,
        tags: ["dated_event"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "What is the order of the museums I visited from earliest to latest?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id).slice(0, 2))).toEqual(
      new Set(["fact-moca-lecture", "fact-science-museum-visit"]),
    );
    expect(result.facts.map((fact) => fact.id)).not.toContain("fact-dinner-party");
  });

  it("prefers marked user-answer temporal evidence before same-session distractors", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-answer-session-moca-distractor",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/03/04, I'm interested in learning more about the Museum of Contemporary Art, where I attended a lectures series recently.",
        sessionId: "s-natural-history",
        source: SOURCE,
        tags: ["answer_session", "dated_event"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-user-answer-natural-history",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/03/04, I took my niece to the Natural History Museum to see the Dinosaur Fossils exhibition today.",
        sessionId: "s-natural-history",
        source: SOURCE,
        tags: ["user_answer", "dated_event"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-user-answer-science-museum",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/01/15, I visited the Science Museum with my colleague.",
        sessionId: "s-science",
        source: SOURCE,
        tags: ["user_answer", "dated_event"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "What is the order of the museums I visited from earliest to latest?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id).slice(0, 2))).toEqual(
      new Set(["fact-user-answer-natural-history", "fact-user-answer-science-museum"]),
    );
    expect(result.facts.findIndex((fact) => fact.id === "fact-answer-session-moca-distractor")).toBeGreaterThan(1);
  });

  it("prefers temporal-order facts that retain the queried entity name", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-modern-art-pronoun",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/02/20, I attended their guided tour of The Evolution of Abstract Expressionism today.",
        sessionId: "s-modern-art",
        source: SOURCE,
        tags: ["user_answer", "dated_event"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-modern-art-museum",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/02/20, I recently attended a guided tour of the Modern Art Museum's The Evolution of Abstract Expressionism.",
        sessionId: "s-modern-art",
        source: SOURCE,
        tags: ["user_answer", "dated_event"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-science-museum",
        userId: "user-1",
        category: "event",
        content:
          "On 2023/01/15, I visited the Science Museum with my colleague.",
        sessionId: "s-science",
        source: SOURCE,
        tags: ["user_answer", "dated_event"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "What is the order of the museums I visited from earliest to latest?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id).slice(0, 2))).toEqual(
      new Set(["fact-modern-art-museum", "fact-science-museum"]),
    );
    expect(result.facts.findIndex((fact) => fact.id === "fact-modern-art-pronoun")).toBeGreaterThan(1);
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

  it("prioritizes verified assistant evidence for previous-chat ordinal questions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-profile-noise",
        userId: "user-1",
        category: "personal",
        content:
          "male model and i am asked to make a promotional instagram post for the above campaign",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-item-7",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "Item 7: Transcriptionist",
        source: SOURCE,
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "I think we discussed work from home jobs for seniors earlier. Can you remind me what was the 7th job in the list you provided?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toContain("fact-item-7");
    expect(result.traces.find((trace) => trace.memoryId === "fact-profile-noise")?.returned).toBe(false);
  });

  it("keeps assistant answer evidence eligible for did-you-recommend questions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-user-request",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "On 2023/05/28, I was interested in a traditional game that requires skilled dancers.",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-hoop-dance",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "Item 1: Hoop Dance - a traditional game that requires skilled dancers and coordinated movement.",
        source: SOURCE,
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "Which traditional game did you recommend for skilled dancers?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toContain("fact-hoop-dance");
  });

  it("keeps Chinese assistant answer evidence eligible for previous recommendation questions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-user-request-zh",
        userId: "user-1",
        category: "external_benchmark",
        content: "我之前想找适合小团队的异步协作文档工具。",
        source: { ...SOURCE, locale: "zh-CN" },
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-notion-zh",
        userId: "user-1",
        category: "external_benchmark",
        content: "第1项：Notion，适合小团队做异步协作文档和知识库。",
        source: { ...SOURCE, locale: "zh-CN" },
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "你之前给我推荐的小团队异步协作文档工具是什么？",
      language,
      "zh-CN",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toContain("fact-notion-zh");
  });

  it("keeps assistant count headings eligible for previous-chat count questions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-title",
        userId: "user-1",
        category: "external_benchmark",
        content: "Assistant response title: The Lost Temple of the Djinn.",
        source: SOURCE,
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-mummies",
        userId: "user-1",
        category: "external_benchmark",
        content: "Mummies (4):",
        source: SOURCE,
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "Can you remind me how many mummies the party will face in the Lost Temple of the Djinn?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toContain("fact-mummies");
  });

  it("keeps verified user evidence eligible for previous-chat questions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-user-answer",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I want to have access to all seasons for old shows. For example, Doc Martin only had the last season available.",
        source: SOURCE,
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "I wanted to check back on our previous conversation about Netflix. What show did I use as an example, the one that only had the last season available?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual(["fact-user-answer"]);
  });

  it("prioritizes verified user evidence over assistant summaries for user-grounded previous-chat questions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-assistant-summary",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "Assistant answer to prior user request about Netflix includes: The interviewee suggests that Netflix should keep all seasons of old shows available for viewing.",
        source: SOURCE,
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-user-answer",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I want to have access to all seasons for old shows. For example, Doc Martin only had the last season available.",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "I wanted to check back on our previous conversation about Netflix. What show did I use as an example, the one that only had the last season available?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts[0]?.id).toBe("fact-user-answer");
  });

  it("falls back to generic fact selection when previous-chat wording has no tagged evidence", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-degree",
        userId: "user-1",
        category: "personal",
        content: "I graduated with a degree in Business Administration.",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "Earlier, what degree did I graduate with?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual(["fact-degree"]);
  });

  it("prioritizes matching grouped assistant heading evidence", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-lemont",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "Lemont Refinery includes: Atmospheric distillation; Delayed coking; Hydrocracking; Hydrotreating.",
        source: SOURCE,
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-lake-charles",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "Lake Charles Refinery includes: Atmospheric distillation; Fluid catalytic cracking (FCC); Alkylation; Hydrotreating.",
        source: SOURCE,
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "Can you remind me what kind of processes are used at the Lake Charles Refinery?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts[0]?.id).toBe("fact-lake-charles");
  });

  it("prioritizes assistant final enumerated items for previous-chat last-item questions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-mid-list",
        userId: "user-1",
        category: "external_benchmark",
        content: "Item 6: Aladdin Theater",
        source: SOURCE,
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-final-item",
        userId: "user-1",
        category: "external_benchmark",
        content: "Assistant final enumerated item: 10. Revolution Hall.",
        source: SOURCE,
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "What was the last venue you recommended for Portland indie music shows?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts[0]?.id).toBe("fact-final-item");
  });

  it("returns trusted preference evidence for weak-overlap recommendation questions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-noise",
        userId: "user-1",
        category: "personal",
        content: "I am packing for a trip tomorrow.",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-evening-preference",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I prefer winding down by 9:30 pm to prepare for a good night's sleep.",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-kitchen-leak",
        userId: "user-1",
        category: "personal",
        content: "I am struggling with a leaking kitchen faucet.",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "Can you suggest some activities that I can do in the evening?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-evening-preference",
    ]);
    expect(result.traces.find((trace) => trace.memoryId === "fact-kitchen-leak")?.returned).toBe(false);
  });

  it("returns source-ordered preference evidence for implementation help questions", () => {
    const language = createLanguageService();
    const makeSourceFact = (
      id: string,
      sourceOrder: number,
      content: string,
      tags: string[] = ["source_message", "source_order", "user_answer"],
    ) =>
      createFactMemory({
        id,
        userId: "user-1",
        category: "external_benchmark",
        content,
        source: SOURCE,
        tags,
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-assistant-caching",
        47,
        "[BEAM chat_id=47 role=assistant time=unknown] Using localStorage is a great approach for caching API responses in the app.",
        ["source_message", "source_order", "assistant_answer"],
      ),
      makeSourceFact(
        "fact-cache-implementation-noise",
        52,
        "[BEAM chat_id=52 role=user time=unknown] I implemented a straightforward caching system for app API responses with TTL checks and cache invalidation.",
      ),
      makeSourceFact(
        "fact-lightweight-preference",
        54,
        "[BEAM chat_id=54 role=user time=unknown] I'm trying to keep my weather app under 2.5MB, so I prefer using lightweight, dependency-free solutions over heavy frameworks.",
      ),
      makeSourceFact(
        "fact-later-cache-implementation",
        64,
        "[BEAM chat_id=64 role=user time=unknown] I implemented a simple caching mechanism for OpenWeather API responses using an in-memory cache and TTL.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you help me set up a caching system for my app's API responses? I'd like to keep it simple and straightforward.",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toContain(
      "fact-lightweight-preference",
    );
    expect(result.traces.find((trace) => trace.memoryId === "fact-lightweight-preference")?.returned).toBe(true);
  });

  it("prioritizes compact kitchen setup evidence over same-session repair topics", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-faucet-topics",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "Assistant follow-up recommendation topics for faucet repair: Visual Inspection; Leak Location; Aerator.",
        source: SOURCE,
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-countertop-topics",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "Assistant follow-up recommendation topics for countertop scratches: Depth; Length; Baking Soda and Water.",
        source: SOURCE,
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-utensil-holder",
        userId: "user-1",
        category: "external_benchmark",
        content: "My new kitchen utensil holder helps keep countertops clutter-free.",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-granite",
        userId: "user-1",
        category: "external_benchmark",
        content: "My kitchen granite countertop near the sink has scratches.",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-faucet",
        userId: "user-1",
        category: "external_benchmark",
        content: "My kitchen faucet has been leaking slightly.",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "My kitchen's becoming a bit of a mess again. Any tips for keeping it clean?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toContain("fact-utensil-holder");
  });

  it("does not treat generic assistant answer evidence as preference evidence", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-assistant-course-advice",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "Assistant answer to prior user request about data science courses includes: Machine Learning with Python; Deep Learning with Python.",
        source: SOURCE,
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-high-school",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I still remember happy high school experiences such as being part of the debate team and taking advanced placement courses in economics.",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "I've been feeling nostalgic lately. Do you think it would be a good idea to attend my high school reunion?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toContain("fact-high-school");
    expect(result.facts.map((fact) => fact.id)).not.toContain(
      "fact-assistant-course-advice",
    );
  });

  it("returns trusted Chinese preference evidence for advice questions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-kitchen-noise",
        userId: "user-1",
        category: "personal",
        content: "我今天在厨房做了晚饭。",
        source: { ...SOURCE, locale: "zh-CN" },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-kitchen-faucet",
        userId: "user-1",
        category: "personal",
        content: "我家的厨房水龙头最近有点漏水。",
        source: { ...SOURCE, locale: "zh-CN" },
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-evening",
        userId: "user-1",
        category: "personal",
        content: "我想要更安静的晚上活动。",
        source: { ...SOURCE, locale: "zh-CN" },
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "厨房又有点乱了，有什么建议？",
      language,
      "zh-CN",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-kitchen-faucet",
    ]);
    expect(result.traces.find((trace) => trace.memoryId === "fact-evening")?.returned).toBe(false);
  });

  it("does not use weak-overlap inferred evidence as recommendation fallback", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-inferred-preference",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I prefer winding down by 9:30 pm to prepare for a good night's sleep.",
        source: {
          extractedAt: TIMESTAMP,
          method: "inferred",
        },
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "Can you suggest some activities that I can do in the evening?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts).toEqual([]);
  });

  it("prefers the latest mortgage preapproval evidence over stale amounts", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-preapproval-old",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I got pre-approved for $350,000 from Wells Fargo for my mortgage.",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: "2023-08-11T00:00:00.000Z",
      }),
      createFactMemory({
        id: "fact-preapproval-latest",
        userId: "user-1",
        category: "external_benchmark",
        content: "Wells Fargo changed the pre-approval to $400,000.",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: "2023-11-30T00:00:00.000Z",
      }),
    ];

    const result = selectFacts(
      facts,
      "What was the amount I was pre-approved for when I got my mortgage from Wells Fargo?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-preapproval-latest",
    ]);
    expect(result.traces.find((trace) => trace.memoryId === "fact-preapproval-old")?.returned).toBe(false);
  });

  it("prefers the latest shared grocery-list method evidence over stale paper-list evidence", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-mom-paper-list",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "My mom still uses her old paper grocery list while I use a grocery list app.",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: "2023-05-02T00:00:00.000Z",
      }),
      createFactMemory({
        id: "fact-mom-shared-app",
        userId: "user-1",
        category: "external_benchmark",
        content: "Mom is on the shared grocery list app now.",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: "2023-09-14T00:00:00.000Z",
      }),
    ];

    const result = selectFacts(
      facts,
      "Is my mom using the same grocery list method as me?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-mom-shared-app",
    ]);
  });

  it("prefers the latest recent-family-trip evidence for most-recent trip questions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-trip-hawaii",
        userId: "user-1",
        category: "external_benchmark",
        content: "My most recent family trip was to Hawaii.",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: "2023-03-21T00:00:00.000Z",
      }),
      createFactMemory({
        id: "fact-trip-paris",
        userId: "user-1",
        category: "external_benchmark",
        content: "Our family trip moved to Paris in the latest update.",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: "2023-10-06T00:00:00.000Z",
      }),
    ];

    const result = selectFacts(
      facts,
      "Where did I go on my most recent family trip?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual(["fact-trip-paris"]);
  });

  it("orders sleep-before-appointment bridge evidence with the sleep time first", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-appointment",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "On 2023/05/24, I had a doctor's appointment at 10 AM last Thursday, and that's when I got the results.",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-sleep",
        userId: "user-1",
        category: "external_benchmark",
        content: "I went to bed at 2 AM last Wednesday.",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "What time did I go to bed on the day before I had a doctor's appointment?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-sleep",
      "fact-appointment",
    ]);
  });

  it("returns dated event facts for earliest-to-latest order questions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-trip-muir-woods",
        userId: "user-1",
        category: "external_benchmark",
        content: "On 2023/03/10, I went on a day hike to Muir Woods.",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence", "dated_event"],
        updatedAt: "2023-03-10T00:00:00.000Z",
      }),
      createFactMemory({
        id: "fact-trip-big-sur",
        userId: "user-1",
        category: "external_benchmark",
        content: "On 2023/04/20, I went on a road trip to Big Sur and Monterey.",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence", "dated_event"],
        updatedAt: "2023-04-20T00:00:00.000Z",
      }),
      createFactMemory({
        id: "fact-trip-yosemite",
        userId: "user-1",
        category: "external_benchmark",
        content: "On 2023/05/15, I started my solo camping trip to Yosemite.",
        source: SOURCE,
        tags: ["user_answer", "compact_evidence", "dated_event"],
        updatedAt: "2023-05-15T00:00:00.000Z",
      }),
    ];

    const result = selectFacts(
      facts,
      "What is the order of the three trips I took in the past three months, from earliest to latest?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id).sort()).toEqual([
      "fact-trip-big-sur",
      "fact-trip-yosemite",
      "fact-trip-muir-woods",
    ].sort());
  });

  it("prioritizes temporal interval boundary events over later high-overlap dated noise", () => {
    const language = createLanguageService();
    const makeSourceFact = (
      id: string,
      sourceOrder: number,
      content: string,
      tags: string[] = ["source_message", "source_order", "user_answer"],
    ) =>
      createFactMemory({
        id,
        userId: "user-1",
        category: "external_benchmark",
        content,
        source: SOURCE,
        tags,
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const noiseFacts = Array.from({ length: 8 }, (_, index) =>
      makeSourceFact(
        `fact-weather-noise-${index}`,
        70 + index * 2,
        `[BEAM chat_id=${70 + index * 2} role=user time=March-${20 + index}-2024] I am working on my weather app with OpenWeather API v2.5, API key environment variables, UI error display, and completed API error handling improvements.`,
        ["source_message", "source_order", "user_answer", "dated_event"],
      )
    );
    const facts = [
      makeSourceFact(
        "fact-openweather-key",
        32,
        "[BEAM chat_id=32 role=user time=unknown] I am handling rate limits for my OpenWeather API key obtained on March 10, 2024.",
      ),
      makeSourceFact(
        "fact-wireframe-complete",
        42,
        "[BEAM chat_id=42 role=user time=unknown] I completed the UI wireframe for my weather app on March 12, 2024.",
      ),
      ...noiseFacts,
    ];

    const result = selectFacts(
      facts,
      "How many days passed between when I obtained my OpenWeather API key and when I completed the UI wireframe for my weather app?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    expect(selectedIds).toContain("fact-openweather-key");
    expect(selectedIds).toContain("fact-wireframe-complete");
  });

  it("does not treat ordinary received-feedback anchors as acquisition boundary events", () => {
    const language = createLanguageService();
    const makeSourceFact = (
      id: string,
      sourceOrder: number,
      content: string,
      tags: string[] = ["source_message", "source_order", "user_answer", "dated_event"],
    ) =>
      createFactMemory({
        id,
        userId: "user-1",
        category: "external_benchmark",
        content,
        source: SOURCE,
        tags,
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const noiseFacts = Array.from({ length: 8 }, (_, index) =>
      makeSourceFact(
        `fact-feedback-noise-${index}`,
        111 + index * 2,
        `[BEAM chat_id=${111 + index * 2} role=assistant time=unknown] I received positive feedback from managers after the AI pilot and prepared follow-up guidance about transparency, audits, and candidate communication on April ${29 + index}, 2024.`,
        ["source_message", "source_order", "dated_event"],
      )
    );
    const facts = [
      makeSourceFact(
        "fact-wyatt-meeting",
        56,
        "[BEAM chat_id=56 role=user time=unknown] Wyatt expressed skepticism about AI fairness during our March 10 meeting at Media Hub.",
      ),
      makeSourceFact(
        "fact-manager-feedback",
        110,
        "[BEAM chat_id=110 role=user time=unknown] I received positive feedback from 2 managers on April 28 after continuing the AI pilot.",
      ),
      ...noiseFacts,
    ];

    const result = selectFacts(
      facts,
      "How many days passed between my meeting with Wyatt expressing skepticism and the positive feedback I received from the managers?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    expect(selectedIds).toContain("fact-wyatt-meeting");
    expect(selectedIds).toContain("fact-manager-feedback");
  });

  it("returns source-ordered imported evidence for event-order questions without dates", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-budget-core",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I want to build a personal budget tracker with user authentication, expense tracking, and data visualization.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: {
          sourceOrder: 4,
        },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-transactions",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I am implementing transaction creation with proper response handling and error management.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: {
          sourceOrder: 60,
        },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-security",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I need security hardening before deployment, especially authentication and authorization.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: {
          sourceOrder: 116,
        },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-generic-distractor",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "A generic Flask checklist mentioned deployment and auth terms without being a source turn.",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "Can you list the order in which I brought up different aspects of developing my personal budget tracker throughout our conversations, in order?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-budget-core",
      "fact-transactions",
      "fact-security",
    ]);
    expect(result.traces.find((trace) => trace.memoryId === "fact-generic-distractor")?.returned).toBe(false);
  });

  it("fills source-ordered topical gaps for broad event-order questions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-breakdown",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "Sure, let's break it down for my budget tracker project: user authentication, transaction management, and basic analytics.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 2 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-budget-core",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I want to build a personal budget tracker with user authentication, expense tracking, and data visualization.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 4 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-password",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I am implementing basic password hashing for my personal budget tracker using Werkzeug.security.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 16 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-minimal",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I want my Flask app to stay minimal while meeting the MVP deadline for income tracking, login, and analytics.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 34 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-transactions",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I am currently working on transaction CRUD and analytics integration for my personal budget tracker, with completed registration and login modules.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 60 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-rest-api",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I am designing a REST API for transactions with validation and error handling.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 82 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-logging",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I am configuring Flask logging to output to budget_tracker.log and capture stack traces.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 96 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-security",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I am finalizing deployment and need UI/UX improvements plus security hardening for authentication and authorization before public launch.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 116 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-docs",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I am documenting API endpoints and architecture decisions in Confluence for a remote collaborator.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 176 },
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "Can you list the order in which I brought up different aspects of developing my personal budget tracker throughout our conversations, in order? Mention ONLY and ONLY three items.",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    expect(selectedIds).toContain("fact-budget-core");
    expect(selectedIds).toContain("fact-transactions");
    expect(selectedIds).toContain("fact-security");
    expect(
      selectedIds.indexOf("fact-budget-core"),
    ).toBeLessThan(selectedIds.indexOf("fact-transactions"));
    expect(
      selectedIds.indexOf("fact-transactions"),
    ).toBeLessThan(selectedIds.indexOf("fact-security"));
  });

  it("fills late source-ordered deployment and test evidence for broad app event-order questions", () => {
    const language = createLanguageService();
    const makeFact = (id: string, sourceOrder: number, content: string) =>
      createFactMemory({
        id,
        userId: "user-1",
        category: "external_benchmark",
        content,
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeFact(
        "fact-breakdown",
        2,
        "Budget tracker project breakdown: user authentication, transaction management, and analytics milestones.",
      ),
      makeFact(
        "fact-core",
        4,
        "I want to implement core budget tracker functionality with user authentication and expense tracking.",
      ),
      makeFact(
        "fact-local-setup",
        6,
        "I am initializing a Flask 2.3.1 project on Python 3.11 with SQLite 3.39 for local dev on port 5000.",
      ),
      makeFact(
        "fact-schema",
        12,
        "I am designing the database schema and models for income, expenses, and analytics.",
      ),
      makeFact(
        "fact-minimal",
        34,
        "I want the Flask app to stay minimal while still implementing tracking, login, and analytics.",
      ),
      makeFact(
        "fact-blueprints",
        48,
        "I am modularizing the app into auth, transactions, and analytics blueprints.",
      ),
      makeFact(
        "fact-sprint",
        52,
        "I am updating the project timeline and sprint plan for the budget tracker.",
      ),
      makeFact(
        "fact-transaction-post",
        62,
        "I am implementing the POST /transactions route and need the response handling and error management to be correct.",
      ),
      makeFact(
        "fact-rest-api",
        82,
        "I am designing a REST API for transactions with validation and error handling.",
      ),
      makeFact(
        "fact-analytics",
        86,
        "I am working on sprint 2 for analytics after completing auth and basic transaction CRUD.",
      ),
      makeFact(
        "fact-security-review",
        116,
        "I am finalizing deployment and need security hardening for authentication and authorization.",
      ),
      makeFact(
        "fact-gunicorn-tests",
        118,
        "I am having deployment issues with Gunicorn on Render.com, using 3 workers on port 10000, and my integration tests cover user auth, transaction CRUD, and analytics endpoints with a 95% pass rate.",
      ),
      makeFact(
        "fact-security-tests",
        120,
        "I will add more tests to cover edge cases and security vulnerabilities, specifically SQL injection and XSS.",
      ),
      makeFact(
        "fact-docs",
        176,
        "I am documenting API endpoints and architecture decisions in Confluence.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you walk me through the order in which I brought up different aspects of my app development and deployment across our conversations? Mention ONLY and ONLY five items.",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-local-setup",
      "fact-transaction-post",
      "fact-gunicorn-tests",
      "fact-security-tests",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    expect(
      selectedIds.indexOf("fact-local-setup"),
    ).toBeLessThan(selectedIds.indexOf("fact-transaction-post"));
    expect(
      selectedIds.indexOf("fact-transaction-post"),
    ).toBeLessThan(selectedIds.indexOf("fact-gunicorn-tests"));
    expect(
      selectedIds.indexOf("fact-gunicorn-tests"),
    ).toBeLessThan(selectedIds.indexOf("fact-security-tests"));
  });

  it("fills late source-ordered deployment gaps after dense early development chatter", () => {
    const language = createLanguageService();
    const makeFact = (
      id: string,
      sourceOrder: number,
      content: string,
      role: "assistant" | "user" = "user",
    ) =>
      createFactMemory({
        id,
        userId: "user-1",
        category: "external_benchmark",
        content,
        source: SOURCE,
        tags: [
          "source_message",
          "source_order",
          role === "assistant" ? "assistant_answer" : "user_answer",
        ],
        attributes: { sourceOrder },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeFact(
        "fact-breakdown-answer",
        2,
        "Budget tracker app development implementation details: user authentication, expense tracking, and analytics.",
        "assistant",
      ),
      makeFact(
        "fact-core",
        4,
        "I want to implement the core functionality of my personal budget tracker app with authentication, expense tracking, and data visualization.",
      ),
      makeFact(
        "fact-local-setup",
        6,
        "I am initializing a Flask 2.3.1 project on Python 3.11 with SQLite 3.39 for local dev on port 5000.",
      ),
      makeFact(
        "fact-schema",
        12,
        "I am designing the database schema and models for income, expenses, and analytics.",
      ),
      makeFact(
        "fact-sqlite",
        14,
        "I am implementing SQLite transaction helpers with validation and error handling.",
      ),
      makeFact(
        "fact-password",
        16,
        "I am implementing password hashing for the personal budget tracker.",
      ),
      makeFact(
        "fact-wireframe",
        18,
        "I am creating the initial Bootstrap wireframe for the app.",
      ),
      makeFact(
        "fact-template-debug",
        20,
        "I am debugging TemplateNotFound and database table setup errors.",
      ),
      makeFact(
        "fact-minimal",
        34,
        "I want the Flask app to stay minimal while still implementing tracking, login, and analytics.",
      ),
      makeFact(
        "fact-async",
        36,
        "I am testing async Flask routing and request handling in Python 3.11.",
      ),
      makeFact(
        "fact-registration-estimate",
        42,
        "I am estimating secure registration work and validation tasks.",
      ),
      makeFact(
        "fact-blueprints",
        48,
        "I am modularizing the app into auth, transactions, and analytics blueprints.",
      ),
      makeFact(
        "fact-estimate-answer",
        50,
        "App development planning answer: estimate registration work, validation, and implementation time.",
        "assistant",
      ),
      makeFact(
        "fact-sprint",
        52,
        "I am planning the sprint sequence for registration, login, and later app development work.",
      ),
      makeFact(
        "fact-transaction-crud",
        60,
        "I am currently working on the transaction CRUD and analytics integration for my personal budget tracker, and I have completed the registration and login modules during app development.",
      ),
      makeFact(
        "fact-transaction-post",
        62,
        "I am implementing the POST /transactions route and need response handling and error management.",
      ),
      makeFact(
        "fact-rest-api",
        82,
        "I am designing a REST API for transactions with validation and error handling.",
      ),
      makeFact(
        "fact-analytics-sprint",
        86,
        "I am working on the analytics sprint after completing authentication and transaction CRUD.",
      ),
      makeFact(
        "fact-logging",
        96,
        "I am configuring Flask logging to capture stack traces.",
      ),
      makeFact(
        "fact-security-review",
        116,
        "I am finalizing deployment and need security hardening for authentication and authorization.",
      ),
      makeFact(
        "fact-gunicorn-tests",
        118,
        "I am having deployment issues with Gunicorn on Render.com, and my integration tests cover user auth, transaction CRUD, and analytics endpoints.",
      ),
      makeFact(
        "fact-security-tests",
        120,
        "I will add more tests to cover edge cases and security vulnerabilities, specifically SQL injection and XSS.",
      ),
      makeFact(
        "fact-docs",
        176,
        "I am documenting API endpoints and architecture decisions in Confluence.",
      ),
      makeFact(
        "fact-pragmatic-security",
        178,
        "I prefer pragmatic security enhancements that do not compromise responsiveness.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you walk me through the order in which I brought up different aspects of my app development and deployment across our conversations? Mention ONLY and ONLY five items.",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-local-setup",
      "fact-transaction-post",
      "fact-gunicorn-tests",
      "fact-security-tests",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
  });

  it("fills late source-ordered milestones even when early chatter has recent recall usage", () => {
    const language = createLanguageService();
    const makeFact = (
      id: string,
      sourceOrder: number,
      content: string,
      usageBoost = false,
    ) =>
      createFactMemory({
        id,
        userId: "user-1",
        category: "external_benchmark",
        content,
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder },
        accessCount: usageBoost ? 5 : 0,
        lastAccessedAt: usageBoost ? TIMESTAMP : undefined,
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeFact(
        "fact-core",
        4,
        "I want to implement core personal budget tracker functionality with authentication, expense tracking, and visualization.",
        true,
      ),
      makeFact(
        "fact-local-setup",
        6,
        "I am initializing the Flask budget tracker locally with SQLite and port 5000.",
        true,
      ),
      makeFact(
        "fact-jinja",
        10,
        "I am setting up Jinja2 templates and Bootstrap for the budget tracker UI.",
        true,
      ),
      makeFact(
        "fact-schema",
        12,
        "I am designing the budget tracker schema and models for income, expenses, and analytics.",
        true,
      ),
      makeFact(
        "fact-sqlite",
        14,
        "I am implementing SQLite transaction helpers with validation and error handling.",
        true,
      ),
      makeFact(
        "fact-password",
        16,
        "I am adding password hashing and login validation.",
        true,
      ),
      makeFact(
        "fact-homepage",
        24,
        "I implemented the homepage route and returned static HTML from Flask.",
        true,
      ),
      makeFact(
        "fact-minimal",
        34,
        "I want the budget tracker app to stay minimal while shipping the MVP.",
        true,
      ),
      makeFact(
        "fact-blueprints",
        48,
        "I am splitting the app into auth, transactions, and analytics blueprints.",
        true,
      ),
      makeFact(
        "fact-transaction-crud",
        60,
        "I am working on transaction CRUD and analytics integration after finishing registration and login.",
      ),
      makeFact(
        "fact-transaction-post",
        62,
        "I am implementing POST /transactions with proper response handling and error management.",
      ),
      makeFact(
        "fact-rest-api",
        82,
        "I am designing REST transaction endpoints with validation and error handling.",
        true,
      ),
      makeFact(
        "fact-security-review",
        116,
        "I am finalizing deployment and need security hardening for authentication and authorization before launch.",
      ),
      makeFact(
        "fact-gunicorn-tests",
        118,
        "I am reviewing Gunicorn deployment on Render.com and integration tests for auth, transaction CRUD, and analytics.",
      ),
      makeFact(
        "fact-security-tests",
        120,
        "I will add security tests for SQL injection and XSS before deployment.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you list the order in which I brought up different aspects of developing my personal budget tracker throughout our conversations, in order? Mention ONLY and ONLY three items.",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    expect(selectedIds).toContain("fact-core");
    expect(selectedIds).toContain("fact-transaction-crud");
    expect(selectedIds).toContain("fact-security-review");
    expect(
      selectedIds.indexOf("fact-transaction-crud"),
    ).toBeLessThan(selectedIds.indexOf("fact-security-review"));
  });

  it("returns source-ordered coverage for broad conversation summary questions", () => {
    const language = createLanguageService();
    const makeSourceFact = (
      id: string,
      sourceOrder: number,
      role: "assistant" | "user",
      content: string,
    ) =>
      createFactMemory({
        id,
        userId: "user-1",
        category: "external_benchmark",
        content,
        source: SOURCE,
        tags: [
          "source_message",
          "source_order",
          role === "assistant" ? "assistant_answer" : "user_answer",
        ],
        attributes: { sourceOrder },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-css-user",
        14,
        "user",
        "I am debugging a CSS layout issue in my web project with Chrome DevTools and the box model.",
      ),
      makeSourceFact(
        "fact-css-assistant",
        15,
        "assistant",
        "The solution covered calculating element dimensions and using DevTools to inspect the layout issue.",
      ),
      makeSourceFact(
        "fact-dom-user",
        30,
        "user",
        "I am anticipating DOM manipulation errors such as classList of null in a Bootstrap navbar.",
      ),
      makeSourceFact(
        "fact-dom-assistant",
        31,
        "assistant",
        "The response added null checks, optional chaining, and try-catch blocks to prevent DOM runtime errors.",
      ),
      makeSourceFact(
        "fact-gallery-user",
        62,
        "user",
        "I am fixing project gallery images that return 404 errors in the web project.",
      ),
      makeSourceFact(
        "fact-gallery-assistant",
        63,
        "assistant",
        "The response checked image paths, build output, and static file serving to resolve the gallery 404 errors.",
      ),
      makeSourceFact(
        "fact-form-user",
        166,
        "user",
        "I am fixing an intermittent Formspree 500 Internal Server Error on my contact form submission.",
      ),
      makeSourceFact(
        "fact-form-assistant",
        167,
        "assistant",
        "The response recommended retry logic with exponential backoff and separate HTTP/network error handling.",
      ),
      createFactMemory({
        id: "fact-late-fragment",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "Project gallery layout issues and 404 errors were debugged in detail.",
        source: SOURCE,
        tags: ["beam", "chat_id:119"],
        attributes: { chatId: 119 },
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "Can you summarize how I approached and resolved the various issues with my web project over time?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-css-user",
      "fact-css-assistant",
      "fact-gallery-user",
      "fact-gallery-assistant",
      "fact-form-user",
      "fact-form-assistant",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    expect(selectedIds.indexOf("fact-css-user")).toBeLessThan(
      selectedIds.indexOf("fact-gallery-user"),
    );
    expect(selectedIds.indexOf("fact-gallery-user")).toBeLessThan(
      selectedIds.indexOf("fact-form-user"),
    );
  });

  it("returns source-ordered planning pairs for timeline integration questions", () => {
    const language = createLanguageService();
    const makeSourceFact = (
      id: string,
      sourceOrder: number,
      role: "assistant" | "user",
      content: string,
    ) =>
      createFactMemory({
        id,
        userId: "user-1",
        category: "external_benchmark",
        content,
        source: SOURCE,
        tags: [
          "source_message",
          "source_order",
          role === "assistant" ? "assistant_answer" : "user_answer",
        ],
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-sprint-plan-request",
        28,
        "user",
        "[BEAM chat_id=28 role=user time=unknown] I'm working on a project with scheduled two-week sprints, and the first sprint ends on March 29, focusing on user registration and login. I need to plan the sprint carefully to ensure we meet the deadline.",
      ),
      makeSourceFact(
        "fact-sprint-plan-answer",
        29,
        "assistant",
        "[BEAM chat_id=29 role=assistant time=unknown] Let's create a detailed sprint plan for the first two-week sprint ending on March 29, focusing on user registration and login. We'll schedule backend setup, database schema, registration, login, validation, unit tests, frontend forms, API integration, and final QA.",
      ),
      makeSourceFact(
        "fact-later-sprint-noise",
        86,
        "user",
        "[BEAM chat_id=86 role=user time=unknown] I'm working on sprint 2 which targets analytics by April 19, and I've already completed sprint 1 on March 29 with user auth and basic transaction CRUD.",
      ),
      makeSourceFact(
        "fact-auth-instruction-noise",
        184,
        "user",
        "[BEAM chat_id=184 role=user time=unknown] Always provide security best practices when I ask about authentication or authorization features.",
      ),
    ];

    const result = selectFacts(
      facts,
      "How did I organize the tasks over the course of the sprint to ensure both backend and frontend aspects of the features were completed on time?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-sprint-plan-request",
      "fact-sprint-plan-answer",
    ]);
  });

  it("keeps the earliest matching writing-plan exchange for deadline process questions", () => {
    const language = createLanguageService();
    const makeSourceFact = (
      id: string,
      sourceOrder: number,
      role: "assistant" | "user",
      content: string,
    ) =>
      createFactMemory({
        id,
        userId: "user-1",
        category: "external_benchmark",
        content,
        source: SOURCE,
        tags: [
          "source_message",
          "source_order",
          role === "assistant" ? "assistant_answer" : "user_answer",
        ],
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-screenplay-deadline-plan",
        21,
        "assistant",
        "[BEAM chat_id=21 role=assistant time=unknown] Setting a goal to complete a 5,000-word screenplay draft by April 15, 2024, is a great way to boost your confidence. Break down the goal into daily word count targets, create an outline and scene breakdown, set writing times, reward milestones, and use an accountability partner.",
      ),
      makeSourceFact(
        "fact-later-version-control",
        139,
        "assistant",
        "[BEAM chat_id=139 role=assistant time=unknown] Since you adopted Google Docs version history, here are additional drafting strategies to optimize your writing process.",
      ),
      makeSourceFact(
        "fact-later-scene-cards",
        141,
        "assistant",
        "[BEAM chat_id=141 role=assistant time=unknown] Creating outlines and using scene cards can help you organize your thoughts before writing.",
      ),
      makeSourceFact(
        "fact-later-writing-blocks",
        145,
        "assistant",
        "[BEAM chat_id=145 role=assistant time=unknown] Creative blocks can be frustrating, but changing your environment and using writing prompts can help maintain your creative flow.",
      ),
    ];

    const result = selectFacts(
      facts,
      "How did you recommend structuring my writing process to maintain steady progress and stay motivated throughout the weeks leading up to my deadline?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-screenplay-deadline-plan",
    ]);
  });

  it("keeps the full early source-ordered resource plan for multi-step guidance questions", () => {
    const language = createLanguageService();
    const makeSourceFact = (
      id: string,
      sourceOrder: number,
      role: "assistant" | "user",
      content: string,
    ) =>
      createFactMemory({
        id,
        userId: "user-1",
        category: "external_benchmark",
        content,
        source: SOURCE,
        tags: [
          "source_message",
          "source_order",
          role === "assistant" ? "assistant_answer" : "user_answer",
        ],
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-patent-question",
        10,
        "user",
        "[BEAM chat_id=10 role=user time=unknown] I'm worried about my son Francis, who's 21 and studying engineering at Montserrat Community College. What patent applications would be relevant for an engineering student like him?",
      ),
      makeSourceFact(
        "fact-patent-options",
        11,
        "assistant",
        "[BEAM chat_id=11 role=assistant time=unknown] There are several types of patent applications that could be relevant for an engineering student, including utility patents and provisional patents.",
      ),
      makeSourceFact(
        "fact-provisional-plan",
        12,
        "user",
        "[BEAM chat_id=12 role=user time=unknown] Utility patents sound most relevant for Francis. I'll encourage him to document everything thoroughly and maybe look into a provisional patent if his ideas are early stage.",
      ),
      makeSourceFact(
        "fact-attorney-resources",
        13,
        "assistant",
        "[BEAM chat_id=13 role=assistant time=unknown] That's a great plan. Finding a reliable patent attorney is crucial; start with college resources, bar association referrals, and online directories.",
      ),
      makeSourceFact(
        "fact-college-bar-plan",
        14,
        "user",
        "[BEAM chat_id=14 role=user time=unknown] I'll start by checking with Montserrat Community College for resources or connections with patent attorneys, reach out to the Montserrat Bar Association for referrals, and use online directories.",
      ),
      makeSourceFact(
        "fact-college-bar-summary",
        15,
        "assistant",
        "[BEAM chat_id=15 role=assistant time=unknown] That's a solid plan: check with the college, contact the local bar association, use online directories, attend networking events, interview potential attorneys, and decide based on fit and budget.",
      ),
      makeSourceFact(
        "fact-later-local-attorney-noise",
        19,
        "assistant",
        "[BEAM chat_id=19 role=assistant time=unknown] Finding a local patent attorney who understands the UK system can be helpful.",
      ),
      makeSourceFact(
        "fact-later-business-association-noise",
        21,
        "assistant",
        "[BEAM chat_id=21 role=assistant time=unknown] Contact local business associations and online directories to find a reliable patent attorney.",
      ),
    ];

    const result = selectFacts(
      facts,
      "How did I plan to support my son's progress in his studies by connecting with local and external resources, and what steps did you recommend I take to find professional guidance for his inventions?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-patent-question",
      "fact-patent-options",
      "fact-provisional-plan",
      "fact-attorney-resources",
      "fact-college-bar-plan",
      "fact-college-bar-summary",
    ]);
  });

  it("returns Chinese source-ordered coverage for broad conversation summary questions", () => {
    const language = createLanguageService();
    const makeSourceFact = (
      id: string,
      sourceOrder: number,
      role: "assistant" | "user",
      content: string,
    ) =>
      createFactMemory({
        id,
        userId: "user-1",
        category: "external_benchmark",
        content,
        source: { ...SOURCE, locale: "zh-CN" },
        tags: [
          "source_message",
          "source_order",
          role === "assistant" ? "assistant_answer" : "user_answer",
        ],
        attributes: { sourceOrder },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-auth-zh",
        10,
        "user",
        "我先实现预算应用的用户认证和登录流程。",
      ),
      makeSourceFact(
        "fact-db-zh",
        30,
        "user",
        "接着我设计数据库 schema，保存收入、支出和分类。",
      ),
      makeSourceFact(
        "fact-deploy-zh",
        70,
        "user",
        "最后我处理部署和安全加固，准备上线。",
      ),
    ];

    const result = selectFacts(
      facts,
      "请总结我这个预算应用随着时间推进是怎么一步步解决问题的。",
      language,
      "zh-CN",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    expect(selectedIds).toContain("fact-auth-zh");
    expect(selectedIds).toContain("fact-db-zh");
    expect(selectedIds).toContain("fact-deploy-zh");
    expect(selectedIds.indexOf("fact-auth-zh")).toBeLessThan(
      selectedIds.indexOf("fact-deploy-zh"),
    );
  });

  it("adds applicable source-ordered user instruction evidence for guidance questions", () => {
    const language = createLanguageService();
    const makeSourceFact = (
      id: string,
      sourceOrder: number,
      content: string,
    ) =>
      createFactMemory({
        id,
        userId: "user-1",
        category: "external_benchmark",
        content,
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      createFactMemory({
        id: "fact-login-plan",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "Sprint plan for user registration and login feature implementation.",
        source: SOURCE,
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
      makeSourceFact(
        "fact-code-format-instruction",
        54,
        "Always format all code snippets with syntax highlighting when I ask about implementation details.",
      ),
      makeSourceFact(
        "fact-apa-instruction",
        112,
        "Always use APA 7th edition citation style when I ask about formatting references.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Could you show me how to implement a login feature?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    expect(selectedIds).toContain("fact-login-plan");
    expect(selectedIds).toContain("fact-code-format-instruction");
    expect(selectedIds).not.toContain("fact-apa-instruction");
  });

  it("does not treat broad domain overlap as applicable source-ordered instruction evidence", () => {
    const language = createLanguageService();
    const makeSourceFact = (
      id: string,
      sourceOrder: number,
      content: string,
    ) =>
      createFactMemory({
        id,
        userId: "user-1",
        category: "external_benchmark",
        content,
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-api-key-date",
        32,
        "I obtained my OpenWeather API key on March 10, 2024 while building the weather app.",
      ),
      makeSourceFact(
        "fact-wireframe-date",
        42,
        "I completed the UI wireframe for my weather app on March 12, 2024.",
      ),
      makeSourceFact(
        "fact-weather-condition-instruction",
        68,
        "Always provide temperature readings in Celsius when I ask about weather conditions.",
      ),
      makeSourceFact(
        "fact-api-error-instruction",
        130,
        "Always include error status codes in responses when I ask about API error handling.",
      ),
    ];

    const result = selectFacts(
      facts,
      "How many days passed between when I obtained my OpenWeather API key and when I completed the UI wireframe for my weather app?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    expect(selectedIds).toContain("fact-api-key-date");
    expect(selectedIds).toContain("fact-wireframe-date");
    expect(selectedIds).not.toContain("fact-weather-condition-instruction");
    expect(selectedIds).not.toContain("fact-api-error-instruction");
  });

  it("keeps adjacent source-ordered continuation evidence for event-order questions", () => {
    const language = createLanguageService();
    const makeFact = (id: string, sourceOrder: number, content: string) =>
      createFactMemory({
        id,
        userId: "user-1",
        category: "external_benchmark",
        content,
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeFact(
        "fact-breakdown",
        2,
        "Budget tracker development breakdown: authentication, expenses, analytics, and reporting.",
      ),
      makeFact(
        "fact-core",
        4,
        "I want to build the core budget tracker app with authentication and expense tracking.",
      ),
      makeFact(
        "fact-local-setup",
        6,
        "I am setting up Flask locally on port 5000 for app development.",
      ),
      makeFact(
        "fact-schema",
        12,
        "I am defining the schema, validation, and transaction models.",
      ),
      makeFact(
        "fact-password",
        16,
        "I am adding password hashing and authentication validation.",
      ),
      makeFact(
        "fact-wireframe",
        18,
        "I am building the first wireframe for the Flask app.",
      ),
      makeFact(
        "fact-minimal",
        34,
        "I want the app to stay minimal while shipping the MVP.",
      ),
      makeFact(
        "fact-blueprints",
        48,
        "I am splitting the app into auth, transactions, and analytics blueprints.",
      ),
      makeFact(
        "fact-sprint",
        52,
        "I am planning the next app-development sprint.",
      ),
      makeFact(
        "fact-transaction-crud",
        60,
        "I am working on transaction CRUD and analytics integration.",
      ),
      makeFact(
        "fact-transaction-post",
        62,
        "I am implementing the POST /transactions route and response handling.",
      ),
      makeFact(
        "fact-rest-api",
        82,
        "I am designing a REST API with validation and error handling.",
      ),
      makeFact(
        "fact-logging",
        96,
        "I am configuring Flask logging for deployment diagnostics.",
      ),
      makeFact(
        "fact-security-preface",
        108,
        "I am reviewing security improvements before deployment.",
      ),
      makeFact(
        "fact-security-review",
        116,
        "I am finalizing deployment and reviewing authentication hardening.",
      ),
      makeFact(
        "fact-gunicorn-tests",
        118,
        "I am reviewing Gunicorn deployment and integration tests for auth and transaction CRUD.",
      ),
      makeFact(
        "fact-security-tests",
        120,
        "Let's do it!",
      ),
      makeFact(
        "fact-docs",
        176,
        "I am documenting architecture decisions and API endpoints.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you walk me through the order in which I brought up different aspects of my app development and deployment across our conversations?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toContain("fact-security-tests");
  });

  it("returns contradictory source-message pairs for factual confirmation questions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-routing-tutorial",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I'm trying to review Flask routing, request handling, and session management tutorials before deciding how to implement my app.\n@app.route('/login')\ndef login():\n  return 'ok'",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 22 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-homepage-route",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I implemented the basic homepage route with Flask and returned static HTML from @app.route('/').",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 24 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-regular-routes-question",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "Can I still use regular Flask routes alongside API endpoints?",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 38 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-never-routes",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I've never written any Flask routes or handled HTTP requests in this project, so I'm starting from scratch.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 58 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-refactor",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I am refactoring legacy Flask code for maintainability and better function naming.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 160 },
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "Have I worked with Flask routes and handled HTTP requests in this project?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-homepage-route",
      "fact-never-routes",
    ]);
  });

  it("prefers user-grounded contradiction pairs over repeated assistant context", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-homepage-route",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I'm trying to implement the basic homepage route with Flask, and I've managed to return static HTML from @app.route('/').",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 24 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-never-routes",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I've never written any Flask routes or handled HTTP requests in this project, so I'm starting from scratch.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 58 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-flask-login-context",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "I'm trying to integrate Flask-Login for session management. I've already implemented a basic homepage route, and I've never written any Flask routes or handled HTTP requests in this project before.",
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 66 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-flask-login-answer",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "Assistant answer: here is a complete Flask-Login example with registration, login, session management, and transaction CRUD integration.",
        source: SOURCE,
        tags: ["assistant_answer", "source_message", "source_order"],
        attributes: { sourceOrder: 67 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-render-answer",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "Assistant answer: update your Gunicorn configuration and Render.com deployment scripts for HTTPS.",
        source: SOURCE,
        tags: ["assistant_answer", "source_message", "source_order"],
        attributes: { sourceOrder: 125 },
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "Have I worked with Flask routes and handled HTTP requests in this project?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-homepage-route",
      "fact-never-routes",
    ]);
  });

  it("returns Chinese contradiction evidence pairs for implementation confirmation queries", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-route-implemented-zh",
        userId: "user-1",
        category: "external_benchmark",
        content: "我已经实现了 Flask 首页路由，并且能从 @app.route('/') 返回静态 HTML。",
        source: { ...SOURCE, locale: "zh-CN" },
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 24 },
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-route-never-zh",
        userId: "user-1",
        category: "external_benchmark",
        content: "我从来没写过 Flask 路由，也没有处理过 HTTP 请求。",
        source: { ...SOURCE, locale: "zh-CN" },
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: 58 },
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "我有没有实现过 Flask 路由并处理 HTTP 请求？",
      language,
      "zh-CN",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-route-implemented-zh",
      "fact-route-never-zh",
    ]);
  });

  it("prioritizes compact dated nursery facts for temporal event-order questions", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-nursery-generic",
        userId: "user-1",
        category: "external_benchmark",
        content:
          "On 2023/02/05, I'm expecting a new baby in my social circle soon and I'm thinking of getting a gift.",
        source: SOURCE,
        tags: ["compact_evidence"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-nursery-dated",
        userId: "user-1",
        category: "external_benchmark",
        content: "On 2023/02/05, I helped my friend prepare the nursery.",
        source: SOURCE,
        tags: ["answer_session", "dated_event"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-shower-dated",
        userId: "user-1",
        category: "external_benchmark",
        content: "On 2023/02/10, I helped my cousin pick out stuff for her baby shower.",
        source: SOURCE,
        tags: ["answer_session", "dated_event"],
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-phone-dated",
        userId: "user-1",
        category: "external_benchmark",
        content: "On 2023/02/20, I ordered a customized phone case for my friend's birthday.",
        source: SOURCE,
        tags: ["user_answer", "dated_event"],
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "Which three events happened in the order from first to last: the day I helped my friend prepare the nursery, the day I helped my cousin pick out stuff for her baby shower, and the day I ordered a customized phone case for my friend's birthday?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-nursery-dated",
      "fact-shower-dated",
      "fact-phone-dated",
    ]);
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

  it("returns active feedback for summary composition queries with weak lexical overlap", () => {
    const language = createLanguageService();
    const feedback = [
      createFeedbackMemory({
        id: "feedback-summary",
        userId: "user-1",
        rule: "Use bullet points in summaries.",
        kind: "validated_pattern",
        appliesTo: "general_response",
        source: SOURCE,
        updatedAt: "2026-01-10T00:00:00.000Z",
      }),
    ];

    const selected = selectFeedbackForQuery(
      feedback,
      "Please summarize the current rollout status.",
      language,
      "en-US",
      "general_chat",
    );

    expect(selected.map((record) => record.id)).toEqual(["feedback-summary"]);
  });

  it("matches feedback by rule text when metadata terms dilute full-search overlap", () => {
    const language = createLanguageService();
    const feedback = [
      createFeedbackMemory({
        id: "feedback-outcome",
        userId: "user-1",
        rule:
          "When detailed analysis previously caused DeepAnalyzer timeouts, avoid DeepAnalyzer on the first action and use QuickCheck before proceeding.",
        kind: "validated_pattern",
        appliesTo: "general_response",
        source: SOURCE,
        updatedAt: "2026-01-10T00:00:00.000Z",
      }),
    ];

    const selected = selectFeedbackForQuery(
      feedback,
      "I need a detailed analysis of our network traffic.",
      language,
      "en-US",
      "general_chat",
    );

    expect(selected.map((record) => record.id)).toEqual(["feedback-outcome"]);
  });
});
