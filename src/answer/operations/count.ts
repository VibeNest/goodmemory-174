// Counting guides: quantity/duration candidate extraction and the ledger.

import type { EvidenceTurn } from "../evidenceShared";
import { stripFencedCodeBlocks } from "../evidenceShared";

const COUNT_MAX_OTHER_QUANTITIES_PER_TURN = 6;

export const COUNT_DATE_PATTERN =
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:-\d{1,2})?(?:,\s*\d{4})?\b|\b\d{4}-\d{2}-\d{2}\b/giu;

const COUNT_SMALL_WORD_NUMBER_PATTERN =
  "(?:one|two|three|four|five|six|seven|eight|nine)";

const COUNT_WORD_NUMBER_PATTERN = `(?:(?:${COUNT_SMALL_WORD_NUMBER_PATTERN}|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ]${COUNT_SMALL_WORD_NUMBER_PATTERN})?)`;

const COUNT_NOUN_PHRASE_PATTERN = "[a-z][a-z-]*(?:\\s+[a-z][a-z-]*){0,2}";

const COUNT_DURATION_PATTERN = new RegExp(
  `\\b(?:\\d+(?:\\.\\d+)?|${COUNT_WORD_NUMBER_PATTERN})\\s*[- ]\\s*(?:days?|weeks?|months?|years?)\\b`,
  "giu",
);

export const COUNT_QUANTITY_PATTERN = new RegExp(
  [
    `\\$?\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?\\s+${COUNT_NOUN_PHRASE_PATTERN}`,
    `\\$\\d+(?:\\.\\d+)?\\s+${COUNT_NOUN_PHRASE_PATTERN}`,
    `\\b(?:\\d+(?:\\.\\d+)?%\\s+(?:of\\s+)?${COUNT_NOUN_PHRASE_PATTERN}`,
    "\\d+(?:\\.\\d+)?%",
    `\\d+(?:\\.\\d+)?\\s+of\\s+\\d+(?:\\.\\d+)?\\s+${COUNT_NOUN_PHRASE_PATTERN}`,
    `\\d+(?:\\.\\d+)?\\s+${COUNT_NOUN_PHRASE_PATTERN}`,
    `${COUNT_WORD_NUMBER_PATTERN}\\s+${COUNT_NOUN_PHRASE_PATTERN})\\b`,
  ].join("|"),
  "giu",
);

interface CountCandidate {
  end: number;
  snippet: string;
  start: number;
  value: string;
}

function cleanCountText(content: string): string {
  return stripFencedCodeBlocks(content)
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\s*->->\s*[\d,\s-]+$/u, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function extractCountSnippet(input: {
  content: string;
  end: number;
  start: number;
}): string {
  const maxChars = 140;
  const matchLength = input.end - input.start;
  const sideBudget = Math.max(20, Math.floor((maxChars - matchLength) / 2));
  const snippetStart = Math.max(0, input.start - sideBudget);
  const snippetEnd = Math.min(input.content.length, input.end + sideBudget);
  const prefix = snippetStart > 0 ? "..." : "";
  const suffix = snippetEnd < input.content.length ? "..." : "";
  return `${prefix}${input.content.slice(snippetStart, snippetEnd)}${suffix}`.trim();
}

function collectCountCandidates(
  content: string,
  pattern: RegExp,
): CountCandidate[] {
  return [...content.matchAll(pattern)].map((match) => {
    const value = match[0].trim();
    const start = match.index ?? 0;
    const end = start + value.length;
    return {
      end,
      snippet: extractCountSnippet({ content, end, start }),
      start,
      value,
    };
  });
}

function normalizeCountQuantityCandidate(
  candidate: CountCandidate,
): CountCandidate | undefined {
  const value = candidate.value
    .replace(
      /\s+\b(?:and|at|by|can|from|in|on|should|to|where|will|with|would)\b.*$/iu,
      "",
    )
    .replace(/^[^\p{L}\p{N}%$]+|[^\p{L}\p{N}%$]+$/gu, "")
    .trim();
  if (
    !value ||
    /^\d{1,2}\s*(?:am|pm|cet|cest|edt|est|gmt|pdt|pst|utc)\b/iu.test(value)
  ) {
    return undefined;
  }
  return {
    ...candidate,
    end: candidate.start + value.length,
    value,
  };
}

function dedupeCountCandidates(
  candidates: readonly CountCandidate[],
): CountCandidate[] {
  const seen = new Set<string>();
  const deduped: CountCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function rangesOverlap(
  left: Pick<CountCandidate, "end" | "start">,
  right: Pick<CountCandidate, "end" | "start">,
): boolean {
  return left.start < right.end && right.start < left.end;
}

export function extractCountTurnCandidates(turn: EvidenceTurn): {
  dates: CountCandidate[];
  durations: CountCandidate[];
  quantities: CountCandidate[];
} {
  const content = cleanCountText(turn.content);
  const dates = dedupeCountCandidates(
    collectCountCandidates(content, COUNT_DATE_PATTERN),
  );
  const durations = dedupeCountCandidates(
    collectCountCandidates(content, COUNT_DURATION_PATTERN),
  );
  const blockedRanges = [...dates, ...durations];
  const quantities = dedupeCountCandidates(
    collectCountCandidates(content, COUNT_QUANTITY_PATTERN)
      .map(normalizeCountQuantityCandidate)
      .filter((candidate): candidate is CountCandidate => candidate !== undefined)
      .filter(
        (candidate) =>
          !blockedRanges.some((blocked) => rangesOverlap(candidate, blocked)),
      ),
  ).slice(0, COUNT_MAX_OTHER_QUANTITIES_PER_TURN);
  return { dates, durations, quantities };
}

export function formatCountCandidateValues(
  candidates: readonly CountCandidate[],
): string {
  return candidates.length > 0
    ? candidates.map((candidate) => candidate.value).join("; ")
    : "(none)";
}

function formatCountCandidateContexts(input: {
  candidates: readonly CountCandidate[];
  label: string;
}): string | undefined {
  if (input.candidates.length === 0) {
    return undefined;
  }
  return `${input.label} contexts: ${input.candidates
    .map((candidate) => `"${candidate.snippet}"`)
    .join("; ")}`;
}

export function formatCountCandidateLedger(ordered: readonly EvidenceTurn[]): string {
  if (ordered.length === 0) {
    return [
      "Date/quantity ledger for counting:",
      "Candidate endpoints and quantities (source-ordered):",
      "(no evidence)",
    ].join("\n");
  }

  const lines = ordered.flatMap((turn) => {
    const candidates = extractCountTurnCandidates(turn);
    const summary = [
      `- [t=${turn.timeAnchor} | #${turn.sourceId} | ${turn.role}] dates: ${formatCountCandidateValues(
        candidates.dates,
      )}`,
      `duration labels (not endpoint dates by themselves): ${formatCountCandidateValues(
        candidates.durations,
      )}`,
      `other numeric quantities: ${formatCountCandidateValues(
        candidates.quantities,
      )}`,
    ].join("; ");
    const contexts = [
      formatCountCandidateContexts({
        candidates: candidates.dates,
        label: "date",
      }),
      formatCountCandidateContexts({
        candidates: candidates.durations,
        label: "duration",
      }),
      formatCountCandidateContexts({
        candidates: candidates.quantities,
        label: "quantity",
      }),
    ].filter((context): context is string => context !== undefined);
    return contexts.length > 0 ? [summary, ...contexts] : [summary];
  });

  return [
    "Date/quantity ledger for counting:",
    "Candidate endpoints and quantities (source-ordered):",
    ...lines,
    "Interval guidance: Choose the two event dates named by the question's endpoint phrases, not unrelated intermediate dates.",
    "Use start dates when the question asks between starts; use completion/end dates only when the question names completion/end.",
    "When a fact gives a date range such as from A to B, keep A as the period start and B as the period end before deciding which endpoint the question asks for.",
    "Do not use a duration label such as 15-day or two-week as an interval endpoint date.",
  ].join("\n");
}
