import { createEpisodeMemory } from "../domain/records";
import type { EpisodeMemory } from "../domain/records";
import type { LanguageService } from "../language";
import type {
  MemoryCandidate,
  MemoryExtractionInput,
} from "./candidates";

interface EpisodeTextRedaction {
  from: string;
  to: string;
}

function dedupeNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      return false;
    }

    seen.add(trimmed);
    return true;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyEpisodeRedactions(
  value: string,
  redactions: EpisodeTextRedaction[],
): string {
  let sanitized = value.trim();
  const sortedRedactions = [...redactions].sort(
    (left, right) => right.from.length - left.from.length,
  );

  for (const redaction of sortedRedactions) {
    const from = redaction.from.trim();
    const to = redaction.to.trim();

    if (from.length === 0 || from === to) {
      continue;
    }

    sanitized = sanitized.replace(new RegExp(escapeRegExp(from), "giu"), to);
  }

  return sanitized.trim();
}

function describeEpisodeCandidate(candidate: MemoryCandidate): string {
  const content = candidate.content.trim();

  if (candidate.kindHint === "profile") {
    const profileField = candidate.metadata?.profileField;
    return profileField ? `${profileField}: ${content}` : content;
  }

  return content;
}

function selectSubstantiveAssistantMessages(
  messages: MemoryExtractionInput["messages"],
  language: LanguageService,
  locale?: string,
  redactions: EpisodeTextRedaction[] = [],
): string[] {
  const assistantMessages = messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0)
    .filter((content) => {
      const resolved = language.resolveFromText({
        locale,
        text: content,
      });
      return (
        !language.isAssistantAcknowledgement(content, resolved) ||
        language.isAssistantContinuitySignal(content, resolved) ||
        content.length >= 24
      );
    })
    .map((content) => applyEpisodeRedactions(content, redactions));

  return dedupeNonEmpty(assistantMessages);
}

function extractEpisodeUnresolvedItems(
  candidates: MemoryCandidate[],
  language: LanguageService,
  locale?: string,
): string[] {
  const unresolvedCandidates = candidates
    .filter((candidate) => {
      if (
        candidate.kindHint === "fact" &&
        (candidate.metadata?.factKind === "blocker" ||
          candidate.metadata?.factKind === "open_loop")
      ) {
        return true;
      }

      return false;
    })
    .map((candidate) => candidate.content.trim());

  const languageDetected = candidates
    .map((candidate) => candidate.content.trim())
    .filter((message) =>
      language.isUnresolvedSignal(
        message,
        language.resolveFromText({
          locale,
          text: message,
        }),
      ),
    );

  return dedupeNonEmpty([...unresolvedCandidates, ...languageDetected])
    .slice(0, 2);
}

function buildEpisodeTopics(candidates: MemoryCandidate[]): string[] {
  return dedupeNonEmpty(
    candidates.map((candidate) => {
      if (candidate.kindHint === "profile") {
        return candidate.metadata?.profileField ?? candidate.content;
      }

      if (candidate.kindHint === "reference") {
        return (
          candidate.metadata?.referenceTitle ??
          candidate.metadata?.referencePointer ??
          candidate.content
        );
      }

      if (candidate.kindHint === "preference") {
        return candidate.metadata?.preferenceCategory ?? candidate.content;
      }

      if (candidate.kindHint === "feedback") {
        return candidate.metadata?.appliesTo ?? candidate.content;
      }

      return candidate.metadata?.subject ?? candidate.content;
    }),
  )
    .map((topic) => topic.split(" ").slice(0, 3).join(" "))
    .filter((topic) => topic.length > 0)
    .slice(0, 2);
}

export function maybeBuildEpisode(
  input: MemoryExtractionInput,
  candidates: MemoryCandidate[],
  id: string,
  timestamp: string,
  language: LanguageService,
  locale: string,
  redactions: EpisodeTextRedaction[] = [],
): EpisodeMemory | null {
  const substantiveAssistantMessages = selectSubstantiveAssistantMessages(
    input.messages,
    language,
    input.locale,
    redactions,
  );
  const candidateHighlights = dedupeNonEmpty(
    candidates.map((candidate) => describeEpisodeCandidate(candidate)),
  ).slice(0, 2);

  if (candidateHighlights.length === 0 || substantiveAssistantMessages.length === 0) {
    return null;
  }

  const summarySegments = [...candidateHighlights];
  if (substantiveAssistantMessages.length > 0) {
    summarySegments.push(
      `Assistant follow-through: ${substantiveAssistantMessages[0]}`,
    );
  }

  return createEpisodeMemory({
    id,
    userId: input.scope.userId,
    tenantId: input.scope.tenantId,
    workspaceId: input.scope.workspaceId,
    agentId: input.scope.agentId,
    sessionId: input.scope.sessionId,
    summary: `Conversation covered: ${summarySegments.join(" / ")}`,
    keyDecisions: substantiveAssistantMessages.slice(0, 2),
    unresolvedItems: extractEpisodeUnresolvedItems(
      candidates,
      language,
      input.locale,
    ),
    topics: buildEpisodeTopics(candidates),
    importance: 0.7,
    confidence: 0.8,
    locale,
    createdAt: timestamp,
  });
}
