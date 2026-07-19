import {
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  C5_FINAL_REVIEWER_AGENT_NAME,
  buildC5IndependentReviewProvenance,
  serializeC5ReviewArtifact,
} from "./codex-coding-effect/c5-review-artifacts";

export async function recordC5IndependentReviewProvenance(input: {
  authorTaskName: string;
  projectionDirectory: string;
  recordedAt: string;
  replace?: boolean;
  reviewerAgentName: string;
}): Promise<{ provenancePath: string; reviewerAgentName: string }> {
  if (input.reviewerAgentName !== C5_FINAL_REVIEWER_AGENT_NAME) {
    throw new Error("C5 reviewer identity does not match the frozen dispatch");
  }
  const reviewRoot = join(resolve(input.projectionDirectory), "review");
  const [dispatchBytes, inputBundleBytes, requestBytes, responseBytes] =
    await Promise.all([
      readFile(join(reviewRoot, "dispatch.json"), "utf8"),
      readFile(join(reviewRoot, "input-bundle.json"), "utf8"),
      readFile(join(reviewRoot, "request.md"), "utf8"),
      readFile(join(reviewRoot, "independent-review.json"), "utf8"),
    ]);
  const provenance = buildC5IndependentReviewProvenance({
    authorTaskName: input.authorTaskName,
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
    serializeC5ReviewArtifact(provenance),
    { encoding: "utf8", flag: "wx" },
  );
  return { provenancePath, reviewerAgentName: input.reviewerAgentName };
}

function parseOptions(args: readonly string[]): {
  authorTaskName: string;
  projectionDirectory: string;
  recordedAt: string;
  replace: boolean;
  reviewerAgentName: string;
} {
  let authorTaskName = "/root";
  let projectionDirectory: string | undefined;
  let recordedAt = new Date().toISOString();
  let replace = false;
  let reviewerAgentName: string | undefined;
  for (const argument of args) {
    if (argument === "--replace") {
      replace = true;
    } else if (argument.startsWith("--author-task=")) {
      authorTaskName = argument.slice("--author-task=".length);
    } else if (argument.startsWith("--projection-directory=")) {
      projectionDirectory = resolve(
        argument.slice("--projection-directory=".length),
      );
    } else if (argument.startsWith("--recorded-at=")) {
      recordedAt = argument.slice("--recorded-at=".length);
    } else if (argument.startsWith("--reviewer-agent=")) {
      reviewerAgentName = argument.slice("--reviewer-agent=".length);
    } else {
      throw new Error(`unknown C5 review provenance argument ${argument}`);
    }
  }
  if (projectionDirectory === undefined) {
    throw new Error("--projection-directory is required");
  }
  if (reviewerAgentName === undefined) {
    throw new Error("--reviewer-agent is required");
  }
  return {
    authorTaskName,
    projectionDirectory,
    recordedAt,
    replace,
    reviewerAgentName,
  };
}

if (import.meta.main) {
  console.log(JSON.stringify(
    await recordC5IndependentReviewProvenance(
      parseOptions(process.argv.slice(2)),
    ),
    null,
    2,
  ));
}
