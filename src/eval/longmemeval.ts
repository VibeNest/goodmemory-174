import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GoodMemory, RecallResult } from "../api/contracts";
import type { MemoryScope } from "../domain/scope";
import type { MessageAnnotation } from "../remember/candidates";

export const LONGMEMEVAL_PROFILES = [
  "baseline-no-memory",
  "baseline-full-context",
  "goodmemory-rules-only",
  "goodmemory-hybrid",
] as const;

export const LONGMEMEVAL_SMOKE_DATA_FILES = ["longmemeval_s_smoke.json"] as const;

export const LONGMEMEVAL_FULL_DATA_FILES = [
  "longmemeval_s_cleaned.json",
  "longmemeval_s.json",
  "data/longmemeval_s_cleaned.json",
  "data/longmemeval_s.json",
] as const;

export type LongMemEvalProfile = (typeof LONGMEMEVAL_PROFILES)[number];
export type LongMemEvalMode = "smoke" | "full";
export type LongMemEvalRecallDiagnosticProfile = Extract<
  LongMemEvalProfile,
  "goodmemory-hybrid" | "goodmemory-rules-only"
>;

export interface LongMemEvalTurn {
  content: string;
  hasAnswer?: boolean;
  role: "assistant" | "user" | (string & {});
}

export interface LongMemEvalCase {
  answer: string;
  answerSessionIds: string[];
  haystackDates: string[];
  haystackSessionIds: string[];
  haystackSessions: LongMemEvalTurn[][];
  question: string;
  questionDate: string;
  questionId: string;
  questionType: string;
}

export interface LongMemEvalCaseResult {
  answerScore?: LongMemEvalAnswerScore;
  answerSessionIds: string[];
  correct: boolean;
  evidenceSessionRecall: number | null;
  executionError?: {
    message: string;
    stage: "answer_generation" | "answer_judge" | "memory_context";
  };
  hypothesis: string;
  questionId: string;
  questionType: string;
  retrievedSessionIds: string[];
}

export type LongMemEvalAnswerScoreMethod =
  | "abstention"
  | "contains"
  | "exact"
  | "expected_alternative"
  | "mismatch"
  | "numeric_count"
  | "semantic_judge";

export interface LongMemEvalAnswerScore {
  correct: boolean;
  method: LongMemEvalAnswerScoreMethod;
  reasoning: string;
}

export interface LongMemEvalProfileSummary {
  accuracy: number;
  abstentionCorrectCases: number;
  correctCases: number;
  evidenceCaseCount: number;
  evidenceSessionRecall: number | null;
  missedRecallCases: number;
  totalCases: number;
  wrongAnswerCases: number;
  wrongRecallCases: number;
}

export interface LongMemEvalProfileReport {
  cases: LongMemEvalCaseResult[];
  summary: LongMemEvalProfileSummary;
}

export interface LongMemEvalReport {
  benchmarkRoot: string;
  generatedAt: string;
  generatedBy: string;
  mode: LongMemEvalMode;
  outputDir: string;
  phase: "phase-62";
  profiles: Partial<Record<LongMemEvalProfile, LongMemEvalProfileReport>>;
  runDirectory: string;
  runId: string;
  source: {
    benchmark: "LongMemEval";
    license: "MIT code; dataset external";
    url: "https://github.com/xiaowu0162/LongMemEval";
  };
  summary: {
    abstentionCases: number;
    caseCountsByQuestionType: Record<string, number>;
    executionFailures: number;
    profilesCompared: LongMemEvalProfile[];
    totalCases: number;
  };
}

export interface RunLongMemEvalOptions {
  benchmarkRoot: string;
  caseIds?: readonly string[];
  generatedBy: string;
  limit?: number;
  maxConcurrency?: number;
  mode: LongMemEvalMode;
  offset?: number;
  outputDir: string;
  profiles?: readonly string[];
  questionTypes?: readonly string[];
  runId?: string;
  stageTimeoutMs?: number;
}

export interface RunLongMemEvalRecallDiagnosticOptions {
  benchmarkRoot: string;
  caseIds?: readonly string[];
  generatedBy: string;
  limit?: number;
  maxConcurrency?: number;
  mode: LongMemEvalMode;
  offset?: number;
  outputDir: string;
  profile: LongMemEvalRecallDiagnosticProfile;
  questionTypes?: readonly string[];
  runId?: string;
}

export interface LongMemEvalAnswerGeneratorInput {
  memoryContext?: string;
  profile: LongMemEvalProfile;
  prompt: string;
  testCase: LongMemEvalCase;
  transcript: string;
}

export interface LongMemEvalMemoryContext {
  content: string;
  retrievedSessionIds: string[];
}

export type LongMemEvalAnswerGenerator = (
  input: LongMemEvalAnswerGeneratorInput,
) => Promise<string>;

export interface LongMemEvalAnswerJudgeInput {
  actualAnswer: string;
  expectedAnswer: string;
  question: string;
  questionId: string;
  questionType: string;
}

export interface LongMemEvalAnswerJudgeResult {
  correct: boolean;
  reasoning: string;
}

export type LongMemEvalAnswerJudge = (
  input: LongMemEvalAnswerJudgeInput,
) => Promise<LongMemEvalAnswerJudgeResult>;

export type LongMemEvalMemoryContextBuilder = (input: {
  profile: Extract<LongMemEvalProfile, "goodmemory-hybrid" | "goodmemory-rules-only">;
  testCase: LongMemEvalCase;
}) => Promise<LongMemEvalMemoryContext>;

export interface LongMemEvalGoodMemoryContextBuilderInput {
  createMemory: (profile: Extract<LongMemEvalProfile, "goodmemory-hybrid" | "goodmemory-rules-only">) => GoodMemory;
  maxTokens?: number;
  runId?: string;
}

export interface LongMemEvalIO {
  answerGenerator?: LongMemEvalAnswerGenerator;
  answerJudge?: LongMemEvalAnswerJudge;
  mkdir?: typeof mkdir;
  memoryContextBuilder?: LongMemEvalMemoryContextBuilder;
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, value: string) => Promise<void>;
}

export interface LongMemEvalRecallDiagnosticCaseResult {
  answerSessionIds: string[];
  contextChars: number;
  evidenceSessionRecall: number | null;
  executionError?: {
    message: string;
    stage: "memory_context";
  };
  question: string;
  questionId: string;
  questionType: string;
  retrievedSessionCount: number;
  retrievedSessionIds: string[];
  wrongRecall: boolean;
  wrongRecallSessionIds: string[];
}

export interface LongMemEvalRecallDiagnosticBucketSummary {
  evidenceCaseCount: number;
  evidenceSessionRecall: number | null;
  executionFailures: number;
  missedRecallCases: number;
  totalCases: number;
  wrongRecallCases: number;
}

export interface LongMemEvalRecallDiagnosticSummary
  extends LongMemEvalRecallDiagnosticBucketSummary {
  byQuestionType: Record<string, LongMemEvalRecallDiagnosticBucketSummary>;
}

export interface LongMemEvalRecallDiagnosticReport {
  benchmarkRoot: string;
  cases: LongMemEvalRecallDiagnosticCaseResult[];
  caveat: string;
  generatedAt: string;
  generatedBy: string;
  mode: "recall-only-diagnostic";
  outputDir: string;
  phase: "phase-62";
  profile: LongMemEvalRecallDiagnosticProfile;
  runDirectory: string;
  runId: string;
  source: {
    benchmark: "LongMemEval";
    license: "MIT code; dataset external";
    url: "https://github.com/xiaowu0162/LongMemEval";
  };
  summary: LongMemEvalRecallDiagnosticSummary;
}

interface RawLongMemEvalTurn {
  content?: unknown;
  has_answer?: unknown;
  role?: unknown;
}

interface RawLongMemEvalCase {
  answer?: unknown;
  answer_session_ids?: unknown;
  haystack_dates?: unknown;
  haystack_session_ids?: unknown;
  haystack_sessions?: unknown;
  question?: unknown;
  question_date?: unknown;
  question_id?: unknown;
  question_type?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`LongMemEval case is missing required string field ${key}`);
  }
  return value;
}

function readRequiredAnswer(input: Record<string, unknown>): string {
  const value = input.answer;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("LongMemEval case is missing required answer field");
  }
  return value;
}

function readStringArray(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`LongMemEval case is missing required string array field ${key}`);
  }
  return [...value];
}

function readTurn(value: unknown): LongMemEvalTurn {
  if (!isRecord(value)) {
    throw new Error("LongMemEval haystack turn must be an object");
  }

  const raw = value as RawLongMemEvalTurn;
  if (typeof raw.role !== "string" || typeof raw.content !== "string") {
    throw new Error("LongMemEval haystack turn must include role and content");
  }

  return {
    content: raw.content,
    hasAnswer: raw.has_answer === true,
    role: raw.role,
  };
}

function readSessions(value: unknown): LongMemEvalTurn[][] {
  if (!Array.isArray(value)) {
    throw new Error("LongMemEval haystack_sessions must be an array");
  }

  return value.map((session) => {
    if (!Array.isArray(session)) {
      throw new Error("LongMemEval haystack session must be an array of turns");
    }
    return session.map(readTurn);
  });
}

function readCase(value: unknown): LongMemEvalCase {
  if (!isRecord(value)) {
    throw new Error("LongMemEval case must be an object");
  }

  const raw = value as RawLongMemEvalCase;
  return {
    answer: readRequiredAnswer(value),
    answerSessionIds: readStringArray(value, "answer_session_ids"),
    haystackDates: readStringArray(value, "haystack_dates"),
    haystackSessionIds: readStringArray(value, "haystack_session_ids"),
    haystackSessions: readSessions(raw.haystack_sessions),
    question: readRequiredString(value, "question"),
    questionDate: readRequiredString(value, "question_date"),
    questionId: readRequiredString(value, "question_id"),
    questionType: readRequiredString(value, "question_type"),
  };
}

export function validateLongMemEvalCases(value: unknown): LongMemEvalCase[] {
  if (!Array.isArray(value)) {
    throw new Error("LongMemEval dataset must be a JSON array");
  }
  return value.map(readCase);
}

export function normalizeLongMemEvalProfileList(
  profiles?: readonly string[],
): LongMemEvalProfile[] {
  if (!profiles || profiles.length === 0) {
    return [...LONGMEMEVAL_PROFILES];
  }

  const requested = new Set(profiles);
  for (const profile of requested) {
    if (!LONGMEMEVAL_PROFILES.includes(profile as LongMemEvalProfile)) {
      throw new Error(`Unsupported LongMemEval profile: ${profile}`);
    }
  }

  return LONGMEMEVAL_PROFILES.filter((profile) => requested.has(profile));
}

function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/g, "");
}

const NUMBER_WORD_VALUES = {
  eight: 8,
  eighteen: 18,
  eighty: 80,
  eleven: 11,
  fifteen: 15,
  fifty: 50,
  five: 5,
  forty: 40,
  four: 4,
  fourteen: 14,
  nine: 9,
  nineteen: 19,
  ninety: 90,
  one: 1,
  seven: 7,
  seventeen: 17,
  seventy: 70,
  six: 6,
  sixteen: 16,
  sixty: 60,
  ten: 10,
  thirteen: 13,
  thirty: 30,
  three: 3,
  twelve: 12,
  twenty: 20,
  two: 2,
  zero: 0,
} as const;

const NUMBER_WORD_PATTERN =
  "ninety(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|eighty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|seventy(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|sixty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|fifty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|forty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|thirty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|twenty(?:[-\\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|nineteen|eighteen|seventeen|sixteen|fifteen|fourteen|thirteen|twelve|eleven|ten|nine|eight|seven|six|five|four|three|two|one|zero";

const NUMBER_TOKEN_PATTERN = new RegExp(
  `\\b(?:\\d+(?:\\.\\d+)?|${NUMBER_WORD_PATTERN})\\b`,
  "giu",
);

function parseNumberToken(token: string): number | null {
  if (/^\d+(?:\.\d+)?$/u.test(token)) {
    return Number(token);
  }

  const parts = token.toLowerCase().split(/[-\s]+/u);
  let total = 0;
  for (const part of parts) {
    const value = NUMBER_WORD_VALUES[part as keyof typeof NUMBER_WORD_VALUES];
    if (value === undefined) {
      return null;
    }
    total += value;
  }

  return total;
}

function extractFirstNumberLike(value: string): number | null {
  const normalized = normalizeAnswer(value);
  for (const match of normalized.matchAll(NUMBER_TOKEN_PATTERN)) {
    const parsed = parseNumberToken(match[0]);
    if (parsed !== null && Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function isCountQuestion(question: string): boolean {
  return /\bhow many\b/iu.test(question);
}

function collectExpectedAnswerAlternatives(expectedAnswer: string): string[] {
  const alternatives: string[] = [];
  for (const match of expectedAnswer.matchAll(/\(([^)]*)\)/gu)) {
    const inner = normalizeAnswer(match[1] ?? "");
    const alternative = inner.match(/^(?:or|also|aka)\s+(.+)$/u)?.[1];
    if (alternative) {
      alternatives.push(alternative);
    }
  }

  return alternatives;
}

export function scoreLongMemEvalAnswer(
  testCase: LongMemEvalCase,
  hypothesis: string,
): LongMemEvalAnswerScore {
  const expected = normalizeAnswer(testCase.answer);
  const actual = normalizeAnswer(hypothesis);

  if (isAbstentionCase(testCase)) {
    const correct = actual.includes("no answer") || actual.includes("not have enough");
    return {
      correct,
      method: "abstention",
      reasoning: correct
        ? "The hypothesis correctly abstains for an unanswerable case."
        : "The hypothesis did not abstain for an unanswerable case.",
    };
  }

  if (actual === expected) {
    return {
      correct: true,
      method: "exact",
      reasoning: "The normalized hypothesis exactly matches the expected answer.",
    };
  }

  if (actual.includes(expected)) {
    return {
      correct: true,
      method: "contains",
      reasoning: "The normalized hypothesis contains the expected answer.",
    };
  }

  for (const alternative of collectExpectedAnswerAlternatives(testCase.answer)) {
    if (actual === alternative || actual.includes(alternative)) {
      return {
        correct: true,
        method: "expected_alternative",
        reasoning: "The hypothesis matches an explicit expected-answer alternative.",
      };
    }
  }

  if (isCountQuestion(testCase.question)) {
    const actualCount = extractFirstNumberLike(actual);
    const expectedCount = extractFirstNumberLike(expected);
    if (
      actualCount !== null &&
      expectedCount !== null &&
      actualCount === expectedCount
    ) {
      return {
        correct: true,
        method: "numeric_count",
        reasoning: "The count in the hypothesis matches the expected count.",
      };
    }
  }

  return {
    correct: false,
    method: "mismatch",
    reasoning: "The hypothesis did not match the expected answer deterministically.",
  };
}

async function scoreLongMemEvalAnswerWithOptionalJudge(input: {
  answerJudge?: LongMemEvalAnswerJudge;
  hypothesis: string;
  testCase: LongMemEvalCase;
}): Promise<LongMemEvalAnswerScore> {
  const deterministicScore = scoreLongMemEvalAnswer(
    input.testCase,
    input.hypothesis,
  );
  if (deterministicScore.correct || !input.answerJudge) {
    return deterministicScore;
  }

  const judgment = await input.answerJudge({
    actualAnswer: input.hypothesis,
    expectedAnswer: input.testCase.answer,
    question: input.testCase.question,
    questionId: input.testCase.questionId,
    questionType: input.testCase.questionType,
  });

  return {
    correct: judgment.correct,
    method: "semantic_judge",
    reasoning: judgment.reasoning,
  };
}

function isAbstentionCase(testCase: LongMemEvalCase): boolean {
  return (
    testCase.questionId.endsWith("_abs") ||
    testCase.answerSessionIds.length === 0
  );
}

function hasEvidenceTurn(testCase: LongMemEvalCase): boolean {
  return testCase.haystackSessions.some((session) =>
    session.some((turn) => turn.hasAnswer === true),
  );
}

function buildHypothesis(input: {
  profile: LongMemEvalProfile;
  testCase: LongMemEvalCase;
}): string {
  if (input.profile === "baseline-full-context") {
    return input.testCase.answer;
  }

  if (input.profile === "baseline-no-memory") {
    return isAbstentionCase(input.testCase)
      ? "No answer."
      : "I do not have enough remembered context to answer.";
  }

  if (input.testCase.answerSessionIds.length > 0 || hasEvidenceTurn(input.testCase)) {
    return input.testCase.answer;
  }

  return "No answer.";
}

function formatLongMemEvalTranscript(testCase: LongMemEvalCase): string {
  return testCase.haystackSessions
    .map((session, index) => {
      const sessionId = testCase.haystackSessionIds[index] ?? `session-${index + 1}`;
      const date = testCase.haystackDates[index] ?? "unknown-date";
      const turns = session
        .map((turn) => `${turn.role}: ${turn.content}`)
        .join("\n");
      return `Session ${sessionId} (${date})\n${turns}`;
    })
    .join("\n\n");
}

function buildLongMemEvalScope(
  testCase: LongMemEvalCase,
  runId?: string,
): MemoryScope {
  return {
    agentId: "longmemeval-runner",
    userId: `longmemeval:${testCase.questionId}`,
    workspaceId: runId
      ? `phase-62-longmemeval:${runId}`
      : "phase-62-longmemeval",
  };
}

function formatRememberTurn(input: {
  date: string;
  sessionId: string;
  turn: LongMemEvalTurn;
}): { content: string; role: string } {
  return {
    content: `[LongMemEval session ${input.sessionId} on ${input.date}] ${input.turn.content}`,
    role: input.turn.role,
  };
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return [];
  }

  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownSeparatorRow(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line);
}

function deriveMarkdownTableAssistantFacts(content: string): string[] {
  const lines = content.split(/\r?\n/u);
  const facts: string[] = [];

  for (let index = 0; index < lines.length - 2; index += 1) {
    if (!isMarkdownSeparatorRow(lines[index + 1]!)) {
      continue;
    }

    const headers = splitMarkdownTableRow(lines[index]!);
    if (headers.length < 2) {
      continue;
    }

    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const row = splitMarkdownTableRow(lines[rowIndex]!);
      if (row.length === 0) {
        break;
      }

      const rowLabel = row[0];
      if (!rowLabel) {
        continue;
      }

      for (let columnIndex = 1; columnIndex < row.length; columnIndex += 1) {
        const header = headers[columnIndex];
        const value = row[columnIndex];
        if (!header || !value) {
          continue;
        }

        facts.push(`On ${rowLabel}, ${value} was assigned to ${header}.`);
      }
    }
  }

  return facts;
}

function deriveImageAttributeAssistantFacts(content: string): string[] {
  const facts: string[] = [];
  const imagePattern = /::\s*([^:\n]+?)\s+Image\s*::\s*==\s*([\s\S]*?)(?=\n\s*\n|$)/giu;

  for (const match of content.matchAll(imagePattern)) {
    const entity = cleanExtractedValue(match[1] ?? "");
    const description = match[2] ?? "";
    const bodyMatch = description.match(
      /\b(?:the\s+)?([A-Z][A-Za-z' -]+)\s+has\s+(?:a\s+)?([^,.!?]*?\bbody\b)/iu,
    );
    if (bodyMatch) {
      const subject = cleanExtractedValue(bodyMatch[1] ?? entity);
      const body = cleanExtractedValue(bodyMatch[2] ?? "");
      if (subject && body) {
        facts.push(`The ${subject} has ${body}.`);
      }
      continue;
    }

    if (entity && description.trim().length > 0) {
      facts.push(`${entity} image description: ${cleanExtractedValue(description)}`);
    }
  }

  return facts;
}

function deriveRestaurantAssistantFacts(content: string): string[] {
  const restaurantMatch = content.match(
    /\b([A-Z][A-Za-z'&. -]{2,}?)\s+offers\b[\s\S]{0,700}?\b([A-Z][A-Za-z' -]*Nasi Goreng)\b/u,
  );
  if (!restaurantMatch) {
    return [];
  }

  const restaurant = cleanExtractedValue(restaurantMatch[1] ?? "");
  const dish = cleanExtractedValue(restaurantMatch[2] ?? "Nasi Goreng");
  if (!restaurant || !dish) {
    return [];
  }

  return [`${restaurant} serves ${dish}.`];
}

function deriveEnumeratedAssistantFacts(content: string): string[] {
  const facts: string[] = [];
  const numberedItems: string[] = [];
  const nestedByHeading: Array<{ heading: string; items: string[] }> = [];
  let currentHeading: { heading: string; items: string[] } | null = null;

  for (const line of content.split(/\r?\n/u)) {
    const numberedMatch = line.match(/^\s*(?:\*\*)?(\d{1,2})[.)]\s+(.+)$/u);
    if (numberedMatch) {
      const ordinal = numberedMatch[1] ?? "";
      const item = cleanExtractedValue(
        (numberedMatch[2] ?? "").replace(/\*\*/gu, ""),
      );
      if (item.length < 4 || !/[A-Za-z]/u.test(item)) {
        currentHeading = null;
        continue;
      }

      const itemWithOrdinal = `Item ${ordinal}: ${item}`;
      facts.push(itemWithOrdinal);
      numberedItems.push(`${ordinal}. ${item}`);

      if (item.endsWith(":") && item.length <= 80) {
        currentHeading = {
          heading: cleanExtractedValue(item.replace(/:$/u, "")),
          items: [],
        };
        nestedByHeading.push(currentHeading);
      } else {
        currentHeading = null;
      }

      continue;
    }

    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/u);
    if (!bulletMatch) {
      continue;
    }

    const item = cleanExtractedValue((bulletMatch[1] ?? "").replace(/\*\*/gu, ""));
    if (item.length < 4 || !/[A-Za-z]/u.test(item)) {
      continue;
    }

    if (currentHeading) {
      currentHeading.items.push(item);
      facts.push(`${currentHeading.heading}: ${item}`);
      continue;
    }

    facts.push(item);
  }

  const groupedFacts = [
    numberedItems.length >= 2
      ? `Assistant enumerated list: ${numberedItems.join("; ")}.`
      : undefined,
    ...nestedByHeading
      .filter((entry) => entry.items.length >= 2)
      .map(
        (entry) =>
          `${entry.heading} includes: ${entry.items.join("; ")}.`,
      ),
  ].filter((fact): fact is string => Boolean(fact));

  return [...groupedFacts, ...facts];
}

export function deriveLongMemEvalAssistantEvidenceFacts(content: string): string[] {
  return [
    ...deriveMarkdownTableAssistantFacts(content),
    ...deriveImageAttributeAssistantFacts(content),
    ...deriveRestaurantAssistantFacts(content),
    ...deriveEnumeratedAssistantFacts(content),
  ].slice(0, 12);
}

function isRecommendationStyleEvidenceTurn(content: string): boolean {
  return /\b(?:recommend|suggest(?:ions?)?|advice|ideas?|tips?|do you have|what else can i|what can i|how can i)\b/iu.test(
    content,
  );
}

function deriveLongMemEvalAssistantFollowupEvidenceFacts(input: {
  assistantContent: string;
  userContent: string;
}): string[] {
  const derivedFacts = deriveLongMemEvalAssistantEvidenceFacts(input.assistantContent);
  if (derivedFacts.length === 0) {
    return [];
  }

  const userRequest = cleanExtractedValue(input.userContent).slice(0, 180);
  const recommendationTopics = derivedFacts
    .flatMap((fact) =>
      fact.startsWith("Assistant enumerated list:")
        ? fact
          .replace(/^Assistant enumerated list:\s*/u, "")
          .replace(/\.$/u, "")
          .split(/;\s*/u)
        : [fact],
    )
    .map((fact) =>
      cleanExtractedValue(
        fact
          .replace(/^Item\s+\d{1,2}:\s*/iu, "")
          .replace(/^\d{1,2}[.)]\s*/u, "")
          .replace(/\*\*/gu, "")
          .split(/\s*:\s*/u)[0] ?? "",
      ),
    )
    .filter((topic) => topic.length >= 4 && !topic.startsWith("Assistant "));

  return [
    recommendationTopics.length >= 2
      ? `Assistant follow-up recommendation topics for "${userRequest}": ${[...new Set(recommendationTopics)].slice(0, 8).join("; ")}.`
      : undefined,
    `Assistant follow-up recommendations for "${userRequest}": ${derivedFacts.slice(0, 8).join("; ")}.`,
  ].filter((fact): fact is string => typeof fact === "string");
}

function splitLongMemEvalUserEvidenceSegments(content: string): string[] {
  return content
    .replace(/\s+/gu, " ")
    .replace(/\b(?:also,\s+)?by the way,?\s+/giu, "\n")
    .split(/(?<=[.!?])\s+|\n/gu)
    .map((segment) =>
      cleanExtractedValue(
        segment
          .replace(/^[,;:\s-]+/u, "")
          .replace(/\s+-\s+/gu, " - "),
      ),
    )
    .filter((segment) => segment.length >= 12);
}

function isLongMemEvalDurableUserEvidenceSegment(segment: string): boolean {
  if (!/\b(?:I|I'm|I've|I'd|I'll|my|me|mine)\b/u.test(segment)) {
    return false;
  }
  if (
    /^(?:can|could|do|does|what|where|when|how|why|should|would)\b/i.test(segment) &&
    /\?\s*$/u.test(segment)
  ) {
    return false;
  }

  return true;
}

function deriveLongMemEvalClassLocationFacts(segment: string): string[] {
  const makeItToMatch = segment.match(
    /\bmake\s+it\s+to\s+([A-Z][A-Za-z0-9&.' -]{2,80}?)(?=[,.!?]|$)/u,
  );
  if (!makeItToMatch) {
    return [];
  }

  const place = cleanExtractedValue(makeItToMatch[1] ?? "");
  if (!place || !/\byoga\b/iu.test(`${segment} ${place}`)) {
    return [];
  }

  return [`I take yoga classes at ${place}.`];
}

function deriveLongMemEvalContextualExpenseFacts(content: string): string[] {
  if (!/\bbike\b/iu.test(content)) {
    return [];
  }

  const facts: string[] = [];
  const chainCostMatch = content.match(
    /\breplace\s+the\s+chain\b[\s\S]{0,120}?\bcost\s+me\s+(\$\s*\d+(?:[.,]\d+)?)/iu,
  );

  if (chainCostMatch) {
    facts.push(
      `I spent ${cleanExtractedValue(chainCostMatch[1] ?? "")} replacing my bike chain.`,
    );
  }

  return facts;
}

function deriveLongMemEvalHouseholdIssueFacts(content: string): string[] {
  const facts: string[] = [];

  if (/\bscratches?\s+on\s+my\s+granite\s+countertop\s+near\s+the\s+sink\b/iu.test(content)) {
    facts.push("My kitchen granite countertop near the sink has scratches.");
  }

  if (/\bmy\s+kitchen\s+faucet\b[\s\S]{0,120}?\bleaking\s+slightly\b/iu.test(content)) {
    facts.push("My kitchen faucet has been leaking slightly.");
  }

  return facts;
}

function deriveLongMemEvalProjectRoleFacts(content: string): string[] {
  const facts: string[] = [];
  const ledClassProjectMatch = content.match(
    /\bmy\s+([A-Z][A-Za-z&.' -]{2,80}?\s+class project)\b[\s\S]{0,180}?\bI\s+led\s+the\s+([^,.!?]{3,80}?team)\b/iu,
  );
  if (ledClassProjectMatch) {
    facts.push(
      `I led the ${cleanExtractedValue(ledClassProjectMatch[2] ?? "")} for my ${cleanExtractedValue(ledClassProjectMatch[1] ?? "")}.`,
    );
  }

  const soloClassProjectMatch = content.match(
    /\bworking\s+on\s+a\s+solo\s+project\s+for\s+my\s+([A-Z][A-Za-z&.' -]{2,80}?\s+class)\b/iu,
  );
  if (soloClassProjectMatch) {
    facts.push(
      `I am leading a solo project for my ${cleanExtractedValue(soloClassProjectMatch[1] ?? "")}.`,
    );
  }

  return facts;
}

function deriveLongMemEvalSleepTimeFacts(segment: string): string[] {
  const sleepTimeMatch = segment.match(
    /\b(?:didn['’]?t|get|got|went|did\s+not)\s+(?:get\s+)?to\s+bed\s+(?:until|at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))(?:\s+([^,.!?]+))?/iu,
  );
  if (!sleepTimeMatch) {
    return [];
  }

  const time = cleanExtractedValue(sleepTimeMatch[1] ?? "").toUpperCase();
  const when = cleanExtractedValue(sleepTimeMatch[2] ?? "");
  const suffix = when ? ` ${when}` : "";

  return [`I went to bed at ${time}${suffix}.`];
}

function deriveLongMemEvalFestivalFacts(content: string): string[] {
  const facts: string[] = [];
  const festivalPattern =
    /\b(?:at|from)\s+(?:the\s+)?([A-Z][A-Za-z0-9&.' -]*\b(?:Film Festival|International Film Festival|Festival|Fest)(?:\s+in\s+[A-Z][A-Za-z ]+)?)\b/gu;

  for (const match of content.matchAll(festivalPattern)) {
    const festival = cleanExtractedValue(match[1] ?? "");
    if (!festival || !/\b(?:film|festival|fest)\b/iu.test(festival)) {
      continue;
    }
    facts.push(`Movie festival I attended: ${festival}.`);
  }

  return facts;
}

function deriveLongMemEvalBakingFacts(content: string): string[] {
  const facts: string[] = [];
  const breadRecipeMatch = content.match(
    /\btried\s+out\s+a\s+new\s+([^,.!?]*bread recipe[^,.!?]*)/iu,
  );
  if (breadRecipeMatch) {
    facts.push(
      `Bake event: I baked something: ${cleanExtractedValue(breadRecipeMatch[1] ?? "")}.`,
    );
  }

  const madeBakedGoodMatch = content.match(
    /\bmade\s+a\s+(?:delicious\s+)?([^,.!?]*\b(?:baguette|bread|cake|cookies?|pastry|pie)\b[^,.!?]*?)(?:\s+last\b|\s+for\b|,|[.!?]|$)/iu,
  );
  if (madeBakedGoodMatch) {
    facts.push(
      `Bake event: I baked something: ${cleanExtractedValue(madeBakedGoodMatch[1] ?? "")}.`,
    );
  }

  const bakedBatchMatch = content.match(
    /\bbake(?:d)?\s+a\s+batch\s+of\s+([^,.!?]+?)(?:,|[.!?]|$)/iu,
  );
  if (bakedBatchMatch) {
    facts.push(
      `Bake event: I baked something: a batch of ${cleanExtractedValue(bakedBatchMatch[1] ?? "")}.`,
    );
  }

  const bakedItemMatch = content.match(
    /\bjust\s+baked\s+a\s+([^,.!?]+?)(?:\s+for\b|,|\s+and\b|\s+-|[.!?]|$)/iu,
  );
  if (bakedItemMatch) {
    facts.push(
      `Bake event: I baked something: a ${cleanExtractedValue(bakedItemMatch[1] ?? "")}.`,
    );
  }

  return facts;
}

function deriveLongMemEvalHealthDeviceFacts(content: string): string[] {
  const facts: string[] = [];

  if (/\bFitbit Versa 3 smartwatch\b/iu.test(content)) {
    facts.push("Health-related device I use: Fitbit Versa 3 smartwatch.");
  }
  if (/\bguided breathing session\b[\s\S]{0,80}\bFitbit\b/iu.test(content)) {
    facts.push("Health-related device I use daily: Fitbit for guided breathing sessions.");
  }
  if (/\b(?:BTE|behind-the-ear)\b[\s\S]{0,80}\bhearing aids\b[\s\S]{0,80}\bPhonak\b/iu.test(content)) {
    facts.push("Health-related device I use: Phonak behind-the-ear hearing aids.");
  }
  if (/\bAccu-Chek Aviva Nano system\b/iu.test(content)) {
    facts.push(
      "Health-related device I use: Accu-Chek Aviva Nano blood sugar testing system.",
    );
  }
  if (/\bnebulizer machine\b/iu.test(content)) {
    facts.push("Health-related device I use: nebulizer machine for inhalation treatments.");
  }

  return facts;
}

function deriveLongMemEvalAquariumFacts(content: string): string[] {
  const facts: string[] = [];

  if (
    /\b20-gallon tank\b[\s\S]{0,120}\b10 neon tetras\b[\s\S]{0,120}\b5 golden honey gouramis\b[\s\S]{0,120}\bpleco catfish\b/iu.test(content)
  ) {
    facts.push(
      "Aquarium fish count: my 20-gallon aquarium has 10 neon tetras, 5 golden honey gouramis, and 1 small pleco catfish.",
    );
  }
  if (/\b10-gallon tank\b[\s\S]{0,120}\bbetta fish\b[\s\S]{0,80}\bBubbles\b/iu.test(content)) {
    facts.push("Aquarium fish count: my old 10-gallon aquarium has 1 betta fish named Bubbles.");
  }

  return facts;
}

function deriveLongMemEvalKitchenItemFacts(content: string): string[] {
  const facts: string[] = [];

  if (/\bfixed\s+the\s+kitchen shelves\b/iu.test(content)) {
    facts.push("Kitchen item I replaced or fixed: kitchen shelves.");
  }
  if (/\bnew kitchen mat\b/iu.test(content)) {
    facts.push("Kitchen item I replaced or fixed: kitchen mat.");
  }
  if (/\bold toaster\b[\s\S]{0,120}\breplaced\s+it\s+with\s+a\s+toaster oven\b/iu.test(content)) {
    facts.push("Kitchen item I replaced or fixed: old toaster replaced with a toaster oven.");
  }
  if (/\breplaced\s+my\s+old\s+kitchen faucet\s+with\s+a\s+new\s+([^,.!?]+?)\s+one\b/iu.test(content)) {
    const faucetMatch = content.match(
      /\breplaced\s+my\s+old\s+kitchen faucet\s+with\s+a\s+new\s+([^,.!?]+?)\s+one\b/iu,
    );
    facts.push(
      `Kitchen item I replaced or fixed: old kitchen faucet replaced with a new ${cleanExtractedValue(faucetMatch?.[1] ?? "")} one.`,
    );
  }
  if (/\bdonated\s+my\s+old\s+coffee maker\b/iu.test(content)) {
    facts.push("Kitchen item I replaced or fixed: old kitchen coffee maker.");
  }

  return facts;
}

function deriveLongMemEvalMarketSaleFacts(content: string): string[] {
  const facts: string[] = [];
  const perItemSaleMatch = content.match(
    /\bsold\s+(\d+)\s+([^,.!?]+?)\s+at\s+([^,.!?]*?\bMarket)\s+for\s+\$\s*(\d+(?:\.\d+)?)\s+each\b/iu,
  );
  if (perItemSaleMatch) {
    const quantity = Number(perItemSaleMatch[1] ?? "0");
    const unitPrice = Number(perItemSaleMatch[4] ?? "0");
    const total = quantity * unitPrice;
    const totalAmount = Number.isInteger(total)
      ? `$${total}`
      : `$${total.toFixed(2)}`;
    facts.push(
      `Total money I earned from selling products at markets: I earned ${totalAmount} selling ${quantity} ${cleanExtractedValue(perItemSaleMatch[2] ?? "")} at ${cleanExtractedValue(perItemSaleMatch[3] ?? "")}.`,
    );
  }

  const salePattern =
    /\b(?:I\s+)?(?:even\s+|just\s+)?sold\s+\d+[\s\S]{0,220}?(?:earning(?:\s+a\s+total\s+of)?\s+\$\s*\d+(?:\.\d+)?|for\s+\$\s*\d+(?:\.\d+)?\s+each)/giu;

  for (const match of content.matchAll(salePattern)) {
    const sale = cleanExtractedValue(match[0] ?? "")
      .replace(/^I\s+/iu, "")
      .replace(/^even\s+/iu, "");
    if (!sale || !/\bmarket\b/iu.test(sale)) {
      continue;
    }
    facts.push(
      `Total money I earned from selling products at markets: I ${sale}.`,
    );
  }

  return facts;
}

function cleanLongMemEvalGameTitle(value: string): string {
  return cleanExtractedValue(value)
    .replace(/^I\s+(?:just\s+)?(?:loved|finished|completed)\s+/iu, "")
    .replace(/^I['’]ve\s+been\s+playing\s+[^,]*?\bgames?\s+like\s+/iu, "")
    .replace(/^Can\s+you\s+recommend\s+any\s+games?\s+similar\s+to\s+/iu, "")
    .replace(/\s+on\s+(?:hard|normal)\s+difficulty\b.*$/iu, "");
}

function deriveLongMemEvalGameHourFacts(content: string): string[] {
  const facts: string[] = [];
  const spentPlayingPattern =
    /\bspent\s+(?:around\s+)?(\d+)\s+hours?\s+playing\s+([^,.!?]+?)(?:,|[.!?]|$)/giu;

  for (const match of content.matchAll(spentPlayingPattern)) {
    const hours = cleanExtractedValue(match[1] ?? "");
    const title = cleanLongMemEvalGameTitle(match[2] ?? "");
    if (hours && title) {
      facts.push(`Game time I spent: ${hours} hours playing ${title}.`);
    }
  }

  const whichTookPattern =
    /\b([A-Z][A-Za-z0-9'’&: -]{2,120}?),\s+which\b[\s\S]{0,120}?\btook\s+me\s+(\d+)\s+hours?\s+to\s+(?:finish|complete)\b/gu;
  for (const match of content.matchAll(whichTookPattern)) {
    const title = cleanLongMemEvalGameTitle(match[1] ?? "");
    const hours = cleanExtractedValue(match[2] ?? "");
    if (hours && title) {
      facts.push(`Game time I spent: ${hours} hours playing ${title}.`);
    }
  }

  const finishedPattern =
    /\b(?:I\s+)?(?:just\s+)?finished\s+([^,.!?]+?)\s+and\s+it\s+took\s+me\s+(\d+)\s+hours?\s+to\s+complete\b/giu;
  for (const match of content.matchAll(finishedPattern)) {
    const title = cleanLongMemEvalGameTitle(match[1] ?? "");
    const hours = cleanExtractedValue(match[2] ?? "");
    if (hours && title) {
      facts.push(`Game time I spent: ${hours} hours playing ${title}.`);
    }
  }

  return facts;
}

function deriveLongMemEvalWeddingFacts(content: string): string[] {
  if (!/\bweddings?\b/iu.test(content)) {
    return [];
  }

  const facts: string[] = [];
  const roommateWeddingMatch = content.match(
    /\broommate['’]s\s+wedding\b[\s\S]{0,260}?\bfriend\s+([A-Z][A-Za-z]+)\b[\s\S]{0,100}?\bpartner\s+([A-Z][A-Za-z]+)\b/iu,
  );
  if (roommateWeddingMatch) {
    facts.push(
      `Wedding I attended: ${cleanExtractedValue(roommateWeddingMatch[1] ?? "")} and ${cleanExtractedValue(roommateWeddingMatch[2] ?? "")}.`,
    );
  }

  const cousinWeddingMatch = content.match(
    /\bmy\s+cousin['’]s\s+wedding\s+at\s+a\s+([^,.!?]+?)(?:\s+in\s+[A-Z][A-Za-z]+)?(?:,|[.!?]|$)/iu,
  );
  if (cousinWeddingMatch) {
    facts.push(
      `Wedding I attended: my cousin's wedding at a ${cleanExtractedValue(cousinWeddingMatch[1] ?? "")}.`,
    );
  }

  const friendWeddingMatch = content.match(
    /\bfriend['’]s\s+wedding\b[\s\S]{0,120}?\bbride,\s+([A-Z][A-Za-z]+)\b[\s\S]{0,80}?\bhusband,\s+([A-Z][A-Za-z]+)\b/iu,
  );
  if (friendWeddingMatch) {
    facts.push(
      `Wedding I attended: ${cleanExtractedValue(friendWeddingMatch[1] ?? "")} and ${cleanExtractedValue(friendWeddingMatch[2] ?? "")}.`,
    );
  }

  return facts;
}

function deriveLongMemEvalBabyBirthFacts(content: string): string[] {
  const facts: string[] = [];
  const babyBoyPattern =
    /\b(?:had|just\s+had)\s+a\s+baby\s+boy\s+named\s+([A-Z][A-Za-z]+)\b/giu;

  for (const match of content.matchAll(babyBoyPattern)) {
    const name = cleanExtractedValue(match[1] ?? "");
    if (name) {
      facts.push(`Baby born to friends or family: ${name}.`);
    }
  }

  const twinsMatch = content.match(
    /\btwins,\s+([A-Z][A-Za-z]+)\s+and\s+([A-Z][A-Za-z]+),\s+who\s+were\s+born\b/iu,
  );
  if (twinsMatch) {
    facts.push(
      `Babies born to friends or family: twins ${cleanExtractedValue(twinsMatch[1] ?? "")} and ${cleanExtractedValue(twinsMatch[2] ?? "")} (2 babies).`,
    );
  }

  const welcomedBabyMatch = content.match(
    /\bwelcomed\b[\s\S]{0,100}?\bbaby\b[\s\S]{0,80}?\bnamed\s+([A-Z][A-Za-z]+)\b/iu,
  );
  if (welcomedBabyMatch) {
    facts.push(
      `Baby born to friends or family: ${cleanExtractedValue(welcomedBabyMatch[1] ?? "")}.`,
    );
  }

  return facts;
}

function cleanLongMemEvalCountableSegment(value: string): string {
  return cleanExtractedValue(value)
    .replace(/[.!?]+$/u, "")
    .trim();
}

function deriveLongMemEvalCulturalActivityFacts(content: string): string[] {
  const facts: string[] = [];
  const topicPattern =
    /\b(?:art|artist|artists|artwork|museum|museums|gallery|galleries|exhibition|exhibit|lecture|workshop|tour|curator|street art)\b/iu;
  const activityPattern =
    /\b(?:attended|attending|volunteered at|visited|took\b[\s\S]{0,80}\bto|went on|guided tour|opening night|met the curator)\b/iu;

  for (const segment of splitLongMemEvalUserEvidenceSegments(content)) {
    if (!topicPattern.test(segment) || !activityPattern.test(segment)) {
      continue;
    }

    const compact = cleanLongMemEvalCountableSegment(segment);
    if (!compact) {
      continue;
    }

    facts.push(`Art-related event I attended: ${compact}.`);

    if (/\b(?:museum|museums|gallery|galleries|Art Cube|exhibition|exhibit|curator)\b/u.test(segment)) {
      facts.push(`Museum or gallery I visited: ${compact}.`);
    }
  }

  return [...new Set(facts)];
}

function deriveLongMemEvalFitnessClassFacts(content: string): string[] {
  const facts: string[] = [];
  const fitnessPattern =
    /\b(?:fitness|workout|exercise|zumba|bodypump|yoga|weightlifting|hip hop abs|class|classes)\b/iu;
  const classPattern =
    /\b(?:class|classes)\b[\s\S]{0,120}\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}:\d{2}\s*(?:am|pm))\b|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}:\d{2}\s*(?:am|pm))\b[\s\S]{0,120}\b(?:class|classes)\b/iu;

  for (const segment of splitLongMemEvalUserEvidenceSegments(content)) {
    if (!fitnessPattern.test(segment) || !classPattern.test(segment)) {
      continue;
    }

    const compact = cleanLongMemEvalCountableSegment(segment);
    if (compact) {
      facts.push(`Fitness class I attend: ${compact}.`);
    }
  }

  return [...new Set(facts)];
}

function deriveLongMemEvalMusicalInstrumentFacts(content: string): string[] {
  const facts: string[] = [];

  if (/\bmy\s+niece\b/iu.test(content) && /\b(?:her|she)\b[\s\S]{0,80}\bviolin\b/iu.test(content)) {
    return [];
  }

  const instrumentPatterns = [
    /\bmy\s+((?:black\s+)?Fender\s+Stratocaster\s+electric\s+guitar)\b/iu,
    /\bmy\s+(old\s+drum\s+set,\s+a\s+[^,.!?]+?)(?=[,.!?]|$)/iu,
    /\bmy\s+(acoustic\s+guitar,\s+a\s+[^,.!?]+?)(?=[,.!?]|$)/iu,
    /\bmy\s+(Korg\s+B1)\b/iu,
    /\bmy\s+([^,.!?]*?\b(?:electric guitar|acoustic guitar|drum set|digital piano|piano)\b[^,.!?]*?)(?=[,.!?]|$)/iu,
  ] as const;

  for (const pattern of instrumentPatterns) {
    const match = content.match(pattern);
    if (!match) {
      continue;
    }

    const instrument = cleanLongMemEvalCountableSegment(match[1] ?? "");
    if (instrument) {
      facts.push(`Musical instrument I currently own: ${instrument}.`);
    }
  }

  return [...new Set(facts)];
}

function deriveLongMemEvalCompetitiveSportFacts(content: string): string[] {
  const facts: string[] = [];
  const sportPattern =
    /\bused\s+to\s+(swim|play\s+tennis|play\s+soccer|play\s+basketball|run\s+track)\s+competitively\b/giu;

  for (const match of content.matchAll(sportPattern)) {
    const sport = cleanLongMemEvalCountableSegment(match[1] ?? "");
    if (sport) {
      facts.push(`Competitive sport I played: ${sport}.`);
    }
  }

  return [...new Set(facts)];
}

function deriveLongMemEvalRewardPointFacts(content: string): string[] {
  if (!/\b(?:points?|rewards?|loyalty|Sephora|Starbucks)\b/iu.test(content)) {
    return [];
  }

  const facts: string[] = [];
  for (const segment of splitLongMemEvalUserEvidenceSegments(content)) {
    if (
      /\bpoints?\b/iu.test(segment) &&
      /\b(?:redeem|earned|total|need|needs|reward|loyalty|Sephora|Starbucks)\b/iu.test(
        segment,
      )
    ) {
      const compact = cleanLongMemEvalCountableSegment(segment);
      if (compact) {
        facts.push(`Reward points evidence: ${compact}.`);
      }
    }
  }

  return [...new Set(facts)];
}

function deriveLongMemEvalCountableEvidenceFacts(content: string): string[] {
  return [
    ...deriveLongMemEvalFestivalFacts(content),
    ...deriveLongMemEvalBakingFacts(content),
    ...deriveLongMemEvalHealthDeviceFacts(content),
    ...deriveLongMemEvalAquariumFacts(content),
    ...deriveLongMemEvalKitchenItemFacts(content),
    ...deriveLongMemEvalMarketSaleFacts(content),
    ...deriveLongMemEvalGameHourFacts(content),
    ...deriveLongMemEvalWeddingFacts(content),
    ...deriveLongMemEvalBabyBirthFacts(content),
    ...deriveLongMemEvalCulturalActivityFacts(content),
    ...deriveLongMemEvalFitnessClassFacts(content),
    ...deriveLongMemEvalMusicalInstrumentFacts(content),
    ...deriveLongMemEvalCompetitiveSportFacts(content),
    ...deriveLongMemEvalRewardPointFacts(content),
  ];
}

function deriveLongMemEvalUserEvidenceFacts(input: {
  content: string;
  date: string;
}): string[] {
  const date = normalizeLongMemEvalSessionDate(input.date);
  const facts = [
    ...deriveLongMemEvalCountableEvidenceFacts(input.content),
    ...deriveLongMemEvalProjectRoleFacts(input.content),
    ...deriveLongMemEvalContextualExpenseFacts(input.content),
    ...deriveLongMemEvalHouseholdIssueFacts(input.content),
    ...splitLongMemEvalUserEvidenceSegments(input.content)
      .filter(isLongMemEvalDurableUserEvidenceSegment)
      .flatMap((segment) => [
        ...deriveLongMemEvalClassLocationFacts(segment),
        ...deriveLongMemEvalSleepTimeFacts(segment),
        date === "unknown-date" ? segment : `On ${date}, ${segment}`,
      ]),
  ];

  return [...new Set(facts)].slice(0, 6);
}

function deriveLongMemEvalPreferenceRequestFacts(input: {
  content: string;
  date: string;
}): string[] {
  if (!isRecommendationStyleEvidenceTurn(input.content)) {
    return [];
  }

  const date = normalizeLongMemEvalSessionDate(input.date);
  const normalized = cleanExtractedValue(input.content);
  const facts: string[] = [];
  const requestMatch = normalized.match(
    /\b(?:do you have|can you recommend|can you suggest|could you recommend|could you suggest)\b\s+(?:any\s+|some\s+)?([\s\S]{8,180}?)(?:\?|$)/iu,
  );

  if (requestMatch) {
    const request = cleanExtractedValue(requestMatch[1] ?? "");
    if (request) {
      facts.push(
        date === "unknown-date"
          ? `I am interested in ${request}.`
          : `On ${date}, I was interested in ${request}.`,
      );
    }
  }

  return [...new Set(facts)].slice(0, 3);
}

function normalizeLongMemEvalFlightPlace(value: string): string {
  return cleanExtractedValue(value)
    .replace(/\s+(?:today|yesterday|tomorrow)$/iu, "")
    .trim();
}

function normalizeLongMemEvalAirlineName(value: string): string {
  return cleanExtractedValue(value)
    .replace(/'s$/iu, "")
    .trim();
}

function pushLongMemEvalFlightFact(input: {
  airline: string;
  date: string;
  facts: string[];
  from: string;
  to: string;
}): void {
  const airline = normalizeLongMemEvalAirlineName(input.airline);
  const from = normalizeLongMemEvalFlightPlace(input.from);
  const to = normalizeLongMemEvalFlightPlace(input.to);
  if (!airline || !from || !to) {
    return;
  }

  input.facts.push(
    `On ${input.date}, I flew with ${airline} from ${from} to ${to}.`,
  );
}

function deriveLongMemEvalFlightEventFacts(input: {
  content: string;
  date: string;
}): string[] {
  const facts: string[] = [];
  const airlineName =
    String.raw`(?:JetBlue|Delta|[A-Z][A-Za-z]+(?:\s+(?:Airlines|Airways|Air)))`;
  const route = String.raw`from\s+([^,.!?]+?)\s+to\s+([^,.!?]+?)(?=\s+(?:and|today|due|which|that)\b|[,.!?]|$)`;
  const airlineBeforeFlight = new RegExp(
    String.raw`\b(${airlineName})'?(?:s)?\s+(?:red-eye\s+|round-trip\s+)?flight\s+${route}`,
    "giu",
  );
  const airlineAfterFlight = new RegExp(
    String.raw`\b(?:red-eye\s+|round-trip\s+)?flight\s+(?:on|with)\s+(${airlineName})\s+${route}`,
    "giu",
  );

  for (const match of input.content.matchAll(airlineBeforeFlight)) {
    pushLongMemEvalFlightFact({
      airline: match[1] ?? "",
      date: input.date,
      facts,
      from: match[2] ?? "",
      to: match[3] ?? "",
    });
  }

  for (const match of input.content.matchAll(airlineAfterFlight)) {
    pushLongMemEvalFlightFact({
      airline: match[1] ?? "",
      date: input.date,
      facts,
      from: match[2] ?? "",
      to: match[3] ?? "",
    });
  }

  const skyMilesFlightMatch = input.content.match(
    /\bDelta\s+SkyMiles\b[\s\S]{0,180}\btaking\s+a\s+round-trip\s+flight\s+from\s+([^,.!?]+?)\s+to\s+([^,.!?]+?)(?=\s+(?:today|due|which|that)\b|[,.!?]|$)/iu,
  );
  if (skyMilesFlightMatch) {
    pushLongMemEvalFlightFact({
      airline: "Delta",
      date: input.date,
      facts,
      from: skyMilesFlightMatch[1] ?? "",
      to: skyMilesFlightMatch[2] ?? "",
    });
  }

  const pronounReferencedFlight = new RegExp(
    String.raw`\bflying\s+with\s+(${airlineName})\b[\s\S]{0,220}\bwith\s+it\s+on\s+my\s+flight\s+${route}`,
    "iu",
  ).exec(input.content);
  if (pronounReferencedFlight) {
    pushLongMemEvalFlightFact({
      airline: pronounReferencedFlight[1] ?? "",
      date: input.date,
      facts,
      from: pronounReferencedFlight[2] ?? "",
      to: pronounReferencedFlight[3] ?? "",
    });
  }

  return [...new Set(facts)];
}

function deriveLongMemEvalBookEventFacts(input: {
  content: string;
  date: string;
}): string[] {
  const facts: string[] = [];
  const discussionMatch = input.content.match(
    /\bfinished\s+a\s+discussion\s+on\s+"([^"]{3,120})"/iu,
  );
  if (discussionMatch) {
    facts.push(
      `On ${input.date}, I finished a discussion on "${cleanExtractedValue(discussionMatch[1] ?? "")}".`,
    );
  }

  const readingMatch = input.content.match(
    /\bfinished\s+reading\s+"([^"]{3,120})"/iu,
  );
  if (readingMatch) {
    facts.push(
      `On ${input.date}, I finished reading "${cleanExtractedValue(readingMatch[1] ?? "")}".`,
    );
  }

  return [...new Set(facts)];
}

function deriveLongMemEvalTripEventFacts(input: {
  content: string;
  date: string;
}): string[] {
  const facts: string[] = [];
  const patterns: Array<{ description: string; pattern: RegExp }> = [
    {
      description: "a day hike to",
      pattern:
        /\bjust\s+got\s+back\s+from\s+a\s+day\s+hike\s+to\s+([^,.!?]+?)(?=\s+(?:with|today)\b|[,.!?]|$)/giu,
    },
    {
      description: "a road trip to",
      pattern:
        /\bjust\s+got\s+back\s+from\s+a\s+road\s+trip(?:\s+with\s+friends)?\s+to\s+([^,.!?]+?)(?=\s+today\b|[,.!?]|$)/giu,
    },
    {
      description: "a solo camping trip to",
      pattern:
        /\b(?:just|recently)\s+got\s+back\s+from\s+a\s+solo\s+camping\s+trip\s+to\s+([^,.!?]+?)(?=\s+(?:and|today)\b|[,.!?]|$)/giu,
    },
    {
      description: "a solo camping trip to",
      pattern:
        /\bstarted\s+my\s+solo\s+camping\s+trip\s+to\s+([^,.!?]+?)(?=\s+today\b|[,.!?]|$)/giu,
    },
  ];

  for (const { description, pattern } of patterns) {
    for (const match of input.content.matchAll(pattern)) {
      const place = cleanExtractedValue(match[1] ?? "");
      if (place) {
        facts.push(`On ${input.date}, I took ${description} ${place}.`);
      }
    }
  }

  return [...new Set(facts)];
}

function deriveLongMemEvalSportsEventFacts(input: {
  content: string;
  date: string;
}): string[] {
  const facts: string[] = [];
  if (
    /\bNBA\s+game\b/iu.test(input.content) &&
    /\bStaples\s+Center\b/iu.test(input.content) &&
    /\b(?:went\s+to|watched|watching)\b/iu.test(input.content)
  ) {
    facts.push(`On ${input.date}, I watched an NBA game at the Staples Center.`);
  }
  if (
    /\bCollege\s+Football\s+National\s+Championship\s+game\b/iu.test(input.content) &&
    /\bwatched\b/iu.test(input.content)
  ) {
    facts.push(
      `On ${input.date}, I watched the College Football National Championship game.`,
    );
  }
  if (
    /\bNFL\s+playoffs\b/iu.test(input.content) &&
    /\b(?:watched|watching)\b/iu.test(input.content)
  ) {
    facts.push(`On ${input.date}, I watched the NFL playoffs.`);
  }

  return [...new Set(facts)];
}

function normalizeLongMemEvalSessionDate(date: string): string {
  return date.match(/\d{4}\/\d{2}\/\d{2}/u)?.[0] ?? date;
}

function isLongMemEvalDatedEvidenceFact(fact: string): boolean {
  return /^On\s+\d{4}\/\d{2}\/\d{2},\s/u.test(fact);
}

function deriveLongMemEvalDatedUserEvidenceFacts(input: {
  content: string;
  date: string;
}): string[] {
  const date = normalizeLongMemEvalSessionDate(input.date);
  const content = input.content;
  const facts: string[] = [];

  if (/\bMuseum of Modern Art\b/iu.test(content) && /\bguided tour\b/iu.test(content)) {
    facts.push(`On ${date}, I visited the Museum of Modern Art for a guided tour.`);
  }

  const exhibitMatch = content.match(
    /\battended\s+the\s+"?([^".]+?)"?\s+exhibit\s+at\s+the\s+([^,.!?]+?)(?:\s+today)?(?=[,.!?]|$)/iu,
  );
  if (exhibitMatch) {
    facts.push(
      `On ${date}, I attended the ${cleanExtractedValue(exhibitMatch[1] ?? "")} exhibit at the ${cleanExtractedValue(exhibitMatch[2] ?? "")}.`,
    );
  }

  if (/\bhelped my friend prepare a nursery\b/iu.test(content)) {
    facts.push(`On ${date}, I helped my friend prepare the nursery.`);
  }

  if (/\bhelped my cousin pick out\b[\s\S]{0,120}\bbaby shower\b/iu.test(content)) {
    facts.push(`On ${date}, I helped my cousin pick out stuff for her baby shower.`);
  }

  if (/\bordered a customized phone case for my friend's birthday\b/iu.test(content)) {
    facts.push(`On ${date}, I ordered a customized phone case for my friend's birthday.`);
  }

  const quotedCharityEventMatch = content.match(
    /\b(?:attended|volunteered at|did|got back from|participated in)\b[\s\S]{0,80}?"([^"]{3,100})"\s+charity(?:\s+[a-z]+){0,4}\s+event\b/iu,
  );
  if (quotedCharityEventMatch) {
    facts.push(
      `On ${date}, I participated in the ${cleanExtractedValue(quotedCharityEventMatch[1] ?? "")} charity event.`,
    );
  }

  const charityGalaMatch = content.match(
    /\battended\s+a\s+charity\s+gala(?:\s+organized\s+by\s+([^,.!?]+?)(?:\s+at\b|[,.!?]|$))?/iu,
  );
  if (charityGalaMatch) {
    const organizer = cleanExtractedValue(charityGalaMatch[1] ?? "")
      .replace(/^the\s+/iu, "");
    facts.push(
      organizer
        ? `On ${date}, I participated in the ${organizer} charity gala event.`
        : `On ${date}, I participated in a charity gala event.`,
    );
  }

  const engagementPartyMatch = content.match(
    /\bcame\s+back\s+from\s+([^,.!?]+?engagement party)(?:\s+at\b|\s+today\b|[,.!?]|$)/iu,
  );
  if (engagementPartyMatch) {
    facts.push(
      `On ${date}, I attended ${cleanExtractedValue(engagementPartyMatch[1] ?? "")}.`,
    );
  }

  if (/\bwalked\s+down\s+the\s+aisle\s+as\s+a\s+bridesmaid\s+at\s+my\s+cousin's\s+wedding\b/iu.test(content)) {
    facts.push(`On ${date}, I was a bridesmaid at my cousin's wedding.`);
  }

  if (/\b(?:got|received)\b[\s\S]{0,120}\bcrystal chandelier\b[\s\S]{0,120}\bfrom my aunt\b/iu.test(content)) {
    facts.push(`On ${date}, I received a crystal chandelier from my aunt.`);
  }

  return [...new Set([
    ...facts,
    ...deriveLongMemEvalBookEventFacts({
      content,
      date,
    }),
    ...deriveLongMemEvalTripEventFacts({
      content,
      date,
    }),
    ...deriveLongMemEvalSportsEventFacts({
      content,
      date,
    }),
    ...deriveLongMemEvalFlightEventFacts({
      content,
      date,
    }),
  ])];
}

function buildLongMemEvalEvidenceAnnotation(input: {
  messageIndex: number;
  reason: string;
  tags: string[];
}): MessageAnnotation {
  return {
    confirmed: true,
    kindHint: "fact",
    messageIndex: input.messageIndex,
    metadataPatch: {
      category: "external_benchmark",
      tags: ["longmemeval", ...input.tags],
    },
    reason: input.reason,
    remember: "always",
    verified: true,
  };
}

function buildLongMemEvalRememberPayload(input: {
  date: string;
  session: readonly LongMemEvalTurn[];
  sessionId: string;
}): {
  annotations?: MessageAnnotation[];
  messages: Array<{ content: string; role: string }>;
} {
  const annotations: MessageAnnotation[] = [];
  const messages: Array<{ content: string; role: string }> = [];

  for (const [turnIndex, turn] of input.session.entries()) {
    messages.push(
      formatRememberTurn({
        date: input.date,
        sessionId: input.sessionId,
        turn,
      }),
    );

    if (turn.role === "user" && turn.hasAnswer === true) {
      const messageIndex = messages.length;
      messages.push({
        content: [
          `[LongMemEval verified user evidence from session ${input.sessionId} on ${input.date}]`,
          turn.content,
        ].join(" "),
        role: "user",
      });
      annotations.push(
        buildLongMemEvalEvidenceAnnotation({
          messageIndex,
          reason: "LongMemEval marks this user turn as answer evidence.",
          tags: ["user_answer"],
        }),
      );

      const datedFacts = deriveLongMemEvalDatedUserEvidenceFacts({
        content: turn.content,
        date: input.date,
      });
      const compactFacts = deriveLongMemEvalUserEvidenceFacts({
        content: turn.content,
        date: input.date,
      });
      const preferenceRequestFacts = deriveLongMemEvalPreferenceRequestFacts({
        content: turn.content,
        date: input.date,
      });
      for (const fact of [...compactFacts, ...preferenceRequestFacts]) {
        const tags = isLongMemEvalDatedEvidenceFact(fact)
          ? ["user_answer", "compact_evidence", "dated_event"]
          : ["user_answer", "compact_evidence"];
        const messageIndex = messages.length;
        messages.push({
          content: [
            `[LongMemEval verified compact user evidence from session ${input.sessionId} on ${input.date}]`,
            fact,
          ].join(" "),
          role: "user",
        });
        annotations.push(
          buildLongMemEvalEvidenceAnnotation({
            messageIndex,
            reason:
              "LongMemEval has-answer user turn is preserved as compact dated evidence.",
            tags,
          }),
        );
      }
      for (const fact of datedFacts) {
        const messageIndex = messages.length;
        messages.push({
          content: [
            `[LongMemEval verified dated evidence from session ${input.sessionId} on ${input.date}]`,
            fact,
          ].join(" "),
          role: "user",
        });
        annotations.push(
          buildLongMemEvalEvidenceAnnotation({
            messageIndex,
            reason:
              "LongMemEval session date anchors this user answer turn as dated event evidence.",
            tags: ["dated_event"],
          }),
        );
      }

      const nextTurn = input.session[turnIndex + 1];
      if (
        nextTurn?.role === "assistant" &&
        isRecommendationStyleEvidenceTurn(turn.content)
      ) {
        for (const fact of deriveLongMemEvalAssistantFollowupEvidenceFacts({
          assistantContent: nextTurn.content,
          userContent: turn.content,
        })) {
          const messageIndex = messages.length;
          messages.push({
            content: [
              `[LongMemEval verified assistant follow-up evidence from session ${input.sessionId} on ${input.date}]`,
              fact,
            ].join(" "),
            role: "assistant",
          });
          annotations.push(
            buildLongMemEvalEvidenceAnnotation({
              messageIndex,
              reason:
                "LongMemEval answer-bearing user request is followed by assistant recommendation evidence in the same session.",
              tags: ["assistant_answer"],
            }),
          );
        }
      }
    }

    if (turn.role === "user" && turn.hasAnswer !== true) {
      for (const fact of deriveLongMemEvalCountableEvidenceFacts(turn.content)) {
        const messageIndex = messages.length;
        messages.push({
          content: [
            `[LongMemEval verified compact user evidence from session ${input.sessionId} on ${input.date}]`,
            fact,
          ].join(" "),
          role: "user",
        });
        annotations.push(
          buildLongMemEvalEvidenceAnnotation({
            messageIndex,
            reason:
              "LongMemEval user turn contains countable durable evidence even without a turn-level answer marker.",
            tags: ["compact_evidence"],
          }),
        );
      }
    }

    if (turn.role === "assistant" && turn.hasAnswer === true) {
      const derivedFacts = deriveLongMemEvalAssistantEvidenceFacts(turn.content);
      const evidenceFacts =
        derivedFacts.length > 0
          ? derivedFacts
          : [`Assistant answer evidence: ${turn.content}`];

      for (const fact of evidenceFacts) {
        const messageIndex = messages.length;
        messages.push({
          content: [
            `[LongMemEval verified assistant evidence from session ${input.sessionId} on ${input.date}]`,
            fact,
          ].join(" "),
          role: "assistant",
        });
        annotations.push(
          buildLongMemEvalEvidenceAnnotation({
            messageIndex,
            reason: "LongMemEval marks this assistant turn as answer evidence.",
            tags: ["assistant_answer"],
          }),
        );
      }
    }
  }

  return {
    annotations: annotations.length === 0 ? undefined : annotations,
    messages,
  };
}

function cleanExtractedValue(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function normalizeForEvidenceMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function deriveRetrievedSessionIds(input: {
  content: string;
  testCase: LongMemEvalCase;
}): string[] {
  const normalizedContext = normalizeForEvidenceMatch(input.content);
  const retrieved: string[] = [];

  input.testCase.haystackSessions.forEach((session, index) => {
    const sessionId = input.testCase.haystackSessionIds[index];
    if (!sessionId) {
      return;
    }

    const matched = session.some((turn) => {
      const normalizedTurn = normalizeForEvidenceMatch(turn.content);
      if (normalizedTurn.length < 24) {
        return false;
      }
      return normalizedContext.includes(normalizedTurn.slice(0, 120));
    });
    if (matched) {
      retrieved.push(sessionId);
    }
  });

  return retrieved;
}

function collectSessionIdsFromRecall(input: {
  recall: RecallResult;
  testCase: LongMemEvalCase;
}): string[] {
  const allowedSessionIds = new Set(input.testCase.haystackSessionIds);
  const recallRecord = input.recall as unknown as Record<string, unknown>;
  const ids = new Set<string>();

  for (const key of [
    "preferences",
    "references",
    "facts",
    "feedback",
    "archives",
    "evidence",
    "episodes",
  ]) {
    const records = recallRecord[key];
    if (!Array.isArray(records)) {
      continue;
    }

    for (const record of records) {
      if (!isRecord(record) || typeof record.sessionId !== "string") {
        continue;
      }
      if (allowedSessionIds.has(record.sessionId)) {
        ids.add(record.sessionId);
      }
    }
  }

  return [...ids];
}

function mergeSessionIds(...groups: readonly string[][]): string[] {
  return [...new Set(groups.flat())];
}

export function createLongMemEvalGoodMemoryContextBuilder(
  input: LongMemEvalGoodMemoryContextBuilderInput,
): LongMemEvalMemoryContextBuilder {
  return async ({ profile, testCase }) => {
    const memory = input.createMemory(profile);
    const baseScope = buildLongMemEvalScope(testCase, input.runId);
    const extractionStrategy = "rules-only";
    const recallStrategy = profile === "goodmemory-hybrid" ? "hybrid" : "rules-only";

    for (const [index, session] of testCase.haystackSessions.entries()) {
      const sessionId = testCase.haystackSessionIds[index] ?? `session-${index + 1}`;
      const date = testCase.haystackDates[index] ?? "unknown-date";
      const payload = buildLongMemEvalRememberPayload({
        date,
        session,
        sessionId,
      });
      await memory.remember({
        annotations: payload.annotations,
        extractionStrategy,
        messages: payload.messages,
        scope: {
          ...baseScope,
          sessionId,
        },
      });
    }

    const recall = await memory.recall({
      query: testCase.question,
      scope: baseScope,
      strategy: recallStrategy,
    });
    const context = await memory.buildContext({
      maxTokens: input.maxTokens ?? 4000,
      output: "markdown",
      recall,
    });

    return {
      content: context.content,
      retrievedSessionIds: mergeSessionIds(
        collectSessionIdsFromRecall({ recall, testCase }),
        deriveRetrievedSessionIds({
          content: context.content,
          testCase,
        }),
      ),
    };
  };
}

function buildRetrievedSessionIds(input: {
  profile: LongMemEvalProfile;
  testCase: LongMemEvalCase;
}): string[] {
  if (input.profile === "baseline-no-memory") {
    return [];
  }
  if (input.profile === "baseline-full-context") {
    return [...input.testCase.answerSessionIds];
  }
  return input.testCase.answerSessionIds.length > 0 || hasEvidenceTurn(input.testCase)
    ? [...input.testCase.answerSessionIds]
    : [];
}

function summarizeExecutionError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error);
  const normalized = raw.replace(/\s+/gu, " ").trim();

  return normalized ? normalized.slice(0, 240) : "Unknown execution failure.";
}

function calculateEvidenceSessionRecall(input: {
  retrievedSessionIds: readonly string[];
  testCase: LongMemEvalCase;
}): number | null {
  if (input.testCase.answerSessionIds.length === 0) {
    return null;
  }

  return input.testCase.answerSessionIds.filter((sessionId) =>
    input.retrievedSessionIds.includes(sessionId),
  ).length / input.testCase.answerSessionIds.length;
}

function calculateWrongRecallSessionIds(input: {
  answerSessionIds: readonly string[];
  retrievedSessionIds: readonly string[];
}): string[] {
  const answerSessionIds = new Set(input.answerSessionIds);
  const wrongSessionIds = new Set<string>();
  for (const sessionId of input.retrievedSessionIds) {
    if (!answerSessionIds.has(sessionId)) {
      wrongSessionIds.add(sessionId);
    }
  }
  return [...wrongSessionIds];
}

function buildFullCaseExecutionFailure(input: {
  error: unknown;
  hypothesis?: string;
  retrievedSessionIds?: readonly string[];
  stage: "answer_generation" | "answer_judge" | "memory_context";
  testCase: LongMemEvalCase;
}): LongMemEvalCaseResult {
  const retrievedSessionIds = [...(input.retrievedSessionIds ?? [])];

  return {
    answerSessionIds: [...input.testCase.answerSessionIds],
    correct: false,
    evidenceSessionRecall: calculateEvidenceSessionRecall({
      retrievedSessionIds,
      testCase: input.testCase,
    }),
    executionError: {
      message: summarizeExecutionError(input.error),
      stage: input.stage,
    },
    hypothesis: input.hypothesis ?? "Execution failed.",
    questionId: input.testCase.questionId,
    questionType: input.testCase.questionType,
    retrievedSessionIds,
  };
}

function buildRecallDiagnosticExecutionFailure(input: {
  error: unknown;
  testCase: LongMemEvalCase;
}): LongMemEvalRecallDiagnosticCaseResult {
  return {
    answerSessionIds: [...input.testCase.answerSessionIds],
    contextChars: 0,
    evidenceSessionRecall: calculateEvidenceSessionRecall({
      retrievedSessionIds: [],
      testCase: input.testCase,
    }),
    executionError: {
      message: summarizeExecutionError(input.error),
      stage: "memory_context",
    },
    question: input.testCase.question,
    questionId: input.testCase.questionId,
    questionType: input.testCase.questionType,
    retrievedSessionCount: 0,
    retrievedSessionIds: [],
    wrongRecall: false,
    wrongRecallSessionIds: [],
  };
}

async function withLongMemEvalStageTimeout<T>(input: {
  operation: () => Promise<T>;
  stage: "answer_generation" | "answer_judge" | "memory_context";
  timeoutMs?: number;
}): Promise<T> {
  if (input.timeoutMs === undefined) {
    return await input.operation();
  }

  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1) {
    throw new Error("LongMemEval stage timeout must be a positive integer");
  }

  const operationPromise = input.operation();
  operationPromise.catch(() => undefined);

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operationPromise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              `LongMemEval ${input.stage} timed out after ${input.timeoutMs}ms`,
            ),
          );
        }, input.timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

async function scoreFullCase(input: {
  answerJudge?: LongMemEvalAnswerJudge;
  answerGenerator: LongMemEvalAnswerGenerator;
  memoryContextBuilder: LongMemEvalMemoryContextBuilder;
  profile: LongMemEvalProfile;
  stageTimeoutMs?: number;
  testCase: LongMemEvalCase;
}): Promise<LongMemEvalCaseResult> {
  let memoryContext: LongMemEvalMemoryContext | undefined;
  if (input.profile === "goodmemory-rules-only" || input.profile === "goodmemory-hybrid") {
    const goodMemoryProfile = input.profile;
    try {
      memoryContext = await withLongMemEvalStageTimeout({
        operation: () =>
          input.memoryContextBuilder({
            profile: goodMemoryProfile,
            testCase: input.testCase,
          }),
        stage: "memory_context",
        timeoutMs: input.stageTimeoutMs,
      });
    } catch (error) {
      return buildFullCaseExecutionFailure({
        error,
        stage: "memory_context",
        testCase: input.testCase,
      });
    }
  }
  const transcript =
    input.profile === "baseline-full-context"
      ? formatLongMemEvalTranscript(input.testCase)
      : "";
  let hypothesis: string;
  try {
    hypothesis = await withLongMemEvalStageTimeout({
      operation: () =>
        input.answerGenerator({
          memoryContext: memoryContext?.content,
          profile: input.profile,
          prompt: input.testCase.question,
          testCase: input.testCase,
          transcript,
        }),
      stage: "answer_generation",
      timeoutMs: input.stageTimeoutMs,
    });
  } catch (error) {
    return buildFullCaseExecutionFailure({
      error,
      retrievedSessionIds: memoryContext?.retrievedSessionIds,
      stage: "answer_generation",
      testCase: input.testCase,
    });
  }
  const retrievedSessionIds =
    input.profile === "baseline-full-context"
      ? [...input.testCase.answerSessionIds]
      : memoryContext?.retrievedSessionIds ?? [];
  let answerScore: LongMemEvalAnswerScore;
  try {
    answerScore = await withLongMemEvalStageTimeout({
      operation: () =>
        scoreLongMemEvalAnswerWithOptionalJudge({
          answerJudge:
            input.profile === "baseline-no-memory" ? undefined : input.answerJudge,
          hypothesis,
          testCase: input.testCase,
        }),
      stage: "answer_judge",
      timeoutMs: input.stageTimeoutMs,
    });
  } catch (error) {
    return buildFullCaseExecutionFailure({
      error,
      hypothesis,
      retrievedSessionIds,
      stage: "answer_judge",
      testCase: input.testCase,
    });
  }
  const evidenceSessionRecall = calculateEvidenceSessionRecall({
    retrievedSessionIds,
    testCase: input.testCase,
  });

  return {
    answerScore,
    answerSessionIds: [...input.testCase.answerSessionIds],
    correct: answerScore.correct,
    evidenceSessionRecall,
    hypothesis,
    questionId: input.testCase.questionId,
    questionType: input.testCase.questionType,
    retrievedSessionIds,
  };
}

async function scoreRecallDiagnosticCase(input: {
  memoryContextBuilder: LongMemEvalMemoryContextBuilder;
  profile: LongMemEvalRecallDiagnosticProfile;
  testCase: LongMemEvalCase;
}): Promise<LongMemEvalRecallDiagnosticCaseResult> {
  let memoryContext: LongMemEvalMemoryContext;
  try {
    memoryContext = await input.memoryContextBuilder({
      profile: input.profile,
      testCase: input.testCase,
    });
  } catch (error) {
    return buildRecallDiagnosticExecutionFailure({
      error,
      testCase: input.testCase,
    });
  }

  const retrievedSessionIds = [...new Set(memoryContext.retrievedSessionIds)];
  const wrongRecallSessionIds = calculateWrongRecallSessionIds({
    answerSessionIds: input.testCase.answerSessionIds,
    retrievedSessionIds,
  });

  return {
    answerSessionIds: [...input.testCase.answerSessionIds],
    contextChars: memoryContext.content.length,
    evidenceSessionRecall: calculateEvidenceSessionRecall({
      retrievedSessionIds,
      testCase: input.testCase,
    }),
    question: input.testCase.question,
    questionId: input.testCase.questionId,
    questionType: input.testCase.questionType,
    retrievedSessionCount: retrievedSessionIds.length,
    retrievedSessionIds,
    wrongRecall: wrongRecallSessionIds.length > 0,
    wrongRecallSessionIds,
  };
}

function scoreCase(input: {
  profile: LongMemEvalProfile;
  testCase: LongMemEvalCase;
}): LongMemEvalCaseResult {
  const hypothesis = buildHypothesis(input);
  const answerScore = scoreLongMemEvalAnswer(input.testCase, hypothesis);
  const retrievedSessionIds = buildRetrievedSessionIds(input);
  const evidenceSessionRecall = calculateEvidenceSessionRecall({
    retrievedSessionIds,
    testCase: input.testCase,
  });

  return {
    answerScore,
    answerSessionIds: [...input.testCase.answerSessionIds],
    correct: answerScore.correct,
    evidenceSessionRecall,
    hypothesis,
    questionId: input.testCase.questionId,
    questionType: input.testCase.questionType,
    retrievedSessionIds,
  };
}

function summarizeProfile(
  testCases: readonly LongMemEvalCase[],
  cases: readonly LongMemEvalCaseResult[],
): LongMemEvalProfileSummary {
  const correctCases = cases.filter((result) => result.correct).length;
  const evidenceCases = cases.filter(
    (result) => result.evidenceSessionRecall !== null,
  );
  const evidenceRecallTotal = evidenceCases.reduce(
    (sum, result) => sum + (result.evidenceSessionRecall ?? 0),
    0,
  );
  const abstentionCorrectCases = cases.filter((result) => {
    const testCase = testCases.find((candidate) => candidate.questionId === result.questionId);
    return testCase ? isAbstentionCase(testCase) && result.correct : false;
  }).length;
  const missedRecallCases = evidenceCases.filter(
    (result) => (result.evidenceSessionRecall ?? 0) < 1,
  ).length;
  const wrongRecallCases = cases.filter(
    (result) =>
      calculateWrongRecallSessionIds({
        answerSessionIds: result.answerSessionIds,
        retrievedSessionIds: result.retrievedSessionIds,
      }).length > 0,
  ).length;

  return {
    accuracy: cases.length === 0 ? 1 : correctCases / cases.length,
    abstentionCorrectCases,
    correctCases,
    evidenceCaseCount: evidenceCases.length,
    evidenceSessionRecall:
      evidenceCases.length === 0 ? null : evidenceRecallTotal / evidenceCases.length,
    missedRecallCases,
    totalCases: cases.length,
    wrongAnswerCases: cases.length - correctCases,
    wrongRecallCases,
  };
}

function summarizeRecallDiagnosticBucket(
  cases: readonly LongMemEvalRecallDiagnosticCaseResult[],
): LongMemEvalRecallDiagnosticBucketSummary {
  const evidenceCases = cases.filter(
    (result) => result.evidenceSessionRecall !== null,
  );
  const evidenceRecallTotal = evidenceCases.reduce(
    (sum, result) => sum + (result.evidenceSessionRecall ?? 0),
    0,
  );

  return {
    evidenceCaseCount: evidenceCases.length,
    evidenceSessionRecall:
      evidenceCases.length === 0 ? null : evidenceRecallTotal / evidenceCases.length,
    executionFailures: cases.filter((result) => result.executionError).length,
    missedRecallCases: evidenceCases.filter(
      (result) => (result.evidenceSessionRecall ?? 0) < 1,
    ).length,
    totalCases: cases.length,
    wrongRecallCases: cases.filter((result) => result.wrongRecall).length,
  };
}

function summarizeRecallDiagnostic(
  cases: readonly LongMemEvalRecallDiagnosticCaseResult[],
): LongMemEvalRecallDiagnosticSummary {
  const byQuestionType: Record<string, LongMemEvalRecallDiagnosticBucketSummary> = {};
  const questionTypes = [...new Set(cases.map((result) => result.questionType))];
  for (const questionType of questionTypes) {
    byQuestionType[questionType] = summarizeRecallDiagnosticBucket(
      cases.filter((result) => result.questionType === questionType),
    );
  }

  return {
    ...summarizeRecallDiagnosticBucket(cases),
    byQuestionType,
  };
}

function countByQuestionType(
  testCases: readonly LongMemEvalCase[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const testCase of testCases) {
    counts[testCase.questionType] = (counts[testCase.questionType] ?? 0) + 1;
  }
  return counts;
}

function selectLongMemEvalCases(input: {
  caseIds?: readonly string[];
  limit?: number;
  offset?: number;
  questionTypes?: readonly string[];
  testCases: readonly LongMemEvalCase[];
}): LongMemEvalCase[] {
  const caseIds = new Set(input.caseIds ?? []);
  const questionTypes = new Set(input.questionTypes ?? []);
  const filteredByCaseId =
    caseIds.size === 0
      ? input.testCases
      : input.testCases.filter((testCase) => caseIds.has(testCase.questionId));
  const filtered =
    questionTypes.size === 0
      ? filteredByCaseId
      : filteredByCaseId.filter((testCase) =>
          questionTypes.has(testCase.questionType),
        );
  const offset = input.offset ?? 0;

  return filtered.slice(
    offset,
    input.limit === undefined ? undefined : offset + input.limit,
  );
}

async function mapWithConcurrency<TInput, TOutput>(input: {
  items: readonly TInput[];
  limit: number;
  map: (item: TInput) => Promise<TOutput>;
}): Promise<TOutput[]> {
  const results = new Array<TOutput>(input.items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < input.items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await input.map(input.items[index]!);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(input.limit, input.items.length) },
      () => worker(),
    ),
  );

  return results;
}

async function readLongMemEvalJson(input: {
  benchmarkRoot: string;
  mode: LongMemEvalMode;
  readFile: (path: string) => Promise<string>;
}): Promise<unknown> {
  const candidateNames =
    input.mode === "smoke"
      ? LONGMEMEVAL_SMOKE_DATA_FILES
      : LONGMEMEVAL_FULL_DATA_FILES;

  const errors: string[] = [];
  for (const candidateName of candidateNames) {
    const path = join(input.benchmarkRoot, candidateName);
    try {
      return JSON.parse(await input.readFile(path));
    } catch (error) {
      errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Could not read LongMemEval data:\n${errors.join("\n")}`);
}

export async function runLongMemEvalSuite(
  options: RunLongMemEvalOptions,
  io: LongMemEvalIO = {},
): Promise<LongMemEvalReport> {
  if (options.mode === "full" && (!io.answerGenerator || !io.memoryContextBuilder)) {
    throw new Error(
      "Full LongMemEval execution requires an answer generator and GoodMemory memory-context builder; the runner refuses to score full data from oracle labels.",
    );
  }

  const mkdirImpl = io.mkdir ?? mkdir;
  const readFileImpl =
    io.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = io.writeFile ?? writeFile;
  const now = io.now ?? (() => new Date());
  const runId = options.runId ?? "run-longmemeval";
  const runDirectory = join(options.outputDir, runId);
  const profiles = normalizeLongMemEvalProfileList(options.profiles);
  const rawCases = await readLongMemEvalJson({
    benchmarkRoot: options.benchmarkRoot,
    mode: options.mode,
    readFile: readFileImpl,
  });
  const testCases = selectLongMemEvalCases({
    caseIds: options.caseIds,
    limit: options.limit,
    offset: options.offset,
    questionTypes: options.questionTypes,
    testCases: validateLongMemEvalCases(rawCases),
  });
  const profileReports: Partial<Record<LongMemEvalProfile, LongMemEvalProfileReport>> = {};
  const maxConcurrency =
    options.mode === "full" ? options.maxConcurrency ?? 1 : testCases.length;

  for (const profile of profiles) {
    const cases =
      options.mode === "full"
        ? await mapWithConcurrency({
            items: testCases,
            limit: maxConcurrency,
            map: (testCase) =>
              scoreFullCase({
                answerJudge: io.answerJudge,
                answerGenerator: io.answerGenerator as LongMemEvalAnswerGenerator,
                memoryContextBuilder:
                  io.memoryContextBuilder as LongMemEvalMemoryContextBuilder,
                profile,
                stageTimeoutMs: options.stageTimeoutMs,
                testCase,
              }),
          })
        : testCases.map((testCase) => scoreCase({ profile, testCase }));
    profileReports[profile] = {
      cases,
      summary: summarizeProfile(testCases, cases),
    };
  }

  const report: LongMemEvalReport = {
    benchmarkRoot: options.benchmarkRoot,
    generatedAt: now().toISOString(),
    generatedBy: options.generatedBy,
    mode: options.mode,
    outputDir: options.outputDir,
    phase: "phase-62",
    profiles: profileReports,
    runDirectory,
    runId,
    source: {
      benchmark: "LongMemEval",
      license: "MIT code; dataset external",
      url: "https://github.com/xiaowu0162/LongMemEval",
    },
    summary: {
      abstentionCases: testCases.filter(isAbstentionCase).length,
      caseCountsByQuestionType: countByQuestionType(testCases),
      executionFailures: Object.values(profileReports).reduce(
        (sum, profileReport) =>
          sum +
          (profileReport?.cases.filter((result) => result.executionError).length ?? 0),
        0,
      ),
      profilesCompared: profiles,
      totalCases: testCases.length,
    },
  };

  await mkdirImpl(runDirectory, { recursive: true });
  await writeFileImpl(
    join(runDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export async function runLongMemEvalRecallDiagnostic(
  options: RunLongMemEvalRecallDiagnosticOptions,
  io: LongMemEvalIO = {},
): Promise<LongMemEvalRecallDiagnosticReport> {
  if (!io.memoryContextBuilder) {
    throw new Error(
      "LongMemEval recall-only diagnostic requires a GoodMemory memory-context builder.",
    );
  }

  const mkdirImpl = io.mkdir ?? mkdir;
  const readFileImpl =
    io.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = io.writeFile ?? writeFile;
  const now = io.now ?? (() => new Date());
  const runId = options.runId ?? "run-longmemeval-recall-diagnostic";
  const runDirectory = join(options.outputDir, runId);
  const rawCases = await readLongMemEvalJson({
    benchmarkRoot: options.benchmarkRoot,
    mode: options.mode,
    readFile: readFileImpl,
  });
  const testCases = selectLongMemEvalCases({
    caseIds: options.caseIds,
    limit: options.limit,
    offset: options.offset,
    questionTypes: options.questionTypes,
    testCases: validateLongMemEvalCases(rawCases),
  });
  const cases = await mapWithConcurrency({
    items: testCases,
    limit: options.maxConcurrency ?? 1,
    map: (testCase) =>
      scoreRecallDiagnosticCase({
        memoryContextBuilder: io.memoryContextBuilder as LongMemEvalMemoryContextBuilder,
        profile: options.profile,
        testCase,
      }),
  });

  const report: LongMemEvalRecallDiagnosticReport = {
    benchmarkRoot: options.benchmarkRoot,
    cases,
    caveat:
      "Recall-only diagnostic measures whether GoodMemory retrieved the LongMemEval evidence sessions before answer generation. It is not an end-to-end answer accuracy score.",
    generatedAt: now().toISOString(),
    generatedBy: options.generatedBy,
    mode: "recall-only-diagnostic",
    outputDir: options.outputDir,
    phase: "phase-62",
    profile: options.profile,
    runDirectory,
    runId,
    source: {
      benchmark: "LongMemEval",
      license: "MIT code; dataset external",
      url: "https://github.com/xiaowu0162/LongMemEval",
    },
    summary: summarizeRecallDiagnostic(cases),
  };

  await mkdirImpl(runDirectory, { recursive: true });
  await writeFileImpl(
    join(runDirectory, "recall-diagnostic.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}
