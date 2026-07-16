import { describe, expect, it } from "bun:test";

import {
  auditC4SurfaceHiddenArtifactMatrix,
  C4_HIDDEN_ARTIFACT_IDS,
  C4_LEAKAGE_SURFACE_IDS,
} from "../../scripts/codex-coding-effect/c4-leakage";
import type {
  C4HiddenArtifact,
  C4LeakageSurface,
} from "../../scripts/codex-coding-effect/c4-leakage";

describe("Codex coding-effect C4 leakage matrix", () => {
  it("audits every surface against every hidden-artifact class", () => {
    const audit = auditC4SurfaceHiddenArtifactMatrix({
      artifacts: artifacts(),
      surfaces: surfaces(),
    });

    expect(audit.status).toBe("accepted");
    expect(audit.overlapCount).toBe(0);
    expect(audit.cells).toHaveLength(
      C4_LEAKAGE_SURFACE_IDS.length * C4_HIDDEN_ARTIFACT_IDS.length,
    );
    expect(new Set(audit.cells.map((cell) =>
      `${cell.surfaceId}/${cell.artifactId}`
    )).size).toBe(audit.cells.length);
    expect(audit.candidateBindingVersion).toBe(1);
    expect(audit.candidateExtractionVersion).toBe(
      "semantic-lines-plus-typed-values-v2",
    );
    expect(audit.normalizationVersion).toBe(
      "nfkc-lowercase-whitespace-v1",
    );
    expect(audit.cells.every((cell) =>
      cell.candidateFragmentCount > 0 &&
      cell.candidateFragmentSetSha256.length === 64 &&
      cell.hiddenValueSetSha256.length === 64
    )).toBe(true);
  });

  it("mutation-tests every matrix cell with an intentional hidden fragment", () => {
    const cleanSurfaces = surfaces();
    const hiddenArtifacts = artifacts();

    for (const surfaceId of C4_LEAKAGE_SURFACE_IDS) {
      for (const artifactId of C4_HIDDEN_ARTIFACT_IDS) {
        const artifact = hiddenArtifacts.find((candidate) =>
          candidate.id === artifactId
        )!;
        const leakedFragment = artifact.fragments[0]!;
        const mutated = cleanSurfaces.map((surface) =>
          surface.id === surfaceId
            ? { ...surface, content: `${surface.content}\n${leakedFragment}\n` }
            : surface
        );
        const audit = auditC4SurfaceHiddenArtifactMatrix({
          artifacts: hiddenArtifacts,
          surfaces: mutated,
        });
        const rejected = audit.cells.filter((cell) =>
          cell.status === "rejected"
        );
        expect(rejected.some((cell) =>
          cell.surfaceId === surfaceId && cell.artifactId === artifactId
        )).toBe(true);
        expect(audit.status).toBe("rejected");
      }
    }
  });

  it("rejects incomplete matrices instead of silently deferring a surface", () => {
    expect(() => auditC4SurfaceHiddenArtifactMatrix({
      artifacts: artifacts(),
      surfaces: surfaces().slice(1),
    })).toThrow("C4 leakage matrix requires every surface exactly once");
    expect(() => auditC4SurfaceHiddenArtifactMatrix({
      artifacts: artifacts().slice(1),
      surfaces: surfaces(),
    })).toThrow("C4 leakage matrix requires every hidden artifact exactly once");
  });

  it("detects normalized case and whitespace mutations for every artifact class", () => {
    for (const [index, artifactId] of C4_HIDDEN_ARTIFACT_IDS.entries()) {
      const fragment = `Hidden ${artifactId} Boundary`;
      const hiddenArtifacts = artifacts().map((artifact) =>
        artifact.id === artifactId
          ? { ...artifact, fragments: [fragment] }
          : artifact
      );
      const surfaceId = C4_LEAKAGE_SURFACE_IDS[index]!;
      const mutated = surfaces().map((surface) =>
        surface.id === surfaceId
          ? {
              ...surface,
              content: `${surface.content}\n hidden   ${artifactId.toUpperCase()} boundary \n`,
            }
          : surface
      );
      const audit = auditC4SurfaceHiddenArtifactMatrix({
        artifacts: hiddenArtifacts,
        surfaces: mutated,
      });
      const cell = audit.cells.find((candidate) =>
        candidate.surfaceId === surfaceId &&
        candidate.artifactId === artifactId
      )!;
      expect(cell.exactOverlapCount).toBe(0);
      expect(cell.normalizedOverlapCount).toBe(1);
      expect(cell.status).toBe("rejected");
    }
  });

  it("detects typed hidden values without length thresholds", () => {
    const hiddenArtifacts = artifacts().map((artifact) =>
      artifact.id === "hidden-test-source"
        ? {
            ...artifact,
            hiddenValues: [2.5, 2500, false, "ok"],
          }
        : artifact
    );
    const mutated = surfaces().map((surface) =>
      surface.id === "stage-prompts"
        ? {
            ...surface,
            content: `${surface.content}\n2.5 -> 2500; false; ok\n`,
          }
        : surface
    );

    const audit = auditC4SurfaceHiddenArtifactMatrix({
      artifacts: hiddenArtifacts,
      surfaces: mutated,
    });
    const cell = audit.cells.find((candidate) =>
      candidate.surfaceId === "stage-prompts" &&
      candidate.artifactId === "hidden-test-source"
    )!;

    expect(cell.status).toBe("rejected");
    expect(cell.matchedFragmentSha256).toHaveLength(4);
  });
});

function surfaces(): C4LeakageSurface[] {
  return C4_LEAKAGE_SURFACE_IDS.map((id) => ({
    content: `clean evaluator-owned content for ${id}`,
    id,
  }));
}

function artifacts(): C4HiddenArtifact[] {
  return C4_HIDDEN_ARTIFACT_IDS.map((id) => ({
    content: `complete hidden artifact ${id}`,
    fragments: [`C4_MUTATION_${id.toUpperCase().replaceAll("-", "_")}`],
    id,
  }));
}
