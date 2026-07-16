import { createHash } from "node:crypto";

import {
  parseC4IndependentReviewDispatch,
  parseC4IndependentReviewProvenance,
  parseC4ReviewInputBundle,
} from "./c4-contracts";
import type {
  C4IndependentReviewDispatch,
  C4IndependentReviewProvenance,
  C4ReviewInputBundle,
} from "./c4-contracts";

export const C4_FINAL_REVIEWER_TASK_NAME = "c4_final_independent_review";
export const C4_FINAL_REVIEWER_AGENT_NAME =
  "/root/c4_final_independent_review";
export const C4_DATASET_ROOT_PATH =
  "fixtures/codex-coding-effect/c4-controlled-pilot";
export const C4_READINESS_CORE_PATH =
  "reports/quality-gates/phase-73/c4-controlled-pilot-core.json";

export function buildC4ReviewInputBundle(input: {
  assetFiles: ReadonlyArray<{ path: string; sha256: string }>;
  assetLockSha256: string;
  assetRootSha256: string;
  createdAt: string;
  leakageAuditSha256: string;
  manifestSha256: string;
  readinessCoreSha256: string;
}): C4ReviewInputBundle {
  return parseC4ReviewInputBundle({
    assetFiles: [...input.assetFiles].sort((first, second) =>
      first.path.localeCompare(second.path)
    ),
    assetLockSha256: input.assetLockSha256,
    assetRootSha256: input.assetRootSha256,
    createdAt: input.createdAt,
    datasetRootPath: C4_DATASET_ROOT_PATH,
    datasetId: "codex-c4-controlled-pilot-v1",
    excludedOutcomeArtifacts: [
      "c4-baseline-results",
      "c4-paired-results",
      "c5-paired-results",
    ],
    leakageAuditSha256: input.leakageAuditSha256,
    manifestSha256: input.manifestSha256,
    readinessCorePath: C4_READINESS_CORE_PATH,
    readinessCoreSha256: input.readinessCoreSha256,
    schemaVersion: 1,
    scope: "dataset-only-no-coding-outcomes",
  });
}

export function buildC4ReviewRequest(input: {
  inputBundleSha256: string;
}): string {
  return [
    "# Independent C4 dataset review",
    "",
    "Review only the frozen C4 dataset assets and deterministic readiness core",
    `listed by \`${C4_DATASET_ROOT_PATH}/review/input-bundle.json\`. The`,
    `dataset root is \`${C4_DATASET_ROOT_PATH}\` and the readiness core is`,
    `\`${C4_READINESS_CORE_PATH}\`. Do not inspect baseline results, C4`,
    "paired A/B results, C5 results, or any other coding outcome artifact.",
    "",
    `Required input-bundle SHA-256: \`${input.inputBundleSha256}\`.`,
    "",
    "For every one of the six episodes, independently decide whether:",
    "",
    "- the task is real coding work rather than trivia;",
    "- hidden tests are fair and prompt/repository discoverable;",
    "- memory is useful context but does not contain the answer or patch;",
    "- negative controls are credible;",
    "- the shared evaluator has no repository-specific exception.",
    "",
    "Write only `review/independent-review.json` using schemaVersion 2. Set",
    "`scope` to `dataset-only-no-coding-outcomes`, both inspected flags to",
    "false, and `inputBundleSha256` to the required hash above. Use status",
    "`accepted` only when every check passes; otherwise use `changes-requested`",
    "and leave each failed check as false. Set `reviewerTaskName` to",
    `\`${C4_FINAL_REVIEWER_AGENT_NAME}\`. Do not edit any other file.`,
    "",
  ].join("\n");
}

export function buildC4IndependentReviewDispatch(input: {
  spawnMessage: string;
}): C4IndependentReviewDispatch {
  return parseC4IndependentReviewDispatch({
    authorTaskName: "/root",
    contextPolicy: "fork-turns-none",
    datasetRootPath: C4_DATASET_ROOT_PATH,
    inputBundlePath: `${C4_DATASET_ROOT_PATH}/review/input-bundle.json`,
    readinessCorePath: C4_READINESS_CORE_PATH,
    requestPath: `${C4_DATASET_ROOT_PATH}/review/request.md`,
    requestedTaskName: C4_FINAL_REVIEWER_TASK_NAME,
    responsePath: `${C4_DATASET_ROOT_PATH}/review/independent-review.json`,
    reviewerAgentName: C4_FINAL_REVIEWER_AGENT_NAME,
    schemaVersion: 1,
    spawnMessage: input.spawnMessage,
  });
}

export function buildC4IndependentReviewSpawnMessage(): string {
  return [
    `Read and follow ${C4_DATASET_ROOT_PATH}/review/request.md exactly.`,
    `Use only ${C4_DATASET_ROOT_PATH}/review/input-bundle.json,`,
    `${C4_READINESS_CORE_PATH}, and the frozen asset paths listed by the`,
    "input bundle. Do not inspect baseline, C4 paired, or C5 outcome files.",
    `Write only ${C4_DATASET_ROOT_PATH}/review/independent-review.json.`,
  ].join(" ");
}

export function assertC4CanonicalIndependentReviewInstructions(input: {
  dispatchBytes: string;
  inputBundleBytes: string;
  requestBytes: string;
}): void {
  parseC4ReviewInputBundle(
    JSON.parse(input.inputBundleBytes) as unknown,
  );
  const expectedRequestBytes = buildC4ReviewRequest({
    inputBundleSha256: sha256(input.inputBundleBytes),
  });
  if (input.requestBytes !== expectedRequestBytes) {
    throw new Error("C4 independent review request is not canonical");
  }
  const expectedDispatchBytes = serializeC4ReviewArtifact(
    buildC4IndependentReviewDispatch({
      spawnMessage: buildC4IndependentReviewSpawnMessage(),
    }),
  );
  if (input.dispatchBytes !== expectedDispatchBytes) {
    throw new Error("C4 independent review dispatch is not canonical");
  }
}

export function buildC4IndependentReviewProvenance(input: {
  authorTaskName: string;
  dispatchBytes: string;
  inputBundleBytes: string;
  recordedAt: string;
  requestBytes: string;
  responseBytes: string;
  reviewerAgentName: string;
}): C4IndependentReviewProvenance {
  assertC4CanonicalIndependentReviewInstructions(input);
  const dispatch = parseC4IndependentReviewDispatch(
    JSON.parse(input.dispatchBytes) as unknown,
  );
  if (input.reviewerAgentName !== dispatch.reviewerAgentName) {
    throw new Error("C4 reviewer agent does not match the frozen dispatch");
  }
  return parseC4IndependentReviewProvenance({
    authorTaskName: input.authorTaskName,
    datasetId: "codex-c4-controlled-pilot-v1",
    dispatch: {
      path: "review/dispatch.json",
      sha256: sha256(input.dispatchBytes),
    },
    inputBundle: {
      path: "review/input-bundle.json",
      sha256: sha256(input.inputBundleBytes),
    },
    recordedAt: input.recordedAt,
    request: {
      path: "review/request.md",
      sha256: sha256(input.requestBytes),
    },
    response: {
      path: "review/independent-review.json",
      sha256: sha256(input.responseBytes),
    },
    reviewer: {
      agentName: input.reviewerAgentName,
      contextPolicy: "fork-turns-none",
      orchestratorAttestation: {
        attestedByTaskName: input.authorTaskName,
        basis: "dispatch-plus-recorder-cli-no-cryptographic-receipt",
        canonicalTaskName: input.reviewerAgentName,
      },
      requestedTaskName: dispatch.requestedTaskName,
      type: "independent-ai-agent",
    },
    schemaVersion: 2,
  });
}

export function serializeC4ReviewArtifact(value: object): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
