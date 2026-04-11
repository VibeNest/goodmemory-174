import {
  createLanguageService,
  type LanguageService,
} from "../language";

export type RetrievalProfile = "general_chat" | "coding_agent";
export type RecallRouterStrategy = "rules-only" | "hybrid" | "llm-assisted";

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
  | "evidence"
  | "session_archive"
  | "episode"
  | "working_memory"
  | "session_journal";

export interface RecallRuntimeAvailability {
  hasWorkingMemory: boolean;
  hasJournal: boolean;
}

export interface RecallRouterAvailability {
  semanticSearch: boolean;
  llmRouting: boolean;
}

export interface RouterStrategyExplanation {
  requestedStrategy: RecallRouterStrategy;
  resolvedStrategy: RecallRouterStrategy;
  fallbackReason?:
    | "semantic_search_unavailable"
    | "llm_routing_unavailable";
  summary: string;
  hardFloor: "lexical_runtime_procedural_priors";
  semanticTieBreaking: boolean;
  llmRefinement: boolean;
}

export interface RoutingDecision {
  retrievalProfile: RetrievalProfile;
  intent: "general_assistance" | "task_continuation";
  strategy: RecallRouterStrategy;
  strategyExplanation: RouterStrategyExplanation;
  sourcePriorities: RecallSource[];
  requestedSlots: RecallSlot[];
  supportSlots: RecallSlot[];
  actionDriving: boolean;
  referenceSeeking: boolean;
  continuation: boolean;
}

export interface RecallRoutingInput {
  retrievalProfile?: RetrievalProfile;
  strategy?: RecallRouterStrategy;
  availability?: Partial<RecallRouterAvailability>;
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

export function resolveRouterStrategy(input: {
  strategy?: RecallRouterStrategy;
  availability?: Partial<RecallRouterAvailability>;
}): RouterStrategyExplanation {
  const requestedStrategy = input.strategy ?? "rules-only";
  const semanticSearchAvailable = input.availability?.semanticSearch === true;
  const llmRoutingAvailable = input.availability?.llmRouting === true;

  if (requestedStrategy === "rules-only") {
    return {
      requestedStrategy,
      resolvedStrategy: "rules-only",
      summary:
        "rules-only default keeps lexical, runtime, and procedural priors as the hard floor.",
      hardFloor: "lexical_runtime_procedural_priors",
      semanticTieBreaking: false,
      llmRefinement: false,
    };
  }

  if (requestedStrategy === "hybrid") {
    if (semanticSearchAvailable) {
      return {
        requestedStrategy,
        resolvedStrategy: "hybrid",
        summary:
          "hybrid routing keeps rules-first priorities primary and only enables semantic tie-breaking around them.",
        hardFloor: "lexical_runtime_procedural_priors",
        semanticTieBreaking: true,
        llmRefinement: false,
      };
    }

    return {
      requestedStrategy,
      resolvedStrategy: "rules-only",
      fallbackReason: "semantic_search_unavailable",
      summary:
        "hybrid routing was requested but semantic search is unavailable, so routing falls back to deterministic rules-only behavior.",
      hardFloor: "lexical_runtime_procedural_priors",
      semanticTieBreaking: false,
      llmRefinement: false,
    };
  }

  if (llmRoutingAvailable) {
    return {
      requestedStrategy,
      resolvedStrategy: "llm-assisted",
      summary:
        "llm-assisted routing keeps rules-first priorities primary and only allows model refinement after the deterministic floor is established.",
      hardFloor: "lexical_runtime_procedural_priors",
      semanticTieBreaking: semanticSearchAvailable,
      llmRefinement: true,
    };
  }

  if (semanticSearchAvailable) {
    return {
      requestedStrategy,
      resolvedStrategy: "hybrid",
      fallbackReason: "llm_routing_unavailable",
      summary:
        "llm-assisted routing was requested but model refinement is unavailable, so routing falls back to hybrid semantic tie-breaking.",
      hardFloor: "lexical_runtime_procedural_priors",
      semanticTieBreaking: true,
      llmRefinement: false,
    };
  }

  return {
    requestedStrategy,
    resolvedStrategy: "rules-only",
    fallbackReason: "llm_routing_unavailable",
    summary:
      "llm-assisted routing was requested but provider-backed assistance is unavailable, so routing falls back to deterministic rules-only behavior.",
    hardFloor: "lexical_runtime_procedural_priors",
    semanticTieBreaking: false,
    llmRefinement: false,
  };
}

export function planRecall(input: RecallRoutingInput): RoutingDecision {
  const retrievalProfile = resolveRetrievalProfile(input.retrievalProfile);
  const language = input.language ?? DEFAULT_LANGUAGE;
  const strategyExplanation = resolveRouterStrategy({
    strategy: input.strategy,
    availability: input.availability,
  });
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
  const includeEvidence =
    continuationIntent || actionDriving || referenceSeeking;
  const evidenceSources: RecallSource[] = includeEvidence ? ["evidence"] : [];

  if (continuationIntent) {
    return {
      retrievalProfile,
      intent: "task_continuation",
      strategy: strategyExplanation.resolvedStrategy,
      strategyExplanation,
      sourcePriorities: [
        "working_memory",
        "session_journal",
        "session_archive",
        "episode",
        "fact",
        ...evidenceSources,
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
    strategy: strategyExplanation.resolvedStrategy,
    strategyExplanation,
    sourcePriorities: [
      "profile",
      "feedback",
      "fact",
      ...evidenceSources,
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
