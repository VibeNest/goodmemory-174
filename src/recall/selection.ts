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
  selectCouponStoreContextCompanions,
  selectDirectFactualCompanions,
  userGroundedEvidencePriority,
} from "./selectors/conversationEvidence";
import {
  SOURCE_ORDER_EVENT_RECALL_LIMIT,
  fillSourceOrderedTemporalCompanions,
  fillSourceOrderedTemporalGaps,
  fillSourceOrderedTemporalMilestones,
} from "./selectors/sourceOrderTemporal";
import {
  ASSISTANT_COUNT_HEADING_FACT_PATTERN,
  ASSISTANT_EVIDENCE_RECALL_LIMIT,
  ASSISTANT_EVIDENCE_TAG,
  DIRECT_FACTUAL_RECALL_LIMIT,
  PREFERENCE_EVIDENCE_RECALL_LIMIT,
  RESEARCH_RECOMMENDATION_LIMIT,
  TEMPORAL_BRIDGE_EVIDENCE_RECALL_LIMIT,
  UPDATE_EVIDENCE_RECALL_LIMIT,
  diversifyRankedFactCandidatesBySession,
  hasConversationEvidenceTag,
  markSelectedTrace,
  slotMatchesFact,
  stripEvidencePrefix,
} from "./selectors/selectionContext";
import { pruneSourceInstructionNoiseSelections } from "./selectors/sourceOrderInstructionPruning";
import { isSourceEnvelopeCandidate } from "./selectors/sourceEnvelope";
import {
  compareTemporalFactChronology,
  hasTemporalEventOrderSignal,
  isSourceOrderedFact as isImportedSourceFact,
  temporalOrderEvidencePriority,
} from "./selectors/temporal";
import {
  collapseLatestUpdateSeries,
  selectUpdateHistoryCompanions,
} from "./selectors/updateSeries";

const PRIMARY_FACT_SELECTION_ORDER = [
  "contradiction_evidence_pair",
  "source_ordered_information_extraction",
  "aggregate_evidence",
  "source_ordered_personal_work_challenge",
  "source_ordered_temporal_interval",
  "source_ordered_summary",
  "source_ordered_timeline",
  "source_ordered_reasoning_bridge",
  "conversation_evidence",
  "preference_evidence",
  "update_evidence",
  "temporal_bridge",
  "direct_factual_bridge",
  "temporal_order",
  "intent_signal",
  "lexical_or_subject_signal",
  "research_recommendation",
  "answer_or_confirmation",
  "coding_agent_fallback",
] as const;

type PrimaryFactSelectionId = (typeof PRIMARY_FACT_SELECTION_ORDER)[number];

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
  } = buildSelectionRunContext({
    compatible,
    language,
    profile,
    query,
    queryLocale,
    routingDecision,
  });
  const selected: RankedFactCandidate[] = [];
  const selectedIds = new Set<string>();
  const selectAndTrace = (
    entry: RankedFactCandidate,
    slot: RecallSlot | "generic" = "generic",
    fallback: RecallCandidateTrace["fallback"] = "none",
  ) => {
    selected.push(entry);
    selectedIds.add(entry.fact.id);
    markSelectedTrace(
      traces,
      entry.fact.id,
      slot,
      entry.intentScore,
      entry.lexicalScore,
      entry.freshnessScore,
      entry.explicitnessScore,
      entry.usageScore,
      entry.evidenceScore,
      entry.outcomeScore,
      entry.verificationPenaltyScore,
      fallback,
    );
  };
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

  const runPrimarySelector = (selectorId: PrimaryFactSelectionId): boolean => {
    if (sourcePreferenceExclusiveQuery && !sourcePreferenceOverrideByContradiction) return false;
    switch (selectorId) {
      case "contradiction_evidence_pair": {
        if (contradictionEvidencePair.length === 0) {
          return false;
        }

        for (const entry of contradictionEvidencePair) {
          selectAndTrace(entry);
        }
        return true;
      }
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
      case "source_ordered_temporal_interval": {
        if (sourceOrderedTemporalIntervalCandidates.length === 0) {
          return false;
        }

        for (const entry of sourceOrderedTemporalIntervalCandidates) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "source_ordered_information_extraction": {
        if (informationExtractionCandidates.length === 0) {
          return false;
        }

        for (const entry of informationExtractionCandidates) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "source_ordered_personal_work_challenge": {
        if (personalWorkChallengeCandidates.length === 0) {
          return false;
        }

        for (const entry of personalWorkChallengeCandidates) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "source_ordered_summary": {
        if (sourceOrderedValueUpdateCandidates.length > 0) {
          return false;
        }

        if (summaryCoverageCandidates.length === 0) {
          return false;
        }

        for (const entry of summaryCoverageCandidates) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "source_ordered_timeline": {
        if (timelineIntegrationCandidates.length === 0) {
          return false;
        }

        for (const entry of timelineIntegrationCandidates) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "source_ordered_reasoning_bridge": {
        if (reasoningBridgeCandidates.length === 0) {
          return false;
        }

        for (const entry of reasoningBridgeCandidates) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "conversation_evidence": {
        if (
          sourceOrderedNamedEntityEventPlanActive ||
          sourceOrderedValueUpdateCandidates.length > 0
        ) {
          return false;
        }

        if (conversationEvidenceCandidates.length === 0) {
          return false;
        }

        for (const entry of conversationEvidenceCandidates.slice(
          0,
          ASSISTANT_EVIDENCE_RECALL_LIMIT,
        )) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "preference_evidence": {
        if (sourceOrderedNamedEntityEventPlanActive) {
          return false;
        }

        if (preferenceEvidenceCandidates.length === 0) {
          return false;
        }

        for (const entry of preferenceEvidenceCandidates.slice(
          0,
          PREFERENCE_EVIDENCE_RECALL_LIMIT,
        )) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "update_evidence": {
        if (sourceOrderedValueUpdateCandidates.length > 0) {
          for (const entry of sourceOrderedValueUpdateCandidates) {
            selectAndTrace(entry);
          }
          return true;
        }

        if (updateEvidenceCandidates.length === 0) {
          return false;
        }

        const primaryUpdateSelections = updateEvidenceCandidates.slice(
          0,
          UPDATE_EVIDENCE_RECALL_LIMIT,
        );

        for (const entry of primaryUpdateSelections) {
          selectAndTrace(entry);
        }

        const companionSelections = selectUpdateHistoryCompanions({
          entries: updateEvidencePool,
          limit: UPDATE_EVIDENCE_RECALL_LIMIT - selected.length,
          options: updateEvidenceSeriesOptions,
          query,
          selectedEntries: primaryUpdateSelections,
          selectedIds,
        });

        for (const entry of companionSelections) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "temporal_bridge": {
        if (sourceOrderedNamedEntityEventPlanActive) {
          return false;
        }

        if (temporalBridgeEvidenceCandidates.length === 0) {
          return false;
        }

        for (const entry of diversifyRankedFactCandidatesBySession(
          temporalBridgeEvidenceCandidates,
          TEMPORAL_BRIDGE_EVIDENCE_RECALL_LIMIT,
        )) {
          selectAndTrace(entry);
        }
        return true;
      }
      case "direct_factual_bridge": {
        if (sourceOrderedNamedEntityEventPlanActive) {
          return false;
        }

        if (directFactualEvidenceBridgeCandidates.length === 0) {
          return false;
        }

        for (const entry of diversifyRankedFactCandidatesBySession(
          directFactualEvidenceBridgeCandidates,
          DIRECT_FACTUAL_RECALL_LIMIT,
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

        const rankedTemporalCandidates = rankFactCandidates(
          compatible.filter((entry) => hasTemporalEventOrderSignal(entry, query)),
          routingDecision.strategy,
        ).sort(
          (left, right) =>
            temporalOrderEvidencePriority(right, query) -
            temporalOrderEvidencePriority(left, query),
        );
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
  };

  for (const selectorId of PRIMARY_FACT_SELECTION_ORDER) {
    if (runPrimarySelector(selectorId)) {
      break;
    }
  }

  if (!sourcePreferenceOverrideByContradiction) {
    pruneSourceInstructionNoiseSelections({ instructionEvidenceCandidates, selected, selectedIds, traces });

    for (const entry of instructionEvidenceCandidates) {
      if (selectedIds.has(entry.fact.id)) {
        continue;
      }

      selectAndTrace(entry);
    }

    for (const entry of sourcePreferenceCandidates) {
      if (selectedIds.has(entry.fact.id)) {
        continue;
      }

      selectAndTrace(entry);
    }
  }

  if (
    assistantEvidenceRecallQuery &&
    /\bhow many\b/iu.test(query) &&
    selected.length < ASSISTANT_EVIDENCE_RECALL_LIMIT
  ) {
    const assistantCountHeadings = rankFactCandidates(
      compatible.filter(
        (entry) =>
          !selectedIds.has(entry.fact.id) &&
          entry.fact.tags?.includes(ASSISTANT_EVIDENCE_TAG) === true &&
          ASSISTANT_COUNT_HEADING_FACT_PATTERN.test(
            stripEvidencePrefix(entry.fact.content),
          ),
      ),
      routingDecision.strategy,
    ).slice(0, ASSISTANT_EVIDENCE_RECALL_LIMIT - selected.length);

    for (const entry of assistantCountHeadings) {
      selectAndTrace(entry);
    }
  }

  if (
    !exactSourceOrderedReasoningQuery &&
    !sourcePreferenceExclusiveQuery &&
    directFactualLookupQuery &&
    !weatherFeatureConcernCountQuery &&
    informationExtractionCandidates.length === 0 &&
    sourceOrderedValueUpdateCandidates.length === 0 &&
    sourceOrderedTemporalIntervalCandidates.length === 0 &&
    selected.length < DIRECT_FACTUAL_RECALL_LIMIT
  ) {
    for (const entry of selectDirectFactualCompanions({
      entries: compatible,
      limit: DIRECT_FACTUAL_RECALL_LIMIT - selected.length,
      selectedEntries: selected,
      selectedIds,
      strategy: routingDecision.strategy,
    })) {
      selectAndTrace(entry);
    }
  }

  if (couponRedemptionLocationQuery) {
    for (const entry of selectCouponStoreContextCompanions({
      entries: compatible,
      selectedEntries: selected,
      selectedIds,
      strategy: routingDecision.strategy,
    })) {
      selectAndTrace(entry);
    }
  }

  for (const entry of compatible) {
    const trace = traces.find((item) => item.memoryId === entry.fact.id);
    if (trace && !trace.returned && trace.whySuppressed === "not selected") {
      trace.whySuppressed = "below generic threshold";
    }
  }

  return {
    facts: selected.map(materializeFactCandidate),
    traces,
  };
}
