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
}

const CONTINUATION_PATTERN =
  /\b(continue|resume|pick up|last time|from last time|carry on)\b/i;

export function resolveRetrievalProfile(
  profile?: RetrievalProfile,
): RetrievalProfile {
  return profile ?? "general_chat";
}

export function planRecall(input: RecallRoutingInput): RoutingDecision {
  const retrievalProfile = resolveRetrievalProfile(input.retrievalProfile);
  const continuationIntent =
    retrievalProfile === "coding_agent" || CONTINUATION_PATTERN.test(input.query);

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
