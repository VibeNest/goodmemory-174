import { createHash } from "node:crypto";

import {
  auditC4SurfaceHiddenArtifactMatrix,
} from "./c4-leakage";
import type {
  C4HiddenArtifact,
  C4LeakageMatrixAudit,
  C4LeakageMatrixCell,
  C4LeakageSurface,
} from "./c4-leakage";

export const C5_LIVE_LEAKAGE_SURFACE_IDS = [
  "effective-codex-input-after-seeding",
  "flat-summary-after-seeding",
  "goodmemory-export-after-seeding",
  "goodmemory-hook-context-after-seeding",
] as const;

export interface C5LiveLeakageAudit {
  auditSha256: string;
  fullMatrixAuditReceipt: C4LeakageMatrixAudit;
  fullMatrixAuditSha256: string;
  liveCells: C5LiveLeakageCell[];
  liveMatrixCellCount: number;
  liveOverlapCount: number;
  liveSurfaceReceipts: C5LiveSurfaceReceipt[];
  liveSurfaceIds: typeof C5_LIVE_LEAKAGE_SURFACE_IDS;
  schemaVersion: 5;
  staticOverlapCount: number;
  status: "accepted" | "rejected";
  trajectoryOriginAuditSha256: string;
  trajectoryOriginOverlapCount: number;
  trajectoryOrigins: C5TrajectoryOriginReceipt[];
  unexplainedLiveOverlapCount: number;
}

export interface C5LiveLeakageCell extends C4LeakageMatrixCell {
  originAttestedMatchSha256: string[];
  provenanceStatus: "accepted" | "rejected";
  unexplainedMatchSha256: string[];
}

export interface C5LiveSurfaceReceipt {
  contentSha256: string;
  hiddenValueSurfaceSha256: string;
  id: typeof C5_LIVE_LEAKAGE_SURFACE_IDS[number];
  utf8Bytes: number;
}

export interface C5TrajectoryOrigin {
  content: string;
  id: string;
}

export interface C5TrajectoryOriginReceipt {
  id: string;
  matrixAuditReceipt: C4LeakageMatrixAudit;
  sha256: string;
}

export function auditC5LiveLeakageSurfaces(input: {
  artifacts: readonly C4HiddenArtifact[];
  liveSurfaces: readonly C4LeakageSurface[];
  staticSurfaces: readonly C4LeakageSurface[];
  trajectoryOrigins: readonly C5TrajectoryOrigin[];
}): C5LiveLeakageAudit {
  const liveSurfaces = canonicalLiveSurfaces(input.liveSurfaces);
  const liveSurfaceReceipts = liveSurfaces.map(
    (surface): C5LiveSurfaceReceipt => ({
      contentSha256: sha256(surface.content),
      hiddenValueSurfaceSha256: sha256(JSON.stringify(
        semanticHiddenValueSurfaces(surface),
      )),
      id: surface.id,
      utf8Bytes: Buffer.byteLength(surface.content, "utf8"),
    }),
  );
  const trajectoryOrigins = canonicalTrajectoryOrigins(input.trajectoryOrigins);
  const matrix = auditC4SurfaceHiddenArtifactMatrix({
    artifacts: input.artifacts,
    surfaces: [...input.staticSurfaces, ...liveSurfaces],
  });
  const liveSurfaceIds = new Set<string>(C5_LIVE_LEAKAGE_SURFACE_IDS);
  const originMatches = collectTrajectoryOriginMatches({
    artifacts: input.artifacts,
    origins: trajectoryOrigins,
    staticSurfaces: input.staticSurfaces,
  });
  const liveCells = matrix.cells
    .filter((cell) => liveSurfaceIds.has(cell.surfaceId))
    .map((cell): C5LiveLeakageCell => {
      const attested = originMatches.byArtifact.get(cell.artifactId) ?? new Set();
      const originAttestedMatchSha256 = cell.matchedFragmentSha256.filter(
        (hash) => attested.has(hash),
      );
      const unexplainedMatchSha256 = cell.matchedFragmentSha256.filter(
        (hash) => !attested.has(hash),
      );
      return {
        ...cell,
        originAttestedMatchSha256,
        provenanceStatus:
          unexplainedMatchSha256.length === 0 ? "accepted" : "rejected",
        unexplainedMatchSha256,
      };
    });
  const staticOverlapCount = matrix.cells
    .filter((cell) => !liveSurfaceIds.has(cell.surfaceId))
    .reduce((count, cell) => count + cell.matchedFragmentSha256.length, 0);
  const liveOverlapCount = liveCells.reduce(
    (count, cell) => count + cell.matchedFragmentSha256.length,
    0,
  );
  const trajectoryOriginOverlapCount = liveCells.reduce(
    (count, cell) => count + cell.originAttestedMatchSha256.length,
    0,
  );
  const unexplainedLiveOverlapCount = liveCells.reduce(
    (count, cell) => count + cell.unexplainedMatchSha256.length,
    0,
  );
  const status =
    staticOverlapCount === 0 && unexplainedLiveOverlapCount === 0
      ? "accepted"
      : "rejected";
  const basis = {
    fullMatrixAuditReceipt: matrix,
    fullMatrixAuditSha256: matrix.auditSha256,
    liveCells,
    liveMatrixCellCount: liveCells.length,
    liveOverlapCount,
    liveSurfaceReceipts,
    liveSurfaceIds: C5_LIVE_LEAKAGE_SURFACE_IDS,
    schemaVersion: 5,
    staticOverlapCount,
    status,
    trajectoryOriginAuditSha256: originMatches.auditSha256,
    trajectoryOriginOverlapCount,
    trajectoryOrigins: originMatches.receipts,
    unexplainedLiveOverlapCount,
  } as const;
  return {
    ...basis,
    auditSha256: sha256(JSON.stringify(basis)),
  };
}

function canonicalTrajectoryOrigins(
  origins: readonly C5TrajectoryOrigin[],
): C5TrajectoryOrigin[] {
  const canonical = origins.map((origin) => ({
    content: origin.content,
    id: origin.id.trim(),
  })).sort((first, second) => first.id.localeCompare(second.id));
  if (canonical.some((origin) => origin.id.length === 0)) {
    throw new Error("C5 trajectory origin IDs must be non-empty");
  }
  if (new Set(canonical.map((origin) => origin.id)).size !== canonical.length) {
    throw new Error("C5 trajectory origin IDs must be unique");
  }
  return canonical;
}

function collectTrajectoryOriginMatches(input: {
  artifacts: readonly C4HiddenArtifact[];
  origins: readonly C5TrajectoryOrigin[];
  staticSurfaces: readonly C4LeakageSurface[];
}): {
  auditSha256: string;
  byArtifact: Map<C4HiddenArtifact["id"], Set<string>>;
  receipts: C5TrajectoryOriginReceipt[];
} {
  const byArtifact = new Map<C4HiddenArtifact["id"], Set<string>>();
  const receipts = input.origins.map((origin): C5TrajectoryOriginReceipt => {
    const originSurfaceId = C5_LIVE_LEAKAGE_SURFACE_IDS[0];
    const audit = auditC4SurfaceHiddenArtifactMatrix({
      artifacts: input.artifacts,
      surfaces: [
        ...input.staticSurfaces.map((surface) => ({
          content: "",
          id: surface.id,
        })),
        ...C5_LIVE_LEAKAGE_SURFACE_IDS.map((id): C4LeakageSurface => ({
          content: id === originSurfaceId ? origin.content : "",
          ...(id === originSurfaceId
            ? { hiddenValueContents: [origin.content] }
            : {}),
          id,
        })),
      ],
    });
    for (const cell of audit.cells) {
      if (cell.surfaceId !== originSurfaceId) {
        continue;
      }
      const matches = byArtifact.get(cell.artifactId) ?? new Set<string>();
      for (const hash of cell.matchedFragmentSha256) {
        matches.add(hash);
      }
      byArtifact.set(cell.artifactId, matches);
    }
    return {
      id: origin.id,
      matrixAuditReceipt: audit,
      sha256: sha256(origin.content),
    };
  });
  return {
    auditSha256: sha256(JSON.stringify(receipts)),
    byArtifact,
    receipts,
  };
}

function canonicalLiveSurfaces(
  surfaces: readonly C4LeakageSurface[],
): Array<C4LeakageSurface & {
  id: typeof C5_LIVE_LEAKAGE_SURFACE_IDS[number];
}> {
  const actual = surfaces.map((surface) => surface.id).sort();
  const expected = [...C5_LIVE_LEAKAGE_SURFACE_IDS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      "C5 live leakage surfaces must match the frozen four-surface contract",
    );
  }
  return C5_LIVE_LEAKAGE_SURFACE_IDS.map((id) => {
    const surface = surfaces.find((candidate) => candidate.id === id)!;
    return {
      content: surface.content,
      ...(surface.hiddenValueContents === undefined
        ? {}
        : { hiddenValueContents: [...surface.hiddenValueContents] }),
      id,
    };
  });
}

function semanticHiddenValueSurfaces(
  surface: C4LeakageSurface,
): readonly string[] {
  if (
    surface.hiddenValueContent !== undefined &&
    surface.hiddenValueContents !== undefined
  ) {
    throw new Error("C5 live leakage surface has conflicting hidden values");
  }
  return surface.hiddenValueContents ?? [
    surface.hiddenValueContent ?? surface.content,
  ];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
