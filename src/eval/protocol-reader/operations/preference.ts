// Preference-following guides: constraint and support selection.

import type { EvidenceTurn } from "../evidenceShared";
import { uniquePreservingOrder } from "../evidenceShared";
import {
  formatInstructionSupportTurns,
  INSTRUCTION_SUPPORT_MAX_TURNS,
  instructionSupportTopicTokens,
} from "./instruction";

const PREFERENCE_CONSTRAINT_PATTERN =
  /\b(?:prefer|preference|avoid|rather|instead\s+of|over\s+manual|automated|automation|lightweight|minimal\s+dependencies|unnecessary\s+complexity|step-by-step|detailed\s+proofs?|clear\s+logical|diagrams?|concrete\s+examples?|morning\s+self-care|directly\s+in|without\s+attach)\b/iu;

export function selectPreferenceConstraintIndexes(
  ordered: readonly EvidenceTurn[],
): Set<number> {
  const selected = new Set<number>();
  ordered.forEach((turn, index) => {
    if (
      turn.role.toLowerCase() === "user" &&
      PREFERENCE_CONSTRAINT_PATTERN.test(turn.content)
    ) {
      selected.add(index);
    }
  });
  return selected;
}

function preferenceSupportOverlapScore(input: {
  queryTokens: ReadonlySet<string>;
  turn: EvidenceTurn;
}): number {
  if (input.turn.role.toLowerCase() === "assistant") {
    return 0;
  }
  const turnTokens = instructionSupportTopicTokens(input.turn.content);
  return [...input.queryTokens].filter((token) => turnTokens.has(token)).length;
}

export function selectPreferenceSupportTurns(input: {
  ordered: readonly EvidenceTurn[];
  question: string;
}): EvidenceTurn[] {
  const queryTokens = instructionSupportTopicTokens(input.question);
  if (queryTokens.size === 0) {
    return [];
  }
  return input.ordered
    .map((turn, index) => ({
      index,
      score: preferenceSupportOverlapScore({ queryTokens, turn }),
      turn,
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, INSTRUCTION_SUPPORT_MAX_TURNS)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.turn);
}

export function formatPreferenceSupport(input: {
  question: string;
  turns: readonly EvidenceTurn[];
}): string {
  const supportLines = [
    `- Requested task: ${input.question}`,
    formatInstructionSupportTurns({
      question: input.question,
      turns: input.turns,
    }),
  ];
  return supportLines.join("\n");
}

function extractPreferenceRequirements(value: string): string[] {
  const requirements: string[] = [];
  if (
    /\b(?:lightweight|minimal\s+dependenc(?:y|ies)|simplicity|maintainability)\b/iu.test(
      value,
    )
  ) {
    requirements.push("recommend lightweight/minimal-dependency options");
  }
  if (
    /\b(?:avoid|without|unnecessary)\s+(?:unnecessary\s+)?complexity\b/iu.test(
      value,
    )
  ) {
    requirements.push("avoid unnecessary complexity");
  }
  if (
    /\b(?:automated|automation|over\s+manual|manual\s+deployment)\b/iu.test(
      value,
    )
  ) {
    requirements.push(
      "favor automated workflow/status monitoring over manual tracking",
    );
  }
  if (
    /\b(?:step-by-step|clear\s+logical|logical\s+explanations?|proofs?|diagrams?)\b/iu.test(
      value,
    )
  ) {
    requirements.push(
      "include step-by-step reasoning with clear logic and diagrams when requested",
    );
  }
  if (/\bconcrete\s+examples?\b/iu.test(value)) {
    requirements.push("include concrete examples");
  }
  if (
    /\b(?:directly\s+in|without\s+attach|separate\s+attachments?|separate\s+files?|separate\s+documents?)\b/iu.test(
      value,
    )
  ) {
    requirements.push("embed links directly in the response");
  }
  if (
    /\b(?:separate\s+attachments?|separate\s+files?|separate\s+documents?|without\s+attach)\b/iu.test(
      value,
    )
  ) {
    requirements.push("avoid separate attachments");
  }
  if (
    /\b(?:morning\s+self-care|morning\s+routines?|daytime\s+energy|morning\b)\b/iu.test(
      value,
    )
  ) {
    requirements.push("focus on morning activities that improve daytime energy");
  }
  if (
    /\b(?:logical\s+analysis|practical\s+considerations?|reasoned\s+decision|impulsive|emotional)\b/iu.test(
      value,
    )
  ) {
    requirements.push(
      "emphasize practical/logical analysis over emotional or impulsive factors",
    );
  }
  return uniquePreservingOrder(requirements);
}

export function formatPreferenceRequirements(input: {
  question: string;
  turns: readonly EvidenceTurn[];
}): string {
  const requirements = uniquePreservingOrder([
    ...extractPreferenceRequirements(input.question),
    ...input.turns.flatMap((turn) =>
      extractPreferenceRequirements(turn.content),
    ),
  ]);
  const lines = [
    "Preference response requirements:",
    "- Make the stated preference visible in the answer; do not only answer the base task.",
  ];
  lines.push(...requirements.map((requirement) => `- ${requirement}`));
  return lines.join("\n");
}
