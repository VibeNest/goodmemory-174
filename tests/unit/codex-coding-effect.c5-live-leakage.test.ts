import { createHash } from "node:crypto";

import { describe, expect, it } from "bun:test";

import {
  auditC5LiveLeakageSurfaces,
  C5_LIVE_LEAKAGE_SURFACE_IDS,
} from "../../scripts/codex-coding-effect/c5-live-leakage";
import type {
  C4HiddenArtifact,
  C4LeakageMatrixAudit,
  C4LeakageSurface,
} from "../../scripts/codex-coding-effect/c4-leakage";
import type {
  C5TrajectoryOriginReceipt,
} from "../../scripts/codex-coding-effect/c5-live-leakage";

describe("Codex coding-effect C5 live leakage", () => {
  it("re-audits exactly four dynamic surfaces against all hidden artifact classes", () => {
    const audit = auditC5LiveLeakageSurfaces({
      artifacts: hiddenArtifacts(),
      liveSurfaces: liveSurfaces(),
      staticSurfaces: staticSurfaces(),
      trajectoryOrigins: [],
    });

    expect(audit).toMatchObject({
      liveMatrixCellCount: 12,
      liveOverlapCount: 0,
      liveSurfaceIds: C5_LIVE_LEAKAGE_SURFACE_IDS,
      schemaVersion: 5,
      status: "accepted",
      trajectoryOriginOverlapCount: 0,
      unexplainedLiveOverlapCount: 0,
    });
    expect(audit.liveSurfaceReceipts).toEqual(liveSurfaceReceipts());
    const persistedAudit = JSON.stringify(audit);
    for (const surface of liveSurfaces()) {
      if (surface.content.length > 0) {
        expect(persistedAudit).not.toContain(surface.content);
      }
    }
    expect(audit.liveSurfaceReceipts.every((receipt) =>
      JSON.stringify(Object.keys(receipt).sort()) === JSON.stringify([
        "contentSha256",
        "hiddenValueSurfaceSha256",
        "id",
        "utf8Bytes",
      ])
    )).toBe(true);
    expect(audit.auditSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(audit.fullMatrixAuditReceipt.cells).toHaveLength(27);
    expect(audit.fullMatrixAuditSha256).toBe(
      recomputeMatrixAuditSha256(audit.fullMatrixAuditReceipt),
    );
    expect(audit.fullMatrixAuditReceipt.auditSha256).toBe(
      audit.fullMatrixAuditSha256,
    );
    expect(audit.trajectoryOriginAuditSha256).toBe(
      recomputeTrajectoryOriginAuditSha256(audit.trajectoryOrigins),
    );
    expect(audit.liveCells).toHaveLength(12);
    expect(new Set(audit.liveCells.map((cell) => cell.surfaceId))).toEqual(
      new Set(C5_LIVE_LEAKAGE_SURFACE_IDS),
    );
  });

  it("rejects a hidden implementation fragment in the actual hook context", () => {
    const surfaces = liveSurfaces().map((surface) =>
      surface.id === "goodmemory-hook-context-after-seeding"
        ? { ...surface, content: `${surface.content}\nSECRET_IMPLEMENTATION` }
        : surface
    );
    const audit = auditC5LiveLeakageSurfaces({
      artifacts: hiddenArtifacts(),
      liveSurfaces: surfaces,
      staticSurfaces: staticSurfaces(),
      trajectoryOrigins: [],
    });

    expect(audit.status).toBe("rejected");
    expect(audit.liveOverlapCount).toBeGreaterThan(0);
    expect(audit.unexplainedLiveOverlapCount).toBeGreaterThan(0);
    expect(audit.liveCells).toContainEqual(expect.objectContaining({
      artifactId: "gold-patches",
      status: "rejected",
      surfaceId: "goodmemory-hook-context-after-seeding",
    }));
  });

  it("requires all four live surfaces even when flat-summary is deliberately empty", () => {
    expect(() => auditC5LiveLeakageSurfaces({
      artifacts: hiddenArtifacts(),
      liveSurfaces: liveSurfaces().filter((surface) =>
        surface.id !== "flat-summary-after-seeding"
      ),
      staticSurfaces: staticSurfaces(),
      trajectoryOrigins: [],
    })).toThrow("C5 live leakage surfaces must match the frozen four-surface contract");
  });

  it("accepts a dynamic overlap only when a prior trajectory attests its origin", () => {
    const surfaces = liveSurfaces().map((surface) =>
      surface.id === "goodmemory-export-after-seeding"
        ? { ...surface, content: '{"memory":"SECRET_IMPLEMENTATION"}' }
        : surface
    );
    const audit = auditC5LiveLeakageSurfaces({
      artifacts: hiddenArtifacts(),
      liveSurfaces: surfaces,
      staticSurfaces: staticSurfaces(),
      trajectoryOrigins: [{
        content: "+const implementation = 'SECRET_IMPLEMENTATION';\n",
        id: "stage-1:agent-patch",
      }],
    });

    expect(audit).toMatchObject({
      liveOverlapCount: 1,
      status: "accepted",
      trajectoryOriginOverlapCount: 1,
      unexplainedLiveOverlapCount: 0,
    });
    expect(audit.trajectoryOrigins).toEqual([{
      id: "stage-1:agent-patch",
      matrixAuditReceipt: expect.objectContaining({
        auditSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        cells: expect.any(Array),
        schemaVersion: 1,
      }),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    }]);
    const [origin] = audit.trajectoryOrigins;
    expect(origin?.matrixAuditReceipt.cells).toHaveLength(27);
    expect(origin?.matrixAuditReceipt.auditSha256).toBe(
      recomputeMatrixAuditSha256(origin!.matrixAuditReceipt),
    );
    expect(audit.trajectoryOriginAuditSha256).toBe(
      recomputeTrajectoryOriginAuditSha256(audit.trajectoryOrigins),
    );
    expect(audit.liveCells).toContainEqual(expect.objectContaining({
      artifactId: "gold-patches",
      originAttestedMatchSha256: [expect.stringMatching(/^[a-f0-9]{64}$/u)],
      provenanceStatus: "accepted",
      surfaceId: "goodmemory-export-after-seeding",
      unexplainedMatchSha256: [],
    }));
    const exportCell = audit.liveCells.find((cell) =>
      cell.artifactId === "gold-patches" &&
      cell.surfaceId === "goodmemory-export-after-seeding"
    );
    expect(exportCell).toBeDefined();
    expect(originMatchUnion(audit.trajectoryOrigins, "gold-patches")).toEqual(
      exportCell!.originAttestedMatchSha256,
    );
  });

  it("accepts prior Codex output provenance without persisting the raw output", () => {
    const rawOutput = [
      '{"type":"item.completed","item":{',
      '"type":"agent_message","text":"SECRET_IMPLEMENTATION"}}',
    ].join("");
    const audit = auditC5LiveLeakageSurfaces({
      artifacts: hiddenArtifacts(),
      liveSurfaces: liveSurfaces().map((surface) =>
        surface.id === "goodmemory-export-after-seeding"
          ? { ...surface, content: '{"memory":"SECRET_IMPLEMENTATION"}' }
          : surface
      ),
      staticSurfaces: staticSurfaces(),
      trajectoryOrigins: [{
        content: rawOutput,
        id: "stage-1:codex-jsonl-output",
      }],
    });

    expect(audit).toMatchObject({
      status: "accepted",
      trajectoryOriginOverlapCount: 1,
      unexplainedLiveOverlapCount: 0,
    });
    expect(JSON.stringify(audit)).not.toContain(rawOutput);
  });

  it("binds receipt and partition mutations to independently recomputable hashes", () => {
    const audit = auditC5LiveLeakageSurfaces({
      artifacts: hiddenArtifacts(),
      liveSurfaces: liveSurfaces().map((surface) =>
        surface.id === "goodmemory-export-after-seeding"
          ? { ...surface, content: '{"memory":"SECRET_IMPLEMENTATION"}' }
          : surface
      ),
      staticSurfaces: staticSurfaces(),
      trajectoryOrigins: [{
        content: "+const implementation = 'SECRET_IMPLEMENTATION';\n",
        id: "stage-1:agent-patch",
      }],
    });
    const fullMatrixMutation = structuredClone(audit.fullMatrixAuditReceipt);
    fullMatrixMutation.cells[0]!.surfaceSha256 = "0".repeat(64);
    expect(recomputeMatrixAuditSha256(fullMatrixMutation)).not.toBe(
      audit.fullMatrixAuditSha256,
    );

    const originMutation = structuredClone(audit.trajectoryOrigins);
    originMutation[0]!.matrixAuditReceipt.cells.find((cell) =>
      cell.artifactId === "gold-patches" &&
      cell.surfaceId === "effective-codex-input-after-seeding"
    )!.matchedFragmentSha256 = [];
    expect(recomputeTrajectoryOriginAuditSha256(originMutation)).not.toBe(
      audit.trajectoryOriginAuditSha256,
    );
    expect(originMatchUnion(originMutation, "gold-patches")).not.toEqual(
      audit.liveCells.find((cell) =>
        cell.artifactId === "gold-patches" &&
        cell.surfaceId === "goodmemory-export-after-seeding"
      )?.originAttestedMatchSha256,
    );

    const partitionMutation = structuredClone(audit.liveCells);
    const leakedCell = partitionMutation.find((cell) =>
      cell.artifactId === "gold-patches" &&
      cell.surfaceId === "goodmemory-export-after-seeding"
    )!;
    leakedCell.originAttestedMatchSha256 = [];
    leakedCell.unexplainedMatchSha256 = [];
    expect([
      ...leakedCell.originAttestedMatchSha256,
      ...leakedCell.unexplainedMatchSha256,
    ].sort()).not.toEqual(leakedCell.matchedFragmentSha256);
  });

  it("canonicalizes per-origin receipts that reproduce every artifact match union", () => {
    const audit = auditC5LiveLeakageSurfaces({
      artifacts: hiddenArtifacts(),
      liveSurfaces: liveSurfaces().map((surface) =>
        surface.id === "goodmemory-export-after-seeding"
          ? {
            ...surface,
            content: "src/hidden.ts SECRET_IMPLEMENTATION SECRET_VALUE",
          }
          : surface
      ),
      staticSurfaces: staticSurfaces(),
      trajectoryOrigins: [
        {
          content: "SECRET_IMPLEMENTATION",
          id: "stage-2:agent-patch",
        },
        {
          content: "src/hidden.ts SECRET_VALUE",
          id: "stage-1:effective-prompt",
        },
      ],
    });

    expect(audit.status).toBe("accepted");
    expect(audit.trajectoryOrigins.map((origin) => origin.id)).toEqual([
      "stage-1:effective-prompt",
      "stage-2:agent-patch",
    ]);
    for (const origin of audit.trajectoryOrigins) {
      expect(origin.matrixAuditReceipt.cells).toHaveLength(27);
      expect(origin.matrixAuditReceipt.auditSha256).toBe(
        recomputeMatrixAuditSha256(origin.matrixAuditReceipt),
      );
    }
    for (const artifact of hiddenArtifacts()) {
      const exportCell = audit.liveCells.find((cell) =>
        cell.artifactId === artifact.id &&
        cell.surfaceId === "goodmemory-export-after-seeding"
      );
      expect(exportCell).toBeDefined();
      expect(originMatchUnion(audit.trajectoryOrigins, artifact.id)).toEqual(
        exportCell!.originAttestedMatchSha256,
      );
    }
    expect(audit.trajectoryOriginAuditSha256).toBe(
      recomputeTrajectoryOriginAuditSha256(audit.trajectoryOrigins),
    );
  });

  it("never excuses a static leak even when prior trajectory content matches it", () => {
    const staticWithLeak = staticSurfaces().map((surface) =>
      surface.id === "stage-prompts"
        ? { ...surface, content: "SECRET_IMPLEMENTATION" }
        : surface
    );
    const audit = auditC5LiveLeakageSurfaces({
      artifacts: hiddenArtifacts(),
      liveSurfaces: liveSurfaces(),
      staticSurfaces: staticWithLeak,
      trajectoryOrigins: [{
        content: "SECRET_IMPLEMENTATION",
        id: "stage-1:agent-patch",
      }],
    });

    expect(audit.status).toBe("rejected");
    expect(audit.staticOverlapCount).toBeGreaterThan(0);
    expect(audit.unexplainedLiveOverlapCount).toBe(0);
  });

  it("ignores export metadata but rejects the same hidden values in semantic memory content", () => {
    const artifacts = hiddenArtifacts().map((artifact): C4HiddenArtifact =>
      artifact.id === "hidden-test-source"
        ? {
          content: '{"expected":"HIDDEN_SEMANTIC_MARKER"}',
          fragments: ["HIDDEN_SEMANTIC_MARKER"],
          hiddenValueRelations: [[1, 14]],
          hiddenValues: [1, 14],
          id: "hidden-test-source",
        }
        : artifact
    );
    const metadataOnly = liveSurfaces().map((surface) =>
      surface.id === "goodmemory-export-after-seeding"
        ? {
          ...surface,
          content: '{"version":1,"recordCount":14}',
          hiddenValueContents: [],
        }
        : surface
    );

    expect(auditC5LiveLeakageSurfaces({
      artifacts,
      liveSurfaces: metadataOnly,
      staticSurfaces: staticSurfaces(),
      trajectoryOrigins: [],
    }).status).toBe("accepted");

    const semanticLeak = metadataOnly.map((surface) =>
      surface.id === "goodmemory-export-after-seeding"
        ? { ...surface, hiddenValueContents: ['{"quantum":1,"limit":14}'] }
        : surface
    );
    const mutation = auditC5LiveLeakageSurfaces({
      artifacts,
      liveSurfaces: semanticLeak,
      staticSurfaces: staticSurfaces(),
      trajectoryOrigins: [],
    });

    expect(mutation.status).toBe("rejected");
    expect(mutation.unexplainedLiveOverlapCount).toBeGreaterThan(0);
  });
});

function hiddenArtifacts(): C4HiddenArtifact[] {
  return [
    {
      content: '["src/hidden.ts"]',
      fragments: ["src/hidden.ts"],
      id: "expected-changed-files",
    },
    {
      content: "SECRET_IMPLEMENTATION",
      fragments: ["SECRET_IMPLEMENTATION"],
      id: "gold-patches",
    },
    {
      content: '{"expected":"SECRET_VALUE"}',
      fragments: ["SECRET_VALUE"],
      hiddenValueRelations: [["input", "SECRET_VALUE"]],
      hiddenValues: ["SECRET_VALUE"],
      id: "hidden-test-source",
    },
  ];
}

function liveSurfaces(): C4LeakageSurface[] {
  return [
    {
      content: "Implement the requested public behavior.",
      id: "effective-codex-input-after-seeding",
    },
    {
      content: "",
      id: "flat-summary-after-seeding",
    },
    {
      content: '{"memories":[]}',
      id: "goodmemory-export-after-seeding",
    },
    {
      content: "No matching durable context.",
      id: "goodmemory-hook-context-after-seeding",
    },
  ];
}

function liveSurfaceReceipts() {
  return liveSurfaces().map((surface) => ({
    contentSha256: sha256(surface.content),
    hiddenValueSurfaceSha256: sha256(JSON.stringify([surface.content])),
    id: surface.id as typeof C5_LIVE_LEAKAGE_SURFACE_IDS[number],
    utf8Bytes: Buffer.byteLength(surface.content, "utf8"),
  }));
}

function staticSurfaces(): C4LeakageSurface[] {
  return [
    { content: "Public feedback.", id: "allowed-feedback" },
    { content: "Frozen audit reference.", id: "frozen-prehistory" },
    { content: "Repository instructions.", id: "repository-instructions" },
    { content: "Stage prompt.", id: "stage-prompts" },
    { content: "Visible source.", id: "visible-repository-files" },
  ];
}

function recomputeMatrixAuditSha256(receipt: C4LeakageMatrixAudit): string {
  const { auditSha256: _, ...basis } = receipt;
  return sha256(JSON.stringify(basis));
}

function recomputeTrajectoryOriginAuditSha256(
  receipts: readonly C5TrajectoryOriginReceipt[],
): string {
  return sha256(JSON.stringify(receipts));
}

function originMatchUnion(
  receipts: readonly C5TrajectoryOriginReceipt[],
  artifactId: C4HiddenArtifact["id"],
): string[] {
  return [...new Set(receipts.flatMap((receipt) =>
    receipt.matrixAuditReceipt.cells
      .filter((cell) =>
        cell.artifactId === artifactId &&
        cell.surfaceId === "effective-codex-input-after-seeding"
      )
      .flatMap((cell) => cell.matchedFragmentSha256)
  ))].sort();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
