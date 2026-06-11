import { describe, expect, it } from "bun:test";
import { createFactMemory } from "../../src/domain/records";
import { createLanguageService } from "../../src/language";
import type { RecallCandidateTrace } from "../../src/recall/engine";
import { buildFactCandidates, rankFactCandidates } from "../../src/recall/scoring";
import { createSelectionDraft } from "../../src/recall/factSelection/draft";

const TIMESTAMP = "2026-01-10T00:00:00.000Z";

function buildRankedEntry() {
  const language = createLanguageService();
  const fact = createFactMemory({
    id: "fact-draft-1",
    userId: "user-1",
    category: "project",
    content: "I built three raised garden beds for the redesign.",
    source: { method: "explicit", extractedAt: TIMESTAMP },
    updatedAt: TIMESTAMP,
  });
  return rankFactCandidates(
    buildFactCandidates([fact], "garden redesign", language, "en", TIMESTAMP),
    "rules-only",
  )[0]!;
}

function buildTrace(memoryId: string): RecallCandidateTrace {
  return {
    memoryId,
    memoryType: "fact",
    slot: "generic",
    returned: false,
    whySuppressed: "not selected",
    intentScore: 0,
    lexicalScore: 0,
    freshnessScore: 0,
    explicitnessScore: 0,
    usageScore: 0,
    evidenceScore: 0,
    outcomeScore: 0,
    verificationPenaltyScore: 0,
    fallback: "none",
  };
}

describe("selection draft", () => {
  it("preserves legacy selectAndTrace semantics: unconditional push without dedupe", () => {
    const entry = buildRankedEntry();
    const traces = [buildTrace(entry.fact.id)];
    const draft = createSelectionDraft({ traces });

    draft.select(entry);
    draft.select(entry);

    // Deliberate: the legacy closure pushed unconditionally and callers guard
    // duplicates with selectedIds at the call site. Do not "fix" this here.
    expect(draft.selected).toHaveLength(2);
    expect(draft.selectedIds.has(entry.fact.id)).toBe(true);
    expect(traces[0]?.returned).toBe(true);
    expect(traces[0]?.whyReturned).toBeDefined();
    expect(traces[0]?.whySuppressed).toBeUndefined();
  });

  it("marks slot and fallback through to the trace", () => {
    const entry = buildRankedEntry();
    const traces = [buildTrace(entry.fact.id)];
    const draft = createSelectionDraft({ traces });

    draft.select(entry, "blocker", "same_slot_unique_candidate");

    expect(traces[0]?.slot).toBe("blocker");
    expect(traces[0]?.fallback).toBe("same_slot_unique_candidate");
  });

  it("starts with an empty summary shell", () => {
    const draft = createSelectionDraft({ traces: [] });

    expect(draft.summary).toEqual({ augmenterStages: [] });
    expect(draft.selected).toEqual([]);
    expect(draft.selectedIds.size).toBe(0);
  });
});
