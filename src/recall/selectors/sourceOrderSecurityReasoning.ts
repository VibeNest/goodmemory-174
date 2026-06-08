import type { RankedFactCandidate } from "../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import { sourceOrderSortKey } from "./temporal";

type SecurityFeatureCountReasoningFacet =
  | "accountLockout"
  | "passwordHashing"
  | "roleBasedAccessControl";

const SECURITY_FEATURE_COUNT_REASONING_FACETS = [
  "passwordHashing",
  "roleBasedAccessControl",
  "accountLockout",
] as const satisfies readonly SecurityFeatureCountReasoningFacet[];

export function isSourceOrderedSecurityFeatureCountReasoningQuery(
  query: string,
): boolean {
  return /\bhow\s+many\s+different\b/iu.test(query) &&
    /\b(?:roles?|user\s+roles?|security\s+features?)\b/iu.test(query) &&
    /\b(?:implement|implemented|trying\s+to\s+implement)\b/iu.test(query) &&
    /\b(?:across|sessions?|conversations?)\b/iu.test(query);
}

function securityFeatureCountReasoningFacet(
  entry: RankedFactCandidate,
): SecurityFeatureCountReasoningFacet | undefined {
  if (!hasUserAnswerTag(entry)) {
    return undefined;
  }

  const content = stripEvidencePrefix(entry.fact.content);

  if (
    /\b(?:password[_\s-]?hash|password\s+hashing|werkzeug\.security|generate_password_hash|check_password_hash)\b/iu.test(
      content,
    )
  ) {
    return "passwordHashing";
  }

  if (
    /\b(?:role[-\s]?based\s+access\s+control|rbac)\b/iu.test(content) &&
    /\broles?\b/iu.test(content)
  ) {
    return "roleBasedAccessControl";
  }

  if (
    /\baccount\s+lockout\b/iu.test(content) &&
    /\b(?:failed\s+login\s+attempts?|rate\s+limiting|redis)\b/iu.test(content)
  ) {
    return "accountLockout";
  }

  return undefined;
}

export function selectSourceOrderedSecurityFeatureCountReasoningEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isSourceOrderedSecurityFeatureCountReasoningQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    SecurityFeatureCountReasoningFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .map((entry) => ({
      entry,
      facet: securityFeatureCountReasoningFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: SecurityFeatureCountReasoningFacet;
      } => candidate.facet !== undefined,
    )
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left.entry) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right.entry) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return right.entry.lexicalScore - left.entry.lexicalScore;
    });

  for (const candidate of candidates) {
    if (!bestByFacet.has(candidate.facet)) {
      bestByFacet.set(candidate.facet, candidate.entry);
    }
  }

  if (
    SECURITY_FEATURE_COUNT_REASONING_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return SECURITY_FEATURE_COUNT_REASONING_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}
