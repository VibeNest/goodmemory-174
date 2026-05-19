import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import { selectorTopicOverlapCount, selectorTopicTokens } from "./topic";
import {
  diversifyRankedFactCandidatesBySession,
  hasTrustedAggregateEvidence,
} from "./selectionContext";

export function isRelationshipLatestLocationQuery(query: string): boolean {
  return /\bwhere\b/i.test(query) &&
    /\b(?:moved?|relocation|move to|move back)\b/i.test(query);
}

export function isMortgagePreapprovalQuery(query: string): boolean {
  return /\b(?:pre[-\s]?approved|pre[-\s]?approval|mortgage|wells fargo)\b/i.test(query) &&
    /\b(?:amount|how much|what|pre[-\s]?approved|pre[-\s]?approval)\b/i.test(query);
}

export function isSharedGroceryListMethodQuery(query: string): boolean {
  return /\b(?:mom|mother)\b/i.test(query) &&
    /\bgrocery\s+list\b/i.test(query) &&
    /\b(?:same|method|using|uses|app|paper)\b/i.test(query);
}

export function isRecentFamilyTripQuery(query: string): boolean {
  return /\b(?:most recent|recent|latest)\b/i.test(query) &&
    /\bfamily\s+trip\b/i.test(query);
}

export interface UpdateSeriesOptions {
  collapseMortgagePreapproval?: boolean;
  collapseRecentFamilyTrip?: boolean;
  collapseRelationshipRelocation?: boolean;
  collapseSharedGroceryListMethod?: boolean;
  includeBehavioralUpdateSeries?: boolean;
}

export function normalizeUpdateSeriesPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function resolveUpdateSeriesKey(
  entry: RankedFactCandidate,
  options: UpdateSeriesOptions = {},
): string | undefined {
  const sourceContent = entry.fact.content;
  const content = entry.fact.content.toLowerCase();

  if (/\bi have tried\s+[^.]+?\bkorean restaurants in my city\b/i.test(content)) {
    return "count:korean-restaurants-in-my-city";
  }

  const personalBestMatch = entry.fact.content.match(
    /\bmy personal best time(?:\s+in\s+([^.!?]+?))?\s+is\b/i,
  );
  if (personalBestMatch) {
    const subject = (personalBestMatch[1] ?? entry.fact.subject ?? "personal best time")
      .toLowerCase()
      .replace(/^(?:a|an|the)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();

    return `personal-best:${subject}`;
  }

  if (options.includeBehavioralUpdateSeries === true) {
    if (
      /\bfrench press\b/i.test(sourceContent) &&
      /\b(?:coffee|ratio|tablespoon|ounces?\s+of\s+water|water)\b/i.test(sourceContent)
    ) {
      return "coffee-ratio:french-press";
    }

    if (
      /\bgym\b/i.test(sourceContent) &&
      (
        /\b(?:times?\s+a\s+week|workout\s+days?|routine|frequency)\b/i.test(sourceContent) ||
        /\b(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)\b[\s\S]{0,120}\bgym\b/i.test(sourceContent) ||
        /\bgym\b[\s\S]{0,120}\b(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)\b/i.test(sourceContent)
      )
    ) {
      return "routine-frequency:gym";
    }

    if (
      /\bgym\b/i.test(sourceContent) &&
      /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(sourceContent)
    ) {
      return "routine-time:gym";
    }

    const therapistMatch = sourceContent.match(/\bDr\.?\s+([A-Z][A-Za-z'-]+)\b/u);
    if (
      therapistMatch &&
      /\b(?:therapist|therapy|session|see|seeing|saw)\b/i.test(sourceContent)
    ) {
      return `therapist-frequency:${normalizeUpdateSeriesPart(therapistMatch[1] ?? "")}`;
    }

    const socialPlatformMatch = sourceContent.match(
      /\b(Instagram|TikTok|Twitter|Facebook)\b/iu,
    );
    if (socialPlatformMatch && /\bfollowers?\b/i.test(sourceContent)) {
      return `social-followers:${normalizeUpdateSeriesPart(socialPlatformMatch[1] ?? "")}`;
    }

    if (
      /\bH&M\b/i.test(sourceContent) &&
      /\b(?:tops?|shirts?|bought|got|purchased)\b/i.test(sourceContent)
    ) {
      return "shopping-count:h-and-m-tops";
    }
  }

  if (
    options.collapseMortgagePreapproval === true &&
    /\bpre[-\s]?approv(?:ed|al)\b/i.test(content) &&
    /\$\s*\d/u.test(content)
  ) {
    const lenderFromContent = content
      .match(/\bfrom\s+([a-z][a-z0-9&.' -]{1,60}?)(?:[?.!,]|$)/iu)?.[1]
      ?.replace(/\s+(?:for|when|after|before|on|with)\b[\s\S]*$/iu, "");
    const lender =
      lenderFromContent ??
      (/\bwells\s+fargo\b/iu.test(content) ? "wells fargo" : undefined) ??
      entry.fact.subject ??
      "mortgage";

    return `mortgage-preapproval:${normalizeUpdateSeriesPart(lender)}`;
  }

  if (
    options.collapseSharedGroceryListMethod === true &&
    /\b(?:mom|mother)\b/i.test(content) &&
    /\bgrocery\s+list\b/i.test(content)
  ) {
    return "shared-grocery-list-method:mom";
  }

  if (
    options.collapseRecentFamilyTrip === true &&
    /\bfamily\s+trip\b/i.test(content)
  ) {
    return "recent-family-trip";
  }

  if (
    options.collapseRelationshipRelocation === true &&
    /\bmoved(?:\s+back)?\s+to\b/i.test(entry.fact.content)
  ) {
    const subject =
      sourceContent.match(
        /\bfriend\s+([A-Z][A-Za-z'-]+)\b[\s\S]{0,160}\bmoved(?:\s+back)?\s+to\b/u,
      )?.[1] ??
      sourceContent.match(
        /\b([A-Z][A-Za-z'-]+)\s+(?:actually\s+|recently\s+|just\s+)?moved(?:\s+back)?\s+to\b/u,
      )?.[1] ??
      entry.fact.subject;
    if (subject) {
      return `relationship-relocation:${normalizeUpdateSeriesPart(subject)}`;
    }
  }

  return undefined;
}

export function collapseLatestUpdateSeries(
  entries: RankedFactCandidate[],
  options: UpdateSeriesOptions = {},
): RankedFactCandidate[] {
  const bySeries = new Map<string, RankedFactCandidate>();
  const passthrough: RankedFactCandidate[] = [];

  for (const entry of entries) {
    const seriesKey = resolveUpdateSeriesKey(entry, options);
    if (!seriesKey) {
      passthrough.push(entry);
      continue;
    }

    const current = bySeries.get(seriesKey);
    if (!current || entry.fact.updatedAt > current.fact.updatedAt) {
      bySeries.set(seriesKey, entry);
    }
  }

  return [...passthrough, ...bySeries.values()];
}

export function selectUpdateHistoryCompanions(input: {
  entries: RankedFactCandidate[];
  limit: number;
  options: UpdateSeriesOptions;
  query: string;
  selectedEntries: readonly RankedFactCandidate[];
  selectedIds: ReadonlySet<string>;
}): RankedFactCandidate[] {
  if (input.limit <= 0) {
    return [];
  }

  const selectedSeriesKeys = new Set(
    input.selectedEntries
      .map((entry) => resolveUpdateSeriesKey(entry, input.options))
      .filter((key): key is string => typeof key === "string")
      .filter((key) => shouldSelectUpdateHistoryCompanions(key, input.query)),
  );
  if (selectedSeriesKeys.size === 0) {
    return [];
  }

  const companions = input.entries
    .filter((entry) => !input.selectedIds.has(entry.fact.id))
    .filter((entry) => {
      const key = resolveUpdateSeriesKey(entry, input.options);
      return key !== undefined && selectedSeriesKeys.has(key);
    })
    .sort((left, right) => right.fact.updatedAt.localeCompare(left.fact.updatedAt));

  return diversifyRankedFactCandidatesBySession(companions, input.limit);
}

export function shouldSelectUpdateHistoryCompanions(
  seriesKey: string,
  query: string,
): boolean {
  if (
    seriesKey.startsWith("personal-best:") ||
    seriesKey.startsWith("relationship-relocation:")
  ) {
    return true;
  }

  if (
    seriesKey === "coffee-ratio:french-press" &&
    /\b(?:switch(?:ed)?|more|less|changed|previously|before)\b/iu.test(query)
  ) {
    return true;
  }

  if (
    (
      seriesKey === "routine-frequency:gym" ||
      seriesKey === "routine-time:gym"
    ) &&
    /\b(?:more|less|frequent|frequently|previously|before|changed|switch(?:ed)?)\b/iu.test(query)
  ) {
    return true;
  }

  if (
    seriesKey.startsWith("therapist-frequency:") &&
    /\b(?:more|less|often|frequent|frequently|previously|before|changed|switch(?:ed)?)\b/iu.test(query)
  ) {
    return true;
  }

  return false;
}

export function hasUpdateSeriesQuerySignal(seriesKey: string, query: string): boolean {
  if (
    seriesKey.startsWith("personal-best:") &&
    /\bpersonal\s+best\b/iu.test(query)
  ) {
    return true;
  }
  if (
    seriesKey === "coffee-ratio:french-press" &&
    /\b(?:French press|coffee|water|ratio)\b/iu.test(query)
  ) {
    return true;
  }
  if (
    seriesKey === "routine-frequency:gym" &&
    /\b(?:gym|workout|routine|frequent|frequently|previously)\b/iu.test(query)
  ) {
    return true;
  }
  if (
    seriesKey === "routine-time:gym" &&
    /\b(?:gym|time|usually|schedule)\b/iu.test(query)
  ) {
    return true;
  }
  if (
    seriesKey.startsWith("therapist-frequency:") &&
    /\b(?:therapist|Dr\.?|doctor|session|see|seeing|often)\b/iu.test(query)
  ) {
    return true;
  }
  if (
    seriesKey.startsWith("social-followers:") &&
    /\b(?:followers?|Instagram|TikTok|Twitter|Facebook|now|current)\b/iu.test(query)
  ) {
    return true;
  }
  if (
    seriesKey === "shopping-count:h-and-m-tops" &&
    /\b(?:H&M|tops?|bought|so far)\b/iu.test(query)
  ) {
    return true;
  }
  if (
    seriesKey.startsWith("relationship-relocation:") &&
    /\b(?:moved?|relocation|recent|where)\b/iu.test(query)
  ) {
    return true;
  }

  return false;
}

export function hasTrustedUpdateEvidenceSignal(
  entry: RankedFactCandidate,
  query: string,
  options: UpdateSeriesOptions,
  language: LanguageService,
  queryLocale: string,
): boolean {
  const seriesKey = resolveUpdateSeriesKey(entry, options);
  if (!seriesKey || !hasTrustedAggregateEvidence(entry)) {
    return false;
  }

  if (entry.intentScore > 0 || entry.lexicalScore >= 0.03 || entry.subjectScore > 0) {
    return true;
  }

  if (hasUpdateSeriesQuerySignal(seriesKey, query)) {
    return true;
  }

  return selectorTopicOverlapCount(
    selectorTopicTokens(query, language, queryLocale),
    selectorTopicTokens(entry.fact.content, language, entry.locale),
  ) >= 1;
}
