import type {
  MemoryCandidate,
  MemoryExtractionResult,
  MemoryExtractionStrategy,
} from "./candidates";
import { mergeExtractionSources } from "./classification";

function buildCandidateMergeKey(candidate: MemoryCandidate): string {
  return JSON.stringify({
    content: candidate.content.trim().toLowerCase(),
    explicitness: candidate.explicitness,
    kindHint: candidate.kindHint,
    metadata: candidate.metadata ?? null,
    sourceMessageIndex: candidate.sourceMessageIndex,
    sourceRole: candidate.sourceRole,
  });
}

function ensureUniqueCandidateId(
  candidate: MemoryCandidate,
  usedIds: Set<string>,
): MemoryCandidate {
  if (!usedIds.has(candidate.id)) {
    return candidate;
  }

  let suffix = 1;
  let nextId = `llm-${candidate.id}-${suffix}`;
  while (usedIds.has(nextId)) {
    suffix += 1;
    nextId = `llm-${candidate.id}-${suffix}`;
  }

  return {
    ...candidate,
    id: nextId,
  };
}

export function annotateExtractionResult(
  result: MemoryExtractionResult,
  source: MemoryExtractionStrategy,
): MemoryExtractionResult {
  return {
    ...result,
    candidates: result.candidates.map((candidate) => ({
      ...candidate,
      extractionSources: mergeExtractionSources(candidate.extractionSources, [source]),
    })),
  };
}

export function mergeExtractionResults(
  baseline: MemoryExtractionResult,
  assisted: MemoryExtractionResult,
): MemoryExtractionResult {
  const candidates = [...baseline.candidates];
  const usedIds = new Set(candidates.map((candidate) => candidate.id));
  const signatureToIndex = new Map(
    candidates.map((candidate, index) => [buildCandidateMergeKey(candidate), index] as const),
  );

  for (const candidate of assisted.candidates) {
    const signature = buildCandidateMergeKey(candidate);
    const existingIndex = signatureToIndex.get(signature);
    if (existingIndex !== undefined) {
      const existing = candidates[existingIndex]!;
      candidates[existingIndex] = {
        ...existing,
        extractionSources: mergeExtractionSources(
          existing.extractionSources,
          candidate.extractionSources,
        ),
      };
      continue;
    }

    const uniqueCandidate = ensureUniqueCandidateId(candidate, usedIds);
    usedIds.add(uniqueCandidate.id);
    signatureToIndex.set(signature, candidates.length);
    candidates.push(uniqueCandidate);
  }

  return {
    candidates,
    ignoredMessageCount: Math.max(
      baseline.ignoredMessageCount,
      assisted.ignoredMessageCount,
    ),
  };
}
