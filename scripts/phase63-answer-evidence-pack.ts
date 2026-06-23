// Answer-time evidence shaping (eval-side prototype). The ablation matrix showed
// the live ceiling is not retrieval-bound: clean oracle evidence reaches ~0.65
// and dumping the full conversation is both infeasible and no better than the
// noisy pipeline. The remaining lever is organizing the evidence the model
// already has into a source-ordered, timestamped, operation-aware pack so it can
// count, order, and resolve updates reliably.
//
// This is deliberately GENERAL, not benchmark-fitted: the answer operation is
// inferred from the question phrasing (count/order words), never from dataset
// type labels, and there is no tuning toward any expected-answer wording. The
// same shaping should help real product recall, not just BEAM.

export type Phase63AnswerOperation = "count" | "order" | "general";

const COUNT_QUESTION_PATTERN =
  /\b(how many|how much|how often|number of|total|in total|combined|altogether|count|sum|times)\b/iu;
const ORDER_QUESTION_PATTERN =
  /\b(order|sequence|sequential|chronolog|timeline|before|after|first|then|next|earlier|later|prior to|followed by|preced)\b/iu;

export function inferAnswerOperation(question: string): Phase63AnswerOperation {
  if (COUNT_QUESTION_PATTERN.test(question)) {
    return "count";
  }
  if (ORDER_QUESTION_PATTERN.test(question)) {
    return "order";
  }
  return "general";
}

export interface Phase63EvidenceTurn {
  chatId: number;
  content: string;
  role: string;
  timeAnchor: string;
}

const OPERATION_FRAMING: Record<Phase63AnswerOperation, string> = {
  count:
    "This question asks for a count or total. Enumerate the value-bearing facts in the evidence, then compute the answer from them; do not restate a superseded earlier count unless the question asks for history.",
  order:
    "This question asks for an order or sequence. The evidence is listed in source order; answer using that order with one concrete milestone per step.",
  general: "",
};

// Source-ordered (earliest chat_id first), deduplicated, timestamped. The
// trailing note makes update-recency explicit without suppressing genuine
// contradictions: the latest entry is the current state unless two entries are
// irreconcilable.
export function buildPhase63AnswerEvidencePack(input: {
  question: string;
  turns: readonly Phase63EvidenceTurn[];
}): string {
  const operation = inferAnswerOperation(input.question);
  const seen = new Set<number>();
  const ordered: Phase63EvidenceTurn[] = [];
  for (const turn of [...input.turns].sort(
    (left, right) => left.chatId - right.chatId,
  )) {
    if (seen.has(turn.chatId)) {
      continue;
    }
    seen.add(turn.chatId);
    ordered.push(turn);
  }

  const evidenceLines =
    ordered.length > 0
      ? ordered
          .map(
            (turn) =>
              `- [t=${turn.timeAnchor} | #${turn.chatId} | ${turn.role}] ${turn.content}`,
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
