import {
  createLanguageService,
  type LanguageService,
} from "../language";

export type RetrievalProfile = "general_chat" | "coding_agent";
export type RecallRouterStrategy =
  | "rules-only"
  | "hybrid"
  | "llm-assisted"
  | "auto";

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

interface AutoRouterSignals {
  retrievalProfile: RetrievalProfile;
  requestedSlots: RecallSlot[];
  supportSlots: RecallSlot[];
  continuation: boolean;
  referenceSeeking: boolean;
  actionDriving: boolean;
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
  autoSignals?: AutoRouterSignals;
}): RouterStrategyExplanation {
  const requestedStrategy = input.strategy ?? "auto";
  const semanticSearchAvailable = input.availability?.semanticSearch === true;
  const llmRoutingAvailable = input.availability?.llmRouting === true;

  if (requestedStrategy === "auto") {
    const shouldUseHybrid = Boolean(
      semanticSearchAvailable &&
        input.autoSignals &&
        (
          input.autoSignals.retrievalProfile === "coding_agent" ||
          input.autoSignals.continuation ||
          input.autoSignals.referenceSeeking ||
          input.autoSignals.actionDriving ||
          input.autoSignals.requestedSlots.some((slot) =>
            slot === "blocker" || slot === "open_loop" || slot === "reference"
          ) ||
          input.autoSignals.supportSlots.includes("project_state_support")
        ),
    );

    if (shouldUseHybrid) {
      return {
        requestedStrategy,
        resolvedStrategy: "hybrid",
        summary:
          "auto routing enabled hybrid recall because the query needs continuation, references, or action-driving semantic support while keeping rules-first priorities as the hard floor.",
        hardFloor: "lexical_runtime_procedural_priors",
        semanticTieBreaking: true,
        llmRefinement: false,
      };
    }

    return {
      requestedStrategy,
      resolvedStrategy: "rules-only",
      summary: semanticSearchAvailable
        ? "auto routing kept deterministic rules-only recall because the query is profile/procedural/general assistance and does not need semantic tie-breaking."
        : "auto routing kept deterministic rules-only recall because semantic search is unavailable.",
      hardFloor: "lexical_runtime_procedural_priors",
      semanticTieBreaking: false,
      llmRefinement: false,
    };
  }

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
  const strategyExplanation = resolveRouterStrategy({
    strategy: input.strategy,
    availability: input.availability,
    autoSignals: {
      retrievalProfile,
      requestedSlots,
      supportSlots,
      continuation: continuationIntent,
      referenceSeeking,
      actionDriving,
    },
  });
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
