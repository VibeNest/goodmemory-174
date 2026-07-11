import { computeBm25Scores } from "./bm25";
import { extractEntityKeys } from "./entityExtraction";
import {
  isRecallProjectionSourceCollection,
} from "./projections/contracts";
import type {
  EntityProjection,
  RecallIndexDocument,
  RecallProjectionSourceCollection,
} from "./projections/contracts";

export type GeneralizedFusionChannel = "lexical" | "dense" | "entity";
export type GeneralizedFusionSourceCollection =
  | "facts"
  | "references"
  | "episodes"
  | "session_archives";

export interface DenseFusionCandidate {
  sourceCollection: RecallProjectionSourceCollection;
  sourceMemoryId: string;
  score: number;
}

export interface GeneralizedFusionChannelEvidence {
  evidenceDocumentIds: string[];
  rank: number;
  rawScore: number;
  rrfScore: number;
}

export interface GeneralizedFusionCandidate {
  sourceCollection: RecallProjectionSourceCollection;
  sourceMemoryId: string;
  score: number;
  evidenceStrength: number;
  channels: Partial<
    Record<GeneralizedFusionChannel, GeneralizedFusionChannelEvidence>
  >;
}

export interface GeneralizedFusionResult {
  budget: number;
  candidates: GeneralizedFusionCandidate[];
  rankedCandidates: GeneralizedFusionCandidate[];
}

export interface GeneralizedFusionInput {
  query: string;
  documents: readonly RecallIndexDocument[];
  entities: readonly EntityProjection[];
  denseCandidates?: readonly DenseFusionCandidate[];
  maxCandidates?: number;
  maxEntityMemoryFrequency?: number;
  minRelativeStrength?: number;
  referenceTime?: string;
  rrfK?: number;
  tokenize?: (text: string) => string[];
}

interface RawChannelCandidate {
  evidenceDocumentIds: string[];
  rawScore: number;
  sourceCollection: RecallProjectionSourceCollection;
  sourceMemoryId: string;
}

interface RankedChannelCandidate extends RawChannelCandidate {
  normalizedScore: number;
  rank: number;
}

export const DEFAULT_GENERALIZED_FUSION_RRF_K = 60;
const DEFAULT_MAX_CANDIDATES = 8;
export const DEFAULT_GENERALIZED_FUSION_MIN_RELATIVE_STRENGTH = 0.35;

function sourceKey(input: {
  sourceCollection: RecallProjectionSourceCollection;
  sourceMemoryId: string;
}): string {
  return `${input.sourceCollection}:${input.sourceMemoryId}`;
}

function parseSourceKey(value: string): {
  sourceCollection: RecallProjectionSourceCollection;
  sourceMemoryId: string;
} | null {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    return null;
  }
  const sourceCollection = value.slice(0, separator);
  if (!isRecallProjectionSourceCollection(sourceCollection)) {
    return null;
  }
  return {
    sourceCollection,
    sourceMemoryId: value.slice(separator + 1),
  };
}

function isDocumentTemporallyVisible(
  document: RecallIndexDocument,
  referenceTime: string | undefined,
): boolean {
  if (!referenceTime) {
    return true;
  }
  const reference = Date.parse(referenceTime);
  if (!Number.isFinite(reference)) {
    return true;
  }
  if (document.effectiveFrom) {
    const startsAt = Date.parse(document.effectiveFrom);
    if (Number.isFinite(startsAt) && startsAt > reference) {
      return false;
    }
  }
  if (document.effectiveUntil) {
    const endsAt = Date.parse(document.effectiveUntil);
    if (Number.isFinite(endsAt) && endsAt <= reference) {
      return false;
    }
  }
  return true;
}

function hasTemporalConstraint(referenceTime: string | undefined): boolean {
  return referenceTime !== undefined && Number.isFinite(Date.parse(referenceTime));
}

function buildVisibleSourceKeys(input: GeneralizedFusionInput): Set<string> {
  return new Set(
    input.documents
      .filter((document) =>
        isDocumentTemporallyVisible(document, input.referenceTime),
      )
      .map(sourceKey),
  );
}

function rankChannel(
  candidates: readonly RawChannelCandidate[],
): RankedChannelCandidate[] {
  const ordered = [...candidates]
    .filter(
      (candidate) =>
        Number.isFinite(candidate.rawScore) && candidate.rawScore > 0,
    )
    .sort(
      (left, right) =>
        right.rawScore - left.rawScore ||
        sourceKey(left).localeCompare(sourceKey(right)),
    );
  const maxScore = ordered[0]?.rawScore ?? 0;
  return ordered.map((candidate, index) => ({
    ...candidate,
    normalizedScore: maxScore > 0 ? candidate.rawScore / maxScore : 0,
    rank: index + 1,
  }));
}

function buildLexicalChannel(input: GeneralizedFusionInput): RankedChannelCandidate[] {
  const visibleDocuments = input.documents.filter((document) =>
    isDocumentTemporallyVisible(document, input.referenceTime),
  );
  const scores = computeBm25Scores(
    input.query,
    visibleDocuments.map((document) => ({
      id: document.id,
      text: document.text,
    })),
    input.tokenize ? { tokenize: input.tokenize } : undefined,
  );
  const grouped = new Map<
    string,
    RawChannelCandidate & { scoredDocuments: Array<{ id: string; score: number }> }
  >();
  for (const document of visibleDocuments) {
    const score = scores.get(document.id) ?? 0;
    if (score <= 0) {
      continue;
    }
    const key = sourceKey(document);
    const existing = grouped.get(key);
    if (existing) {
      existing.rawScore = Math.max(existing.rawScore, score);
      existing.scoredDocuments.push({ id: document.id, score });
      continue;
    }
    grouped.set(key, {
      sourceCollection: document.sourceCollection,
      sourceMemoryId: document.sourceMemoryId,
      rawScore: score,
      evidenceDocumentIds: [],
      scoredDocuments: [{ id: document.id, score }],
    });
  }
  return rankChannel(
    [...grouped.values()].map((candidate) => ({
      sourceCollection: candidate.sourceCollection,
      sourceMemoryId: candidate.sourceMemoryId,
      rawScore: candidate.rawScore,
      evidenceDocumentIds: candidate.scoredDocuments
        .sort(
          (left, right) =>
            right.score - left.score || left.id.localeCompare(right.id),
        )
        .slice(0, 3)
        .map((document) => document.id),
    })),
  );
}

function buildDenseChannel(
  input: GeneralizedFusionInput,
  visibleSourceKeys: ReadonlySet<string>,
): RankedChannelCandidate[] {
  const grouped = new Map<string, RawChannelCandidate>();
  for (const candidate of input.denseCandidates ?? []) {
    if (!Number.isFinite(candidate.score) || candidate.score <= 0) {
      continue;
    }
    const key = sourceKey(candidate);
    if (hasTemporalConstraint(input.referenceTime) && !visibleSourceKeys.has(key)) {
      continue;
    }
    const existing = grouped.get(key);
    if (existing && existing.rawScore >= candidate.score) {
      continue;
    }
    grouped.set(key, {
      sourceCollection: candidate.sourceCollection,
      sourceMemoryId: candidate.sourceMemoryId,
      rawScore: candidate.score,
      evidenceDocumentIds: [],
    });
  }
  return rankChannel([...grouped.values()]);
}

function normalizeEntityValue(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function queryContainsAlias(normalizedQuery: string, alias: string): boolean {
  const normalizedAlias = normalizeEntityValue(alias);
  if (normalizedAlias.length < 2) {
    return false;
  }
  const queryTokens = normalizedQuery
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const aliasTokens = normalizedAlias
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (aliasTokens.length === 0) {
    return false;
  }
  if (aliasTokens.length === 1) {
    return queryTokens.includes(aliasTokens[0]!);
  }
  return queryTokens.some((_, start) =>
    aliasTokens.every(
      (token, offset) => queryTokens[start + offset] === token,
    ),
  );
}

function buildEntityChannel(
  input: GeneralizedFusionInput,
  visibleSourceKeys: ReadonlySet<string>,
): RankedChannelCandidate[] {
  const normalizedQuery = normalizeEntityValue(input.query);
  const queryEntityKeys = extractEntityKeys(input.query);
  const temporalConstraint = hasTemporalConstraint(input.referenceTime);
  const sourceMemoryCount = temporalConstraint
    ? visibleSourceKeys.size
    : new Set(input.documents.map(sourceKey)).size;
  const maxEntityMemoryFrequency = Math.max(
    1,
    Math.floor(
      input.maxEntityMemoryFrequency ??
        Math.max(2, Math.ceil(Math.sqrt(Math.max(1, sourceMemoryCount)))),
    ),
  );
  const matchedEntities = input.entities
    .map((entity) => ({
      ...entity,
      memoryIds: temporalConstraint
        ? entity.memoryIds.filter((memoryId) => visibleSourceKeys.has(memoryId))
        : entity.memoryIds,
    }))
    .filter(
      (entity) =>
        entity.memoryIds.length > 0 &&
        entity.memoryIds.length <= maxEntityMemoryFrequency &&
        (queryEntityKeys.has(entity.canonicalKey) ||
          queryContainsAlias(normalizedQuery, entity.canonicalKey) ||
          entity.aliases.some((alias) =>
            queryContainsAlias(normalizedQuery, alias),
          )),
    );
  if (matchedEntities.length === 0) {
    return [];
  }
  const descriptionScores = computeBm25Scores(
    input.query,
    matchedEntities.map((entity) => ({
      id: entity.id,
      text: [entity.canonicalKey, ...entity.aliases, entity.description ?? ""].join(
        " ",
      ),
    })),
    input.tokenize ? { tokenize: input.tokenize } : undefined,
  );
  const grouped = new Map<string, RawChannelCandidate>();
  for (const entity of matchedEntities) {
    const rarity = 1 / Math.max(1, entity.memoryIds.length);
    const entityScore = rarity * (1 + (descriptionScores.get(entity.id) ?? 0) * 0.25);
    for (const memoryId of entity.memoryIds) {
      const source = parseSourceKey(memoryId);
      if (!source) {
        continue;
      }
      const key = sourceKey(source);
      const existing = grouped.get(key);
      if (existing) {
        existing.rawScore += entityScore;
        existing.evidenceDocumentIds.push(entity.id);
      } else {
        grouped.set(key, {
          ...source,
          rawScore: entityScore,
          evidenceDocumentIds: [entity.id],
        });
      }
    }
  }
  return rankChannel(
    [...grouped.values()].map((candidate) => ({
      ...candidate,
      evidenceDocumentIds: [...new Set(candidate.evidenceDocumentIds)].sort(),
    })),
  );
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function computeEvidenceStrength(
  channels: GeneralizedFusionCandidate["channels"],
): number {
  let inverse = 1;
  for (const channel of Object.values(channels)) {
    inverse *= 1 - clampUnit(channel.rawScore);
  }
  return 1 - inverse;
}

export function selectDynamicFusionBudget(
  ranked: readonly GeneralizedFusionCandidate[],
  options?: {
    maxCandidates?: number;
    minCandidates?: number;
    minRelativeStrength?: number;
  },
): GeneralizedFusionCandidate[] {
  if (ranked.length === 0) {
    return [];
  }
  const maxCandidates = Math.max(
    0,
    Math.floor(options?.maxCandidates ?? DEFAULT_MAX_CANDIDATES),
  );
  if (maxCandidates === 0) {
    return [];
  }
  const minCandidates = Math.min(
    maxCandidates,
    Math.max(1, Math.floor(options?.minCandidates ?? 1)),
  );
  const minRelativeStrength = clampUnit(
    options?.minRelativeStrength ??
      DEFAULT_GENERALIZED_FUSION_MIN_RELATIVE_STRENGTH,
  );
  const strongest = Math.max(...ranked.map((candidate) => candidate.evidenceStrength));
  const threshold = strongest * minRelativeStrength;
  const qualified = ranked.filter(
    (candidate) => candidate.evidenceStrength + Number.EPSILON >= threshold,
  );
  const budget = Math.min(
    maxCandidates,
    Math.max(minCandidates, qualified.length),
  );
  if (qualified.length >= minCandidates) {
    return qualified.slice(0, budget);
  }
  return [...ranked].slice(0, budget);
}

export function fuseGeneralizedRecallCandidates(
  input: GeneralizedFusionInput,
): GeneralizedFusionResult {
  const rrfK = Math.max(1, input.rrfK ?? DEFAULT_GENERALIZED_FUSION_RRF_K);
  const visibleSourceKeys = buildVisibleSourceKeys(input);
  const channels: Array<{
    name: GeneralizedFusionChannel;
    candidates: RankedChannelCandidate[];
  }> = [
    { name: "lexical", candidates: buildLexicalChannel(input) },
    { name: "dense", candidates: buildDenseChannel(input, visibleSourceKeys) },
    { name: "entity", candidates: buildEntityChannel(input, visibleSourceKeys) },
  ];
  const fused = new Map<string, GeneralizedFusionCandidate>();
  for (const channel of channels) {
    for (const candidate of channel.candidates) {
      const key = sourceKey(candidate);
      const rrfScore = 1 / (rrfK + candidate.rank);
      const existing = fused.get(key) ?? {
        sourceCollection: candidate.sourceCollection,
        sourceMemoryId: candidate.sourceMemoryId,
        score: 0,
        evidenceStrength: 0,
        channels: {},
      };
      existing.score += rrfScore;
      existing.channels[channel.name] = {
        evidenceDocumentIds: candidate.evidenceDocumentIds,
        rank: candidate.rank,
        rawScore: candidate.normalizedScore,
        rrfScore,
      };
      fused.set(key, existing);
    }
  }
  const rankedCandidates = [...fused.values()]
    .map((candidate) => ({
      ...candidate,
      evidenceStrength: computeEvidenceStrength(candidate.channels),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.evidenceStrength - left.evidenceStrength ||
        sourceKey(left).localeCompare(sourceKey(right)),
    );
  const candidates = selectDynamicFusionBudget(rankedCandidates, {
    maxCandidates: input.maxCandidates,
    minRelativeStrength: input.minRelativeStrength,
  });
  return {
    budget: candidates.length,
    candidates,
    rankedCandidates,
  };
}
