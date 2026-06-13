import { narrowGate } from "../../narrowGates";

const PATENT_TIMELINES_INSTRUCTION_QUERY_PATTERN =
  /\bget a patent approved\b/iu;
export const PATENT_TIMELINES_INSTRUCTION_PATTERN =
  /\balways provide detailed timelines when I ask about patent application processes\b/iu;

export const isPatentTimelinesInstructionQuery = narrowGate(
  "instruction.patentTimelines",
  (query: string): boolean => {
  return PATENT_TIMELINES_INSTRUCTION_QUERY_PATTERN.test(query);
  },
);
