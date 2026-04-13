function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeForMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNegatedOccurrence(
  haystack: string,
  occurrenceIndex: number,
  signalLength: number,
): boolean {
  const prefix = haystack.slice(Math.max(0, occurrenceIndex - 64), occurrenceIndex);
  const suffix = haystack.slice(
    occurrenceIndex + signalLength,
    occurrenceIndex + signalLength + 96,
  );

  return (
    /\bnot(?:\s+(?:a|an|the))?\s*$/.test(prefix) ||
    /\b(?:do|does|did)\s+not\s+(?:use\s+)?$/.test(prefix) ||
    /\bdon['’]?t\s+(?:use\s+)?$/.test(prefix) ||
    /\b(?:will|would)\s+not\s+(?:use\s+)?$/.test(prefix) ||
    /\bwon['’]?t\s+(?:use\s+)?$/.test(prefix) ||
    /\b(?:am|is|are|was|were)\s+not(?:\s+(?:a|an|the))?\s*$/.test(prefix) ||
    /\b(?:isn['’]?t|aren['’]?t|wasn['’]?t|weren['’]?t)\s+(?:a|an|the)\s*$/.test(
      prefix,
    ) ||
    /\b(?:i['’]m|you['’]re|we['’]re|they['’]re|he['’]s|she['’]s|it['’]s)\s+not(?:\s+(?:a|an|the))?\s*$/.test(
      prefix,
    ) ||
    /\b(?:am|is|are|was|were)\s+no\s+longer(?:\s+(?:a|an|the))?\s*$/.test(prefix) ||
    /\b(?:i['’]m|you['’]re|we['’]re|they['’]re|he['’]s|she['’]s|it['’]s)\s+no\s+longer(?:\s+(?:a|an|the))?\s*$/.test(
      prefix,
    ) ||
    /\bnever\s+(?:use\s+)?$/.test(prefix) ||
    /\bavoid\s+(?:using\s+)?$/.test(prefix) ||
    /\binstead of\s*$/.test(prefix) ||
    /\brather than\s*$/.test(prefix) ||
    /\bwithout\s*$/.test(prefix) ||
    /\bexcept(?: for)?\s*$/.test(prefix) ||
    /\b(?:corrected|superseded)\s+reference:\s*$/.test(prefix) ||
    /不再(?:以|按|用|使用)\s*$/.test(prefix) ||
    /(?:不要|别再)(?:以|按|用|使用)\s*$/.test(prefix) ||
    /^\s*is\s+superseded\b/.test(suffix) ||
    /^\s*is\s+no\s+longer\b/.test(suffix) ||
    /^\s*is\s+not\b/.test(suffix) ||
    /^\s*should\s+not\b/.test(suffix) ||
    /^\s*must\s+not\b/.test(suffix) ||
    /^\s*shouldn['’]?t\b/.test(suffix) ||
    /^\s*mustn['’]?t\b/.test(suffix) ||
    /^\s*is\s+deprecated\b/.test(suffix) ||
    /^\s*is\s+now\s+outdated\b/.test(suffix) ||
    /^\s*is\s+outdated\b/.test(suffix) ||
    /^\s*is\s+not\s+the\s+source\s+of\s+truth\b/.test(suffix) ||
    /^\s*(?:,?\s*)?no\s+longer\s+the\s+source\s+of\s+truth\b/.test(suffix) ||
    /^\s*(?:已)?不再(?:作为|是)?(?:当前)?(?:依据|标准|版本)(?:\s|[,.!?:;\u3002\uff0c\uff1f\uff01]|$)/.test(
      suffix,
    ) ||
    /^\s*(?:已)?不再为准(?:\s|[,.!?:;\u3002\uff0c\uff1f\uff01]|$)/.test(suffix) ||
    /^\s*should\s+not\s+be\s+treated\s+as\s+the\s+current\s+source\s+of\s+truth\b/.test(
      suffix,
    )
  );
}

function findSignalsByMatchType(
  signals: string[],
  text: string,
  matchType: "affirmed" | "negated",
): string[] {
  const haystack = normalizeForMatching(text);

  return signals.filter((signal) => {
    const normalizedSignal = normalizeForMatching(signal);
    if (!normalizedSignal) {
      return false;
    }

    const pattern = new RegExp(escapeRegExp(normalizedSignal), "g");
    let match = pattern.exec(haystack);

    while (match) {
      const negated = isNegatedOccurrence(
        haystack,
        match.index,
        normalizedSignal.length,
      );
      if ((matchType === "affirmed" && !negated) || (matchType === "negated" && negated)) {
        return true;
      }
      match = pattern.exec(haystack);
    }

    return false;
  });
}

export function findAffirmedSignals(signals: string[], text: string): string[] {
  return findSignalsByMatchType(signals, text, "affirmed");
}

export function findNegatedSignals(signals: string[], text: string): string[] {
  return findSignalsByMatchType(signals, text, "negated");
}

export function findConflictedSignals(signals: string[], text: string): string[] {
  const affirmed = new Set(findAffirmedSignals(signals, text));
  const negated = new Set(findNegatedSignals(signals, text));

  return signals.filter((signal) => affirmed.has(signal) && negated.has(signal));
}

export function findMissingAffirmedSignals(
  signals: string[],
  text: string,
): string[] {
  const affirmed = new Set(findAffirmedSignals(signals, text));
  return signals.filter((signal) => !affirmed.has(signal));
}

export function countAffirmedSignals(signals: string[], text: string): number {
  return findAffirmedSignals(signals, text).length;
}

export function countNegatedSignals(signals: string[], text: string): number {
  return findNegatedSignals(signals, text).length;
}

export function countConflictedSignals(signals: string[], text: string): number {
  return findConflictedSignals(signals, text).length;
}
