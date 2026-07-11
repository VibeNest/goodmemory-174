import type { FactMemory, UserProfile } from "../domain/records";
import type { LanguageService } from "../language";
import type { RecallCandidateTrace } from "./engine";
import type { RecallSlot, RetrievalProfile, RoutingDecision } from "./router";
import {
  buildFactCandidates,
  materializeFactCandidate,
  rankFactCandidates,
} from "./scoring";
import { createSelectionDraft, finalizeSuppressionReasons } from "./factSelection/draft";
import { selectZeroRetrievalLexicalFallback } from "./factSelection/draft";
import { selectSemanticUnionCandidates } from "./factSelection/semanticUnion";
import type { SemanticUnionSelectionInput } from "./factSelection/semanticUnion";
import { selectGeneralizedFusionCandidates } from "./factSelection/generalizedFusionUnion";
import type { GeneralizedFusionSelectionInput } from "./factSelection/generalizedFusionUnion";
import { selectSlotFacts } from "./selectionSlot";
import {
  diversifyRankedFactCandidatesBySession,
  hasConversationEvidenceTag,
  hasAssistantAnswerTag,
  hasFactSelectionSignal,
  hasGenericFactSelectionSignal,
  slotMatchesFact,
} from "./selectors/selectionContext";
import { isUserBroughtUpEventOrderQuery } from "./selectors/temporal";

const GENERAL_FACT_RECALL_LIMIT = 6;
const AGGREGATE_OPEN_LOOP_LIMIT = 6;

export type FactSelector = (
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
  semanticUnion?: SemanticUnionSelectionInput,
  generalizedFusion?: GeneralizedFusionSelectionInput,
) => { facts: FactMemory[]; traces: RecallCandidateTrace[] };

export function selectGeneralizedFactsForInternalUse(
  facts: FactMemory[],
  query: string,
  language: LanguageService,
  queryLocale: string,
  _retrievalProfile: RetrievalProfile,
  routingDecision: RoutingDecision,
  profile: UserProfile | null,
  referenceTime: string,
  semanticScores?: Map<string, number>,
  evidenceCountsByMemoryId?: Map<string, number>,
  semanticUnion?: SemanticUnionSelectionInput,
  generalizedFusion?: GeneralizedFusionSelectionInput,
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
    ...(semanticUnion && entry.semanticScore > 0
      ? { semanticScore: entry.semanticScore }
      : {}),
    fallback: "none",
  }));
  const traceByMemoryId = new Map(
    traces.map((trace) => [trace.memoryId, trace] as const),
  );
  const compatible = ranked.filter(
    (entry) =>
      entry.fact.lifecycle === "active" &&
      language.localesCompatible(queryLocale, entry.locale),
  );
  let selectionPool = compatible;
  const draft = createSelectionDraft({ traces });
  const finish = (): { facts: FactMemory[]; traces: RecallCandidateTrace[] } => {
    if (generalizedFusion) {
      selectGeneralizedFusionCandidates({
        compatible: selectionPool,
        draft,
        union: generalizedFusion,
      });
    }
    if (semanticUnion) {
      selectSemanticUnionCandidates({
        compatible: selectionPool,
        draft,
        union: semanticUnion,
      });
    }
    finalizeSuppressionReasons({ compatible, traces });
    return {
      facts: draft.selected.map(materializeFactCandidate),
      traces,
    };
  };

  const pureReferenceQuery =
    routingDecision.requestedSlots.length > 0 &&
    routingDecision.requestedSlots.every((slot) => slot === "reference") &&
    !routingDecision.supportSlots.includes("project_state_support");
  if (pureReferenceQuery && !isReferencePreActionQuery(query)) {
    for (const trace of traces) {
      if (trace.whySuppressed === "not selected") {
        trace.whySuppressed = "reference-only query";
      }
    }
    return { facts: [], traces };
  }

  const factSlots = uniqueSlots([
    ...routingDecision.requestedSlots.filter((slot) => slot !== "reference"),
    ...routingDecision.supportSlots.filter(
      (slot) => slot === "project_state_support",
    ),
  ]);
  if (factSlots.length > 0) {
    const activeSlots: RecallSlot[] = [];
    const selectSlot = (
      slot: RecallSlot,
      allowUniqueFallback: boolean,
      aggregate = false,
    ): void => {
      activeSlots.push(slot);
      selectSlotFacts({
        ...(aggregate
          ? {
              aggregateLimit: AGGREGATE_OPEN_LOOP_LIMIT,
              aggregateSignal: (entry) =>
                entry.factKind === "open_loop" ||
                hasGenericFactSelectionSignal(entry),
            }
          : {}),
        allowUniqueFallback,
        entries: compatible,
        selectedIds: draft.selectedIds,
        selectAndTrace: draft.select,
        slot,
        strategy: routingDecision.strategy,
      });
    };

    if (
      factSlots.includes("role") &&
      (!profile?.identity.role || routingDecision.requestedSlots.length > 1)
    ) {
      selectSlot("role", false);
    } else if (factSlots.includes("role")) {
      activeSlots.push("role");
      for (const entry of compatible.filter(
        (candidate) => candidate.factKind === "role_update",
      )) {
        const trace = traceByMemoryId.get(entry.fact.id);
        if (trace?.whySuppressed === "not selected") {
          trace.whySuppressed = "profile satisfied role slot";
        }
      }
    }
    if (factSlots.includes("focus")) {
      selectSlot("focus", false);
    }
    if (factSlots.includes("blocker")) {
      selectSlot("blocker", false);
    }
    if (factSlots.includes("open_loop")) {
      selectSlot(
        "open_loop",
        false,
        isAggregateOpenLoopQuery(query, language, queryLocale),
      );
    }
    if (factSlots.includes("project_state_support")) {
      selectSlot("project_state_support", true);
    }

    for (const entry of compatible) {
      const trace = traceByMemoryId.get(entry.fact.id);
      if (!trace || trace.returned || trace.whySuppressed !== "not selected") {
        continue;
      }
      trace.whySuppressed = activeSlots.some((slot) => slotMatchesFact(entry, slot))
        ? "no slot signal"
        : "slot mismatch";
    }
    return finish();
  }

  selectionPool = collapseCurrentValueCandidates({
    candidates: compatible,
    language,
    locale: queryLocale,
    query,
  });
  if (isUserBroughtUpEventOrderQuery(query)) {
    selectionPool = selectionPool.filter((entry) => !hasAssistantAnswerTag(entry));
  }
  const aggregateCountQuery = language.isAggregateCountQuery(query, queryLocale);

  if (isResearchRecommendationQuery(query)) {
    for (const candidate of selectionPool
      .filter(hasResearchRecommendationSignal)
      .slice(0, 2)) {
      draft.select(candidate);
    }
  } else if (language.isAnswerCompositionQuery(query, queryLocale)) {
    const projectStateCandidates = selectionPool.filter(
      (entry) =>
        entry.fact.category === "project" ||
        entry.fact.category === "technical",
    );
    const selectedProjectState = routingDecision.strategy === "llm-assisted"
      ? projectStateCandidates
          .filter(hasGenericFactSelectionSignal)
          .slice(0, GENERAL_FACT_RECALL_LIMIT)
      : projectStateCandidates.slice(0, 1);
    for (const candidate of selectedProjectState) {
      draft.select(candidate);
    }
  }

  if (draft.selected.length === 0) {
    const candidates = diversifyRankedFactCandidatesBySession(
      selectionPool.filter(
        aggregateCountQuery
          ? hasFactSelectionSignal
          : hasGenericFactSelectionSignal,
      ),
      GENERAL_FACT_RECALL_LIMIT,
    );
    for (const candidate of candidates) {
      draft.select(candidate);
    }
  }

  selectZeroRetrievalLexicalFallback({ compatible: selectionPool, draft });
  selectDirectFactualSessionCompanion({
    candidates: selectionPool,
    draft,
    directFactualLookup:
      !aggregateCountQuery &&
      language.isDirectFactualLookupQuery(query, queryLocale),
  });
  return finish();
}

function uniqueSlots(slots: readonly RecallSlot[]): RecallSlot[] {
  return [...new Set(slots)];
}

function isAggregateOpenLoopQuery(
  query: string,
  language: LanguageService,
  locale: string,
): boolean {
  return language.isOpenLoopQuery(query, locale) &&
    (
      /\b(?:all|how many|list|open loops?|pending|remaining|to-?dos?|what|which)\b/iu.test(
        query,
      ) ||
      /(全部|哪些|多少|待办|待处理|待跟进|开环|所有|未完成|还有|剩余)/u.test(query)
    );
}

function isReferencePreActionQuery(query: string): boolean {
  return /\b(?:before|prior to|ahead of)\b[\s\S]{0,80}\b(?:chang(?:e|ing)|delet(?:e|ing)|deploy(?:ing)?|edit(?:ing)?|execut(?:e|ing)|publish(?:ing)?|run(?:ning)?|send(?:ing)?|ship(?:ping)?|writ(?:e|ing))\b/iu.test(
    query,
  ) || /(?:在[\s\S]{0,60})?(?:编辑|修改|删除|部署|发布|执行|运行|发送|写入)[\s\S]{0,20}(?:前|之前)|先(?:检查|查看|确认)/u.test(
    query,
  );
}

function collapseCurrentValueCandidates(input: {
  candidates: ReturnType<typeof buildFactCandidates>;
  language: LanguageService;
  locale: string;
  query: string;
}): ReturnType<typeof buildFactCandidates> {
  if (
    !input.language.isDirectFactualLookupQuery(input.query, input.locale) &&
    !input.language.isAggregateCountQuery(input.query, input.locale)
  ) {
    return input.candidates;
  }

  const latestBySubject = new Map<string, (typeof input.candidates)[number]>();
  for (const candidate of input.candidates) {
    if (hasConversationEvidenceTag(candidate)) {
      continue;
    }
    const subject = normalizedKnownSubject(candidate.subject);
    if (subject === undefined) {
      continue;
    }
    const current = latestBySubject.get(subject);
    if (!current || factTimestamp(candidate) > factTimestamp(current)) {
      latestBySubject.set(subject, candidate);
    }
  }

  return input.candidates.filter((candidate) => {
    if (hasConversationEvidenceTag(candidate)) {
      return true;
    }
    const subject = normalizedKnownSubject(candidate.subject);
    return subject === undefined ||
      latestBySubject.get(subject)?.fact.id === candidate.fact.id;
  });
}

function normalizedKnownSubject(subject: string): string | undefined {
  const normalized = subject.trim().toLocaleLowerCase();
  return normalized.length === 0 || normalized === "unknown"
    ? undefined
    : normalized;
}

function factTimestamp(
  candidate: ReturnType<typeof buildFactCandidates>[number],
): number {
  const timestamp =
    candidate.fact.updatedAt ??
    candidate.fact.source.extractedAt ??
    candidate.fact.createdAt;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isResearchRecommendationQuery(query: string): boolean {
  return /\b(?:recommend|suggest|find interesting)\b/iu.test(query) &&
    /\b(?:articles?|conferences?|papers?|publications?|research)\b/iu.test(query);
}

function hasResearchRecommendationSignal(
  candidate: ReturnType<typeof buildFactCandidates>[number],
): boolean {
  return (
    candidate.fact.category === "technical" ||
    candidate.fact.category === "project"
  ) && /\b(?:articles?|conferences?|interested in|publications?|research(?: papers?| project)?|work(?:ing)? in)\b/iu.test(
    candidate.fact.content,
  );
}

function selectDirectFactualSessionCompanion(input: {
  candidates: ReturnType<typeof buildFactCandidates>;
  directFactualLookup: boolean;
  draft: ReturnType<typeof createSelectionDraft>;
}): void {
  if (!input.directFactualLookup || input.draft.selected.length === 0) {
    return;
  }
  const selectedSessions = new Set(
    input.draft.selected
      .map(({ fact }) => fact.sessionId)
      .filter((sessionId): sessionId is string => Boolean(sessionId)),
  );
  if (selectedSessions.size === 0) {
    return;
  }
  const companion = input.candidates.find(
    ({ fact }) =>
      !input.draft.selectedIds.has(fact.id) &&
      fact.source.method !== "inferred" &&
      fact.sessionId !== undefined &&
      selectedSessions.has(fact.sessionId),
  );
  if (companion) {
    input.draft.select(companion);
  }
}
