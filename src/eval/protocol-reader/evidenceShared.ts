// Shared answer-evidence types and low-level helpers used by the
// per-operation guide modules and the evidence-pack assembly.

export type AnswerOperation =
  | "abstention"
  | "contradiction"
  | "conflict_update"
  | "count"
  | "extraction"
  | "instruction"
  | "multi_session"
  | "order"
  | "preference"
  | "summary"
  | "general";

export interface EvidenceTurn {
  content: string;
  // Explicit source order for answer-time chronology. This may be a chat index,
  // chunk order, or occurred-at ordinal; it is separate from source identity.
  orderKey: number;
  role: string;
  sourceId: number | string;
  timeAnchor: string;
}

export const CURRENT_VALUE_QUERY_STOP_WORDS = new Set([
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

export function uniquePreservingOrder(values: readonly string[]): string[] {
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

export function currentValueTopicTokens(value: string): Set<string> {
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

export function stripFencedCodeBlocks(content: string): string {
  return content.replace(/```[\s\S]*?```/gu, " ");
}
