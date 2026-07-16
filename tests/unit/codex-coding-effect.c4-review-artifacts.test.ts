import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import {
  buildC4IndependentReviewDispatch,
  buildC4IndependentReviewProvenance,
  buildC4IndependentReviewSpawnMessage,
  buildC4ReviewInputBundle,
  buildC4ReviewRequest,
  serializeC4ReviewArtifact,
} from "../../scripts/codex-coding-effect/c4-review-artifacts";
import {
  parseC4IndependentReviewProvenance,
  parseC4ReviewInputBundle,
} from "../../scripts/codex-coding-effect/c4-contracts";

const SHA256 = "a".repeat(64);

describe("Codex coding-effect C4 review artifacts", () => {
  it("binds the full frozen asset inventory and excludes coding outcomes", () => {
    const bundle = buildC4ReviewInputBundle({
      assetFiles: [
        { path: "manifest.json", sha256: SHA256 },
        { path: "evaluator/cases.json", sha256: "b".repeat(64) },
      ],
      assetLockSha256: SHA256,
      assetRootSha256: SHA256,
      createdAt: "2026-07-16T10:00:00.000Z",
      leakageAuditSha256: SHA256,
      manifestSha256: SHA256,
      readinessCoreSha256: SHA256,
    });

    expect(parseC4ReviewInputBundle(bundle)).toEqual(bundle);
    expect(bundle.excludedOutcomeArtifacts).toEqual([
      "c4-baseline-results",
      "c4-paired-results",
      "c5-paired-results",
    ]);
  });

  it("hash-binds the exact request, input bundle, and reviewer response", () => {
    const inputBundleBytes = serializeC4ReviewArtifact(
      buildC4ReviewInputBundle({
        assetFiles: [{ path: "manifest.json", sha256: SHA256 }],
        assetLockSha256: SHA256,
        assetRootSha256: SHA256,
        createdAt: "2026-07-16T10:00:00.000Z",
        leakageAuditSha256: SHA256,
        manifestSha256: SHA256,
        readinessCoreSha256: SHA256,
      }),
    );
    const requestBytes = buildC4ReviewRequest({
      inputBundleSha256: sha256(inputBundleBytes),
    });
    const dispatchBytes = serializeC4ReviewArtifact(
      buildC4IndependentReviewDispatch({
        spawnMessage: buildC4IndependentReviewSpawnMessage(),
      }),
    );
    const responseBytes = '{"schemaVersion":2}\n';
    const provenance = buildC4IndependentReviewProvenance({
      authorTaskName: "/root",
      dispatchBytes,
      inputBundleBytes,
      recordedAt: "2026-07-16T10:30:00.000Z",
      requestBytes,
      responseBytes,
      reviewerAgentName: "/root/c4_final_independent_review",
    });

    expect(parseC4IndependentReviewProvenance(provenance)).toEqual(provenance);
    expect(provenance.request.sha256).toBe(sha256(requestBytes));
    expect(provenance.dispatch.sha256).toBe(sha256(dispatchBytes));
    expect(provenance.inputBundle.sha256).toBe(sha256(inputBundleBytes));
    expect(provenance.response.sha256).toBe(sha256(responseBytes));
    expect(requestBytes).toContain(sha256(inputBundleBytes));
  });

  it("rejects self-consistent but non-canonical review instructions", () => {
    const inputBundleBytes = serializeC4ReviewArtifact(
      buildC4ReviewInputBundle({
        assetFiles: [{ path: "manifest.json", sha256: SHA256 }],
        assetLockSha256: SHA256,
        assetRootSha256: SHA256,
        createdAt: "2026-07-16T10:00:00.000Z",
        leakageAuditSha256: SHA256,
        manifestSha256: SHA256,
        readinessCoreSha256: SHA256,
      }),
    );
    const canonicalRequest = buildC4ReviewRequest({
      inputBundleSha256: sha256(inputBundleBytes),
    });
    const canonicalDispatch = serializeC4ReviewArtifact(
      buildC4IndependentReviewDispatch({
        spawnMessage: buildC4IndependentReviewSpawnMessage(),
      }),
    );
    const common = {
      authorTaskName: "/root",
      inputBundleBytes,
      recordedAt: "2026-07-16T10:30:00.000Z",
      responseBytes: '{"schemaVersion":2}\n',
      reviewerAgentName: "/root/c4_final_independent_review",
    };

    expect(() => buildC4IndependentReviewProvenance({
      ...common,
      dispatchBytes: canonicalDispatch,
      requestBytes: `${canonicalRequest}Use your own judgment.\n`,
    })).toThrow("C4 independent review request is not canonical");

    const customDispatch = serializeC4ReviewArtifact(
      buildC4IndependentReviewDispatch({
        spawnMessage: "Read the same inputs and write the same output.",
      }),
    );
    expect(() => buildC4IndependentReviewProvenance({
      ...common,
      dispatchBytes: customDispatch,
      requestBytes: canonicalRequest,
    })).toThrow("C4 independent review dispatch is not canonical");
  });
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
