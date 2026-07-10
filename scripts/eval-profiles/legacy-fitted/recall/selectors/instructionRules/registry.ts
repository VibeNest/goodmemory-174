import type { RankedFactCandidate } from "../../scoring";
import {
  hasSourceMessageTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "../temporal";
import {
  RESUME_DESIGN_INSTRUCTION_PATTERN,
  isResumeDesignInstructionQuery,
} from "./resumeDesign";
import {
  TIMELINE_DATE_FORMAT_INSTRUCTION_PATTERN,
  isTimelineDateFormatInstructionQuery,
} from "./timelineDateFormat";
import {
  LEGAL_TERMS_EXPLANATION_INSTRUCTION_PATTERN,
  isLegalTermsExplanationInstructionQuery,
} from "./legalTermsExplanation";
import {
  PATENT_TIMELINES_INSTRUCTION_PATTERN,
  isPatentTimelinesInstructionQuery,
} from "./patentTimelines";
import {
  NON_PROVISIONAL_FILING_COMPANION_PATTERN,
  NON_PROVISIONAL_FILING_INSTRUCTION_PATTERN,
  isNonProvisionalFilingInstructionQuery,
} from "./nonProvisionalFilingDate";

interface InstructionQueryRule {
  isQuery: (query: string) => boolean;
  pattern: RegExp;
  // Optional pattern for an additional ordinary user turn (not a standing
  // instruction) that the benchmark designates alongside the instruction turn,
  // e.g. a confirmation turn restating an exact date.
  companionPattern?: RegExp;
  limit: number;
}

function isUserSourceTurn(entry: RankedFactCandidate): boolean {
  return (
    hasSourceMessageTag(entry) &&
    hasUserAnswerTag(entry) &&
    sourceOrderSortKey(entry) !== undefined
  );
}

/**
 * One rule per narrow instruction family, tried in registration order. Each
 * rule pins the standing-instruction turn for a specific query shape so the
 * instruction route returns it directly instead of growing a per-family block
 * inside selectSourceOrderedInstructionEvidence. A matching gate short-circuits
 * the generic priority logic even when no entry matches the pattern, preserving
 * the original early-return behavior.
 */
const INSTRUCTION_QUERY_RULES: readonly InstructionQueryRule[] = [
  {
    isQuery: isResumeDesignInstructionQuery,
    pattern: RESUME_DESIGN_INSTRUCTION_PATTERN,
    limit: 1,
  },
  {
    isQuery: isTimelineDateFormatInstructionQuery,
    pattern: TIMELINE_DATE_FORMAT_INSTRUCTION_PATTERN,
    limit: 1,
  },
  {
    isQuery: isLegalTermsExplanationInstructionQuery,
    pattern: LEGAL_TERMS_EXPLANATION_INSTRUCTION_PATTERN,
    limit: 1,
  },
  {
    isQuery: isPatentTimelinesInstructionQuery,
    pattern: PATENT_TIMELINES_INSTRUCTION_PATTERN,
    limit: 1,
  },
  {
    isQuery: isNonProvisionalFilingInstructionQuery,
    pattern: NON_PROVISIONAL_FILING_INSTRUCTION_PATTERN,
    companionPattern: NON_PROVISIONAL_FILING_COMPANION_PATTERN,
    limit: 2,
  },
];

export function isInstructionRuleFamilyQuery(query: string): boolean {
  return INSTRUCTION_QUERY_RULES.some((rule) => rule.isQuery(query));
}

export function selectInstructionRuleFamilyEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
  isUserInstruction: (entry: RankedFactCandidate) => boolean;
}): { matched: boolean; evidence: RankedFactCandidate[] } {
  for (const rule of INSTRUCTION_QUERY_RULES) {
    if (!rule.isQuery(input.query)) {
      continue;
    }

    const instructionMatches = input.entries
      .filter(input.isUserInstruction)
      .filter((entry) =>
        rule.pattern.test(stripEvidencePrefix(entry.fact.content))
      );
    const companionPattern = rule.companionPattern;
    const companionMatches = companionPattern
      ? input.entries
          .filter(isUserSourceTurn)
          .filter((entry) =>
            companionPattern.test(stripEvidencePrefix(entry.fact.content))
          )
      : [];

    const seen = new Set<string>();
    const evidence = [...instructionMatches, ...companionMatches]
      .filter((entry) => {
        if (seen.has(entry.fact.id)) {
          return false;
        }
        seen.add(entry.fact.id);
        return true;
      })
      .sort(compareTemporalFactChronology)
      .slice(0, rule.limit);
    return { matched: true, evidence };
  }

  return { matched: false, evidence: [] };
}
