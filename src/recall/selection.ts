import type { FactMemory, UserProfile } from "../domain/records";
import type { LanguageService } from "../language";
import type { RecallCandidateTrace } from "./engine";
import type { RecallSlot, RetrievalProfile, RoutingDecision } from "./router";
import {
  buildFactCandidates,
  materializeFactCandidate,
  rankFactCandidates,
} from "./scoring";
import type { RankedFactCandidate } from "./scoring";
import { FACT_SELECTION_AUGMENTER_TABLE } from "./factSelection/augmenterTable";
import type { FactSelectionRuntime } from "./factSelection/contracts";
import {
  createSelectionDraft,
  finalizeSuppressionReasons,
} from "./factSelection/draft";
import {
  FACT_SELECTION_ROUTES_BY_ID,
  PRIMARY_FACT_SELECTION_ORDER,
  type PrimaryFactSelectionId,
} from "./factSelection/routeTable";
import { buildSelectionRunContext } from "./selectionRunContext";
import { selectSlotFacts } from "./selectionSlot";
import {
  AGGREGATE_FACT_COUNT_LIMIT,
  AGGREGATE_OPEN_LOOP_LIMIT,
  aggregateEvidencePriority,
  hasAggregateFactCountSignal,
  hasAggregateOpenLoopSignal,
} from "./selectors/aggregate";
import {
  hasResearchRecommendationSignal,
  userGroundedEvidencePriority,
} from "./selectors/conversationEvidence";
import {
  SOURCE_ORDER_EVENT_RECALL_LIMIT,
  fillSourceOrderedTemporalCompanions,
  fillSourceOrderedTemporalGaps,
  fillSourceOrderedTemporalMilestones,
} from "./selectors/sourceOrderTemporal";
import {
  RESEARCH_RECOMMENDATION_LIMIT,
  diversifyRankedFactCandidatesBySession,
  hasConversationEvidenceTag,
  hasUserAnswerTag,
  slotMatchesFact,
} from "./selectors/selectionContext";
import { isSourceEnvelopeCandidate } from "./selectors/sourceEnvelope";
import {
  compareTemporalFactChronology,
  hasTemporalEventOrderSignal,
  isSourceOrderedFact as isImportedSourceFact,
  temporalOrderEvidencePriority,
} from "./selectors/temporal";
import { collapseLatestUpdateSeries } from "./selectors/updateSeries";


export {
  selectArchives,
  selectEpisodes,
  selectFeedback,
  selectFeedbackForProfile,
  selectFeedbackForQuery,
  selectPreferencesForQuery,
  selectReferences,
} from "./selectors/recordSelection";

export function selectFacts(
  facts: FactMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  retrievalProfile: RetrievalProfile,
  routingDecision: RoutingDecision,
  profile: UserProfile | null,
  referenceTime: string,
  semanticScores?: Map<string, number>,
  evidenceCountsByMemoryId?: Map<string, number>,
): { facts: FactMemory[]; traces: RecallCandidateTrace[] } {
  const ranked = rankFactCandidates(
    buildFactCandidates(
      facts,
      query,
      language,
      queryLocale,
      referenceTime,
      semanticScores,
      evidenceCountsByMemoryId,
    ),
    routingDecision.strategy,
  );
  const traces: RecallCandidateTrace[] = ranked.map((entry) => ({
    memoryId: entry.fact.id,
    memoryType: "fact",
    slot: "generic",
    returned: false,
    whySuppressed: !language.localesCompatible(queryLocale, entry.locale)
      ? "locale mismatch"
      : entry.fact.lifecycle !== "active"
        ? "inactive lifecycle"
        : "not selected",
    intentScore: entry.intentScore,
    lexicalScore: entry.lexicalScore,
    freshnessScore: entry.freshnessScore,
    explicitnessScore: entry.explicitnessScore,
    usageScore: entry.usageScore,
    evidenceScore: entry.evidenceScore,
    outcomeScore: entry.outcomeScore,
    verificationPenaltyScore: entry.verificationPenaltyScore,
    fallback: "none",
  }));
  const compatible = ranked.filter(
    (entry) =>
      entry.fact.lifecycle === "active" &&
      language.localesCompatible(queryLocale, entry.locale),
  );
  const ctx = buildSelectionRunContext({
    compatible,
    language,
    profile,
    query,
    queryLocale,
    routingDecision,
  });
  const {
    aggregateEvidenceQuery,
    aggregateOpenLoopQuery,
    answerCompositionQuery,
    assistantEvidenceRecallQuery,
    broadAspectEventOrderCandidates,
    contradictionEvidencePair,
    conversationEvidenceCandidates,
    couponRedemptionLocationQuery,
    directFactualEvidenceBridgeCandidates,
    directFactualLookupQuery,
    exactSourceOrderedReasoningQuery,
    factConfirmationQuery,
    informationExtractionCandidates,
    instructionEvidenceCandidates,
    limit,
    personalWorkChallengeCandidates,
    preferenceEvidenceCandidates,
    referenceOnlyQuery,
    reasoningBridgeCandidates,
    researchRecommendationQuery,
    resumeDesignInstructionQuery,
    slotSpecificFactQuery,
    sourceOrderedEventOrderCandidates,
    sourceOrderedNamedEntityEventPlanActive,
    sourceOrderedTemporalIntervalCandidates,
    sourceOrderedValueUpdateCandidates,
    sourcePreferenceCandidates,
    sourcePreferenceExclusiveQuery,
    sourcePreferenceOverrideByContradiction,
    summaryCoverageCandidates,
    temporalBridgeEvidenceCandidates,
    temporalEventOrderQuery,
    userBroughtUpEventOrderQuery,
    temporalMostRecentQuery,
    temporalRelativeEventQuery,
    timelineIntegrationCandidates,
    trelloSprintPrioritizationCriteriaAbstentionQuery,
    updateEvidenceCandidates,
    updateEvidencePool,
    updateEvidenceSeriesOptions,
    updateSeriesOptions,
    userGroundedRecallQuery,
    weatherFeatureConcernCountQuery,
    withIntentSignal,
    withLexicalOrSubjectSignal,
  } = ctx;
  const runtime: FactSelectionRuntime = {
    compatible,
    language,
    query,
    queryLocale,
    retrievalProfile,
    strategy: routingDecision.strategy,
  };
  const draft = createSelectionDraft({ traces });
  const selected = draft.selected;
  const selectedIds = draft.selectedIds;
  const selectAndTrace = draft.select;
  if (trelloSprintPrioritizationCriteriaAbstentionQuery) {
    return { facts: [], traces };
  }

  const trySelectSlot = (
    slot: RecallSlot,
    entries: RankedFactCandidate[],
    allowUniqueFallback: boolean,
    options?: {
      aggregateLimit?: number;
      aggregateSignal?: (entry: RankedFactCandidate) => boolean;
    },
  ) => {
    selectSlotFacts({
      aggregateLimit: options?.aggregateLimit,
      aggregateSignal: options?.aggregateSignal,
      allowUniqueFallback,
      entries,
      selectedIds,
      selectAndTrace,
      slot,
      strategy: routingDecision.strategy,
    });
  };

  if (referenceOnlyQuery) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "reference-only query";
      }
    }
    return {
      facts: [],
      traces,
    };
  }

  if (slotSpecificFactQuery) {
    const activeSlots: RecallSlot[] = [];
    if (
      routingDecision.requestedSlots.includes("role") &&
      (!profile?.identity.role || routingDecision.requestedSlots.length > 1)
    ) {
      activeSlots.push("role");
      trySelectSlot("role", compatible, false);
    } else if (routingDecision.requestedSlots.includes("role")) {
      for (const entry of compatible.filter((item) => item.factKind === "role_update")) {
        const trace = traces.find((item) => item.memoryId === entry.fact.id);
        if (trace && trace.whySuppressed === "not selected") {
          trace.whySuppressed = "profile satisfied role slot";
        }
      }
    }

    if (routingDecision.requestedSlots.includes("focus")) {
      activeSlots.push("focus");
      trySelectSlot("focus", compatible, false);
    }
    if (routingDecision.requestedSlots.includes("blocker")) {
      activeSlots.push("blocker");
      trySelectSlot("blocker", compatible, false);
    }
    if (routingDecision.requestedSlots.includes("open_loop")) {
      activeSlots.push("open_loop");
      trySelectSlot(
        "open_loop",
        compatible,
        false,
        aggregateOpenLoopQuery
          ? {
              aggregateLimit: AGGREGATE_OPEN_LOOP_LIMIT,
              aggregateSignal: hasAggregateOpenLoopSignal,
            }
          : undefined,
      );
    }
    if (routingDecision.supportSlots.includes("project_state_support")) {
      activeSlots.push("project_state_support");
      trySelectSlot("project_state_support", compatible, true);
    }

    for (const entry of compatible) {
      const trace = traces.find((item) => item.memoryId === entry.fact.id);
      if (!trace || trace.returned || trace.whySuppressed !== "not selected") {
        continue;
      }

      if (!activeSlots.some((slot) => slotMatchesFact(entry, slot))) {
        trace.whySuppressed = "slot mismatch";
      } else {
        trace.whySuppressed = "no slot signal";
      }
    }

    return {
      facts: selected.map(materializeFactCandidate),
      traces,
    };
  }

  if (resumeDesignInstructionQuery && instructionEvidenceCandidates.length > 0) {
    for (const entry of instructionEvidenceCandidates) {
      selectAndTrace(entry);
    }
    return {
      facts: selected.map(materializeFactCandidate),
      traces,
    };
  }
  const pickGenericCandidates = (entries: RankedFactCandidate[]) => {
    if (!directFactualLookupQuery) {
      return entries.slice(0, limit);
    }

    const explicitEvidenceEntries = entries.filter(hasConversationEvidenceTag);
    const candidatePool =
      explicitEvidenceEntries.length > 0 ? explicitEvidenceEntries : entries;
    const orderedCandidatePool = userGroundedRecallQuery
      ? [...candidatePool].sort(
        (left, right) =>
          userGroundedEvidencePriority(right) -
          userGroundedEvidencePriority(left),
      )
      : candidatePool;

    return diversifyRankedFactCandidatesBySession(
      orderedCandidatePool,
      limit,
    );
  };

  let contradictionPairSelected = false;
  const runPrimarySelector = (selectorId: PrimaryFactSelectionId): boolean => {
    if (sourcePreferenceExclusiveQuery && !sourcePreferenceOverrideByContradiction) return false;
    const route = FACT_SELECTION_ROUTES_BY_ID[selectorId];
    if (route) {
      if (!route.isEligible({ ctx, runtime })) {
        return false;
      }

      const outcome = route.select({ ctx, runtime });
      for (const entry of outcome.entries) {
        selectAndTrace(entry);
      }
      if (outcome.claimsContradictionPair === true) {
        contradictionPairSelected = true;
      }
      return true;
    }
    switch (selectorId) {
      case "aggregate_evidence": {
        if (
          sourceOrderedValueUpdateCandidates.length > 0 ||
          sourceOrderedTemporalIntervalCandidates.length > 0
        ) {
          return false;
        }

        if (!aggregateEvidenceQuery) {
          return false;
        }

        const aggregateCandidates = rankFactCandidates(
          collapseLatestUpdateSeries(
            compatible.filter((item) =>
              hasAggregateFactCountSignal(item, query, language, queryLocale)
            ),
            updateSeriesOptions,
          ),
          routingDecision.strategy,
        ).sort(
          (left, right) =>
            aggregateEvidencePriority(right, query, language, queryLocale) -
            aggregateEvidencePriority(left, query, language, queryLocale),
        );

        for (const entry of diversifyRankedFactCandidatesBySession(
          aggregateCandidates,
          AGGREGATE_FACT_COUNT_LIMIT,
        )) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "temporal_order": {
        if (
          !temporalEventOrderQuery &&
          !temporalMostRecentQuery &&
          !temporalRelativeEventQuery &&
          broadAspectEventOrderCandidates.length === 0 &&
          !sourceOrderedNamedEntityEventPlanActive
        ) {
          return false;
        }

        if (broadAspectEventOrderCandidates.length > 0) {
          for (const entry of broadAspectEventOrderCandidates) {
            selectAndTrace(entry);
          }
          return true;
        }

        if (
          sourceOrderedNamedEntityEventPlanActive
        ) {
          for (const entry of sourceOrderedEventOrderCandidates) {
            selectAndTrace(entry);
          }
          return true;
        }

        const rankedTemporalCandidatePool = rankFactCandidates(
          compatible.filter((entry) => hasTemporalEventOrderSignal(entry, query)),
          routingDecision.strategy,
        ).sort(
          (left, right) =>
            temporalOrderEvidencePriority(right, query) -
            temporalOrderEvidencePriority(left, query),
        );
        const userAnsweredTemporalCandidates =
          rankedTemporalCandidatePool.filter(hasUserAnswerTag);
        const rankedTemporalCandidates =
          userBroughtUpEventOrderQuery &&
            userAnsweredTemporalCandidates.length > 0
            ? userAnsweredTemporalCandidates
            : rankedTemporalCandidatePool;
        const fallbackTemporalCandidates = diversifyRankedFactCandidatesBySession(
          rankedTemporalCandidates,
          compatible.some(isImportedSourceFact) ? SOURCE_ORDER_EVENT_RECALL_LIMIT : limit,
        );
        const temporalCandidates = sourceOrderedEventOrderCandidates.length > 0
          ? [
            ...sourceOrderedEventOrderCandidates,
            ...fallbackTemporalCandidates.filter(
              (entry) =>
                !sourceOrderedEventOrderCandidates.some(
                  (candidate) => candidate.fact.id === entry.fact.id,
                ),
            ),
          ]
          : fallbackTemporalCandidates;
        const gapFilledTemporalCandidates = temporalEventOrderQuery &&
          temporalCandidates.some(isImportedSourceFact)
          ? fillSourceOrderedTemporalGaps({
            language,
            pool: rankedTemporalCandidates.filter(isImportedSourceFact),
            query,
            queryLocale,
            selected: temporalCandidates,
          })
          : temporalCandidates;
        const companionFilledTemporalCandidates = temporalEventOrderQuery &&
          gapFilledTemporalCandidates.some(isImportedSourceFact)
          ? fillSourceOrderedTemporalCompanions({
            pool: rankedTemporalCandidates.filter(isImportedSourceFact),
            query,
            selected: gapFilledTemporalCandidates,
          })
          : gapFilledTemporalCandidates;
        const milestoneFilledTemporalCandidates = temporalEventOrderQuery &&
          companionFilledTemporalCandidates.some(isImportedSourceFact)
          ? fillSourceOrderedTemporalMilestones({
            language,
            pool: rankedTemporalCandidates.filter(isImportedSourceFact),
            query,
            queryLocale,
            selected: companionFilledTemporalCandidates,
          })
          : companionFilledTemporalCandidates;
        const orderedTemporalCandidates = temporalEventOrderQuery &&
          milestoneFilledTemporalCandidates.every(isSourceEnvelopeCandidate)
          ? [...milestoneFilledTemporalCandidates].sort(compareTemporalFactChronology)
          : milestoneFilledTemporalCandidates;

        for (const entry of orderedTemporalCandidates) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "intent_signal": {
        if (sourcePreferenceExclusiveQuery || withIntentSignal.length === 0) {
          return false;
        }

        for (const entry of pickGenericCandidates(withIntentSignal)) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "lexical_or_subject_signal": {
        if (sourcePreferenceExclusiveQuery || withLexicalOrSubjectSignal.length === 0) {
          return false;
        }

        for (const entry of pickGenericCandidates(withLexicalOrSubjectSignal)) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "research_recommendation": {
        if (!researchRecommendationQuery) {
          return false;
        }

        for (const entry of rankFactCandidates(
          compatible.filter(hasResearchRecommendationSignal),
          routingDecision.strategy,
        ).slice(0, RESEARCH_RECOMMENDATION_LIMIT)) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "answer_or_confirmation": {
        if (!answerCompositionQuery && !factConfirmationQuery) {
          return false;
        }

        for (const entry of rankFactCandidates(
          compatible.filter(
            (item) =>
              item.fact.category === "project" || item.fact.category === "technical",
          ),
          routingDecision.strategy,
        ).slice(0, limit)) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "coding_agent_fallback": {
        if (retrievalProfile !== "coding_agent") {
          return false;
        }

        const fallback = rankFactCandidates(
          compatible.filter(
            (entry) =>
              entry.fact.category !== "personal" &&
              entry.fact.category !== "relationship" &&
              entry.fact.category !== "event",
          ),
          routingDecision.strategy,
        )[0];
        if (fallback) {
          selectAndTrace(fallback);
        }
        return true;
      }
    }
    // Converted ids return through the route table above; the residual switch
    // only covers the not-yet-migrated cases.
    return false;
  };

  for (const selectorId of PRIMARY_FACT_SELECTION_ORDER) {
    if (runPrimarySelector(selectorId)) {
      draft.summary.winner = {
        claimsContradictionPair: contradictionPairSelected,
        routeId: selectorId,
      };
      break;
    }
  }

  for (const stage of FACT_SELECTION_AUGMENTER_TABLE) {
    if (
      draft.summary.winner &&
      stage.yieldsToWinners.includes(draft.summary.winner.routeId)
    ) {
      continue;
    }
    if (!stage.gate({ ctx, draft, runtime, winner: draft.summary.winner })) {
      continue;
    }

    draft.summary.augmenterStages.push(stage.apply({ ctx, draft, runtime }));
  }

  finalizeSuppressionReasons({ compatible, traces });

  return {
    facts: selected.map(materializeFactCandidate),
    traces,
  };
}
