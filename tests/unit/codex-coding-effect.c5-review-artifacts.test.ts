import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import {
  buildC5IndependentReviewDispatch,
  buildC5IndependentReviewProvenance,
  buildC5IndependentReviewSpawnMessage,
  buildC5ReviewInputBundle,
  buildC5ReviewRequest,
  canonicalizeC5FailureTaxonomy,
  parseC5IndependentReview,
  parseC5IndependentReviewProvenance,
  parseC5ReviewInputBundle,
  serializeC5ReviewArtifact,
} from "../../scripts/codex-coding-effect/c5-review-artifacts";

const PROJECTION_ROOT =
  "reports/quality-gates/phase-73/c5-native-longitudinal-pilot/projection";
const RUN_ID = "c5-native-pilot-20260716";
const projectionManifestBytes = '{"schemaVersion":1,"runId":"fixture"}\n';
const verificationBytes = '{"schemaVersion":1,"status":"accepted"}\n';
const reportBytes = `${JSON.stringify({
  claimBoundary: "internal-native-longitudinal-pilot-only",
  failureTaxonomy: [
    { count: 2, reason: "task:no-memory:hidden-test-failed" },
  ],
}, null, 2)}\n`;

describe("Codex coding-effect C5 review artifacts", () => {
  it("binds only the sanitized projection and canonical failure taxonomy", () => {
    const bundle = buildBundle();

    expect(parseC5ReviewInputBundle(bundle)).toEqual(bundle);
    expect(bundle.artifacts).toEqual({
      failureTaxonomy: {
        byteLength: Buffer.byteLength(canonicalizeC5FailureTaxonomy(reportBytes)),
        path: `${PROJECTION_ROOT}/report.json#failureTaxonomy`,
        sha256: sha256(canonicalizeC5FailureTaxonomy(reportBytes)),
      },
      projectionManifest: {
        byteLength: Buffer.byteLength(projectionManifestBytes),
        path: `${PROJECTION_ROOT}/projection-manifest.json`,
        sha256: sha256(projectionManifestBytes),
      },
      report: {
        byteLength: Buffer.byteLength(reportBytes),
        path: `${PROJECTION_ROOT}/report.json`,
        sha256: sha256(reportBytes),
      },
      verification: {
        byteLength: Buffer.byteLength(verificationBytes),
        path: `${PROJECTION_ROOT}/c5-verification.json`,
        sha256: sha256(verificationBytes),
      },
    });
    expect(bundle.scope).toBe("sanitized-projection-only");
    expect(bundle.excludedSensitiveArtifacts).toEqual([
      "raw-authentication-material",
      "raw-model-prompts",
      "raw-hook-payload-bodies",
      "hidden-evaluator-material",
      "gold-patch-material",
      "repository-source-code",
    ]);
    expect(Object.keys(bundle)).not.toContain("prompt");
    expect(JSON.stringify(bundle)).not.toContain("secret-fixture-value");
  });

  it("produces canonical instructions for all five acceptance assertions", () => {
    const inputBundleBytes = serializeC5ReviewArtifact(buildBundle());
    const request = buildC5ReviewRequest({
      inputBundle: parseC5ReviewInputBundle(JSON.parse(inputBundleBytes)),
      inputBundleSha256: sha256(inputBundleBytes),
    });

    for (const assertion of [
      "everyAttemptAccounted",
      "noSilentFallback",
      "failureTaxonomyReviewed",
      "powerAnalysis",
      "claimBoundary",
    ]) {
      expect(request).toContain(`\`${assertion}\``);
    }
    expect(request).toContain("sanitized projection only");
    expect(request).toContain("Recompute every UTF-8 byte length and SHA-256");
    expect(request).toContain("two-space-indented JSON");
    expect(request).toContain("one trailing LF byte");
    expect(request).toContain("Do not inspect");
    expect(request).toContain("raw authentication material");
    expect(request).toContain("hidden evaluator");
    expect(request).toContain("gold patch");
    expect(request).toContain("repository source code");
    expect(request).toContain("`accepted`");
  });

  it("parses strict review JSON and rejects unsupported acceptance", () => {
    const { bundle, inputBundleBytes } = serializedBundle();
    const accepted = buildAcceptedReview(bundle, inputBundleBytes);

    expect(parseC5IndependentReview(accepted)).toEqual(accepted);
    expect(() => parseC5IndependentReview({
      ...accepted,
      assertions: {
        ...accepted.assertions,
        noSilentFallback: false,
      },
    })).toThrow("accepted C5 review contains a failed assertion");
    expect(() => parseC5IndependentReview({
      ...accepted,
      rawPrompt: "must never be accepted",
    })).toThrow();
    expect(parseC5IndependentReview({
      ...accepted,
      assertions: {
        ...accepted.assertions,
        failureTaxonomyReviewed: false,
      },
      decision: "changes-requested",
    }).decision).toBe("changes-requested");
  });

  it("binds exact request, input, dispatch, and response bytes with non-cryptographic provenance", () => {
    const { bundle, inputBundleBytes } = serializedBundle();
    const requestBytes = buildC5ReviewRequest({
      inputBundle: bundle,
      inputBundleSha256: sha256(inputBundleBytes),
    });
    const dispatchBytes = serializeC5ReviewArtifact(
      buildC5IndependentReviewDispatch({
        projectionRootPath: PROJECTION_ROOT,
        spawnMessage: buildC5IndependentReviewSpawnMessage(PROJECTION_ROOT),
      }),
    );
    const responseBytes = serializeC5ReviewArtifact(
      buildAcceptedReview(bundle, inputBundleBytes),
    );
    const provenance = buildC5IndependentReviewProvenance({
      authorTaskName: "/root",
      dispatchBytes,
      inputBundleBytes,
      recordedAt: "2026-07-16T11:30:00.000Z",
      requestBytes,
      responseBytes,
      reviewerAgentName: "/root/c5_final_independent_review_v1",
    });

    expect(parseC5IndependentReviewProvenance(provenance)).toEqual(provenance);
    for (const [reference, bytes] of [
      [provenance.dispatch, dispatchBytes],
      [provenance.inputBundle, inputBundleBytes],
      [provenance.request, requestBytes],
      [provenance.response, responseBytes],
    ] as const) {
      expect(reference.byteLength).toBe(Buffer.byteLength(bytes));
      expect(reference.sha256).toBe(sha256(bytes));
    }
    expect(provenance.reviewer.contextPolicy).toBe("fork-turns-none");
    expect(provenance.reviewer.orchestratorAttestation).toEqual({
      attestedByTaskName: "/root",
      basis: "orchestrator-observed-dispatch-no-cryptographic-receipt",
      cryptographicReceipt: false,
    });
    expect(provenance.authorTaskName).not.toBe(
      provenance.reviewer.agentName,
    );
  });

  it("rejects self-review, mismatched responses, and non-canonical instructions", () => {
    const { bundle, inputBundleBytes } = serializedBundle();
    const requestBytes = buildC5ReviewRequest({
      inputBundle: bundle,
      inputBundleSha256: sha256(inputBundleBytes),
    });
    const dispatchBytes = serializeC5ReviewArtifact(
      buildC5IndependentReviewDispatch({
        projectionRootPath: PROJECTION_ROOT,
        spawnMessage: buildC5IndependentReviewSpawnMessage(PROJECTION_ROOT),
      }),
    );
    const responseBytes = serializeC5ReviewArtifact(
      buildAcceptedReview(bundle, inputBundleBytes),
    );
    const common = {
      dispatchBytes,
      inputBundleBytes,
      recordedAt: "2026-07-16T11:30:00.000Z",
      requestBytes,
      responseBytes,
      reviewerAgentName: "/root/c5_final_independent_review_v1",
    };

    expect(() => buildC5IndependentReviewProvenance({
      ...common,
      authorTaskName: "/root/c5_final_independent_review_v1",
    })).toThrow("C5 review author and reviewer must differ");
    expect(() => buildC5IndependentReviewProvenance({
      ...common,
      authorTaskName: "/root",
      requestBytes: `${requestBytes}\nUse any other evidence you want.\n`,
    })).toThrow("C5 independent review request is not canonical");

    const mismatchedResponse = serializeC5ReviewArtifact({
      ...buildAcceptedReview(bundle, inputBundleBytes),
      reportSha256: "f".repeat(64),
    });
    expect(() => buildC5IndependentReviewProvenance({
      ...common,
      authorTaskName: "/root",
      responseBytes: mismatchedResponse,
    })).toThrow("C5 independent review response does not bind the input bundle");
  });

});

function buildBundle() {
  return buildC5ReviewInputBundle({
    createdAt: "2026-07-16T11:00:00.000Z",
    projectionManifestBytes,
    projectionRootPath: PROJECTION_ROOT,
    reportBytes,
    runId: RUN_ID,
    verificationBytes,
  });
}

function serializedBundle() {
  const bundle = buildBundle();
  return {
    bundle,
    inputBundleBytes: serializeC5ReviewArtifact(bundle),
  };
}

function buildAcceptedReview(
  bundle: ReturnType<typeof buildBundle>,
  inputBundleBytes: string,
) {
  return {
    assertions: {
      claimBoundary: true,
      everyAttemptAccounted: true,
      failureTaxonomyReviewed: true,
      noSilentFallback: true,
      powerAnalysis: true,
    },
    claimBoundary: "internal-native-longitudinal-pilot-only" as const,
    decision: "accepted" as const,
    failureTaxonomySha256: bundle.artifacts.failureTaxonomy.sha256,
    findings: [],
    inputBundleSha256: sha256(inputBundleBytes),
    phase: "C5" as const,
    projectionManifestSha256: bundle.artifacts.projectionManifest.sha256,
    publicClaimEligible: false as const,
    publicCodingEffectProof: false as const,
    rationale: "The sanitized projection satisfies every review assertion.",
    reportSha256: bundle.artifacts.report.sha256,
    reviewedAt: "2026-07-16T11:20:00.000Z",
    reviewer: "independent C5 evidence reviewer",
    reviewerTaskName: "/root/c5_final_independent_review_v1" as const,
    readmeRowAllowed: false as const,
    runId: RUN_ID,
    schemaVersion: 1 as const,
    scope: "sanitized-projection-only" as const,
    verificationSha256: bundle.artifacts.verification.sha256,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
