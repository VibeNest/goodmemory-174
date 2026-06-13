import type { RankedFactCandidate } from "../../scoring";
import { stripEvidencePrefix } from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";
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

interface InstructionQueryRule {
  isQuery: (query: string) => boolean;
  pattern: RegExp;
  limit: number;
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

    const evidence = input.entries
      .filter(input.isUserInstruction)
      .filter((entry) =>
        rule.pattern.test(stripEvidencePrefix(entry.fact.content))
      )
      .sort(compareTemporalFactChronology)
      .slice(0, rule.limit);
    return { matched: true, evidence };
  }

  return { matched: false, evidence: [] };
}
