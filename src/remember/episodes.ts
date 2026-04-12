import { createEpisodeMemory } from "../domain/records";
import type { EpisodeMemory } from "../domain/records";
import type { LanguageService } from "../language";
import type {
  MemoryCandidate,
  MemoryExtractionInput,
} from "./candidates";

const ASSISTANT_FOLLOW_THROUGH_OVERLAP_THRESHOLD = 0.14;

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
): string[] {
  return messages
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
    });
}

function selectAssistantContinuityMessages(
  messages: string[],
  language: LanguageService,
  locale: string,
): string[] {
  return messages.filter((message) =>
    language.isAssistantContinuitySignal(
      message,
      language.resolveFromText({
        locale,
        text: message,
      }),
    ),
  );
}

function buildCandidateGroundingText(candidate: MemoryCandidate): string {
  const hints: string[] = [];

  if (candidate.kindHint === "profile" && candidate.metadata?.profileField) {
    hints.push(candidate.metadata.profileField);
  }

  if (candidate.kindHint === "fact" && candidate.metadata?.factKind) {
    hints.push(candidate.metadata.factKind);
  }

  if (candidate.kindHint === "reference" && candidate.metadata?.referenceKind) {
    hints.push(candidate.metadata.referenceKind);
  }

  if (candidate.kindHint === "feedback" && candidate.metadata?.feedbackKind) {
    hints.push(candidate.metadata.feedbackKind);
  }

  return [describeEpisodeCandidate(candidate), ...hints]
    .filter((value) => value.trim().length > 0)
    .join(" ");
}

function selectFollowThroughHighlights(
  assistantMessages: string[],
  candidates: MemoryCandidate[],
  language: LanguageService,
  locale: string,
): string[] {
  const candidateDetails = candidates.map((candidate) => ({
    grounding: buildCandidateGroundingText(candidate),
    highlight: describeEpisodeCandidate(candidate),
  }));

  const matchedHighlights = assistantMessages.flatMap((message) => {
    const matchingCandidates = candidateDetails.filter(
      (candidate) =>
        language.tokenOverlap(message, candidate.grounding, locale, {
          excludeStopwords: true,
        }) >= ASSISTANT_FOLLOW_THROUGH_OVERLAP_THRESHOLD,
    );

    if (matchingCandidates.length !== 1) {
      return [];
    }

    return [matchingCandidates[0]!.highlight];
  });

  return dedupeNonEmpty(matchedHighlights).slice(0, 2);
}

function buildEpisodeKeyDecisions(candidateHighlights: string[]): string[] {
  return candidateHighlights
    .map((highlight) => `Assistant follow-through on: ${highlight}`)
    .slice(0, 2);
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
  return dedupeNonEmpty(candidates.map((candidate) => describeEpisodeCandidate(candidate)))
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
): EpisodeMemory | null {
  const assistantMessages = selectSubstantiveAssistantMessages(
    input.messages,
    language,
    input.locale,
  );
  const assistantContinuityMessages = selectAssistantContinuityMessages(
    assistantMessages,
    language,
    locale,
  );
  const candidateHighlights = dedupeNonEmpty(
    candidates.map((candidate) => describeEpisodeCandidate(candidate)),
  ).slice(0, 2);
  const followThroughHighlights = selectFollowThroughHighlights(
    assistantContinuityMessages,
    candidates,
    language,
    locale,
  );
  const hasAssistantContribution =
    assistantContinuityMessages.length > 0 || followThroughHighlights.length > 0;

  if (candidateHighlights.length === 0 || !hasAssistantContribution) {
    return null;
  }

  const summarySegments = [...candidateHighlights];
  summarySegments.push(
    followThroughHighlights.length > 0
      ? "Assistant follow-through captured."
      : "Assistant substantive continuity captured.",
  );

  return createEpisodeMemory({
    id,
    userId: input.scope.userId,
    tenantId: input.scope.tenantId,
    workspaceId: input.scope.workspaceId,
    agentId: input.scope.agentId,
    sessionId: input.scope.sessionId,
    summary: `Conversation covered: ${summarySegments.join(" / ")}`,
    keyDecisions: buildEpisodeKeyDecisions(followThroughHighlights),
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
