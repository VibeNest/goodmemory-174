// Fitted-selector audit (report-only).
//
// GoodMemory's recall recall reaches its high *fitted* BEAM recall partly through
// scenario-fitted source-order selectors that match specific benchmark proper
// nouns (people, places, topic phrases) -- the gap between the fitted figure and
// the generalization figure (ADR-005). The architecture-boundaries test already
// blocks a hardcoded denylist of such names; this generalizes that denylist into
// a measurable signal: scan selector sources for string literals containing
// proper-noun tokens and report which files carry the most. It is a measurement
// to TRACK as the surface is de-fitted, not a blocking gate (so it never breaks a
// legitimate change), and it is the "report-only first" step toward replacing
// fitted gates with general operation detectors.
//
// Pure: it operates on supplied {path, source} entries, so it is deterministic
// and unit-tested on fixtures rather than the live file tree.

export interface SelectorSourceEntry {
  path: string;
  source: string;
}

export interface FittedSelectorFinding {
  path: string;
  // The distinct string literals in this file that carry a proper-noun token.
  properNounLiterals: string[];
}

export interface FittedSelectorReport {
  totalFiles: number;
  fittedFiles: number;
  totalProperNounLiterals: number;
  // Files with at least one proper-noun literal, most-fitted first.
  findings: FittedSelectorFinding[];
}

// Capitalized words that are not scenario proper nouns (generic temporal terms,
// common formats/acronyms, literals) and should not count as fitting.
const COMMON_CAPITALIZED = new Set([
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
  "JSON", "SQL", "API", "URL", "URI", "HTTP", "HTTPS", "ID", "UTC", "ISO",
  "TODO", "NOTE", "True", "False", "None", "Null", "UUID",
]);

const STRING_LITERAL_PATTERN = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
const PROPER_NOUN_TOKEN_PATTERN = /\b[A-Z][A-Za-z]{2,}\b/g;

/**
 * Audit selector sources for scenario-fitting: a string literal is flagged when
 * it contains a proper-noun token (a capitalized word of three or more letters
 * not in the common-word allowlist). Returns per-file findings and totals,
 * most-fitted first. A heuristic signal for tracking the fitted surface, not a
 * ground-truth classifier.
 */
export function analyzeSelectorFitting(
  entries: readonly SelectorSourceEntry[],
  options?: { allowlist?: Iterable<string> },
): FittedSelectorReport {
  const allowlist = new Set<string>([
    ...COMMON_CAPITALIZED,
    ...(options?.allowlist ?? []),
  ]);
  const findings: FittedSelectorFinding[] = [];
  let totalProperNounLiterals = 0;

  for (const entry of entries) {
    const flagged = new Set<string>();
    for (const match of entry.source.matchAll(STRING_LITERAL_PATTERN)) {
      const literal = match[2] ?? "";
      const tokens = literal.match(PROPER_NOUN_TOKEN_PATTERN) ?? [];
      if (tokens.some((token) => !allowlist.has(token))) {
        flagged.add(literal);
      }
    }
    if (flagged.size > 0) {
      const properNounLiterals = [...flagged];
      findings.push({ path: entry.path, properNounLiterals });
      totalProperNounLiterals += properNounLiterals.length;
    }
  }

  findings.sort(
    (left, right) =>
      right.properNounLiterals.length - left.properNounLiterals.length ||
      left.path.localeCompare(right.path),
  );

  return {
    totalFiles: entries.length,
    fittedFiles: findings.length,
    totalProperNounLiterals,
    findings,
  };
}
