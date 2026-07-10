import type { FactSelectionRoute } from "../contracts";

/**
 * First route in the primary order: a non-empty contradiction evidence pair
 * wins exclusively, and the winner claim makes the instruction/source-
 * preference augmenter stage yield (legacy contradictionPairSelected flag).
 * Eligibility is exactly "the pair is non-empty", so claiming on every win is
 * equivalent to the legacy behavior.
 */
export const contradictionPairRoute: FactSelectionRoute = {
  id: "contradiction_evidence_pair",
  isEligible({ ctx }) {
    return ctx.contradictionEvidencePair.length > 0;
  },
  select({ ctx }) {
    return {
      claimsContradictionPair: true,
      entries: ctx.contradictionEvidencePair,
    };
  },
};
