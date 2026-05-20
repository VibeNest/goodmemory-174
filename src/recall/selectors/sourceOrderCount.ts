const SOURCE_ORDER_REQUESTED_COUNT_WORDS = new Map<string, number>([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
]);

export function requestedSourceOrderItemCount(query: string): number | undefined {
  const numeric = query.match(/\b(?:mention\s+only(?:\s+and\s+only)?|only)\s+(\d{1,2})\s+items?\b/iu)?.[1] ??
    query.match(/\b(\d{1,2})\s+items?\b/iu)?.[1];
  if (numeric) {
    const count = Number(numeric);
    return Number.isFinite(count) && count > 0 ? count : undefined;
  }

  const word = query.match(
    /\b(?:mention\s+only(?:\s+and\s+only)?|only)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\s+items?\b/iu,
  )?.[1]?.toLowerCase();
  return word ? SOURCE_ORDER_REQUESTED_COUNT_WORDS.get(word) : undefined;
}
