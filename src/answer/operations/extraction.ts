// Information-extraction guides: source fact coverage for field, deadline, and
// preparation-step questions that are not pure counts or update resolution.

import type { EvidenceTurn } from "../evidenceShared";
import { stripFencedCodeBlocks, uniquePreservingOrder } from "../evidenceShared";
import { extractCountTurnCandidates, formatCountCandidateValues } from "./count";

const EXTRACTION_MAX_CUES_PER_TURN = 8;

const DATE_COMMA_PLACEHOLDER = "__GOODMEMORY_DATE_COMMA__";

function cleanExtractionText(content: string): string {
  return stripFencedCodeBlocks(content)
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function protectDateCommas(value: string): string {
  return value.replace(
    /\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}),\s*(\d{4})\b/giu,
    `$1${DATE_COMMA_PLACEHOLDER}$2`,
  );
}

function restoreDateCommas(value: string): string {
  return value.replaceAll(DATE_COMMA_PLACEHOLDER, ", ");
}

function cleanExtractionCue(value: string): string {
  return restoreDateCommas(value)
    .replace(/^#{1,6}\s*/u, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s*/u, "")
    .replace(/^\s*(?:and|then|also|finally|afterward),?\s+/iu, "")
    .replace(/\s+/gu, " ")
    .replace(/^[,;:\-\s]+|[,;:\-\s]+$/gu, "")
    .trim();
}

function splitExtractionCueCandidates(content: string): string[] {
  return uniquePreservingOrder(
    protectDateCommas(cleanExtractionText(content))
      .split(/\n+|(?<=[.!?])\s+|;\s+|,\s+(?:and\s+)?/gu)
      .map(cleanExtractionCue)
      .filter((cue) => cue.length >= 8),
  ).slice(0, EXTRACTION_MAX_CUES_PER_TURN);
}

function formatExtractionTurnCoverage(turn: EvidenceTurn): string {
  const candidates = extractCountTurnCandidates(turn);
  const cues = splitExtractionCueCandidates(turn.content);
  const metadata = [
    candidates.dates.length > 0
      ? `dates: ${formatCountCandidateValues(candidates.dates)}`
      : undefined,
    candidates.quantities.length > 0
      ? `quantities: ${formatCountCandidateValues(candidates.quantities)}`
      : undefined,
  ].filter((entry): entry is string => entry !== undefined);
  const cueText =
    cues.length > 0
      ? cues.map((cue, index) => `${index + 1}) ${cue}`).join("; ")
      : "(no clause cues extracted; inspect the source turn directly)";
  return [
    `- [t=${turn.timeAnchor} | #${turn.sourceId} | ${turn.role}] detail cues: ${cueText}`,
    ...metadata.map((entry) => `  ${entry}`),
  ].join("\n");
}

export function formatExtractionCoverageGuide(input: {
  ordered: readonly EvidenceTurn[];
  question: string;
}): string {
  if (input.ordered.length === 0) {
    return [
      "Information extraction coverage:",
      `Question target: ${input.question}`,
      "(no evidence)",
    ].join("\n");
  }
  return [
    "Information extraction coverage:",
    `Question target: ${input.question}`,
    "Coverage rule: cover each source-backed detail that answers the question, including later clauses in the same source turn; do not compress away required sub-items.",
    "Do not answer No answer for a requested field when any listed source turn supplies a candidate value.",
    "Do not add names, labels, or personal identifiers unless the question asks for them or they are necessary to disambiguate the requested field.",
    "Source-backed detail cues:",
    ...input.ordered.map(formatExtractionTurnCoverage),
  ].join("\n");
}
