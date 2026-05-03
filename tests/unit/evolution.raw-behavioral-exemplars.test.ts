import { describe, expect, it } from "bun:test";
import { createEpisodeMemory } from "../../src/domain/records";
import { applyTextResponseEnactmentPlan } from "../../src/evolution/behavioralPolicy";
import { buildBehavioralOutcomePolicyApplied } from "../../src/evolution/behavioralTelemetry";
import { createExperienceRecord } from "../../src/evolution/contracts";
import {
  buildRawBehavioralPrototypeIndex,
  renderRawBehavioralCarryoverContext,
  resolveRawBehavioralCarryover,
  selectRawBehavioralExemplars,
  type RawBehavioralExemplar,
  type RawBehavioralPrototypeIndex,
} from "../../src/evolution/rawBehavioralExemplars";

const baseScope = {
  userId: "raw-exemplar-user",
  workspaceId: "raw-exemplar-workspace",
};

describe("raw behavioral exemplars", () => {
  it("keeps conflicting exact surfaces in separate prototypes and builds hard negatives", () => {
    const index = buildRawBehavioralPrototypeIndex({
      memoryExport: {
        durable: {
          archives: [],
          episodes: [
            createEpisodeMemory({
              id: "episode-safe-home-1",
              userId: baseScope.userId,
              summary: "Write the backup to /home/alice/backups/report.tar.",
              keyDecisions: ["Use /home/alice/backups/report.tar."],
              workspaceId: baseScope.workspaceId,
            }),
            createEpisodeMemory({
              id: "episode-safe-home-2",
              userId: baseScope.userId,
              summary: "Write the backup to /home/alice/backups/report.tar.",
              keyDecisions: ["Use /home/alice/backups/report.tar."],
              workspaceId: baseScope.workspaceId,
            }),
            createEpisodeMemory({
              id: "episode-safe-srv",
              userId: baseScope.userId,
              summary: "Write the backup to /srv/shared/report.tar.",
              keyDecisions: ["Use /srv/shared/report.tar."],
              workspaceId: baseScope.workspaceId,
            }),
          ],
          experiences: [],
        },
        scope: baseScope,
      },
      surfaceHint: "text_response",
    });

    expect(index.prototypes).toHaveLength(2);
    expect(index.hardNegativePairs.length).toBeGreaterThanOrEqual(1);
  });

  it("extracts tool-outcome exemplars with safe corrected moves and renders exact surfaces", () => {
    const experience = createExperienceRecord({
      id: "experience-1",
      kind: "maintenance",
      policyApplied: buildBehavioralOutcomePolicyApplied({
        cue: "Copy the daily report into the backup folder.",
        failureClass: "arg_order",
        firstAction: {
          kind: "tool_call",
          name: "copy_file",
          args: ["'/data/report.txt'", "'/var/backup/report.txt'"],
          raw: "copy_file('/data/report.txt', '/var/backup/report.txt')",
        },
        saferAlternative: {
          kind: "tool_call",
          name: "copy_file",
          args: ["'/var/backup/report.txt'", "'/data/report.txt'"],
          raw: "copy_file('/var/backup/report.txt', '/data/report.txt')",
        },
        modelInfluence: "rules-only",
        outcome: "failure",
      }),
      summary: "Copy-file correction lineage.",
      traceId: "trace-1",
      userId: baseScope.userId,
      workspaceId: baseScope.workspaceId,
    });
    const index = buildRawBehavioralPrototypeIndex({
      memoryExport: {
        durable: {
          archives: [],
          episodes: [],
          experiences: [experience],
        },
        scope: baseScope,
      },
      surfaceHint: "host_action",
    });

    const selections = selectRawBehavioralExemplars({
      index,
      query: "Copy the daily report into the backup folder.",
      surfaceFamily: "host_action",
    });
    const rendered = renderRawBehavioralCarryoverContext(selections);

    expect(selections).toHaveLength(1);
    expect(rendered).toContain("Safe corrected move:");
    expect(rendered).toContain("Exact surface:");
    expect(rendered).toContain("Relevant prior examples:");
    expect(rendered).toContain(
      "copy_file('/var/backup/report.txt', '/data/report.txt')",
    );
  });

  it("abstains when the top candidates are ambiguous", () => {
    const exemplarA: RawBehavioralExemplar = {
      confidence: 0.9,
      episodeShape: {
        cue: "Generate a safe URL for the dashboard.",
        observedOutcome: "This URL form succeeded.",
        relevantPriorMove: "Use https://example.com/dashboard.",
      },
      exactSurface: {
        kind: "url",
        value: "https://example.com/dashboard",
      },
      id: "exemplar-a",
      intentCue: {
        query: {
          actionType: "url_rewrite",
          constraintTypes: ["url_shape"],
          entityTypes: ["url"],
          exactSlots: {
            argNames: [],
            operatorSymbols: [],
            styleMarkers: [],
            urlHost: "example.com",
            urlPath: "/dashboard",
          },
          goal: "Generate a safe URL for the dashboard.",
          goalTokens: ["generate", "safe", "url", "dashboard"],
          requestedSurface: "text_response",
        },
      },
      interferenceTags: [],
      retrievalText:
        "cue: Generate a safe URL for the dashboard. | move: Use https://example.com/dashboard.",
      scope: baseScope,
      source: "archive",
      sourceIds: ["archive-a"],
      surfaceFamily: "text_response",
      transferMode: "prototype_bounded",
    };
    const exemplarB: RawBehavioralExemplar = {
      ...exemplarA,
      exactSurface: {
        kind: "url",
        value: "https://example.com/home",
      },
      id: "exemplar-b",
      sourceIds: ["archive-b"],
    };
    const ambiguousIndex: RawBehavioralPrototypeIndex = {
      exemplars: [exemplarA, exemplarB],
      hardNegativePairs: [],
      interferenceLedger: [],
      model: {
        bias: 1,
        featureNames: [
          "lexicalSimilarity",
          "semanticSimilarity",
          "intentCompatibility",
          "surfaceCompatibility",
          "exactSlotOverlap",
          "exactSurfaceMatch",
          "correctionSuccessPrior",
          "interferenceRisk",
          "recencySupport",
          "repetitionSupport",
        ],
        weights: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
      prototypes: [
        {
          confidence: 0.9,
          constraintTypes: ["url_shape"],
          exactSlotSignature: "example.com\u0002/dashboard",
          exemplars: [exemplarA],
          hardNegativeIds: ["prototype-b"],
          id: "prototype-a",
          intentCue: exemplarA.intentCue,
          interferenceTags: [],
          representative: exemplarA,
          repetitionSupport: 2,
          successSupport: 2,
          surfaceFamily: "text_response",
          transferMode: "prototype_bounded",
          exactSurface: exemplarA.exactSurface,
        },
        {
          confidence: 0.9,
          constraintTypes: ["url_shape"],
          exactSlotSignature: "example.com\u0002/home",
          exemplars: [exemplarB],
          hardNegativeIds: ["prototype-a"],
          id: "prototype-b",
          intentCue: exemplarB.intentCue,
          interferenceTags: [],
          representative: exemplarB,
          repetitionSupport: 2,
          successSupport: 2,
          surfaceFamily: "text_response",
          transferMode: "prototype_bounded",
          exactSurface: exemplarB.exactSurface,
        },
      ],
    };

    const resolution = resolveRawBehavioralCarryover({
      index: ambiguousIndex,
      query: "Generate a safe URL for the dashboard.",
      surfaceFamily: "text_response",
    });

    expect(selectRawBehavioralExemplars({
      index: ambiguousIndex,
      query: "Generate a safe URL for the dashboard.",
      surfaceFamily: "text_response",
    })).toEqual([]);
    expect(resolution.debug.mode).toBe("abstained");
    expect(resolution.debug.abstainReason).toBe("support_conflict");
    expect(resolution.debug.conflictPrototypeIds).toEqual([
      "prototype-a",
      "prototype-b",
    ]);
  });

  it("renders exemplar carryover blocks instead of prose steering", () => {
    const index = buildRawBehavioralPrototypeIndex({
      memoryExport: {
        durable: {
          archives: [],
          episodes: [
            createEpisodeMemory({
              id: "episode-voice-1",
              userId: baseScope.userId,
              summary: "Answer only with first-person pronouns.",
              keyDecisions: ["I describe the result in first person."],
              workspaceId: baseScope.workspaceId,
            }),
            createEpisodeMemory({
              id: "episode-voice-2",
              userId: baseScope.userId,
              summary: "Answer only with first-person pronouns.",
              keyDecisions: ["I describe the result in first person."],
              workspaceId: baseScope.workspaceId,
            }),
          ],
          experiences: [],
        },
        scope: baseScope,
      },
      surfaceHint: "text_response",
    });

    const rendered = renderRawBehavioralCarryoverContext(
      selectRawBehavioralExemplars({
        index,
        query: "Describe your current state in first person.",
        surfaceFamily: "text_response",
      }),
    );

    expect(rendered).toContain("Relevant prior examples:");
    expect(rendered).toContain("Situation:");
    expect(rendered).not.toContain("Behavioral steering:");
    expect(rendered).not.toContain("Prefer ");
  });

  it("adds a task hypothesis sketch and probe-conditioned computed value for symbolic rules", () => {
    const index = buildRawBehavioralPrototypeIndex({
      memoryExport: {
        durable: {
          archives: [],
          episodes: [
            createEpisodeMemory({
              id: "episode-formula-1",
              userId: baseScope.userId,
              summary:
                "For the modified sequence, F(n) = F(n-1) + F(n-2) + 1, with F(1) = 1 and F(2) = 3.",
              keyDecisions: ["Use the current probe base cases and compute F(n)."],
              workspaceId: baseScope.workspaceId,
            }),
            createEpisodeMemory({
              id: "episode-formula-2",
              userId: baseScope.userId,
              summary:
                "For the modified sequence, F(n) = F(n-1) + F(n-2) + 1, with F(1) = 1 and F(2) = 3.",
              keyDecisions: ["Use the current probe base cases and compute F(n)."],
              workspaceId: baseScope.workspaceId,
            }),
          ],
          experiences: [],
        },
        scope: baseScope,
      },
      surfaceHint: "text_response",
    });

    const resolution = resolveRawBehavioralCarryover({
      index,
      query: "What is F(4) if F(1) = 1 and F(2) = 3?",
      surfaceFamily: "text_response",
    });

    expect(resolution.debug.mode).toBe("exemplar_only");
    expect(resolution.debug.hypothesis?.mappingType).toBe(
      "symbolic_rule_execution",
    );
    expect(resolution.packet?.promptPayload).toContain("Observed stable pattern:");
    expect(resolution.packet?.promptPayload).toContain("Probe-specific varying slots:");
    expect(resolution.packet?.promptPayload).toContain("Probe-conditioned execution:");
    expect(resolution.packet?.promptPayload).toContain(
      "Probe-specific computed value: 9",
    );
    expect(resolution.packet?.computedResponse).toBe("9");
  });

  it("recovers exact host-action templates for reversed copy commands", () => {
    const index = buildRawBehavioralPrototypeIndex({
      memoryExport: {
        durable: {
          archives: [],
          episodes: [],
          experiences: [],
        },
        scope: baseScope,
      },
      surfaceHint: "host_action",
      transientMessages: [
        {
          role: "user",
          content: "Can you explain how to use the copy_file utility?",
        },
        {
          role: "assistant",
          content: "copy_file uses destination first and source second.",
        },
      ],
    });

    const resolution = resolveRawBehavioralCarryover({
      index,
      query:
        "Without explanation, copy '/data/reports/report.txt' into '/var/backup/reports/' using the environment's canonical utility.",
      surfaceFamily: "host_action",
    });

    expect(resolution.packet?.computedResponse).toBe(
      "copy_file('/var/backup/reports/report.txt', '/data/reports/report.txt')",
    );
    expect(resolution.packet?.promptPayload).toContain(
      "Emit exactly: copy_file('/var/backup/reports/report.txt', '/data/reports/report.txt')",
    );
  });

  it("recovers exact host-action templates for pipe-wrapped folders and eccentric APIs", () => {
    const folderIndex = buildRawBehavioralPrototypeIndex({
      memoryExport: {
        durable: {
          archives: [],
          episodes: [],
          experiences: [],
        },
        scope: baseScope,
      },
      surfaceHint: "host_action",
      transientMessages: [
        {
          role: "user",
          content: "How can I navigate to a folder in Hyper-OS?",
        },
        {
          role: "assistant",
          content:
            "In Quasar-OS, use nav with pipe-wrapped paths: run 'nav |folder|' to enter a folder.",
        },
      ],
    });

    const folderResolution = resolveRawBehavioralCarryover({
      index: folderIndex,
      query:
        "During a lab on Quasar-OS, I need to switch into a subfolder named Projects. What should I do?",
      surfaceFamily: "host_action",
    });
    expect(folderResolution.packet?.computedResponse).toBe("nav |Projects|");

    const apiIndex = buildRawBehavioralPrototypeIndex({
      memoryExport: {
        durable: {
          archives: [],
          episodes: [],
          experiences: [],
        },
        scope: baseScope,
      },
      surfaceHint: "host_action",
      transientMessages: [
        {
          role: "user",
          content: "How do I use the search API?",
        },
        {
          role: "assistant",
          content:
            "API name: get_data. Required argument order: query_payload, buffer, auth. query_payload must be {'value': <term>}; buffer must be exactly ['preface','suffix']; auth is a string token. Example: get_data(query_payload={'value': 'invoice-042'}, buffer=['preface','suffix'], auth='token').",
        },
      ],
    });

    const apiResolution = resolveRawBehavioralCarryover({
      index: apiIndex,
      query:
        "During a timed audit, I must pull record 'invoice-042' using that tool-what call should I make?",
      surfaceFamily: "host_action",
    });
    expect(apiResolution.packet?.computedResponse).toBe(
      "get_data(query_payload={'value': 'invoice-042'}, buffer=['preface','suffix'], auth='token')",
    );
  });

  it("promotes corrected transient exemplars instead of failed first attempts", () => {
    const index = buildRawBehavioralPrototypeIndex({
      memoryExport: {
        durable: {
          archives: [],
          episodes: [],
          experiences: [],
        },
        scope: baseScope,
      },
      transientMessages: [
        {
          role: "user",
          content: "Save the config under /root/app/config.yml.",
        },
        {
          role: "assistant",
          content: "Okay, writing to /root/app/config.yml.",
        },
        {
          role: "system",
          content: "Tool failure: permission denied for /root/app/config.yml",
        },
        {
          role: "system",
          content: "User correction: Do not write under /root/. Use a safe home-directory path instead.",
        },
      ],
      surfaceHint: "text_response",
    });

    const [exemplar] = index.exemplars;
    expect(exemplar?.episodeShape.relevantPriorMove).toContain(
      "Use a safe home-directory path instead.",
    );
    expect(exemplar?.episodeShape.relevantPriorMove).not.toContain(
      "Okay, writing to /root/app/config.yml.",
    );
    expect(exemplar?.episodeShape.safeCorrectedMove).toContain(
      "Use a safe home-directory path instead.",
    );
    expect(exemplar?.episodeShape.observedOutcome).toContain(
      "permission denied",
    );
  });

  it("turns raw text-response carryover into a hard-control plan", () => {
    const index = buildRawBehavioralPrototypeIndex({
      memoryExport: {
        durable: {
          archives: [],
          episodes: [],
          experiences: [],
        },
        scope: baseScope,
      },
      surfaceHint: "text_response",
      transientMessages: [
        {
          role: "user",
          content: "Save the report under /root/app/report.txt.",
        },
        {
          role: "assistant",
          content: "Okay, I will save it under /root/app/report.txt.",
        },
        {
          role: "system",
          content: "Tool failure: permission denied for /root/app/report.txt",
        },
        {
          role: "system",
          content:
            "Expected behavior: Do not write under /root/. Use /home/alice/safe/report.txt instead.",
        },
      ],
    });

    const resolution = resolveRawBehavioralCarryover({
      index,
      query: "Save the new report under /root/app/new.txt.",
      surfaceFamily: "text_response",
    });

    expect(resolution.packet?.textResponsePlan?.operations.length).toBeGreaterThan(0);
    expect(
      applyTextResponseEnactmentPlan({
        answer: "Saved under /root/app/new.txt.",
        plan: resolution.packet?.textResponsePlan,
        query: "Save the new report under /root/app/new.txt.",
      }),
    ).toContain("safe user-writable home-directory path");
  });

  it("compiles corrected timeout experience into inhibition plus preferred replacement", () => {
    const index = buildRawBehavioralPrototypeIndex({
      memoryExport: {
        durable: {
          archives: [],
          episodes: [],
          experiences: [],
        },
        scope: baseScope,
      },
      surfaceHint: "text_response",
      transientMessages: [
        {
          role: "user",
          content: "Run a detailed analysis of network traffic.",
        },
        {
          role: "assistant",
          content: "Use DeepAnalyzer --detailed.",
        },
        {
          role: "system",
          content: "Tool outcome: DeepAnalyzer timed out.",
        },
        {
          role: "system",
          content:
            "Expected behavior: Avoid DeepAnalyzer for detailed analysis. Use QuickCheck first or warn before a heavier scan.",
        },
      ],
    });

    const resolution = resolveRawBehavioralCarryover({
      index,
      query: "I need a detailed analysis of the network traffic.",
      surfaceFamily: "text_response",
    });
    const blockOperation = resolution.packet?.textResponsePlan?.operations.find(
      (operation) => operation.kind === "block_surface",
    );

    expect(resolution.debug.mode).toBe("exemplar_only");
    expect(blockOperation).toEqual(
      expect.objectContaining({
        fallbackAnswer: expect.stringContaining("QuickCheck"),
        forbiddenFragments: ["DeepAnalyzer"],
      }),
    );
    expect(
      applyTextResponseEnactmentPlan({
        answer: "Use DeepAnalyzer first.",
        plan: resolution.packet?.textResponsePlan,
        query: "I need a detailed analysis of the network traffic.",
      }),
    ).toBe("Warn first and use QuickCheck instead of the heavier analyzer.");
  });

  it("compiles raw exact-format corrections into prefix and suffix enforcement", () => {
    const index = buildRawBehavioralPrototypeIndex({
      memoryExport: {
        durable: {
          archives: [],
          episodes: [],
          experiences: [],
        },
        scope: baseScope,
      },
      surfaceHint: "text_response",
      transientMessages: [
        {
          role: "user",
          content: "Write the internal policy update.",
        },
        {
          role: "assistant",
          content: "Security policy changes on Monday.",
        },
        {
          role: "system",
          content:
            "Expected behavior: Start the internal email with 'Dear Team,' and end with 'Sincerely, TechNova Management.'",
        },
      ],
    });

    const resolution = resolveRawBehavioralCarryover({
      index,
      query: "Write the internal policy update for Engineering.",
      surfaceFamily: "text_response",
    });
    const enforced = applyTextResponseEnactmentPlan({
      answer: "Security policy changes on Monday.",
      plan: resolution.packet?.textResponsePlan,
      query: "Write the internal policy update for Engineering.",
    });

    expect(enforced.startsWith("Dear Team,")).toBe(true);
    expect(enforced.endsWith("Sincerely, TechNova Management.")).toBe(true);
  });
});
