import { buildMemoryPacket } from "../recall/contextBuilder";
import { applyRerankingWithScores } from "../recall/reranker";
import type { Reranker } from "../recall/reranker";
import type { RecallRerankerTrace } from "../recall/retrievalTrace";
import type { RecallResult } from "./contracts";

export interface RerankerExecutionTarget {
  adapter: "custom" | "provider";
  gateway?: string;
  model?: string;
  provider?: string;
}

export function sanitizeRerankerGateway(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    url.hash = "";
    url.password = "";
    url.search = "";
    url.username = "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return undefined;
  }
}

export function withRerankerTrace(
  result: RecallResult,
  reranker: RecallRerankerTrace,
  policy?: "reranked" | "reranker_fallback",
): RecallResult {
  return {
    ...result,
    metadata: {
      ...result.metadata,
      ...(policy
        ? { policyApplied: [...new Set([...result.metadata.policyApplied, policy])] }
        : {}),
      retrievalTrace: {
        ...result.metadata.retrievalTrace,
        reranker,
        schemaVersion: 1,
      },
    },
  };
}

export function buildSkippedRerankerTrace(input: {
  candidateCount: number;
  reason: "disabled" | "insufficient_candidates";
  target: RerankerExecutionTarget;
}): RecallRerankerTrace {
  return {
    ...input.target,
    candidateCount: input.candidateCount,
    fallbackReason: input.reason,
    latencyMs: 0,
    role: "reranker",
    scores: [],
    status: "skipped",
  };
}

export function mergeDurableCandidateOrder(input: {
  factIdsAfter: readonly string[];
  factIdsBefore: readonly string[];
  originalOrder: readonly string[];
}): string[] {
  const factIdsBefore = new Set(input.factIdsBefore);
  let nextFact = 0;
  const merged = input.originalOrder.map((id) => {
    if (!factIdsBefore.has(id)) {
      return id;
    }
    const replacement = input.factIdsAfter[nextFact];
    nextFact += 1;
    return replacement ?? id;
  });
  merged.push(...input.factIdsAfter.slice(nextFact));
  return merged;
}

// Membership and abstention stay owned by deterministic recall. This stage only
// reorders selected facts, and provider failure returns the original result.
export async function applyFactRerankingToResult(input: {
  query: string;
  reranker: Reranker;
  result: RecallResult;
  target: RerankerExecutionTarget;
}): Promise<RecallResult> {
  const { query, reranker, result, target } = input;
  if (result.facts.length < 2) {
    return withRerankerTrace(
      result,
      buildSkippedRerankerTrace({
        candidateCount: result.facts.length,
        reason: "insufficient_candidates",
        target,
      }),
    );
  }
  const startedAt = Date.now();
  try {
    const outcome = await applyRerankingWithScores({
      items: result.facts,
      query,
      reranker,
      getText: (fact) => `${fact.content} ${fact.subject ?? ""}`,
    });
    const facts = outcome.items;
    const rankBefore = new Map(
      result.facts.map((fact, index) => [fact.id, index + 1] as const),
    );
    const rankAfter = new Map(
      facts.map((fact, index) => [fact.id, index + 1] as const),
    );
    const durableCandidateOrder = result.metadata.assistantInfluence?.rerankApplied
      ? mergeDurableCandidateOrder({
          factIdsAfter: facts.map((fact) => fact.id),
          factIdsBefore: result.facts.map((fact) => fact.id),
          originalOrder:
            result.metadata.assistantInfluence.rerankedCandidateIds,
        })
      : undefined;
    const packet = buildMemoryPacket({
      profile: result.profile,
      preferences: result.preferences,
      references: result.references,
      facts,
      feedback: result.feedback,
      archives: result.archives,
      evidence: result.evidence,
      episodes: result.episodes,
      workingMemory: result.workingMemory,
      journal: result.journal,
      durableCandidateOrder,
      locale: result.metadata.locale,
      routingDecision: result.metadata.routingDecision,
    });
    return withRerankerTrace(
      {
        ...result,
        facts,
        packet,
        metadata: {
          ...result.metadata,
          tokenCount: packet.debug?.estimatedTokens ?? result.metadata.tokenCount,
        },
      },
      {
        ...target,
        candidateCount: outcome.windowIds.length,
        latencyMs: Date.now() - startedAt,
        role: "reranker",
        scores: outcome.scores.map(({ id, score }) => ({
          evidenceType: "reranker",
          memoryId: id,
          rankAfter: rankAfter.get(id)!,
          rankBefore: rankBefore.get(id)!,
          score,
        })),
        status: "applied",
      },
      "reranked",
    );
  } catch (error) {
    console.error(
      "[goodmemory:reranker] reranking failed; preserving deterministic recall",
      {
        adapter: target.adapter,
        candidateCount: result.facts.length,
        error,
        model: target.model,
        provider: target.provider,
      },
    );
    return withRerankerTrace(
      result,
      {
        ...target,
        candidateCount: result.facts.length,
        fallbackReason:
          target.adapter === "provider" ? "provider_error" : "adapter_error",
        latencyMs: Date.now() - startedAt,
        role: "reranker",
        scores: [],
        status: "fallback",
      },
      "reranker_fallback",
    );
  }
}
