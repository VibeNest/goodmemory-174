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

  it("returns declined financial opportunity amounts for cross-session comparisons", () => {
    const language = createLanguageService();
    const makeFact = (
      id: string,
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
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeFact(
        "fact-rejected-raise-user",
        "I'm kinda torn about rejecting that $10,000 raise on March 12, was that a smart move considering my current situation?",
      ),
      makeFact(
        "fact-rejected-raise-assistant",
        "Deciding whether to reject a $10,000 raise is a significant decision with financial and career tradeoffs.",
        "assistant",
      ),
      makeFact(
        "fact-declined-freelance-user",
        "I'm worried that declining the $5,000 freelance project on April 1 might have been a mistake.",
      ),
      makeFact(
        "fact-declined-freelance-assistant",
        "Declining the $5,000 freelance project can make sense if onboarding for the new job is the higher priority.",
        "assistant",
      ),
      makeFact(
        "fact-declined-bonus-user",
        "I'm struggling with the idea of free will after declining a $12,000 bonus on May 15 due to ethical concerns.",
      ),
      makeFact(
        "fact-declined-bonus-assistant",
        "Declining a $12,000 bonus because of ethical concerns shows a clear values-based financial tradeoff.",
        "assistant",
      ),
      makeFact(
        "fact-accepted-offer-noise",
        "I accepted a $95,000 job offer because the startup growth opportunity was exciting.",
      ),
      makeFact(
        "fact-free-will-noise",
        "I journaled about free will and fiction writing during a walk with Tanya.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Considering the financial opportunities I declined—a raise, a freelance project, and a bonus—how do the total amounts I turned down compare?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id))).toEqual(
      new Set([
        "fact-rejected-raise-user",
        "fact-rejected-raise-assistant",
        "fact-declined-freelance-user",
        "fact-declined-freelance-assistant",
        "fact-declined-bonus-user",
        "fact-declined-bonus-assistant",
      ]),
    );
    expect(result.traces.find((trace) => trace.memoryId === "fact-accepted-offer-noise")?.returned).toBe(false);
    expect(result.traces.find((trace) => trace.memoryId === "fact-free-will-noise")?.returned).toBe(false);
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

  it("returns Chinese declined financial opportunity amounts for cross-session comparisons", () => {
    const language = createLanguageService();
    const makeFact = (
      id: string,
      content: string,
      role: "assistant" | "user" = "user",
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
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeFact(
        "fact-rejected-raise-zh",
        "我在3月12日拒绝了一次10000元加薪，因为我担心它和当前职业方向不一致。",
      ),
      makeFact(
        "fact-rejected-raise-answer-zh",
        "拒绝10000元加薪意味着你在薪资和长期职业取舍之间做了选择。",
        "assistant",
      ),
      makeFact(
        "fact-declined-freelance-zh",
        "我在4月1日放弃了5000元自由职业项目，想把精力留给新工作的入职任务。",
      ),
      makeFact(
        "fact-declined-freelance-answer-zh",
        "放弃5000元自由职业项目可以理解为优先保证新工作过渡。",
        "assistant",
      ),
      makeFact(
        "fact-declined-bonus-zh",
        "我在5月15日因为伦理顾虑拒绝了12000元奖金。",
      ),
      makeFact(
        "fact-declined-bonus-answer-zh",
        "拒绝12000元奖金说明你把价值观和伦理考虑放在直接收益之前。",
        "assistant",
      ),
      makeFact(
        "fact-accepted-offer-zh",
        "我接受了95000元的工作机会，因为创业公司的成长空间很大。",
      ),
      makeFact(
        "fact-reflection-zh",
        "我写日记反思自由意志和小说创作。",
      ),
    ];

    const result = selectFacts(
      facts,
      "对比我拒绝过的财务机会，包括加薪、自由职业项目和奖金，这些放弃的金额分别是多少？",
      language,
      "zh-CN",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(new Set(result.facts.map((fact) => fact.id))).toEqual(
      new Set([
        "fact-rejected-raise-zh",
        "fact-rejected-raise-answer-zh",
        "fact-declined-freelance-zh",
        "fact-declined-freelance-answer-zh",
        "fact-declined-bonus-zh",
        "fact-declined-bonus-answer-zh",
      ]),
    );
    expect(result.traces.find((trace) => trace.memoryId === "fact-accepted-offer-zh")?.returned).toBe(false);
    expect(result.traces.find((trace) => trace.memoryId === "fact-reflection-zh")?.returned).toBe(false);
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

  it("returns Chinese source-ordered preference evidence for implementation help questions", () => {
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
        source: { ...SOURCE, locale: "zh-CN" },
        tags,
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-assistant-caching-zh",
        47,
        "[BEAM chat_id=47 role=assistant time=unknown] 用 localStorage 缓存 API 响应是一个可行方案。",
        ["source_message", "source_order", "assistant_answer"],
      ),
      makeSourceFact(
        "fact-cache-implementation-noise-zh",
        52,
        "[BEAM chat_id=52 role=user time=unknown] 我实现了带 TTL 和失效检查的 API 响应缓存。",
      ),
      makeSourceFact(
        "fact-lightweight-preference-zh",
        54,
        "[BEAM chat_id=54 role=user time=unknown] 我想让天气应用保持在 2.5MB 以下，所以我更喜欢轻量、无外部依赖的方案，不想用很重的框架。",
      ),
      makeSourceFact(
        "fact-later-cache-implementation-zh",
        64,
        "[BEAM chat_id=64 role=user time=unknown] 我用内存缓存和 TTL 实现了 OpenWeather API 响应缓存。",
      ),
    ];

    const result = selectFacts(
      facts,
      "帮我做一个 API 响应缓存系统，我希望方案简单直接，尽量不要外部依赖。",
      language,
      "zh-CN",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toContain(
      "fact-lightweight-preference-zh",
    );
    expect(result.traces.find((trace) => trace.memoryId === "fact-lightweight-preference-zh")?.returned).toBe(true);
  });

  it("bridges source-ordered preferences to the adjacent implementation rationale", () => {
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
        "fact-heavy-framework-noise",
        8,
        "user",
        "[BEAM chat_id=8 role=user time=unknown] I tried a generic React dashboard tutorial with several third-party caching packages.",
      ),
      makeSourceFact(
        "fact-lightweight-cache-preference",
        20,
        "user",
        "[BEAM chat_id=20 role=user time=unknown] I prefer lightweight, dependency-free caching for my weather app because I want to keep the bundle small.",
      ),
      makeSourceFact(
        "fact-lightweight-cache-rationale",
        21,
        "assistant",
        "[BEAM chat_id=21 role=assistant time=unknown] We chose localStorage plus an in-memory TTL cache because it preserves the lightweight preference without adding external libraries.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you help me choose a caching approach that fits my lightweight preference for the weather app?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    expect(selectedIds).toContain("fact-lightweight-cache-preference");
    expect(selectedIds).toContain("fact-lightweight-cache-rationale");
    expect(result.traces.find((trace) => trace.memoryId === "fact-heavy-framework-noise")?.returned).toBe(false);
  });

  it("bridges earlier and later source turns for update reasoning questions", () => {
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
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-react-initial-plan",
        10,
        "[BEAM chat_id=10 role=user time=unknown] I initially planned to use React 18.2 for the dashboard because I wanted reusable components.",
      ),
      makeSourceFact(
        "fact-generic-dashboard-noise",
        32,
        "[BEAM chat_id=32 role=user time=unknown] I reviewed a generic dashboard color palette and spacing checklist.",
      ),
      makeSourceFact(
        "fact-vanilla-switch-update",
        64,
        "[BEAM chat_id=64 role=user time=unknown] I switched to vanilla JavaScript for the dashboard because the bundle stayed smaller and deployment was faster.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Given the switch, should I use React or vanilla JavaScript for the dashboard?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    expect(selectedIds).toContain("fact-react-initial-plan");
    expect(selectedIds).toContain("fact-vanilla-switch-update");
    expect(result.traces.find((trace) => trace.memoryId === "fact-generic-dashboard-noise")?.returned).toBe(false);
  });

  it("selects source user turns for rescheduled meeting time updates", () => {
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
          role === "user" ? "user_answer" : "assistant_answer",
        ],
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-writing-draft-noise",
        32,
        "user",
        "[BEAM chat_id=32 role=user time=unknown] I worked on my draft at 2 PM and updated the outline for a different professor.",
      ),
      makeSourceFact(
        "fact-zoom-original",
        44,
        "user",
        "[BEAM chat_id=44 role=user time=unknown] I have a Zoom meeting with Professor Danielle on March 22 at 3 PM to review my draft.",
      ),
      makeSourceFact(
        "fact-zoom-rescheduled",
        46,
        "user",
        "[BEAM chat_id=46 role=user time=unknown] Actually, Professor Danielle emailed to reschedule the Zoom meeting for March 22 at 4:30 PM instead.",
      ),
      makeSourceFact(
        "fact-assistant-answer",
        49,
        "assistant",
        "[BEAM chat_id=49 role=assistant time=unknown] You should plan to join the Zoom meeting with Professor Danielle at 4:30 PM.",
      ),
    ];

    const result = selectFacts(
      facts,
      "What time should I plan to join the Zoom meeting with Professor Danielle to review my draft?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    expect(selectedIds).toContain("fact-zoom-original");
    expect(selectedIds).toContain("fact-zoom-rescheduled");
    expect(selectedIds).not.toContain("fact-assistant-answer");
    expect(result.traces.find((trace) => trace.memoryId === "fact-writing-draft-noise")?.returned).toBe(false);
  });

  it("selects source user turns for changed visit time updates", () => {
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
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-foot-locker-original",
        34,
        "[BEAM chat_id=34 role=user time=unknown] I'm planning to visit Foot Locker next Saturday at 3 PM to compare running shoes.",
      ),
      makeSourceFact(
        "fact-sneaker-noise",
        42,
        "[BEAM chat_id=42 role=user time=unknown] I compared sneaker reviews at 11 AM but did not mention Foot Locker.",
      ),
      makeSourceFact(
        "fact-foot-locker-updated",
        56,
        "[BEAM chat_id=56 role=user time=unknown] I'm free at 4 PM next Saturday for the Foot Locker visit.",
      ),
    ];

    const result = selectFacts(
      facts,
      "What time should I plan to visit Foot Locker next Saturday?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    expect(selectedIds).toEqual([
      "fact-foot-locker-original",
      "fact-foot-locker-updated",
    ]);
  });

  it("selects the exact source turn for duration improvement questions", () => {
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
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-conditional-probability-improvement",
        84,
        "[BEAM chat_id=84 role=user time=unknown] I'm trying to understand how my accuracy in conditional probability problems improved from 60% to 85% over 2 weeks, after completing 8 problems.",
      ),
      makeSourceFact(
        "fact-permutation-noise",
        168,
        "[BEAM chat_id=168 role=user time=unknown] I completed 12 permutation and combination problems with 90% accuracy on the last 5 problems.",
      ),
      makeSourceFact(
        "fact-coin-toss-noise",
        200,
        "[BEAM chat_id=200 role=user time=unknown] I solved a coin toss probability problem involving exactly 2 heads in 3 tosses.",
      ),
    ];

    const result = selectFacts(
      facts,
      "How long did it take me to improve my accuracy from 60% to 85% after I started working on those problems?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-conditional-probability-improvement",
    ]);
  });

  it("selects paired source turns for percentage improvement order questions", () => {
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
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-quiz-score-improvement",
        32,
        "[BEAM chat_id=32 role=user time=unknown] My quiz score improved from 65% to 82% after focusing on triangle side classifications and angle-side relationships.",
      ),
      makeSourceFact(
        "fact-median-noise",
        84,
        "[BEAM chat_id=84 role=user time=unknown] I applied a median length formula to a triangle with sides 9, 12, and 15 cm.",
      ),
      makeSourceFact(
        "fact-test-score-improvement",
        156,
        "[BEAM chat_id=156 role=user time=unknown] My test score improved from 80% to 92% on congruence proofs and similarity ratio calculations.",
      ),
      makeSourceFact(
        "fact-practice-test-noise",
        172,
        "[BEAM chat_id=172 role=user time=unknown] I scored 18/20 on a practice test involving triangle congruence proofs and similarity ratio problems.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Which improvement happened first: my quiz score increasing from 65% to 82% after focusing on triangle side classifications, or my test score rising from 80% to 92% on congruence proofs and similarity calculations?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-quiz-score-improvement",
      "fact-test-score-improvement",
    ]);
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

  it("keeps source-ordered error and promise-rejection milestones for broad event-order questions", () => {
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
        "fact-weather-structure",
        6,
        "I'm building a weather app using JavaScript and OpenWeather API v2.5, and I need help structuring the code.",
      ),
      makeFact(
        "fact-city-autocomplete",
        20,
        "I'm implementing city autocomplete with a debounce delay in my weather app.",
      ),
      makeFact(
        "fact-invalid-city-errors",
        28,
        "I'm trying to handle errors for invalid city names in my weather app, and I want to display user-friendly messages for HTTP 404 and 400 status codes while using asynchronous fetch calls.",
      ),
      makeFact(
        "fact-vanilla-js",
        44,
        "I'm deciding between pure JavaScript and React for the weather app frontend and chose vanilla JavaScript for simplicity.",
      ),
      makeFact(
        "fact-robust-api-errors",
        72,
        "I'm integrating city autocomplete into my weather app and want to make sure I'm handling API errors more robustly with try-catch blocks.",
      ),
      makeFact(
        "fact-network-retry",
        102,
        "I'm having trouble with the Failed to fetch network error on slow connections and added retry logic after three failed attempts.",
      ),
      makeFact(
        "fact-test-coverage",
        114,
        "I'm trying to reach full test coverage for API integration, including network errors, invalid responses, and authentication issues.",
      ),
      makeFact(
        "fact-api-error-boundary",
        136,
        "I'm trying to implement an error boundary component in vanilla JavaScript to catch runtime errors and show a fallback UI.",
      ),
      makeFact(
        "fact-unhandled-promise",
        162,
        "I'm having trouble with the fetchWeatherData function, specifically the Unhandled Promise Rejection warning that I've been trying to fix by adding try/catch blocks around async calls.",
      ),
      makeFact(
        "fact-cache-race",
        166,
        "I'm optimizing weather app caching for the last three searched cities in localStorage and handling possible race conditions.",
      ),
      makeFact(
        "fact-e2e-error-display",
        172,
        "I'm adding Cypress end-to-end tests for search, autocomplete, error display, and the retry mechanism.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you list the order in which I brought up different aspects of handling errors and promise rejections in my weather app code throughout our conversations in order? Mention ONLY and ONLY five items.",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    expect(selectedIds).toContain("fact-invalid-city-errors");
    expect(selectedIds).toContain("fact-unhandled-promise");
    expect(
      selectedIds.indexOf("fact-invalid-city-errors"),
    ).toBeLessThan(selectedIds.indexOf("fact-unhandled-promise"));
  });

  it("keeps non-code professional-profile milestones for broad source-ordered aspect questions", () => {
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
        "fact-joshua-ats-budget",
        4,
        "I'm worried my resume will not pass applicant tracking systems, and Joshua advised me on project budgeting and networking strategy.",
      ),
      makeFact(
        "fact-joshua-keywords",
        6,
        "I'll share job descriptions and feedback with Joshua so we can add keywords and refine the budget management sections.",
      ),
      makeFact(
        "fact-april-deadline-distractor",
        14,
        "I'm worried my resume will not be ready by April 10 for film, television, and digital media jobs.",
      ),
      makeFact(
        "fact-ats-course-distractor",
        22,
        "I completed 40% of a LinkedIn Learning ATS optimization course and I am unsure whether I can optimize the resume by the time I finish.",
      ),
      makeFact(
        "fact-industry-expansion-answer",
        33,
        "Expanding your resume to include both film and digital media can broaden your professional profile across several industries.",
        "assistant",
      ),
      makeFact(
        "fact-work-life-answer",
        35,
        "Balancing work and personal life is important while you keep improving your resume and career profile.",
        "assistant",
      ),
      makeFact(
        "fact-ats-simulator-answer",
        47,
        "Use ATS simulators and structured bullet points with quantified achievements to test your resume.",
        "assistant",
      ),
      makeFact(
        "fact-streaming-answer",
        55,
        "For Netflix and Hulu roles, highlight streaming platform skills and digital media experience in your resume.",
        "assistant",
      ),
      makeFact(
        "fact-linkedin-views",
        60,
        "I collaborated with Bryan on a LinkedIn profile update on April 20 and increased profile views by 60%.",
      ),
      makeFact(
        "fact-portfolio-distractor",
        66,
        "I finished a Squarespace portfolio redesign on May 1 for digital media roles and declined a $75,000 assistant producer offer.",
      ),
      makeFact(
        "fact-workshop-distractor",
        82,
        "I attended a workshop on international resume standards on May 3 and asked how to adapt my resume for the UK and Canadian markets.",
      ),
      makeFact(
        "fact-no-training-distractor",
        96,
        "I have never attended workshops or training sessions related to resume standards or ATS optimization.",
      ),
      makeFact(
        "fact-transferable-skills",
        110,
        "Kevin suggested I add transferable skills like remote team leadership to help my resume pass ATS screening.",
      ),
      makeFact(
        "fact-raise-negotiation",
        156,
        "I got a $12,000 raise in August 2024, and Joshua recommended adding it to my resume while I learn salary negotiation.",
      ),
      makeFact(
        "fact-european-markets",
        206,
        "David shared insights about adapting resumes for European markets and connecting that with portfolio performance metrics.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you list the order in which I brought up different aspects of improving my professional profile and resume throughout our conversations in order? Mention ONLY and ONLY six items.",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-joshua-ats-budget",
      "fact-joshua-keywords",
      "fact-linkedin-views",
      "fact-transferable-skills",
      "fact-raise-negotiation",
      "fact-european-markets",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    expect(
      selectedIds.indexOf("fact-joshua-ats-budget"),
    ).toBeLessThan(selectedIds.indexOf("fact-linkedin-views"));
    expect(
      selectedIds.indexOf("fact-linkedin-views"),
    ).toBeLessThan(selectedIds.indexOf("fact-transferable-skills"));
    expect(
      selectedIds.indexOf("fact-transferable-skills"),
    ).toBeLessThan(selectedIds.indexOf("fact-raise-negotiation"));
    expect(
      selectedIds.indexOf("fact-raise-negotiation"),
    ).toBeLessThan(selectedIds.indexOf("fact-european-markets"));
    for (const distractorId of [
      "fact-april-deadline-distractor",
      "fact-ats-course-distractor",
      "fact-industry-expansion-answer",
      "fact-work-life-answer",
      "fact-ats-simulator-answer",
      "fact-streaming-answer",
      "fact-portfolio-distractor",
      "fact-workshop-distractor",
      "fact-no-training-distractor",
    ]) {
      expect(result.traces.find((trace) => trace.memoryId === distractorId)?.returned).toBe(false);
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

  it("keeps user event-order queries on source-order evidence instead of latest-update evidence", () => {
    const language = createLanguageService();
    const makeFact = (id: string, sourceOrder: number, content: string) =>
      createFactMemory({
        id,
        userId: "user-1",
        category: "external_benchmark",
        content,
        source: SOURCE,
        tags: ["source_message", "source_order", "user_answer"],
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeFact(
        "fact-workout-distractor",
        8,
        "[BEAM chat_id=8 role=user time=unknown] These suggestions fit pretty well with what I am already doing. I started with the meditation app and could use support setting up a consistent workout routine, finding a local gym, or signing up for an online fitness class.",
      ),
      makeFact(
        "fact-greg-stress",
        24,
        "[BEAM chat_id=24 role=user time=unknown] I am stressed about collaborating with Greg on editing schedules and making our weekly meetings more productive.",
      ),
      makeFact(
        "fact-greg-agenda",
        26,
        "[BEAM chat_id=26 role=user time=unknown] I will send an agenda before our next meeting and encourage Greg to share his thoughts more openly.",
      ),
      makeFact(
        "fact-burnout-getaway",
        146,
        "[BEAM chat_id=146 role=user time=unknown] I am planning a weekend getaway with David and deciding whether to tell him about burnout and stress.",
      ),
      makeFact(
        "fact-anniversary",
        202,
        "[BEAM chat_id=202 role=user time=unknown] I am nervous about my upcoming anniversary dinner with David and want to make it special.",
      ),
      makeFact(
        "fact-anniversary-plan",
        204,
        "[BEAM chat_id=204 role=user time=unknown] I will reserve a table, plan the menu around David's favorites, bring flowers, and write a note.",
      ),
      makeFact(
        "fact-surprise",
        262,
        "[BEAM chat_id=262 role=user time=unknown] David planned a surprise picnic to celebrate my promotion and I want to return the favor.",
      ),
      makeFact(
        "fact-focus-distractor",
        350,
        "[BEAM chat_id=350 role=user time=unknown] I implemented Do Not Disturb mode on my work devices from 9 AM to 12 PM daily.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you walk me through the order in which I brought up different personal and work-related challenges during our chats, in order? Mention ONLY and ONLY four items.",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    expect(selectedIds).toContain("fact-greg-stress");
    expect(selectedIds).toContain("fact-burnout-getaway");
    expect(selectedIds).toContain("fact-anniversary");
    expect(selectedIds).toContain("fact-surprise");
    expect(
      selectedIds.indexOf("fact-greg-stress"),
    ).toBeLessThan(selectedIds.indexOf("fact-surprise"));
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

  it("keeps named source milestones for named-person progression summaries", () => {
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
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-grammarly-noise",
        102,
        "[BEAM chat_id=102 role=user time=unknown] I will set up scheduled Grammarly Premium checks to catch errors and refine my writing as I go along.",
      ),
      makeSourceFact(
        "fact-robert-first-meeting",
        14,
        "[BEAM chat_id=14 role=user time=unknown] I'm worried about meeting my new academic mentor, Robert, at the East Janethaven Library on Feb 10, 2024, and want to make a good impression. ->-> 1,5",
      ),
      makeSourceFact(
        "fact-literature-review-noise",
        178,
        "[BEAM chat_id=178 role=user time=unknown] I've decided to restructure my paper for a journal format, adding a 500-word literature review section.",
      ),
      makeSourceFact(
        "fact-robert-essay-angle",
        64,
        "[BEAM chat_id=64 role=user time=unknown] Robert shared his 1985 essay on gender studies during our April 4 Zoom call, and I want to use some argument angles without copying him. ->-> 2,8",
      ),
      makeSourceFact(
        "fact-close-reading-noise",
        238,
        "[BEAM chat_id=238 role=user time=unknown] I annotated three articles extensively and summarized each section for close reading practice.",
      ),
      makeSourceFact(
        "fact-robert-warrants",
        124,
        "[BEAM chat_id=124 role=user time=unknown] I'm deciding whether to prioritize Robert's recommendation to use stronger warrants for claims on gender bias after he reviewed my draft on May 9. ->-> 3,10",
      ),
      makeSourceFact(
        "fact-robert-journal",
        170,
        "[BEAM chat_id=170 role=user time=unknown] Robert suggested submitting my essay to a journal while I am also working on a conference paper with Greg. ->-> 4,6",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you give me a summary of how my work and interactions with Robert have developed over time, including the key steps and decisions I've made along the way?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-robert-first-meeting",
      "fact-robert-essay-angle",
      "fact-robert-warrants",
      "fact-robert-journal",
    ]);
  });

  it("keeps adjacent named assistant synthesis for named-person progression summaries", () => {
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
        "fact-budget-noise",
        28,
        "user",
        "[BEAM chat_id=28 role=user time=unknown] I created a monthly budget by April 1 and tracked all expenses over $20.",
      ),
      makeSourceFact(
        "fact-alexis-joint-account-user",
        64,
        "user",
        "[BEAM chat_id=64 role=user time=unknown] I'm stressed about managing our finances with my spouse Alexis after she suggested switching to a joint savings account at First National Bank on May 5. ->-> 2,6",
      ),
      makeSourceFact(
        "fact-alexis-joint-account-assistant",
        65,
        "assistant",
        "[BEAM chat_id=65 role=assistant time=unknown] Opening a joint savings account with Alexis can help you coordinate shared financial goals if you both agree on check-ins and contribution rules.",
      ),
      makeSourceFact(
        "fact-alexis-hours-user",
        228,
        "user",
        "[BEAM chat_id=228 role=user time=unknown] I will reduce my hours to 30 per week starting January to support Alexis's business launch.",
      ),
      makeSourceFact(
        "fact-alexis-hours-assistant",
        229,
        "assistant",
        "[BEAM chat_id=229 role=assistant time=unknown] Reducing your hours while supporting Alexis's business launch is a strategic financial tradeoff that should be reviewed against your household budget.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you summarize how my approach to managing finances with Alexis has developed over time?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-alexis-joint-account-user",
      "fact-alexis-joint-account-assistant",
      "fact-alexis-hours-user",
      "fact-alexis-hours-assistant",
    ]);
  });

  it("prioritizes named relationship work decisions over generic named reflections", () => {
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
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = Array.from({ length: 16 }, (_, index) =>
      makeSourceFact(
        `fact-generic-${index}`,
        index,
        `[BEAM chat_id=${index} role=user time=unknown] Stephen and I talked about our relationship in a general reflection about free will.`,
      )
    );
    facts[2] = makeSourceFact(
      "fact-generic-work-reflection",
      2,
      "[BEAM chat_id=2 role=user time=unknown] I am wondering how my relationship and work commitments with Stephen relate to personal growth in general.",
    );
    facts[3] = makeSourceFact(
      "fact-stephen-trip-limit",
      3,
      "[BEAM chat_id=3 role=user time=unknown] I agreed to limit my work trips to 3 per quarter starting June for Stephen.",
    );

    const result = selectFacts(
      facts,
      "Can you summarize how I have managed my relationship and work commitments with Stephen over time?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    expect(selectedIds).toContain("fact-stephen-trip-limit");
    expect(selectedIds).not.toContain("fact-generic-work-reflection");
  });

  it("does not route broad conversation summaries through contradiction confirmation", () => {
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
        "fact-palette-user",
        4,
        "user",
        "[BEAM chat_id=4 role=user time=unknown] I built the first portfolio website feature: a color palette generator for my skills section.",
      ),
      makeSourceFact(
        "fact-palette-assistant",
        5,
        "assistant",
        "[BEAM chat_id=5 role=assistant time=unknown] We implemented the palette generator functions and Bootstrap styling.",
      ),
      makeSourceFact(
        "fact-structure-user",
        6,
        "user",
        "[BEAM chat_id=6 role=user time=unknown] I set up the portfolio website About, Skills, Projects, and Contact sections.",
      ),
      makeSourceFact(
        "fact-bootstrap-positive",
        38,
        "user",
        "[BEAM chat_id=38 role=user time=unknown] I implemented Bootstrap styling for the portfolio website project.",
      ),
      makeSourceFact(
        "fact-bootstrap-negated",
        39,
        "user",
        "[BEAM chat_id=39 role=user time=unknown] I have never implemented any Bootstrap components in this portfolio website project before.",
      ),
      makeSourceFact(
        "fact-gallery-user",
        58,
        "user",
        "[BEAM chat_id=58 role=user time=unknown] I integrated the project gallery and contact form and hit responsive layout issues.",
      ),
      makeSourceFact(
        "fact-gallery-assistant",
        59,
        "assistant",
        "[BEAM chat_id=59 role=assistant time=unknown] We fixed responsive gallery image sizing and layout issues.",
      ),
      makeSourceFact(
        "fact-sprint-user",
        82,
        "user",
        "[BEAM chat_id=82 role=user time=unknown] I worked on Sprint 2 SEO basics and contact form backend integration.",
      ),
      makeSourceFact(
        "fact-sprint-assistant",
        83,
        "assistant",
        "[BEAM chat_id=83 role=assistant time=unknown] We planned Sprint 2 tasks for SEO, backend integration, validation, and performance.",
      ),
      makeSourceFact(
        "fact-late-gallery-user",
        116,
        "user",
        "[BEAM chat_id=116 role=user time=unknown] I updated the project gallery to 10 cards and got image 404 errors.",
      ),
      makeSourceFact(
        "fact-late-gallery-assistant",
        117,
        "assistant",
        "[BEAM chat_id=117 role=assistant time=unknown] We resolved layout issues and 404 errors for project images.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you give me a comprehensive summary of how my portfolio website project has developed, including the key features and challenges I have worked through so far?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    for (const expectedId of [
      "fact-palette-user",
      "fact-gallery-user",
      "fact-sprint-user",
      "fact-late-gallery-user",
    ]) {
      expect(result.facts.map((fact) => fact.id)).toContain(expectedId);
    }
  });

  it("prioritizes source-ordered implementation milestones over weak summary follow-ups", () => {
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
        "fact-palette-user",
        4,
        "user",
        "[BEAM chat_id=4 role=user time=unknown] I'm building my first portfolio website using HTML5, CSS3, and Bootstrap v5.3.0, and I want to implement a color palette generator for my skills section.",
      ),
      makeSourceFact(
        "fact-palette-assistant",
        5,
        "assistant",
        "[BEAM chat_id=5 role=assistant time=unknown] We implemented the color palette generator functions and Bootstrap styling.",
      ),
      makeSourceFact(
        "fact-structure-user",
        6,
        "user",
        "[BEAM chat_id=6 role=user time=unknown] I'm trying to set up a single-page portfolio with About, Skills, Projects, and Contact sections.",
      ),
      makeSourceFact(
        "fact-structure-assistant",
        7,
        "assistant",
        "[BEAM chat_id=7 role=assistant time=unknown] We built the HTML structure and responsive Bootstrap layout for the portfolio sections.",
      ),
      makeSourceFact(
        "fact-bootstrap-user",
        10,
        "user",
        "[BEAM chat_id=10 role=user time=unknown] I'm trying to integrate the Bootstrap 5.3.0 CDN into my portfolio website for a responsive navbar and cards.",
      ),
      makeSourceFact(
        "fact-bootstrap-assistant",
        11,
        "assistant",
        "[BEAM chat_id=11 role=assistant time=unknown] We refined the navbar and card component setup with Bootstrap.",
      ),
      makeSourceFact(
        "fact-contact-user",
        16,
        "user",
        "[BEAM chat_id=16 role=user time=unknown] I'm trying to implement the contact form with validation as part of my MVP features.",
      ),
      makeSourceFact(
        "fact-contact-assistant",
        17,
        "assistant",
        "[BEAM chat_id=17 role=assistant time=unknown] We built the contact form validation and submission handling.",
      ),
      makeSourceFact(
        "fact-sass-user",
        28,
        "user",
        "[BEAM chat_id=28 role=user time=unknown] hmm, can I use Sass to create a similar component for the project gallery?",
      ),
      makeSourceFact(
        "fact-sass-assistant",
        29,
        "assistant",
        "[BEAM chat_id=29 role=assistant time=unknown] We discussed a Sass component for the project gallery.",
      ),
      makeSourceFact(
        "fact-lighthouse-user",
        40,
        "user",
        "[BEAM chat_id=40 role=user time=unknown] I'm trying to identify SEO and performance issues in my portfolio website using Lighthouse v10 audit.",
      ),
      makeSourceFact(
        "fact-lighthouse-assistant",
        41,
        "assistant",
        "[BEAM chat_id=41 role=assistant time=unknown] We reviewed Lighthouse performance, accessibility, and SEO findings.",
      ),
      makeSourceFact(
        "fact-gallery-layout-user",
        58,
        "user",
        "[BEAM chat_id=58 role=user time=unknown] I'm integrating the project gallery and contact form, and I'm having layout responsiveness issues.",
      ),
      makeSourceFact(
        "fact-gallery-layout-assistant",
        59,
        "assistant",
        "[BEAM chat_id=59 role=assistant time=unknown] We fixed responsive gallery image sizing and layout issues.",
      ),
      makeSourceFact(
        "fact-gallery-404-user",
        62,
        "user",
        "[BEAM chat_id=62 role=user time=unknown] I'm encountering an issue where some project gallery images are not loading with 404 errors.",
      ),
      makeSourceFact(
        "fact-gallery-404-assistant",
        63,
        "assistant",
        "[BEAM chat_id=63 role=assistant time=unknown] We checked image paths and static file serving for gallery 404 errors.",
      ),
      makeSourceFact(
        "fact-form-validation-user",
        66,
        "user",
        "[BEAM chat_id=66 role=user time=unknown] I'm trying to implement the contact form with HTML5 validation and custom JS validation fallback.",
      ),
      makeSourceFact(
        "fact-form-validation-assistant",
        67,
        "assistant",
        "[BEAM chat_id=67 role=assistant time=unknown] We improved required fields, email validation, and custom validation fallback.",
      ),
      makeSourceFact(
        "fact-sprint-user",
        82,
        "user",
        "[BEAM chat_id=82 role=user time=unknown] I'm working on Sprint 2 with a deadline and need to focus on SEO basics and contact form backend integration.",
      ),
      makeSourceFact(
        "fact-sprint-assistant",
        83,
        "assistant",
        "[BEAM chat_id=83 role=assistant time=unknown] We planned Sprint 2 tasks for SEO, backend integration, validation, and performance.",
      ),
      makeSourceFact(
        "fact-meta-user",
        88,
        "user",
        "[BEAM chat_id=88 role=user time=unknown] I'm trying to improve SEO by adding meta descriptions, keywords, and Open Graph tags.",
      ),
      makeSourceFact(
        "fact-meta-assistant",
        89,
        "assistant",
        "[BEAM chat_id=89 role=assistant time=unknown] We added meta descriptions, keywords, and Open Graph examples.",
      ),
      makeSourceFact(
        "fact-late-gallery-user",
        116,
        "user",
        "[BEAM chat_id=116 role=user time=unknown] I'm trying to update my project gallery to include two new projects for a total of 10 cards, but the layout has issues.",
      ),
      makeSourceFact(
        "fact-late-gallery-assistant",
        117,
        "assistant",
        "[BEAM chat_id=117 role=assistant time=unknown] We resolved the 10-card gallery layout issues and image 404 errors.",
      ),
      makeSourceFact(
        "fact-css-refactor-user",
        146,
        "user",
        "[BEAM chat_id=146 role=user time=unknown] I'm trying to refactor my CSS from 450 lines to 320 lines by removing redundant selectors.",
      ),
      makeSourceFact(
        "fact-css-refactor-assistant",
        147,
        "assistant",
        "[BEAM chat_id=147 role=assistant time=unknown] We consolidated CSS selectors and media queries.",
      ),
      makeSourceFact(
        "fact-hosting-user",
        182,
        "user",
        "[BEAM chat_id=182 role=user time=unknown] hmm, which one has better support for automated backups and version control?",
      ),
      makeSourceFact(
        "fact-hosting-assistant",
        183,
        "assistant",
        "[BEAM chat_id=183 role=assistant time=unknown] We compared GitHub Pages and Netlify for backups and version control.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you give me a comprehensive summary of how my portfolio website project has developed, including the key features and challenges I have worked through so far?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-palette-user",
      "fact-structure-user",
      "fact-contact-user",
      "fact-gallery-layout-user",
      "fact-form-validation-user",
      "fact-sprint-user",
      "fact-late-gallery-user",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    expect(selectedIds).not.toContain("fact-sass-user");
    expect(selectedIds).not.toContain("fact-hosting-user");
  });

  it("keeps project lifecycle summary milestones across features timeline security and documentation", () => {
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
        "fact-core-feature-user",
        4,
        "user",
        "[BEAM chat_id=4 role=user time=unknown] I'm building a personal budget tracker using Python and Flask with user authentication, expense tracking, income tracking, and data visualization as the core functionality.",
      ),
      makeSourceFact(
        "fact-core-feature-assistant",
        5,
        "assistant",
        "[BEAM chat_id=5 role=assistant time=unknown] We implemented the budget tracker core functionality: registration, login, expense tracking, and Matplotlib data visualization.",
      ),
      makeSourceFact(
        "fact-schema-distractor-user",
        14,
        "user",
        "[BEAM chat_id=14 role=user time=unknown] I'm designing the database schema with users and transactions tables for the budget tracker.",
      ),
      makeSourceFact(
        "fact-schema-distractor-assistant",
        15,
        "assistant",
        "[BEAM chat_id=15 role=assistant time=unknown] We improved the transactions table schema and validation helpers.",
      ),
      makeSourceFact(
        "fact-mvp-timeline-user",
        8,
        "user",
        "[BEAM chat_id=8 role=user time=unknown] I need to meet the April 15 MVP deadline for income and expense tracking, user login, and basic analytics.",
      ),
      makeSourceFact(
        "fact-mvp-timeline-assistant",
        9,
        "assistant",
        "[BEAM chat_id=9 role=assistant time=unknown] We created a development timeline for the April 15 MVP scope covering tracking, login, and analytics.",
      ),
      makeSourceFact(
        "fact-sprint-distractor-user",
        28,
        "user",
        "[BEAM chat_id=28 role=user time=unknown] I'm planning a two-week sprint that focuses only on user registration and login.",
      ),
      makeSourceFact(
        "fact-sprint-distractor-assistant",
        29,
        "assistant",
        "[BEAM chat_id=29 role=assistant time=unknown] We made a sprint plan for registration and login tasks.",
      ),
      makeSourceFact(
        "fact-security-review-user",
        116,
        "user",
        "[BEAM chat_id=116 role=user time=unknown] I'm finalizing deployment, improving UI/UX based on feedback, and adding security hardening before public launch.",
      ),
      makeSourceFact(
        "fact-security-review-assistant",
        117,
        "assistant",
        "[BEAM chat_id=117 role=assistant time=unknown] We reviewed UI/UX and security hardening, including stronger authentication, authorization, HTTPS, and deployment safeguards.",
      ),
      makeSourceFact(
        "fact-lockout-user",
        150,
        "user",
        "[BEAM chat_id=150 role=user time=unknown] I'm implementing account lockout after 5 failed login attempts using Redis 7.0 for rate limiting.",
      ),
      makeSourceFact(
        "fact-lockout-assistant",
        151,
        "assistant",
        "[BEAM chat_id=151 role=assistant time=unknown] We refined the Redis account lockout implementation and rate limiting behavior for failed login attempts.",
      ),
      makeSourceFact(
        "fact-docs-user",
        176,
        "user",
        "[BEAM chat_id=176 role=user time=unknown] I need to document API endpoints and architecture decisions in Confluence for my remote collaborator.",
      ),
      makeSourceFact(
        "fact-docs-assistant",
        177,
        "assistant",
        "[BEAM chat_id=177 role=assistant time=unknown] We structured the Confluence documentation for API endpoints, architecture decisions, request examples, and feedback.",
      ),
      makeSourceFact(
        "fact-api-optimization-distractor-user",
        108,
        "user",
        "[BEAM chat_id=108 role=user time=unknown] I'm optimizing dashboard API response time to 250ms after caching tweaks and checking dependency versions.",
      ),
      makeSourceFact(
        "fact-api-optimization-distractor-assistant",
        109,
        "assistant",
        "[BEAM chat_id=109 role=assistant time=unknown] We discussed API optimization and dependency version examples.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you provide a comprehensive summary of how my budget tracker project has progressed, including the key features implemented, the development timeline, security enhancements, and documentation efforts?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-core-feature-user",
      "fact-mvp-timeline-user",
      "fact-security-review-user",
      "fact-lockout-user",
      "fact-docs-user",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    expect(selectedIds).not.toContain("fact-api-optimization-distractor-user");
  });

  it("prioritizes issue-resolution summary evidence over feature milestone distractors", () => {
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
        "fact-project-timeline",
        12,
        "user",
        "[BEAM chat_id=12 role=user time=unknown] I'm planning the web project timeline and first sprint for the basic layout and navbar.",
      ),
      makeSourceFact(
        "fact-css-debug-user",
        14,
        "user",
        "[BEAM chat_id=14 role=user time=unknown] I'm trying to debug a CSS layout issue in Chrome DevTools v112 and understand the box model.",
      ),
      makeSourceFact(
        "fact-css-debug-assistant",
        15,
        "assistant",
        "[BEAM chat_id=15 role=assistant time=unknown] We debugged the CSS box model by calculating element dimensions and inspecting padding, borders, and margins.",
      ),
      makeSourceFact(
        "fact-contact-feature",
        16,
        "user",
        "[BEAM chat_id=16 role=user time=unknown] I'm trying to implement the contact form with HTML5 validation as an MVP feature.",
      ),
      makeSourceFact(
        "fact-dom-error-user",
        30,
        "user",
        "[BEAM chat_id=30 role=user time=unknown] I'm trying to anticipate Uncaught TypeError: Cannot read property 'classList' of null during DOM manipulation.",
      ),
      makeSourceFact(
        "fact-dom-error-assistant",
        31,
        "assistant",
        "[BEAM chat_id=31 role=assistant time=unknown] We added null checks, optional chaining, and try-catch handling for the DOM manipulation error.",
      ),
      makeSourceFact(
        "fact-lighthouse-distractor",
        40,
        "user",
        "[BEAM chat_id=40 role=user time=unknown] I'm identifying SEO and performance issues in the portfolio website using Lighthouse v10 audit.",
      ),
      makeSourceFact(
        "fact-gallery-layout-distractor",
        58,
        "user",
        "[BEAM chat_id=58 role=user time=unknown] I'm integrating the project gallery and contact form and dealing with layout responsiveness.",
      ),
      makeSourceFact(
        "fact-gallery-404-user",
        62,
        "user",
        "[BEAM chat_id=62 role=user time=unknown] I'm encountering an issue where project gallery images are not loading and returning 404 errors.",
      ),
      makeSourceFact(
        "fact-gallery-404-assistant",
        63,
        "assistant",
        "[BEAM chat_id=63 role=assistant time=unknown] We checked image paths, static file serving, and build output to resolve the gallery 404 errors.",
      ),
      makeSourceFact(
        "fact-server-logs-user",
        64,
        "user",
        "[BEAM chat_id=64 role=user time=unknown] Ok cool, do I need to check anything specific in the server logs to find the issue?",
      ),
      makeSourceFact(
        "fact-server-logs-assistant",
        65,
        "assistant",
        "[BEAM chat_id=65 role=assistant time=unknown] We checked server logs for 404 errors, missing files, path mismatches, and deployment problems.",
      ),
      makeSourceFact(
        "fact-validate-error-user",
        68,
        "user",
        "[BEAM chat_id=68 role=user time=unknown] I'm trying to fix Uncaught ReferenceError: validateForm is not defined because the script src path is wrong.",
      ),
      makeSourceFact(
        "fact-validate-error-assistant",
        69,
        "assistant",
        "[BEAM chat_id=69 role=assistant time=unknown] We fixed the validateForm ReferenceError by correcting the script path and ensuring the function was defined.",
      ),
      makeSourceFact(
        "fact-file-structure-user",
        70,
        "user",
        "[BEAM chat_id=70 role=user time=unknown] ok cool, do I need to check anything specific in the file structure to make sure everything links correctly?",
      ),
      makeSourceFact(
        "fact-file-structure-assistant",
        71,
        "assistant",
        "[BEAM chat_id=71 role=assistant time=unknown] We checked the file structure, relative paths, folders, and script links so every resource linked correctly.",
      ),
      makeSourceFact(
        "fact-sprint-distractor",
        82,
        "user",
        "[BEAM chat_id=82 role=user time=unknown] I'm working on Sprint 2 tasks for SEO basics and contact form backend integration.",
      ),
      makeSourceFact(
        "fact-formspree-user",
        166,
        "user",
        "[BEAM chat_id=166 role=user time=unknown] I'm trying to fix an intermittent Formspree 500 Internal Server Error on my contact form submission.",
      ),
      makeSourceFact(
        "fact-formspree-assistant",
        167,
        "assistant",
        "[BEAM chat_id=167 role=assistant time=unknown] We improved the Formspree 500 handling with retry logic, exponential backoff, and separate network error handling.",
      ),
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
      "fact-css-debug-user",
      "fact-css-debug-assistant",
      "fact-dom-error-user",
      "fact-dom-error-assistant",
      "fact-gallery-404-user",
      "fact-gallery-404-assistant",
      "fact-server-logs-user",
      "fact-server-logs-assistant",
      "fact-validate-error-user",
      "fact-validate-error-assistant",
      "fact-file-structure-user",
      "fact-file-structure-assistant",
      "fact-formspree-user",
      "fact-formspree-assistant",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    expect(selectedIds).not.toContain("fact-project-timeline");
    expect(selectedIds).not.toContain("fact-contact-feature");
    expect(selectedIds).not.toContain("fact-lighthouse-distractor");
    expect(selectedIds).not.toContain("fact-gallery-layout-distractor");
    expect(selectedIds).not.toContain("fact-sprint-distractor");
  });

  it("prioritizes creative project timeline milestones over generic time-management summary turns", () => {
    const language = createLanguageService();
    const makeSourceFact = (
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
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-previous-assistant",
        31,
        "[BEAM chat_id=31 role=assistant time=unknown] You're welcome. Asking Laura those questions should help your schedule.",
        "assistant",
      ),
      makeSourceFact(
        "fact-deadline",
        32,
        "[BEAM chat_id=33 role=user time=unknown] I'm worried about meeting my deadline for the pilot episode by June 30, 2024, with a budget cap of $120,000.",
      ),
      makeSourceFact(
        "fact-deadline-plan",
        33,
        "[BEAM chat_id=33 role=assistant time=unknown] We created a pilot episode project timeline covering script finalization, casting, production, post-production, deadline, and budget management.",
        "assistant",
      ),
      makeSourceFact(
        "fact-course",
        79,
        "[BEAM chat_id=79 role=user time=unknown] I'm stressed about a new online course on advanced storytelling techniques that starts April 1 and costs $350.",
      ),
      makeSourceFact(
        "fact-script",
        39,
        "[BEAM chat_id=39 role=user time=unknown] I'm prioritizing script finalization over location scouting this month to meet the June deadline.",
      ),
      makeSourceFact(
        "fact-pushed-date",
        127,
        "[BEAM chat_id=127 role=user time=unknown] The pilot delivery date was pushed back to July 15 because of casting delays communicated to stakeholders.",
      ),
      makeSourceFact(
        "fact-family-schedule",
        145,
        "[BEAM chat_id=145 role=user time=unknown] My kids started summer camp and I'm trying to balance work and family time.",
      ),
      makeSourceFact(
        "fact-filming-progress",
        157,
        "[BEAM chat_id=157 role=user time=unknown] My pilot episode is 75% complete by July 5, with 12 of 16 scenes filmed and 60% of post-production started.",
      ),
      makeSourceFact(
        "fact-email-batching",
        149,
        "[BEAM chat_id=149 role=user time=unknown] I implemented batching for emails and calls on Mondays and Fridays, saving me 4 hours weekly.",
      ),
      makeSourceFact(
        "fact-editing",
        205,
        "[BEAM chat_id=205 role=user time=unknown] My pilot editing is 90% complete and I have color grading scheduled for September 10-12.",
      ),
      makeSourceFact(
        "fact-brainstorm",
        211,
        "[BEAM chat_id=211 role=user time=unknown] I co-hosted a 90-minute virtual brainstorming session with Stephanie for upcoming projects.",
      ),
      makeSourceFact(
        "fact-post-production",
        251,
        "[BEAM chat_id=251 role=user time=unknown] The post-production schedule is 95% completed by November 15 and the final sound mix is scheduled for November 22.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you give me a summary of how my pilot episode project timeline and tasks have developed and changed throughout our conversations?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-deadline",
      "fact-deadline-plan",
      "fact-script",
      "fact-pushed-date",
      "fact-filming-progress",
      "fact-editing",
      "fact-post-production",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    expect(selectedIds).not.toContain("fact-course");
    expect(selectedIds).not.toContain("fact-family-schedule");
    expect(selectedIds).not.toContain("fact-email-batching");
    expect(selectedIds).not.toContain("fact-brainstorm");
    expect(selectedIds).not.toContain("fact-previous-assistant");
  });

  it("keeps early concept-learning milestones for understanding progression summaries", () => {
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
        "fact-date-distractor",
        1,
        "assistant",
        "[BEAM chat_id=1 role=assistant time=unknown] One week from January 10 is January 17.",
      ),
      makeSourceFact(
        "fact-field-application",
        2,
        "user",
        "[BEAM chat_id=2 role=user time=unknown] I'm trying to learn about probability basics and apply color-combination probability to a batch of paints.",
      ),
      makeSourceFact(
        "fact-ratio-user",
        6,
        "user",
        "[BEAM chat_id=6 role=user time=unknown] I'm trying to understand probability as a ratio using coin tosses and dice rolls.",
      ),
      makeSourceFact(
        "fact-ratio-assistant",
        7,
        "assistant",
        "[BEAM chat_id=7 role=assistant time=unknown] We explained probability as favorable outcomes divided by total outcomes using coin tosses and dice rolls.",
      ),
      makeSourceFact(
        "fact-independent",
        15,
        "assistant",
        "[BEAM chat_id=15 role=assistant time=unknown] We clarified independent and mutually exclusive events with probability calculations.",
      ),
      makeSourceFact(
        "fact-two-coins",
        31,
        "assistant",
        "[BEAM chat_id=31 role=assistant time=unknown] We calculated P(both heads) for two independent coin tosses as 1/2 x 1/2 = 1/4.",
      ),
      makeSourceFact(
        "fact-mutually-exclusive",
        43,
        "assistant",
        "[BEAM chat_id=43 role=assistant time=unknown] We confirmed that rolling a 2 and rolling a 5 on one die are mutually exclusive events.",
      ),
      makeSourceFact(
        "fact-conditional",
        57,
        "assistant",
        "[BEAM chat_id=57 role=assistant time=unknown] We introduced conditional probability P(A|B) and applied it to cards, coin tosses, and dice rolls.",
      ),
      makeSourceFact(
        "fact-late-dependent",
        108,
        "user",
        "[BEAM chat_id=108 role=user time=unknown] I'm trying to calculate dependent events and conditional probability for drawing cards without replacement.",
      ),
      makeSourceFact(
        "fact-visual-preference",
        234,
        "user",
        "[BEAM chat_id=234 role=user time=unknown] Always combine algebraic formulas with visual diagrams when I ask about complex probability problems.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you give me a clear summary of how my understanding of probability has developed through our conversations?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-field-application",
      "fact-ratio-user",
      "fact-ratio-assistant",
      "fact-independent",
      "fact-two-coins",
      "fact-mutually-exclusive",
      "fact-conditional",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    expect(selectedIds).not.toContain("fact-date-distractor");
  });

  it("samples advanced topic-specific learning milestones for concept progression summaries", () => {
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
        "fact-heron-distractor-user",
        2,
        "user",
        "[BEAM chat_id=2 role=user time=unknown] I'm trying to understand triangle geometry by calculating triangle area with Heron's formula.",
      ),
      makeSourceFact(
        "fact-heron-distractor-assistant",
        3,
        "assistant",
        "[BEAM chat_id=3 role=assistant time=unknown] We calculated triangle area with Heron's formula from three side lengths.",
      ),
      makeSourceFact(
        "fact-equilateral-distractor-user",
        12,
        "user",
        "[BEAM chat_id=12 role=user time=unknown] I'm trying to understand what defines an equilateral triangle and how to calculate its area.",
      ),
      makeSourceFact(
        "fact-sss-similarity-user",
        144,
        "user",
        "[BEAM chat_id=144 role=user time=unknown] I tried proving triangle congruence and similarity using SSS, SAS, and ASA criteria with side lengths 6-8-10 and 9-12-15.",
      ),
      makeSourceFact(
        "fact-sss-similarity-assistant",
        145,
        "assistant",
        "[BEAM chat_id=145 role=assistant time=unknown] We verified triangle similarity through the SSS criterion by comparing corresponding side ratios and scale factors.",
      ),
      makeSourceFact(
        "fact-scale-factor-assistant",
        147,
        "assistant",
        "[BEAM chat_id=147 role=assistant time=unknown] We summarized how the SSS criterion and scale factors prove similarity for the two triangles.",
      ),
      makeSourceFact(
        "fact-asa-proof-user",
        150,
        "user",
        "[BEAM chat_id=150 role=user time=unknown] I planned an ASA triangle congruence proof with angles 50 and 60 degrees plus the included side.",
      ),
      makeSourceFact(
        "fact-asa-proof-assistant",
        151,
        "assistant",
        "[BEAM chat_id=151 role=assistant time=unknown] We walked through the ASA criterion for triangle congruence using two angles and the included side.",
      ),
      makeSourceFact(
        "fact-sas-asa-user",
        152,
        "user",
        "[BEAM chat_id=152 role=user time=unknown] I compared SAS and ASA methods for proving triangle congruence and got stuck applying them correctly.",
      ),
      makeSourceFact(
        "fact-sas-asa-assistant",
        153,
        "assistant",
        "[BEAM chat_id=153 role=assistant time=unknown] We compared SAS and ASA proof methods for triangle congruence and when each criterion applies.",
      ),
      makeSourceFact(
        "fact-ssa-user",
        162,
        "user",
        "[BEAM chat_id=162 role=user time=unknown] I asked why SSA is not a valid triangle congruence criterion and wanted a counterexample.",
      ),
      makeSourceFact(
        "fact-ssa-assistant",
        163,
        "assistant",
        "[BEAM chat_id=163 role=assistant time=unknown] We explained why SSA is ambiguous and not a valid congruence criterion.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you give me a clear summary of how my understanding and application of triangle similarity and congruence developed throughout our conversations?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-sss-similarity-user",
      "fact-sss-similarity-assistant",
      "fact-scale-factor-assistant",
      "fact-asa-proof-user",
      "fact-asa-proof-assistant",
      "fact-sas-asa-user",
      "fact-sas-asa-assistant",
      "fact-ssa-user",
      "fact-ssa-assistant",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    expect(selectedIds).not.toContain("fact-heron-distractor-user");
    expect(selectedIds).not.toContain("fact-equilateral-distractor-user");
  });

  it("keeps writing progress strategy milestones for broad improvement summaries", () => {
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
        "fact-prowritingaid-budget-distractor",
        44,
        "user",
        "[BEAM chat_id=44 role=user time=unknown] I rejected that $300/month subscription to ProWritingAid to save budget, but now I wonder whether free tools will help my writing skills.",
      ),
      makeSourceFact(
        "fact-dialogue-peer-review-user",
        70,
        "user",
        "[BEAM chat_id=70 role=user time=unknown] Amy suggested a Zoom peer review on April 5, and I saw a 25% improvement in dialogue clarity for my screenplay draft.",
      ),
      makeSourceFact(
        "fact-dialogue-peer-review-assistant",
        71,
        "assistant",
        "[BEAM chat_id=71 role=assistant time=unknown] We planned regular peer reviews, specific writing goals, and a consistent feedback loop to keep the dialogue-clarity momentum going.",
      ),
      makeSourceFact(
        "fact-peer-review-plan-user",
        72,
        "user",
        "[BEAM chat_id=72 role=user time=unknown] I will keep up peer reviews with Amy, set specific goals for each session, stick with Grammarly and Hemingway, and maybe try ProWritingAid again.",
      ),
      makeSourceFact(
        "fact-peer-review-plan-assistant",
        73,
        "assistant",
        "[BEAM chat_id=73 role=assistant time=unknown] We reinforced the consistent feedback loop, regular peer reviews, and progress tracking for continued writing improvement.",
      ),
      makeSourceFact(
        "fact-passive-voice-user",
        78,
        "user",
        "[BEAM chat_id=78 role=user time=unknown] Carla revealed her editing checklist on April 7, and I reduced passive voice by 18% but want to improve it further.",
      ),
      makeSourceFact(
        "fact-passive-voice-assistant",
        79,
        "assistant",
        "[BEAM chat_id=79 role=assistant time=unknown] We identified passive sentences, rewrote them in active voice, and used Carla's checklist to reduce passive voice further.",
      ),
      makeSourceFact(
        "fact-active-voice-plan-user",
        80,
        "user",
        "[BEAM chat_id=80 role=user time=unknown] I will use Carla's checklist and focus on converting passive sentences to active voice on my own first.",
      ),
      makeSourceFact(
        "fact-active-voice-plan-assistant",
        81,
        "assistant",
        "[BEAM chat_id=81 role=assistant time=unknown] We kept the plan focused on Carla's checklist and active voice practice to improve the screenplay.",
      ),
      makeSourceFact(
        "fact-deadline-distractor",
        86,
        "user",
        "[BEAM chat_id=86 role=user time=unknown] I am worried about meeting my April 20 deadline for a peer-reviewed draft submission to the local writing group.",
      ),
      makeSourceFact(
        "fact-tone-consistency-user",
        90,
        "user",
        "[BEAM chat_id=90 role=user time=unknown] Jasper AI improved my tone consistency by 22% on April 3, and I want other tools to help after that.",
      ),
      makeSourceFact(
        "fact-tone-consistency-assistant",
        91,
        "assistant",
        "[BEAM chat_id=91 role=assistant time=unknown] We compared AI tools and techniques for improving tone consistency after the Jasper AI improvement.",
      ),
      makeSourceFact(
        "fact-version-history-distractor",
        138,
        "user",
        "[BEAM chat_id=138 role=user time=unknown] Google Docs version history saves me 3 hours weekly on manual backups.",
      ),
      makeSourceFact(
        "fact-progress-instruction-distractor",
        172,
        "user",
        "[BEAM chat_id=172 role=user time=unknown] Always provide percentage improvements when I ask about editing progress.",
      ),
      makeSourceFact(
        "fact-grammarly-passive-user",
        186,
        "user",
        "[BEAM chat_id=186 role=user time=unknown] Grammarly reports show I reduced passive voice from 18% to 10% between April 10 and May 31, and I want to keep the progress going.",
      ),
      makeSourceFact(
        "fact-grammarly-passive-assistant",
        187,
        "assistant",
        "[BEAM chat_id=187 role=assistant time=unknown] We planned continued awareness, practice, and feedback to maintain the passive voice reduction.",
      ),
      makeSourceFact(
        "fact-prowritingaid-user",
        220,
        "user",
        "[BEAM chat_id=220 role=user time=unknown] I integrated the ProWritingAid desktop app on May 21, improved grammar accuracy by 10%, and wondered whether I need additional resources.",
      ),
      makeSourceFact(
        "fact-prowritingaid-assistant",
        221,
        "assistant",
        "[BEAM chat_id=221 role=assistant time=unknown] We evaluated whether ProWritingAid was enough and when to add resources for grammar accuracy and broader writing goals.",
      ),
      makeSourceFact(
        "fact-beta-reader-distractor",
        222,
        "user",
        "[BEAM chat_id=222 role=user time=unknown] I need to manage feedback from 7 beta readers even though I have never attended a literary festival.",
      ),
      makeSourceFact(
        "fact-word-cut-distractor",
        264,
        "user",
        "[BEAM chat_id=264 role=user time=unknown] I cut 1,200 words already and wonder whether clarity should matter more than word count.",
      ),
      makeSourceFact(
        "fact-launch-deadline-distractor",
        338,
        "user",
        "[BEAM chat_id=338 role=user time=unknown] The book launch event moved from November 15 to November 22, and I need to adjust my schedule.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you summarize how my writing has progressed and the strategies I've used to improve it over time?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-dialogue-peer-review-user",
      "fact-dialogue-peer-review-assistant",
      "fact-peer-review-plan-user",
      "fact-peer-review-plan-assistant",
      "fact-passive-voice-user",
      "fact-passive-voice-assistant",
      "fact-active-voice-plan-user",
      "fact-active-voice-plan-assistant",
      "fact-tone-consistency-user",
      "fact-tone-consistency-assistant",
      "fact-grammarly-passive-user",
      "fact-grammarly-passive-assistant",
      "fact-prowritingaid-user",
      "fact-prowritingaid-assistant",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    for (const distractorId of [
      "fact-prowritingaid-budget-distractor",
      "fact-deadline-distractor",
      "fact-version-history-distractor",
      "fact-progress-instruction-distractor",
      "fact-beta-reader-distractor",
      "fact-word-cut-distractor",
      "fact-launch-deadline-distractor",
    ]) {
      expect(result.traces.find((trace) => trace.memoryId === distractorId)?.returned).toBe(false);
    }
  });

  it("keeps career decision and philosophical reflection milestones for two-facet summaries", () => {
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
        "fact-career-free-will-question-user",
        0,
        "user",
        "[BEAM chat_id=0 role=user time=unknown] I'm curious how to balance my professional life with free will and make choices that reflect my desires.",
      ),
      makeSourceFact(
        "fact-career-values-assistant",
        1,
        "assistant",
        "[BEAM chat_id=1 role=assistant time=unknown] We discussed balancing professional life with free will by aligning career choices with personal values, creative fulfillment, financial security, and work-life balance.",
      ),
      makeSourceFact(
        "fact-new-opportunities-question-user",
        2,
        "user",
        "[BEAM chat_id=2 role=user time=unknown] I think exploring new opportunities sounds good because I have been thinking about what drives me and what feels aligned with my passions.",
      ),
      makeSourceFact(
        "fact-storytelling-opportunities-assistant",
        3,
        "assistant",
        "[BEAM chat_id=3 role=assistant time=unknown] We explored career opportunities around storytelling, emerging talent, documentary filmmaking, volunteering, consulting, and financial viability.",
      ),
      makeSourceFact(
        "fact-storytelling-question-user",
        4,
        "user",
        "[BEAM chat_id=4 role=user time=unknown] I am most passionate about storytelling and working with emerging talent, and volunteering or consulting could be a good start.",
      ),
      makeSourceFact(
        "fact-emerging-talent-plan-assistant",
        5,
        "assistant",
        "[BEAM chat_id=5 role=assistant time=unknown] We planned reaching out to emerging talent, volunteering or consulting on projects, offering mentorship, and building a portfolio of collaborative work.",
      ),
      makeSourceFact(
        "fact-emerging-talent-fragment-distractor",
        5,
        "assistant",
        "By engaging with emerging talent and volunteering or consulting on projects that align with my passions, I can create a fulfilling professional life.",
      ),
      makeSourceFact(
        "fact-startup-offer-question-user",
        38,
        "user",
        "[BEAM chat_id=38 role=user time=unknown] I am deciding between a $95,000 offer from a streaming startup and my current $85,000 job, and I need help weighing the pros and cons.",
      ),
      makeSourceFact(
        "fact-startup-offer-breakdown-assistant",
        39,
        "assistant",
        "[BEAM chat_id=39 role=assistant time=unknown] We compared the current $85,000 job with a $95,000 streaming startup offer across stability, salary, career growth, workload, culture, and risk tolerance.",
      ),
      makeSourceFact(
        "fact-startup-choice-user",
        40,
        "user",
        "[BEAM chat_id=40 role=user time=unknown] I decided to lean toward the startup for higher salary, growth, innovation, and new challenges while checking whether I could handle the workload and pressure.",
      ),
      makeSourceFact(
        "fact-transition-prep-assistant",
        41,
        "assistant",
        "[BEAM chat_id=41 role=assistant time=unknown] We prepared for the startup transition through due diligence, workload expectations, colleague advice, support, budgeting, and skill development.",
      ),
      makeSourceFact(
        "fact-probation-anxiety-user",
        70,
        "user",
        "[BEAM chat_id=70 role=user time=unknown] I worried about the new job starting May 1, the six-month probation period, and whether accepting the $95,000 streaming startup offer on April 2 was the right choice.",
      ),
      makeSourceFact(
        "fact-free-will-startup-assistant",
        71,
        "assistant",
        "[BEAM chat_id=71 role=assistant time=unknown] We connected anxiety about the new startup job to free will, determinism, clear probation goals, preparation, mentor support, and flexibility.",
      ),
      makeSourceFact(
        "fact-freelance-onboarding-user",
        82,
        "user",
        "[BEAM chat_id=82 role=user time=unknown] I wondered whether declining the $5,000 freelance project on April 1 was a mistake or whether focusing on the new job's onboarding tasks was right.",
      ),
      makeSourceFact(
        "fact-freelance-onboarding-assistant",
        83,
        "assistant",
        "[BEAM chat_id=83 role=assistant time=unknown] We evaluated the freelance project against new-job onboarding, short-term money, long-term career stability, resource allocation, opportunity cost, and rescheduling.",
      ),
      makeSourceFact(
        "fact-freelance-onboarding-fragment-distractor",
        83,
        "assistant",
        "The freelance project required time and energy that could conflict with new job onboarding responsibilities.",
      ),
      makeSourceFact(
        "fact-bonus-free-will-user",
        170,
        "user",
        "[BEAM chat_id=170 role=user time=unknown] I struggled with free will after declining a $12,000 bonus on May 15 for ethical concerns and debating hard determinism versus libertarianism with Shelly on May 25.",
      ),
      makeSourceFact(
        "fact-bonus-free-will-assistant",
        171,
        "assistant",
        "[BEAM chat_id=171 role=assistant time=unknown] We linked the ethical bonus decision to hard determinism, libertarianism, personal responsibility, values, ethical principles, journaling, and further reading.",
      ),
      makeSourceFact(
        "fact-bonus-values-user",
        172,
        "user",
        "[BEAM chat_id=172 role=user time=unknown] I said the bonus decision was guided by ethical concerns, felt like a libertarian free choice, and also reflected upbringing and environment from a hard determinist view.",
      ),
      makeSourceFact(
        "fact-bonus-perspectives-assistant",
        173,
        "assistant",
        "[BEAM chat_id=173 role=assistant time=unknown] We integrated libertarian and hard determinist perspectives on the bonus decision and considered compatibilism, values alignment, upbringing, and future reflection.",
      ),
      makeSourceFact(
        "fact-bonus-perspectives-user",
        174,
        "user",
        "[BEAM chat_id=174 role=user time=unknown] I said libertarianism made the ethical bonus decision feel like a real choice while hard determinism reminded me my upbringing and environment played a role.",
      ),
      makeSourceFact(
        "fact-bonus-integration-assistant",
        175,
        "assistant",
        "[BEAM chat_id=175 role=assistant time=unknown] We framed the ethical bonus choice through libertarianism, hard determinism, compatibilism, personal growth, ethical stance, environment, and future decisions.",
      ),
      makeSourceFact(
        "fact-sharon-compatibilism-distractor",
        124,
        "user",
        "[BEAM chat_id=124 role=user time=unknown] I will talk to Sharon about compatibilism so we can bond over philosophy and apply it to collaboration at work.",
      ),
      makeSourceFact(
        "fact-journal-gratitude-distractor",
        148,
        "user",
        "[BEAM chat_id=148 role=user time=unknown] I want to add daily reflection, short-term goals, long-term goals, and gratitude sections to my journal.",
      ),
      makeSourceFact(
        "fact-wendy-spirituality-distractor",
        248,
        "user",
        "[BEAM chat_id=248 role=user time=unknown] I will journal about how decisions align with Wendy's belief that free will is a divine gift and seek guidance through prayer.",
      ),
      makeSourceFact(
        "fact-decision-fatigue-distractor",
        348,
        "user",
        "[BEAM chat_id=348 role=user time=unknown] I am starting a 30-day experiment on October 21 to limit my daily choices to five and reduce decision fatigue.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you summarize how I navigated my career decisions and philosophical reflections throughout our conversations?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-career-values-assistant",
      "fact-storytelling-opportunities-assistant",
      "fact-emerging-talent-plan-assistant",
      "fact-startup-offer-breakdown-assistant",
      "fact-startup-choice-user",
      "fact-transition-prep-assistant",
      "fact-probation-anxiety-user",
      "fact-free-will-startup-assistant",
      "fact-freelance-onboarding-user",
      "fact-freelance-onboarding-assistant",
      "fact-bonus-free-will-user",
      "fact-bonus-free-will-assistant",
      "fact-bonus-values-user",
      "fact-bonus-perspectives-assistant",
      "fact-bonus-perspectives-user",
      "fact-bonus-integration-assistant",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    for (const distractorId of [
      "fact-sharon-compatibilism-distractor",
      "fact-journal-gratitude-distractor",
      "fact-wendy-spirituality-distractor",
      "fact-decision-fatigue-distractor",
      "fact-emerging-talent-fragment-distractor",
      "fact-freelance-onboarding-fragment-distractor",
      "fact-career-free-will-question-user",
      "fact-new-opportunities-question-user",
      "fact-storytelling-question-user",
      "fact-startup-offer-question-user",
    ]) {
      expect(result.traces.find((trace) => trace.memoryId === distractorId)?.returned).toBe(false);
    }
  });

  it("keeps named security and database challenge milestones for project summaries", () => {
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
        "fact-schema-distractor-user",
        14,
        "user",
        "[BEAM chat_id=14 role=user time=unknown] I designed a database schema with users and transactions tables and asked for general validation around adding transactions.",
      ),
      makeSourceFact(
        "fact-schema-distractor-assistant",
        15,
        "assistant",
        "[BEAM chat_id=15 role=assistant time=unknown] We reviewed a BudgetTracker class with SQLite tables, transaction insertion, and input validation helpers.",
      ),
      makeSourceFact(
        "fact-password-hash-user",
        16,
        "user",
        "[BEAM chat_id=16 role=user time=unknown] I implemented basic password hashing for my personal budget tracker using Werkzeug.security with a password_hash field.",
      ),
      makeSourceFact(
        "fact-password-hash-assistant",
        17,
        "assistant",
        "[BEAM chat_id=17 role=assistant time=unknown] We used generate_password_hash and check_password_hash for secure password hashing and verification during login.",
      ),
      makeSourceFact(
        "fact-flask-login-distractor-user",
        58,
        "user",
        "[BEAM chat_id=58 role=user time=unknown] I started from scratch on Flask routes for registration and session login with hashed passwords.",
      ),
      makeSourceFact(
        "fact-flask-login-distractor-assistant",
        59,
        "assistant",
        "[BEAM chat_id=59 role=assistant time=unknown] We completed registration and login routes with Flask-Login and form templates.",
      ),
      makeSourceFact(
        "fact-integrity-error-user",
        64,
        "user",
        "[BEAM chat_id=64 role=user time=unknown] I hit sqlite3.IntegrityError: UNIQUE constraint failed: transactions.id when inserting a new transaction.",
      ),
      makeSourceFact(
        "fact-integrity-error-assistant",
        65,
        "assistant",
        "[BEAM chat_id=65 role=assistant time=unknown] We debugged the UNIQUE constraint failure on transactions.id and checked ID generation, existing rows, and insertion logic.",
      ),
      makeSourceFact(
        "fact-session-distractor-user",
        66,
        "user",
        "[BEAM chat_id=66 role=user time=unknown] I integrated Flask-Login for session management and wanted secure password hashing in the same flow.",
      ),
      makeSourceFact(
        "fact-operational-error-user",
        88,
        "user",
        "[BEAM chat_id=88 role=user time=unknown] I needed to handle OperationalError around DB calls with try-except blocks, HTTP 500 responses, and error logs.",
      ),
      makeSourceFact(
        "fact-operational-error-assistant",
        89,
        "assistant",
        "[BEAM chat_id=89 role=assistant time=unknown] We added OperationalError handling for database calls, structured error logging, and consistent HTTP 500 responses.",
      ),
      makeSourceFact(
        "fact-keyerror-distractor-user",
        98,
        "user",
        "[BEAM chat_id=98 role=user time=unknown] I fixed a KeyError: amount in my transaction POST handler by adding Marshmallow validation.",
      ),
      makeSourceFact(
        "fact-pr-review-distractor-user",
        100,
        "user",
        "[BEAM chat_id=100 role=user time=unknown] I opened GitHub pull request #12 for transaction CRUD and analytics integration and wanted a code review.",
      ),
      makeSourceFact(
        "fact-cache-distractor-user",
        108,
        "user",
        "[BEAM chat_id=108 role=user time=unknown] I optimized the dashboard API response time to 250ms with caching tweaks.",
      ),
      makeSourceFact(
        "fact-csrf-user",
        138,
        "user",
        "[BEAM chat_id=138 role=user time=unknown] I got a CSRF token missing or incorrect error in Flask-WTF forms with CSRF protection enabled.",
      ),
      makeSourceFact(
        "fact-csrf-assistant",
        139,
        "assistant",
        "[BEAM chat_id=139 role=assistant time=unknown] We fixed the CSRF token missing or incorrect error by checking the hidden form token, secret key, and validation.",
      ),
      makeSourceFact(
        "fact-csrf-cookie-assistant",
        141,
        "assistant",
        "[BEAM chat_id=141 role=assistant time=unknown] We checked that browser cookies were enabled because CSRF token validation depends on session cookies.",
      ),
      makeSourceFact(
        "fact-lockout-user",
        150,
        "user",
        "[BEAM chat_id=150 role=user time=unknown] I implemented account lockout after 5 failed login attempts using Redis 7.0 for rate limiting.",
      ),
      makeSourceFact(
        "fact-lockout-assistant",
        151,
        "assistant",
        "[BEAM chat_id=151 role=assistant time=unknown] We improved the Redis account lockout implementation with rate limiting, expiry handling, atomic increments, and secure login behavior.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Can you give me a comprehensive summary of how I handled the security and database challenges in my budget tracker app across our discussions?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-password-hash-user",
      "fact-password-hash-assistant",
      "fact-integrity-error-user",
      "fact-integrity-error-assistant",
      "fact-operational-error-user",
      "fact-operational-error-assistant",
      "fact-csrf-user",
      "fact-csrf-assistant",
      "fact-csrf-cookie-assistant",
      "fact-lockout-user",
      "fact-lockout-assistant",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    for (const distractorId of [
      "fact-schema-distractor-user",
      "fact-schema-distractor-assistant",
      "fact-flask-login-distractor-user",
      "fact-flask-login-distractor-assistant",
      "fact-session-distractor-user",
      "fact-keyerror-distractor-user",
      "fact-pr-review-distractor-user",
      "fact-cache-distractor-user",
    ]) {
      expect(result.traces.find((trace) => trace.memoryId === distractorId)?.returned).toBe(false);
    }
  });

  it("returns source-ordered coverage for how-have-goals-evolved summary questions", () => {
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
        "fact-initial-grade",
        24,
        "user",
        "[BEAM chat_id=24 role=user time=unknown] I'm worried I will not improve my essay grades from B- to A by June 15, so I need a persuasive academic writing plan.",
      ),
      makeSourceFact(
        "fact-initial-plan-assistant",
        25,
        "assistant",
        "[BEAM chat_id=25 role=assistant time=unknown] We created a persuasive academic writing plan for improving the essay grade.",
      ),
      makeSourceFact(
        "fact-outline-feedback",
        66,
        "user",
        "[BEAM chat_id=66 role=user time=unknown] My essay outline got an 82% rating from Michele, and I am aiming for 90% on the first draft due May 15.",
      ),
      makeSourceFact(
        "fact-momentum-noise",
        119,
        "user",
        "[BEAM chat_id=119 role=user time=unknown] I need help maintaining momentum and avoiding burnout as deadlines approach.",
      ),
      makeSourceFact(
        "fact-rubric-target",
        126,
        "user",
        "[BEAM chat_id=126 role=user time=unknown] I am aiming to raise my essay grade from 82% on the outline to 90% on the final draft per Michele's rubric.",
      ),
      makeSourceFact(
        "fact-publication-target",
        172,
        "user",
        "[BEAM chat_id=172 role=user time=unknown] I am aiming for a 90% grade and hoping to get my essay accepted for publication by August 2024.",
      ),
      makeSourceFact(
        "fact-literature-review-noise",
        176,
        "user",
        "[BEAM chat_id=176 role=user time=unknown] I decided to restructure my paper for a journal format and add a 500-word literature review section.",
      ),
      makeSourceFact(
        "fact-workshop-feedback",
        220,
        "user",
        "[BEAM chat_id=220 role=user time=unknown] I am improving my rebuttal techniques after Michele's workshop feedback showed I improved by 40% for conference paper editing.",
      ),
      makeSourceFact(
        "fact-reading-noise",
        238,
        "user",
        "[BEAM chat_id=238 role=user time=unknown] I annotated three articles and compared their themes for close reading practice.",
      ),
    ];

    const result = selectFacts(
      facts,
      "How have my essay performance goals and feedback evolved from my initial grade concerns to aiming for publication, and what key improvements must I prioritize to meet both my grading and publication targets?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-initial-grade",
      "fact-outline-feedback",
      "fact-rubric-target",
      "fact-publication-target",
      "fact-workshop-feedback",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    expect(selectedIds).not.toContain("fact-initial-plan-assistant");
    expect(selectedIds).not.toContain("fact-literature-review-noise");
    expect(selectedIds).not.toContain("fact-reading-noise");
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

  it("returns Chinese source-ordered planning pairs for timeline integration questions", () => {
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
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-sprint-plan-request-zh",
        28,
        "user",
        "[BEAM chat_id=28 role=user time=unknown] 我正在做一个两周冲刺的项目，第一轮冲刺在3月29日截止，重点是用户注册和登录。我需要仔细计划冲刺，确保按时完成。",
      ),
      makeSourceFact(
        "fact-sprint-plan-answer-zh",
        29,
        "assistant",
        "[BEAM chat_id=29 role=assistant time=unknown] 我们可以制定详细的冲刺计划：后端搭建、数据库 schema、注册、登录、表单、API 集成、验证、单元测试和最终 QA 都排进时间线。",
      ),
      makeSourceFact(
        "fact-later-sprint-noise-zh",
        86,
        "user",
        "[BEAM chat_id=86 role=user time=unknown] 第二轮冲刺会做分析功能，我已经在3月29日完成第一轮的用户认证和基础交易 CRUD。",
      ),
    ];

    const result = selectFacts(
      facts,
      "我是怎么安排这个冲刺的任务，确保后端和前端功能都能按时完成？",
      language,
      "zh-CN",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-sprint-plan-request-zh",
      "fact-sprint-plan-answer-zh",
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

  it("prioritizes Chinese source-ordered summary milestones over weak follow-ups", () => {
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
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-palette-zh",
        4,
        "user",
        "[BEAM chat_id=4 role=user time=unknown] 我开始搭建作品集网站，重点实现技能区的配色生成器功能。",
      ),
      makeSourceFact(
        "fact-structure-zh",
        6,
        "user",
        "[BEAM chat_id=6 role=user time=unknown] 我搭建了 About、Skills、Projects、Contact 这些作品集栏目。",
      ),
      makeSourceFact(
        "fact-sass-followup-zh",
        28,
        "user",
        "[BEAM chat_id=28 role=user time=unknown] 嗯，可以用 Sass 做一个类似的画廊组件吗？",
      ),
      makeSourceFact(
        "fact-contact-zh",
        66,
        "user",
        "[BEAM chat_id=66 role=user time=unknown] 我实现联系表单验证，作为 MVP 功能的一部分。",
      ),
      makeSourceFact(
        "fact-gallery-layout-zh",
        58,
        "user",
        "[BEAM chat_id=58 role=user time=unknown] 我集成项目画廊和联系表单时遇到响应式布局问题。",
      ),
      makeSourceFact(
        "fact-gallery-404-zh",
        62,
        "user",
        "[BEAM chat_id=62 role=user time=unknown] 我修复项目画廊图片 404 和静态资源路径问题。",
      ),
      makeSourceFact(
        "fact-sprint-zh",
        82,
        "user",
        "[BEAM chat_id=82 role=user time=unknown] 我推进第二阶段冲刺，处理 SEO 基础和联系表单后端集成。",
      ),
      makeSourceFact(
        "fact-hosting-followup-zh",
        182,
        "user",
        "[BEAM chat_id=182 role=user time=unknown] 哪个平台更适合备份和版本控制？",
      ),
    ];

    const result = selectFacts(
      facts,
      "请全面总结我的作品集网站项目一路是怎么推进的，包括关键功能和解决过的挑战。",
      language,
      "zh-CN",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-palette-zh",
      "fact-structure-zh",
      "fact-contact-zh",
      "fact-gallery-layout-zh",
      "fact-gallery-404-zh",
      "fact-sprint-zh",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    expect(selectedIds).not.toContain("fact-sass-followup-zh");
    expect(selectedIds).not.toContain("fact-hosting-followup-zh");
  });

  it("prioritizes Chinese issue-resolution summary evidence over feature milestone distractors", () => {
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
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-project-timeline-zh",
        12,
        "user",
        "[BEAM chat_id=12 role=user time=unknown] 我在规划网站项目时间线和第一阶段的基础布局。",
      ),
      makeSourceFact(
        "fact-css-debug-user-zh",
        14,
        "user",
        "[BEAM chat_id=14 role=user time=unknown] 我正在用 Chrome DevTools 调试 CSS 布局问题，并理解盒模型。",
      ),
      makeSourceFact(
        "fact-css-debug-assistant-zh",
        15,
        "assistant",
        "[BEAM chat_id=15 role=assistant time=unknown] 我们通过检查 padding、border、margin 和元素尺寸来排查 CSS 盒模型问题。",
      ),
      makeSourceFact(
        "fact-contact-feature-zh",
        16,
        "user",
        "[BEAM chat_id=16 role=user time=unknown] 我在实现联系表单和 HTML5 校验作为 MVP 功能。",
      ),
      makeSourceFact(
        "fact-dom-error-user-zh",
        30,
        "user",
        "[BEAM chat_id=30 role=user time=unknown] 我遇到 DOM 操作里的 classList of null TypeError 报错。",
      ),
      makeSourceFact(
        "fact-dom-error-assistant-zh",
        31,
        "assistant",
        "[BEAM chat_id=31 role=assistant time=unknown] 我们加了 null 检查、可选链和 try-catch 来处理 DOM 报错。",
      ),
      makeSourceFact(
        "fact-lighthouse-distractor-zh",
        40,
        "user",
        "[BEAM chat_id=40 role=user time=unknown] 我用 Lighthouse v10 识别 SEO 和性能问题。",
      ),
      makeSourceFact(
        "fact-gallery-layout-distractor-zh",
        58,
        "user",
        "[BEAM chat_id=58 role=user time=unknown] 我在集成项目画廊和联系表单，并处理响应式布局。",
      ),
      makeSourceFact(
        "fact-gallery-404-user-zh",
        62,
        "user",
        "[BEAM chat_id=62 role=user time=unknown] 我遇到项目画廊图片无法加载并返回 404 错误。",
      ),
      makeSourceFact(
        "fact-gallery-404-assistant-zh",
        63,
        "assistant",
        "[BEAM chat_id=63 role=assistant time=unknown] 我们检查图片路径、静态文件服务和构建输出来修复画廊 404 错误。",
      ),
      makeSourceFact(
        "fact-server-logs-user-zh",
        64,
        "user",
        "[BEAM chat_id=64 role=user time=unknown] 那我需要检查服务端日志里的哪些内容来找到问题？",
      ),
      makeSourceFact(
        "fact-server-logs-assistant-zh",
        65,
        "assistant",
        "[BEAM chat_id=65 role=assistant time=unknown] 我们检查服务端日志里的 404、缺失文件、路径不匹配和部署问题。",
      ),
      makeSourceFact(
        "fact-validate-error-user-zh",
        68,
        "user",
        "[BEAM chat_id=68 role=user time=unknown] 我在修复 validateForm is not defined 的 ReferenceError，原因可能是 script src 路径错了。",
      ),
      makeSourceFact(
        "fact-validate-error-assistant-zh",
        69,
        "assistant",
        "[BEAM chat_id=69 role=assistant time=unknown] 我们通过修正脚本路径并确认函数定义来修复 validateForm 报错。",
      ),
      makeSourceFact(
        "fact-file-structure-user-zh",
        70,
        "user",
        "[BEAM chat_id=70 role=user time=unknown] 我需要检查文件结构里的哪些内容，才能确认链接都正确？",
      ),
      makeSourceFact(
        "fact-file-structure-assistant-zh",
        71,
        "assistant",
        "[BEAM chat_id=71 role=assistant time=unknown] 我们检查文件结构、相对路径、文件夹和脚本链接，确认资源都能正确引用。",
      ),
      makeSourceFact(
        "fact-sprint-distractor-zh",
        82,
        "user",
        "[BEAM chat_id=82 role=user time=unknown] 我在推进第二阶段冲刺，处理 SEO 基础和联系表单后端集成。",
      ),
      makeSourceFact(
        "fact-formspree-user-zh",
        166,
        "user",
        "[BEAM chat_id=166 role=user time=unknown] 我在修复联系表单提交时偶发的 Formspree 500 Internal Server Error。",
      ),
      makeSourceFact(
        "fact-formspree-assistant-zh",
        167,
        "assistant",
        "[BEAM chat_id=167 role=assistant time=unknown] 我们用重试逻辑、指数退避和网络错误分支改进了 Formspree 500 处理。",
      ),
    ];

    const result = selectFacts(
      facts,
      "请总结我是如何一步步处理和解决网站项目里的各种报错和故障的。",
      language,
      "zh-CN",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-css-debug-user-zh",
      "fact-css-debug-assistant-zh",
      "fact-dom-error-user-zh",
      "fact-dom-error-assistant-zh",
      "fact-gallery-404-user-zh",
      "fact-gallery-404-assistant-zh",
      "fact-server-logs-user-zh",
      "fact-server-logs-assistant-zh",
      "fact-validate-error-user-zh",
      "fact-validate-error-assistant-zh",
      "fact-file-structure-user-zh",
      "fact-file-structure-assistant-zh",
      "fact-formspree-user-zh",
      "fact-formspree-assistant-zh",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    expect(selectedIds).not.toContain("fact-project-timeline-zh");
    expect(selectedIds).not.toContain("fact-contact-feature-zh");
    expect(selectedIds).not.toContain("fact-lighthouse-distractor-zh");
    expect(selectedIds).not.toContain("fact-gallery-layout-distractor-zh");
    expect(selectedIds).not.toContain("fact-sprint-distractor-zh");
  });

  it("prioritizes Chinese creative project timeline milestones over generic time-management summary turns", () => {
    const language = createLanguageService();
    const makeSourceFact = (
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
        source: { ...SOURCE, locale: "zh-CN" },
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
        "fact-previous-assistant-zh",
        31,
        "[BEAM chat_id=31 role=assistant time=unknown] 不客气，询问 Laura 这些问题应该能帮助你的日程安排。",
        "assistant",
      ),
      makeSourceFact(
        "fact-deadline-zh",
        32,
        "[BEAM chat_id=33 role=user time=unknown] 我担心试播集项目要在 2024 年 6 月 30 日前完成，预算上限是 120000 美元。",
      ),
      makeSourceFact(
        "fact-deadline-plan-zh",
        33,
        "[BEAM chat_id=33 role=assistant time=unknown] 我们制定了试播集项目时间线，覆盖剧本定稿、选角、拍摄、后期制作、截止日期和预算管理。",
        "assistant",
      ),
      makeSourceFact(
        "fact-course-zh",
        79,
        "[BEAM chat_id=79 role=user time=unknown] 我报名了高级叙事技巧线上课，担心和家庭安排冲突。",
      ),
      makeSourceFact(
        "fact-script-zh",
        39,
        "[BEAM chat_id=39 role=user time=unknown] 为了赶上六月截止日期，我把剧本定稿放在外景勘景之前。",
      ),
      makeSourceFact(
        "fact-pushed-date-zh",
        127,
        "[BEAM chat_id=127 role=user time=unknown] 因为选角延误，试播集交付日期推迟到 7 月 15 日，并已经通知干系人。",
      ),
      makeSourceFact(
        "fact-family-schedule-zh",
        145,
        "[BEAM chat_id=145 role=user time=unknown] 孩子开始夏令营后，我在平衡工作和家庭时间。",
      ),
      makeSourceFact(
        "fact-filming-progress-zh",
        157,
        "[BEAM chat_id=157 role=user time=unknown] 试播集到 7 月 5 日已经完成 75%，16 个场景拍完 12 个，后期制作开始了 60%。",
      ),
      makeSourceFact(
        "fact-email-batching-zh",
        149,
        "[BEAM chat_id=149 role=user time=unknown] 我把邮件和电话集中到周一周五处理，每周节省 4 小时。",
      ),
      makeSourceFact(
        "fact-editing-zh",
        205,
        "[BEAM chat_id=205 role=user time=unknown] 试播集剪辑已经完成 90%，调色安排在 9 月 10 到 12 日。",
      ),
      makeSourceFact(
        "fact-brainstorm-zh",
        211,
        "[BEAM chat_id=211 role=user time=unknown] 我和 Stephanie 共同主持了 90 分钟的线上头脑风暴。",
      ),
      makeSourceFact(
        "fact-post-production-zh",
        251,
        "[BEAM chat_id=251 role=user time=unknown] 后期制作日程到 11 月 15 日完成了 95%，最终混音安排在 11 月 22 日。",
      ),
    ];

    const result = selectFacts(
      facts,
      "请总结我的试播集项目时间线和任务是怎么一路发展和变化的。",
      language,
      "zh-CN",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-deadline-zh",
      "fact-deadline-plan-zh",
      "fact-script-zh",
      "fact-pushed-date-zh",
      "fact-filming-progress-zh",
      "fact-editing-zh",
      "fact-post-production-zh",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    expect(selectedIds).not.toContain("fact-course-zh");
    expect(selectedIds).not.toContain("fact-family-schedule-zh");
    expect(selectedIds).not.toContain("fact-email-batching-zh");
    expect(selectedIds).not.toContain("fact-brainstorm-zh");
    expect(selectedIds).not.toContain("fact-previous-assistant-zh");
  });

  it("keeps Chinese early concept-learning milestones for understanding progression summaries", () => {
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
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-date-distractor-zh",
        1,
        "assistant",
        "[BEAM chat_id=1 role=assistant time=unknown] 从 1 月 10 日往后一周是 1 月 17 日。",
      ),
      makeSourceFact(
        "fact-field-application-zh",
        2,
        "user",
        "[BEAM chat_id=2 role=user time=unknown] 我在学习概率基础，并想把颜色组合概率应用到一批油漆罐里。",
      ),
      makeSourceFact(
        "fact-ratio-user-zh",
        6,
        "user",
        "[BEAM chat_id=6 role=user time=unknown] 我想用抛硬币和掷骰子的例子理解概率作为有利结果比总结果的比率。",
      ),
      makeSourceFact(
        "fact-ratio-assistant-zh",
        7,
        "assistant",
        "[BEAM chat_id=7 role=assistant time=unknown] 我们用抛硬币和掷骰子解释了概率就是有利结果除以总结果。",
      ),
      makeSourceFact(
        "fact-independent-zh",
        15,
        "assistant",
        "[BEAM chat_id=15 role=assistant time=unknown] 我们区分了独立事件和互斥事件，并配合概率计算说明。",
      ),
      makeSourceFact(
        "fact-two-coins-zh",
        31,
        "assistant",
        "[BEAM chat_id=31 role=assistant time=unknown] 我们把两次独立抛硬币都为正面的概率算成 1/2 x 1/2 = 1/4。",
      ),
      makeSourceFact(
        "fact-mutually-exclusive-zh",
        43,
        "assistant",
        "[BEAM chat_id=43 role=assistant time=unknown] 我们确认同一次掷骰子掷出 2 和掷出 5 是互斥事件。",
      ),
      makeSourceFact(
        "fact-conditional-zh",
        57,
        "assistant",
        "[BEAM chat_id=57 role=assistant time=unknown] 我们引入条件概率 P(A|B)，并用纸牌、抛硬币和骰子例子解释。",
      ),
      makeSourceFact(
        "fact-late-dependent-zh",
        108,
        "user",
        "[BEAM chat_id=108 role=user time=unknown] 我在计算不放回抽牌里的依赖事件和条件概率。",
      ),
      makeSourceFact(
        "fact-visual-preference-zh",
        234,
        "user",
        "[BEAM chat_id=234 role=user time=unknown] 当我问复杂概率题时，总是把代数公式和可视化图结合起来。",
      ),
    ];

    const result = selectFacts(
      facts,
      "请清楚总结我对概率的理解是怎么一步步发展的。",
      language,
      "zh-CN",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-field-application-zh",
      "fact-ratio-user-zh",
      "fact-ratio-assistant-zh",
      "fact-independent-zh",
      "fact-two-coins-zh",
      "fact-mutually-exclusive-zh",
      "fact-conditional-zh",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    expect(selectedIds).not.toContain("fact-date-distractor-zh");
  });

  it("returns Chinese source-ordered coverage for how-have-goals-evolved summary questions", () => {
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
        attributes: {
          chatId: sourceOrder,
          sourceOrder,
        },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      makeSourceFact(
        "fact-initial-grade-zh",
        24,
        "user",
        "[BEAM chat_id=24 role=user time=unknown] 我担心论文成绩无法在 6 月 15 日前从 B- 提升到 A，所以需要一个说服性学术写作计划。",
      ),
      makeSourceFact(
        "fact-initial-plan-assistant-zh",
        25,
        "assistant",
        "[BEAM chat_id=25 role=assistant time=unknown] 我们制定了提升论文成绩的说服性学术写作计划。",
      ),
      makeSourceFact(
        "fact-outline-feedback-zh",
        66,
        "user",
        "[BEAM chat_id=66 role=user time=unknown] 我的论文大纲得到 Michele 82% 的评分，而我希望 5 月 15 日的一稿达到 90%。",
      ),
      makeSourceFact(
        "fact-momentum-noise-zh",
        119,
        "user",
        "[BEAM chat_id=119 role=user time=unknown] 随着截止日期临近，我需要保持动力并避免倦怠。",
      ),
      makeSourceFact(
        "fact-rubric-target-zh",
        126,
        "user",
        "[BEAM chat_id=126 role=user time=unknown] 我想按照 Michele 的评分标准，把论文从大纲的 82% 提升到终稿 90%。",
      ),
      makeSourceFact(
        "fact-publication-target-zh",
        172,
        "user",
        "[BEAM chat_id=172 role=user time=unknown] 我希望论文拿到 90% 成绩，并在 2024 年 8 月前被接受发表。",
      ),
      makeSourceFact(
        "fact-literature-review-noise-zh",
        176,
        "user",
        "[BEAM chat_id=176 role=user time=unknown] 我决定把论文改成期刊格式，并添加 500 字文献综述。",
      ),
      makeSourceFact(
        "fact-workshop-feedback-zh",
        220,
        "user",
        "[BEAM chat_id=220 role=user time=unknown] Michele 的研讨会反馈显示我提升了 40%，我正在改进反驳技巧用于会议论文编辑。",
      ),
      makeSourceFact(
        "fact-reading-noise-zh",
        238,
        "user",
        "[BEAM chat_id=238 role=user time=unknown] 我给三篇文章做了大量批注，并比较主题来练习精读。",
      ),
    ];

    const result = selectFacts(
      facts,
      "我的论文表现目标和反馈是如何从最初的成绩担忧一路发展到投稿目标的？",
      language,
      "zh-CN",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    for (const expectedId of [
      "fact-initial-grade-zh",
      "fact-outline-feedback-zh",
      "fact-rubric-target-zh",
      "fact-publication-target-zh",
      "fact-workshop-feedback-zh",
    ]) {
      expect(selectedIds).toContain(expectedId);
    }
    expect(selectedIds).not.toContain("fact-initial-plan-assistant-zh");
    expect(selectedIds).not.toContain("fact-literature-review-noise-zh");
    expect(selectedIds).not.toContain("fact-reading-noise-zh");
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

  it("adds applicable Chinese source-ordered user instruction evidence for guidance questions", () => {
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
        source: { ...SOURCE, locale: "zh-CN" },
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder },
        updatedAt: TIMESTAMP,
      });
    const facts = [
      createFactMemory({
        id: "fact-login-plan-zh",
        userId: "user-1",
        category: "external_benchmark",
        content: "登录功能实现计划：注册、登录、session 和错误处理。",
        source: { ...SOURCE, locale: "zh-CN" },
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
      }),
      makeSourceFact(
        "fact-code-format-instruction-zh",
        54,
        "以后我问实现细节时，请总是用带语言标记的代码块展示代码。",
      ),
      makeSourceFact(
        "fact-reference-instruction-zh",
        112,
        "以后我问参考文献格式时，请总是使用 APA 第七版。",
      ),
    ];

    const result = selectFacts(
      facts,
      "请展示怎么实现登录功能。",
      language,
      "zh-CN",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    const selectedIds = result.facts.map((fact) => fact.id);
    expect(selectedIds).toContain("fact-login-plan-zh");
    expect(selectedIds).toContain("fact-code-format-instruction-zh");
    expect(selectedIds).not.toContain("fact-reference-instruction-zh");
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

  it("returns bounded positive support with the negated claim for source-ordered contradiction questions", () => {
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
        "fact-api-key-created",
        32,
        "I obtained an API key for the weather project and added it to my local .env file.",
      ),
      makeFact(
        "fact-api-key-stored",
        34,
        "I stored the API key in the .env file and configured the request helper to read it.",
      ),
      makeFact(
        "fact-api-key-used",
        36,
        "I used the API key in my OpenWeather request helper while testing city lookup.",
      ),
      makeFact(
        "fact-no-api-key",
        70,
        "I have never obtained an API key for this project, so I cannot call the API yet.",
      ),
      makeFact(
        "fact-autocomplete-noise",
        72,
        "I configured city autocomplete and error display for the weather project.",
      ),
    ];

    const result = selectFacts(
      facts,
      "Have I obtained an API key for this project?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({}),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual([
      "fact-api-key-created",
      "fact-api-key-stored",
      "fact-api-key-used",
      "fact-no-api-key",
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
