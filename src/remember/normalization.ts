import type { MemoryCandidate } from "./candidates";

const POINTER_PATTERN =
  /https?:\/\/[^\s"'`<>]+|(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+|[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+/gu;
const WRAPPING_PUNCTUATION = /^[`"'([{<\s]+|[`"')\]}>.,!?;:]+$/g;
const NAME_STOPWORDS = new Set([
  "a",
  "am",
  "and",
  "are",
  "i",
  "in",
  "is",
  "my",
  "name",
  "user",
  "works",
]);

function trimWrappingPunctuation(value: string): string {
  return value.replace(WRAPPING_PUNCTUATION, "").trim();
}

function basename(pointer: string): string {
  const segments = pointer.split("/");
  return segments.at(-1) ?? pointer;
}

function extractCanonicalReferencePointerMatches(
  value: string | undefined,
): Array<{ pointer: string; index: number }> {
  if (!value) {
    return [];
  }

  return [...value.matchAll(POINTER_PATTERN)]
    .map((match) => ({
      pointer: trimWrappingPunctuation(match[0] ?? ""),
      index: match.index ?? -1,
    }))
    .filter((match) => match.pointer.length > 0 && match.index >= 0);
}

function extractCanonicalReferencePointers(value: string | undefined): string[] {
  return extractCanonicalReferencePointerMatches(value).map((match) => match.pointer);
}

function tokenizeName(value: string): string[] {
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isLikelyCanonicalName(value: string): boolean {
  const trimmed = trimWrappingPunctuation(value);
  if (trimmed.length === 0) {
    return false;
  }

  if (/[.,:;()\\/]/u.test(trimmed)) {
    return false;
  }

  if (/docs\/|https?:\/\//iu.test(trimmed)) {
    return false;
  }

  const tokens = tokenizeName(trimmed);
  if (tokens.length === 0 || tokens.length > 3) {
    return false;
  }

  return tokens.every((token) => {
    if (NAME_STOPWORDS.has(token.toLowerCase())) {
      return false;
    }

    return /^[\p{L}\p{Script=Han}'’.-]+$/u.test(token);
  });
}

function extractLeadingCanonicalName(value: string): string | undefined {
  const trimmed = trimWrappingPunctuation(value);
  if (trimmed.length === 0) {
    return undefined;
  }

  const match = trimmed.match(
    /^([A-Z\p{Script=Han}][\p{L}\p{Script=Han}'’-]*(?:\s+[A-Z\p{Script=Han}][\p{L}\p{Script=Han}'’-]*){0,2})(?=$|[,.!?;:]|\s+(?:and|who|that|works|working|leading|based|located|from|in|is|are|they|she|he)\b)/u,
  );
  const candidate = match?.[1] ? trimWrappingPunctuation(match[1]) : "";

  return candidate.length > 0 && isLikelyCanonicalName(candidate)
    ? candidate
    : undefined;
}

function extractCanonicalProfileName(value: string): string | undefined {
  const trimmed = trimWrappingPunctuation(value);
  if (trimmed.length === 0) {
    return undefined;
  }

  if (isLikelyCanonicalName(trimmed)) {
    return trimmed;
  }

  const explicitNameMatch = trimmed.match(
    /(?:[Uu]ser['’]s name is|[Mm]y name is|[Nn]ame is)\s+(.+)$/u,
  );
  if (explicitNameMatch?.[1]) {
    const candidate = extractLeadingCanonicalName(explicitNameMatch[1]);
    if (candidate) {
      return candidate;
    }
  }

  return extractLeadingCanonicalName(trimmed);
}

function extractExplicitCanonicalProfileName(
  value: string,
): string | undefined {
  const trimmed = trimWrappingPunctuation(value);
  const explicitNameMatch = trimmed.match(
    /(?:[Uu]ser['’]s name is|[Mm]y name is|[Nn]ame is)\s+(.+)$/u,
  );

  return explicitNameMatch?.[1]
    ? extractLeadingCanonicalName(explicitNameMatch[1])
    : undefined;
}

export function extractCanonicalReferencePointer(
  value: string | undefined,
): string | undefined {
  return extractCanonicalReferencePointers(value)[0];
}

function isNegatedSourceOfTruthPointerOccurrence(
  text: string,
  occurrenceIndex: number,
  pointerLength: number,
): boolean {
  const prefix = text.slice(Math.max(0, occurrenceIndex - 96), occurrenceIndex);
  const suffix = text.slice(
    occurrenceIndex + pointerLength,
    occurrenceIndex + pointerLength + 128,
  );

  return (
    /\bnot\s*$/iu.test(prefix) ||
    /\binstead of\s*$/iu.test(prefix) ||
    /\brather than\s*$/iu.test(prefix) ||
    /\b(?:please\s+)?do\s+not\s+use\s*$/iu.test(prefix) ||
    /\b(?:please\s+)?do\s+not\s+treat\s*$/iu.test(prefix) ||
    /\bdon['’]?t\s+use\s*$/iu.test(prefix) ||
    /\bdon['’]?t\s+treat\s*$/iu.test(prefix) ||
    /\bshould\s+not\s+(?:use|treat)\s*$/iu.test(prefix) ||
    /\bmust\s+not\s+(?:use|treat)\s*$/iu.test(prefix) ||
    /\bshouldn['’]?t\s+(?:use|treat)\s*$/iu.test(prefix) ||
    /\bmustn['’]?t\s+(?:use|treat)\s*$/iu.test(prefix) ||
    /\b(?:will|would)\s+not\s+use\s*$/iu.test(prefix) ||
    /\b(?:will|would)\s+not\s+treat\s*$/iu.test(prefix) ||
    /不再(?:以|按|用|使用)\s*$/u.test(prefix) ||
    /(?:不要|别再)(?:以|按|用|使用)\s*$/u.test(prefix) ||
    /^\s*is\s+not\s+the\s+source\s+of\s+truth\b/iu.test(suffix) ||
    /^\s*(?:,?\s*)?no\s+longer\s+the\s+source\s+of\s+truth\b/iu.test(suffix) ||
    /^\s+as\s+the\s+source\s+of\s+truth\b/iu.test(suffix) &&
      /\b(?:please\s+)?do\s+not\s+(?:use|treat)\s*$/iu.test(prefix) ||
    /^\s+as\s+the\s+source\s+of\s+truth\b/iu.test(suffix) &&
      /\bdon['’]?t\s+(?:use|treat)\s*$/iu.test(prefix) ||
    /^\s+as\s+the\s+source\s+of\s+truth\b/iu.test(suffix) &&
      /\b(?:should|must|will|would)\s+not\s+(?:use|treat)\s*$/iu.test(prefix) ||
    /^\s+as\s+the\s+source\s+of\s+truth\b/iu.test(suffix) &&
      /\b(?:shouldn['’]?t|mustn['’]?t)\s+(?:use|treat)\s*$/iu.test(prefix) ||
    /^\s*should\s+not\s+be\s+used\s+as\s+the\s+source\s+of\s+truth\b/iu.test(suffix) ||
    /^\s*(?:已)?不再(?:作为|是)?(?:当前)?(?:依据|标准|版本)(?:\s|[,.!?:;\u3002\uff0c\uff1f\uff01]|$)/u.test(
      suffix,
    ) ||
    /^\s*(?:已)?不再为准(?:\s|[,.!?:;\u3002\uff0c\uff1f\uff01]|$)/u.test(suffix)
  );
}

function isAffirmedSourceOfTruthPointerOccurrence(
  text: string,
  occurrenceIndex: number,
  pointerLength: number,
): boolean {
  if (
    isNegatedSourceOfTruthPointerOccurrence(
      text,
      occurrenceIndex,
      pointerLength,
    )
  ) {
    return false;
  }

  const prefix = text.slice(Math.max(0, occurrenceIndex - 128), occurrenceIndex);
  const suffix = text.slice(
    occurrenceIndex + pointerLength,
    occurrenceIndex + pointerLength + 160,
  );

  return (
    /\b(?:please\s+)?use\s*$/iu.test(prefix) &&
      /^\s+as\s+the\s+(?:current\s+)?source\s+of\s+truth\b/iu.test(suffix) ||
    /\b(?:please\s+)?treat\s*$/iu.test(prefix) &&
      /^\s+as\s+the\s+(?:current\s+)?source\s+of\s+truth\b/iu.test(suffix) ||
    /\bsource\s+of\s+truth(?:\s+for[^\n]{0,120})?\s+(?:is|=)\s*$/iu.test(prefix) ||
    /^\s+is\s+(?:now\s+)?the\s+(?:current\s+)?source\s+of\s+truth\b/iu.test(suffix) ||
    /(?:现在|当前|目前|以后都)?以\s*$/u.test(prefix) &&
      /^\s*为准(?:\s|[,.!?:;\u3002\uff0c\uff1f\uff01]|$)/u.test(suffix)
  );
}

function normalizeProfileCandidate(
  candidate: MemoryCandidate,
  sourceMessageContent?: string,
): MemoryCandidate {
  if (candidate.kindHint !== "profile") {
    return candidate;
  }

  const profileField = candidate.metadata?.profileField;
  if (profileField && profileField !== "name") {
    return candidate;
  }

  const normalizedName = profileField === "name"
    ? extractCanonicalProfileName(sourceMessageContent ?? "") ??
      extractCanonicalProfileName(candidate.content)
    : extractExplicitCanonicalProfileName(sourceMessageContent ?? "") ??
      extractExplicitCanonicalProfileName(candidate.content);

  if (!normalizedName) {
    return candidate;
  }

  return {
    ...candidate,
    content: normalizedName,
    metadata: {
      ...candidate.metadata,
      profileField: "name",
    },
  };
}

function normalizeReferenceCandidate(
  candidate: MemoryCandidate,
  sourceMessageContent?: string,
): MemoryCandidate {
  if (candidate.kindHint !== "reference") {
    return candidate;
  }

  const rawPointer = candidate.metadata?.referencePointer ?? candidate.content;
  const pointer =
    extractCanonicalReferencePointer(rawPointer) ??
    extractCanonicalReferencePointer(sourceMessageContent);

  if (!pointer) {
    return candidate;
  }

  const rawTitle = candidate.metadata?.referenceTitle?.trim();
  const resolvedTitle =
    !rawTitle ||
    rawTitle === candidate.content.trim() ||
    rawTitle === rawPointer.trim() ||
    rawTitle.length > pointer.length + 24
      ? basename(pointer)
      : rawTitle;
  const contentPointers = extractCanonicalReferencePointers(candidate.content);
  const sourcePointers = extractCanonicalReferencePointers(sourceMessageContent);
  const supersedesPointer =
    extractCanonicalReferencePointer(candidate.metadata?.supersedesPointer) ??
    contentPointers[1] ??
    sourcePointers[1];

  return {
    ...candidate,
    content: pointer,
    metadata: {
      ...candidate.metadata,
      referencePointer: pointer,
      referenceTitle: resolvedTitle,
      ...(supersedesPointer ? { supersedesPointer } : {}),
    },
  };
}

function normalizeSourceOfTruthDirectiveCandidate(
  candidate: MemoryCandidate,
  sourceMessageContent?: string,
): MemoryCandidate {
  if (candidate.kindHint !== "preference" && candidate.kindHint !== "feedback") {
    return candidate;
  }

  const sourceText = [
    candidate.content,
    candidate.metadata?.preferenceValue,
    sourceMessageContent,
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join("\n");

  if (!/source of truth|为准/u.test(sourceText)) {
    return candidate;
  }

  const pointerMatches = extractCanonicalReferencePointerMatches(sourceText);
  if (pointerMatches.length === 0) {
    return candidate;
  }

  const pointerMatchesByPointer = new Map<
    string,
    Array<{ pointer: string; index: number }>
  >();
  for (const match of pointerMatches) {
    const existingMatches = pointerMatchesByPointer.get(match.pointer);
    if (existingMatches) {
      existingMatches.push(match);
      continue;
    }

    pointerMatchesByPointer.set(match.pointer, [match]);
  }

  const currentPointer = [...pointerMatchesByPointer.entries()].find(
    ([, matches]) =>
      matches.some((match) =>
        isAffirmedSourceOfTruthPointerOccurrence(
          sourceText,
          match.index,
          match.pointer.length,
        )
      ),
  )?.[0];

  if (!currentPointer) {
    return candidate;
  }

  const supersededPointer =
    extractCanonicalReferencePointer(candidate.metadata?.supersedesPointer) ??
    [...pointerMatchesByPointer.entries()].find(
      ([pointer, matches]) =>
        pointer !== currentPointer &&
        matches.some((match) =>
          isNegatedSourceOfTruthPointerOccurrence(
            sourceText,
            match.index,
            match.pointer.length,
          )
        ),
    )?.[0];

  return {
    ...candidate,
    kindHint: "reference",
    content: currentPointer,
    metadata: {
      ...candidate.metadata,
      referenceKind: "source_of_truth",
      referencePointer: currentPointer,
      referenceTitle: basename(currentPointer),
      ...(supersededPointer
        ? { supersedesPointer: supersededPointer }
        : {}),
      appliesTo: undefined,
      feedbackKind: undefined,
      preferenceCategory: undefined,
      preferenceValue: undefined,
    },
  };
}

export function normalizeMemoryCandidate(
  candidate: MemoryCandidate,
  sourceMessageContent?: string,
): MemoryCandidate {
  const normalizedDirectiveCandidate = normalizeSourceOfTruthDirectiveCandidate(
    candidate,
    sourceMessageContent,
  );
  const normalizedProfileCandidate = normalizeProfileCandidate(
    normalizedDirectiveCandidate,
    sourceMessageContent,
  );

  return normalizeReferenceCandidate(
    normalizedProfileCandidate,
    sourceMessageContent,
  );
}
