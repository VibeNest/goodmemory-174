import { describe, expect, it } from "bun:test";
import {
  createEpisodeMemory,
  createFactMemory,
  createReferenceMemory,
} from "../../src/domain/records";
import {
  evaluateVerificationHints,
} from "../../src/verify/policy";

describe("verification policy", () => {
  it("flags stale action-driving facts for verification", () => {
    const hints = evaluateVerificationHints({
      query: "Proceed with the migration steps using the remembered project status.",
      referenceTime: "2026-04-02T00:00:00.000Z",
      facts: [
        createFactMemory({
          id: "fact-1",
          userId: "u-1",
          category: "project",
          content: "Robot workflow is blocked on prod migration.",
          source: { method: "explicit", extractedAt: "2025-01-01T00:00:00.000Z" },
          updatedAt: "2025-01-01T00:00:00.000Z",
          createdAt: "2025-01-01T00:00:00.000Z",
        }),
      ],
    });

    expect(hints).toHaveLength(1);
    expect(hints[0]?.memoryId).toBe("fact-1");
    expect(hints[0]?.reason).toContain("stale");
  });

  it("allows fresh explicit facts to pass without verification hints", () => {
    const hints = evaluateVerificationHints({
      query: "Summarize the current project context for me.",
      referenceTime: "2026-04-02T00:00:00.000Z",
      facts: [
        createFactMemory({
          id: "fact-1",
          userId: "u-1",
          category: "project",
          content: "Robot workflow is blocked on prod migration.",
          source: { method: "explicit", extractedAt: "2026-03-30T00:00:00.000Z" },
          updatedAt: "2026-03-30T00:00:00.000Z",
          createdAt: "2026-03-30T00:00:00.000Z",
        }),
      ],
    });

    expect(hints).toHaveLength(0);
  });

  it("flags inferred facts more aggressively on action-oriented prompts", () => {
    const hints = evaluateVerificationHints({
      query: "Use this memory to decide the next rollout step.",
      referenceTime: "2026-04-02T00:00:00.000Z",
      facts: [
        createFactMemory({
          id: "fact-1",
          userId: "u-1",
          category: "technical",
          content: "The runtime refactor might still be unstable.",
          source: { method: "inferred", extractedAt: "2026-03-31T00:00:00.000Z" },
          updatedAt: "2026-03-31T00:00:00.000Z",
          createdAt: "2026-03-31T00:00:00.000Z",
        }),
      ],
    });

    expect(hints).toHaveLength(1);
    expect(hints[0]?.reason).toContain("inferred");
  });

  it("flags stale references and episodes when they drive action", () => {
    const hints = evaluateVerificationHints({
      query: "Use the remembered runbook and workflow to execute the rollout.",
      referenceTime: "2026-04-02T00:00:00.000Z",
      facts: [],
      references: [
        createReferenceMemory({
          id: "ref-1",
          userId: "u-1",
          title: "Runbook",
          pointer: "docs/runbook.md",
          source: { method: "explicit", extractedAt: "2025-12-01T00:00:00.000Z" },
          createdAt: "2025-12-01T00:00:00.000Z",
          updatedAt: "2025-12-01T00:00:00.000Z",
        }),
      ],
      episodes: [
        createEpisodeMemory({
          id: "ep-1",
          userId: "u-1",
          summary: "Previous rollout used the old checklist and manual verification.",
          topics: ["rollout", "workflow"],
          keyDecisions: [],
          unresolvedItems: [],
          importance: 0.8,
          confidence: 0.9,
          createdAt: "2025-12-15T00:00:00.000Z",
        }),
      ],
    });

    expect(hints.map((hint) => hint.memoryType).sort()).toEqual([
      "episode",
      "reference",
    ]);
  });
});
