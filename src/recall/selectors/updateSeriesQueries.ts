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
