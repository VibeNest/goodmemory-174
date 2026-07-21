import { describe, expect, it } from "bun:test";

import { createFactMemory } from "../../src/domain/records";
import {
  createLanguageService,
  createNeutralLanguagePack,
  type LanguageContentAnalysis,
  type LanguageQueryAnalysis,
} from "../../src/language";
import type { RoutingDecision } from "../../src/recall/router";
import { selectGeneralizedFactsForInternalUse } from "../../src/recall/selection";

const TIMESTAMP = "2026-01-10T00:00:00.000Z";

function routingDecision(
  overrides: Partial<RoutingDecision> = {},
): RoutingDecision {
  return {
    actionDriving: false,
    continuation: false,
    intent: "general_assistance",
    referenceSeeking: false,
    requestedSlots: [],
    retrievalProfile: "general_chat",
    sourcePriorities: ["profile", "fact", "feedback"],
    strategy: "rules-only",
    strategyExplanation: {
      hardFloor: "lexical_runtime_procedural_priors",
      llmRefinement: false,
      requestedStrategy: "rules-only",
      resolvedStrategy: "rules-only",
      semanticTieBreaking: false,
      summary: "rules-only",
    },
    supportSlots: [],
    ...overrides,
  };
}

function createSentinelLanguage(
  analysis: Partial<LanguageQueryAnalysis>,
  contentAnalysis: Partial<LanguageContentAnalysis> = {},
) {
  const neutral = createNeutralLanguagePack();
  return createLanguageService({
    defaultLocale: "xx",
    packs: [{
      ...neutral,
      analyzerVersion: "sentinel-v1",
      compatibilityGroup: "xx",
      defaultLocale: "xx",
      detect: ({ texts }) => texts.some((text) => text.includes("zor"))
        ? "distinctive"
        : "none",
      id: "xx-sentinel",
      locales: ["xx"],
      analyzeQuery: () => ({
        ...neutral.analyzeQuery(""),
        ...analysis,
      }),
      analyzeContent: () => ({
        ...neutral.analyzeContent(""),
        ...contentAnalysis,
      }),
    }],
  });
}

describe("generalized production selection", () => {
  it("selects relevant facts without loading the fitted selector graph", () => {
    const facts = [
      createFactMemory({
        category: "project",
        content: "The release is blocked by legal signoff.",
        id: "blocker",
        source: { extractedAt: TIMESTAMP, method: "explicit" },
        updatedAt: TIMESTAMP,
        userId: "user-1",
      }),
      createFactMemory({
        category: "personal",
        content: "The user enjoys landscape photography.",
        id: "photography",
        source: { extractedAt: TIMESTAMP, method: "explicit" },
        updatedAt: TIMESTAMP,
        userId: "user-1",
      }),
    ];

    const result = selectGeneralizedFactsForInternalUse(
      facts,
      "What is blocking the release?",
      createLanguageService(),
      "en",
      "general_chat",
      routingDecision(),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map(({ id }) => id)).toEqual(["blocker"]);
    expect(result.traces.find(({ memoryId }) => memoryId === "blocker")?.returned)
      .toBe(true);
  });

  it("keeps related facts available for queries that also seek a reference", () => {
    const facts = [
      createFactMemory({
        category: "project",
        content: "Vendor approval is blocking the release quality program.",
        id: "vendor-approval",
        source: { extractedAt: TIMESTAMP, method: "explicit" },
        updatedAt: TIMESTAMP,
        userId: "user-1",
      }),
    ];

    const result = selectGeneralizedFactsForInternalUse(
      facts,
      "Check the release quality runbook and vendor approval.",
      createLanguageService(),
      "en",
      "coding_agent",
      routingDecision({ referenceSeeking: true }),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map(({ id }) => id)).toEqual(["vendor-approval"]);
  });

  it("includes relevant blocking context when a reference is checked before action", () => {
    const facts = [
      createFactMemory({
        category: "project",
        content: "Vendor approval is blocking the release quality program.",
        id: "pre-action-blocker",
        source: { extractedAt: TIMESTAMP, method: "explicit" },
        updatedAt: TIMESTAMP,
        userId: "user-1",
      }),
    ];

    const result = selectGeneralizedFactsForInternalUse(
      facts,
      "Check the release runbook before editing files.",
      createLanguageService(),
      "en",
      "coding_agent",
      routingDecision({ referenceSeeking: true, requestedSlots: ["reference"] }),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map(({ id }) => id)).toEqual(["pre-action-blocker"]);
  });

  it("uses LanguagePack semantics for aggregate open-loop selection", () => {
    const facts = ["alpha", "beta"].map((suffix) =>
      createFactMemory({
        category: "project",
        content: `zor ${suffix}`,
        factKind: "open_loop",
        id: suffix,
        source: {
          extractedAt: TIMESTAMP,
          languagePackId: "xx-sentinel",
          languagePackVersion: "sentinel-v1",
          locale: "xx",
          method: "explicit",
        },
        updatedAt: TIMESTAMP,
        userId: "user-1",
      })
    );

    const result = selectGeneralizedFactsForInternalUse(
      facts,
      "zor",
      createSentinelLanguage({ aggregateCount: true, openLoop: true }),
      "xx",
      "general_chat",
      routingDecision({ requestedSlots: ["open_loop"] }),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map(({ id }) => id).sort()).toEqual(["alpha", "beta"]);
  });

  it("uses LanguagePack semantics for reference pre-action selection", () => {
    const fact = createFactMemory({
      category: "project",
      content: "zor guard",
      id: "sentinel-guard",
      source: {
        extractedAt: TIMESTAMP,
        languagePackId: "xx-sentinel",
        languagePackVersion: "sentinel-v1",
        locale: "xx",
        method: "explicit",
      },
      updatedAt: TIMESTAMP,
      userId: "user-1",
    });

    const result = selectGeneralizedFactsForInternalUse(
      [fact],
      "zor",
      createSentinelLanguage({
        actionDriving: true,
        before: true,
        referenceSeeking: true,
      }),
      "xx",
      "coding_agent",
      routingDecision({ referenceSeeking: true, requestedSlots: ["reference"] }),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map(({ id }) => id)).toEqual(["sentinel-guard"]);
  });

  it("uses LanguagePack semantics for user-grounded event ordering", () => {
    const facts = [
      createFactMemory({
        category: "event",
        content: "zor user event",
        id: "user-event",
        source: {
          extractedAt: TIMESTAMP,
          languagePackId: "xx-sentinel",
          languagePackVersion: "sentinel-v1",
          locale: "xx",
          method: "explicit",
        },
        tags: ["user_answer"],
        updatedAt: TIMESTAMP,
        userId: "user-1",
      }),
      createFactMemory({
        category: "event",
        content: "zor assistant event",
        id: "assistant-event",
        source: {
          extractedAt: TIMESTAMP,
          languagePackId: "xx-sentinel",
          languagePackVersion: "sentinel-v1",
          locale: "xx",
          method: "explicit",
        },
        tags: ["assistant_answer"],
        updatedAt: TIMESTAMP,
        userId: "user-1",
      }),
    ];

    const result = selectGeneralizedFactsForInternalUse(
      facts,
      "zor",
      createSentinelLanguage({ userGroundedEventOrder: true }),
      "xx",
      "general_chat",
      routingDecision(),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map(({ id }) => id)).toEqual(["user-event"]);
  });

  it("uses generic LanguagePack preference semantics for broad recommendations", () => {
    const fact = createFactMemory({
      category: "technical",
      content: "zor",
      id: "sentinel-research-interest",
      source: {
        extractedAt: TIMESTAMP,
        languagePackId: "xx-sentinel",
        languagePackVersion: "sentinel-v1",
        locale: "xx",
        method: "explicit",
      },
      updatedAt: TIMESTAMP,
      userId: "user-1",
    });

    const result = selectGeneralizedFactsForInternalUse(
      [fact],
      "xed",
      createSentinelLanguage(
        { recommendationStyle: true },
        { preferenceEvidence: true },
      ),
      "xx",
      "general_chat",
      routingDecision(),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map(({ id }) => id)).toEqual([
      "sentinel-research-interest",
    ]);
  });

  it("does not collapse unrelated facts merely because they share a subject", () => {
    const facts = [
      createFactMemory({
        category: "personal",
        content: "Martin was born on August 2, 1996.",
        id: "birth-date",
        source: { extractedAt: "2026-01-01T00:00:00.000Z", method: "explicit" },
        subject: "Martin",
        updatedAt: "2026-01-01T00:00:00.000Z",
        userId: "user-1",
      }),
      createFactMemory({
        category: "personal",
        content: "Martin plans to expand healthcare access.",
        id: "later-goal",
        source: { extractedAt: TIMESTAMP, method: "explicit" },
        subject: "Martin",
        updatedAt: TIMESTAMP,
        userId: "user-1",
      }),
    ];

    const result = selectGeneralizedFactsForInternalUse(
      facts,
      "What is Martin's birth date?",
      createLanguageService(),
      "en",
      "general_chat",
      routingDecision({ strategy: "hybrid" }),
      null,
      TIMESTAMP,
      undefined,
      undefined,
      undefined,
      {
        candidates: [{ id: "birth-date", score: 1 }],
        maxAdditions: 1,
        maxTotalFacts: 2,
      },
    );

    expect(result.facts.map(({ id }) => id)).toContain("birth-date");
  });

  it("still collapses structured mutable slots to their latest value", () => {
    const facts = [
      createFactMemory({
        category: "personal",
        content: "Martin works as an analyst.",
        factKind: "role_update",
        id: "old-role",
        source: { extractedAt: "2026-01-01T00:00:00.000Z", method: "explicit" },
        subject: "Martin",
        updatedAt: "2026-01-01T00:00:00.000Z",
        userId: "user-1",
      }),
      createFactMemory({
        category: "personal",
        content: "Martin works as a director.",
        factKind: "role_update",
        id: "current-role",
        source: { extractedAt: TIMESTAMP, method: "explicit" },
        subject: "Martin",
        updatedAt: TIMESTAMP,
        userId: "user-1",
      }),
    ];

    const result = selectGeneralizedFactsForInternalUse(
      facts,
      "What is Martin's role?",
      createLanguageService(),
      "en",
      "general_chat",
      routingDecision({ strategy: "hybrid" }),
      null,
      TIMESTAMP,
      undefined,
      undefined,
      undefined,
      {
        candidates: [
          { id: "old-role", score: 1 },
          { id: "current-role", score: 0.9 },
        ],
        maxAdditions: 2,
        maxTotalFacts: 2,
      },
    );

    expect(result.facts.map(({ id }) => id)).toContain("current-role");
    expect(result.facts.map(({ id }) => id)).not.toContain("old-role");
  });

  it("uses LanguagePack equality when collapsing cross-script mutable subjects", () => {
    const facts = [
      createFactMemory({
        category: "project",
        content: "資料庫遷移目前仍被舊審批阻塞。",
        factKind: "project_state",
        id: "old-project-state",
        source: {
          extractedAt: "2026-01-01T00:00:00.000Z",
          languagePackId: "zh-Hant",
          languagePackVersion: "5-opencc-t2cn-1.4.1",
          locale: "zh-TW",
          method: "explicit",
        },
        subject: "資料庫遷移",
        updatedAt: "2026-01-01T00:00:00.000Z",
        userId: "user-1",
      }),
      createFactMemory({
        category: "project",
        content: "数据库迁移当前被新审批阻塞。",
        factKind: "project_state",
        id: "current-project-state",
        source: {
          extractedAt: TIMESTAMP,
          languagePackId: "zh-Hans",
          languagePackVersion: "5-opencc-t2cn-1.4.1",
          locale: "zh-CN",
          method: "explicit",
        },
        subject: "数据库迁移",
        updatedAt: TIMESTAMP,
        userId: "user-1",
      }),
    ];

    const result = selectGeneralizedFactsForInternalUse(
      facts,
      "什么是数据库迁移的当前项目状态？",
      createLanguageService(),
      "zh-CN",
      "general_chat",
      routingDecision({ strategy: "hybrid" }),
      null,
      TIMESTAMP,
      undefined,
      undefined,
      undefined,
      {
        candidates: [
          { id: "old-project-state", score: 1 },
          { id: "current-project-state", score: 0.9 },
        ],
        maxAdditions: 2,
        maxTotalFacts: 2,
      },
    );

    expect(result.facts.map(({ id }) => id)).toContain("current-project-state");
    expect(result.facts.map(({ id }) => id)).not.toContain("old-project-state");
  });

  it("does not collapse quantified facts that only share a subject", () => {
    const facts = [
      createFactMemory({
        attributes: { claimKey: "active-project-count" },
        category: "project",
        content: "Acme currently has 3 projects.",
        id: "projects",
        source: { extractedAt: "2026-01-01T00:00:00.000Z", method: "explicit" },
        subject: "Acme",
        updatedAt: "2026-01-01T00:00:00.000Z",
        userId: "user-1",
      }),
      createFactMemory({
        attributes: { claimKey: "cat-count" },
        category: "personal",
        content: "Acme currently has 2 cats.",
        id: "cats",
        source: { extractedAt: TIMESTAMP, method: "explicit" },
        subject: "Acme",
        updatedAt: TIMESTAMP,
        userId: "user-1",
      }),
    ];

    const result = selectGeneralizedFactsForInternalUse(
      facts,
      "How many current projects does Acme have?",
      createLanguageService(),
      "en",
      "general_chat",
      routingDecision({ strategy: "hybrid" }),
      null,
      TIMESTAMP,
      undefined,
      undefined,
      undefined,
      {
        candidates: [
          { id: "projects", score: 1 },
          { id: "cats", score: 0.8 },
        ],
        maxAdditions: 2,
        maxTotalFacts: 2,
      },
    );

    expect(result.facts.map(({ id }) => id)).toContain("projects");
  });

  it("collapses quantified updates only when their structured claim key matches", () => {
    const facts = [
      createFactMemory({
        attributes: { claimKey: "restaurants-tried-count" },
        category: "personal",
        content: "Martin has tried three Korean restaurants.",
        id: "old-count",
        source: { extractedAt: "2026-01-01T00:00:00.000Z", method: "explicit" },
        subject: "Martin",
        updatedAt: "2026-01-01T00:00:00.000Z",
        userId: "user-1",
      }),
      createFactMemory({
        attributes: { claimKey: "restaurants-tried-count" },
        category: "personal",
        content: "Martin has tried four Korean restaurants.",
        id: "current-count",
        source: { extractedAt: TIMESTAMP, method: "explicit" },
        subject: "Martin",
        updatedAt: TIMESTAMP,
        userId: "user-1",
      }),
    ];

    const result = selectGeneralizedFactsForInternalUse(
      facts,
      "How many Korean restaurants has Martin tried?",
      createLanguageService(),
      "en",
      "general_chat",
      routingDecision({ strategy: "hybrid" }),
      null,
      TIMESTAMP,
      undefined,
      undefined,
      undefined,
      {
        candidates: [
          { id: "old-count", score: 1 },
          { id: "current-count", score: 0.9 },
        ],
        maxAdditions: 2,
        maxTotalFacts: 2,
      },
    );

    expect(result.facts.map(({ id }) => id)).toContain("current-count");
    expect(result.facts.map(({ id }) => id)).not.toContain("old-count");
  });

});
