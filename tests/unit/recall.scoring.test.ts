import { describe, expect, it } from "bun:test";
import {
  createFactMemory,
  createFeedbackMemory,
  createReferenceMemory,
} from "../../src/domain/records";
import { createLanguageService } from "../../src/language";
import {
  buildFactCandidates,
  sortFeedback,
  normalizeSemanticScores,
  rankReferenceCandidates,
  buildReferenceCandidates,
} from "../../src/recall/scoring";

const TIMESTAMP = "2026-01-10T00:00:00.000Z";
const SOURCE = {
  method: "explicit" as const,
  extractedAt: TIMESTAMP,
};

describe("recall scoring", () => {
  it("normalizes semantic scores against the highest result", () => {
    const scores = normalizeSemanticScores([
      { id: "fact-1", score: 4 },
      { id: "fact-2", score: 2 },
    ]);

    expect(scores.get("fact-1")).toBe(1);
    expect(scores.get("fact-2")).toBe(0.5);
  });

  it("derives blocker fact metadata during candidate building", () => {
    const language = createLanguageService();
    const fact = createFactMemory({
      id: "fact-1",
      userId: "user-1",
      category: "project",
      content: "The runtime rollout is blocked by legal signoff.",
      source: SOURCE,
      updatedAt: TIMESTAMP,
    });

    const [candidate] = buildFactCandidates(
      [fact],
      "What is the blocker right now?",
      language,
      "en",
      TIMESTAMP,
    );

    expect(candidate?.factKind).toBe("blocker");
    expect(candidate?.scopeKind).toBe("project");
    expect(candidate?.explicitnessScore).toBeGreaterThan(0);
  });

  it("adds bounded outcome support signals to fact candidates", () => {
    const language = createLanguageService();
    const fact = createFactMemory({
      id: "fact-1",
      userId: "user-1",
      category: "project",
      content: "The runtime rollout is blocked by legal signoff.",
      source: SOURCE,
      accessCount: 4,
      lastAccessedAt: "2026-01-08T00:00:00.000Z",
      updatedAt: TIMESTAMP,
    });

    const [candidate] = buildFactCandidates(
      [fact],
      "What is the blocker right now?",
      language,
      "en",
      TIMESTAMP,
      undefined,
      new Map([["fact-1", 3]]),
    );

    expect(candidate?.usageScore).toBeGreaterThan(0);
    expect(candidate?.evidenceScore).toBeGreaterThan(0);
    expect(candidate?.outcomeScore).toBeGreaterThan(0);
  });

  it("prefers higher lexical reference matches when ranking", () => {
    const language = createLanguageService();
    const references = [
      createReferenceMemory({
        id: "ref-lo",
        userId: "user-1",
        title: "Tracker",
        pointer: "docs/tracker.md",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
      createReferenceMemory({
        id: "ref-hi",
        userId: "user-1",
        title: "Runtime Runbook",
        pointer: "docs/runtime-runbook.md",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
    ];

    const ranked = rankReferenceCandidates(
      buildReferenceCandidates(
        references,
        "Where is the runtime runbook?",
        language,
        "en",
        TIMESTAMP,
      ),
      "rules-only",
    );

    expect(ranked[0]?.reference.id).toBe("ref-hi");
  });

  it("prefers recently used feedback when sorting active guidance", () => {
    const feedback = sortFeedback([
      createFeedbackMemory({
        id: "feedback-stale",
        userId: "user-1",
        rule: "Keep summaries concise.",
        kind: "prefer",
        source: SOURCE,
        updatedAt: "2026-01-09T00:00:00.000Z",
      }),
      createFeedbackMemory({
        id: "feedback-used",
        userId: "user-1",
        rule: "Use bullet points in summaries.",
        kind: "validated_pattern",
        source: SOURCE,
        updatedAt: "2026-01-05T00:00:00.000Z",
        lastUsedAt: "2026-01-10T00:00:00.000Z",
      }),
    ]);

    expect(feedback[0]?.id).toBe("feedback-used");
  });
});
