import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseC5IndependentReviewProvenance,
  parseC5ReviewInputBundle,
  serializeC5ReviewArtifact,
} from "../../scripts/codex-coding-effect/c5-review-artifacts";
import {
  prepareC5IndependentReview,
} from "../../scripts/prepare-codex-coding-effect-c5-review";
import {
  recordC5IndependentReviewProvenance,
} from "../../scripts/record-codex-coding-effect-c5-review-provenance";

describe("Codex coding-effect C5 review CLI", () => {
  it("prepares canonical sanitized inputs and records bound independent provenance", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c5-review-cli-"));
    const projection = join(root, "projection");
    try {
      await Bun.write(join(projection, "projection-manifest.json"),
        '{"runId":"c5-review-cli-fixture","schemaVersion":1}\n');
      await Bun.write(join(projection, "report.json"), `${JSON.stringify({
        claimBoundary: "internal-native-longitudinal-pilot-only",
        failureTaxonomy: [],
        runId: "c5-review-cli-fixture",
      }, null, 2)}\n`);
      await Bun.write(join(projection, "c5-verification.json"),
        '{"decision":"accepted","runId":"c5-review-cli-fixture","schemaVersion":1}\n');

      const prepared = await prepareC5IndependentReview({
        createdAt: "2026-07-16T12:00:00.000Z",
        projectionDirectory: projection,
        projectionRootPath:
          "reports/quality-gates/phase-73/c5-review-cli-fixture",
      });
      expect(prepared.inputBundleSha256).toMatch(/^[a-f0-9]{64}$/u);
      const bundleBytes = await readFile(
        join(projection, "review", "input-bundle.json"),
        "utf8",
      );
      const bundle = parseC5ReviewInputBundle(JSON.parse(bundleBytes));
      expect(bundle.scope).toBe("sanitized-projection-only");
      expect(bundle.runId).toBe("c5-review-cli-fixture");

      await writeFile(
        join(projection, "review", "independent-review.json"),
        serializeC5ReviewArtifact({
          assertions: {
            claimBoundary: true,
            everyAttemptAccounted: true,
            failureTaxonomyReviewed: true,
            noSilentFallback: true,
            powerAnalysis: true,
          },
          claimBoundary: "internal-native-longitudinal-pilot-only",
          decision: "accepted",
          failureTaxonomySha256: bundle.artifacts.failureTaxonomy.sha256,
          findings: [],
          inputBundleSha256: sha256(bundleBytes),
          phase: "C5",
          projectionManifestSha256:
            bundle.artifacts.projectionManifest.sha256,
          publicClaimEligible: false,
          publicCodingEffectProof: false,
          rationale: "The sanitized evidence satisfies all five assertions.",
          readmeRowAllowed: false,
          reportSha256: bundle.artifacts.report.sha256,
          reviewedAt: "2026-07-16T12:10:00.000Z",
          reviewer: "independent C5 evidence reviewer",
          reviewerTaskName: "/root/c5_final_independent_review_v1",
          runId: bundle.runId,
          schemaVersion: 1,
          scope: "sanitized-projection-only",
          verificationSha256: bundle.artifacts.verification.sha256,
        }),
        "utf8",
      );
      const recorded = await recordC5IndependentReviewProvenance({
        authorTaskName: "/root",
        projectionDirectory: projection,
        recordedAt: "2026-07-16T12:20:00.000Z",
        reviewerAgentName: "/root/c5_final_independent_review_v1",
      });
      const provenance = parseC5IndependentReviewProvenance(JSON.parse(
        await readFile(recorded.provenancePath, "utf8"),
      ));
      expect(provenance.reviewDecision).toBe("accepted");
      expect(provenance.reviewer.contextPolicy).toBe("fork-turns-none");
      expect(provenance.reviewer.orchestratorAttestation.cryptographicReceipt)
        .toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects any reviewer identity outside the frozen dispatch", async () => {
    await expect(recordC5IndependentReviewProvenance({
      authorTaskName: "/root",
      projectionDirectory: "/missing",
      recordedAt: "2026-07-16T12:20:00.000Z",
      reviewerAgentName: "/root/not-the-frozen-reviewer",
    })).rejects.toThrow("reviewer identity");
  });
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
