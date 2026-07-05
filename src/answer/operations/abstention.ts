// Abstention guide: directness requirements for unanswerable questions.

import type { EvidenceTurn } from "../evidenceShared";

export function formatAbstentionEvidenceGuide(input: {
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
