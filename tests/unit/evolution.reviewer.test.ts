import { describe, expect, it } from "bun:test";
import {
  createFactMemory,
  createFeedbackMemory,
} from "../../src/domain/records";
import {
  createExperienceRecord,
} from "../../src/evolution/contracts";
import {
  buildBehavioralOutcomeExperienceRecord,
  readCompiledGuidance,
  toStoredExperienceRecord,
} from "../../src/evolution/behavioralTelemetry";
import { createRulesOnlyReviewer } from "../../src/evolution/reviewer";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";
import {
  createMemoryRepositories,
} from "../../src/storage/repositories";

describe("rules-only reviewer", () => {
  it("emits a memory revision proposal for repeated verification pressure on the same memory", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });
    const reviewer = createRulesOnlyReviewer({
      repositories,
      now: () => "2026-04-15T00:00:00.000Z",
      createId: () => "proposal-1",
      createTraceId: () => "review-trace-1",
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a" };

    await repositories.facts.add(
      createFactMemory({
        id: "fact-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "The rollout blocker is vendor approval.",
        source: { method: "explicit", extractedAt: "2026-03-01T00:00:00.000Z" },
      }),
    );
    await repositories.experiences.add(
      createExperienceRecord({
        id: "xp-verify-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        kind: "verify",
        traceId: "trace-verify-1",
        summary: "First verification hint for the rollout blocker.",
        linkedMemoryIds: ["fact-1"],
        linkedEvidenceIds: ["evidence-1"],
        modelInfluence: "rules-only",
      }),
    );
    await repositories.experiences.add(
      createExperienceRecord({
        id: "xp-verify-2",
        userId: "u-1",
        workspaceId: "workspace-a",
        kind: "verify",
        traceId: "trace-verify-2",
        summary: "Second verification hint for the rollout blocker.",
        linkedMemoryIds: ["fact-1"],
        linkedEvidenceIds: ["evidence-2"],
        modelInfluence: "rules-only",
      }),
    );

    const proposals = await reviewer.review({ scope });

    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.proposalType).toBe("memory_revision");
    expect(proposals[0]?.linkedMemoryIds).toEqual(["fact-1"]);
    expect(proposals[0]?.linkedEvidenceIds).toEqual(["evidence-1", "evidence-2"]);
    expect(proposals[0]?.sourceExperienceIds).toEqual(["xp-verify-1", "xp-verify-2"]);
    expect(proposals[0]?.modelInfluence).toBe("rules-only");
  });

  it("emits a procedural pattern proposal for repeated successful feedback on the same guidance", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });
    const reviewer = createRulesOnlyReviewer({
      repositories,
      now: () => "2026-04-15T00:00:00.000Z",
      createId: () => "proposal-1",
      createTraceId: () => "review-trace-1",
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a" };

    await repositories.feedback.upsert(
      createFeedbackMemory({
        id: "feedback-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        rule: "Use bullet points in summaries.",
        kind: "do",
        source: { method: "explicit", extractedAt: "2026-04-01T00:00:00.000Z" },
      }),
    );
    await repositories.experiences.add(
      createExperienceRecord({
        id: "xp-feedback-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        kind: "feedback",
        traceId: "trace-feedback-1",
        summary: "Feedback written as do guidance.",
        linkedMemoryIds: ["feedback-1"],
        modelInfluence: "rules-only",
      }),
    );
    await repositories.experiences.add(
      createExperienceRecord({
        id: "xp-feedback-2",
        userId: "u-1",
        workspaceId: "workspace-a",
        kind: "feedback",
        traceId: "trace-feedback-2",
        summary: "Feedback merged into the same guidance.",
        linkedMemoryIds: ["feedback-1"],
        modelInfluence: "rules-only",
      }),
    );

    const proposals = await reviewer.review({ scope });

    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.proposalType).toBe("procedural_pattern");
    expect(proposals[0]?.linkedMemoryIds).toEqual(["feedback-1"]);
    expect(proposals[0]?.summary).toContain("Use bullet points");
  });

  it("emits a maintenance proposal for a single verification signal and ignores low-signal traces", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });
    const reviewer = createRulesOnlyReviewer({
      repositories,
      now: () => "2026-04-15T00:00:00.000Z",
      createId: (() => {
        const ids = ["proposal-1", "proposal-2"];

        return () => ids.shift() ?? "proposal-fallback";
      })(),
      createTraceId: () => "review-trace-1",
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a" };

    await repositories.experiences.add(
      createExperienceRecord({
        id: "xp-remember-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        kind: "remember",
        traceId: "trace-remember-1",
        summary: "Remember accepted one candidate.",
      }),
    );
    await repositories.experiences.add(
      createExperienceRecord({
        id: "xp-verify-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        kind: "verify",
        traceId: "trace-verify-1",
        summary: "Verification hint for one stale fact.",
        linkedMemoryIds: ["fact-1"],
        linkedEvidenceIds: ["evidence-1"],
      }),
    );

    const proposals = await reviewer.review({ scope });

    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.proposalType).toBe("maintenance_action");
    expect(proposals[0]?.linkedMemoryIds).toEqual(["fact-1"]);
    expect(proposals[0]?.linkedEvidenceIds).toEqual(["evidence-1"]);
  });

  it("drops session scope from proposals compiled from multiple sessions", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });
    const reviewer = createRulesOnlyReviewer({
      repositories,
      now: () => "2026-04-15T00:00:00.000Z",
      createId: () => "proposal-1",
      createTraceId: () => "review-trace-1",
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-2" };

    await repositories.facts.add(
      createFactMemory({
        id: "fact-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "The rollout blocker is vendor approval.",
        source: { method: "explicit", extractedAt: "2026-03-01T00:00:00.000Z" },
      }),
    );
    await repositories.experiences.add(
      createExperienceRecord({
        id: "xp-verify-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-1",
        kind: "verify",
        traceId: "trace-verify-1",
        summary: "First verification hint for the rollout blocker.",
        linkedMemoryIds: ["fact-1"],
      }),
    );
    await repositories.experiences.add(
      createExperienceRecord({
        id: "xp-verify-2",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-2",
        kind: "verify",
        traceId: "trace-verify-2",
        summary: "Second verification hint for the rollout blocker.",
        linkedMemoryIds: ["fact-1"],
      }),
    );

    const proposals = await reviewer.review({ scope });

    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.proposalType).toBe("memory_revision");
    expect(proposals[0]?.workspaceId).toBe("workspace-a");
    expect(proposals[0]?.sessionId).toBeUndefined();
  });

  it("does not emit duplicate proposals when an equivalent accepted proposal already exists", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });
    const reviewer = createRulesOnlyReviewer({
      repositories,
      now: () => "2026-04-15T00:00:00.000Z",
      createId: () => "proposal-2",
      createTraceId: () => "review-trace-2",
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a" };

    await repositories.feedback.upsert(
      createFeedbackMemory({
        id: "feedback-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        rule: "Use bullet points in summaries.",
        kind: "do",
        source: { method: "explicit", extractedAt: "2026-04-01T00:00:00.000Z" },
      }),
    );
    await repositories.experiences.add(
      createExperienceRecord({
        id: "xp-feedback-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        kind: "feedback",
        traceId: "trace-feedback-1",
        summary: "Feedback written.",
        linkedMemoryIds: ["feedback-1"],
      }),
    );
    await repositories.experiences.add(
      createExperienceRecord({
        id: "xp-feedback-2",
        userId: "u-1",
        workspaceId: "workspace-a",
        kind: "feedback",
        traceId: "trace-feedback-2",
        summary: "Feedback merged.",
        linkedMemoryIds: ["feedback-1"],
      }),
    );
    await repositories.proposals.add({
      id: "proposal-1",
      userId: "u-1",
      workspaceId: "workspace-a",
      proposalType: "procedural_pattern",
      status: "accepted",
      traceId: "trace-existing",
      summary: "Promote repeated guidance into a governed procedural pattern: Use bullet points in summaries.",
      rationale: "Existing accepted proposal.",
      sourceExperienceIds: ["xp-feedback-1", "xp-feedback-2"],
      linkedMemoryIds: ["feedback-1"],
      linkedArchiveIds: [],
      linkedEvidenceIds: [],
      modelInfluence: "rules-only",
      createdAt: "2026-04-14T00:00:00.000Z",
      updatedAt: "2026-04-14T00:00:00.000Z",
    });

    const proposals = await reviewer.review({ scope });

    expect(proposals).toHaveLength(0);
  });

  it("refreshes an equivalent delayed proposal when new experience lineage arrives", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });
    const reviewer = createRulesOnlyReviewer({
      repositories,
      now: () => "2026-04-15T00:00:00.000Z",
      createId: () => "proposal-2",
      createTraceId: () => "review-trace-2",
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a" };

    await repositories.feedback.upsert(
      createFeedbackMemory({
        id: "feedback-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        rule: "Use bullet points in summaries.",
        kind: "do",
        source: { method: "explicit", extractedAt: "2026-04-01T00:00:00.000Z" },
      }),
    );
    await repositories.experiences.add(
      createExperienceRecord({
        id: "xp-feedback-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        kind: "feedback",
        traceId: "trace-feedback-1",
        summary: "Feedback written.",
        linkedMemoryIds: ["feedback-1"],
      }),
    );
    await repositories.experiences.add(
      createExperienceRecord({
        id: "xp-feedback-2",
        userId: "u-1",
        workspaceId: "workspace-a",
        kind: "feedback",
        traceId: "trace-feedback-2",
        summary: "Feedback merged.",
        linkedMemoryIds: ["feedback-1"],
      }),
    );
    await repositories.experiences.add(
      createExperienceRecord({
        id: "xp-feedback-3",
        userId: "u-1",
        workspaceId: "workspace-a",
        kind: "feedback",
        traceId: "trace-feedback-3",
        summary: "Feedback validated again.",
        linkedMemoryIds: ["feedback-1"],
      }),
    );
    await repositories.proposals.add({
      id: "proposal-1",
      userId: "u-1",
      workspaceId: "workspace-a",
      proposalType: "procedural_pattern",
      status: "delayed",
      traceId: "trace-existing",
      summary: "Promote repeated guidance into a governed procedural pattern: Use bullet points in summaries.",
      rationale: "Rules-only reviewer saw 2 successful feedback traces pointing to the same active guidance. This is stable enough to propose as a reusable procedural pattern.",
      sourceExperienceIds: ["xp-feedback-1", "xp-feedback-2"],
      linkedMemoryIds: ["feedback-1"],
      linkedArchiveIds: [],
      linkedEvidenceIds: [],
      modelInfluence: "rules-only",
      createdAt: "2026-04-14T00:00:00.000Z",
      updatedAt: "2026-04-14T00:00:00.000Z",
    });

    const proposals = await reviewer.review({ scope });

    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.id).toBe("proposal-1");
    expect(proposals[0]?.traceId).toBe("trace-existing");
    expect(proposals[0]?.createdAt).toBe("2026-04-14T00:00:00.000Z");
    expect(proposals[0]?.sourceExperienceIds).toEqual([
      "xp-feedback-1",
      "xp-feedback-2",
      "xp-feedback-3",
    ]);
    expect(proposals[0]?.rationale).toContain("3 successful feedback traces");
  });

  it("emits a procedural proposal from repeated tool outcome lineage with compiled guidance", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });
    const reviewer = createRulesOnlyReviewer({
      repositories,
      now: () => "2026-04-20T00:00:00.000Z",
      createId: () => "proposal-tool-outcome-1",
      createTraceId: () => "review-trace-tool-outcome-1",
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a" };

    await repositories.experiences.add(
      toStoredExperienceRecord(buildBehavioralOutcomeExperienceRecord({
        scope,
        traceId: "trace-tool-outcome-1",
        createdAt: "2026-04-19T00:00:00.000Z",
        createId: () => "xp-tool-outcome-1",
        result: {
          cue: "detailed analysis",
          failureClass: "timeout",
          firstAction: {
            kind: "tool_call",
            name: "DeepAnalyzer",
            raw: "DeepAnalyzer --detailed",
          },
          saferAlternative: {
            kind: "tool_call",
            name: "QuickCheck",
            raw: "QuickCheck --network",
          },
          modelInfluence: "rules-only",
        },
      })),
    );
    await repositories.experiences.add(
      toStoredExperienceRecord(buildBehavioralOutcomeExperienceRecord({
        scope,
        traceId: "trace-tool-outcome-2",
        createdAt: "2026-04-20T00:00:00.000Z",
        createId: () => "xp-tool-outcome-2",
        result: {
          cue: "detailed analysis",
          failureClass: "timeout",
          firstAction: {
            kind: "tool_call",
            name: "DeepAnalyzer",
            raw: "DeepAnalyzer --detailed",
          },
          saferAlternative: {
            kind: "tool_call",
            name: "QuickCheck",
            raw: "QuickCheck --network",
          },
          modelInfluence: "rules-only",
        },
      })),
    );

    const proposals = await reviewer.review({ scope });

    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.proposalType).toBe("procedural_pattern");
    expect(proposals[0]?.linkedMemoryIds).toEqual([]);
    expect(proposals[0]?.sourceExperienceIds).toEqual([
      "xp-tool-outcome-1",
      "xp-tool-outcome-2",
    ]);
    expect(proposals[0]?.summary).toContain("DeepAnalyzer");
    expect(readCompiledGuidance(proposals[0]!)).toEqual({
      rule:
        "When detailed analysis previously caused DeepAnalyzer --detailed timeouts, avoid DeepAnalyzer --detailed on the first action and use QuickCheck --network before proceeding.",
      kind: "dont",
      appliesTo: "general_response",
      confidence: 0.9,
      why: "Repeated tool-outcome failures show the original first action is unsafe for this cue.",
    });
  });

  it("does not merge tool outcome experiences that only share the action name", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });
    const reviewer = createRulesOnlyReviewer({
      repositories,
      now: () => "2026-04-20T00:00:00.000Z",
      createId: () => "proposal-tool-outcome-1",
      createTraceId: () => "review-trace-tool-outcome-1",
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a" };

    await repositories.experiences.add(
      toStoredExperienceRecord(buildBehavioralOutcomeExperienceRecord({
        scope,
        traceId: "trace-tool-outcome-1",
        createdAt: "2026-04-19T00:00:00.000Z",
        createId: () => "xp-tool-outcome-1",
        result: {
          cue: "copy the report",
          failureClass: "mismatch",
          firstAction: {
            kind: "command",
            name: "copy_file",
            args: ["/backup/report.txt", "/src/report.txt"],
            raw: "copy_file('/backup/report.txt', '/src/report.txt')",
          },
          saferAlternative: {
            kind: "command",
            name: "copy_file",
            args: ["/src/report.txt", "/backup/report.txt"],
            raw: "copy_file('/src/report.txt', '/backup/report.txt')",
          },
          modelInfluence: "rules-only",
        },
      })),
    );
    await repositories.experiences.add(
      toStoredExperienceRecord(buildBehavioralOutcomeExperienceRecord({
        scope,
        traceId: "trace-tool-outcome-2",
        createdAt: "2026-04-20T00:00:00.000Z",
        createId: () => "xp-tool-outcome-2",
        result: {
          cue: "copy the report",
          failureClass: "mismatch",
          firstAction: {
            kind: "command",
            name: "copy_file",
            args: ["/src/report.txt", "/backup/report.txt"],
            raw: "copy_file('/src/report.txt', '/backup/report.txt')",
          },
          saferAlternative: {
            kind: "command",
            name: "copy_file",
            args: ["/backup/report.txt", "/src/report.txt"],
            raw: "copy_file('/backup/report.txt', '/src/report.txt')",
          },
          modelInfluence: "rules-only",
        },
      })),
    );

    const proposals = await reviewer.review({ scope });

    expect(proposals).toHaveLength(0);
  });

  it("renders full action labels when outcome-derived guidance reuses the same command name", async () => {
    const repositories = createMemoryRepositories({
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    });
    const reviewer = createRulesOnlyReviewer({
      repositories,
      now: () => "2026-04-20T00:00:00.000Z",
      createId: () => "proposal-tool-outcome-1",
      createTraceId: () => "review-trace-tool-outcome-1",
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a" };

    const repeatedOutcome = {
      cue: "copy the report",
      failureClass: "mismatch",
      firstAction: {
        kind: "command" as const,
        name: "copy_file",
        args: ["/backup/report.txt", "/src/report.txt"],
        raw: "copy_file('/backup/report.txt', '/src/report.txt')",
      },
      saferAlternative: {
        kind: "command" as const,
        name: "copy_file",
        args: ["/src/report.txt", "/backup/report.txt"],
        raw: "copy_file('/src/report.txt', '/backup/report.txt')",
      },
      modelInfluence: "rules-only" as const,
    };

    await repositories.experiences.add(
      toStoredExperienceRecord(buildBehavioralOutcomeExperienceRecord({
        scope,
        traceId: "trace-tool-outcome-1",
        createdAt: "2026-04-19T00:00:00.000Z",
        createId: () => "xp-tool-outcome-1",
        result: repeatedOutcome,
      })),
    );
    await repositories.experiences.add(
      toStoredExperienceRecord(buildBehavioralOutcomeExperienceRecord({
        scope,
        traceId: "trace-tool-outcome-2",
        createdAt: "2026-04-20T00:00:00.000Z",
        createId: () => "xp-tool-outcome-2",
        result: repeatedOutcome,
      })),
    );

    const proposals = await reviewer.review({ scope });

    expect(proposals).toHaveLength(1);
    expect(readCompiledGuidance(proposals[0]!)?.rule).toBe(
      "When copy the report previously caused copy_file(/backup/report.txt, /src/report.txt) mismatches, avoid copy_file(/backup/report.txt, /src/report.txt) on the first action and use copy_file(/src/report.txt, /backup/report.txt) before proceeding.",
    );
  });
});
