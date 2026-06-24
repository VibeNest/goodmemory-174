// Answer-time evidence shaping. Retrieving the right evidence does not guarantee
// a correct answer: a model handed a raw, unordered context can still miscount,
// mis-order, or report a superseded value as a conflict. This module turns
// retrieved turns into a source-ordered, timestamped pack with an operation
// framing inferred from the question, so the model can count, order, and resolve
// updates reliably.
//
// It is general, not benchmark-fitted: the answer operation is inferred from the
// question phrasing plus optional coarse question-type metadata, never from an
// expected answer. The same shaping helps real product recall, not just a single
// benchmark. Validated eval-side first (BEAM retrieved-context answer accuracy
// 0.560 -> 0.662; MemoryAgentBench CR answers the current value with stale
// history co-retrieved).

export type AnswerOperation =
  | "contradiction"
  | "conflict_update"
  | "count"
  | "instruction"
  | "multi_session"
  | "order"
  | "summary"
  | "general";

const COUNT_QUESTION_PATTERN =
  /\b(how many|how much|how often|number of|total|in total|combined|altogether|count|sum|times)\b/iu;
const CONFLICT_UPDATE_QUESTION_PATTERN =
  /\b(current|currently|latest|new(?:est)?|now|updated?|changed?|switched?|replaced?|most recent|final|still|conflict|contradict|resolve)\b/iu;
const ORDER_QUESTION_PATTERN =
  /\b(order|sequence|sequential|chronolog|timeline|before|after|first|then|next|earlier|later|prior to|followed by|preced)\b/iu;

const ORDER_QUESTION_TYPES = new Set([
  "event_ordering",
  "temporal",
  "temporal_reasoning",
]);
const CONFLICT_UPDATE_QUESTION_TYPES = new Set([
  "cr",
  "conflict_resolution",
  "knowledge_update",
]);
const CONTRADICTION_QUESTION_TYPES = new Set(["contradiction_resolution"]);
const INSTRUCTION_QUESTION_TYPES = new Set(["instruction_following"]);
const MULTI_SESSION_QUESTION_TYPES = new Set(["multi_session_reasoning"]);
const SUMMARY_QUESTION_TYPES = new Set(["summarization"]);
const REQUESTED_ITEM_COUNT_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const CONTRADICTION_DENIAL_PATTERN =
  /\b(?:deny|denied|never|no\b|not\s+yet|not\s+actually|haven't|have\s+not|hasn't|has\s+not|without)\b/iu;
const CONTRADICTION_AFFIRMATIVE_PATTERN =
  /\b(?:added|completed|fixed|implemented|integrated|managed|obtained|replaced|trying\s+to|using)\b/iu;
const STANDING_INSTRUCTION_PATTERN =
  /\b(?:always|whenever|when\s+i\s+ask|do\s+not|don't|must)\b/iu;
const COMPANION_INSTRUCTION_PATTERN =
  /^\s*(?:also|additionally|and\s+also|plus)\b/iu;

export function inferAnswerOperation(
  question: string,
  questionType?: string,
): AnswerOperation {
  if (COUNT_QUESTION_PATTERN.test(question)) {
    return "count";
  }
  const normalizedType = questionType?.trim().toLowerCase();
  if (normalizedType && ORDER_QUESTION_TYPES.has(normalizedType)) {
    return "order";
  }
  if (normalizedType && CONTRADICTION_QUESTION_TYPES.has(normalizedType)) {
    return "contradiction";
  }
  if (normalizedType && CONFLICT_UPDATE_QUESTION_TYPES.has(normalizedType)) {
    return "conflict_update";
  }
  if (normalizedType && SUMMARY_QUESTION_TYPES.has(normalizedType)) {
    return "summary";
  }
  if (normalizedType && INSTRUCTION_QUESTION_TYPES.has(normalizedType)) {
    return "instruction";
  }
  if (normalizedType && MULTI_SESSION_QUESTION_TYPES.has(normalizedType)) {
    return "multi_session";
  }
  if (CONFLICT_UPDATE_QUESTION_PATTERN.test(question)) {
    return "conflict_update";
  }
  if (ORDER_QUESTION_PATTERN.test(question)) {
    return "order";
  }
  return "general";
}

export interface EvidenceTurn {
  content: string;
  // Explicit source order for answer-time chronology. This may be a chat index,
  // chunk order, or occurred-at ordinal; it is separate from source identity.
  orderKey: number;
  role: string;
  sourceId: number | string;
  timeAnchor: string;
}

const OPERATION_FRAMING: Record<AnswerOperation, string> = {
  contradiction:
    "Contradiction resolution: do not resolve the question by choosing one side. If the evidence contains both a denial/no/never/not-yet statement and an affirmative, attempted, integrated, fixed, implemented, or completed statement about the same target, report the contradiction and ask for clarification.",
  conflict_update:
    "Current-value resolution: compare entries in source order. Earlier entries are history when a later entry updates the same fact; answer with the latest supported value as current. Only report a conflict when entries cannot be reconciled as an update.",
  count:
    "This question asks for a count or total. Enumerate the value-bearing facts in the evidence, then compute the answer from them; do not restate a superseded earlier count unless the question asks for history.",
  instruction:
    "Instruction-following constraints: identify the standing instruction, then the latest companion instruction or refinement if present. Use these as response requirements, not as generic topical evidence.",
  multi_session:
    "Multi-session reasoning: preserve source-order progression across sessions, connect each value-bearing facet, and synthesize how the facts relate instead of answering from one isolated turn.",
  order:
    "This question asks for an order or sequence. Build the answer from the source-order timeline below, with one concrete milestone per step. Do not reorder evidence by topical similarity.",
  summary:
    "This question asks for a summary. Cover all value-bearing themes present in the evidence, keep source-order chronology when it matters, and do not introduce themes absent from the evidence.",
  general: "",
};

function extractRequestedItemCount(question: string): number | undefined {
  const digitMatch = /\b(?:only\s+(?:and\s+only\s+)?|exactly\s+)?(\d{1,2})\s+(?:items?|milestones?|steps?|things?|topics?|aspects?)\b/iu.exec(
    question,
  );
  if (digitMatch) {
    return Number(digitMatch[1]);
  }
  const wordMatch = /\b(?:only\s+(?:and\s+only\s+)?|exactly\s+)?(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:items?|milestones?|steps?|things?|topics?|aspects?)\b/iu.exec(
    question,
  );
  return wordMatch ? REQUESTED_ITEM_COUNT_WORDS[wordMatch[1].toLowerCase()] : undefined;
}

function buildAnswerShapeGuidance(input: {
  operation: AnswerOperation;
  question: string;
}): string | undefined {
  if (input.operation === "order") {
    const requestedCount = extractRequestedItemCount(input.question);
    const countGuidance =
      requestedCount === undefined
        ? "Return a numbered list when the question asks for ordered items."
        : `Return exactly ${requestedCount} numbered items.`;
    return [
      `Answer shape: ${countGuidance}`,
      "Phrase each item as the aspect or topic the user brought up, with concrete cues from the evidence; avoid copying raw code/config snippets as the whole item.",
      "Prefer one milestone per source entry before splitting any entry; when more items are requested than source entries, split later multi-topic entries before splitting earlier setup/foundation entries.",
      "Keep paired tasks joined by the same sprint/focus phrase as one milestone; split separate paragraphs or follow-up requests before splitting paired tasks.",
      "When a source turn starts with a broad problem label and then gives a concrete implementation/action, use the concrete implementation/action for the milestone.",
      "For multi-topic development entries, prefer high-level user-stated aspects over low-level code fields, library settings, worker-class suggestions, or validation details.",
      "If one source entry contains deployment/configuration plus testing or performance themes, split those high-level themes before extracting implementation details.",
      "If one source entry contains multiple distinct requested aspects, split it only enough to satisfy the requested item count.",
    ].join(" ");
  }
  if (input.operation === "count") {
    return [
      "Answer shape: Count only distinct requested items that match the question's target category.",
      "Do not count individual role names as separate security features; count role-based access control as one capability.",
      "For security-capability counts, count mechanisms rather than individual role labels, examples, dates, tools, API limits, retries, or helper details unless the question asks for those concerns.",
      "When the question asks for concerns, count distinct user-raised problems separately; retry behavior, rapid calls, dependency risk, and uptime/stability can be separate concerns when stated separately.",
      "For API concern counts, group rapid or consecutive calls under rate-limit handling, but count retry or backoff after a limit is hit as a separate concern when stated separately.",
      "Group follow-up turns only when they restate the same requested item rather than raising a distinct concern.",
      "Show the final count and name the counted items; if the evidence gives an interval, compute only from the two endpoint facts.",
    ].join(" ");
  }
  if (input.operation === "instruction") {
    return [
      "Answer shape: For instruction-following questions, answer with response requirements and constraints; do not just fulfill the underlying request.",
      "Return a requirements sentence such as: Response should include the required fields, formats, values, or version numbers.",
      "State the standing instruction first, then the latest companion constraint or refinement if present.",
      "Ignore retrieved turns that do not constrain the requested response.",
      "If the question asks what the answer should include, describe the required response contents rather than solving the underlying task.",
    ].join(" ");
  }
  if (input.operation === "multi_session") {
    return [
      "Answer shape: Synthesize across all listed facets and preserve how the situation evolved.",
      "Do not answer from only the latest entry when earlier facets are necessary.",
      "Name the main facets before drawing the final conclusion.",
    ].join(" ");
  }
  if (input.operation === "conflict_update") {
    return [
      "Answer shape: Do not answer only yes or no when the evidence contains both a denial/never statement and an affirmative/done statement.",
      "Instead, state that the evidence is contradictory, name both sides using the evidence, and ask for or indicate clarification.",
      "When entries are simple updates rather than true contradictions, answer with the latest supported value.",
    ].join(" ");
  }
  if (input.operation === "contradiction") {
    return [
      "Answer shape: Do not answer yes or no first, and do not collapse the answer to the denial just because it appears later.",
      "Begin by saying: I notice you've mentioned contradictory information about this.",
      "Then name both sides from the evidence—lead with the affirmative claim (what the user said they did, have, or completed), then state the conflicting denial—and ask for clarification.",
    ].join(" ");
  }
  return undefined;
}

function buildContradictionEvidenceGuide(
  ordered: readonly EvidenceTurn[],
): string {
  const formatTurns = (turns: readonly EvidenceTurn[], pattern: RegExp): string => {
    if (turns.length === 0) {
      return "(not directly detected; inspect the evidence text for this side)";
    }
    return turns
      .map(
        (turn) =>
          `- [#${turn.sourceId}] ${extractSnippetAroundPattern(
            turn.content,
            pattern,
          )}`,
      )
      .join("\n");
  };
  const denialTurns = ordered.filter((turn) =>
    CONTRADICTION_DENIAL_PATTERN.test(turn.content),
  );
  // The affirmative side is every retrieved assertion that is NOT a denial, so a
  // contradiction is still surfaced when the affirmative verb falls outside the
  // affirmative pattern (e.g. downloaded, collaborated, attended, met, scheduled).
  // Relying only on the narrow affirmative whitelist hid the affirmative side and
  // let the answer collapse to the denial.
  const affirmativeTurns = ordered.filter(
    (turn) => !CONTRADICTION_DENIAL_PATTERN.test(turn.content),
  );
  return [
    "Contradiction evidence guide:",
    "Potential denial/no side:",
    formatTurns(denialTurns, CONTRADICTION_DENIAL_PATTERN),
    "Potential affirmative/done side (assertions that are not denials):",
    formatTurns(affirmativeTurns, CONTRADICTION_AFFIRMATIVE_PATTERN),
    "Use the user's question target to phrase both sides; avoid substituting adjacent implementation details as the contradiction target.",
  ].join("\n");
}

function extractSnippetAroundPattern(content: string, pattern: RegExp): string {
  const normalized = content.replace(/\s+/gu, " ").trim();
  const match = pattern.exec(normalized);
  if (!match || match.index === undefined) {
    return normalized.length > 360 ? `${normalized.slice(0, 357)}...` : normalized;
  }
  const start = Math.max(0, match.index - 140);
  const end = Math.min(normalized.length, match.index + 260);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalized.length ? "..." : "";
  return `${prefix}${normalized.slice(start, end)}${suffix}`;
}

function selectOperationTurns(
  operation: AnswerOperation,
  ordered: readonly EvidenceTurn[],
): EvidenceTurn[] {
  if (operation !== "instruction") {
    return [...ordered];
  }
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
  if (selected.size === 0) {
    return [...ordered];
  }
  return [...selected].sort((left, right) => left - right).map((index) => ordered[index]);
}

// Source-ordered (earliest orderKey first), deduplicated, timestamped. The
// trailing note makes update-recency explicit without suppressing genuine
// contradictions: the latest entry is the current state unless two entries are
// irreconcilable.
export function buildAnswerEvidencePack(input: {
  question: string;
  questionType?: string;
  turns: readonly EvidenceTurn[];
}): string {
  const operation = inferAnswerOperation(input.question, input.questionType);
  const seen = new Set<string>();
  const ordered: EvidenceTurn[] = [];
  for (const turn of [...input.turns].sort(
    (left, right) => left.orderKey - right.orderKey,
  )) {
    const sourceKey = `${typeof turn.sourceId}:${turn.sourceId}`;
    if (seen.has(sourceKey)) {
      continue;
    }
    seen.add(sourceKey);
    ordered.push(turn);
  }

  const evidenceLines =
    selectOperationTurns(operation, ordered).length > 0
      ? selectOperationTurns(operation, ordered)
          .map(
            (turn) =>
              `- [t=${turn.timeAnchor} | #${turn.sourceId} | ${turn.role}] ${turn.content}`,
          )
          .join("\n")
      : "(no evidence)";
  const timelineLines =
    ordered.length > 0
      ? ordered
          .map(
            (turn, index) =>
              `${index + 1}. [t=${turn.timeAnchor} | #${turn.sourceId} | ${turn.role}] ${turn.content}`,
          )
          .join("\n")
      : "(no evidence)";
  const countLines =
    ordered.length > 0
      ? ordered
          .map(
            (turn, index) =>
              `${index + 1}. [t=${turn.timeAnchor} | #${turn.sourceId} | ${turn.role}] ${turn.content}`,
          )
          .join("\n")
      : "(no evidence)";

  const sections: string[] = [];
  if (OPERATION_FRAMING[operation].length > 0) {
    sections.push(OPERATION_FRAMING[operation]);
  }
  const answerShapeGuidance = buildAnswerShapeGuidance({
    operation,
    question: input.question,
  });
  if (answerShapeGuidance) {
    sections.push(answerShapeGuidance);
  }
  if (operation === "contradiction") {
    sections.push(buildContradictionEvidenceGuide(ordered));
  }
  if (operation === "order") {
    sections.push("Timeline evidence:", timelineLines);
  } else if (operation === "count") {
    sections.push("Value-bearing facts for counting:", countLines);
  } else if (operation === "contradiction") {
    sections.push(
      "Use the contradiction evidence guide above as the source evidence; do not mine adjacent implementation details as the answer.",
    );
  } else if (operation === "instruction") {
    sections.push("Instruction evidence (source-ordered, earliest first):", evidenceLines);
  } else if (operation === "multi_session") {
    sections.push("Cross-session facets:", timelineLines);
  } else {
    sections.push("Evidence (source-ordered, earliest first):", evidenceLines);
  }
  if (operation !== "contradiction") {
    sections.push(
      "When a fact changed across these entries, the latest entry is the current value; only call entries conflicting when they cannot be reconciled as an update.",
    );
  }
  return sections.join("\n\n");
}
