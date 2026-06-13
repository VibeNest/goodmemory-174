import { narrowGate } from "../../narrowGates";

const LEGAL_TERMS_EXPLANATION_INSTRUCTION_QUERY_PATTERN =
  /\bmy wishes are legally valid\b/iu;
export const LEGAL_TERMS_EXPLANATION_INSTRUCTION_PATTERN =
  /\balways provide detailed explanations of legal terms when I ask about will requirements\b/iu;

export const isLegalTermsExplanationInstructionQuery = narrowGate(
  "instruction.legalTermsExplanation",
  (query: string): boolean => {
  return LEGAL_TERMS_EXPLANATION_INSTRUCTION_QUERY_PATTERN.test(query);
  },
);
