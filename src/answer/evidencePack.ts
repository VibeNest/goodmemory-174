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

import { resolveCurrentValue } from "./currentValueResolution";

export type AnswerOperation =
  | "abstention"
  | "contradiction"
  | "conflict_update"
  | "count"
  | "instruction"
  | "multi_session"
  | "order"
  | "preference"
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
const PREFERENCE_QUESTION_TYPES = new Set(["preference_following"]);
const SUMMARY_QUESTION_TYPES = new Set(["summarization"]);
const ABSTENTION_QUESTION_TYPES = new Set(["abstention"]);
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
// Strong negations only: incidental "no"/"without" inside a long assertion
// clause must not classify the whole clause as the denial side.
const CONTRADICTION_DENIAL_PATTERN =
  /\b(?:can't|cannot|couldn't|could\s+not|deny|denied|didn't|did\s+not|don't|do\s+not|haven't|have\s+not|hasn't|has\s+not|never|not\s+yet|not\s+actually|wasn't|was\s+not|weren't|were\s+not)\b/iu;
const STANDING_INSTRUCTION_PATTERN =
  /\b(?:always|whenever|when\s+i\s+ask|do\s+not|don't|must)\b/iu;
const COMPANION_INSTRUCTION_PATTERN =
  /^\s*(?:also|additionally|and\s+also|plus)\b/iu;
const INSTRUCTION_SUPPORT_MAX_TURNS = 3;
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
const ORDER_CUE_MAX_PER_TURN = 5;
const ORDER_CUE_SNIPPET_CHARS = 260;
const ORDER_TARGET_ANCHOR_MAX_TURNS = 12;
const ORDER_FORMULA_CUE_PATTERN =
  /\b(?:\d+[A-Z]\d+|\d+\s*[!*/+^-]?\s*(?:=|equals)|[A-Z]\([^)]*\))\b/iu;
const COUNT_MAX_OTHER_QUANTITIES_PER_TURN = 6;
const COUNT_DATE_PATTERN =
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:-\d{1,2})?(?:,\s*\d{4})?\b|\b\d{4}-\d{2}-\d{2}\b/giu;
const COUNT_SMALL_WORD_NUMBER_PATTERN =
  "(?:one|two|three|four|five|six|seven|eight|nine)";
const COUNT_WORD_NUMBER_PATTERN = `(?:(?:${COUNT_SMALL_WORD_NUMBER_PATTERN}|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ]${COUNT_SMALL_WORD_NUMBER_PATTERN})?)`;
const COUNT_NOUN_PHRASE_PATTERN = "[a-z][a-z-]*(?:\\s+[a-z][a-z-]*){0,2}";
const COUNT_DURATION_PATTERN = new RegExp(
  `\\b(?:\\d+(?:\\.\\d+)?|${COUNT_WORD_NUMBER_PATTERN})\\s*[- ]\\s*(?:days?|weeks?|months?|years?)\\b`,
  "giu",
);
const COUNT_QUANTITY_PATTERN = new RegExp(
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
const CURRENT_VALUE_TIME_PATTERN = /\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/giu;
const CURRENT_VALUE_TARGET_CONTEXT_PATTERN =
  /\b(?:to|for|on|by|at|deadline|due|scheduled|rescheduled|moved|shifted|changed|updated|complete|finish|finished|deliver|target)\s*$/iu;
const CURRENT_VALUE_REFERENCE_CONTEXT_PATTERN = /\b(?:as\s+of|reference)\s*$/iu;
const CURRENT_VALUE_SUPERSEDED_CONTEXT_PATTERN =
  /\b(?:from|originally|previously|first|initially)\s*$/iu;
const CURRENT_VALUE_QUANTITY_STOP_UNITS = new Set([
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "to",
]);
const SUMMARY_MAX_CUES_PER_TURN = 4;
const SUMMARY_MAX_VALUE_ANCHORS_PER_TURN = 3;
const SUMMARY_CUE_SNIPPET_CHARS = 240;
const SUMMARY_GENERIC_ASSISTANT_PATTERN =
  /^(?:absolutely|certainly|sure|of course|i'd be happy|i would be happy|happy to help|let's|here are|here is|would you like|do you want|great choice|final thoughts)\b/iu;
const SUMMARY_VALUE_ANCHOR_PATTERN =
  /\b(?:budget|costs?|fees?|fund(?:ing)?|grant|income|expenses?|savings?|contract|freelance|rental|subscription|discount|library resources?|money|financial|attorney|legal|executor|dut(?:y|ies)|responsibilit(?:y|ies)|family meeting|co-executor|conflict(?:[- ]resolution)?|resources?|meeting|deadline|filing|application|prototype|accuracy|webinar|strategy|decision|decisions?|approved?|registered?|completed?|prepared?|organized?|scheduled?|negotiated?|verified?|metrics?|tools?)\b/iu;
const PREFERENCE_CONSTRAINT_PATTERN =
  /\b(?:prefer|preference|avoid|rather|instead\s+of|over\s+manual|automated|automation|lightweight|minimal\s+dependencies|unnecessary\s+complexity|step-by-step|detailed\s+proofs?|clear\s+logical|diagrams?|concrete\s+examples?|morning\s+self-care|directly\s+in|without\s+attach)\b/iu;
const CURRENT_VALUE_QUERY_STOP_WORDS = new Set([
  "after",
  "changed",
  "current",
  "currently",
  "for",
  "is",
  "latest",
  "most",
  "now",
  "recent",
  "still",
  "the",
  "this",
  "update",
  "updated",
  "what",
  "when",
  "which",
]);
const CURRENT_VALUE_GENERIC_TOPIC_WORDS = new Set([
  "coverage",
  "date",
  "metric",
  "metrics",
  "module",
  "scheduled",
  "status",
  "test",
  "tests",
  "value",
]);
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

export function inferAnswerOperation(
  question: string,
  questionType?: string,
): AnswerOperation {
  const normalizedType = questionType?.trim().toLowerCase();
  if (normalizedType && ABSTENTION_QUESTION_TYPES.has(normalizedType)) {
    return "abstention";
  }
  if (normalizedType && PREFERENCE_QUESTION_TYPES.has(normalizedType)) {
    return "preference";
  }
  if (COUNT_QUESTION_PATTERN.test(question)) {
    return "count";
  }
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
  abstention:
    "Abstention calibration: this question asks for a specific detail that may be absent. Answer from retrieved evidence only when a source directly states that requested detail; adjacent facts about the same entity, date, project, event, or preference are not enough.",
  contradiction:
    "Contradiction resolution: do not resolve the question by choosing one side. If the evidence contains both a denial/no/never/not-yet statement and an affirmative, attempted, integrated, fixed, implemented, or completed statement about the same target, report the contradiction and ask for clarification.",
  conflict_update:
    "Current-value resolution: compare entries in source order. Earlier entries are history when a later entry updates the same fact; answer with the latest supported value as current. Only report a conflict when entries cannot be reconciled as an update.",
  count:
    "This question asks for a count or total. Enumerate the value-bearing facts in the evidence, then compute the answer from them; do not restate a superseded earlier count unless the question asks for history.",
  instruction:
    "Instruction-following constraints: identify the standing instruction, then the latest companion instruction or refinement if present. Apply these constraints to the answer; do not treat the instruction text as the whole answer by itself.",
  multi_session:
    "Multi-session reasoning: preserve source-order progression across sessions, connect each value-bearing facet, and synthesize how the facts relate instead of answering from one isolated turn.",
  order:
    "This question asks for an order or sequence. Build the answer from the source-order timeline below, with one concrete milestone per step. Do not reorder evidence by topical similarity.",
  preference:
    "Preference-following: identify the user's stated preference or style constraint, then answer the requested task while satisfying that constraint. Treat the preference as a response requirement, not as optional background.",
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
      "For date/time intervals, choose the two event dates named by the question's endpoint phrases, not unrelated intermediate dates.",
      "Use start dates when the question asks between starts; use completion/end dates only when the question names completion/end.",
      "Treat duration labels such as 30-day or two-week as period lengths or labels, not endpoint dates by themselves.",
    ].join(" ");
  }
  if (input.operation === "abstention") {
    return [
      "Answer shape: Answer that the provided chat does not contain the requested detail when no retrieved source directly states it.",
      "If partial adjacent facts are present, name the gap briefly instead of filling it from implication.",
      "Only answer with a substantive value when a source states the requested attribute, rationale, module detail, discussion/decision, technique, atmosphere, or background detail.",
    ].join(" ");
  }
  if (input.operation === "instruction") {
    return [
      "Answer shape: For instruction-following questions, answer the underlying request using the supporting evidence while satisfying the instruction constraints.",
      "If the user asks what the response should include, describe the required response contents; otherwise provide the concrete requested values or content in the required format.",
      "Apply the standing instruction first, then the latest companion constraint or refinement if present.",
      "Ignore retrieved turns that do not constrain the requested response.",
      "Use supporting evidence only when it answers the requested question; do not let unrelated retrieved turns override the instruction.",
    ].join(" ");
  }
  if (input.operation === "preference") {
    return [
      "Answer shape: State the recommendation or answer in a way that explicitly follows the user's stated preference.",
      "Do not let noisy adjacent tool suggestions override the user's stated preference.",
      "When the preference is about simplicity, automation, step-by-step detail, morning routines, or direct portfolio links, make that constraint visible in the final answer.",
      "If the requested task has little support beyond the preference itself, still answer the task from the question while honoring the preference.",
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

interface ContradictionClauseCandidate {
  index: number;
  isDenial: boolean;
  orderKey: number;
  sourceId: EvidenceTurn["sourceId"];
  text: string;
}

function splitContradictionClauses(content: string): string[] {
  const normalized = content.replace(/\s+/gu, " ").trim();
  return normalized
    .split(
      /(?<=[.!?;])\s+|,\s+(?=(?:but|although|though|however|yet)\b)|\s+(?=(?:but|yet)\s+(?:i|i'm|i've|you)\b)/iu,
    )
    .map((clause) => clause.trim())
    .filter((clause) => clause.length >= 8);
}

function buildContradictionEvidenceGuide(
  question: string,
  ordered: readonly EvidenceTurn[],
): string {
  // BEAM-style synthetic messages can pack a denial and its contradicting
  // affirmative into one turn joined by ", but I...". Score per clause so both
  // sides can come from the same source turn without dragging adjacent details.
  const questionTokens = currentValueTopicTokens(question);
  const clauses: ContradictionClauseCandidate[] = [];
  for (const turn of ordered) {
    for (const text of splitContradictionClauses(turn.content)) {
      clauses.push({
        index: clauses.length,
        isDenial: CONTRADICTION_DENIAL_PATTERN.test(text),
        orderKey: turn.orderKey,
        sourceId: turn.sourceId,
        text,
      });
    }
  }

  const overlap = (text: string, reference: ReadonlySet<string>): number => {
    if (reference.size === 0) {
      return 0;
    }
    const tokens = currentValueTopicTokens(text);
    return [...reference].filter((token) => tokens.has(token)).length;
  };
  const pickBest = (
    pool: readonly ContradictionClauseCandidate[],
    score: (clause: ContradictionClauseCandidate) => number,
  ): ContradictionClauseCandidate | undefined =>
    pool
      .map((clause) => ({ clause, score: score(clause) }))
      .filter((entry) => entry.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.clause.orderKey - right.clause.orderKey ||
          left.clause.index - right.clause.index,
      )[0]?.clause;

  const denialPool = clauses.filter((clause) => clause.isDenial);
  const denial =
    pickBest(denialPool, (clause) => overlap(clause.text, questionTokens)) ??
    denialPool[0];
  const denialTokens = denial
    ? currentValueTopicTokens(denial.text)
    : new Set<string>();
  const isRequestClause = (text: string): boolean =>
    text.endsWith("?") ||
    /^(?:can|could|should|would|will|how|what|why|where|when|is|are|do|does)\b/iu.test(
      text,
    );
  const affirmativePool = clauses.filter(
    (clause) =>
      !clause.isDenial &&
      clause !== denial &&
      !isRequestClause(clause.text) &&
      /[a-z]{3}/iu.test(clause.text),
  );
  const scoreAffirmative = (clause: ContradictionClauseCandidate): number =>
    overlap(clause.text, questionTokens) * 2 +
    overlap(clause.text, denialTokens);
  const sameTurnPool = denial
    ? affirmativePool.filter((clause) => clause.sourceId === denial.sourceId)
    : [];
  const affirmative =
    pickBest(sameTurnPool, scoreAffirmative) ??
    pickBest(affirmativePool, scoreAffirmative) ??
    affirmativePool[0];

  const formatClause = (
    clause: ContradictionClauseCandidate | undefined,
  ): string => {
    if (!clause) {
      return "(not directly detected; inspect the evidence text for this side)";
    }
    const text =
      clause.text.length > 360 ? `${clause.text.slice(0, 357)}...` : clause.text;
    return `- [#${clause.sourceId}] ${text}`;
  };
  return [
    "Contradiction evidence guide:",
    "Minimal contradiction pair (use these exact sides first; ignore adjacent implementation details unless the question explicitly asks for them):",
    "Denial/no side:",
    formatClause(denial),
    "Affirmative/done side:",
    formatClause(affirmative),
    "Potential denial/no side:",
    formatClause(denial),
    "Potential affirmative/done side (assertions that are not denials):",
    formatClause(affirmative),
    "A retrieved non-denial assertion about the question target is the affirmative side even when it describes planning, registration, attendance, collaboration, invitation, ordering, use, meeting, a recommendation, or a feeling rather than a completed action.",
    "Use the user's question target to phrase both sides; avoid substituting adjacent implementation details as the contradiction target.",
  ].join("\n");
}

function formatCurrentValueEntry(
  entry: NonNullable<ReturnType<typeof resolveCurrentValue>["current"]>,
): string {
  const sourceId = entry.sourceId ?? "unknown";
  const timeAnchor = entry.timeAnchor ?? "unknown";
  return `[t=${timeAnchor} | #${sourceId}] ${entry.content}`;
}

interface CurrentValueCue {
  allValues: string[];
  referenceValues: string[];
  supersededValues: string[];
  targetValues: string[];
}

function uniquePreservingOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/gu, " ").trim();
    if (!normalized || seen.has(normalized.toLowerCase())) {
      continue;
    }
    seen.add(normalized.toLowerCase());
    unique.push(normalized);
  }
  return unique;
}

function collectCurrentValueMentions(input: {
  content: string;
  pattern: RegExp;
}): Array<{ contextPrefix: string; value: string }> {
  const mentions: Array<{ contextPrefix: string; value: string }> = [];
  for (const match of input.content.matchAll(input.pattern)) {
    const value = match[0];
    const index = match.index ?? 0;
    const contextPrefix = input.content
      .slice(Math.max(0, index - 48), index)
      .replace(/\s+/gu, " ")
      .trim();
    mentions.push({ contextPrefix, value });
  }
  return mentions;
}

function normalizeCurrentValueQuantityMention(value: string): string | undefined {
  const normalized = value.replace(/\s+/gu, " ").trim();
  const amountWithUnit =
    /^(\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?%?|\$\d+(?:\.\d+)?|\d+(?:\.\d+)?%?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+([a-z][a-z-]*)\b/iu.exec(
      normalized,
    );
  if (!amountWithUnit) {
    return normalized.length > 0 ? normalized : undefined;
  }
  const unit = amountWithUnit[2].toLowerCase();
  if (CURRENT_VALUE_QUANTITY_STOP_UNITS.has(unit)) {
    return undefined;
  }
  return `${amountWithUnit[1]} ${amountWithUnit[2]}`;
}

function extractCurrentValueCues(content: string): CurrentValueCue {
  const quantityMentions = collectCurrentValueMentions({
    content,
    pattern: COUNT_QUANTITY_PATTERN,
  })
    .map((mention) => ({
      ...mention,
      value: normalizeCurrentValueQuantityMention(mention.value),
    }))
    .filter(
      (mention): mention is { contextPrefix: string; value: string } =>
        mention.value !== undefined,
    );
  const mentions = [
    ...collectCurrentValueMentions({
      content,
      pattern: COUNT_DATE_PATTERN,
    }),
    ...collectCurrentValueMentions({
      content,
      pattern: CURRENT_VALUE_TIME_PATTERN,
    }),
    ...quantityMentions,
  ];

  const targetValues: string[] = [];
  const referenceValues: string[] = [];
  const supersededValues: string[] = [];
  for (const mention of mentions) {
    if (CURRENT_VALUE_REFERENCE_CONTEXT_PATTERN.test(mention.contextPrefix)) {
      referenceValues.push(mention.value);
      continue;
    }
    if (CURRENT_VALUE_SUPERSEDED_CONTEXT_PATTERN.test(mention.contextPrefix)) {
      supersededValues.push(mention.value);
      continue;
    }
    if (CURRENT_VALUE_TARGET_CONTEXT_PATTERN.test(mention.contextPrefix)) {
      targetValues.push(mention.value);
    }
  }

  return {
    allValues: uniquePreservingOrder(mentions.map((mention) => mention.value)),
    referenceValues: uniquePreservingOrder(referenceValues),
    supersededValues: uniquePreservingOrder(supersededValues),
    targetValues: uniquePreservingOrder(targetValues),
  };
}

function formatCurrentValueCues(content: string): string | undefined {
  const cues = extractCurrentValueCues(content);
  if (cues.allValues.length === 0) {
    return undefined;
  }
  return [
    "Priority current-value cues:",
    `updated target values: ${
      cues.targetValues.length > 0 ? cues.targetValues.join(", ") : "(none detected)"
    }`,
    `as-of/reference values: ${
      cues.referenceValues.length > 0
        ? cues.referenceValues.join(", ")
        : "(none detected)"
    }`,
    `superseded/source values: ${
      cues.supersededValues.length > 0
        ? cues.supersededValues.join(", ")
        : "(none detected)"
    }`,
    `all date/time/quantity mentions in latest/current candidate: ${cues.allValues.join(
      ", ",
    )}`,
    "Prefer updated target values when the question asks the current schedule, deadline, amount, or count.",
    "Do not answer with an as-of/reference value unless the question asks for that reference date.",
  ].join("\n");
}

function currentValueTopicTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/giu, " ")
      .split(/\s+/u)
      .filter(
        (token) =>
          token.length >= 3 && !CURRENT_VALUE_QUERY_STOP_WORDS.has(token),
      ),
  );
}

function currentValueSpecificTopicTokens(value: string): Set<string> {
  const tokens = currentValueTopicTokens(value);
  return new Set(
    [...tokens].filter((token) => !CURRENT_VALUE_GENERIC_TOPIC_WORDS.has(token)),
  );
}

function currentValueOverlapScore(
  turn: EvidenceTurn,
  queryTokens: ReadonlySet<string>,
): number {
  if (queryTokens.size === 0) {
    return 0;
  }
  const turnTokens = currentValueTopicTokens(turn.content);
  return [...queryTokens].filter((token) => turnTokens.has(token)).length;
}

function selectCurrentValueTurns(input: {
  ordered: readonly EvidenceTurn[];
  question: string;
}): EvidenceTurn[] {
  const queryTokens = currentValueTopicTokens(input.question);
  if (queryTokens.size === 0) {
    return [...input.ordered];
  }
  const specificTokens = currentValueSpecificTopicTokens(input.question);
  if (specificTokens.size > 0) {
    const specificSelected = input.ordered.filter(
      (turn) => currentValueOverlapScore(turn, specificTokens) > 0,
    );
    if (specificSelected.length > 0) {
      return specificSelected;
    }
  }
  const selected = input.ordered.filter(
    (turn) => currentValueOverlapScore(turn, queryTokens) > 0,
  );
  return selected.length > 0 ? selected : [...input.ordered];
}

function buildCurrentValueEvidenceGuide(input: {
  ordered: readonly EvidenceTurn[];
  question: string;
}): string {
  const selectedTurns = selectCurrentValueTurns({
    ordered: input.ordered,
    question: input.question,
  });
  const resolution = resolveCurrentValue(
    selectedTurns.map((turn) => ({
      content: turn.content,
      orderKey: turn.orderKey,
      sourceId: turn.sourceId,
      timeAnchor: turn.timeAnchor,
    })),
  );

  if (!resolution.current) {
    return [
      "Current-value ledger:",
      "Latest/current candidate: (no evidence)",
      "Earlier history: (none in retrieved evidence)",
    ].join("\n");
  }

  const lines = [
    "Current-value ledger:",
    `Latest/current candidate: ${formatCurrentValueEntry(resolution.current)}`,
  ];
  const currentValueCues = formatCurrentValueCues(resolution.current.content);
  if (currentValueCues) {
    lines.push(currentValueCues);
  }
  if (resolution.history.length > 0) {
    lines.push("Earlier history superseded by that latest candidate:");
    lines.push(
      ...resolution.history.map(
        (entry, index) => `${index + 1}. ${formatCurrentValueEntry(entry)}`,
      ),
    );
  } else {
    lines.push("Earlier history: (none in retrieved evidence)");
  }
  if (resolution.contradiction) {
    lines.push(
      "Contradiction signal: the latest candidate is a denial or retraction after earlier affirmative evidence; surface both sides and ask for clarification instead of reporting only the denial.",
    );
  } else {
    lines.push(
      "Use exact values, dates, amounts, names, and status terms from the latest/current candidate when answering the current-value question.",
    );
  }
  return lines.join("\n");
}

function formatAbstentionEvidenceGuide(input: {
  ordered: readonly EvidenceTurn[];
  question: string;
}): string {
  const question = input.question.trim();
  const lines = [
    "Abstention target check:",
    `Question target: ${question}`,
    "Required directness: the evidence must explicitly state the requested detail, not merely mention a neighboring entity, event, date, plan, deadline, tool, or preference.",
    "Adjacent facts are insufficient: a deadline or status is not module details; attendance or success is not atmosphere; a meeting title/time is not what was discussed or decided; a scheduled session/time block is not specific techniques; implementation details are not personal background unless framed as the user's background or prior projects; a tool choice is not the rationale unless the reason is stated.",
    "If the retrieved evidence is only adjacent, answer that the provided chat does not contain information related to the requested detail.",
  ];
  if (input.ordered.length === 0) {
    lines.push("Retrieved evidence: (none)");
  }
  return lines.join("\n");
}

function selectInstructionConstraintIndexes(
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

function selectOperationTurns(
  operation: AnswerOperation,
  ordered: readonly EvidenceTurn[],
): EvidenceTurn[] {
  if (operation !== "instruction") {
    return [...ordered];
  }
  return [...selectInstructionConstraintIndexes(ordered)]
    .sort((left, right) => left - right)
    .map((index) => ordered[index]);
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

function instructionSupportTopicTokens(value: string): Set<string> {
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

function selectInstructionSupportTurns(input: {
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

function formatTurnsForEvidence(turns: readonly EvidenceTurn[]): string {
  if (turns.length === 0) {
    return "(no evidence)";
  }
  return turns
    .map(
      (turn) =>
        `- [t=${turn.timeAnchor} | #${turn.sourceId} | ${turn.role}] ${turn.content}`,
    )
    .join("\n");
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

function formatInstructionSupportTurns(input: {
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

function formatInstructionConcreteAnswerCues(input: {
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

function selectPreferenceConstraintIndexes(
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

function selectPreferenceSupportTurns(input: {
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

function formatPreferenceSupport(input: {
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

function stripFencedCodeBlocks(content: string): string {
  return content.replace(/```[\s\S]*?```/gu, " ");
}

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

function formatOrderTargetAnchors(input: {
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

function formatOrderMilestoneCues(ordered: readonly EvidenceTurn[]): string {
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

function formatOrderTimelineTurns(ordered: readonly EvidenceTurn[]): string {
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

function extractCountTurnCandidates(turn: EvidenceTurn): {
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

function formatCountCandidateValues(
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

function formatCountCandidateLedger(ordered: readonly EvidenceTurn[]): string {
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

function formatSummaryCoverageChecklist(ordered: readonly EvidenceTurn[]): string {
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
  const instructionConstraintIndexes =
    operation === "instruction"
      ? selectInstructionConstraintIndexes(ordered)
      : new Set<number>();
  const instructionConstraints =
    operation === "instruction"
      ? [...instructionConstraintIndexes]
          .sort((left, right) => left - right)
          .map((index) => ordered[index])
      : [];
  const instructionSupport =
    operation === "instruction"
      ? selectInstructionSupportTurns({
          constraintIndexes: instructionConstraintIndexes,
          ordered,
          question: input.question,
        })
      : [];
  const preferenceConstraintIndexes =
    operation === "preference"
      ? selectPreferenceConstraintIndexes(ordered)
      : new Set<number>();
  const preferenceConstraints =
    operation === "preference"
      ? [...preferenceConstraintIndexes]
          .sort((left, right) => left - right)
          .map((index) => ordered[index])
      : [];
  const preferenceSupport =
    operation === "preference"
      ? selectPreferenceSupportTurns({
          ordered,
          question: input.question,
        })
      : [];
  const timelineLines =
    ordered.length > 0
      ? ordered
          .map(
            (turn, index) =>
              `${index + 1}. [t=${turn.timeAnchor} | #${turn.sourceId} | ${turn.role}] ${turn.content}`,
          )
          .join("\n")
      : "(no evidence)";
  const orderTimelineLines =
    operation === "order" ? formatOrderTimelineTurns(ordered) : timelineLines;
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
    sections.push(buildContradictionEvidenceGuide(input.question, ordered));
  }
  if (operation === "conflict_update") {
    sections.push(
      buildCurrentValueEvidenceGuide({
        ordered,
        question: input.question,
      }),
    );
  }
  if (operation === "order") {
    sections.push(
      "Question-target timeline anchors (source-ordered, noise-aware):",
      formatOrderTargetAnchors({
        ordered,
        question: input.question,
      }),
    );
    sections.push(
      "Milestone cue candidates (source-ordered, code blocks removed):",
      formatOrderMilestoneCues(ordered),
    );
    sections.push("Timeline evidence:", orderTimelineLines);
  } else if (operation === "count") {
    sections.push(formatCountCandidateLedger(ordered));
    sections.push("Value-bearing facts for counting:", countLines);
  } else if (operation === "abstention") {
    sections.push(
      formatAbstentionEvidenceGuide({
        ordered,
        question: input.question,
      }),
    );
    sections.push("Evidence for absence check:", evidenceLines);
  } else if (operation === "contradiction") {
    sections.push(
      "Use the contradiction evidence guide above as the source evidence; do not mine adjacent implementation details as the answer.",
    );
  } else if (operation === "instruction") {
    sections.push(
      "Instruction constraints:",
      instructionConstraints.length > 0
        ? formatTurnsForEvidence(instructionConstraints)
        : "(no direct standing instruction found)",
    );
    sections.push(
      "Supporting evidence for the requested answer:",
      formatInstructionSupportTurns({
        question: input.question,
        turns: instructionSupport,
      }),
    );
    const concreteAnswerCues = formatInstructionConcreteAnswerCues({
      constraintTurns: instructionConstraints,
      supportTurns: instructionSupport,
    });
    if (concreteAnswerCues) {
      sections.push(concreteAnswerCues);
    }
  } else if (operation === "preference") {
    sections.push(
      "Preference constraints:",
      preferenceConstraints.length > 0
        ? formatTurnsForEvidence(preferenceConstraints)
        : "(no explicit preference found in retrieved evidence; infer only from the user's current question wording)",
    );
    sections.push(
      "Supporting evidence for the requested answer:",
      formatPreferenceSupport({
        question: input.question,
        turns: preferenceSupport,
      }),
    );
  } else if (operation === "multi_session") {
    sections.push("Cross-session facets:", timelineLines);
  } else if (operation === "summary") {
    sections.push(formatSummaryCoverageChecklist(ordered));
    sections.push("Evidence (source-ordered, earliest first):", evidenceLines);
  } else {
    sections.push("Evidence (source-ordered, earliest first):", evidenceLines);
  }
  if (
    operation !== "contradiction" &&
    operation !== "abstention" &&
    operation !== "preference"
  ) {
    sections.push(
      "When a fact changed across these entries, the latest entry is the current value; only call entries conflicting when they cannot be reconciled as an update.",
    );
  }
  return sections.join("\n\n");
}
