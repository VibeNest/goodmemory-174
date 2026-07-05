// Instruction-following guides: standing-constraint detection, supporting
// evidence selection, and concrete answer cues.

import type { EvidenceTurn } from "../evidenceShared";
import { uniquePreservingOrder } from "../evidenceShared";
import { COUNT_DATE_PATTERN } from "./count";

const STANDING_INSTRUCTION_PATTERN =
  /\b(?:always|whenever|when\s+i\s+ask|do\s+not|don't|must)\b/iu;

const COMPANION_INSTRUCTION_PATTERN =
  /^\s*(?:also|additionally|and\s+also|plus)\b/iu;

export const INSTRUCTION_SUPPORT_MAX_TURNS = 3;

const INSTRUCTION_SUPPORT_SNIPPET_CHARS = 1000;

const INSTRUCTION_VERSIONED_VALUE_PATTERN =
  /\b[A-Za-z][A-Za-z0-9.+_-]*(?:-[A-Za-z0-9.+_-]+)*\s+v?\d+(?:\.\d+){1,}\b/gu;

const INSTRUCTION_VERSIONED_VALUE_DETECT_PATTERN =
  /\b[A-Za-z][A-Za-z0-9.+_-]*(?:-[A-Za-z0-9.+_-]+)*\s+v?\d+(?:\.\d+){1,}\b/u;

const INSTRUCTION_CONCRETE_VALUE_QUESTION_PATTERN =
  /\b(?:aids?|dependenc(?:y|ies)|librar(?:y|ies)|packages?|software|tools?|versions?)\b/iu;

const INSTRUCTION_NAMED_ITEM_PATTERN =
  /\b[A-Z][A-Za-z0-9.+_-]*(?:\s+[A-Z][A-Za-z0-9.+_-]*){0,3}\b/gu;

const INSTRUCTION_NAMED_ITEM_STOP_WORDS = new Set([
  "Additionally",
  "Also",
  "Always",
  "And",
  "April",
  "August",
  "Do",
  "DD",
  "Day",
  "December",
  "February",
  "I",
  "Include",
  "January",
  "July",
  "June",
  "MM",
  "March",
  "May",
  "Month",
  "November",
  "October",
  "Plus",
  "September",
  "The",
  "YYYY",
  "Year",
]);

const INSTRUCTION_FORMAT_CUE_PATTERNS = [
  /\bMM\/DD\/YYYY\b/giu,
  /\bMonth\s+Day,\s*Year\b/giu,
  /\bmonth[- ]day[- ]year(?:\s+order)?\b/giu,
  /\bfull\s+month\s+name,\s*day,?\s+and\s+year\b/giu,
  /\bsyntax\s+highlighting\b/giu,
  /\bbullet\s+points?\b/giu,
  /\bstep-by-step(?:\s+explanations?)?\b/giu,
  /\bitemized\s+costs?\b/giu,
  /\bspecific\s+amounts?\b/giu,
  /\bdetailed\s+breakdown\b/giu,
];

const INSTRUCTION_SUPPORT_STOP_WORDS = new Set([
  "about",
  "and",
  "answer",
  "answers",
  "ask",
  "asked",
  "can",
  "could",
  "different",
  "does",
  "for",
  "from",
  "help",
  "how",
  "include",
  "includes",
  "including",
  "into",
  "make",
  "multiple",
  "need",
  "or",
  "project",
  "request",
  "requested",
  "response",
  "should",
  "that",
  "the",
  "this",
  "use",
  "used",
  "using",
  "want",
  "what",
  "when",
  "which",
  "with",
  "would",
]);

export function selectInstructionConstraintIndexes(
  ordered: readonly EvidenceTurn[],
): Set<number> {
  const selected = new Set<number>();
  ordered.forEach((turn, index) => {
    if (!STANDING_INSTRUCTION_PATTERN.test(turn.content)) {
      return;
    }
    selected.add(index);
    const next = ordered[index + 1];
    if (next && COMPANION_INSTRUCTION_PATTERN.test(next.content)) {
      selected.add(index + 1);
    }
  });
  return selected;
}

function normalizeInstructionTopicToken(token: string): string {
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 4) {
    return token.slice(0, -1);
  }
  return token;
}

export function instructionSupportTopicTokens(value: string): Set<string> {
  const tokens = new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/giu, " ")
      .split(/\s+/u)
      .map(normalizeInstructionTopicToken)
      .filter(
        (token) =>
          token.length >= 3 && !INSTRUCTION_SUPPORT_STOP_WORDS.has(token),
      ),
  );
  if (tokens.has("library")) {
    tokens.add("dependency");
  }
  if (tokens.has("dependency")) {
    tokens.add("library");
  }
  return tokens;
}

function instructionSupportOverlapScore(input: {
  queryTokens: ReadonlySet<string>;
  turn: EvidenceTurn;
}): number {
  if (input.turn.role.toLowerCase() === "assistant") {
    return 0;
  }
  const turnTokens = instructionSupportTopicTokens(input.turn.content);
  return [...input.queryTokens].filter((token) => turnTokens.has(token)).length;
}

export function selectInstructionSupportTurns(input: {
  constraintIndexes: ReadonlySet<number>;
  ordered: readonly EvidenceTurn[];
  question: string;
}): EvidenceTurn[] {
  const queryTokens = instructionSupportTopicTokens(input.question);
  const allowConcreteValueSupport =
    INSTRUCTION_CONCRETE_VALUE_QUESTION_PATTERN.test(input.question);
  if (queryTokens.size === 0 && !allowConcreteValueSupport) {
    return [];
  }

  return input.ordered
    .map((turn, index) => {
      const isConstraint = input.constraintIndexes.has(index);
      const concreteValueScore =
        allowConcreteValueSupport &&
        !isConstraint &&
        turn.role.toLowerCase() !== "assistant" &&
        INSTRUCTION_VERSIONED_VALUE_DETECT_PATTERN.test(turn.content)
          ? 1
          : 0;
      return {
        index,
        score: isConstraint
          ? 0
          : instructionSupportOverlapScore({ queryTokens, turn }) +
            concreteValueScore,
        turn,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, INSTRUCTION_SUPPORT_MAX_TURNS)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.turn);
}

function instructionTokenSearchVariants(token: string): string[] {
  if (token === "dependency") {
    return ["dependency", "dependencies"];
  }
  if (token === "library") {
    return ["library", "libraries"];
  }
  if (token.endsWith("y") && token.length > 4) {
    return [token, `${token.slice(0, -1)}ies`];
  }
  return [token];
}

function extractInstructionSupportSnippet(input: {
  content: string;
  queryTokens: ReadonlySet<string>;
}): string {
  const normalized = input.content.replace(/\s+/gu, " ").trim();
  if (normalized.length <= INSTRUCTION_SUPPORT_SNIPPET_CHARS) {
    return normalized;
  }
  const lower = normalized.toLowerCase();
  const matchIndex = [...input.queryTokens]
    .flatMap(instructionTokenSearchVariants)
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  if (matchIndex === undefined) {
    return `${normalized.slice(0, INSTRUCTION_SUPPORT_SNIPPET_CHARS - 3)}...`;
  }
  const start = Math.max(0, matchIndex - 120);
  const end = Math.min(normalized.length, start + INSTRUCTION_SUPPORT_SNIPPET_CHARS);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalized.length ? "..." : "";
  return `${prefix}${normalized.slice(start, end)}${suffix}`;
}

export function formatInstructionSupportTurns(input: {
  question: string;
  turns: readonly EvidenceTurn[];
}): string {
  if (input.turns.length === 0) {
    return "(no evidence)";
  }
  const queryTokens = instructionSupportTopicTokens(input.question);
  return input.turns
    .map(
      (turn) =>
        `- [t=${turn.timeAnchor} | #${turn.sourceId} | ${turn.role}] ${extractInstructionSupportSnippet(
          {
            content: turn.content,
            queryTokens,
          },
        )}`,
    )
    .join("\n");
}

function splitInstructionNamedListSegments(content: string): string[] {
  const afterColon = content.includes(":") ? content.split(":").slice(1).join(":") : content;
  return afterColon
    .split(/,\s*|\s+\band\b\s*/giu)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function extractInstructionNamedItems(content: string): string[] {
  const candidates: string[] = [];
  for (const segment of splitInstructionNamedListSegments(content)) {
    for (const match of segment.matchAll(INSTRUCTION_NAMED_ITEM_PATTERN)) {
      const value = match[0].trim();
      const firstWord = value.split(/\s+/u)[0];
      if (INSTRUCTION_NAMED_ITEM_STOP_WORDS.has(firstWord)) {
        continue;
      }
      candidates.push(value);
    }
  }
  return uniquePreservingOrder(candidates);
}

function extractInstructionVersionedValues(content: string): string[] {
  return uniquePreservingOrder(
    [...content.matchAll(INSTRUCTION_VERSIONED_VALUE_PATTERN)].map(
      (match) => match[0],
    ),
  );
}

function extractInstructionDateValues(content: string): string[] {
  return uniquePreservingOrder(
    [...content.matchAll(COUNT_DATE_PATTERN)].map((match) => match[0]),
  );
}

function extractInstructionFormatCues(content: string): string[] {
  return uniquePreservingOrder(
    INSTRUCTION_FORMAT_CUE_PATTERNS.flatMap((pattern) =>
      [...content.matchAll(pattern)].map((match) =>
        match[0].replace(/\s+/gu, " ").trim(),
      ),
    ),
  );
}

export function formatInstructionConcreteAnswerCues(input: {
  constraintTurns: readonly EvidenceTurn[];
  supportTurns: readonly EvidenceTurn[];
}): string | undefined {
  const turns = [...input.constraintTurns, ...input.supportTurns];
  const versionedValues = uniquePreservingOrder(
    turns.flatMap((turn) => extractInstructionVersionedValues(turn.content)),
  );
  const namedItems = uniquePreservingOrder(
    turns.flatMap((turn) => extractInstructionNamedItems(turn.content)),
  ).filter(
    (item) =>
      !versionedValues.some((versionedValue) =>
        versionedValue.toLowerCase().startsWith(`${item.toLowerCase()} `),
      ),
  );
  const dateValues = uniquePreservingOrder(
    turns.flatMap((turn) => extractInstructionDateValues(turn.content)),
  );
  const formatCues = uniquePreservingOrder(
    turns.flatMap((turn) => extractInstructionFormatCues(turn.content)),
  );
  if (
    versionedValues.length === 0 &&
    namedItems.length === 0 &&
    dateValues.length === 0 &&
    formatCues.length === 0
  ) {
    return undefined;
  }
  const lines = [
    "Concrete answer-content cues:",
    "Do not only restate the instruction; include the concrete values below when they answer the user's requested response contents.",
    versionedValues.length > 0
      ? `versioned names/values: ${versionedValues.join(", ")}`
      : "versioned names/values: (none detected)",
    namedItems.length > 0
      ? `named tools/examples: ${namedItems.join(", ")}`
      : "named tools/examples: (none detected)",
  ];
  if (dateValues.length > 0) {
    lines.push(`date values: ${dateValues.join(", ")}`);
  }
  if (formatCues.length > 0) {
    lines.push(`format/style requirements: ${formatCues.join(", ")}`);
  }
  return lines.join("\n");
}
