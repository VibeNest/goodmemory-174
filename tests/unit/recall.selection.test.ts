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
