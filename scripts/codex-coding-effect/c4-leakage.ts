import { createHash } from "node:crypto";

export const C4_LEAKAGE_SURFACE_IDS = [
  "allowed-feedback",
  "effective-codex-input-after-seeding",
  "flat-summary-after-seeding",
  "frozen-prehistory",
  "goodmemory-export-after-seeding",
  "goodmemory-hook-context-after-seeding",
  "repository-instructions",
  "stage-prompts",
  "visible-repository-files",
] as const;

export const C4_HIDDEN_ARTIFACT_IDS = [
  "expected-changed-files",
  "gold-patches",
  "hidden-test-source",
] as const;

export type C4LeakageSurfaceId =
  typeof C4_LEAKAGE_SURFACE_IDS[number];
export type C4HiddenArtifactId =
  typeof C4_HIDDEN_ARTIFACT_IDS[number];

export interface C4LeakageSurface {
  content: string;
  hiddenValueContent?: string;
  id: C4LeakageSurfaceId;
}

export interface C4HiddenArtifact {
  allowedPublicFragments?: readonly string[];
  content: string;
  fragments: readonly string[];
  hiddenValueRelations?: readonly (readonly C4HiddenValue[])[];
  hiddenValues?: readonly C4HiddenValue[];
  id: C4HiddenArtifactId;
}

export type C4HiddenValue = string | number | boolean | null;

export interface C4LeakageMatrixCell {
  artifactId: C4HiddenArtifactId;
  artifactSha256: string;
  allowedPublicContractCount: number;
  allowedPublicFragmentSha256: string[];
  candidateFragmentCount: number;
  candidateFragmentSetSha256: string;
  exactOverlapCount: number;
  hiddenValueCount: number;
  hiddenValueRelationCount: number;
  hiddenValueRelationSetSha256: string;
  hiddenValueSetSha256: string;
  hiddenValueSurfaceSha256: string;
  matchedFragmentSha256: string[];
  normalizedOverlapCount: number;
  status: "accepted" | "rejected";
  surfaceId: C4LeakageSurfaceId;
  surfaceSha256: string;
}

export interface C4LeakageMatrixAudit {
  artifactIds: readonly C4HiddenArtifactId[];
  auditSha256: string;
  candidateBindingVersion: 1;
  candidateExtractionVersion:
    "semantic-lines-complete-cases-plus-typed-relations-v5";
  cells: C4LeakageMatrixCell[];
  normalizationVersion: "nfkc-lowercase-whitespace-numeric-equivalence-v3";
  overlapCount: number;
  schemaVersion: 1;
  status: "accepted" | "rejected";
  surfaceIds: readonly C4LeakageSurfaceId[];
}

export interface C4LeakageMutationCell {
  applicability: "applicable" | "not-applicable-no-secret-candidate";
  artifactId: C4HiddenArtifactId;
  candidateKind: "fragment" | "hidden-value" | "hidden-value-relation";
  injectedCandidateSha256: string | null;
  surfaceId: C4LeakageSurfaceId;
  targetCellRejected: boolean | null;
}

export interface C4LeakageMutationAudit {
  applicableCellCount: number;
  auditSha256: string;
  cells: C4LeakageMutationCell[];
  matrixCellCount: number;
  mutationCellCount: number;
  notApplicableCellCount: number;
  schemaVersion: 1;
  status: "accepted";
}

export function auditC4SurfaceHiddenArtifactMatrix(input: {
  artifacts: readonly C4HiddenArtifact[];
  surfaces: readonly C4LeakageSurface[];
}): C4LeakageMatrixAudit {
  assertExactIds(
    input.surfaces.map((surface) => surface.id),
    C4_LEAKAGE_SURFACE_IDS,
    "surface",
  );
  assertExactIds(
    input.artifacts.map((artifact) => artifact.id),
    C4_HIDDEN_ARTIFACT_IDS,
    "hidden artifact",
  );

  const cells = [...input.surfaces]
    .sort((first, second) => first.id.localeCompare(second.id))
    .flatMap((surface) =>
      [...input.artifacts]
        .sort((first, second) => first.id.localeCompare(second.id))
        .map((artifact) => auditCell(surface, artifact))
    );
  const overlapCount = cells.reduce(
    (total, cell) =>
      total + cell.exactOverlapCount + cell.normalizedOverlapCount,
    0,
  );
  const basis = {
    artifactIds: [...C4_HIDDEN_ARTIFACT_IDS],
    candidateBindingVersion: 1,
    candidateExtractionVersion:
      "semantic-lines-complete-cases-plus-typed-relations-v5",
    cells,
    normalizationVersion: "nfkc-lowercase-whitespace-numeric-equivalence-v3",
    overlapCount,
    schemaVersion: 1,
    status: overlapCount === 0 ? "accepted" : "rejected",
    surfaceIds: [...C4_LEAKAGE_SURFACE_IDS],
  } as const;
  return {
    ...basis,
    auditSha256: sha256(JSON.stringify(basis)),
  };
}

export function mutationTestC4SurfaceHiddenArtifactMatrix(input: {
  artifacts: readonly C4HiddenArtifact[];
  surfaces: readonly C4LeakageSurface[];
}): C4LeakageMutationAudit {
  const clean = auditC4SurfaceHiddenArtifactMatrix(input);
  if (clean.status !== "accepted") {
    throw new Error("C4 leakage mutation test requires a clean matrix");
  }
  const artifacts = new Map(input.artifacts.map((artifact) => [
    artifact.id,
    artifact,
  ]));
  const cells = clean.cells.flatMap((cell) => {
    const artifact = artifacts.get(cell.artifactId);
    if (artifact === undefined) {
      throw new Error(`missing C4 hidden artifact ${cell.artifactId}`);
    }
    return ([
      ["fragment", artifact.fragments.find((fragment) => fragment.length > 0)],
      ["hidden-value", artifact.hiddenValues?.[0]],
      ["hidden-value-relation", artifact.hiddenValueRelations?.[0]],
    ] as const).map(([candidateKind, candidate]): C4LeakageMutationCell => {
      if (candidate === undefined) {
        return {
          applicability: "not-applicable-no-secret-candidate",
          artifactId: cell.artifactId,
          candidateKind,
          injectedCandidateSha256: null,
          surfaceId: cell.surfaceId,
          targetCellRejected: null,
        };
      }
      const injection = candidateKind === "fragment"
        ? candidate
        : candidateKind === "hidden-value"
        ? renderHiddenValue(candidate)
        : candidate.map(renderHiddenValue).join(" | ");
      const mutated = input.surfaces.map((surface) => {
        if (surface.id !== cell.surfaceId) {
          return surface;
        }
        if (candidateKind === "fragment") {
          return {
            ...surface,
            content: `${surface.content}\n${injection}\n`,
          };
        }
        return {
          ...surface,
          hiddenValueContent:
            `${surface.hiddenValueContent ?? surface.content}\n${injection}\n`,
        };
      });
      const mutation = auditC4SurfaceHiddenArtifactMatrix({
        artifacts: input.artifacts,
        surfaces: mutated,
      });
      const target = mutation.cells.find((candidateCell) =>
        candidateCell.surfaceId === cell.surfaceId &&
        candidateCell.artifactId === cell.artifactId
      );
      if (target?.status !== "rejected") {
        throw new Error(
          `C4 leakage mutation escaped at ${cell.surfaceId}/${cell.artifactId}/${candidateKind}`,
        );
      }
      return {
        applicability: "applicable",
        artifactId: cell.artifactId,
        candidateKind,
        injectedCandidateSha256: sha256(JSON.stringify({
          candidate,
          candidateKind,
        })),
        surfaceId: cell.surfaceId,
        targetCellRejected: true,
      };
    });
  });
  const applicableCellCount = cells.filter((cell) =>
    cell.applicability === "applicable"
  ).length;
  const basis = {
    applicableCellCount,
    cells,
    matrixCellCount: clean.cells.length,
    mutationCellCount: cells.length,
    notApplicableCellCount: cells.length - applicableCellCount,
    schemaVersion: 1,
    status: "accepted",
  } as const;
  return {
    ...basis,
    auditSha256: sha256(JSON.stringify(basis)),
  };
}

function auditCell(
  surface: C4LeakageSurface,
  artifact: C4HiddenArtifact,
): C4LeakageMatrixCell {
  const normalizedSurface = normalizeLeakageText(surface.content);
  const hiddenValueSurface = surface.hiddenValueContent ?? surface.content;
  const fragments = [...new Set([
    artifact.content,
    ...artifact.fragments,
  ].filter((fragment) => fragment.length > 0))].sort();
  const hiddenValues = canonicalHiddenValues(artifact.hiddenValues ?? []);
  const hiddenValueRelations = canonicalHiddenValueRelations(
    artifact.hiddenValueRelations ?? [],
  );
  const exact = new Set<string>();
  const normalized = new Set<string>();
  const allowedPublic = new Set<string>();
  for (const fragment of artifact.allowedPublicFragments ?? []) {
    if (
      surface.content.includes(fragment) ||
      normalizedSurface.includes(normalizeLeakageText(fragment))
    ) {
      allowedPublic.add(sha256(fragment));
    }
  }
  for (const fragment of fragments) {
    const fragmentSha256 = sha256(fragment);
    if (surface.content.includes(fragment)) {
      exact.add(fragmentSha256);
      continue;
    }
    const normalizedFragment = normalizeLeakageText(fragment);
    if (
      normalizedFragment.length > 0 &&
      normalizedSurface.includes(normalizedFragment)
    ) {
      normalized.add(fragmentSha256);
    }
  }
  for (const value of hiddenValues) {
    const match = matchHiddenValue(hiddenValueSurface, value);
    if (match === null) {
      continue;
    }
    const valueSha256 = sha256(JSON.stringify({
      type: value === null ? "null" : typeof value,
      value,
    }));
    (match === "exact" ? exact : normalized).add(valueSha256);
  }
  for (const relation of hiddenValueRelations) {
    const match = matchHiddenValueRelation(hiddenValueSurface, relation);
    if (match === null) {
      continue;
    }
    const relationSha256 = sha256(JSON.stringify({
      type: "relation",
      values: relation.map(canonicalHiddenValue),
    }));
    (match === "exact" ? exact : normalized).add(relationSha256);
  }
  const matchedFragmentSha256 = [...exact, ...normalized].sort();
  return {
    artifactId: artifact.id,
    artifactSha256: sha256(artifact.content),
    allowedPublicContractCount: allowedPublic.size,
    allowedPublicFragmentSha256: [...allowedPublic].sort(),
    candidateFragmentCount: fragments.length,
    candidateFragmentSetSha256: sha256(JSON.stringify(fragments)),
    exactOverlapCount: exact.size,
    hiddenValueCount: hiddenValues.length,
    hiddenValueRelationCount: hiddenValueRelations.length,
    hiddenValueRelationSetSha256: sha256(JSON.stringify(
      hiddenValueRelations.map((relation) =>
        relation.map(canonicalHiddenValue)
      ),
    )),
    hiddenValueSetSha256: sha256(JSON.stringify(hiddenValues.map(
      canonicalHiddenValue,
    ))),
    hiddenValueSurfaceSha256: sha256(hiddenValueSurface),
    matchedFragmentSha256,
    normalizedOverlapCount: normalized.size,
    status: matchedFragmentSha256.length === 0 ? "accepted" : "rejected",
    surfaceId: surface.id,
    surfaceSha256: sha256(surface.content),
  };
}

function canonicalHiddenValues(
  values: readonly C4HiddenValue[],
): C4HiddenValue[] {
  return [...new Map(values.map((value) => [
    JSON.stringify(canonicalHiddenValue(value)),
    value,
  ])).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

function canonicalHiddenValueRelations(
  relations: readonly (readonly C4HiddenValue[])[],
): C4HiddenValue[][] {
  const canonical = new Map<string, C4HiddenValue[]>();
  for (const relation of relations) {
    const values = [...new Map(relation.map((value) => [
      relationValueKey(value),
      value,
    ])).values()];
    if (values.length < 2) {
      continue;
    }
    const key = JSON.stringify(values.map(canonicalHiddenValue));
    canonical.set(key, values);
  }
  return [...canonical.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, relation]) => relation);
}

function canonicalHiddenValue(value: C4HiddenValue): {
  type: "boolean" | "null" | "number" | "string";
  value: C4HiddenValue;
} {
  const type = value === null
    ? "null"
    : typeof value === "boolean"
    ? "boolean"
    : typeof value === "number"
    ? "number"
    : "string";
  return {
    type,
    value,
  };
}

export function c4HiddenValueAppearsInSurface(
  surface: string,
  value: C4HiddenValue,
): boolean {
  return matchHiddenValue(surface, value) !== null;
}

export function c4HiddenValueRelationAppearsInSurface(
  surface: string,
  relation: readonly C4HiddenValue[],
): boolean {
  return matchHiddenValueRelation(surface, relation) !== null;
}

function matchHiddenValue(
  surface: string,
  value: C4HiddenValue,
): "exact" | "normalized" | null {
  const fragment = value === null ? "null" : String(value);
  if (containsDelimited(surface, fragment)) {
    return "exact";
  }
  if (typeof value === "number" && containsEquivalentNumber(surface, value)) {
    return "normalized";
  }
  const normalizedSurface = normalizeLeakageText(surface);
  return containsDelimited(
      normalizedSurface,
      normalizeLeakageText(fragment),
    )
    ? "normalized"
    : null;
}

function matchHiddenValueRelation(
  surface: string,
  relation: readonly C4HiddenValue[],
): "exact" | "normalized" | null {
  for (const segment of relationSegments(surface)) {
    const matches = relation.map((value) => matchHiddenValue(segment, value));
    if (matches.every((match) => match !== null)) {
      return matches.every((match) => match === "exact")
        ? "exact"
        : "normalized";
    }
  }
  return null;
}

function relationSegments(surface: string): string[] {
  const segments = new Set<string>();
  for (const paragraph of surface.split(/\r?\n\s*\r?\n/u)) {
    const lines = paragraph.split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const [start] of lines.entries()) {
      for (
        let end = start + 1;
        end <= Math.min(lines.length, start + 4);
        end += 1
      ) {
        const segment = lines.slice(start, end).join("\n");
        if (segment.length <= 512) {
          segments.add(segment);
        }
      }
    }
  }
  return [...segments];
}

function containsEquivalentNumber(surface: string, value: number): boolean {
  for (const match of surface.matchAll(
    /(?<![\p{L}\p{N}_])[-+]?(?:(?:\d{1,3}(?:,\d{3})+)|(?:\d(?:[\d_]*\d)?))(?:\.(?:\d(?:[\d_]*\d)?))?(?:[eE][-+]?\d(?:[\d_]*\d)?)?(?![\p{L}\p{N}_])/gu,
  )) {
    const candidate = Number(match[0].replaceAll(",", "").replaceAll("_", ""));
    if (Number.isFinite(candidate) && candidate === value) {
      return true;
    }
  }
  return false;
}

function relationValueKey(value: C4HiddenValue): string {
  return JSON.stringify({
    type: value === null ? "null" : typeof value,
    value: typeof value === "string" ? normalizeLeakageText(value) : value,
  });
}

function renderHiddenValue(value: C4HiddenValue): string {
  return value === null ? "null" : String(value);
}

function containsDelimited(surface: string, fragment: string): boolean {
  if (fragment.length === 0) {
    return false;
  }
  let offset = surface.indexOf(fragment);
  while (offset >= 0) {
    const before = offset === 0 ? undefined : surface[offset - 1];
    const afterIndex = offset + fragment.length;
    const after = afterIndex === surface.length
      ? undefined
      : surface[afterIndex];
    if (
      boundaryAllows(fragment[0], before) &&
      boundaryAllows(fragment[fragment.length - 1], after)
    ) {
      return true;
    }
    offset = surface.indexOf(fragment, offset + 1);
  }
  return false;
}

function boundaryAllows(
  fragmentEdge: string | undefined,
  neighboringSurfaceCharacter: string | undefined,
): boolean {
  return fragmentEdge === undefined ||
    neighboringSurfaceCharacter === undefined ||
    !isTokenCharacter(fragmentEdge) ||
    !isTokenCharacter(neighboringSurfaceCharacter);
}

function isTokenCharacter(value: string): boolean {
  return /[\p{L}\p{N}_]/u.test(value);
}

function assertExactIds<T extends string>(
  actual: readonly T[],
  expected: readonly T[],
  label: string,
): void {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  if (
    new Set(actual).size !== actual.length ||
    JSON.stringify(sortedActual) !== JSON.stringify(sortedExpected)
  ) {
    throw new Error(`C4 leakage matrix requires every ${label} exactly once`);
  }
}

function normalizeLeakageText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(
    /\s+/gu,
    " ",
  ).trim();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
