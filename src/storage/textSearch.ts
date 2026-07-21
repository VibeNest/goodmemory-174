import type { StorageDocument } from "./contracts";

const WORD_PATTERN = /[\p{L}\p{N}]+/gu;

export function tokenizeDocumentSearch(value: string): string[] {
  return (value.normalize("NFKC").toLowerCase().match(WORD_PATTERN) ?? [])
    .filter((token) => token.length > 0);
}

export function buildDocumentSearchQuery(value: string): string {
  return [...new Set(tokenizeDocumentSearch(value))]
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(" OR ");
}

export function buildPostgresDocumentSearchTerms(value: string): {
  substrings: string[];
  tsQuery: string;
} {
  const tokens = [...new Set(tokenizeDocumentSearch(value))];
  return {
    substrings: tokens.map((token) => `%${token}%`),
    tsQuery: tokens.join(" | "),
  };
}

export function readDocumentSearchText(
  document: StorageDocument,
  field: string,
): string | undefined {
  const value = (document as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

export function scoreDocumentSearch(query: string, text: string): number {
  const queryTokens = [...new Set(tokenizeDocumentSearch(query))];
  if (queryTokens.length === 0) {
    return 0;
  }
  const documentTokens = tokenizeDocumentSearch(text);
  const frequencies = new Map<string, number>();
  for (const token of documentTokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }
  let matchedTerms = 0;
  let occurrences = 0;
  for (const token of queryTokens) {
    const count = frequencies.get(token) ?? 0;
    if (count > 0) {
      matchedTerms += 1;
      occurrences += count;
    }
  }
  if (matchedTerms === 0) {
    return 0;
  }
  return matchedTerms / queryTokens.length +
    occurrences / Math.max(1, documentTokens.length);
}
