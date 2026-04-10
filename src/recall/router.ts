import {
  createLanguageService,
  type LanguageService,
} from "../language";

export type RetrievalProfile = "general_chat" | "coding_agent";

export type RecallSlot =
  | "role"
  | "focus"
  | "blocker"
  | "open_loop"
  | "reference"
  | "project_state_support"
  | "runtime_continuity"
  | "feedback_guidance";

export type RecallSource =
  | "profile"
  | "feedback"
  | "fact"
  | "session_archive"
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
  requestedSlots: RecallSlot[];
  supportSlots: RecallSlot[];
  actionDriving: boolean;
  referenceSeeking: boolean;
  continuation: boolean;
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
  const roleQuery = language.isRoleQuery(input.query, locale);
  const focusQuery = language.isFocusQuery(input.query, locale);
  const blockerQuery = language.isBlockerQuery(input.query, locale);
  const openLoopQuery = language.isOpenLoopQuery(input.query, locale);
  const referenceSeeking = language.isReferenceSeekingQuery(input.query, locale);
  const actionDriving = language.isActionDrivingQuery(input.query, locale);
  const requestedSlots: RecallSlot[] = [];

  if (roleQuery) {
    requestedSlots.push("role");
  }
  if (focusQuery) {
    requestedSlots.push("focus");
  }
  if (blockerQuery) {
    requestedSlots.push("blocker");
  }
  if (openLoopQuery) {
    requestedSlots.push("open_loop");
  }
  if (referenceSeeking) {
    requestedSlots.push("reference");
  }

  const supportSlots: RecallSlot[] = [];
  if (
    actionDriving &&
    (requestedSlots.includes("role") ||
      requestedSlots.includes("focus") ||
      requestedSlots.includes("reference"))
  ) {
    supportSlots.push("project_state_support");
  }
  if (continuationIntent) {
    supportSlots.push("runtime_continuity");
  }

  if (continuationIntent) {
    return {
      retrievalProfile,
      intent: "task_continuation",
      sourcePriorities: [
        "working_memory",
        "session_journal",
        "session_archive",
        "episode",
        "fact",
        "feedback",
        "profile",
      ],
      requestedSlots,
      supportSlots,
      actionDriving,
      referenceSeeking,
      continuation: continuationIntent,
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
    requestedSlots,
    supportSlots,
    actionDriving,
    referenceSeeking,
    continuation: continuationIntent,
  };
}
