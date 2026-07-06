import type { RecallResult } from "../api/contracts";

// Relevance gate for per-prompt hook injection (promptInjection:
// "relevance_gated"). A prompt-submit recall is worth injecting only when it
// carries query-specific signal; continuity-only surfaces (working memory,
// journal) were already delivered by the session-start brief. Pure and
// conservative: any positive signal injects, so false negatives are bounded
// by the session-start brief plus the "always" escape hatch.

export type PromptInjectionGateReason =
  | "continuity_only"
  | "guidance_match"
  | "lexical_hit"
  | "semantic_hit"
  | "slot_match";

export interface PromptInjectionGateDecision {
  inject: boolean;
  reason: PromptInjectionGateReason;
}

export function shouldInjectPromptContext(
  recall: RecallResult,
): PromptInjectionGateDecision {
  const returnedTraces = recall.metadata.candidateTraces.filter(
    (trace) => trace.returned,
  );
  if (returnedTraces.some((trace) => trace.lexicalScore > 0)) {
    return { inject: true, reason: "lexical_hit" };
  }
  if (returnedTraces.some((trace) => trace.semanticScore !== undefined)) {
    return { inject: true, reason: "semantic_hit" };
  }
  // Feedback and preferences are query-selected upstream, so their presence
  // is itself a relevance signal.
  if (recall.feedback.length > 0 || recall.preferences.length > 0) {
    return { inject: true, reason: "guidance_match" };
  }
  if (recall.metadata.routingDecision.requestedSlots.length > 0) {
    return { inject: true, reason: "slot_match" };
  }
  return { inject: false, reason: "continuity_only" };
}
