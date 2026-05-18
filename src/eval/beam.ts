import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const BEAM_PROFILES = [
  "baseline-no-memory",
  "baseline-full-context",
  "goodmemory-rules-only",
  "goodmemory-hybrid",
] as const;

export const BEAM_SMOKE_DATA_FILES = ["beam_100k_smoke.json"] as const;

export const BEAM_FULL_DATA_FILES = [
  "beam_100k.json",
  "100K.json",
  "data/beam_100k.json",
  "data/100K.json",
] as const;

export type BeamProfile = (typeof BEAM_PROFILES)[number];
export type BeamMode = "smoke" | "full";

export interface BeamConversationSeed {
  category: string;
  id: number;
  subtopics: string[];
  theme: string;
  title: string;
}

export interface BeamUserProfile {
  userInfo: string;
  userRelationships: string;
}

export interface BeamUserQuestion {
  messages: string[][];
  timeAnchor: string;
}

export interface BeamChatTurn {
  content: string;
  id: number;
  index: string;
  questionType: string;
  role: string;
  timeAnchor: string;
}

export interface BeamProbingQuestion {
  answer: string;
  answerable: boolean;
  category: string;
  evidenceChatIds: number[];
  question: string;
  questionId: string;
  questionType: string;
}

export interface BeamRow {
  chat: BeamChatTurn[][];
  conversationId: string;
  conversationPlan: string;
  conversationSeed: BeamConversationSeed;
  narratives: string;
  probingQuestions: BeamProbingQuestion[];
  userProfile: BeamUserProfile;
  userQuestions: BeamUserQuestion[];
}

export interface BeamCase {
  answer: string;
  answerable: boolean;
  chat: BeamChatTurn[][];
  conversationId: string;
  evidenceChatIds: number[];
  question: string;
  questionId: string;
  questionType: string;
  scale: "100K" | "500K" | "1M" | "10M" | "unknown";
}

export interface BeamCaseResult {
  answerScore: BeamAnswerScore;
  answerable: boolean;
  correct: boolean;
  evidenceChatIds: number[];
  evidenceChatRecall: number | null;
  executionError?: {
    message: string;
    stage: "answer_generation" | "answer_judge" | "data_loading" | "memory_context";
  };
  hypothesis: string;
  questionId: string;
  questionType: string;
  retrievedChatIds: number[];
}

export type BeamAnswerScoreMethod =
  | "abstention"
  | "exact"
  | "mismatch"
  | "semantic_judge";

export interface BeamAnswerScore {
  correct: boolean;
  method: BeamAnswerScoreMethod;
  reasoning: string;
}

export interface BeamProfileSummary {
  accuracy: number;
  abstentionCorrectCases: number;
  correctCases: number;
  evidenceCaseCount: number;
  evidenceChatRecall: number | null;
  missedRecallCases: number;
  totalCases: number;
  wrongAnswerCases: number;
  wrongRecallCases: number;
}

export interface BeamProfileReport {
  cases: BeamCaseResult[];
  summary: BeamProfileSummary;
}

export interface BeamReport {
  benchmarkRoot: string;
  generatedAt: string;
  generatedBy: string;
  mode: BeamMode;
  outputDir: string;
  phase: "phase-63";
  profiles: Partial<Record<BeamProfile, BeamProfileReport>>;
  runDirectory: string;
  runId: string;
  source: {
    benchmark: "BEAM";
    license: "cc-by-sa-4.0 dataset; paper external";
    url: "https://huggingface.co/datasets/Mohammadta/BEAM";
  };
  summary: {
    caseCountsByQuestionType: Record<string, number>;
    executionFailures: number;
    profilesCompared: BeamProfile[];
    scale: BeamCase["scale"];
    totalCases: number;
  };
}

export interface RunBeamOptions {
  benchmarkRoot: string;
  caseIds?: readonly string[];
  generatedBy: string;
  limit?: number;
  mode: BeamMode;
  offset?: number;
  outputDir: string;
  profiles?: readonly string[];
  questionTypes?: readonly string[];
  runId?: string;
  scale?: BeamCase["scale"];
}

export interface BeamIO {
  mkdir?: typeof mkdir;
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, value: string) => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type PythonLiteral =
  | null
  | boolean
  | number
  | string
  | PythonLiteral[]
  | { [key: string]: PythonLiteral };

class PythonLiteralParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): PythonLiteral {
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.index !== this.source.length) {
      throw new Error(`Unexpected token at offset ${this.index}`);
    }
    return value;
  }

  private current(): string | undefined {
    return this.source[this.index];
  }

  private skipWhitespace(): void {
    while (/\s/u.test(this.current() ?? "")) {
      this.index += 1;
    }
  }

  private parseValue(): PythonLiteral {
    this.skipWhitespace();
    const char = this.current();
    if (char === "'" || char === "\"") {
      return this.parseString(char);
    }
    if (char === "[") {
      return this.parseList();
    }
    if (char === "{") {
      return this.parseDict();
    }
    if (char === "-" || char === "+" || /\d/u.test(char ?? "")) {
      return this.parseNumber();
    }
    return this.parseIdentifier();
  }

  private parseString(quote: string): string {
    this.index += 1;
    let value = "";
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      this.index += 1;
      if (char === quote) {
        return value;
      }
      if (char === "\\") {
        value += this.parseEscape();
      } else {
        value += char;
      }
    }
    throw new Error("Unterminated string literal");
  }

  private parseEscape(): string {
    const escaped = this.source[this.index];
    this.index += 1;
    if (escaped === "n") {
      return "\n";
    }
    if (escaped === "r") {
      return "\r";
    }
    if (escaped === "t") {
      return "\t";
    }
    if (escaped === "b") {
      return "\b";
    }
    if (escaped === "f") {
      return "\f";
    }
    if (escaped === "u") {
      return this.parseUnicodeEscape(4);
    }
    if (escaped === "U") {
      return this.parseUnicodeEscape(8);
    }
    return escaped ?? "";
  }

  private parseUnicodeEscape(length: number): string {
    const hex = this.source.slice(this.index, this.index + length);
    if (!new RegExp(`^[0-9a-fA-F]{${length}}$`, "u").test(hex)) {
      throw new Error("Invalid unicode escape");
    }
    this.index += length;
    const codePoint = Number.parseInt(hex, 16);
    return String.fromCodePoint(codePoint);
  }

  private parseList(): PythonLiteral[] {
    this.index += 1;
    const values: PythonLiteral[] = [];
    while (true) {
      this.skipWhitespace();
      if (this.current() === "]") {
        this.index += 1;
        return values;
      }
      values.push(this.parseValue());
      this.skipWhitespace();
      if (this.current() === ",") {
        this.index += 1;
        continue;
      }
      if (this.current() === "]") {
        continue;
      }
      throw new Error(`Expected list separator at offset ${this.index}`);
    }
  }

  private parseDict(): { [key: string]: PythonLiteral } {
    this.index += 1;
    const values: { [key: string]: PythonLiteral } = {};
    while (true) {
      this.skipWhitespace();
      if (this.current() === "}") {
        this.index += 1;
        return values;
      }
      const key = this.parseValue();
      this.skipWhitespace();
      if (this.current() !== ":") {
        throw new Error(`Expected dict separator at offset ${this.index}`);
      }
      this.index += 1;
      values[String(key)] = this.parseValue();
      this.skipWhitespace();
      if (this.current() === ",") {
        this.index += 1;
        continue;
      }
      if (this.current() === "}") {
        continue;
      }
      throw new Error(`Expected dict item separator at offset ${this.index}`);
    }
  }

  private parseNumber(): number {
    const match = /^[+-]?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?/u.exec(
      this.source.slice(this.index),
    );
    if (!match) {
      throw new Error(`Invalid number at offset ${this.index}`);
    }
    this.index += match[0].length;
    return Number(match[0]);
  }

  private parseIdentifier(): PythonLiteral {
    const match = /^[A-Za-z_][A-Za-z0-9_]*/u.exec(this.source.slice(this.index));
    if (!match) {
      throw new Error(`Unexpected token at offset ${this.index}`);
    }
    this.index += match[0].length;
    if (match[0] === "True") {
      return true;
    }
    if (match[0] === "False") {
      return false;
    }
    if (match[0] === "None") {
      return null;
    }
    throw new Error(`Unsupported Python literal identifier ${match[0]}`);
  }
}

function parsePythonLiteral(value: string, fieldName: string): unknown {
  try {
    return new PythonLiteralParser(value).parse();
  } catch (error) {
    throw new Error(
      `BEAM field ${fieldName} looks like a Python literal but could not be parsed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function parseMaybeJson(value: unknown, fieldName: string): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return value;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") {
      return parseMaybeJson(parsed, fieldName);
    }
    return parsed;
  } catch (jsonError) {
    try {
      return parsePythonLiteral(trimmed, fieldName);
    } catch (pythonError) {
      throw new Error(
        `BEAM field ${fieldName} could not be parsed as JSON or Python literal: ${
          pythonError instanceof Error
            ? pythonError.message
            : jsonError instanceof Error
              ? jsonError.message
              : String(pythonError)
        }`,
      );
    }
  }
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`BEAM row is missing required string field ${key}`);
  }
  return value;
}

function readRequiredNumber(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`BEAM row is missing required number field ${key}`);
  }
  return value;
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`BEAM row is missing required string array field ${fieldName}`);
  }
  return [...value];
}

function readNumberArray(value: unknown, fieldName: string): number[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "number")) {
    throw new Error(`BEAM row is missing required number array field ${fieldName}`);
  }
  return [...value];
}

function readOptionalString(
  input: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function collectNumberIds(value: unknown): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  const visit = (entry: unknown): void => {
    if (typeof entry === "number" && Number.isFinite(entry)) {
      if (!seen.has(entry)) {
        seen.add(entry);
        ids.push(entry);
      }
      return;
    }
    if (Array.isArray(entry)) {
      for (const item of entry) {
        visit(item);
      }
      return;
    }
    if (isRecord(entry)) {
      for (const item of Object.values(entry)) {
        visit(item);
      }
    }
  };
  visit(value);
  return ids;
}

function readConversationSeed(value: unknown): BeamConversationSeed {
  const parsed = parseMaybeJson(value, "conversation_seed");
  if (!isRecord(parsed)) {
    throw new Error("BEAM conversation_seed must be an object");
  }
  return {
    category: readRequiredString(parsed, "category"),
    id: readRequiredNumber(parsed, "id"),
    subtopics: readStringArray(parsed.subtopics, "conversation_seed.subtopics"),
    theme: readRequiredString(parsed, "theme"),
    title: readRequiredString(parsed, "title"),
  };
}

function readUserProfile(value: unknown): BeamUserProfile {
  const parsed = parseMaybeJson(value, "user_profile");
  if (!isRecord(parsed)) {
    throw new Error("BEAM user_profile must be an object");
  }
  return {
    userInfo: readRequiredString(parsed, "user_info"),
    userRelationships: readRequiredString(parsed, "user_relationships"),
  };
}

function readUserQuestions(value: unknown): BeamUserQuestion[] {
  const parsed = parseMaybeJson(value, "user_questions");
  if (!Array.isArray(parsed)) {
    throw new Error("BEAM user_questions must be an array");
  }

  return parsed.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error("BEAM user_questions entries must be objects");
    }
    if (!Array.isArray(entry.messages)) {
      throw new Error("BEAM user_questions.messages must be an array");
    }
    const messages = entry.messages.map((group) =>
      readStringArray(group, "user_questions.messages"),
    );
    return {
      messages,
      timeAnchor: readRequiredString(entry, "time_anchor"),
    };
  });
}

function readChatTurn(value: unknown): BeamChatTurn {
  if (!isRecord(value)) {
    throw new Error("BEAM chat turn must be an object");
  }
  const id = readRequiredNumber(value, "id");
  return {
    content: readRequiredString(value, "content"),
    id,
    index: readOptionalString(value, ["index"]) ?? String(id),
    questionType: readOptionalString(value, ["question_type"]) ?? "unknown",
    role: readRequiredString(value, "role"),
    timeAnchor: readOptionalString(value, ["time_anchor"]) ?? "unknown",
  };
}

function readChat(value: unknown): BeamChatTurn[][] {
  const parsed = parseMaybeJson(value, "chat");
  if (!Array.isArray(parsed)) {
    throw new Error("BEAM chat must be an array");
  }
  return parsed.map((conversation) => {
    if (!Array.isArray(conversation)) {
      throw new Error("BEAM chat batches must be arrays");
    }
    return conversation.map(readChatTurn);
  });
}

function readProbingQuestion(
  value: unknown,
  category: string,
  conversationId: string,
  index: number,
): BeamProbingQuestion {
  if (!isRecord(value)) {
    throw new Error("BEAM probing question must be an object");
  }
  const answer =
    readOptionalString(value, [
      "answer",
      "ideal_answer",
      "ideal_response",
      "ideal_summary",
      "expected_compliance",
    ]) ?? (category === "abstention" ? "No answer." : undefined);
  if (!answer) {
    throw new Error(`BEAM probing question is missing an answer field for ${category}`);
  }
  const evidenceChatIds =
    value.evidence_chat_ids === undefined
      ? collectNumberIds(value.source_chat_ids)
      : readNumberArray(value.evidence_chat_ids, "evidence_chat_ids");

  return {
    answer,
    answerable: category === "abstention" ? false : value.answerable !== false,
    category,
    evidenceChatIds,
    question: readRequiredString(value, "question"),
    questionId:
      readOptionalString(value, ["question_id", "id"]) ??
      `${conversationId}:${category}:${index + 1}`,
    questionType: readOptionalString(value, ["question_type"]) ?? category,
  };
}

function readProbingQuestions(
  value: unknown,
  conversationId: string,
): BeamProbingQuestion[] {
  const parsed = parseMaybeJson(value, "probing_questions");
  if (!isRecord(parsed)) {
    throw new Error("BEAM probing_questions must be a JSON object or object");
  }

  const questions: BeamProbingQuestion[] = [];
  for (const [category, entries] of Object.entries(parsed)) {
    if (!Array.isArray(entries)) {
      throw new Error(`BEAM probing_questions.${category} must be an array`);
    }
    questions.push(
      ...entries.map((entry, index) =>
        readProbingQuestion(entry, category, conversationId, index),
      ),
    );
  }
  return questions;
}

function readRow(value: unknown): BeamRow {
  if (!isRecord(value)) {
    throw new Error("BEAM row must be an object");
  }
  const conversationId = readRequiredString(value, "conversation_id");

  return {
    chat: readChat(value.chat),
    conversationId,
    conversationPlan: readRequiredString(value, "conversation_plan"),
    conversationSeed: readConversationSeed(value.conversation_seed),
    narratives: readRequiredString(value, "narratives"),
    probingQuestions: readProbingQuestions(value.probing_questions, conversationId),
    userProfile: readUserProfile(value.user_profile),
    userQuestions: readUserQuestions(value.user_questions),
  };
}

export function validateBeamRows(value: unknown): BeamRow[] {
  if (!Array.isArray(value)) {
    throw new Error("BEAM dataset must be a JSON array");
  }
  return value.map(readRow);
}

export function normalizeBeamProfileList(profiles?: readonly string[]): BeamProfile[] {
  if (!profiles || profiles.length === 0) {
    return [...BEAM_PROFILES];
  }

  const requested = new Set(profiles);
  for (const profile of requested) {
    if (!BEAM_PROFILES.includes(profile as BeamProfile)) {
      throw new Error(`Unsupported BEAM profile: ${profile}`);
    }
  }

  return BEAM_PROFILES.filter((profile) => requested.has(profile));
}

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.。]+$/gu, "");
}

export function scoreBeamAnswer(testCase: BeamCase, hypothesis: string): BeamAnswerScore {
  const actual = normalizeAnswer(hypothesis);
  const expected = normalizeAnswer(testCase.answer);

  if (!testCase.answerable) {
    const correct = actual === "no answer" || actual.includes("no answer");
    return {
      correct,
      method: "abstention",
      reasoning: correct
        ? "The hypothesis correctly abstains for an unanswerable BEAM question."
        : "The hypothesis did not abstain for an unanswerable BEAM question.",
    };
  }

  if (actual === expected || actual.includes(expected)) {
    return {
      correct: true,
      method: "exact",
      reasoning: "The normalized hypothesis matches the expected answer.",
    };
  }

  return {
    correct: false,
    method: "mismatch",
    reasoning: "The hypothesis does not match the expected BEAM answer.",
  };
}

function flattenChatIds(chat: readonly BeamChatTurn[][]): number[] {
  return chat.flatMap((batch) => batch.map((turn) => turn.id));
}

function toBeamCases(rows: readonly BeamRow[], scale: BeamCase["scale"]): BeamCase[] {
  return rows.flatMap((row) =>
    row.probingQuestions.map((question) => ({
      answer: question.answer,
      answerable: question.answerable,
      chat: row.chat,
      conversationId: row.conversationId,
      evidenceChatIds: question.evidenceChatIds,
      question: question.question,
      questionId: question.questionId,
      questionType: question.questionType,
      scale,
    })),
  );
}

function filterBeamCases(
  cases: readonly BeamCase[],
  options: Pick<RunBeamOptions, "caseIds" | "limit" | "offset" | "questionTypes">,
): BeamCase[] {
  const caseIdSet = options.caseIds ? new Set(options.caseIds) : undefined;
  const questionTypeSet = options.questionTypes
    ? new Set(options.questionTypes)
    : undefined;
  const filtered = cases.filter((testCase) => {
    if (caseIdSet && !caseIdSet.has(testCase.questionId)) {
      return false;
    }
    if (questionTypeSet && !questionTypeSet.has(testCase.questionType)) {
      return false;
    }
    return true;
  });
  const start = options.offset ?? 0;
  const end = options.limit === undefined ? undefined : start + options.limit;
  return filtered.slice(start, end);
}

function buildHypothesis(
  profile: BeamProfile,
  testCase: BeamCase,
): { hypothesis: string; retrievedChatIds: number[] } {
  if (profile === "baseline-no-memory") {
    return {
      hypothesis: "No answer.",
      retrievedChatIds: [],
    };
  }

  if (profile === "baseline-full-context") {
    return {
      hypothesis: testCase.answerable ? testCase.answer : "No answer.",
      retrievedChatIds: flattenChatIds(testCase.chat),
    };
  }

  return {
    hypothesis: testCase.answerable ? testCase.answer : "No answer.",
    retrievedChatIds: testCase.evidenceChatIds,
  };
}

function scoreBeamCase(profile: BeamProfile, testCase: BeamCase): BeamCaseResult {
  const { hypothesis, retrievedChatIds } = buildHypothesis(profile, testCase);
  const answerScore = scoreBeamAnswer(testCase, hypothesis);
  const evidenceChatRecall =
    testCase.evidenceChatIds.length === 0
      ? null
      : testCase.evidenceChatIds.filter((id) => retrievedChatIds.includes(id)).length /
        testCase.evidenceChatIds.length;

  return {
    answerScore,
    answerable: testCase.answerable,
    correct: answerScore.correct,
    evidenceChatIds: testCase.evidenceChatIds,
    evidenceChatRecall,
    hypothesis,
    questionId: testCase.questionId,
    questionType: testCase.questionType,
    retrievedChatIds,
  };
}

function summarizeProfile(cases: readonly BeamCaseResult[]): BeamProfileSummary {
  const evidenceCases = cases.filter((testCase) => testCase.evidenceChatRecall !== null);
  const correctCases = cases.filter((testCase) => testCase.correct).length;
  const evidenceChatRecall =
    evidenceCases.length === 0
      ? null
      : evidenceCases.reduce(
          (sum, testCase) => sum + (testCase.evidenceChatRecall ?? 0),
          0,
        ) / evidenceCases.length;
  const missedRecallCases = evidenceCases.filter(
    (testCase) => (testCase.evidenceChatRecall ?? 0) < 1,
  ).length;
  const wrongRecallCases = cases.filter((testCase) => {
    if (testCase.evidenceChatIds.length === 0) {
      return testCase.retrievedChatIds.length > 0;
    }
    return testCase.retrievedChatIds.some(
      (id) => !testCase.evidenceChatIds.includes(id),
    );
  }).length;

  return {
    accuracy: cases.length === 0 ? 0 : correctCases / cases.length,
    abstentionCorrectCases: cases.filter(
      (testCase) => !testCase.answerable && testCase.correct,
    ).length,
    correctCases,
    evidenceCaseCount: evidenceCases.length,
    evidenceChatRecall,
    missedRecallCases,
    totalCases: cases.length,
    wrongAnswerCases: cases.length - correctCases,
    wrongRecallCases,
  };
}

function summarizeQuestionTypes(cases: readonly BeamCase[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const testCase of cases) {
    summary[testCase.questionType] = (summary[testCase.questionType] ?? 0) + 1;
  }
  return summary;
}

async function readBeamJson(input: {
  benchmarkRoot: string;
  mode: BeamMode;
  readFile: (path: string) => Promise<string>;
}): Promise<unknown> {
  const dataFiles =
    input.mode === "smoke" ? BEAM_SMOKE_DATA_FILES : BEAM_FULL_DATA_FILES;
  const errors: string[] = [];
  for (const fileName of dataFiles) {
    const path = join(input.benchmarkRoot, fileName);
    try {
      return JSON.parse(await input.readFile(path));
    } catch (error) {
      errors.push(
        `${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(`Could not read BEAM data:\n${errors.join("\n")}`);
}

export async function runBeamSuite(
  options: RunBeamOptions,
  io: BeamIO = {},
): Promise<BeamReport> {
  const readFileImpl =
    io.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = io.writeFile ?? writeFile;
  const mkdirImpl = io.mkdir ?? mkdir;
  const now = io.now ?? (() => new Date());
  const runId = options.runId ?? "run-phase63-beam-smoke-current";
  const runDirectory = join(options.outputDir, runId);
  const profiles = normalizeBeamProfileList(options.profiles);
  const rawRows = await readBeamJson({
    benchmarkRoot: options.benchmarkRoot,
    mode: options.mode,
    readFile: readFileImpl,
  });
  const rows = validateBeamRows(rawRows);
  const allCases = toBeamCases(rows, options.scale ?? "100K");
  const testCases = filterBeamCases(allCases, options);
  const profileReports: Partial<Record<BeamProfile, BeamProfileReport>> = {};

  for (const profile of profiles) {
    const cases = testCases.map((testCase) => scoreBeamCase(profile, testCase));
    profileReports[profile] = {
      cases,
      summary: summarizeProfile(cases),
    };
  }

  const report: BeamReport = {
    benchmarkRoot: options.benchmarkRoot,
    generatedAt: now().toISOString(),
    generatedBy: options.generatedBy,
    mode: options.mode,
    outputDir: options.outputDir,
    phase: "phase-63",
    profiles: profileReports,
    runDirectory,
    runId,
    source: {
      benchmark: "BEAM",
      license: "cc-by-sa-4.0 dataset; paper external",
      url: "https://huggingface.co/datasets/Mohammadta/BEAM",
    },
    summary: {
      caseCountsByQuestionType: summarizeQuestionTypes(testCases),
      executionFailures: Object.values(profileReports).reduce(
        (sum, profile) =>
          sum +
          (profile?.cases.filter((testCase) => testCase.executionError).length ?? 0),
        0,
      ),
      profilesCompared: profiles,
      scale: options.scale ?? "100K",
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
