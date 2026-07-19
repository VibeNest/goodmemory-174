import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  buildC5IndependentReviewDispatch,
  buildC5IndependentReviewSpawnMessage,
  buildC5ReviewInputBundle,
  buildC5ReviewRequest,
  serializeC5ReviewArtifact,
} from "./codex-coding-effect/c5-review-artifacts";

export async function prepareC5IndependentReview(input: {
  createdAt: string;
  projectionDirectory: string;
  projectionRootPath: string;
  replace?: boolean;
}): Promise<{
  dispatchSha256: string;
  inputBundleSha256: string;
  requestSha256: string;
  reviewRoot: string;
}> {
  const projectionDirectory = resolve(input.projectionDirectory);
  const reviewRoot = join(projectionDirectory, "review");
  const [manifestBytes, reportBytes, verificationBytes] = await Promise.all([
    readFile(join(projectionDirectory, "projection-manifest.json"), "utf8"),
    readFile(join(projectionDirectory, "report.json"), "utf8"),
    readFile(join(projectionDirectory, "c5-verification.json"), "utf8"),
  ]);
  const manifest = parseArtifactIdentity(manifestBytes, "projection manifest");
  const report = parseArtifactIdentity(reportBytes, "report");
  const verification = parseArtifactIdentity(
    verificationBytes,
    "verification",
  );
  if (
    report.runId !== manifest.runId ||
    verification.runId !== manifest.runId ||
    verification.decision !== "accepted"
  ) {
    throw new Error("C5 review preparation requires one accepted bound projection");
  }
  const inputBundleBytes = serializeC5ReviewArtifact(
    buildC5ReviewInputBundle({
      createdAt: input.createdAt,
      projectionManifestBytes: manifestBytes,
      projectionRootPath: input.projectionRootPath,
      reportBytes,
      runId: manifest.runId,
      verificationBytes,
    }),
  );
  const inputBundle = JSON.parse(inputBundleBytes) as ReturnType<
    typeof buildC5ReviewInputBundle
  >;
  const requestBytes = buildC5ReviewRequest({
    inputBundle,
    inputBundleSha256: sha256(inputBundleBytes),
  });
  const dispatchBytes = serializeC5ReviewArtifact(
    buildC5IndependentReviewDispatch({
      projectionRootPath: input.projectionRootPath,
      spawnMessage: buildC5IndependentReviewSpawnMessage(
        input.projectionRootPath,
      ),
    }),
  );
  if (input.replace) {
    await rm(reviewRoot, { force: true, recursive: true });
  }
  await mkdir(reviewRoot, { recursive: true });
  await Promise.all([
    writeFile(join(reviewRoot, "dispatch.json"), dispatchBytes, {
      encoding: "utf8",
      flag: "wx",
    }),
    writeFile(join(reviewRoot, "input-bundle.json"), inputBundleBytes, {
      encoding: "utf8",
      flag: "wx",
    }),
    writeFile(join(reviewRoot, "request.md"), requestBytes, {
      encoding: "utf8",
      flag: "wx",
    }),
  ]);
  return {
    dispatchSha256: sha256(dispatchBytes),
    inputBundleSha256: sha256(inputBundleBytes),
    requestSha256: sha256(requestBytes),
    reviewRoot,
  };
}

function parseOptions(args: readonly string[]): {
  createdAt: string;
  projectionDirectory: string;
  projectionRootPath: string;
  replace: boolean;
} {
  let createdAt = new Date().toISOString();
  let projectionDirectory: string | undefined;
  let projectionRootPath: string | undefined;
  let replace = false;
  for (const argument of args) {
    if (argument === "--replace") {
      replace = true;
    } else if (argument.startsWith("--created-at=")) {
      createdAt = argument.slice("--created-at=".length);
    } else if (argument.startsWith("--projection-directory=")) {
      projectionDirectory = resolve(
        argument.slice("--projection-directory=".length),
      );
    } else if (argument.startsWith("--projection-root-path=")) {
      projectionRootPath = argument.slice("--projection-root-path=".length);
    } else {
      throw new Error(`unknown C5 review preparation argument ${argument}`);
    }
  }
  if (projectionDirectory === undefined) {
    throw new Error("--projection-directory is required");
  }
  return {
    createdAt,
    projectionDirectory,
    projectionRootPath:
      projectionRootPath ?? repositoryRelativePath(projectionDirectory),
    replace,
  };
}

function parseArtifactIdentity(
  bytes: string,
  label: string,
): { decision?: unknown; runId: string } {
  let value: unknown;
  try {
    value = JSON.parse(bytes) as unknown;
  } catch {
    throw new Error(`C5 ${label} is not valid JSON`);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof (value as { runId?: unknown }).runId !== "string"
  ) {
    throw new Error(`C5 ${label} has no runId`);
  }
  const record = value as { decision?: unknown; runId: string };
  return { decision: record.decision, runId: record.runId };
}

function repositoryRelativePath(path: string): string {
  const relativePath = relative(process.cwd(), path);
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      "--projection-root-path is required outside the current checkout",
    );
  }
  return relativePath.split(sep).join("/");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

if (import.meta.main) {
  console.log(JSON.stringify(
    await prepareC5IndependentReview(parseOptions(process.argv.slice(2))),
    null,
    2,
  ));
}
