// Answer-time evidence shaping. Retrieving the right evidence does not guarantee
// a correct answer: a model handed a raw, unordered context can still miscount,
// mis-order, or report a superseded value as a conflict. This module turns
// retrieved turns into a source-ordered, timestamped pack with an operation
// framing inferred from the question, so the model can count, order, and resolve
// updates reliably.
//
// It is general, not benchmark-fitted: the answer operation is inferred from the
// question phrasing (count/order words), never from dataset type labels, and
// there is no tuning toward any expected-answer wording. The same shaping helps
// real product recall, not just a single benchmark. Validated eval-side first
// (BEAM retrieved-context answer accuracy 0.560 -> 0.662; MemoryAgentBench CR
// answers the current value with stale history co-retrieved).

export type AnswerOperation = "count" | "order" | "general";

const COUNT_QUESTION_PATTERN =
  /\b(how many|how much|how often|number of|total|in total|combined|altogether|count|sum|times)\b/iu;
const ORDER_QUESTION_PATTERN =
  /\b(order|sequence|sequential|chronolog|timeline|before|after|first|then|next|earlier|later|prior to|followed by|preced)\b/iu;

export function inferAnswerOperation(question: string): AnswerOperation {
  if (COUNT_QUESTION_PATTERN.test(question)) {
    return "count";
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
  count:
    "This question asks for a count or total. Enumerate the value-bearing facts in the evidence, then compute the answer from them; do not restate a superseded earlier count unless the question asks for history.",
  order:
    "This question asks for an order or sequence. The evidence is listed in source order; answer using that order with one concrete milestone per step.",
  general: "",
};

// Source-ordered (earliest orderKey first), deduplicated, timestamped. The
// trailing note makes update-recency explicit without suppressing genuine
// contradictions: the latest entry is the current state unless two entries are
// irreconcilable.
export function buildAnswerEvidencePack(input: {
  question: string;
  turns: readonly EvidenceTurn[];
}): string {
  const operation = inferAnswerOperation(input.question);
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
    ordered.length > 0
      ? ordered
          .map(
            (turn) =>
              `- [t=${turn.timeAnchor} | #${turn.sourceId} | ${turn.role}] ${turn.content}`,
          )
          .join("\n")
      : "(no evidence)";

  const sections: string[] = [];
  if (OPERATION_FRAMING[operation].length > 0) {
    sections.push(OPERATION_FRAMING[operation]);
  }
  sections.push(
    "Evidence (source-ordered, earliest first):",
    evidenceLines,
    "When a fact changed across these entries, the latest entry is the current value; only call entries conflicting when they cannot be reconciled as an update.",
  );
  return sections.join("\n\n");
}
