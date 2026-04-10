import {
  createLanguageService,
  type LanguageService,
} from "../language";

export type RetrievalProfile = "general_chat" | "coding_agent";

export type RecallSource =
  | "profile"
  | "feedback"
  | "fact"
  | "episode"
  | "working_memory"
  | "session_journal";

export interface RecallRuntimeAvailability {
  hasWorkingMemory: boolean;
  hasJournal: boolean;
}

export interface RoutingDecision {
  retrievalProfile: RetrievalProfile;
  intent: "general_assistance" | "task_continuation";
  sourcePriorities: RecallSource[];
}

export interface RecallRoutingInput {
  retrievalProfile?: RetrievalProfile;
  query: string;
  runtime: RecallRuntimeAvailability;
  locale?: string;
  language?: LanguageService;
}

const DEFAULT_LANGUAGE = createLanguageService();

export function resolveRetrievalProfile(
  profile?: RetrievalProfile,
): RetrievalProfile {
  return profile ?? "general_chat";
}

export function planRecall(input: RecallRoutingInput): RoutingDecision {
  const retrievalProfile = resolveRetrievalProfile(input.retrievalProfile);
  const language = input.language ?? DEFAULT_LANGUAGE;
  const locale =
    input.locale ??
    language.resolveFromText({
      text: input.query,
    }).locale;
  const continuationIntent =
    retrievalProfile === "coding_agent" ||
    language.isContinuationQuery(input.query, locale);

  if (continuationIntent) {
    return {
      retrievalProfile,
      intent: "task_continuation",
      sourcePriorities: [
        "working_memory",
        "session_journal",
        "episode",
        "fact",
        "feedback",
        "profile",
      ],
    };
  }

  return {
    retrievalProfile,
    intent: "general_assistance",
    sourcePriorities: [
      "profile",
      "feedback",
      "fact",
      "episode",
      "working_memory",
      "session_journal",
    ],
  };
}
