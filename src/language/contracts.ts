import type { MemoryCandidate } from "../domain/memoryCandidate";
import type { FeedbackKind } from "../domain/records";

export type LocaleResolutionSource = "explicit" | "detected" | "default";

export type LanguageDetectionStrength =
  | "distinctive"
  | "compatible"
  | "none";

export type LanguageDetectionMode = "auto" | "default_only";

export interface LanguageDetectionInput {
  texts: string[];
}

export interface LanguageCandidateExtractionInput {
  messages: Array<{ role: string; content: string; sourceMessageIndex?: number }>;
  locale: string;
  nextId: () => string;
}

export interface LanguageQueryAnalysis {
  actionDriving: boolean;
  after: boolean;
  aggregateCount: boolean;
  answerComposition: boolean;
  assistantEvidenceRecall: boolean;
  before: boolean;
  blocker: boolean;
  change: boolean;
  continuation: boolean;
  current: boolean;
  directFactualLookup: boolean;
  exhaustiveList: boolean;
  factConfirmation: boolean;
  focus: boolean;
  guidanceSeeking: boolean;
  history: boolean;
  openLoop: boolean;
  procedural: boolean;
  projectState: boolean;
  recommendationStyle: boolean;
  relation: boolean;
  referenceSeeking: boolean;
  role: boolean;
  userGroundedEventOrder: boolean;
}

export interface LanguageSourceOfTruthDirective {
  currentPointer: string;
  supersededPointer?: string;
}

export interface LanguageContentAnalysis {
  assistantAcknowledgement: boolean;
  assistantContinuity: boolean;
  blockerFact: boolean;
  correctionCue: boolean;
  durableCue: boolean;
  factPolarity: "positive" | "negative" | "unknown";
  feedbackKind: FeedbackKind;
  focusFact: boolean;
  openLoopFact: boolean;
  personalEvidence: boolean;
  preferenceEvidence: boolean;
  projectStateFact: boolean;
  roleFact: boolean;
  sourceOfTruthDirective?: LanguageSourceOfTruthDirective;
  unresolved: boolean;
}

export interface LanguageTemporalExpression {
  kind: "absolute" | "relative" | "range";
  raw: string;
  unit?: "day" | "week" | "month" | "quarter" | "season" | "year";
  value?: number | string;
}

export interface LanguageEntityMention {
  kind?: "identifier" | "location" | "organization" | "person" | "term";
  normalized: string;
  surface: string;
}

export interface LanguageEntityCandidateInput {
  aliases: readonly string[];
  canonicalKey: string;
  documentTexts: readonly string[];
}

export type LanguageRenderKey =
  | "active_context"
  | "additional_project_state"
  | "archive"
  | "correction"
  | "current_goal"
  | "current_projects"
  | "current_state"
  | "deferred_follow_up"
  | "durable_memory"
  | "episode"
  | "episode_item"
  | "evidence"
  | "evidence_entry"
  | "evidence_note"
  | "excerpt"
  | "fact"
  | "fact_item"
  | "feedback"
  | "file_evidence"
  | "goals"
  | "immediate_next_steps"
  | "journal"
  | "key_decisions"
  | "claim"
  | "actor"
  | "open_loops"
  | "preference"
  | "procedural_memory"
  | "profile"
  | "recent_worklog"
  | "reference"
  | "reference_item"
  | "relation_label"
  | "session_archive_item"
  | "tool_result"
  | "temporal_status"
  | "verification"
  | "working_memory";

export interface LanguageRenderInput {
  key: LanguageRenderKey;
  values?: Record<string, number | string>;
}

export interface LanguagePack {
  readonly analyzerVersion: string;
  readonly apiVersion: 1;
  readonly compatibilityGroup: string;
  readonly defaultLocale: string;
  readonly id: string;
  readonly locales: readonly string[];
  detect(input: LanguageDetectionInput): LanguageDetectionStrength;
  normalizeForEquality(text: string): string;
  tokenizeForScoring(
    text: string,
    mode: "bm25" | "overlap",
    options?: { excludeStopwords?: boolean },
  ): string[];
  buildSearchTerms(text: string): string[];
  splitClauses(text: string): string[];
  splitSentences(text: string): string[];
  decomposeQuery(text: string): string[];
  analyzeQuery(text: string): LanguageQueryAnalysis;
  analyzeContent(text: string): LanguageContentAnalysis;
  parseTemporalExpressions(text: string): LanguageTemporalExpression[];
  resolveTemporalReference(
    text: string,
    referenceTime: string,
  ): string | undefined;
  extractEntityMentions(text: string): LanguageEntityMention[];
  matchesEntityAlias(query: string, alias: string): boolean;
  acceptsEntityCandidate(input: LanguageEntityCandidateInput): boolean;
  extractCandidates(input: LanguageCandidateExtractionInput): MemoryCandidate[];
  render(input: LanguageRenderInput): string;
}

export interface LocaleDetectorInput {
  explicitLocale?: string;
  texts: string[];
  defaultLocale?: string;
}

export type LocaleDetector = (
  input: LocaleDetectorInput,
) => string | undefined;

export interface LanguageConfig {
  defaultLocale?: string;
  detection?: LanguageDetectionMode;
  detector?: LocaleDetector;
  detectorVersion?: string;
  packs?: readonly LanguagePack[];
}

export interface LanguageAnalyzerManifestPack {
  readonly analyzerVersion: string;
  readonly apiVersion: 1;
  readonly compatibilityGroup: string;
  readonly defaultLocale: string;
  readonly id: string;
  readonly locales: readonly string[];
}

export interface LanguageAnalyzerManifest {
  readonly defaultLocale: string;
  readonly detection: LanguageDetectionMode;
  readonly detectorVersion?: string;
  readonly packs: readonly LanguageAnalyzerManifestPack[];
  readonly persistable: boolean;
  readonly resolutionOrder: readonly string[];
  readonly resolverVersion: string;
  readonly schemaVersion: 1;
}

export interface ResolvedLanguageContext {
  analysisMode: "rules-only";
  compatibilityGroup: string;
  languagePackId: string;
  languagePackVersion: string;
  locale: string;
  localeSource: LocaleResolutionSource;
}

export interface LanguageService {
  getAnalyzerManifest(): LanguageAnalyzerManifest;
  resolveFromMessages(input: {
    locale?: string;
    messages: Array<{ role: string; content: string }>;
  }): ResolvedLanguageContext;
  resolveFromText(input: {
    locale?: string;
    text: string;
  }): ResolvedLanguageContext;
  analyzerVersion(
    context: ResolvedLanguageContext | string,
  ): string;
  normalizeForEquality(
    text: string,
    context: ResolvedLanguageContext | string,
  ): string;
  tokenize(
    text: string,
    context: ResolvedLanguageContext | string,
    options?: { excludeStopwords?: boolean },
  ): string[];
  buildSearchTerms(
    text: string,
    context: ResolvedLanguageContext | string,
  ): string[];
  splitClauses(
    text: string,
    context: ResolvedLanguageContext | string,
  ): string[];
  splitSentences(
    text: string,
    context: ResolvedLanguageContext | string,
  ): string[];
  decomposeQuery(
    text: string,
    context: ResolvedLanguageContext | string,
  ): string[];
  analyzeQuery(
    text: string,
    context: ResolvedLanguageContext | string,
  ): LanguageQueryAnalysis;
  analyzeContent(
    text: string,
    context: ResolvedLanguageContext | string,
  ): LanguageContentAnalysis;
  parseTemporalExpressions(
    text: string,
    context: ResolvedLanguageContext | string,
  ): LanguageTemporalExpression[];
  resolveTemporalReference(
    text: string,
    referenceTime: string,
    context: ResolvedLanguageContext | string,
  ): string | undefined;
  extractEntityMentions(
    text: string,
    context: ResolvedLanguageContext | string,
  ): LanguageEntityMention[];
  matchesEntityAlias(
    query: string,
    alias: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  acceptsEntityCandidate(
    input: LanguageEntityCandidateInput,
    context: ResolvedLanguageContext | string,
  ): boolean;
  extractCandidates(
    input: LanguageCandidateExtractionInput,
    context: ResolvedLanguageContext | string,
  ): MemoryCandidate[];
  render(
    input: LanguageRenderInput,
    context: ResolvedLanguageContext | string,
  ): string;
  tokenOverlap(
    left: string,
    right: string,
    context: ResolvedLanguageContext | string,
    options?: { excludeStopwords?: boolean },
  ): number;
  localesCompatible(left: string, right: string): boolean;
  isAnswerCompositionQuery(
    query: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isReferenceSeekingQuery(
    query: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isRoleQuery(
    query: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isFocusQuery(
    query: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isOpenLoopQuery(
    query: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isBlockerQuery(
    query: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isProjectStateQuery(
    query: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isFactConfirmationQuery(
    query: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isActionDrivingQuery(
    query: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isAggregateCountQuery(
    query: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isAssistantEvidenceRecallQuery(
    query: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isContinuationQuery(
    query: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isDirectFactualLookupQuery(
    query: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isGuidanceSeekingQuery(
    query: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isRecommendationStyleQuery(
    query: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isRoleFact(
    content: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isFocusFact(
    content: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isOpenLoopFact(
    content: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isBlockerFact(
    content: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isProjectStateFact(
    content: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isPersonalEvidenceSignal(
    content: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isPreferenceEvidenceSignal(
    content: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  detectFactPolarity(
    content: string,
    context: ResolvedLanguageContext | string,
  ): "positive" | "negative" | "unknown";
  isAssistantAcknowledgement(
    content: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isAssistantContinuitySignal(
    content: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  isUnresolvedSignal(
    content: string,
    context: ResolvedLanguageContext | string,
  ): boolean;
  deriveFeedbackKind(
    signal: string,
    context: ResolvedLanguageContext | string,
  ): FeedbackKind;
}
