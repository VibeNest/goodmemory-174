import type { RankedFactCandidate } from "../../scoring";
import {
  hasSourceMessageTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { hasSourceEnvelopeRoleContent } from "../sourceEnvelope";
import { compareTemporalFactChronology, sourceOrderSortKey } from "../temporal";

type RelationshipBeliefEventFacet =
  | "anniversaryBeliefMilestone"
  | "anniversaryResolution"
  | "anniversaryWorkCall"
  | "dailyJournalingBeliefs"
  | "meetingDecline"
  | "tripBoundary"
  | "weeklyCheckins";

const FACET_ORDER = [
  "meetingDecline",
  "anniversaryWorkCall",
  "anniversaryResolution",
  "tripBoundary",
  "anniversaryBeliefMilestone",
  "weeklyCheckins",
  "dailyJournalingBeliefs",
] as const satisfies readonly RelationshipBeliefEventFacet[];

const FACET_QUOTAS = {
  anniversaryBeliefMilestone: 3,
  anniversaryResolution: 1,
  anniversaryWorkCall: 1,
  dailyJournalingBeliefs: 3,
  meetingDecline: 1,
  tripBoundary: 2,
  weeklyCheckins: 3,
} as const satisfies Record<RelationshipBeliefEventFacet, number>;

const QUERY_PATTERN =
  /\bpersonal\s+relationship\b[\s\S]{0,180}\bbeliefs?\b|\bbeliefs?\b[\s\S]{0,180}\bpersonal\s+relationship\b/iu;

const FACET_PATTERNS = {
  anniversaryBeliefMilestone: [
    /\bromantic\s+partner\b[\s\S]{0,160}\bcelebrated\s+5\s+years\b[\s\S]{0,160}\b(?:questioning|concept\s+of)\s+free\s+will\b/iu,
    /\btalking\s+about\s+free\s+will\b[\s\S]{0,220}\b(?:enhance\s+our\s+trust|supportive\s+of\s+each\s+other)\b/iu,
    /\bspecific\s+scenarios\b[\s\S]{0,180}\bmove\s+to\s+a\s+new\s+city\b[\s\S]{0,220}\bfree\s+will\s+influences\s+our\s+decisions\b/iu,
  ],
  anniversaryResolution: [
    /\bresolved\s+my\s+conflict\b[\s\S]{0,180}\banniversary\b[\s\S]{0,120}\bThe\s+Coral\s+Reef\b/iu,
    /\bThe\s+Coral\s+Reef\b[\s\S]{0,160}\banniversary\b/iu,
  ],
  anniversaryWorkCall: [
    /\bwork\s+call\b[\s\S]{0,120}\banniversary\b/iu,
    /\banniversary\b[\s\S]{0,120}\bwork\s+call\b/iu,
  ],
  dailyJournalingBeliefs: [
    /\bdaily\s+journaling\s+starting\s+April\s+1\b[\s\S]{0,220}\bfree\s+will\b[\s\S]{0,220}\b(?:motivation|goal\s+persistence)\b/iu,
    /\bdaily\s+journaling\b[\s\S]{0,180}\bbeliefs?\s+about\s+free\s+will\b[\s\S]{0,180}\b(?:motivation|persistence)\b/iu,
    /\b(?:stick\s+to|stick\s+with)\s+journaling\s+every\s+day\b[\s\S]{0,180}\b(?:patterns?|insights?)\b[\s\S]{0,180}\bbeliefs?\s+in\s+free\s+will\b/iu,
    /\b(?:stick\s+to|stick\s+with)\s+journaling\s+every\s+day\b[\s\S]{0,180}\bbeliefs?\s+about\s+free\s+will\b[\s\S]{0,180}\b(?:patterns?|insights?)\b/iu,
  ],
  meetingDecline: [
    /\bdeclin(?:e|ed|ing)\b[\s\S]{0,120}\b(?:3\s*PM\s+)?meeting\b[\s\S]{0,160}\bstartup\s+offer\b/iu,
    /\bmeeting\b[\s\S]{0,120}\bstartup\s+offer\b/iu,
  ],
  tripBoundary: [
    /\blimit(?:ed|ing)?\s+my\s+work\s+trips?\s+to\s+3\s+per\s+quarter\b/iu,
    /\brelationship\s+boundar(?:y|ies)\b[\s\S]{0,160}\bprofessional\s+ambitions?\b/iu,
    /\bprioriti[sz](?:e|ing)\s+the\s+most\s+important\s+trips?\b[\s\S]{0,200}\b(?:stay\s+connected|quarterly\s+reviews?)\b/iu,
  ],
  weeklyCheckins: [
    /\bweekly\s+check-ins?\b[\s\S]{0,160}\b(?:Sunday|6\s*PM|productive|arguments?)\b/iu,
    /\bcalm\s+dialogue\b[\s\S]{0,160}\bweekly\s+check-ins?\b/iu,
    /\b(?:set\s+clear\s+objectives|write\s+down\s+key\s+points)\b[\s\S]{0,220}\bagenda\b[\s\S]{0,220}\b(?:I\s+statements|soft\s+tone|stay\s+calm)\b/iu,
  ],
} as const satisfies Record<RelationshipBeliefEventFacet, readonly RegExp[]>;

export function isSourceOrderRelationshipBeliefEventQuery(query: string): boolean {
  return QUERY_PATTERN.test(query) &&
    /\b(?:order|in\s+order)\b/iu.test(query) &&
    /\b(?:different\s+aspects?|throughout\s+our\s+conversations)\b/iu.test(query);
}

function relationshipBeliefEventFacet(
  entry: RankedFactCandidate,
): RelationshipBeliefEventFacet | undefined {
  if (!hasUserAnswerTag(entry)) {
    return undefined;
  }

  const content = stripEvidencePrefix(entry.fact.content);
  return FACET_ORDER.find((facet) =>
    FACET_PATTERNS[facet].some((pattern) => pattern.test(content))
  );
}

function sourceEnvelopePriority(entry: RankedFactCandidate): number {
  let priority = 0;
  if (hasSourceMessageTag(entry)) {
    priority += 1;
  }
  if (hasSourceEnvelopeRoleContent(entry.fact.content)) {
    priority += 2;
  }
  return priority;
}

function dedupeRelationshipBeliefFacetCandidates(input: {
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bestBySourceOrder = new Map<string, RankedFactCandidate>();

  for (const entry of input.entries) {
    const order = sourceOrderSortKey(entry);
    const key = order === undefined ? entry.fact.id : `source:${order}`;
    const current = bestBySourceOrder.get(key);
    if (
      !current ||
      sourceEnvelopePriority(entry) > sourceEnvelopePriority(current) ||
      (
        sourceEnvelopePriority(entry) === sourceEnvelopePriority(current) &&
        input.priority(entry) > input.priority(current)
      )
    ) {
      bestBySourceOrder.set(key, entry);
    }
  }

  return [...bestBySourceOrder.values()];
}

export function selectSourceOrderedRelationshipBeliefEventAnchors(input: {
  count: number;
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const selected: RankedFactCandidate[] = [];

  for (const facet of FACET_ORDER) {
    const candidates = dedupeRelationshipBeliefFacetCandidates({
      entries: input.entries.filter((entry) =>
        relationshipBeliefEventFacet(entry) === facet
      ),
      priority: input.priority,
    })
      .sort((left, right) => {
        const chronologyDelta = compareTemporalFactChronology(left, right);
        if (chronologyDelta !== 0) {
          return chronologyDelta;
        }
        return input.priority(right) - input.priority(left);
      })
      .slice(0, FACET_QUOTAS[facet]);

    if (candidates.length === 0) {
      return [];
    }

    selected.push(...candidates);
  }

  if (selected.length < input.count) {
    return [];
  }

  return selected.sort(compareTemporalFactChronology);
}
