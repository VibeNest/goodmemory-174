// Contradiction-resolution evidence guide: surface the denial/affirmative
// pair for the question target so the answer names both sides.

import type { EvidenceTurn } from "../evidenceShared";
import { currentValueTopicTokens } from "../evidenceShared";

// Strong negations only: incidental "no"/"without" inside a long assertion
// clause must not classify the whole clause as the denial side.
const CONTRADICTION_DENIAL_PATTERN =
  /\b(?:can't|cannot|couldn't|could\s+not|deny|denied|didn't|did\s+not|don't|do\s+not|haven't|have\s+not|hasn't|has\s+not|never|not\s+yet|not\s+actually|wasn't|was\s+not|weren't|were\s+not)\b/iu;

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

export function buildContradictionEvidenceGuide(
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
    "Minimal contradiction pair (lead with the affirmative side, then name the denial; ignore adjacent implementation details unless the question explicitly asks for them):",
    "Affirmative/done side:",
    formatClause(affirmative),
    "Denial/no side:",
    formatClause(denial),
    "Potential affirmative/done side (assertions that are not denials):",
    formatClause(affirmative),
    "Potential denial/no side:",
    formatClause(denial),
    "Required answer components: say the evidence is contradictory, name the affirmative side, name the denial side, and ask which statement is correct.",
    "A one-sided denial-only or affirmative-only answer is incomplete when both sides are detected above.",
    "A retrieved non-denial assertion about the question target is the affirmative side even when it describes planning, registration, attendance, collaboration, invitation, ordering, use, meeting, a recommendation, or a feeling rather than a completed action.",
    "Preserve weak affirmative wording such as recommended, registered, planned, invited, scheduled, or goal when naming that side; do not upgrade registration to attendance, a recommendation to reading/use, or a goal to completion.",
    "Do not collapse to the denial just because the denial appears later or uses stronger wording; report both sides and ask for clarification.",
    "Use the user's question target to phrase both sides; avoid substituting adjacent implementation details as the contradiction target.",
  ].join("\n");
}
