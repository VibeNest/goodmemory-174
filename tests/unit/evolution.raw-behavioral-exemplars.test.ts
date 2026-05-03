import { describe, expect, it } from "bun:test";
import { createEpisodeMemory } from "../../src/domain/records";
import {
  buildBehavioralOutcomePolicyApplied,
} from "../../src/evolution/behavioralTelemetry";
import {
  createExperienceRecord,
} from "../../src/evolution/contracts";
import {
  buildRawBehavioralPrototypeIndex,
  renderRawBehavioralCarryoverContext,
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
    expect(rendered).toContain("safe corrected move:");
    expect(rendered).toContain("exact surface:");
    expect(rendered).toContain("emit the action itself on the first line");
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
        actionType: "url_rewrite",
        entityTypes: ["url"],
        goalTokens: ["generate", "safe", "url", "dashboard"],
        requestedSurface: "text_response",
      },
      interferenceTags: [],
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
      model: {
        bias: 1,
        featureNames: [
          "lexicalSimilarity",
          "intentCompatibility",
          "surfaceCompatibility",
          "exactSurfaceMatch",
          "outcomeUtility",
          "interferenceRisk",
          "recencySupport",
          "repetitionSupport",
        ],
        weights: [0, 0, 0, 0, 0, 0, 0, 0],
      },
      prototypes: [
        {
          confidence: 0.9,
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

    expect(
      selectRawBehavioralExemplars({
        index: ambiguousIndex,
        query: "Generate a safe URL for the dashboard.",
        surfaceFamily: "text_response",
      }),
    ).toEqual([]);
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

    expect(rendered).toContain("Behavioral carryover exemplars:");
    expect(rendered).toContain("- situation:");
    expect(rendered).not.toContain("Behavioral steering:");
    expect(rendered).not.toContain("Prefer ");
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
});
