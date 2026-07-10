import { narrowGate } from "../../narrowGates";

export const NON_PROVISIONAL_FILING_INSTRUCTION_PATTERN =
  /\balways confirm exact dates when I ask about deadlines or meetings\b/iu;
// The user confirmation turn that restates the exact non-provisional filing
// date; it is an ordinary user turn (not a standing instruction), so the
// registry matches it through the companion-pattern path.
export const NON_PROVISIONAL_FILING_COMPANION_PATTERN =
  /\bNon-Provisional Patent Filing Deadline\b[\s\S]{0,12}\bNovember 10, 2024\b/iu;

export const isNonProvisionalFilingInstructionQuery = narrowGate(
  "instruction.nonProvisionalFilingDate",
  (query: string): boolean => {
  return /\bnon-provisional patent filing\b/iu.test(query) &&
    /\bscheduled\b/iu.test(query);
  },
);
