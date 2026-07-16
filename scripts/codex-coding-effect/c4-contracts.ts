import { z } from "zod";

import type {
  CodexCodingEffectDataset,
  CodexCodingEffectDatasetV2,
} from "./dataset";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const trimmedStringSchema = z.string().min(1).refine(
  (value) => value.trim() === value,
  "value cannot be whitespace-padded",
);

export const C4_REQUIRED_MEMORY_STRATA = [
  "open-loop-handoff",
  "validated-approach",
  "failure-avoidance",
  "user-correction",
  "project-convention",
  "stale-update",
  "irrelevant-memory-negative-control",
  "no-history-negative-control",
] as const;

const sharedReviewCheckShape = {
  codingNotTrivia: z.boolean(),
  hiddenTestsFair: z.boolean(),
  negativeControlCredible: z.boolean(),
  noRepositorySpecificRunnerException: z.boolean(),
};

const requiredMemoryReviewCheckSchema = z.object({
  ...sharedReviewCheckShape,
  memoryUsefulNotAnswer: z.boolean(),
}).strict();

const irrelevantMemoryReviewCheckSchema = z.object({
  ...sharedReviewCheckShape,
  memoryIrrelevantAndNonMisleading: z.boolean(),
}).strict();

const reviewInputBundleSchema = z.object({
  assetFiles: z.array(z.object({
    path: trimmedStringSchema,
    sha256: sha256Schema,
  }).strict()).min(1),
  assetLockSha256: sha256Schema,
  assetRootSha256: sha256Schema,
  createdAt: trimmedStringSchema,
  datasetRootPath: z.literal(
    "fixtures/codex-coding-effect/c4-controlled-pilot",
  ),
  datasetId: z.literal("codex-c4-controlled-pilot-v2"),
  excludedOutcomeArtifacts: z.tuple([
    z.literal("c4-baseline-results"),
    z.literal("c4-paired-results"),
    z.literal("c5-paired-results"),
  ]),
  leakageAuditSha256: sha256Schema,
  manifestSha256: sha256Schema,
  readinessCorePath: z.literal(
    "reports/quality-gates/phase-73/c4-controlled-pilot-core.json",
  ),
  readinessCoreSha256: sha256Schema,
  schemaVersion: z.literal(1),
  scope: z.literal("dataset-only-no-coding-outcomes"),
}).strict().superRefine((bundle, context) => {
  const paths = new Set<string>();
  for (const [index, asset] of bundle.assetFiles.entries()) {
    if (paths.has(asset.path)) {
      context.addIssue({
        code: "custom",
        message: `C4 review input bundle repeats asset ${asset.path}`,
        path: ["assetFiles", index, "path"],
      });
    }
    paths.add(asset.path);
  }
});

const episodeReviewSchema = z.discriminatedUnion(
  "memoryExpectationMode",
  [
    z.object({
      author: trimmedStringSchema,
      checks: requiredMemoryReviewCheckSchema,
      episodeId: trimmedStringSchema,
      memoryExpectationMode: z.literal("required"),
      rationale: trimmedStringSchema,
    }).strict(),
    z.object({
      author: trimmedStringSchema,
      checks: irrelevantMemoryReviewCheckSchema,
      episodeId: trimmedStringSchema,
      memoryExpectationMode: z.literal("irrelevant-control"),
      rationale: trimmedStringSchema,
    }).strict(),
  ],
);

const independentDatasetReviewSchema = z.object({
  assetLockSha256: sha256Schema,
  assetRootSha256: sha256Schema,
  c4AbResultsInspected: z.boolean(),
  codingOutcomeArtifactsInspected: z.boolean(),
  datasetId: z.literal("codex-c4-controlled-pilot-v2"),
  episodeReviews: z.array(episodeReviewSchema).length(6),
  inputBundleSha256: sha256Schema,
  manifestSha256: sha256Schema,
  leakageAuditSha256: sha256Schema,
  publicCodingEffectProof: z.literal(false),
  readinessCoreSha256: sha256Schema,
  reviewedAt: trimmedStringSchema,
  reviewer: trimmedStringSchema,
  reviewerTaskName: z.literal("/root/c4_final_independent_review_v3"),
  schemaVersion: z.literal(2),
  scope: z.literal("dataset-only-no-coding-outcomes"),
  status: z.enum(["accepted", "changes-requested"]),
}).strict().superRefine((review, context) => {
  if (review.c4AbResultsInspected || review.codingOutcomeArtifactsInspected) {
    context.addIssue({
      code: "custom",
      message: "C4 reviewer must not inspect C4/C5 A/B results",
      path: ["c4AbResultsInspected"],
    });
  }
  const episodeIds = new Set<string>();
  let failedCheckCount = 0;
  for (const [index, episode] of review.episodeReviews.entries()) {
    if (episodeIds.has(episode.episodeId)) {
      context.addIssue({
        code: "custom",
        message: `C4 independent review repeats episode ${episode.episodeId}`,
        path: ["episodeReviews", index, "episodeId"],
      });
    }
    episodeIds.add(episode.episodeId);
    failedCheckCount += countFailedEpisodeReviewChecks(episode);
  }
  if (review.status === "accepted" && failedCheckCount > 0) {
    context.addIssue({
      code: "custom",
      message: "accepted C4 review contains a failed check",
      path: ["status"],
    });
  }
  if (review.status === "changes-requested" && failedCheckCount === 0) {
    context.addIssue({
      code: "custom",
      message: "changes-requested C4 review must contain a failed check",
      path: ["status"],
    });
  }
});

const reviewArtifactReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: sha256Schema,
}).strict();

const independentReviewDispatchSchema = z.object({
  authorTaskName: z.literal("/root"),
  contextPolicy: z.literal("fork-turns-none"),
  datasetRootPath: z.literal(
    "fixtures/codex-coding-effect/c4-controlled-pilot",
  ),
  inputBundlePath: z.literal(
    "fixtures/codex-coding-effect/c4-controlled-pilot/review/input-bundle.json",
  ),
  readinessCorePath: z.literal(
    "reports/quality-gates/phase-73/c4-controlled-pilot-core.json",
  ),
  requestPath: z.literal(
    "fixtures/codex-coding-effect/c4-controlled-pilot/review/request.md",
  ),
  requestedTaskName: z.literal("c4_final_independent_review_v3"),
  responsePath: z.literal(
    "fixtures/codex-coding-effect/c4-controlled-pilot/review/independent-review.json",
  ),
  reviewerAgentName: z.literal("/root/c4_final_independent_review_v3"),
  schemaVersion: z.literal(1),
  spawnMessage: trimmedStringSchema,
}).strict();

const independentReviewProvenanceSchema = z.object({
  authorTaskName: trimmedStringSchema,
  datasetId: z.literal("codex-c4-controlled-pilot-v2"),
  dispatch: reviewArtifactReferenceSchema.extend({
    path: z.literal("review/dispatch.json"),
  }).strict(),
  inputBundle: reviewArtifactReferenceSchema.extend({
    path: z.literal("review/input-bundle.json"),
  }).strict(),
  recordedAt: trimmedStringSchema,
  request: reviewArtifactReferenceSchema.extend({
    path: z.literal("review/request.md"),
  }).strict(),
  response: reviewArtifactReferenceSchema.extend({
    path: z.literal("review/independent-review.json"),
  }).strict(),
  reviewer: z.object({
    agentName: z.literal("/root/c4_final_independent_review_v3"),
    contextPolicy: z.literal("fork-turns-none"),
    orchestratorAttestation: z.object({
      attestedByTaskName: trimmedStringSchema,
      basis: z.literal(
        "dispatch-plus-recorder-cli-no-cryptographic-receipt",
      ),
      canonicalTaskName: z.literal("/root/c4_final_independent_review_v3"),
    }).strict(),
    requestedTaskName: z.literal("c4_final_independent_review_v3"),
    type: z.literal("independent-ai-agent"),
  }).strict(),
  schemaVersion: z.literal(2),
}).strict().superRefine((provenance, context) => {
  if (provenance.authorTaskName === provenance.reviewer.agentName) {
    context.addIssue({
      code: "custom",
      message: "C4 reviewer task must differ from the author task",
      path: ["reviewer", "agentName"],
    });
  }
  if (
    provenance.reviewer.orchestratorAttestation.attestedByTaskName !==
      provenance.authorTaskName
  ) {
    context.addIssue({
      code: "custom",
      message: "C4 orchestrator attestation must be made by the author task",
      path: ["reviewer", "orchestratorAttestation", "attestedByTaskName"],
    });
  }
});

export type C4IndependentDatasetReview = z.infer<
  typeof independentDatasetReviewSchema
>;
export type C4IndependentReviewDispatch = z.infer<
  typeof independentReviewDispatchSchema
>;
export type C4IndependentReviewProvenance = z.infer<
  typeof independentReviewProvenanceSchema
>;
export type C4ReviewInputBundle = z.infer<typeof reviewInputBundleSchema>;

function countFailedEpisodeReviewChecks(
  episode: z.infer<typeof episodeReviewSchema>,
): number {
  const sharedChecks = [
    episode.checks.codingNotTrivia,
    episode.checks.hiddenTestsFair,
    episode.checks.negativeControlCredible,
    episode.checks.noRepositorySpecificRunnerException,
  ];
  const memoryCheck = episode.memoryExpectationMode === "required"
    ? episode.checks.memoryUsefulNotAnswer
    : episode.checks.memoryIrrelevantAndNonMisleading;
  return [...sharedChecks, memoryCheck].filter((passed) => !passed).length;
}

export function validateC4ControlledPilotDataset(
  dataset: CodexCodingEffectDataset,
): CodexCodingEffectDatasetV2 {
  if (dataset.schemaVersion !== 2) {
    throw new Error("C4 requires Codex coding-effect dataset schema version 2");
  }
  if (dataset.datasetId !== "codex-c4-controlled-pilot-v2") {
    throw new Error("C4 dataset id must be codex-c4-controlled-pilot-v2");
  }
  if (dataset.episodes.length !== 6) {
    throw new Error(
      `C4 requires exactly 6 episodes; received ${dataset.episodes.length}`,
    );
  }
  if (new Set(dataset.episodes.map((episode) => episode.repository.url)).size < 2) {
    throw new Error("C4 requires at least 2 repositories");
  }
  for (const episode of dataset.episodes) {
    if (episode.stages.length < 3) {
      throw new Error(
        `C4 episode ${episode.id} requires at least 3 stages`,
      );
    }
    if (episode.claimEligibility !== "pilot-only") {
      throw new Error(`C4 episode ${episode.id} must be pilot-only`);
    }
    const firstStage = episode.stages[0]!;
    if (firstStage.memoryExpectation.mode !== "none") {
      throw new Error(
        `C4 first stage ${episode.id}/${firstStage.id} must use no history`,
      );
    }
    const irrelevantControl = episode.strata.includes(
      "irrelevant-memory-negative-control",
    );
    for (const stage of episode.stages.slice(1)) {
      const expectedMode = irrelevantControl ? "irrelevant-control" : "required";
      if (stage.memoryExpectation.mode !== expectedMode) {
        if (irrelevantControl) {
          throw new Error(
            `C4 irrelevant-memory episode ${episode.id}/${stage.id} must use irrelevant-control`,
          );
        }
        throw new Error(
          `C4 later stage ${episode.id}/${stage.id} must require relevant memory`,
        );
      }
    }
  }
  const strata = new Set(dataset.episodes.flatMap((episode) => episode.strata));
  for (const required of C4_REQUIRED_MEMORY_STRATA) {
    if (!strata.has(required)) {
      throw new Error(`C4 is missing memory stratum ${required}`);
    }
  }
  return dataset;
}

export function parseC4IndependentDatasetReview(
  value: unknown,
): C4IndependentDatasetReview {
  const result = independentDatasetReviewSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const issue = result.error.issues[0];
  throw new Error(issue?.message ?? "invalid C4 independent dataset review");
}

export function parseC4IndependentReviewDispatch(
  value: unknown,
): C4IndependentReviewDispatch {
  const result = independentReviewDispatchSchema.safeParse(value);
  if (!result.success) {
    throw new Error("invalid C4 independent review dispatch");
  }
  return result.data;
}

export function parseC4IndependentReviewProvenance(
  value: unknown,
): C4IndependentReviewProvenance {
  const result = independentReviewProvenanceSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const issue = result.error.issues[0];
  throw new Error(issue?.message ?? "invalid C4 independent review provenance");
}

export function parseC4ReviewInputBundle(
  value: unknown,
): C4ReviewInputBundle {
  const result = reviewInputBundleSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const issue = result.error.issues[0];
  throw new Error(issue?.message ?? "invalid C4 review input bundle");
}
