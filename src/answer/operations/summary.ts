// Summarization guides: per-turn checklists and coverage anchors.

import type { EvidenceTurn } from "../evidenceShared";
import { stripFencedCodeBlocks } from "../evidenceShared";
import { extractCountTurnCandidates, formatCountCandidateValues } from "./count";

const SUMMARY_MAX_CUES_PER_TURN = 4;

const SUMMARY_MAX_VALUE_ANCHORS_PER_TURN = 3;

const SUMMARY_CUE_SNIPPET_CHARS = 240;

const SUMMARY_GENERIC_ASSISTANT_PATTERN =
  /^(?:absolutely|certainly|sure|of course|i'd be happy|i would be happy|happy to help|let's|here are|here is|would you like|do you want|great choice|final thoughts)\b/iu;

const SUMMARY_VALUE_ANCHOR_PATTERN =
  /\b(?:budget|costs?|fees?|fund(?:ing)?|grant|income|expenses?|savings?|contract|freelance|rental|subscription|discount|library resources?|money|financial|attorney|legal|executor|dut(?:y|ies)|responsibilit(?:y|ies)|family meeting|co-executor|conflict(?:[- ]resolution)?|resources?|meeting|deadline|filing|application|prototype|accuracy|webinar|strategy|decision|decisions?|approved?|registered?|completed?|prepared?|organized?|scheduled?|negotiated?|verified?|metrics?|tools?)\b/iu;

function cleanSummaryText(content: string): string {
  return stripFencedCodeBlocks(content)
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/\s*->->\s*[\d,\s-]+$/u, " ")
    .replace(/\r\n/gu, "\n")
    .trim();
}

function cleanSummaryCue(value: string): string {
  return value
    .replace(/^#{1,6}\s*/u, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s*/u, "")
    .replace(/\s+/gu, " ")
    .replace(/^[,;:\-\s]+|[,;:\-\s]+$/gu, "")
    .trim();
}

function splitSummaryTextIntoCandidates(content: string): string[] {
  return cleanSummaryText(content)
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z"'])|\s+\b(?:and|then|later|subsequently|finally)\b\s+(?=I\b)/gu)
    .map(cleanSummaryCue)
    .filter((cue) => cue.length > 0);
}

function truncateSummaryCue(value: string): string {
  if (value.length <= SUMMARY_CUE_SNIPPET_CHARS) {
    return value;
  }
  return `${value.slice(0, SUMMARY_CUE_SNIPPET_CHARS - 3)}...`;
}

function extractSummaryCueCandidates(turn: EvidenceTurn): string[] {
  const isAssistant = turn.role.toLowerCase() === "assistant";
  const cues = splitSummaryTextIntoCandidates(turn.content).filter((cue) => {
    if (cue.length < 10) {
      return false;
    }
    if (isAssistant && SUMMARY_GENERIC_ASSISTANT_PATTERN.test(cue)) {
      return false;
    }
    return !/\b(?:example communication|email\/message)\b/iu.test(cue);
  });
  return [...new Set(cues)]
    .slice(0, SUMMARY_MAX_CUES_PER_TURN)
    .map(truncateSummaryCue);
}

function extractSummaryValueAnchors(turn: EvidenceTurn): string[] {
  const isAssistant = turn.role.toLowerCase() === "assistant";
  const anchors = splitSummaryTextIntoCandidates(turn.content).filter((cue) => {
    if (cue.length < 10) {
      return false;
    }
    if (isAssistant && SUMMARY_GENERIC_ASSISTANT_PATTERN.test(cue)) {
      return false;
    }
    return SUMMARY_VALUE_ANCHOR_PATTERN.test(cue);
  });
  return [...new Set(anchors)]
    .slice(0, SUMMARY_MAX_VALUE_ANCHORS_PER_TURN)
    .map(truncateSummaryCue);
}

function formatSummaryTurnChecklist(turn: EvidenceTurn): string {
  const candidates = extractCountTurnCandidates(turn);
  const cues = extractSummaryCueCandidates(turn);
  const cueLabel =
    turn.role.toLowerCase() === "assistant" ? "assistant guidance" : "user themes";
  const cueText =
    cues.length > 0
      ? cues.map((cue, index) => `${index + 1}) ${cue}`).join("; ")
      : "(no high-level cues extracted; inspect the evidence turn)";
  const metadata = [
    candidates.dates.length > 0
      ? `dates: ${formatCountCandidateValues(candidates.dates)}`
      : undefined,
    candidates.durations.length > 0
      ? `durations: ${formatCountCandidateValues(candidates.durations)}`
      : undefined,
    candidates.quantities.length > 0
      ? `quantities: ${formatCountCandidateValues(candidates.quantities)}`
      : undefined,
  ].filter((entry): entry is string => entry !== undefined);
  return [
    `- #${turn.sourceId} ${cueLabel}: ${cueText}`,
    ...metadata.map((entry) => `  ${entry}`),
  ].join("\n");
}

function formatSummaryValueAnchors(ordered: readonly EvidenceTurn[]): string {
  const lines = ordered.flatMap((turn) => {
    const anchors = extractSummaryValueAnchors(turn);
    if (anchors.length === 0) {
      return [];
    }
    return [
      `- #${turn.sourceId}: ${anchors
        .map((anchor, index) => `${index + 1}) ${anchor}`)
        .join("; ")}`,
    ];
  });
  if (lines.length === 0) {
    return "(no extra value-bearing anchors detected; use the source coverage checklist)";
  }
  return [
    "Include these value-bearing anchors even when they appear late in a long source turn:",
    ...lines,
  ].join("\n");
}

function formatSummaryRequiredCoverage(ordered: readonly EvidenceTurn[]): string {
  const sourceIds = ordered.map((turn) => `#${turn.sourceId}`).join(", ");
  return [
    `Required source coverage: cover every listed source id before ending the summary: ${sourceIds}.`,
    "Do not stop after the first coherent narrative arc; if later source ids shift to values, finances, legal steps, meetings, tools, metrics, or logistics, include those as late-stage themes rather than dropping them.",
    "If several adjacent source ids repeat the same theme, merge them briefly but still preserve the later theme and any concrete dates, quantities, people, tools, or decisions.",
  ].join("\n");
}

export function formatSummaryCoverageChecklist(ordered: readonly EvidenceTurn[]): string {
  if (ordered.length === 0) {
    return [
      "Summary coverage checklist:",
      "(no evidence)",
    ].join("\n");
  }
  return [
    "Summary coverage checklist:",
    "Use these source-ordered cues as coverage anchors before writing prose. Make user-stated facts, dates, quantities, preferences, and decisions the backbone; include assistant guidance only when it records advice, options, or steps that answer the user's summarized workflow.",
    formatSummaryRequiredCoverage(ordered),
    "Value-bearing summary anchors:",
    formatSummaryValueAnchors(ordered),
    ...ordered.map(formatSummaryTurnChecklist),
  ].join("\n");
}
