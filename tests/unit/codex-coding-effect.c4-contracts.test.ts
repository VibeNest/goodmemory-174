import { describe, expect, it } from "bun:test";

import {
  C4_REQUIRED_MEMORY_STRATA,
  parseC4IndependentDatasetReview,
  parseC4IndependentReviewDispatch,
  parseC4IndependentReviewProvenance,
  parseC4ReviewInputBundle,
  validateC4ControlledPilotDataset,
} from "../../scripts/codex-coding-effect/c4-contracts";
import {
  parseCodexCodingEffectDataset,
} from "../../scripts/codex-coding-effect/dataset";

const COMMIT_A = "a".repeat(40);
const COMMIT_B = "b".repeat(40);
const SHA256 = "c".repeat(64);

describe("Codex coding-effect C4 contracts", () => {
  it("accepts exactly six pilot episodes across two repositories and all eight strata", () => {
    const dataset = validateC4ControlledPilotDataset(
      parseCodexCodingEffectDataset(validDataset()),
    );

    expect(dataset.episodes).toHaveLength(6);
    expect(new Set(dataset.episodes.map((episode) => episode.repository.url)).size)
      .toBe(2);
    expect(dataset.episodes.every((episode) => episode.stages.length >= 3))
      .toBe(true);
    expect(new Set(dataset.episodes.flatMap((episode) => episode.strata)))
      .toEqual(new Set(C4_REQUIRED_MEMORY_STRATA));
  });

  it("rejects undersized, single-repository, short, and incomplete C4 selections", () => {
    const dataset = validDataset();
    expect(() => validate(dataset.episodes.slice(0, 5))).toThrow(
      "C4 requires exactly 6 episodes",
    );
    expect(() => validate(dataset.episodes.map((episode) => ({
      ...episode,
      repository: dataset.episodes[0]!.repository,
    })))).toThrow("C4 requires at least 2 repositories");
    expect(() => validate(dataset.episodes.map((episode, index) =>
      index === 0
        ? { ...episode, stages: episode.stages.slice(0, 2) }
        : episode
    ))).toThrow("C4 episode episode-1 requires at least 3 stages");
    expect(() => validate(dataset.episodes.map((episode) => ({
      ...episode,
      strata: episode.strata.filter((stratum) =>
        stratum !== "project-convention"
      ),
      stages: episode.stages.map((stage) => ({
        ...stage,
        memoryExpectation: {
          ...stage.memoryExpectation,
          dependencies: stage.memoryExpectation.dependencies.filter(
            (dependency) => dependency.category !== "project-convention",
          ),
        },
      })),
    })))).toThrow("C4 is missing memory stratum project-convention");
  });

  it("keeps every C4 episode pilot-only", () => {
    const dataset = validDataset();
    expect(() => validate(dataset.episodes.map((episode, index) =>
      index === 2
        ? { ...episode, claimEligibility: "claim-eligible" as const }
        : episode
    ))).toThrow("C4 episode episode-3 must be pilot-only");
  });

  it("uses schema v2 to require stage-specific gold and memory expectations", () => {
    const dataset = validDataset();
    expect(() => validate(dataset.episodes.map((episode, episodeIndex) => ({
      ...episode,
      stages: episode.stages.map((stage, stageIndex) => {
        if (episodeIndex !== 0 || stageIndex !== 1) {
          return stage;
        }
        const { goldPatch: _goldPatch, ...withoutGold } = stage;
        return withoutGold;
      }),
    })))).toThrow("goldPatch");
    expect(() => validate(dataset.episodes.map((episode, episodeIndex) => ({
      ...episode,
      stages: episode.stages.map((stage, stageIndex) =>
        episodeIndex === 5 && stageIndex === 2
          ? { ...stage, memoryExpectation: undefined }
          : stage
      ),
    })))).toThrow("memoryExpectation");
  });

  it("binds first stages to no history and later negative controls to irrelevant memory", () => {
    const dataset = validDataset();
    expect(() => validate(dataset.episodes.map((episode, episodeIndex) => ({
      ...episode,
      stages: episode.stages.map((stage, stageIndex) =>
        episodeIndex === 0 && stageIndex === 0
          ? {
              ...stage,
              memoryExpectation: {
                dependencies: [{
                  category: "open-loop-handoff" as const,
                  description: "Unexpected first-stage dependency.",
                }],
                mode: "required" as const,
              },
            }
          : stage
      ),
    })))).toThrow("C4 first stage episode-1/stage-1 must use no history");
    expect(() => validate(dataset.episodes.map((episode, episodeIndex) => ({
      ...episode,
      stages: episode.stages.map((stage, stageIndex) =>
        episodeIndex === 5 && stageIndex === 1
          ? { ...stage, memoryExpectation: { ...stage.memoryExpectation, mode: "required" as const } }
          : stage
      ),
    })))).toThrow(
      "C4 irrelevant-memory episode episode-6/stage-2 must use irrelevant-control",
    );
  });

  it("accepts independent review responses without forcing every review to pass", () => {
    const review = validReview();
    expect(parseC4IndependentDatasetReview(review)).toMatchObject({
      assetLockSha256: SHA256,
      datasetId: "codex-c4-controlled-pilot-v1",
      inputBundleSha256: SHA256,
      leakageAuditSha256: SHA256,
      publicCodingEffectProof: false,
      readinessCoreSha256: SHA256,
      status: "accepted",
    });

    expect(() => parseC4IndependentDatasetReview({
      ...review,
      episodeReviews: review.episodeReviews.map((episodeReview, index) =>
        index === 4
          ? {
              ...episodeReview,
              checks: {
                ...episodeReview.checks,
                memoryUsefulNotAnswer: false,
              },
            }
          : episodeReview
      ),
    })).toThrow("accepted C4 review contains a failed check");
    expect(parseC4IndependentDatasetReview({
      ...review,
      episodeReviews: review.episodeReviews.map((episodeReview, index) =>
        index === 4
          ? {
              ...episodeReview,
              checks: {
                ...episodeReview.checks,
                memoryUsefulNotAnswer: false,
              },
            }
          : episodeReview
      ),
      status: "changes-requested",
    })).toMatchObject({ status: "changes-requested" });
    expect(() => parseC4IndependentDatasetReview({
      ...review,
      c4AbResultsInspected: true,
    })).toThrow("C4 reviewer must not inspect C4/C5 A/B results");
  });

  it("binds exact review inputs and rejects non-independent reviewer provenance", () => {
    expect(parseC4ReviewInputBundle(validInputBundle())).toMatchObject({
      assetLockSha256: SHA256,
      excludedOutcomeArtifacts: [
        "c4-baseline-results",
        "c4-paired-results",
        "c5-paired-results",
      ],
      readinessCoreSha256: SHA256,
    });
    expect(parseC4IndependentReviewProvenance(validProvenance())).toMatchObject({
      authorTaskName: "/root",
      reviewer: {
        agentName: "/root/c4_final_independent_review",
        contextPolicy: "fork-turns-none",
        orchestratorAttestation: {
          attestedByTaskName: "/root",
          basis: "dispatch-plus-recorder-cli-no-cryptographic-receipt",
          canonicalTaskName: "/root/c4_final_independent_review",
        },
        requestedTaskName: "c4_final_independent_review",
        type: "independent-ai-agent",
      },
    });
    expect(parseC4IndependentReviewDispatch(validDispatch())).toMatchObject({
      contextPolicy: "fork-turns-none",
      requestedTaskName: "c4_final_independent_review",
      reviewerAgentName: "/root/c4_final_independent_review",
    });
    expect(() => parseC4IndependentReviewProvenance({
      ...validProvenance(),
      reviewer: {
        ...validProvenance().reviewer,
        agentName: "/root",
      },
    })).toThrow();
    expect(() => parseC4IndependentReviewProvenance({
      ...validProvenance(),
      reviewer: {
        ...validProvenance().reviewer,
        contextPolicy: "fork-turns-all",
      },
    })).toThrow();
    const { orchestratorAttestation: _attestation, ...reviewer } =
      validProvenance().reviewer;
    expect(() => parseC4IndependentReviewProvenance({
      ...validProvenance(),
      reviewer: {
        ...reviewer,
        spawnReceipt: {
          canonicalTaskName: "/root/c4_final_independent_review",
        },
      },
      schemaVersion: 1,
    })).toThrow();
  });
});

function validate(episodes: unknown[]) {
  return validateC4ControlledPilotDataset(parseCodexCodingEffectDataset({
    ...validDataset(),
    episodes,
  }));
}

function validDataset() {
  const strata = [
    ["open-loop-handoff", "no-history-negative-control"],
    ["validated-approach"],
    ["failure-avoidance"],
    ["user-correction", "project-convention"],
    ["stale-update"],
    ["irrelevant-memory-negative-control"],
  ] as const;
  return {
    datasetId: "codex-c4-controlled-pilot-v1",
    episodes: strata.map((episodeStrata, index) => ({
      author: "GoodMemory C4 task author",
      claimEligibility: "pilot-only" as const,
      ecosystem: "bun",
      forbiddenLeakage: {
        fileSha256: [SHA256],
        strings: [`private-c4-sentinel-${index + 1}`],
      },
      id: `episode-${index + 1}`,
      language: "typescript",
      preparation: {
        command: ["bun", "test", "tests/base-health.test.ts"],
        networkMode: "disabled" as const,
      },
      prehistory: {
        forbiddenLeakageSha256: [SHA256],
        path: `prehistory/episode-${index + 1}.jsonl`,
        sha256: SHA256,
        source: "frozen-artifact" as const,
      },
      provenance: "Authored before any paired execution.",
      repository: {
        baseCommit: index < 3 ? COMMIT_A : COMMIT_B,
        license: "MIT",
        url: index < 3
          ? "https://example.invalid/goodmemory-c4/continuity-utils.git"
          : "https://example.invalid/goodmemory-c4/policy-utils.git",
      },
      sourceType: "controlled-mutation" as const,
      stages: Array.from({ length: 3 }, (_, stageIndex) => ({
        allowedFeedback: stageIndex === 0
          ? []
          : [`Episode ${index + 1} stage ${stageIndex} feedback.`],
        hiddenFailToPass: [
          "bun",
          "{evaluatorRoot}/runner.ts",
          "fail-to-pass",
          `episode-${index + 1}`,
          `stage-${stageIndex + 1}`,
        ],
        hiddenPassToPass: [
          "bun",
          "{evaluatorRoot}/runner.ts",
          "pass-to-pass",
          `episode-${index + 1}`,
          `stage-${stageIndex + 1}`,
        ],
        expectedChangedFiles: ["src/tasks.ts"],
        goldPatch: {
          path:
            `evaluator/gold/episode-${index + 1}-stage-${stageIndex + 1}.patch`,
          sha256: SHA256,
        },
        id: `stage-${stageIndex + 1}`,
        memoryExpectation: {
          dependencies: stageIndex === 0
            ? []
            : episodeStrata
              .filter((category) => category !== "no-history-negative-control")
              .map((category) => ({
                category,
                description: `Episode ${index + 1} depends on ${category}.`,
              })),
          mode: index === 5
            ? stageIndex === 0 ? "none" : "irrelevant-control"
            : stageIndex === 0 ? "none" : "required",
        },
        position: stageIndex + 1,
        promptPath:
          `prompts/episode-${index + 1}-stage-${stageIndex + 1}.md`,
        snapshot: index < 3 ? COMMIT_A : COMMIT_B,
        timeoutMs: 30_000,
        visibleTest: ["bun", "test", "tests/base-health.test.ts"],
      })),
      stateMode: "canonical-snapshot" as const,
      strata: [...episodeStrata],
    })),
    schemaVersion: 2 as const,
  };
}

function validReview() {
  return {
    assetLockSha256: SHA256,
    assetRootSha256: SHA256,
    c4AbResultsInspected: false,
    codingOutcomeArtifactsInspected: false,
    datasetId: "codex-c4-controlled-pilot-v1",
    episodeReviews: Array.from({ length: 6 }, (_, index) => ({
      author: "GoodMemory C4 task author",
      checks: {
        codingNotTrivia: true,
        hiddenTestsFair: true,
        memoryUsefulNotAnswer: true,
        negativeControlCredible: true,
        noRepositorySpecificRunnerException: true,
      },
      episodeId: `episode-${index + 1}`,
      rationale: "The task and hidden-test boundary are independently reviewable.",
    })),
    inputBundleSha256: SHA256,
    leakageAuditSha256: SHA256,
    manifestSha256: SHA256,
    publicCodingEffectProof: false,
    readinessCoreSha256: SHA256,
    reviewedAt: "2026-07-15T20:00:00.000Z",
    reviewer: "Codex C4 independent reviewer",
    reviewerTaskName: "/root/c4_final_independent_review",
    schemaVersion: 2,
    scope: "dataset-only-no-coding-outcomes",
    status: "accepted",
  };
}

function validInputBundle() {
  return {
    assetFiles: [{
      path: "manifest.json",
      sha256: SHA256,
    }],
    assetLockSha256: SHA256,
    assetRootSha256: SHA256,
    createdAt: "2026-07-16T10:00:00.000Z",
    datasetRootPath: "fixtures/codex-coding-effect/c4-controlled-pilot",
    datasetId: "codex-c4-controlled-pilot-v1",
    excludedOutcomeArtifacts: [
      "c4-baseline-results",
      "c4-paired-results",
      "c5-paired-results",
    ],
    leakageAuditSha256: SHA256,
    manifestSha256: SHA256,
    readinessCorePath:
      "reports/quality-gates/phase-73/c4-controlled-pilot-core.json",
    readinessCoreSha256: SHA256,
    schemaVersion: 1,
    scope: "dataset-only-no-coding-outcomes",
  };
}

function validProvenance() {
  return {
    authorTaskName: "/root",
    datasetId: "codex-c4-controlled-pilot-v1",
    dispatch: {
      path: "review/dispatch.json",
      sha256: SHA256,
    },
    inputBundle: {
      path: "review/input-bundle.json",
      sha256: SHA256,
    },
    recordedAt: "2026-07-16T10:30:00.000Z",
    request: {
      path: "review/request.md",
      sha256: SHA256,
    },
    response: {
      path: "review/independent-review.json",
      sha256: SHA256,
    },
    reviewer: {
      agentName: "/root/c4_final_independent_review",
      contextPolicy: "fork-turns-none",
      orchestratorAttestation: {
        attestedByTaskName: "/root",
        basis: "dispatch-plus-recorder-cli-no-cryptographic-receipt",
        canonicalTaskName: "/root/c4_final_independent_review",
      },
      requestedTaskName: "c4_final_independent_review",
      type: "independent-ai-agent",
    },
    schemaVersion: 2,
  };
}

function validDispatch() {
  return {
    authorTaskName: "/root",
    contextPolicy: "fork-turns-none",
    datasetRootPath: "fixtures/codex-coding-effect/c4-controlled-pilot",
    inputBundlePath:
      "fixtures/codex-coding-effect/c4-controlled-pilot/review/input-bundle.json",
    readinessCorePath:
      "reports/quality-gates/phase-73/c4-controlled-pilot-core.json",
    requestPath:
      "fixtures/codex-coding-effect/c4-controlled-pilot/review/request.md",
    requestedTaskName: "c4_final_independent_review",
    responsePath:
      "fixtures/codex-coding-effect/c4-controlled-pilot/review/independent-review.json",
    reviewerAgentName: "/root/c4_final_independent_review",
    schemaVersion: 1,
    spawnMessage: "Read only the frozen review inputs and write the response.",
  };
}
