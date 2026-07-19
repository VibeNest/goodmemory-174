// Ordering/timeline guides: milestone cues and question-target anchors.

import type { EvidenceTurn } from "../evidenceShared";
import { uniquePreservingOrder, stripFencedCodeBlocks } from "../evidenceShared";

const ORDER_CUE_MAX_PER_TURN = 5;

const ORDER_CUE_SNIPPET_CHARS = 260;

const ORDER_TARGET_ANCHOR_MAX_TURNS = 12;

const ORDER_FORMULA_CUE_PATTERN =
  /\b(?:\d+[A-Z]\d+|\d+\s*[!*/+^-]?\s*(?:=|equals)|[A-Z]\([^)]*\))\b/iu;

const ORDER_TARGET_STOP_WORDS = new Set([
  "about",
  "add",
  "added",
  "after",
  "and",
  "aspect",
  "aspects",
  "before",
  "bring",
  "bringing",
  "brought",
  "build",
  "built",
  "chronological",
  "create",
  "created",
  "could",
  "did",
  "earlier",
  "event",
  "events",
  "exactly",
  "feature",
  "features",
  "first",
  "five",
  "four",
  "handle",
  "handled",
  "handling",
  "help",
  "how",
  "implement",
  "implementation",
  "implemented",
  "item",
  "items",
  "last",
  "later",
  "list",
  "mention",
  "mentioned",
  "milestone",
  "milestones",
  "next",
  "nine",
  "only",
  "order",
  "ordered",
  "precede",
  "preceded",
  "prior",
  "question",
  "sequence",
  "sequential",
  "seven",
  "six",
  "step",
  "steps",
  "ten",
  "the",
  "then",
  "things",
  "three",
  "timeline",
  "topic",
  "topics",
  "two",
  "what",
  "when",
  "which",
  "your",
]);

function cleanOrderText(content: string): string {
  return stripFencedCodeBlocks(content)
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\s*->->\s*[\w,/-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function cleanOrderCueClause(value: string): string {
  return value
    .replace(
      /\b(?:can|could)\s+you\s+(?:help\s+me\s+)?(?:review|explain|figure\s+out|enhance|improve|implement|provide|create|suggest)\b/giu,
      "",
    )
    .replace(/\bhere'?s\s+(?:my|an?)\s+[^.?!,;:]+/giu, "")
    .replace(/\s+/gu, " ")
    .replace(/^[,;:\-\s]+|[,;:\-\s]+$/gu, "")
    .trim();
}

function truncateOrderCue(value: string): string {
  if (value.length <= ORDER_CUE_SNIPPET_CHARS) {
    return value;
  }
  return `${value.slice(0, ORDER_CUE_SNIPPET_CHARS - 3)}...`;
}

function extractOrderCueCandidates(content: string): string[] {
  const cleaned = cleanOrderText(content);
  if (!cleaned) {
    return [];
  }
  const clauses = cleaned
    .split(
      /(?<=[.!?])\s+(?=[A-Z"'])|,\s+(?=(?:and|but|so|which|while|after|before|specifically|including|using)\b)|\s+\b(?:and|but)\s+(?=I\b)/gu,
    )
    .map(cleanOrderCueClause)
    .filter((clause) => {
      if (clause.length < 18 && !ORDER_FORMULA_CUE_PATTERN.test(clause)) {
        return false;
      }
      return !/\b(?:example usage|current implementation|sample code)\b/iu.test(
        clause,
      );
    });
  return [...new Set(clauses)]
    .slice(0, ORDER_CUE_MAX_PER_TURN)
    .map(truncateOrderCue);
}

function orderTargetTokens(value: string): Set<string> {
  return new Set(
    [...value.toLowerCase().matchAll(/[\p{L}\p{N}][\p{L}\p{N}'_-]*/gu)]
      .map((match) => match[0].replace(/'s$/u, ""))
      .filter(
        (token) => token.length >= 3 && !ORDER_TARGET_STOP_WORDS.has(token),
      )
      .flatMap((token) => {
        if (token.endsWith("ies") && token.length > 4) {
          return [token, `${token.slice(0, -3)}y`];
        }
        if (token.endsWith("s") && token.length > 3) {
          return [token, token.slice(0, -1)];
        }
        return [token];
      }),
  );
}

export function formatOrderTargetAnchors(input: {
  ordered: readonly EvidenceTurn[];
  question: string;
}): string {
  const queryTokens = orderTargetTokens(input.question);
  if (queryTokens.size === 0 || input.ordered.length === 0) {
    return "(no question-target anchors found; use the full source-order timeline and milestone cues)";
  }
  const anchors = input.ordered
    .map((turn) => {
      const turnTokens = orderTargetTokens(turn.content);
      const overlap = [...queryTokens].filter((token) => turnTokens.has(token));
      return { overlap, turn };
    })
    .filter((candidate) => candidate.overlap.length > 0)
    .slice(0, ORDER_TARGET_ANCHOR_MAX_TURNS);
  if (anchors.length === 0) {
    return "(no question-target anchors found; use the full source-order timeline and milestone cues)";
  }
  const lines = anchors.map(({ overlap, turn }) => {
    const cues = extractOrderCueCandidates(turn.content);
    const cueText =
      cues.length > 0
        ? cues.map((cue, index) => `${index + 1}) ${cue}`).join("; ")
        : truncateOrderCue(cleanOrderText(turn.content));
    return `- [t=${turn.timeAnchor} | #${turn.sourceId} | ${turn.role}] target terms: ${uniquePreservingOrder(
      overlap,
    ).join(", ")}; cues: ${cueText}`;
  });
  return [
    "Use these source-ordered anchors first when retrieved timeline entries include adjacent project noise; use the full timeline only to fill missing requested items.",
    ...lines,
  ].join("\n");
}

export function formatOrderMilestoneCues(ordered: readonly EvidenceTurn[]): string {
  if (ordered.length === 0) {
    return "(no evidence)";
  }
  const lines = ordered.map((turn) => {
    const cues = extractOrderCueCandidates(turn.content);
    const cueText =
      cues.length > 0
        ? cues.map((cue, index) => `${index + 1}) ${cue}`).join("; ")
        : "(no high-level cues extracted; inspect the timeline turn)";
    return `- #${turn.sourceId} cues: ${cueText}`;
  });
  return lines.join("\n");
}

export function formatOrderTimelineTurns(ordered: readonly EvidenceTurn[]): string {
  if (ordered.length === 0) {
    return "(no evidence)";
  }
  return ordered
    .map(
      (turn, index) =>
        `${index + 1}. [t=${turn.timeAnchor} | #${turn.sourceId} | ${turn.role}] ${cleanOrderText(
          turn.content,
        )}`,
    )
    .join("\n");
}
