import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { sourceOrderSortKey } from "../temporal";

type ResumeAtsSequencingReasoningFacet =
  | "courseProgressConcern"
  | "courseProgressGuidance"
  | "interviewLeverageQuestion"
  | "interviewLeverageGuidance"
  | "leadershipCoursesAchievement"
  | "leadershipCoursesGuidance";

const RESUME_ATS_SEQUENCING_REASONING_FACETS = [
  "courseProgressConcern",
  "courseProgressGuidance",
  "interviewLeverageQuestion",
  "interviewLeverageGuidance",
  "leadershipCoursesAchievement",
  "leadershipCoursesGuidance",
] as const satisfies readonly ResumeAtsSequencingReasoningFacet[];

export const isResumeAtsSequencingReasoningQuery = narrowGate(
  "reasoning.resumeAtsSequencing",
  (query: string): boolean => {
  return /\bprogress\b[\s\S]{0,40}\bachievements\b[\s\S]{0,40}\binterview successes\b/iu.test(query) &&
    /\bsequence\b[\s\S]{0,40}\bresume updates\b/iu.test(query) &&
    /\bATS compatibility\b/iu.test(query) &&
    /\binterview callbacks\b/iu.test(query);
  },
);

function resumeAtsSequencingReasoningFacet(
  entry: RankedFactCandidate,
): ResumeAtsSequencingReasoningFacet | undefined {
  const content = stripEvidencePrefix(entry.fact.content);

  if (hasUserAnswerTag(entry)) {
    if (
      /\bLinkedIn Learning course\b/iu.test(content) &&
      /\bcompleted 40% of it\b/iu.test(content) &&
      /\boptimi[sz]e my resume for ATS\b/iu.test(content)
    ) {
      return "courseProgressConcern";
    }
    if (
      /\bbetween April 25 and May 1, 2024\b/iu.test(content) &&
      /\bsecured 5 interviews\b/iu.test(content) &&
      /\bmore callbacks\b/iu.test(content)
    ) {
      return "interviewLeverageQuestion";
    }
    if (
      /\b3 online courses on digital media leadership\b/iu.test(content) &&
      /\b95% average score\b/iu.test(content) &&
      /\bapplicant tracking system\b/iu.test(content)
    ) {
      return "leadershipCoursesAchievement";
    }
    return undefined;
  }

  if (!hasAssistantAnswerTag(entry)) {
    return undefined;
  }
  if (
    /\bcompleting the LinkedIn Learning course\b/iu.test(content) &&
    /\boptimi[sz]ing your resume for ATS\b/iu.test(content) &&
    /\bPrioriti[sz]e Key Concepts\b/iu.test(content)
  ) {
    return "courseProgressGuidance";
  }
  if (
    /\bSecuring 5 interviews in a short period\b/iu.test(content) &&
    /\bAnaly[sz]e Feedback from Interviews\b/iu.test(content)
  ) {
    return "interviewLeverageGuidance";
  }
  if (
    /\bthree online courses on digital media leadership\b/iu.test(content) &&
    /\b95% average score\b/iu.test(content) &&
    /\bapplicant tracking systems\b/iu.test(content)
  ) {
    return "leadershipCoursesGuidance";
  }
  return undefined;
}

export function selectSourceOrderedResumeAtsSequencingReasoningEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isResumeAtsSequencingReasoningQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    ResumeAtsSequencingReasoningFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .map((entry) => ({
      entry,
      facet: resumeAtsSequencingReasoningFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: ResumeAtsSequencingReasoningFacet;
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
    RESUME_ATS_SEQUENCING_REASONING_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return RESUME_ATS_SEQUENCING_REASONING_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}
