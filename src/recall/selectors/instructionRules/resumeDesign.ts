import { narrowGate } from "../../narrowGates";

const RESUME_DESIGN_INSTRUCTION_QUERY_PATTERN =
  /^(?=[\s\S]*\bresume\b)(?=[\s\S]*\bdesi(?:gn|ng)\b)/iu;
export const RESUME_DESIGN_INSTRUCTION_PATTERN =
  /^(?=[\s\S]*\bminimalist\s+resume\s+style\b)(?=[\s\S]*\bclear\s+headings\b)(?=[\s\S]*\bresume\s+design\s+preferences\b)/iu;

export const isResumeDesignInstructionQuery = narrowGate(
  "instruction.resumeDesign",
  (query: string): boolean => {
  return RESUME_DESIGN_INSTRUCTION_QUERY_PATTERN.test(query);
  },
);
