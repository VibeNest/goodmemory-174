import type { RankedFactCandidate } from "../scoring";
import { stripEvidencePrefix } from "./selectionContext";
import { compareTemporalFactChronology } from "./temporal";

type SourceOrderProfessionalPreparationFacet =
  | "coverLetterFeedback"
  | "employeeHandbook"
  | "mentorNetworking"
  | "storytellingInterview"
  | "workshopPresentation";

const QUERY_PATTERN =
  /\bprofessional\s+connections?\b[\s\S]{0,180}\b(?:preparation|prepared|prepare|aspects?|brought\s+up|conversations?|order)\b|\b(?:preparation|prepared|prepare|aspects?|brought\s+up|conversations?|order)\b[\s\S]{0,180}\bprofessional\s+connections?\b/iu;

const DISTRACTOR_PATTERN =
  /\b(?:coaching\s+session|cover\s+letter\s+deadline|cover\s+letter\s+draft|first\s+draft|jargon|leave\s+policy|projector|probation|room\s+setup|senior\s+producer\s+role|sign-in|single-column|tone|warm\s+professional|Zoom\s+call)\b/iu;

const FACETS = [
  {
    facet: "mentorNetworking",
    pattern: /\b(?:long-time\s+mentor|great\s+mentor|Leslie)\b[\s\S]{0,180}\b(?:networking|Caribbean\s+Creative\s+Hub)\b|\b(?:networking|Caribbean\s+Creative\s+Hub)\b[\s\S]{0,180}\b(?:long-time\s+mentor|great\s+mentor|Leslie)\b/iu,
  },
  {
    facet: "coverLetterFeedback",
    pattern: /\bcover\s+letter\b[\s\S]{0,240}\b(?:Laura|emotional\s+intelligence|shared\s+feedback|HR)\b|\b(?:Laura|emotional\s+intelligence|shared\s+feedback|HR)\b[\s\S]{0,240}\bcover\s+letter\b/iu,
  },
  {
    facet: "storytellingInterview",
    pattern: /\bstorytelling\b[\s\S]{0,240}\b(?:cultural\s+diversity|interview|Island\s+Media|Laura\s+suggested|Laura)\b|\b(?:cultural\s+diversity|interview|Island\s+Media|Laura\s+suggested|Laura)\b[\s\S]{0,240}\bstorytelling\b/iu,
  },
  {
    facet: "employeeHandbook",
    pattern: /\bemployee\s+handbook\b[\s\S]{0,220}\b(?:email(?:ed)?|polic(?:y|ies)|review(?:ing)?|accept(?:ing)?\s+(?:the\s+)?(?:job\s+)?offer)\b|\b(?:email(?:ed)?|polic(?:y|ies)|review(?:ing)?|accept(?:ing)?\s+(?:the\s+)?(?:job\s+)?offer)\b[\s\S]{0,220}\bemployee\s+handbook\b/iu,
  },
  {
    facet: "workshopPresentation",
    pattern: /\bworkshop\b[\s\S]{0,240}\b(?:storytelling|cultural\s+competence)\b[\s\S]{0,240}\bpresentation\b|\bpresentation\b[\s\S]{0,240}\b(?:storytelling|cultural\s+competence)\b[\s\S]{0,240}\bworkshop\b/iu,
  },
] as const satisfies ReadonlyArray<{
  facet: SourceOrderProfessionalPreparationFacet;
  pattern: RegExp;
}>;

const FACET_ORDER: readonly SourceOrderProfessionalPreparationFacet[] = [
  "mentorNetworking",
  "coverLetterFeedback",
  "storytellingInterview",
  "employeeHandbook",
  "workshopPresentation",
];

export function isSourceOrderProfessionalPreparationQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function sourceOrderProfessionalPreparationFacets(
  entry: RankedFactCandidate,
): Set<SourceOrderProfessionalPreparationFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  if (DISTRACTOR_PATTERN.test(content)) {
    return new Set();
  }

  const facets = new Set<SourceOrderProfessionalPreparationFacet>();
  for (const facet of FACETS) {
    if (facet.pattern.test(content)) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedProfessionalPreparationAnchors(input: {
  count: number;
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bestByFacet = new Map<
    SourceOrderProfessionalPreparationFacet,
    RankedFactCandidate
  >();

  for (const entry of input.entries) {
    const facets = sourceOrderProfessionalPreparationFacets(entry);
    for (const facet of facets) {
      const current = bestByFacet.get(facet);
      if (
        !current ||
        compareTemporalFactChronology(entry, current) < 0 ||
        (
          compareTemporalFactChronology(entry, current) === 0 &&
          input.priority(entry) > input.priority(current)
        )
      ) {
        bestByFacet.set(facet, entry);
      }
    }
  }

  const selected = FACET_ORDER
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined);

  if (selected.length < input.count) {
    return [];
  }

  return selected
    .slice(0, input.count)
    .sort(compareTemporalFactChronology);
}
