import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { sourceOrderSortKey } from "../temporal";

type PeerFeedbackBalanceReasoningFacet =
  | "josephPeerReviewStart"
  | "peerReviewGroupExpansion"
  | "structuredSessionsSummary"
  | "amyZoomMomentum"
  | "dialogueClarityGuidance"
  | "editingToolsPlan"
  | "feedbackLoopGuidance"
  | "betaReaderCritiques"
  | "feedbackVisionBalanceGuidance"
  | "feedbackCategorization"
  | "feedbackSummaryGuidance";

const PEER_FEEDBACK_BALANCE_REASONING_FACETS = [
  "josephPeerReviewStart",
  "peerReviewGroupExpansion",
  "structuredSessionsSummary",
  "amyZoomMomentum",
  "dialogueClarityGuidance",
  "editingToolsPlan",
  "feedbackLoopGuidance",
  "betaReaderCritiques",
  "feedbackVisionBalanceGuidance",
  "feedbackCategorization",
  "feedbackSummaryGuidance",
] as const satisfies readonly PeerFeedbackBalanceReasoningFacet[];

export const isPeerFeedbackBalanceReasoningQuery = narrowGate(
  "reasoning.peerFeedbackBalance",
  (query: string): boolean => {
  return /\bJoseph'?s peer reviews\b/iu.test(query) &&
    /\bAmy'?s Zoom sessions\b/iu.test(query) &&
    /\bbeta readers\b/iu.test(query) &&
    /\bbalanc\w* external feedback\b/iu.test(query) &&
    /\bmy own vision\b/iu.test(query);
  },
);

const USER_FACET_PATTERNS = {
  josephPeerReviewStart: [
    /^(?=[\s\S]*\bJoseph, a fellow producer\b)(?=[\s\S]*\bpeer review sessions starting Feb 20\b)(?=[\s\S]*\bimproved my drafts by 15%)/iu,
  ],
  peerReviewGroupExpansion: [
    /^(?=[\s\S]*\bexpanding the peer review group\b)(?=[\s\S]*\bmore diverse feedback\b)/iu,
  ],
  amyZoomMomentum: [
    /^(?=[\s\S]*\bAmy suggested a Zoom peer review on April 5\b)(?=[\s\S]*\b25% improvement in dialogue clarity\b)/iu,
  ],
  editingToolsPlan: [
    /^(?=[\s\S]*\bpeer reviews with Amy\b)(?=[\s\S]*\bstick with Grammarly and Hemingway\b)/iu,
  ],
  betaReaderCritiques: [
    /^(?=[\s\S]*\b5 detailed critiques from Joseph's beta readers by May 30\b)(?=[\s\S]*\bmy own vision\b)/iu,
  ],
  feedbackCategorization: [
    /^(?=[\s\S]*\bcategorizing the feedback first\b)(?=[\s\S]*\btone inconsistencies\b)/iu,
  ],
} as const satisfies Partial<
  Record<PeerFeedbackBalanceReasoningFacet, readonly RegExp[]>
>;

const ASSISTANT_FACET_PATTERNS = {
  structuredSessionsSummary: [
    /^(?=[\s\S]*\bStructured Peer Review Sessions\b)(?=[\s\S]*\bgradually expanding your peer review group\b)/iu,
  ],
  dialogueClarityGuidance: [
    /^(?=[\s\S]*\bimprovements in your dialogue clarity through peer reviews\b)(?=[\s\S]*\bRegular Peer Reviews\b)/iu,
  ],
  feedbackLoopGuidance: [
    /^(?=[\s\S]*\bConsistent Feedback Loop\b)(?=[\s\S]*\bschedule regular peer review sessions with A)/iu,
  ],
  feedbackVisionBalanceGuidance: [
    /^(?=[\s\S]*\bdetailed critiques from Joseph's beta readers\b)(?=[\s\S]*\bBalancing external feedback with your own vision\b)/iu,
  ],
  feedbackSummaryGuidance: [
    /^(?=[\s\S]*\bCreate a Feedback Summary\b)(?=[\s\S]*\bmajor issues identified by multiple readers\b)/iu,
  ],
} as const satisfies Partial<
  Record<PeerFeedbackBalanceReasoningFacet, readonly RegExp[]>
>;

function peerFeedbackBalanceReasoningFacet(
  entry: RankedFactCandidate,
): PeerFeedbackBalanceReasoningFacet | undefined {
  const content = stripEvidencePrefix(entry.fact.content);

  if (hasUserAnswerTag(entry)) {
    for (const [facet, patterns] of Object.entries(USER_FACET_PATTERNS)) {
      if (patterns.some((pattern) => pattern.test(content))) {
        return facet as PeerFeedbackBalanceReasoningFacet;
      }
    }
    return undefined;
  }

  if (!hasAssistantAnswerTag(entry)) {
    return undefined;
  }
  for (const [facet, patterns] of Object.entries(ASSISTANT_FACET_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(content))) {
      return facet as PeerFeedbackBalanceReasoningFacet;
    }
  }
  return undefined;
}

export function selectSourceOrderedPeerFeedbackBalanceReasoningEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isPeerFeedbackBalanceReasoningQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    PeerFeedbackBalanceReasoningFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .map((entry) => ({
      entry,
      facet: peerFeedbackBalanceReasoningFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: PeerFeedbackBalanceReasoningFacet;
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
    PEER_FEEDBACK_BALANCE_REASONING_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return PEER_FEEDBACK_BALANCE_REASONING_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}
