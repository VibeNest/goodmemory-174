import { narrowGate } from "../../narrowGates";

const TIMELINE_DATE_FORMAT_INSTRUCTION_QUERY_PATTERN =
  /^(?=[\s\S]*\bwhen was the\b)(?=[\s\S]*\bwriters['’]?\s+festival\b)/iu;
export const TIMELINE_DATE_FORMAT_INSTRUCTION_PATTERN =
  /\balways format dates as .month day, year. when i ask about timeline details\b/iu;

export const isTimelineDateFormatInstructionQuery = narrowGate(
  "instruction.timelineDateFormat",
  (query: string): boolean => {
  return TIMELINE_DATE_FORMAT_INSTRUCTION_QUERY_PATTERN.test(query);
  },
);
