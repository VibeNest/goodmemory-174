import type { FeedbackKind } from "../domain/records";
import type { MemoryCandidate } from "../remember/candidates";

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
  isContinuationQuery(
    query: string,
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
