import {
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  parseC4IndependentDatasetReview,
  parseC4IndependentReviewDispatch,
} from "./codex-coding-effect/c4-contracts";
import {
  buildC4IndependentReviewProvenance,
  serializeC4ReviewArtifact,
} from "./codex-coding-effect/c4-review-artifacts";

const DEFAULT_DATASET_ROOT = resolve(
  "fixtures/codex-coding-effect/c4-controlled-pilot",
);

export async function recordC4IndependentReviewProvenance(input: {
  datasetRoot: string;
  recordedAt: string;
  replace?: boolean;
  reviewerAgentName: string;
}): Promise<{ provenancePath: string; reviewerAgentName: string }> {
  const reviewRoot = join(resolve(input.datasetRoot), "review");
  const [
    authorAttestationBytes,
    dispatchBytes,
    inputBundleBytes,
    requestBytes,
    responseBytes,
  ] = await Promise.all([
    readFile(
      join(input.datasetRoot, "provenance", "author-attestation.json"),
      "utf8",
    ),
    readFile(join(reviewRoot, "dispatch.json"), "utf8"),
    readFile(join(reviewRoot, "input-bundle.json"), "utf8"),
    readFile(join(reviewRoot, "request.md"), "utf8"),
    readFile(join(reviewRoot, "independent-review.json"), "utf8"),
  ]);
  const dispatch = parseC4IndependentReviewDispatch(
    JSON.parse(dispatchBytes) as unknown,
  );
  const review = parseC4IndependentDatasetReview(
    JSON.parse(responseBytes) as unknown,
  );
  if (
    input.reviewerAgentName !== dispatch.reviewerAgentName ||
    review.reviewerTaskName !== dispatch.reviewerAgentName
  ) {
    throw new Error("C4 review identity does not match the frozen dispatch");
  }
  const authorAttestation = JSON.parse(authorAttestationBytes) as {
    authorTaskName?: unknown;
  };
  if (typeof authorAttestation.authorTaskName !== "string") {
    throw new Error("C4 author attestation is missing authorTaskName");
  }
  const provenance = buildC4IndependentReviewProvenance({
    authorTaskName: authorAttestation.authorTaskName,
    dispatchBytes,
    inputBundleBytes,
    recordedAt: input.recordedAt,
    requestBytes,
    responseBytes,
    reviewerAgentName: input.reviewerAgentName,
  });
  const provenancePath = join(reviewRoot, "provenance.json");
  if (input.replace) {
    await rm(provenancePath, { force: true });
  }
  await writeFile(
    provenancePath,
    serializeC4ReviewArtifact(provenance),
    { encoding: "utf8", flag: "wx" },
  );
  return { provenancePath, reviewerAgentName: input.reviewerAgentName };
}

function parseOptions(args: readonly string[]): {
  datasetRoot: string;
  recordedAt: string;
  replace: boolean;
  reviewerAgentName: string;
} {
  let datasetRoot = DEFAULT_DATASET_ROOT;
  let recordedAt = new Date().toISOString();
  let replace = false;
  let reviewerAgentName: string | undefined;
  for (const argument of args) {
    if (argument === "--replace") {
      replace = true;
    } else if (argument.startsWith("--dataset-root=")) {
      datasetRoot = resolve(argument.slice("--dataset-root=".length));
    } else if (argument.startsWith("--recorded-at=")) {
      recordedAt = argument.slice("--recorded-at=".length);
    } else if (argument.startsWith("--reviewer-agent=")) {
      reviewerAgentName = argument.slice("--reviewer-agent=".length);
    } else {
      throw new Error(`unknown C4 review provenance argument ${argument}`);
    }
  }
  if (reviewerAgentName === undefined) {
    throw new Error("--reviewer-agent is required");
  }
  return { datasetRoot, recordedAt, replace, reviewerAgentName };
}

if (import.meta.main) {
  const result = await recordC4IndependentReviewProvenance(
    parseOptions(process.argv.slice(2)),
  );
  console.log(JSON.stringify(result, null, 2));
}
