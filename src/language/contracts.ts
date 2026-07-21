import type { FeedbackKind } from "../domain/records";
import type { MemoryCandidate } from "../domain/memoryCandidate";

export type LocaleResolutionSource = "explicit" | "detected" | "default";

export interface LanguageCandidateExtractionInput {
  messages: Array<{ role: string; content: string; sourceMessageIndex?: number }>;
  locale: string;
  nextId: () => string;
}

export interface LanguageAdapter {
  id: string;
  supportsLocale(locale: string): boolean;
  splitClauses(text: string): string[];
  normalizeForEquality(text: string): string;
  tokenize(
    text: string,
    options?: {
      excludeStopwords?: boolean;
      // Adapter-specific floor for token length. Adapters that do not
      // distinguish (CJK bigrams, generic) may ignore it.
      minTokenLength?: number;
    },
  ): string[];
  extractCandidates(input: LanguageCandidateExtractionInput): MemoryCandidate[];
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
  detection?: "auto" | "explicit_first";
  detector?: LocaleDetector;
  adapters?: LanguageAdapter[];
}

export interface ResolvedLanguageContext {
  locale: string;
  localeSource: LocaleResolutionSource;
  adapter: LanguageAdapter;
  adapterId: string;
  analysisMode: "rules-only";
}

export interface LanguageService {
  resolveFromMessages(input: {
    locale?: string;
    messages: Array<{ role: string; content: string }>;
  }): ResolvedLanguageContext;
  resolveFromText(input: {
    locale?: string;
    text: string;
  }): ResolvedLanguageContext;
  normalizeForEquality(
    text: string,
    context: ResolvedLanguageContext | string,
  ): string;
  tokenize(
    text: string,
    context: ResolvedLanguageContext | string,
    options?: {
      excludeStopwords?: boolean;
      minTokenLength?: number;
    },
  ): string[];
  splitClauses(
    text: string,
    context: ResolvedLanguageContext | string,
  ): string[];
  tokenOverlap(
    left: string,
    right: string,
    context: ResolvedLanguageContext | string,
    options?: {
      excludeStopwords?: boolean;
    },
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
