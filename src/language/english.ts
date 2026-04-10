import type {
  MemoryCandidate,
  MemoryCandidateMetadata,
  ProfileField,
} from "../remember/candidates";
import type {
  LanguageAdapter,
  LanguageCandidateExtractionInput,
} from "./contracts";
import type {
  FactKind,
  MemoryScopeKind,
  ReferenceKind,
} from "../domain/records";
import {
  splitClausesGeneric,
  normalizeUnicodeForEquality,
  tokenizeUnicodeText,
} from "./generic";

const GREETING_PATTERN = /^(hi|hello|hey|thanks|thank you|ok|okay)[.!]?$/i;
const PROFILE_NAME_PATTERN = /my name is\s+([a-z][a-z -]*)/i;
const PROFILE_ROLE_WITH_ORGANIZATION_AND_LOCATION_PATTERN =
  /(?:remember that\s+)?i(?:'m| am)\s+(?:an?|the)\s+(.+?)\s+at\s+([A-Z][A-Za-z0-9&.,' -]*?)\s+in\s+([A-Z][A-Za-z.-]*(?:\s+[A-Z][A-Za-z.-]*)*(?:,\s*[A-Z][A-Za-z.-]*(?:\s+[A-Z][A-Za-z.-]*)*)?)(?=\.|$)/i;
const PROFILE_ROLE_WITH_ORGANIZATION_PATTERN =
  /(?:remember that\s+)?i(?:'m| am)\s+(?:an?|the)\s+(.+?)\s+at\s+([A-Z][A-Za-z0-9&.,' -]*?)(?=\.|$)/i;
const PROFILE_ROLE_WITH_LOCATION_PATTERN =
  /(?:remember that\s+)?i(?:'m| am)\s+(?:an?|the)\s+(.+?)\s+in\s+([A-Z][A-Za-z.-]*(?:\s+[A-Z][A-Za-z.-]*)*(?:,\s*[A-Z][A-Za-z.-]*(?:\s+[A-Z][A-Za-z.-]*)*)?)(?=\.|\s+(?:remember|working|leading|based)\b|,?\s+(?:remember|working|leading|based)\b|$)/i;
const PROFILE_ROLE_DRIFT_WITH_PROJECT_PATTERN =
  /(?:remember that\s+)?i(?:\s+have)?\s+now\s+moved\s+into\s+(?:an?|the)\s+(.+?)\s+leading\s+(.+?)(?=\.|$)/i;
const PROFILE_ROLE_PATTERN =
  /(?:remember that\s+)?i(?:'m| am)\s+(?:an?|the)\s+([a-z][a-z -]*(?:\s+[a-z][a-z -]*)*)(?=[.!?,]|$)/i;
const PROFILE_LOCATION_PATTERN =
  /(?:remember that\s+)?i(?:'m| am)\s+in\s+([A-Z][A-Za-z.-]*(?:\s+[A-Z][A-Za-z.-]*)*(?:,\s*[A-Z][A-Za-z.-]*(?:\s+[A-Z][A-Za-z.-]*)*)?)(?=\.|\s+(?:remember|working|leading|based)\b|,?\s+(?:remember|working|leading|based)\b|$)/i;
const PROFILE_TIMEZONE_PATTERN =
  /(?:my\s+timezone\s+is|timezone:)\s*([A-Za-z0-9_./+-]+(?:\s*[A-Za-z0-9_./+-]+)*)/i;
const PROFILE_LANGUAGE_PATTERN =
  /(?:my\s+preferred\s+language\s+is|my\s+language\s+is)\s+([A-Za-z][A-Za-z -]*)/i;
const CURRENT_PROJECT_PATTERN =
  /(?:remember that\s+)?i(?:'m| am)\s+(?:leading|working on|focused on|owning)\s+(.+?)(?=\.|$)/i;
const EXPLICIT_FACT_PATTERN = /remember (?:that|this)\s+(.+)/i;
const FOLLOW_UP_OPEN_LOOP_PATTERN =
  /\bstill\s+have\s+an?\s+open\s+loop\s+on\s+(.+?)(?=\.|$)/i;
const PREFERENCE_PATTERN = /i prefer\s+(.+?)(?:\.|$)/i;
const REFERENCE_PATTERN =
  /use\s+([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)\s+as the source of truth/i;
const CORRECTED_REFERENCE_PATTERN =
  /(?:correction:\s*)?([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)\s+is now the source of truth,\s*not\s+([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/i;
const DURABLE_INFERENCE_PATTERNS = [
  /\b(currently|still|blocked|failing|working on|responsible for)\b/i,
  /\b(workflows?|migrations?|production|prod|projects?|roadmaps?|deadlines?|launch(?:es)?)\b/i,
  /\b(apis?|runtimes?|builds?|schemas?|incidents?|bugs?|errors?)\b/i,
];
const PROJECT_FACT_PATTERNS = [
  /\bworkflows?\b/i,
  /\bblockers?\b/i,
  /\bopen loops?\b/i,
  /\bhandoffs?\b/i,
  /\bmilestones?\b/i,
  /\bvalidations?\b/i,
  /\bsignoffs?\b/i,
  /\breadiness\b/i,
  /\bcutover\b/i,
  /\breviews?\b/i,
  /\bprojects?\b/i,
  /\brunbooks?\b/i,
  /\bplaybooks?\b/i,
  /\brollouts?\b/i,
  /\bapprovals?\b/i,
  /\broadmaps?\b/i,
  /\bmigrations?\b/i,
  /\blaunch(?:es)?\b/i,
  /\bproduction\b/i,
  /\bprod\b/i,
  /\bfollow(?:-| )?up\b/i,
];
const TECHNICAL_FACT_PATTERNS = [
  /\bservices?\b/i,
  /\bfeatures?\b/i,
  /\bdependenc(?:y|ies)\b/i,
  /\bpipelines?\b/i,
  /\bapis?\b/i,
  /\bruntimes?\b/i,
  /\bbugs?\b/i,
  /\berrors?\b/i,
  /\bbuilds?\b/i,
  /\bschemas?\b/i,
];
const PROFILE_LIKE_PROJECT_FACT_PATTERNS = [
  /\bblockers?\b/i,
  /\bopen loops?\b/i,
  /\bsource of truth\b/i,
  /\brunbooks?\b/i,
  /\bhandoffs?\b/i,
  /\bapprovals?\b/i,
  /\bblocked\b/i,
  /\bfailing\b/i,
  /\bdeadlines?\b/i,
  /\blaunch(?:es)?\b/i,
  /\bmigrations?\b/i,
  /\bprojects?\b/i,
  /\bworkflows?\b/i,
];
const TOKEN_STOPWORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "should",
  "answer",
  "reply",
  "respond",
  "user",
  "using",
  "current",
  "please",
]);
const ENGLISH_SUBJECT_TAIL_PATTERN =
  /\b(?:and|but)\s+(?:driving|tracking|keeping|handling|reviewing|planning|shipping|rolling|migrating|preparing|finalizing|waiting|coordinating|owning)\b.*$/i;
const ENGLISH_SUBJECT_CLAUSE_PATTERN =
  /\b(?:while|because|after|before|when|if)\b.*$/i;
const ENGLISH_SUBJECT_PREDICATE_BOUNDARY_PATTERN =
  /\s+(?:is|are|was|were|remains?|stays?|needs?|requires?|has|have)\b/gi;

function deriveFactCategory(
  content: string,
): "project" | "technical" | "personal" | "relationship" | "event" {
  const normalized = content.toLowerCase();

  if (PROJECT_FACT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "project";
  }

  if (TECHNICAL_FACT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "technical";
  }

  if (
    /\bfamily\b/i.test(normalized) ||
    /\bpartner\b/i.test(normalized) ||
    /\bfriend\b/i.test(normalized)
  ) {
    return "relationship";
  }

  if (
    /\btravel\b/i.test(normalized) ||
    /\bevent\b/i.test(normalized) ||
    /\bmeeting\b/i.test(normalized)
  ) {
    return "event";
  }

  return "personal";
}

function deriveFeedbackKind(content: string): "do" | "dont" | "prefer" {
  const normalized = content.toLowerCase();

  if (normalized.includes("don't") || normalized.includes("do not")) {
    return "dont";
  }

  if (normalized.includes("prefer")) {
    return "prefer";
  }

  return "do";
}

function extractStableSubject(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = cleanExtractedValue(value)
    .toLowerCase()
    .replace(/^the\s+(?!to\b)/i, "")
    .replace(/^a\s+(?!to\b)/i, "")
    .replace(/^an\s+(?!to\b)/i, "")
    .replace(/^(?:my|current)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length >= 3 ? cleaned : undefined;
}

function trimPredicateBoundary(value: string): string {
  for (const match of value.matchAll(ENGLISH_SUBJECT_PREDICATE_BOUNDARY_PATTERN)) {
    if (match.index === undefined) {
      continue;
    }

    const prefix = value.slice(0, match.index).trim();
    if (/\b(?:that|which|who|to)\s*$/i.test(prefix)) {
      continue;
    }

    return prefix;
  }

  return value;
}

function extractBoundedEnglishSubject(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = cleanExtractedValue(value)
    .replace(ENGLISH_SUBJECT_TAIL_PATTERN, "")
    .replace(ENGLISH_SUBJECT_CLAUSE_PATTERN, "")
    .trim();
  const bounded = trimPredicateBoundary(trimmed)
    .trim();

  return extractStableSubject(bounded);
}

function extractFactSubject(content: string): string | undefined {
  const roleProjectMatch = content.match(/\bleading\s+([^.,!?]+)/i);
  if (roleProjectMatch?.[1]) {
    return extractBoundedEnglishSubject(roleProjectMatch[1]);
  }

  const scopedMatch = content.match(/\b(?:for|on)\s+([^.,!?]+)/i);
  if (scopedMatch?.[1]) {
    return extractBoundedEnglishSubject(scopedMatch[1]);
  }

  return undefined;
}

function deriveFactKind(content: string): FactKind | undefined {
  if (/\bmy current role is\b/i.test(content)) {
    return "role_update";
  }

  if (/\bmy current focus is\b/i.test(content)) {
    return "focus_update";
  }

  if (/\bblocker\b|\bblocked\b|\bblocking\b|\bapproval\b/i.test(content)) {
    return "blocker";
  }

  if (/\bopen loop\b|\bhandoff\b|\bsignoff\b|\bverification\b/i.test(content)) {
    return "open_loop";
  }

  if (
    /\b(next milestone|next step|next action|upcoming milestone|pending|waiting|remaining|still needs?|needs? review|needs? confirmation|needs? follow(?:-| )?up)\b/i.test(
      content,
    )
  ) {
    return "project_state";
  }

  if (deriveFactCategory(content) === "project" || deriveFactCategory(content) === "technical") {
    return "generic_project";
  }

  return undefined;
}

function deriveFactScopeKind(
  category: ReturnType<typeof deriveFactCategory>,
  factKind: FactKind | undefined,
): MemoryScopeKind | undefined {
  if (factKind === "role_update") {
    return "identity";
  }

  if (
    factKind === "focus_update" ||
    factKind === "blocker" ||
    factKind === "open_loop" ||
    factKind === "project_state" ||
    factKind === "generic_project"
  ) {
    return "project";
  }

  if (category === "personal" || category === "relationship" || category === "event") {
    return "identity";
  }

  if (category === "project" || category === "technical") {
    return "project";
  }

  return undefined;
}

function buildFactMetadata(
  content: string,
  categoryOverride?: "project" | "technical" | "personal" | "relationship" | "event",
): MemoryCandidateMetadata {
  const factKind = deriveFactKind(content);
  const derivedCategory = categoryOverride ?? deriveFactCategory(content);
  const category =
    derivedCategory === "personal" &&
    (factKind === "focus_update" ||
      factKind === "blocker" ||
      factKind === "open_loop" ||
      factKind === "project_state")
      ? "project"
      : derivedCategory;

  return {
    category,
    factKind,
    scopeKind: deriveFactScopeKind(category, factKind),
    subject: extractFactSubject(content) ?? "unknown",
  };
}

function deriveReferenceKind(content: string, pointer: string): ReferenceKind {
  if (/\bsource of truth\b/i.test(content)) {
    return "source_of_truth";
  }

  const basename = pointer.split("/").at(-1)?.toLowerCase() ?? pointer.toLowerCase();
  if (basename.includes("runbook")) {
    return "runbook";
  }
  if (basename.includes("dashboard")) {
    return "dashboard";
  }
  if (basename.includes("tracker")) {
    return "tracker";
  }

  return "doc";
}

function extractReferenceSubject(content: string): string | undefined {
  const match = content.match(/\bfor\s+([^.,!?]+)/i);
  return extractBoundedEnglishSubject(match?.[1]);
}

function looksLikeDurableInferredFact(content: string): boolean {
  return DURABLE_INFERENCE_PATTERNS.some((pattern) => pattern.test(content));
}

function createProfileCandidate(
  index: number,
  nextId: () => string,
  profileField: ProfileField,
  content: string,
): MemoryCandidate {
  return {
    id: nextId(),
    kindHint: "profile",
    explicitness: "explicit",
    content,
    sourceMessageIndex: index,
    sourceRole: "user",
    metadata: {
      profileField,
    },
  };
}

function createFactCandidate(
  index: number,
  nextId: () => string,
  content: string,
  category?: "project" | "technical" | "personal" | "relationship" | "event",
): MemoryCandidate {
  return {
    id: nextId(),
    kindHint: "fact",
    explicitness: "explicit",
    content,
    sourceMessageIndex: index,
    sourceRole: "user",
    metadata: buildFactMetadata(content, category),
  };
}

function cleanExtractedValue(value: string): string {
  return value.trim().replace(/[.,]+$/, "").trim();
}

function cleanRoleValue(value: string): string {
  return cleanExtractedValue(value).replace(/\s+role$/i, "").trim();
}

function cleanLocationValue(value: string): string {
  return cleanExtractedValue(value)
    .split(/\s+(?=working\b|leading\b|based\b|remember\b)/i)[0]!
    .trim();
}

function shouldSkipExplicitFactForProfileLikeClause(
  factContent: string,
  candidates: MemoryCandidate[],
): boolean {
  if (!candidates.some((candidate) => candidate.kindHint === "profile")) {
    return false;
  }

  return !PROFILE_LIKE_PROJECT_FACT_PATTERNS.some((pattern) => pattern.test(factContent));
}

function dedupeCandidates(candidates: MemoryCandidate[]): MemoryCandidate[] {
  return candidates.filter((candidate, candidateIndex, all) => {
    return (
      all.findIndex((other) => {
        return (
          other.kindHint === candidate.kindHint &&
          other.content.toLowerCase() === candidate.content.toLowerCase() &&
          other.metadata?.profileField === candidate.metadata?.profileField &&
          other.metadata?.preferenceCategory === candidate.metadata?.preferenceCategory &&
          other.metadata?.referencePointer === candidate.metadata?.referencePointer
        );
      }) === candidateIndex
    );
  });
}

function maybeExtractCandidatesFromClause(
  content: string,
  index: number,
  nextId: () => string,
): MemoryCandidate[] {
  const trimmed = content.trim();

  if (trimmed.length === 0 || GREETING_PATTERN.test(trimmed)) {
    return [];
  }

  const candidates: MemoryCandidate[] = [];

  const nameMatch = trimmed.match(PROFILE_NAME_PATTERN);
  const name = nameMatch ? cleanExtractedValue(nameMatch[1]!) : undefined;
  if (name) {
    candidates.push(createProfileCandidate(index, nextId, "name", name));
  }

  const roleWithOrganizationAndLocationMatch = trimmed.match(
    PROFILE_ROLE_WITH_ORGANIZATION_AND_LOCATION_PATTERN,
  );
  const roleDriftWithProjectMatch = trimmed.match(
    PROFILE_ROLE_DRIFT_WITH_PROJECT_PATTERN,
  );
  if (roleDriftWithProjectMatch) {
    const role = cleanRoleValue(roleDriftWithProjectMatch[1]!);
    const project = cleanExtractedValue(roleDriftWithProjectMatch[2]!);
    candidates.push(
      createProfileCandidate(
        index,
        nextId,
        "role",
        role,
      ),
    );
    candidates.push(
      createProfileCandidate(
        index,
        nextId,
        "currentProject",
        project,
      ),
    );
    candidates.push(
      createFactCandidate(
        index,
        nextId,
        `my current role is ${role} leading ${project}.`,
        "project",
      ),
    );
  } else if (roleWithOrganizationAndLocationMatch) {
    candidates.push(
      createProfileCandidate(
        index,
        nextId,
        "role",
        cleanRoleValue(roleWithOrganizationAndLocationMatch[1]!),
      ),
    );
    candidates.push(
      createProfileCandidate(
        index,
        nextId,
        "organization",
        cleanExtractedValue(roleWithOrganizationAndLocationMatch[2]!),
      ),
    );
    candidates.push(
      createProfileCandidate(
        index,
        nextId,
        "location",
        cleanLocationValue(roleWithOrganizationAndLocationMatch[3]!),
      ),
    );
  } else {
    const roleWithOrganizationMatch = trimmed.match(PROFILE_ROLE_WITH_ORGANIZATION_PATTERN);
    if (roleWithOrganizationMatch) {
      candidates.push(
        createProfileCandidate(
          index,
          nextId,
          "role",
          cleanRoleValue(roleWithOrganizationMatch[1]!),
        ),
      );
      candidates.push(
        createProfileCandidate(
          index,
          nextId,
          "organization",
          cleanExtractedValue(roleWithOrganizationMatch[2]!),
        ),
      );
    } else {
      const roleWithLocationMatch = trimmed.match(PROFILE_ROLE_WITH_LOCATION_PATTERN);
      if (roleWithLocationMatch) {
        candidates.push(
          createProfileCandidate(
            index,
            nextId,
            "role",
            cleanRoleValue(roleWithLocationMatch[1]!),
          ),
        );
        candidates.push(
          createProfileCandidate(
            index,
            nextId,
            "location",
            cleanLocationValue(roleWithLocationMatch[2]!),
          ),
        );
      } else {
        const roleMatch = trimmed.match(PROFILE_ROLE_PATTERN);
        const role = roleMatch ? cleanRoleValue(roleMatch[1]!) : undefined;
        if (role) {
          candidates.push(createProfileCandidate(index, nextId, "role", role));
        }

        const locationMatch = trimmed.match(PROFILE_LOCATION_PATTERN);
        const location = locationMatch
          ? cleanLocationValue(locationMatch[1]!)
          : undefined;
        if (location) {
          candidates.push(createProfileCandidate(index, nextId, "location", location));
        }
      }
    }
  }

  const timezoneMatch = trimmed.match(PROFILE_TIMEZONE_PATTERN);
  const timezone = timezoneMatch
    ? cleanExtractedValue(timezoneMatch[1]!)
    : undefined;
  if (timezone) {
    candidates.push(createProfileCandidate(index, nextId, "timezone", timezone));
  }

  const languageMatch = trimmed.match(PROFILE_LANGUAGE_PATTERN);
  const languagePreference = languageMatch
    ? cleanExtractedValue(languageMatch[1]!)
    : undefined;
  if (languagePreference) {
    candidates.push(
      createProfileCandidate(
        index,
        nextId,
        "languagePreference",
        languagePreference,
      ),
    );
  }

  const currentProjectMatch = trimmed.match(CURRENT_PROJECT_PATTERN);
  const currentProject = currentProjectMatch
    ? cleanExtractedValue(currentProjectMatch[1]!)
    : undefined;
  if (currentProject) {
    candidates.push(
      createProfileCandidate(index, nextId, "currentProject", currentProject),
    );
  }

  const explicitFactMatch = trimmed.match(EXPLICIT_FACT_PATTERN);
  if (explicitFactMatch) {
    const factContent = explicitFactMatch[1]!.trim();

    if (!shouldSkipExplicitFactForProfileLikeClause(factContent, candidates)) {
      candidates.push(createFactCandidate(index, nextId, factContent));
    }
  }

  const followUpOpenLoopMatch = trimmed.match(FOLLOW_UP_OPEN_LOOP_PATTERN);
  const openLoop = followUpOpenLoopMatch
    ? cleanExtractedValue(followUpOpenLoopMatch[1]!)
    : undefined;
  if (openLoop) {
    candidates.push(
      createFactCandidate(
        index,
        nextId,
        `the open loop is ${openLoop}.`,
      ),
    );
  }

  const preferenceMatch = trimmed.match(PREFERENCE_PATTERN);
  if (preferenceMatch) {
    const preferenceValue = preferenceMatch[1]!.trim();

    candidates.push({
      id: nextId(),
      kindHint: "preference",
      explicitness: "explicit",
      content: preferenceValue,
      sourceMessageIndex: index,
      sourceRole: "user",
      metadata: {
        preferenceCategory: "response_style",
        preferenceValue,
      },
    });
  }

  const referenceMatch = trimmed.match(REFERENCE_PATTERN);
  if (referenceMatch) {
    const pointer = referenceMatch[1]!.trim();
    const title = pointer.split("/").at(-1) ?? pointer;

    candidates.push({
      id: nextId(),
      kindHint: "reference",
      explicitness: "explicit",
      content: pointer,
      sourceMessageIndex: index,
      sourceRole: "user",
      metadata: {
        referenceKind: deriveReferenceKind(trimmed, pointer),
        referenceTitle: title,
        referencePointer: pointer,
        subject: extractReferenceSubject(trimmed) ?? "unknown",
      },
    });
  }

  const correctedReferenceMatch = trimmed.match(CORRECTED_REFERENCE_PATTERN);
  if (correctedReferenceMatch) {
    const pointer = correctedReferenceMatch[1]!.trim();
    const previousPointer = correctedReferenceMatch[2]!.trim();
    const title = pointer.split("/").at(-1) ?? pointer;

    candidates.push({
      id: nextId(),
      kindHint: "reference",
      explicitness: "explicit",
      content: pointer,
      sourceMessageIndex: index,
      sourceRole: "user",
      metadata: {
        referenceKind: deriveReferenceKind(trimmed, pointer),
        referenceTitle: title,
        referencePointer: pointer,
        supersedesPointer: previousPointer,
        subject: extractReferenceSubject(trimmed) ?? "unknown",
      },
    });
  }

  if (
    trimmed.length >= 20 &&
    (/^(please|always|never|don't|do not|prefer)\b/i.test(trimmed) ||
      /\bplease\b/i.test(trimmed))
  ) {
    candidates.push({
      id: nextId(),
      kindHint: "feedback",
      explicitness: "explicit",
      content: trimmed,
      sourceMessageIndex: index,
      sourceRole: "user",
      metadata: {
        feedbackKind: deriveFeedbackKind(trimmed),
        appliesTo: "general_response",
      },
    });
  }

  if (candidates.length === 0 && trimmed.length >= 24 && looksLikeDurableInferredFact(trimmed)) {
    candidates.push({
      id: nextId(),
      kindHint: "fact",
      explicitness: "inferred",
      content: trimmed,
      sourceMessageIndex: index,
      sourceRole: "user",
      metadata: {
        ...buildFactMetadata(trimmed),
      },
    });
  }

  return dedupeCandidates(candidates);
}

export function createEnglishLanguageAdapter(): LanguageAdapter {
  return {
    id: "en",
    supportsLocale(locale: string): boolean {
      return locale.toLowerCase().startsWith("en");
    },
    splitClauses(text: string): string[] {
      return splitClausesGeneric(text);
    },
    normalizeForEquality(text: string): string {
      return normalizeUnicodeForEquality(text);
    },
    tokenize(text: string, options?: { excludeStopwords?: boolean }): string[] {
      const tokens = tokenizeUnicodeText(text, "en-US").filter((token) => token.length >= 4);
      if (options?.excludeStopwords) {
        return tokens.filter((token) => !TOKEN_STOPWORDS.has(token));
      }
      return tokens;
    },
    extractCandidates(input: LanguageCandidateExtractionInput): MemoryCandidate[] {
      const candidates: MemoryCandidate[] = [];

      input.messages.forEach((message, index) => {
        if (message.role !== "user") {
          return;
        }

        const sourceMessageIndex = message.sourceMessageIndex ?? index;

        const clauses = splitClausesGeneric(message.content);
        for (const clause of clauses) {
          candidates.push(
            ...maybeExtractCandidatesFromClause(
              clause,
              sourceMessageIndex,
              input.nextId,
            ),
          );
        }
      });

      return candidates;
    },
  };
}
