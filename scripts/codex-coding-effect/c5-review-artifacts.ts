import { createHash } from "node:crypto";

import { z } from "zod";

export const C5_FINAL_REVIEWER_TASK_NAME =
  "c5_final_independent_review_v1";
export const C5_FINAL_REVIEWER_AGENT_NAME =
  "/root/c5_final_independent_review_v1";

const C5_CLAIM_BOUNDARY =
  "internal-native-longitudinal-pilot-only" as const;
const C5_REVIEW_SCOPE = "sanitized-projection-only" as const;
const C5_EXCLUDED_SENSITIVE_ARTIFACTS = [
  "raw-authentication-material",
  "raw-model-prompts",
  "raw-hook-payload-bodies",
  "hidden-evaluator-material",
  "gold-patch-material",
  "repository-source-code",
] as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const trimmedStringSchema = z.string().min(1).refine(
  (value) => value.trim() === value,
  "value cannot be whitespace-padded",
);
const runIdSchema = trimmedStringSchema.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const projectionRootPathSchema = trimmedStringSchema.superRefine(
  (path, context) => {
    if (
      path.endsWith("/") ||
      path.includes("#") ||
      path.split("/").includes("..")
    ) {
      context.addIssue({
        code: "custom",
        message: "invalid C5 projection root path",
      });
    }
  },
);

const artifactReferenceSchema = z.object({
  byteLength: z.number().int().nonnegative(),
  path: trimmedStringSchema,
  sha256: sha256Schema,
}).strict();

const failureTaxonomyEntrySchema = z.object({
  count: z.number().int().nonnegative(),
  reason: trimmedStringSchema,
}).strict();

const reviewInputBundleSchema = z.object({
  artifacts: z.object({
    failureTaxonomy: artifactReferenceSchema,
    projectionManifest: artifactReferenceSchema,
    report: artifactReferenceSchema,
    verification: artifactReferenceSchema,
  }).strict(),
  claimBoundary: z.literal(C5_CLAIM_BOUNDARY),
  createdAt: trimmedStringSchema,
  excludedSensitiveArtifacts: z.tuple([
    z.literal(C5_EXCLUDED_SENSITIVE_ARTIFACTS[0]),
    z.literal(C5_EXCLUDED_SENSITIVE_ARTIFACTS[1]),
    z.literal(C5_EXCLUDED_SENSITIVE_ARTIFACTS[2]),
    z.literal(C5_EXCLUDED_SENSITIVE_ARTIFACTS[3]),
    z.literal(C5_EXCLUDED_SENSITIVE_ARTIFACTS[4]),
    z.literal(C5_EXCLUDED_SENSITIVE_ARTIFACTS[5]),
  ]),
  phase: z.literal("C5"),
  projectionRootPath: projectionRootPathSchema,
  publicClaimEligible: z.literal(false),
  publicCodingEffectProof: z.literal(false),
  readmeRowAllowed: z.literal(false),
  runId: runIdSchema,
  schemaVersion: z.literal(1),
  scope: z.literal(C5_REVIEW_SCOPE),
}).strict().superRefine((bundle, context) => {
  const expectedPaths = expectedArtifactPaths(bundle.projectionRootPath);
  for (const artifactName of Object.keys(expectedPaths) as Array<
    keyof typeof expectedPaths
  >) {
    if (bundle.artifacts[artifactName].path !== expectedPaths[artifactName]) {
      context.addIssue({
        code: "custom",
        message: `C5 review input has an invalid ${artifactName} path`,
        path: ["artifacts", artifactName, "path"],
      });
    }
  }
});

const reviewAssertionSchema = z.object({
  claimBoundary: z.boolean(),
  everyAttemptAccounted: z.boolean(),
  failureTaxonomyReviewed: z.boolean(),
  noSilentFallback: z.boolean(),
  powerAnalysis: z.boolean(),
}).strict();

const reviewFindingSchema = z.object({
  code: trimmedStringSchema.regex(/^[a-z0-9][a-z0-9-]*$/u),
  severity: z.enum(["advisory", "blocking"]),
  summary: trimmedStringSchema,
}).strict();

const independentReviewSchema = z.object({
  assertions: reviewAssertionSchema,
  claimBoundary: z.literal(C5_CLAIM_BOUNDARY),
  decision: z.enum(["accepted", "changes-requested"]),
  failureTaxonomySha256: sha256Schema,
  findings: z.array(reviewFindingSchema),
  inputBundleSha256: sha256Schema,
  phase: z.literal("C5"),
  projectionManifestSha256: sha256Schema,
  publicClaimEligible: z.literal(false),
  publicCodingEffectProof: z.literal(false),
  rationale: trimmedStringSchema,
  readmeRowAllowed: z.literal(false),
  reportSha256: sha256Schema,
  reviewedAt: trimmedStringSchema,
  reviewer: trimmedStringSchema,
  reviewerTaskName: z.literal(C5_FINAL_REVIEWER_AGENT_NAME),
  runId: runIdSchema,
  schemaVersion: z.literal(1),
  scope: z.literal(C5_REVIEW_SCOPE),
  verificationSha256: sha256Schema,
}).strict().superRefine((review, context) => {
  const allAssertionsPassed = Object.values(review.assertions).every(Boolean);
  const hasBlockingFinding = review.findings.some(
    (finding) => finding.severity === "blocking",
  );
  if (review.decision === "accepted" && !allAssertionsPassed) {
    context.addIssue({
      code: "custom",
      message: "accepted C5 review contains a failed assertion",
      path: ["decision"],
    });
  }
  if (review.decision === "accepted" && hasBlockingFinding) {
    context.addIssue({
      code: "custom",
      message: "accepted C5 review contains a blocking finding",
      path: ["decision"],
    });
  }
  if (
    review.decision === "changes-requested" &&
    allAssertionsPassed &&
    !hasBlockingFinding
  ) {
    context.addIssue({
      code: "custom",
      message: "changes-requested C5 review has no failed assertion or blocking finding",
      path: ["decision"],
    });
  }
});

const independentReviewDispatchSchema = z.object({
  authorTaskName: z.literal("/root"),
  contextPolicy: z.literal("fork-turns-none"),
  inputBundlePath: trimmedStringSchema,
  projectionRootPath: projectionRootPathSchema,
  requestPath: trimmedStringSchema,
  requestedTaskName: z.literal(C5_FINAL_REVIEWER_TASK_NAME),
  responsePath: trimmedStringSchema,
  reviewerAgentName: z.literal(C5_FINAL_REVIEWER_AGENT_NAME),
  schemaVersion: z.literal(1),
  spawnMessage: trimmedStringSchema,
}).strict().superRefine((dispatch, context) => {
  const expectedPaths = expectedReviewPaths(dispatch.projectionRootPath);
  for (const field of [
    "inputBundlePath",
    "requestPath",
    "responsePath",
  ] as const) {
    if (dispatch[field] !== expectedPaths[field]) {
      context.addIssue({
        code: "custom",
        message: `C5 review dispatch has an invalid ${field}`,
        path: [field],
      });
    }
  }
});

const independentReviewProvenanceSchema = z.object({
  authorTaskName: trimmedStringSchema,
  dispatch: artifactReferenceSchema,
  inputBundle: artifactReferenceSchema,
  projectionRootPath: projectionRootPathSchema,
  recordedAt: trimmedStringSchema,
  request: artifactReferenceSchema,
  response: artifactReferenceSchema,
  reviewDecision: z.enum(["accepted", "changes-requested"]),
  reviewer: z.object({
    agentName: z.literal(C5_FINAL_REVIEWER_AGENT_NAME),
    contextPolicy: z.literal("fork-turns-none"),
    orchestratorAttestation: z.object({
      attestedByTaskName: trimmedStringSchema,
      basis: z.literal(
        "orchestrator-observed-dispatch-no-cryptographic-receipt",
      ),
      cryptographicReceipt: z.literal(false),
    }).strict(),
    requestedTaskName: z.literal(C5_FINAL_REVIEWER_TASK_NAME),
    type: z.literal("independent-ai-agent"),
  }).strict(),
  runId: runIdSchema,
  schemaVersion: z.literal(1),
}).strict().superRefine((provenance, context) => {
  if (provenance.authorTaskName === provenance.reviewer.agentName) {
    context.addIssue({
      code: "custom",
      message: "C5 review author and reviewer must differ",
      path: ["reviewer", "agentName"],
    });
  }
  if (
    provenance.reviewer.orchestratorAttestation.attestedByTaskName !==
      provenance.authorTaskName
  ) {
    context.addIssue({
      code: "custom",
      message: "C5 orchestrator attestation must be made by the author task",
      path: ["reviewer", "orchestratorAttestation", "attestedByTaskName"],
    });
  }
  const expectedPaths = expectedReviewPaths(provenance.projectionRootPath);
  for (const [field, expectedPath] of [
    ["dispatch", expectedPaths.dispatchPath],
    ["inputBundle", expectedPaths.inputBundlePath],
    ["request", expectedPaths.requestPath],
    ["response", expectedPaths.responsePath],
  ] as const) {
    if (provenance[field].path !== expectedPath) {
      context.addIssue({
        code: "custom",
        message: `C5 review provenance has an invalid ${field} path`,
        path: [field, "path"],
      });
    }
  }
});

export type C5IndependentReview = z.infer<typeof independentReviewSchema>;
export type C5IndependentReviewDispatch = z.infer<
  typeof independentReviewDispatchSchema
>;
export type C5IndependentReviewProvenance = z.infer<
  typeof independentReviewProvenanceSchema
>;
export type C5ReviewInputBundle = z.infer<typeof reviewInputBundleSchema>;

export function buildC5ReviewInputBundle(input: {
  createdAt: string;
  projectionManifestBytes: string;
  projectionRootPath: string;
  reportBytes: string;
  runId: string;
  verificationBytes: string;
}): C5ReviewInputBundle {
  const failureTaxonomyBytes = canonicalizeC5FailureTaxonomy(
    input.reportBytes,
  );
  const paths = expectedArtifactPaths(input.projectionRootPath);
  return parseC5ReviewInputBundle({
    artifacts: {
      failureTaxonomy: bindArtifact(
        paths.failureTaxonomy,
        failureTaxonomyBytes,
      ),
      projectionManifest: bindArtifact(
        paths.projectionManifest,
        input.projectionManifestBytes,
      ),
      report: bindArtifact(paths.report, input.reportBytes),
      verification: bindArtifact(paths.verification, input.verificationBytes),
    },
    claimBoundary: C5_CLAIM_BOUNDARY,
    createdAt: input.createdAt,
    excludedSensitiveArtifacts: [...C5_EXCLUDED_SENSITIVE_ARTIFACTS],
    phase: "C5",
    projectionRootPath: input.projectionRootPath,
    publicClaimEligible: false,
    publicCodingEffectProof: false,
    readmeRowAllowed: false,
    runId: input.runId,
    schemaVersion: 1,
    scope: C5_REVIEW_SCOPE,
  });
}

export function canonicalizeC5FailureTaxonomy(reportBytes: string): string {
  let value: unknown;
  try {
    value = JSON.parse(reportBytes) as unknown;
  } catch {
    throw new Error("C5 review report is not valid JSON");
  }
  const result = z.object({
    failureTaxonomy: z.array(failureTaxonomyEntrySchema),
  }).passthrough().safeParse(value);
  if (!result.success) {
    throw new Error("C5 review report has an invalid failure taxonomy");
  }
  const reasons = result.data.failureTaxonomy.map((entry) => entry.reason);
  if (new Set(reasons).size !== reasons.length) {
    throw new Error("C5 review report repeats a failure taxonomy reason");
  }
  const sortedReasons = [...reasons].sort((first, second) =>
    first.localeCompare(second)
  );
  if (JSON.stringify(reasons) !== JSON.stringify(sortedReasons)) {
    throw new Error("C5 review failure taxonomy is not canonically ordered");
  }
  return serializeC5ReviewArtifact(result.data.failureTaxonomy);
}

export function buildC5ReviewRequest(input: {
  inputBundle: C5ReviewInputBundle;
  inputBundleSha256: string;
}): string {
  const bundle = parseC5ReviewInputBundle(input.inputBundle);
  parseSha256(input.inputBundleSha256, "C5 review input bundle hash");
  return [
    "# Independent C5 evidence review",
    "",
    "Review the sanitized projection only. Use exactly the four bindings in",
    `\`${bundle.projectionRootPath}/review/input-bundle.json\`; do not inspect`,
    "any other C5 artifact or workspace surface.",
    "",
    `Required input-bundle SHA-256: \`${input.inputBundleSha256}\`.`,
    `Run ID: \`${bundle.runId}\`.`,
    "",
    "The allowed inputs are:",
    "",
    ...Object.values(bundle.artifacts).map((artifact) =>
      `- \`${artifact.path}\`: ${artifact.byteLength} UTF-8 bytes, SHA-256 \`${artifact.sha256}\`;`
    ),
    "",
    "Recompute every UTF-8 byte length and SHA-256 before reviewing. Treat any",
    "mismatch as a blocking finding and return `changes-requested`.",
    "For the `report.json#failureTaxonomy` binding, serialize the exact",
    "`failureTaxonomy` array as two-space-indented JSON followed by exactly",
    "one trailing LF byte; the fragment is not a separate file.",
    "",
    "Do not inspect raw authentication material, raw model prompts, raw hook",
    "payload bodies, hidden evaluator material, gold patch material, or",
    "repository source code. Do not inspect raw run directories. The input",
    "bundle intentionally contains hashes and byte counts, not those contents.",
    "Live-surface source preimages remain process-only and are not independently",
    "observed by this review; assess the frozen capture claims and sanitized",
    "projection consistency within that explicit authenticity boundary.",
    "",
    "Independently assess exactly these assertions:",
    "",
    "- `everyAttemptAccounted`: the projection manifest and verification bind",
    "  every scheduled attempt and pair exactly once;",
    "- `noSilentFallback`: required-memory failures are not silently scored as",
    "  comparable successes or ordinary no-memory runs;",
    "- `failureTaxonomyReviewed`: every infrastructure, memory-channel,",
    "  incomparability, and task failure represented by the projection is",
    "  accounted for by the report taxonomy;",
    "- `powerAnalysis`: the pilot report contains the planned effect threshold,",
    "  uncertainty analysis, and an explicit expanded-run budget; and",
    "- `claimBoundary`: the evidence remains",
    "  `internal-native-longitudinal-pilot-only`, with",
    "  `publicClaimEligible`, `publicCodingEffectProof`, and `readmeRowAllowed`",
    "  all false.",
    "",
    `Write only \`${bundle.projectionRootPath}/review/independent-review.json\``,
    "as one strict JSON object. It must contain exactly:",
    "",
    "- `schemaVersion`: 1;",
    "- `phase`: `C5`;",
    `- \`runId\`: \`${bundle.runId}\`;`,
    "- `scope`: `sanitized-projection-only`;",
    `- \`inputBundleSha256\`: \`${input.inputBundleSha256}\`;`,
    "- `projectionManifestSha256`, `verificationSha256`, `reportSha256`, and",
    "  `failureTaxonomySha256`: copy the exact input-bundle values;",
    `- \`reviewerTaskName\`: \`${C5_FINAL_REVIEWER_AGENT_NAME}\`;`,
    "- `reviewer`, `reviewedAt`, and a non-empty `rationale`;",
    "- `claimBoundary`: `internal-native-longitudinal-pilot-only`;",
    "- `publicClaimEligible`, `publicCodingEffectProof`, and",
    "  `readmeRowAllowed`: false;",
    "- `assertions`: exactly `everyAttemptAccounted`, `noSilentFallback`,",
    "  `failureTaxonomyReviewed`, `powerAnalysis`, and `claimBoundary`, each",
    "  boolean;",
    "- `findings`: strict objects with `code`, `severity` (`advisory` or",
    "  `blocking`), and `summary`; and",
    "- `decision`: `accepted` or `changes-requested`.",
    "",
    "Use `accepted` only when all five assertions are true and no finding is",
    "blocking. Otherwise use `changes-requested`. Do not add other keys and do",
    "not edit any other file.",
    "",
  ].join("\n");
}

export function buildC5IndependentReviewDispatch(input: {
  projectionRootPath: string;
  spawnMessage: string;
}): C5IndependentReviewDispatch {
  const paths = expectedReviewPaths(input.projectionRootPath);
  return parseC5IndependentReviewDispatch({
    authorTaskName: "/root",
    contextPolicy: "fork-turns-none",
    inputBundlePath: paths.inputBundlePath,
    projectionRootPath: input.projectionRootPath,
    requestPath: paths.requestPath,
    requestedTaskName: C5_FINAL_REVIEWER_TASK_NAME,
    responsePath: paths.responsePath,
    reviewerAgentName: C5_FINAL_REVIEWER_AGENT_NAME,
    schemaVersion: 1,
    spawnMessage: input.spawnMessage,
  });
}

export function buildC5IndependentReviewSpawnMessage(
  projectionRootPath: string,
): string {
  const paths = expectedReviewPaths(projectionRootPath);
  return [
    `Read and follow ${paths.requestPath} exactly.`,
    `Use only ${paths.inputBundlePath} and the four sanitized projection`,
    "artifacts it binds. Do not inspect any raw run, authentication, prompt,",
    "hook payload, hidden evaluator, gold patch, or repository source artifact.",
    `Write only ${paths.responsePath}.`,
  ].join(" ");
}

export function assertC5CanonicalIndependentReviewInstructions(input: {
  dispatchBytes: string;
  inputBundleBytes: string;
  requestBytes: string;
}): void {
  const inputBundle = parseC5ReviewInputBundle(
    parseJson(input.inputBundleBytes, "C5 review input bundle"),
  );
  if (
    input.inputBundleBytes !== serializeC5ReviewArtifact(inputBundle)
  ) {
    throw new Error("C5 independent review input bundle is not canonical");
  }
  const expectedRequestBytes = buildC5ReviewRequest({
    inputBundle,
    inputBundleSha256: sha256(input.inputBundleBytes),
  });
  if (input.requestBytes !== expectedRequestBytes) {
    throw new Error("C5 independent review request is not canonical");
  }
  const expectedDispatchBytes = serializeC5ReviewArtifact(
    buildC5IndependentReviewDispatch({
      projectionRootPath: inputBundle.projectionRootPath,
      spawnMessage: buildC5IndependentReviewSpawnMessage(
        inputBundle.projectionRootPath,
      ),
    }),
  );
  if (input.dispatchBytes !== expectedDispatchBytes) {
    throw new Error("C5 independent review dispatch is not canonical");
  }
}

export function buildC5IndependentReviewProvenance(input: {
  authorTaskName: string;
  dispatchBytes: string;
  inputBundleBytes: string;
  recordedAt: string;
  requestBytes: string;
  responseBytes: string;
  reviewerAgentName: string;
}): C5IndependentReviewProvenance {
  if (input.authorTaskName === input.reviewerAgentName) {
    throw new Error("C5 review author and reviewer must differ");
  }
  assertC5CanonicalIndependentReviewInstructions(input);
  const bundle = parseC5ReviewInputBundle(
    parseJson(input.inputBundleBytes, "C5 review input bundle"),
  );
  const dispatch = parseC5IndependentReviewDispatch(
    parseJson(input.dispatchBytes, "C5 independent review dispatch"),
  );
  const review = parseC5IndependentReview(
    parseJson(input.responseBytes, "C5 independent review response"),
  );
  if (
    input.authorTaskName !== dispatch.authorTaskName ||
    input.reviewerAgentName !== dispatch.reviewerAgentName ||
    review.reviewerTaskName !== dispatch.reviewerAgentName
  ) {
    throw new Error("C5 review identity does not match the frozen dispatch");
  }
  if (!reviewBindsBundle(review, bundle, input.inputBundleBytes)) {
    throw new Error(
      "C5 independent review response does not bind the input bundle",
    );
  }
  const paths = expectedReviewPaths(bundle.projectionRootPath);
  return parseC5IndependentReviewProvenance({
    authorTaskName: input.authorTaskName,
    dispatch: bindArtifact(paths.dispatchPath, input.dispatchBytes),
    inputBundle: bindArtifact(paths.inputBundlePath, input.inputBundleBytes),
    projectionRootPath: bundle.projectionRootPath,
    recordedAt: input.recordedAt,
    request: bindArtifact(paths.requestPath, input.requestBytes),
    response: bindArtifact(paths.responsePath, input.responseBytes),
    reviewDecision: review.decision,
    reviewer: {
      agentName: input.reviewerAgentName,
      contextPolicy: "fork-turns-none",
      orchestratorAttestation: {
        attestedByTaskName: input.authorTaskName,
        basis: "orchestrator-observed-dispatch-no-cryptographic-receipt",
        cryptographicReceipt: false,
      },
      requestedTaskName: dispatch.requestedTaskName,
      type: "independent-ai-agent",
    },
    runId: bundle.runId,
    schemaVersion: 1,
  });
}

export function parseC5ReviewInputBundle(
  value: unknown,
): C5ReviewInputBundle {
  const result = reviewInputBundleSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const issue = result.error.issues[0];
  throw new Error(issue?.message ?? "invalid C5 review input bundle");
}

export function parseC5IndependentReview(
  value: unknown,
): C5IndependentReview {
  const result = independentReviewSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const issue = result.error.issues[0];
  throw new Error(issue?.message ?? "invalid C5 independent review");
}

export function parseC5IndependentReviewDispatch(
  value: unknown,
): C5IndependentReviewDispatch {
  const result = independentReviewDispatchSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const issue = result.error.issues[0];
  throw new Error(issue?.message ?? "invalid C5 independent review dispatch");
}

export function parseC5IndependentReviewProvenance(
  value: unknown,
): C5IndependentReviewProvenance {
  const result = independentReviewProvenanceSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const issue = result.error.issues[0];
  throw new Error(
    issue?.message ?? "invalid C5 independent review provenance",
  );
}

export function serializeC5ReviewArtifact(value: object): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function bindArtifact(path: string, bytes: string) {
  return {
    byteLength: Buffer.byteLength(bytes),
    path,
    sha256: sha256(bytes),
  };
}

function expectedArtifactPaths(projectionRootPath: string) {
  return {
    failureTaxonomy: `${projectionRootPath}/report.json#failureTaxonomy`,
    projectionManifest: `${projectionRootPath}/projection-manifest.json`,
    report: `${projectionRootPath}/report.json`,
    verification: `${projectionRootPath}/c5-verification.json`,
  };
}

function expectedReviewPaths(projectionRootPath: string) {
  return {
    dispatchPath: `${projectionRootPath}/review/dispatch.json`,
    inputBundlePath: `${projectionRootPath}/review/input-bundle.json`,
    requestPath: `${projectionRootPath}/review/request.md`,
    responsePath: `${projectionRootPath}/review/independent-review.json`,
  };
}

function parseJson(bytes: string, label: string): unknown {
  try {
    return JSON.parse(bytes) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function parseSha256(value: string, label: string): string {
  const result = sha256Schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
  return result.data;
}

function reviewBindsBundle(
  review: C5IndependentReview,
  bundle: C5ReviewInputBundle,
  inputBundleBytes: string,
): boolean {
  return review.runId === bundle.runId &&
    review.inputBundleSha256 === sha256(inputBundleBytes) &&
    review.projectionManifestSha256 ===
      bundle.artifacts.projectionManifest.sha256 &&
    review.verificationSha256 === bundle.artifacts.verification.sha256 &&
    review.reportSha256 === bundle.artifacts.report.sha256 &&
    review.failureTaxonomySha256 ===
      bundle.artifacts.failureTaxonomy.sha256;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
