import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import {
  assertHistoricalEvidenceProjectionCurrent,
  refreshHistoricalEvidenceProjection,
} from "../../scripts/project-historical-evidence";

describe("historical evidence projection", () => {
  it("derives tracked source bytes and hashes from the source artifacts", async () => {
    const source = new TextEncoder().encode("source report\n");
    const projection = {
      artifactKind: "tracked-historical-evidence-projection",
      benchmark: "Example",
      generatedBy: "manual",
      runIdentity: {
        commit: "0123456789abcdef0123456789abcdef01234567",
        runId: "run-example",
      },
      schemaVersion: 1,
      sourceArtifacts: [{
        bytes: 1,
        path: "reports/example.json",
        sha256: "0".repeat(64),
      }],
    };

    const refreshed = await refreshHistoricalEvidenceProjection({
      projection,
      readArtifact: async (path) => {
        expect(path).toBe("reports/example.json");
        return source;
      },
    });

    expect(refreshed).toMatchObject({
      generatedBy: "scripts/project-historical-evidence.ts",
      sourceArtifacts: [{
        bytes: source.byteLength,
        path: "reports/example.json",
        sha256: createHash("sha256").update(source).digest("hex"),
      }],
    });
    expect(() => assertHistoricalEvidenceProjectionCurrent({
      actual: projection,
      expected: refreshed,
    })).toThrow("source fingerprints drifted");
    expect(() => assertHistoricalEvidenceProjectionCurrent({
      actual: refreshed,
      expected: refreshed,
    })).not.toThrow();
  });
});
