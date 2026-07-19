// Counting guides: quantity/duration candidate extraction and the ledger.

import type { EvidenceTurn } from "../evidenceShared";
import { stripFencedCodeBlocks } from "../evidenceShared";

const COUNT_MAX_OTHER_QUANTITIES_PER_TURN = 6;
const COUNT_MAX_CALENDAR_DATE_POINTS = 6;
const COUNT_MAX_CALENDAR_INTERVALS = 15;
const COUNT_DEFAULT_YEAR = 2024;
const COUNT_MS_PER_DAY = 24 * 60 * 60 * 1000;

const COUNT_MONTH_INDEX_BY_NAME: Record<string, number> = {
  apr: 3,
  april: 3,
  aug: 7,
  august: 7,
  dec: 11,
  december: 11,
  feb: 1,
  february: 1,
  jan: 0,
  january: 0,
  jul: 6,
  july: 6,
  jun: 5,
  june: 5,
  mar: 2,
  march: 2,
  may: 4,
  nov: 10,
  november: 10,
  oct: 9,
  october: 9,
  sep: 8,
  sept: 8,
  september: 8,
};

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

interface CountParsedDate {
  day: number;
  hasExplicitYear: boolean;
  monthIndex: number;
  year: number;
}

interface CountDatePoint {
  label: string;
  ordinal: number;
  sourceId: EvidenceTurn["sourceId"];
}

interface CountDateIntervalCandidate {
  days: number;
  from: CountDatePoint;
  to: CountDatePoint;
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

function datePartsToOrdinal(input: {
  day: number;
  monthIndex: number;
  year: number;
}): number | undefined {
  const timestamp = Date.UTC(input.year, input.monthIndex, input.day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== input.year ||
    date.getUTCMonth() !== input.monthIndex ||
    date.getUTCDate() !== input.day
  ) {
    return undefined;
  }
  return Math.floor(timestamp / COUNT_MS_PER_DAY);
}

function extractCountFallbackYear(timeAnchor: string): number | undefined {
  const year = /\b(\d{4})\b/u.exec(timeAnchor);
  if (year === null) {
    return undefined;
  }
  return Number(year[1]);
}

function parseCountDateValue(input: {
  fallbackYear: number;
  value: string;
}): CountParsedDate | undefined {
  const { fallbackYear, value } = input;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (iso !== null) {
    return {
      day: Number(iso[3]),
      hasExplicitYear: true,
      monthIndex: Number(iso[2]) - 1,
      year: Number(iso[1]),
    };
  }

  const monthDate =
    /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:-\d{1,2})?(?:,\s*(\d{4}))?$/iu.exec(
      value,
    );
  if (monthDate === null) {
    return undefined;
  }

  const monthIndex =
    COUNT_MONTH_INDEX_BY_NAME[monthDate[1].toLowerCase()];
  if (monthIndex === undefined) {
    return undefined;
  }
  return {
    day: Number(monthDate[2]),
    hasExplicitYear: monthDate[3] !== undefined,
    monthIndex,
    year: Number(monthDate[3] ?? fallbackYear),
  };
}

function collectCountDatePoints(
  ordered: readonly EvidenceTurn[],
): CountDatePoint[] {
  const points: CountDatePoint[] = [];
  let previousOrdinal: number | undefined;

  for (const turn of ordered) {
    const candidates = extractCountTurnCandidates(turn);
    const fallbackYear =
      extractCountFallbackYear(turn.timeAnchor) ?? COUNT_DEFAULT_YEAR;
    for (const candidate of candidates.dates) {
      const parsed = parseCountDateValue({
        fallbackYear,
        value: candidate.value,
      });
      if (parsed === undefined) {
        continue;
      }

      let year = parsed.year;
      let ordinal: number | undefined = datePartsToOrdinal({
        day: parsed.day,
        monthIndex: parsed.monthIndex,
        year,
      });
      if (ordinal === undefined) {
        continue;
      }

      if (!parsed.hasExplicitYear && previousOrdinal !== undefined) {
        while (ordinal < previousOrdinal) {
          year += 1;
          const adjusted = datePartsToOrdinal({
            day: parsed.day,
            monthIndex: parsed.monthIndex,
            year,
          });
          if (adjusted === undefined) {
            ordinal = undefined;
            break;
          }
          ordinal = adjusted;
        }
      }
      if (ordinal === undefined) {
        continue;
      }

      points.push({
        label: candidate.value,
        ordinal,
        sourceId: turn.sourceId,
      });
      previousOrdinal = ordinal;
    }
  }

  return points;
}

function buildCountCalendarIntervals(
  ordered: readonly EvidenceTurn[],
): CountDateIntervalCandidate[] {
  const points = collectCountDatePoints(ordered).slice(
    0,
    COUNT_MAX_CALENDAR_DATE_POINTS,
  );
  const intervals: CountDateIntervalCandidate[] = [];

  for (let fromIndex = 0; fromIndex < points.length; fromIndex += 1) {
    for (let toIndex = fromIndex + 1; toIndex < points.length; toIndex += 1) {
      const from = points[fromIndex];
      const to = points[toIndex];
      intervals.push({
        days: Math.abs(to.ordinal - from.ordinal),
        from,
        to,
      });
      if (intervals.length >= COUNT_MAX_CALENDAR_INTERVALS) {
        return intervals;
      }
    }
  }

  return intervals;
}

function formatCountCalendarDayCount(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

function formatCountCalendarIntervals(
  ordered: readonly EvidenceTurn[],
): string[] {
  const intervals = buildCountCalendarIntervals(ordered);
  if (intervals.length === 0) {
    return [];
  }

  return [
    "Calendar interval candidates:",
    ...intervals.map(
      (interval) =>
        `- ${interval.from.label} -> ${interval.to.label} = ${formatCountCalendarDayCount(
          interval.days,
        )} (#${interval.from.sourceId} to #${interval.to.sourceId})`,
    ),
    "Use the interval whose endpoint labels match the question wording; do not use a duration label as an endpoint.",
  ];
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
    ...formatCountCalendarIntervals(ordered),
    "Interval guidance: Choose the two event dates named by the question's endpoint phrases, not unrelated intermediate dates.",
    "Use start dates when the question asks between starts; use completion/end dates only when the question names completion/end.",
    "When a fact gives a date range such as from A to B, keep A as the period start and B as the period end before deciding which endpoint the question asks for.",
    "Do not use a duration label such as 15-day or two-week as an interval endpoint date.",
  ].join("\n");
}
