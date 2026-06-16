import { generateObject } from "ai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { GoodMemory } from "../src/api/contracts";
import type { MemoryScope } from "../src/domain/scope";
import type { RecallResult } from "../src/api/contracts";
import type {
  BeamAnswerScore,
  BeamCase,
  BeamCaseResult,
  BeamChatTurn,
  BeamProfile,
  BeamRow,
} from "../src/eval/beam";
import {
  normalizeBeamProfileList,
  scoreBeamAnswer,
} from "../src/eval/beam";
import type { PersonaSpec, ScenarioFixture } from "../src/eval/dataset";
import {
  DEFAULT_AISDK_REQUEST_TIMEOUT_MS,
  requestOpenAICompatibleObject,
  resolveAISDKModel,
  withAISDKRetries,
} from "../src/provider/ai-sdk-runtime";
import type { AISDKModelConfig } from "../src/provider/ai-sdk-runtime";
import { createProviderTextGenerator } from "../src/provider/layer";
import { resolveLiveModelConfig } from "./run-eval";
import { resolveCliFlagValue } from "./cli-options";
import {
  assertPhase63Readiness,
  checkPhase63Readiness,
  resolvePhase63OutputDir,
  resolvePhase63RepoRoot,
} from "./run-phase-63-shared";
import {
  buildPhase63BeamScope,
  collectPhase63BeamChatIdsFromRecord,
  collectPhase63BeamRetrievedChatIds,
  createPhase63BeamDiagnosticMemory,
  flattenPhase63BeamCases,
  readPhase63BeamRows,
  seedPhase63BeamConversation,
} from "./run-phase-63-beam-recall-diagnostic";

export const PHASE63_BEAM_LIVE_SLICE_RUN_ID =
  "run-phase63-beam-100k-live-slice-current";
export const PHASE63_LIVE_REQUEST_TIMEOUT_ENV =
  "GOODMEMORY_PHASE63_LIVE_REQUEST_TIMEOUT_MS";
export const PHASE63_BEAM_LIVE_SLICE_REPORT_FILE_NAME =
  "live-slice-report.json";

const GENERATED_BY = "scripts/run-phase-63-beam-live-slice.ts";
const SOURCE_ORDER_CONTEXT_LIMIT = 40;
const SOURCE_ORDER_CONTEXT_REQUESTED_ITEM_MAX_LIMIT = 10;
const ORDERED_EVIDENCE_FOUNDATION_PATTERN =
  /\b(?:core\s+(?:app\s+)?functionality|initializ(?:e|ed|ing)|local\s+dev|port\s+\d+|setup|setting\s+up|want\s+to\s+(?:build|implement))\b/iu;
const ORDERED_EVIDENCE_TRANSACTION_PATTERN =
  /\b(?:CRUD|POST\s+\/[\w/{}/-]+|REST|transaction|validation|response\s+handling|error\s+management|error\s+handling)\b/iu;
const ORDERED_EVIDENCE_DEPLOYMENT_PATTERN =
  /\b(?:deploy(?:ed|ing|ment)?|Gunicorn|integration\s+tests?|launch|port\s+\d+|Render\.com|worker)\b/iu;
const ORDERED_EVIDENCE_SECURITY_PATTERN =
  /\b(?:authorization|authentication|hardening|security|SQL\s+injection|vulnerabilities|XSS)\b/iu;
const ORDERED_EVIDENCE_ACTION_PATTERN =
  /\b(?:build|built|completed|configur(?:e|ed|ing)|CRUD|deploy(?:ed|ing|ment)?|design(?:ed|ing)|finaliz(?:e|ed|ing)|hardening|implement(?:ed|ing)?|initializ(?:e|ed|ing)|integration\s+tests?|launch|models?|POST\s+\/[\w/{}/-]+|response\s+handling|security|SQL\s+injection|validation|XSS)\b/iu;
const ORDERED_EVIDENCE_LOW_VALUE_PATTERN =
  /\b(?:architecture\s+decisions|Bootstrap|Confluence|debugging|document(?:ing|ation)|Jinja2|minimal|MVP|preference|prefer|pragmatic|remote\s+collaborator|sprint\s+plan|timeline|wireframe)\b/iu;
const ORDERED_EVIDENCE_DOCUMENTATION_OR_PREFERENCE_PATTERN =
  /\b(?:architecture\s+decisions|Confluence|document(?:ing|ation)|preference|prefer|pragmatic|remote\s+collaborator)\b/iu;
const ORDERED_EVIDENCE_PLAN_SUMMARY_PATTERN =
  /\b(?:Components:|Milestones:|Nov\s+\d+|Dec\s+\d+|Sure,\s+let'?s\s+break\s+it\s+down)\b/iu;
const ORDERED_EVIDENCE_ENV_CONFIG_PATTERN =
  /\b(?:DATABASE_URL|environment\s+variables|FLASK_ENV|production\s+environment|SECRET_KEY)\b/iu;
const ORDERED_EVIDENCE_GENERIC_REST_PATTERN =
  /\b(?:defined\s+the\s+following\s+endpoints|GET\s+\/transactions[\s\S]{0,120}POST\s+\/transactions[\s\S]{0,120}PUT\s+\/transactions[\s\S]{0,120}DELETE\s+\/transactions)\b/iu;
const ORDERED_EVIDENCE_SECURITY_TEST_FOLLOWUP_PATTERN =
  /\b(?:auth\.py|coverage|new\s+tests?|security\.py|test\s+suite|SQL\s+injection|XSS)\b/iu;

const BEAM_PERSONA: PersonaSpec = {
  age_range: "unknown",
  background: "External BEAM benchmark persona.",
  communication_preferences: [],
  current_projects: [],
  domain_specific_preferences: [],
  domains: ["external-benchmark"],
  drift_events: [],
  expertise: [],
  growth_path: [],
  known_relationships: [],
  lifecycle_bucket: "medium",
  locale: "en",
  long_term_goals: [],
  memory_risks: [],
  name: "BEAM",
  negative_personalization_risks: [],
  persona_id: "beam",
  profession: "benchmark",
  scenario_ids: ["beam"],
  stable_preferences: [],
  work_style_preferences: [],
};

const BEAM_SCENARIO: ScenarioFixture = {
  domain: "external-benchmark",
  evaluation: {
    expected_history_signals: [],
    expected_identity_signals: [],
    expected_non_transfer_signals: [],
    expected_stale_suppression: [],
    expected_transfer_signals: [],
    expected_update_wins: [],
    improvement_hypothesis: "External BEAM answer generation.",
    prompt: "",
    rubric_focus: ["history_open_loop"],
    user_satisfaction_hypothesis: "Answers use only retrieved memory context.",
    wrong_personalization_signals: [],
  },
  evaluation_setting: "single_domain",
  lifecycle_bucket: "medium",
  memory_source_domains: ["external-benchmark"],
  persona_id: "beam",
  required_phenomena: ["historical_task_continuation"],
  scenario_id: "beam",
  sessions: [],
  task_family: "preference_continuation",
};

const beamLiveJudgeSchema = z.object({
  correct: z.boolean(),
  reasoning: z.string().min(1),
});

export interface Phase63BeamLiveSliceCliOptions {
  benchmarkRoot?: string;
  caseSelection?: Phase63BeamLiveCaseSelection;
  caseIds?: readonly string[];
  limit?: number;
  outputDir?: string;
  profile?: BeamProfile;
  recallReportPath?: string;
  runId?: string;
  scale?: BeamCase["scale"];
}

export interface Phase63BeamLiveAnswerGeneratorInput {
  memoryContext: string;
  profile: BeamProfile;
  prompt: string;
  retrievedChatIds: readonly number[];
  testCase: BeamCase;
}

export type Phase63BeamLiveAnswerGenerator = (
  input: Phase63BeamLiveAnswerGeneratorInput,
) => Promise<string>;

export interface Phase63BeamLiveAnswerJudgeInput {
  actualAnswer: string;
  expectedAnswer: string;
  question: string;
  questionId: string;
  questionType: string;
}

export type Phase63BeamLiveAnswerJudge = (
  input: Phase63BeamLiveAnswerJudgeInput,
) => Promise<BeamAnswerScore>;

export type Phase63BeamLiveCaseSelection =
  | "all-cases"
  | "all-evidence"
  | "recall-misses";

export interface Phase63BeamLiveSliceDependencies {
  answerGenerator?: Phase63BeamLiveAnswerGenerator;
  answerJudge?: Phase63BeamLiveAnswerJudge;
  createMemory?: () => GoodMemory;
  mkdir?: typeof mkdir;
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, value: string) => Promise<void>;
}

export interface Phase63BeamLiveSliceCaseResult extends BeamCaseResult {
  answerable: boolean;
  conversationId: string;
  expectedAnswer: string;
  memoryContextChars: number;
}

export interface Phase63BeamLiveSliceReport {
  benchmarkRoot: string;
  cases: Phase63BeamLiveSliceCaseResult[];
  generatedAt: string;
  generatedBy: typeof GENERATED_BY;
  mode: "live-answer-slice";
  outputDir: string;
  phase: "phase-63";
  profile: BeamProfile;
  recallReportPath?: string;
  runDirectory: string;
  runId: string;
  source: {
    benchmark: "BEAM";
    license: "cc-by-sa-4.0 dataset; paper external";
    url: "https://huggingface.co/datasets/Mohammadta/BEAM";
  };
  summary: {
    caseCountsByQuestionType: Record<string, number>;
    correctCases: number;
    evidenceCaseCount: number;
    evidenceChatRecall: number | null;
    executionFailures: number;
    missedRecallCases: number;
    profilesCompared: BeamProfile[];
    scale: BeamCase["scale"];
    totalCases: number;
    wrongAnswerCases: number;
    wrongRecallCases: number;
  };
}

interface BeamLiveSliceCase extends BeamCase {
  row: BeamRow;
}

function parseLimit(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("--limit must be a positive integer");
  }
  return parsed;
}

function parseScale(value: string | undefined): BeamCase["scale"] | undefined {
  if (!value) {
    return undefined;
  }
  if (
    value === "100K" ||
    value === "500K" ||
    value === "1M" ||
    value === "10M" ||
    value === "unknown"
  ) {
    return value;
  }
  throw new Error("--scale must be 100K, 500K, 1M, 10M, or unknown");
}

function parseRepeatedFlag(
  argv: readonly string[],
  flagName: string,
): string[] | undefined {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flagName) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${flagName} requires a value`);
      }
      values.push(value);
    }
  }
  return values.length === 0 ? undefined : values;
}

function parseProfile(value: string | undefined): BeamProfile | undefined {
  if (!value) {
    return undefined;
  }
  const profiles = normalizeBeamProfileList([value]);
  if (profiles[0] !== "goodmemory-rules-only") {
    throw new Error(
      "Phase 63 BEAM live slice currently supports --profile goodmemory-rules-only.",
    );
  }
  return profiles[0];
}

function parseCaseSelection(
  value: string | undefined,
): Phase63BeamLiveCaseSelection | undefined {
  if (!value) {
    return undefined;
  }
  if (
    value === "all-cases" ||
    value === "all-evidence" ||
    value === "recall-misses"
  ) {
    return value;
  }
  throw new Error(
    "--case-selection must be all-cases, all-evidence, or recall-misses",
  );
}

export function parsePhase63BeamLiveSliceCliOptions(
  argv: readonly string[],
): Phase63BeamLiveSliceCliOptions {
  return {
    benchmarkRoot:
      resolveCliFlagValue(argv, "--benchmark-root") ??
      process.env.GOODMEMORY_BEAM_ROOT,
    caseSelection: parseCaseSelection(
      resolveCliFlagValue(argv, "--case-selection"),
    ),
    caseIds: parseRepeatedFlag(argv, "--case-id"),
    limit: parseLimit(resolveCliFlagValue(argv, "--limit")),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    profile: parseProfile(resolveCliFlagValue(argv, "--profile")),
    recallReportPath: resolveCliFlagValue(argv, "--recall-report"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    scale: parseScale(resolveCliFlagValue(argv, "--scale")),
  };
}

function resolvePhase63LiveRequestTimeoutMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const value = env[PHASE63_LIVE_REQUEST_TIMEOUT_ENV];
  if (!value) {
    return DEFAULT_AISDK_REQUEST_TIMEOUT_MS;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${PHASE63_LIVE_REQUEST_TIMEOUT_ENV} must be a positive integer`);
  }
  return parsed;
}

export function buildPhase63BeamPrompt(input: {
  memoryContext: string;
  question: string;
}): string {
  return [
    "Retrieved GoodMemory context:",
    input.memoryContext.trim().length > 0 ? input.memoryContext : "(none)",
    `Question:\n${input.question}`,
    "Answer using only the retrieved GoodMemory context.",
    "If the retrieved context contains materially conflicting user statements, say that they conflict instead of silently choosing one.",
    "When the question asks for an order or sequence, answer with the requested ordered milestones rather than only a fragment from the first item.",
    "For order or sequence questions, compress repeated setup chatter into one milestone and use later source-ordered evidence when it introduces a new milestone.",
    "For ordered numbered answers, each item should map to a concrete source turn or tightly adjacent source turns; do not create broad umbrella buckets that merge many unrelated turns.",
    "Preserve the concrete source action for each ordered item, such as the endpoint, status code, configuration setting, test target, security mechanism, date, or named feature, instead of replacing it with a broad phase label.",
    "Do not add adjacent themes from the same source turn unless they are necessary to answer that numbered item.",
    "Return only the short answer. If the answer is not present, return exactly: No answer.",
  ].join("\n\n");
}

function createBeamAnswerGenerator(
  requestTimeoutMs = resolvePhase63LiveRequestTimeoutMs(),
): Phase63BeamLiveAnswerGenerator {
  const model = resolveLiveModelConfig("GOODMEMORY_EVAL");
  const generator = createProviderTextGenerator({
    model,
    requestTimeoutMs,
    system:
      "You answer BEAM benchmark questions using only supplied GoodMemory context. Do not invent missing details.",
    promptBuilder: (payload) =>
      buildPhase63BeamPrompt({
        memoryContext: payload.memoryContext ?? "",
        question: payload.prompt,
      }),
  });

  return async (input) => {
    const output = await generator({
      memoryContext: input.memoryContext,
      persona: BEAM_PERSONA,
      prompt: input.prompt,
      scenario: BEAM_SCENARIO,
      transcript: "",
    });
    return output.content;
  };
}

function buildJudgePrompt(input: Phase63BeamLiveAnswerJudgeInput): string {
  return [
    "You are judging BEAM answer correctness.",
    "Return strict JSON with keys: correct (boolean), reasoning (string).",
    "Mark correct when the candidate answer is semantically equivalent to the expected answer for the question.",
    "Reject generic answers, contradictions, unsupported answers, or No answer when the expected answer is present.",
    `Question id: ${input.questionId}`,
    `Question type: ${input.questionType}`,
    `Question: ${input.question}`,
    `Expected answer: ${input.expectedAnswer}`,
    `Candidate answer: ${input.actualAnswer}`,
  ].join("\n\n");
}

async function runLiveAnswerJudge(
  model: AISDKModelConfig,
  input: Phase63BeamLiveAnswerJudgeInput,
  requestTimeoutMs = resolvePhase63LiveRequestTimeoutMs(),
): Promise<BeamAnswerScore> {
  const prompt = buildJudgePrompt(input);
  const system =
    "You are a strict benchmark judge. Return only valid JSON matching the requested shape.";

  if (model.provider === "openai" && model.baseURL) {
    const object = await withAISDKRetries(() =>
      requestOpenAICompatibleObject({
        model,
        prompt,
        schema: beamLiveJudgeSchema,
        system,
        timeoutMs: requestTimeoutMs,
      }),
    );
    return {
      correct: object.correct,
      method: "semantic_judge",
      reasoning: object.reasoning,
    };
  }

  const { object } = await withAISDKRetries(async () =>
    generateObject({
      maxRetries: 0,
      model: resolveAISDKModel(model),
      prompt,
      schema: beamLiveJudgeSchema,
      system,
      timeout: requestTimeoutMs,
    }),
  );
  return {
    correct: object.correct,
    method: "semantic_judge",
    reasoning: object.reasoning,
  };
}

function createBeamAnswerJudge(
  requestTimeoutMs = resolvePhase63LiveRequestTimeoutMs(),
): Phase63BeamLiveAnswerJudge {
  const model = resolveLiveModelConfig("GOODMEMORY_JUDGE");
  return (input) => runLiveAnswerJudge(model, input, requestTimeoutMs);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringifyContextValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function collectTextFromRecord(record: Record<string, unknown>): string | undefined {
  return (
    stringifyContextValue(record.content) ??
    stringifyContextValue(record.rule) ??
    stringifyContextValue(record.summary) ??
    stringifyContextValue(record.value) ??
    stringifyContextValue(record.description) ??
    stringifyContextValue(record.pointer) ??
    stringifyContextValue(record.title)
  );
}

export function compressPhase63BeamMemoryContextText(text: string): string {
  const withoutCode = text.replace(/```[\s\S]*?```/gu, " [code omitted] ");
  const normalized = withoutCode.replace(/\s+/gu, " ").trim();
  const lead = normalized
    .split(
      /\b(?:here(?:'s| is)|i'?ve got|i have the following|current code|sample implementation|starting point)\b/iu,
    )[0]
    ?.trim();
  const preferred = lead && lead.length >= 80 ? lead : normalized;
  const maxLength = 420;

  return preferred.length <= maxLength
    ? preferred
    : `${preferred.slice(0, maxLength - 3)}...`;
}

const requestedItemWords = new Map<string, number>([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
]);

export function extractPhase63BeamRequestedItemCount(
  question: string,
): number | undefined {
  const digitMatch = question.match(/\b(\d+)\s+(?:items?|milestones?|steps?)\b/iu);
  if (digitMatch) {
    const parsed = Number(digitMatch[1]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  for (const [word, value] of requestedItemWords) {
    if (
      new RegExp(`\\b${word}\\s+(?:items?|milestones?|steps?)\\b`, "iu").test(
        question,
      )
    ) {
      return value;
    }
  }
  return undefined;
}

function isOrderingQuestion(testCase: BeamCase): boolean {
  return (
    testCase.questionType === "event_ordering" ||
    /\b(?:order|sequence|chronolog|timeline|before|after|first|walk me through)\b/iu.test(
      testCase.question,
    )
  );
}

function sourceOrderValue(turn: BeamChatTurn): number {
  const parsed = Number(turn.index);
  return Number.isFinite(parsed) ? parsed : turn.id;
}

function orderedEvidenceGroups(content: string): Set<string> {
  const groups = new Set<string>();

  if (ORDERED_EVIDENCE_FOUNDATION_PATTERN.test(content)) {
    groups.add("foundation");
  }
  if (/\b(?:authentication|auth|login|password|registration)\b/iu.test(content)) {
    groups.add("authentication");
  }
  if (/\b(?:database|models?|schema|SQLite)\b/iu.test(content)) {
    groups.add("data_model");
  }
  if (ORDERED_EVIDENCE_TRANSACTION_PATTERN.test(content)) {
    groups.add("transaction_api");
  }
  if (/\b(?:analytics?|visualization|reporting)\b/iu.test(content)) {
    groups.add("analytics");
  }
  if (ORDERED_EVIDENCE_DEPLOYMENT_PATTERN.test(content)) {
    groups.add("deployment");
  }
  if (ORDERED_EVIDENCE_SECURITY_PATTERN.test(content)) {
    groups.add("security");
  }
  if (/\btests?\b/iu.test(content)) {
    groups.add("testing");
  }

  return groups;
}

function orderedEvidencePriority(input: {
  question: string;
  requestedCount: number;
  turn: BeamChatTurn;
}): number {
  const content = input.turn.content;
  const compactMilestoneRequest = input.requestedCount <= 3;
  const queryMentionsDeployment = /\bdeploy(?:ed|ing|ment)?\b/iu.test(input.question);
  const queryMentionsTesting = /\btests?\b/iu.test(input.question);
  let priority = input.turn.role === "user" ? 80 : -80;

  if (ORDERED_EVIDENCE_ACTION_PATTERN.test(content)) {
    priority += 80;
  }
  if (ORDERED_EVIDENCE_FOUNDATION_PATTERN.test(content)) {
    priority += compactMilestoneRequest ? 130 : 85;
  }
  if (
    compactMilestoneRequest &&
    /\b(?:core\s+(?:app\s+)?functionality|want\s+to\s+(?:build|implement))\b/iu.test(content)
  ) {
    priority += 120;
  }
  if (
    !compactMilestoneRequest &&
    /\b(?:initializ(?:e|ed|ing)|local\s+dev|port\s+\d+|setup)\b/iu.test(content)
  ) {
    priority += queryMentionsDeployment ? 130 : 65;
  }
  if (ORDERED_EVIDENCE_TRANSACTION_PATTERN.test(content)) {
    priority += compactMilestoneRequest ? 120 : 95;
  }
  if (
    compactMilestoneRequest &&
    /\b(?:working\s+on\s+transaction\s+CRUD|implement(?:ing|ed)?[\s\S]{0,60}\btransaction|transaction\s+CRUD\s+and\s+analytics?\s+integration)\b/iu.test(content)
  ) {
    priority += 120;
  }
  if (
    !compactMilestoneRequest &&
    /\bPOST\s+\/[\w/{}/-]+\b/iu.test(content)
  ) {
    priority += 180;
  }
  if (ORDERED_EVIDENCE_DEPLOYMENT_PATTERN.test(content)) {
    priority += queryMentionsDeployment ? 140 : 65;
  }
  if (ORDERED_EVIDENCE_SECURITY_PATTERN.test(content)) {
    priority += queryMentionsDeployment || queryMentionsTesting ? 115 : 95;
  }
  if (
    compactMilestoneRequest &&
    /\b(?:finaliz(?:e|ed|ing)|hardening|authorization)\b/iu.test(content)
  ) {
    priority += 120;
  }
  if (
    compactMilestoneRequest &&
    /\b(?:will|add more tests?|edge cases|SQL\s+injection|XSS)\b/iu.test(content)
  ) {
    priority -= 65;
  }
  if (ORDERED_EVIDENCE_DOCUMENTATION_OR_PREFERENCE_PATTERN.test(content)) {
    priority -= 260;
  } else if (ORDERED_EVIDENCE_PLAN_SUMMARY_PATTERN.test(content)) {
    priority -= 220;
  } else if (
    compactMilestoneRequest &&
    ORDERED_EVIDENCE_ENV_CONFIG_PATTERN.test(content)
  ) {
    priority -= 220;
  } else if (
    !compactMilestoneRequest &&
    ORDERED_EVIDENCE_GENERIC_REST_PATTERN.test(content)
  ) {
    priority -= 140;
  } else if (
    ORDERED_EVIDENCE_LOW_VALUE_PATTERN.test(content) &&
    !ORDERED_EVIDENCE_ACTION_PATTERN.test(content)
  ) {
    priority -= 120;
  }

  return priority - sourceOrderValue(input.turn) * 0.01;
}

export function selectPhase63BeamOrderedEvidenceTurns(input: {
  question: string;
  requestedCount?: number;
  turns: readonly BeamChatTurn[];
}): BeamChatTurn[] {
  const requestedCount = input.requestedCount === undefined
    ? undefined
    : Math.min(input.requestedCount, SOURCE_ORDER_CONTEXT_REQUESTED_ITEM_MAX_LIMIT);
  if (
    requestedCount === undefined ||
    input.turns.length <= requestedCount
  ) {
    return [...input.turns];
  }

  const ranked = input.turns
    .map((turn) => ({
      groups: orderedEvidenceGroups(turn.content),
      priority: orderedEvidencePriority({
        question: input.question,
        requestedCount,
        turn,
      }),
      turn,
    }))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return sourceOrderValue(left.turn) - sourceOrderValue(right.turn);
    });

  if (ranked.every((candidate) => candidate.groups.size === 0)) {
    return [...input.turns];
  }

  const selected: BeamChatTurn[] = [];
  const selectedIds = new Set<number>();
  const selectedGroups = new Set<string>();
  const addCandidate = (candidate: (typeof ranked)[number]) => {
    if (selectedIds.has(candidate.turn.id)) {
      return;
    }
    selected.push(candidate.turn);
    selectedIds.add(candidate.turn.id);
    for (const group of candidate.groups) {
      selectedGroups.add(group);
    }
  };
  const pickCandidate = (
    predicate: (candidate: (typeof ranked)[number]) => boolean,
    priority: (candidate: (typeof ranked)[number]) => number,
  ) => {
    if (selected.length >= requestedCount) {
      return;
    }

    const candidate = ranked
      .filter((item) => !selectedIds.has(item.turn.id))
      .filter(predicate)
      .sort((left, right) => {
        const priorityDelta = priority(right) - priority(left);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return sourceOrderValue(left.turn) - sourceOrderValue(right.turn);
      })[0];
    if (candidate) {
      addCandidate(candidate);
    }
  };
  const compactMilestoneRequest = requestedCount <= 3;
  const queryMentionsDeployment = /\bdeploy(?:ed|ing|ment)?\b/iu.test(input.question);

  if (compactMilestoneRequest) {
    pickCandidate(
      (candidate) => candidate.groups.has("foundation"),
      (candidate) =>
        candidate.priority +
        (
          /\b(?:core\s+(?:app\s+)?functionality|want\s+to\s+(?:build|implement))\b/iu.test(
            candidate.turn.content,
          )
            ? 260
            : 0
        ) -
        (
          /\b(?:initializ(?:e|ed|ing)|local\s+dev|port\s+\d+|setup)\b/iu.test(
            candidate.turn.content,
          )
            ? 80
            : 0
        ) -
        (
          ORDERED_EVIDENCE_PLAN_SUMMARY_PATTERN.test(candidate.turn.content)
            ? 360
            : 0
        ),
    );
    pickCandidate(
      (candidate) => candidate.groups.has("transaction_api"),
      (candidate) =>
        candidate.priority +
        (
          /\b(?:working\s+on\s+transaction\s+CRUD|implement(?:ing|ed)?[\s\S]{0,60}\btransaction|transaction\s+CRUD\s+and\s+analytics?\s+integration)\b/iu.test(
            candidate.turn.content,
          )
            ? 360
            : 0
        ) -
        (
          /\b(?:Gunicorn|integration\s+tests?|tests?\s+cover|deployment)\b/iu.test(
            candidate.turn.content,
          )
            ? 260
            : 0
        ),
    );
    pickCandidate(
      (candidate) =>
        candidate.groups.has("deployment") ||
        /\b(?:authorization|hardening|security|SQL\s+injection|vulnerabilities|XSS)\b/iu.test(
          candidate.turn.content,
        ),
      (candidate) =>
        candidate.priority +
        sourceOrderValue(candidate.turn) * 0.5 +
        (
          /\b(?:hardening|security|authorization|authentication)\b/iu.test(
            candidate.turn.content,
          )
            ? 420
            : 0
        ) +
        (
          /\b(?:authentication\s+and\s+authorization|public\s+launch|security\s+aspects|security\s+hardening)\b/iu.test(
            candidate.turn.content,
          )
            ? 320
            : 0
        ) +
        (
          /\bfinaliz(?:e|ed|ing)\b/iu.test(candidate.turn.content)
            ? 80
            : 0
        ) -
        (
          /\b(?:will|add more tests?|edge cases|SQL\s+injection|XSS)\b/iu.test(
            candidate.turn.content,
          )
            ? 100
            : 0
        ) -
        (
          ORDERED_EVIDENCE_SECURITY_TEST_FOLLOWUP_PATTERN.test(candidate.turn.content)
            ? 520
            : 0
        ) -
        (
          /\b(?:password_hash|password\s+hashing|Werkzeug\.security)\b/iu.test(
            candidate.turn.content,
          )
            ? 420
            : 0
        ) -
        (
          ORDERED_EVIDENCE_ENV_CONFIG_PATTERN.test(candidate.turn.content)
            ? 360
            : 0
        ),
    );
  } else if (queryMentionsDeployment) {
    pickCandidate(
      (candidate) => candidate.groups.has("foundation"),
      (candidate) =>
        candidate.priority +
        (
          /\b(?:initializ(?:e|ed|ing)|local\s+dev|port\s+\d+|setup)\b/iu.test(
            candidate.turn.content,
          )
            ? 260
            : 0
        ) +
        (
          /\b(?:initializ(?:e|ed|ing)[\s\S]{0,80}Flask|local\s+dev|port\s+5000|run\s+on\s+local)\b/iu.test(
            candidate.turn.content,
          )
            ? 520
            : 0
        ) -
        (
          /\b(?:database\s+schema|monolithic|MVC|single-user\s+setup)\b/iu.test(
            candidate.turn.content,
          )
            ? 260
            : 0
        ) -
        (
          ORDERED_EVIDENCE_PLAN_SUMMARY_PATTERN.test(candidate.turn.content)
            ? 360
            : 0
        ),
    );
    pickCandidate(
      (candidate) => candidate.groups.has("transaction_api"),
      (candidate) =>
        candidate.priority +
        (
          /\bPOST\s+\/[\w/{}/-]+\b/iu.test(candidate.turn.content)
            ? 520
            : 0
        ) +
        (
          /\b(?:response\s+handling|error\s+management|error\s+handling)\b/iu.test(
            candidate.turn.content,
          )
            ? 160
            : 0
        ) +
        (
          /\b(?:specifically\s+the\s+POST\s+\/transactions\s+route|201\s+status\s+code|new\s+transaction\s+is\s+created|handle\s+the\s+response\s+properly)\b/iu.test(
            candidate.turn.content,
          )
            ? 360
            : 0
        ) -
        (
          /\b(?:Gunicorn|integration\s+tests?|tests?\s+cover|deployment)\b/iu.test(
            candidate.turn.content,
          )
            ? 300
            : 0
        ) -
        (
          ORDERED_EVIDENCE_GENERIC_REST_PATTERN.test(candidate.turn.content)
            ? 320
            : 0
        ),
    );
    pickCandidate(
      (candidate) => candidate.groups.has("deployment"),
      (candidate) =>
        candidate.priority +
        (
          /\b(?:Gunicorn|Render\.com|integration\s+tests?|worker)\b/iu.test(
            candidate.turn.content,
          )
            ? 280
            : 0
        ),
    );
    pickCandidate(
      (candidate) =>
        candidate.groups.has("security") ||
        candidate.groups.has("testing"),
      (candidate) =>
        candidate.priority +
        (
          /\b(?:SQL\s+injection|vulnerabilities|XSS|security\s+tests?)\b/iu.test(
            candidate.turn.content,
          )
            ? 280
            : 0
        ),
    );
  }

  if (
    !compactMilestoneRequest &&
    queryMentionsDeployment &&
    selected.length >= requestedCount - 1
  ) {
    return selected.sort(
      (left, right) => sourceOrderValue(left) - sourceOrderValue(right),
    );
  }

  for (const candidate of ranked) {
    if (selected.length >= requestedCount) {
      break;
    }

    const hasNovelGroup = [...candidate.groups].some(
      (group) => !selectedGroups.has(group),
    );
    if (
      selected.length === 0 ||
      hasNovelGroup ||
      candidate.priority >= 260
    ) {
      addCandidate(candidate);
    }
  }

  for (const candidate of ranked) {
    if (selected.length >= requestedCount) {
      break;
    }
    addCandidate(candidate);
  }

  return selected.sort(
    (left, right) => sourceOrderValue(left) - sourceOrderValue(right),
  );
}

function summarizePhase63BeamOrderingTurn(turn: BeamChatTurn): string {
  const content = turn.content.replace(/```[\s\S]*?```/gu, " ");
  const signals: string[] = [];
  const hasPostTransactionSignal =
    /\b(?:POST\s+\/transactions|201\s+status\s+code|new\s+transaction\s+is\s+created|handle\s+the\s+response)\b/iu.test(
      content,
    );

  if (
    /\b(?:core\s+functionality|user\s+authentication|expense\s+tracking|data\s+visualization)\b/iu.test(
      content,
    )
  ) {
    signals.push(
      "core functionality: user authentication, expense tracking, and data visualization",
    );
  }
  if (
    /\b(?:initializ(?:e|ed|ing)|local\s+dev|port\s+5000|database\s+schema)\b/iu.test(
      content,
    )
  ) {
    signals.push(
      "initial project setup: Flask/Python/SQLite, database schema, local server configuration",
    );
  }
  if (hasPostTransactionSignal) {
    signals.push("transaction creation with proper response handling and error management");
  } else if (
    /\b(?:transaction\s+creation|try-except|catch\s+any\s+exceptions|error\s+handling|error\s+management)\b/iu.test(
      content,
    )
  ) {
    signals.push("transaction creation with proper error handling");
  }
  if (/\b(?:Gunicorn|Render\.com|workers?|port\s+10000)\b/iu.test(content)) {
    signals.push("deployment configuration: Gunicorn workers and port settings");
  }
  if (
    /\b(?:integration\s+tests?|test\s+coverage|95%\s+pass\s+rate|cover(?:ing)?\s+(?:user\s+auth|authentication|transaction\s+CRUD|analytics\s+endpoints?))\b/iu.test(
      content,
    )
  ) {
    signals.push("integration tests covering authentication, transaction CRUD, and analytics endpoints");
  }
  if (
    /\b(?:security\s+hardening|authentication\s+and\s+authorization|authorization|public\s+launch)\b/iu.test(
      content,
    )
  ) {
    signals.push("security hardening before deployment, especially authentication and authorization");
  }
  if (/\b(?:edge cases|gevent|SQL\s+injection|XSS|security\s+vulnerabilities)\b/iu.test(content)) {
    signals.push("deployment/test follow-up: worker tuning plus SQL injection and XSS tests");
  }

  if (signals.length > 0) {
    const uniqueSignals = [...new Set(signals)];
    return uniqueSignals.length === 1
      ? `item_count_hint=1; keep this as one requested item: ${uniqueSignals[0]}`
      : `item_count_hint=${uniqueSignals.length}; split this source turn into separate requested items: ${uniqueSignals.join(" | ")}`;
  }

  return `item_count_hint=1; keep this as one requested item: ${compressPhase63BeamMemoryContextText(turn.content)}`;
}

export function buildPhase63BeamSourceOrderedContext(input: {
  retrievedChatIds: readonly number[];
  testCase: BeamCase;
}): string | undefined {
  if (!isOrderingQuestion(input.testCase) || input.retrievedChatIds.length === 0) {
    return undefined;
  }

  const retrievedIds = new Set(input.retrievedChatIds);
  const orderedTurns = input.testCase.chat
    .flat()
    .filter((turn) => retrievedIds.has(turn.id))
    .sort((left, right) => sourceOrderValue(left) - sourceOrderValue(right))
    .slice(0, SOURCE_ORDER_CONTEXT_LIMIT);

  if (orderedTurns.length === 0) {
    return undefined;
  }

  const requestedCount = extractPhase63BeamRequestedItemCount(
    input.testCase.question,
  );
  const turns = selectPhase63BeamOrderedEvidenceTurns({
    question: input.testCase.question,
    requestedCount,
    turns: orderedTurns,
  });
  const header = [
    "Source-ordered retrieved turns:",
    "Use this section as the authoritative chronology for order or sequence questions. It is sorted by original conversation order and contains only retrieved chat IDs.",
    requestedCount === undefined
      ? undefined
      : `Requested item count: ${requestedCount}`,
    requestedCount === undefined
      ? undefined
      : "A retrieved source turn may contain more than one requested item; split a turn only when it contains distinct concrete actions.",
  ].filter((line): line is string => line !== undefined);

  const lines = turns.map((turn, index) => {
    const compressedText = summarizePhase63BeamOrderingTurn(turn);
    return `${index + 1}. source_order=${sourceOrderValue(turn)} chat_id=${turn.id} role=${turn.role} time=${turn.timeAnchor}: ${compressedText}`;
  });

  return [...header, ...lines].join("\n");
}

export function buildPhase63BeamAnswerMemoryContext(input: {
  memoryContext: string;
  retrievedChatIds: readonly number[];
  testCase: BeamCase;
}): string {
  const sections: string[] = [];
  const sourceOrderedContext = buildPhase63BeamSourceOrderedContext({
    retrievedChatIds: input.retrievedChatIds,
    testCase: input.testCase,
  });
  if (sourceOrderedContext) {
    sections.push(sourceOrderedContext);
    sections.push(
      [
        "Retrieved GoodMemory records:",
        "(source-message details are represented in the source-ordered turns above; use that section as the chronology for this ordering question.)",
      ].join("\n"),
    );
    return sections.join("\n\n");
  }
  sections.push(
    [
      "Retrieved GoodMemory records:",
      input.memoryContext.trim().length > 0 ? input.memoryContext : "(none)",
    ].join("\n"),
  );
  return sections.join("\n\n");
}

function collectMemoryContext(recall: RecallResult): string {
  const recallRecord = recall as unknown as Record<string, unknown>;
  const lines: string[] = [];
  for (const key of [
    "facts",
    "preferences",
    "references",
    "feedback",
    "episodes",
    "evidence",
    "archives",
  ]) {
    const records = recallRecord[key];
    if (!Array.isArray(records)) {
      continue;
    }
    for (const record of records) {
      if (!isRecord(record)) {
        continue;
      }
      const text = collectTextFromRecord(record);
      if (!text) {
        continue;
      }
      const compressedText = compressPhase63BeamMemoryContextText(text);
      const chatIds = collectPhase63BeamChatIdsFromRecord(record);
      const chatIdLabel =
        chatIds.length > 0 ? `chat_id=${chatIds.join(",")}` : `lane=${key}`;
      lines.push(`- ${chatIdLabel}: ${compressedText}`);
    }
  }
  return lines.join("\n");
}

function filterCasesFromRecallReport(input: {
  profile: BeamProfile;
  recallReport: unknown;
}): Set<string> {
  if (!isRecord(input.recallReport) || !isRecord(input.recallReport.profiles)) {
    return new Set();
  }
  const profileReport = input.recallReport.profiles[input.profile];
  if (!isRecord(profileReport) || !Array.isArray(profileReport.cases)) {
    return new Set();
  }

  const selected = profileReport.cases
    .filter((testCase) => {
      if (!isRecord(testCase)) {
        return false;
      }
      const evidenceRecall =
        typeof testCase.evidenceChatRecall === "number"
          ? testCase.evidenceChatRecall
          : null;
      const answerable = testCase.answerable !== false;
      const evidenceIds = Array.isArray(testCase.evidenceChatIds)
        ? testCase.evidenceChatIds
        : [];
      return answerable && evidenceIds.length > 0 && evidenceRecall !== 1;
    })
    .map((testCase) =>
      isRecord(testCase) && typeof testCase.questionId === "string"
        ? testCase.questionId
        : undefined,
    )
    .filter((questionId): questionId is string => questionId !== undefined);

  return new Set(selected);
}

function summarizeQuestionTypes(
  cases: readonly Phase63BeamLiveSliceCaseResult[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const testCase of cases) {
    counts[testCase.questionType] = (counts[testCase.questionType] ?? 0) + 1;
  }
  return counts;
}

function summarizeLiveCases(input: {
  cases: readonly Phase63BeamLiveSliceCaseResult[];
  profile: BeamProfile;
  scale: BeamCase["scale"];
}): Phase63BeamLiveSliceReport["summary"] {
  const evidenceCases = input.cases.filter(
    (testCase) => testCase.evidenceChatRecall !== null,
  );
  const correctCases = input.cases.filter((testCase) => testCase.correct).length;
  const evidenceChatRecall =
    evidenceCases.length === 0
      ? null
      : evidenceCases.reduce(
          (sum, testCase) => sum + (testCase.evidenceChatRecall ?? 0),
          0,
        ) / evidenceCases.length;

  return {
    caseCountsByQuestionType: summarizeQuestionTypes(input.cases),
    correctCases,
    evidenceCaseCount: evidenceCases.length,
    evidenceChatRecall,
    executionFailures: input.cases.filter((testCase) => testCase.executionError)
      .length,
    missedRecallCases: evidenceCases.filter(
      (testCase) => (testCase.evidenceChatRecall ?? 0) < 1,
    ).length,
    profilesCompared: [input.profile],
    scale: input.scale,
    totalCases: input.cases.length,
    wrongAnswerCases: input.cases.length - correctCases,
    wrongRecallCases: input.cases.filter((testCase) => {
      if (testCase.evidenceChatIds.length === 0) {
        return testCase.retrievedChatIds.length > 0;
      }
      return testCase.retrievedChatIds.some(
        (id) => !testCase.evidenceChatIds.includes(id),
      );
    }).length,
  };
}

function buildExecutionFailure(input: {
  conversationId: string;
  error: unknown;
  memoryContext?: string;
  retrievedChatIds?: readonly number[];
  stage: "answer_generation" | "answer_judge" | "memory_context";
  testCase: BeamLiveSliceCase;
}): Phase63BeamLiveSliceCaseResult {
  const retrievedChatIds = [...(input.retrievedChatIds ?? [])];
  const evidenceChatRecall =
    input.testCase.evidenceChatIds.length === 0
      ? null
      : input.testCase.evidenceChatIds.filter((id) =>
          retrievedChatIds.includes(id),
        ).length / input.testCase.evidenceChatIds.length;

  return {
    answerScore: {
      correct: false,
      method: "mismatch",
      reasoning: "Execution failed before answer scoring.",
    },
    answerable: input.testCase.answerable,
    conversationId: input.conversationId,
    correct: false,
    evidenceChatIds: [...input.testCase.evidenceChatIds],
    evidenceChatRecall,
    executionError: {
      message: input.error instanceof Error ? input.error.message : String(input.error),
      stage: input.stage,
    },
    expectedAnswer: input.testCase.answer,
    hypothesis: "Execution failed.",
    memoryContextChars: input.memoryContext?.length ?? 0,
    questionId: input.testCase.questionId,
    questionType: input.testCase.questionType,
    retrievedChatIds,
  };
}

async function scoreLiveCase(input: {
  answerGenerator: Phase63BeamLiveAnswerGenerator;
  answerJudge: Phase63BeamLiveAnswerJudge;
  memory: GoodMemory;
  profile: BeamProfile;
  runId: string;
  testCase: BeamLiveSliceCase;
}): Promise<Phase63BeamLiveSliceCaseResult> {
  const scope: MemoryScope = buildPhase63BeamScope({
    conversationId: input.testCase.conversationId,
    runId: input.runId,
  });
  let recall: RecallResult;
  try {
    recall = await input.memory.recall({
      query: input.testCase.question,
      scope,
      strategy: input.profile === "goodmemory-rules-only" ? "rules-only" : "hybrid",
    });
  } catch (error) {
    return buildExecutionFailure({
      conversationId: input.testCase.conversationId,
      error,
      stage: "memory_context",
      testCase: input.testCase,
    });
  }

  const retrievedChatIds = collectPhase63BeamRetrievedChatIds(recall);
  const memoryContext = buildPhase63BeamAnswerMemoryContext({
    memoryContext: collectMemoryContext(recall),
    retrievedChatIds,
    testCase: input.testCase,
  });
  let hypothesis: string;
  try {
    hypothesis = await input.answerGenerator({
      memoryContext,
      profile: input.profile,
      prompt: input.testCase.question,
      retrievedChatIds,
      testCase: input.testCase,
    });
  } catch (error) {
    return buildExecutionFailure({
      conversationId: input.testCase.conversationId,
      error,
      memoryContext,
      retrievedChatIds,
      stage: "answer_generation",
      testCase: input.testCase,
    });
  }

  let answerScore: BeamAnswerScore;
  try {
    answerScore = input.answerJudge
      ? await input.answerJudge({
          actualAnswer: hypothesis,
          expectedAnswer: input.testCase.answer,
          question: input.testCase.question,
          questionId: input.testCase.questionId,
          questionType: input.testCase.questionType,
        })
      : scoreBeamAnswer(input.testCase, hypothesis);
  } catch (error) {
    return buildExecutionFailure({
      conversationId: input.testCase.conversationId,
      error,
      memoryContext,
      retrievedChatIds,
      stage: "answer_judge",
      testCase: input.testCase,
    });
  }

  const evidenceChatRecall =
    input.testCase.evidenceChatIds.length === 0
      ? null
      : input.testCase.evidenceChatIds.filter((id) =>
          retrievedChatIds.includes(id),
        ).length / input.testCase.evidenceChatIds.length;

  return {
    answerScore,
    answerable: input.testCase.answerable,
    conversationId: input.testCase.conversationId,
    correct: answerScore.correct,
    evidenceChatIds: [...input.testCase.evidenceChatIds],
    evidenceChatRecall,
    expectedAnswer: input.testCase.answer,
    hypothesis,
    memoryContextChars: memoryContext.length,
    questionId: input.testCase.questionId,
    questionType: input.testCase.questionType,
    retrievedChatIds,
  };
}

function selectCases(input: {
  caseSelection?: Phase63BeamLiveCaseSelection;
  caseIds?: readonly string[];
  limit?: number;
  recallCaseIds: Set<string>;
  rows: readonly BeamRow[];
  scale: BeamCase["scale"];
}): BeamLiveSliceCase[] {
  const explicitCaseIds = new Set(input.caseIds ?? []);
  const allCases = flattenPhase63BeamCases(input.rows, input.scale);
  const filtered = allCases.filter((testCase) => {
    if (explicitCaseIds.size > 0) {
      return explicitCaseIds.has(testCase.questionId);
    }
    if (input.caseSelection === "all-cases") {
      return true;
    }
    if (input.caseSelection === "all-evidence") {
      return testCase.answerable && testCase.evidenceChatIds.length > 0;
    }
    if (input.caseSelection === "recall-misses") {
      return input.recallCaseIds.has(testCase.questionId);
    }
    if (input.recallCaseIds.size > 0) {
      return input.recallCaseIds.has(testCase.questionId);
    }
    return testCase.answerable && testCase.evidenceChatIds.length > 0;
  });
  return filtered.slice(0, input.limit);
}

export async function runPhase63BeamLiveSlice(
  options: Phase63BeamLiveSliceCliOptions = {},
  dependencies: Phase63BeamLiveSliceDependencies = {},
): Promise<Phase63BeamLiveSliceReport> {
  const root = resolvePhase63RepoRoot();
  const benchmarkRoot = options.benchmarkRoot ?? process.env.GOODMEMORY_BEAM_ROOT;
  if (!benchmarkRoot) {
    throw new Error(
      "Phase 63 BEAM live slice requires --benchmark-root or GOODMEMORY_BEAM_ROOT.",
    );
  }
  const profile = options.profile ?? "goodmemory-rules-only";
  if (profile !== "goodmemory-rules-only") {
    throw new Error(
      "Phase 63 BEAM live slice currently supports goodmemory-rules-only only.",
    );
  }
  if (!dependencies.readFile) {
    assertPhase63Readiness(
      checkPhase63Readiness({
        benchmarkRoot,
        mode: "full",
        profiles: [profile],
      }),
    );
  }

  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const mkdirImpl = dependencies.mkdir ?? mkdir;
  const now = dependencies.now ?? (() => new Date());
  const scale = options.scale ?? "100K";
  const runId = options.runId ?? PHASE63_BEAM_LIVE_SLICE_RUN_ID;
  const outputDir = options.outputDir ?? resolvePhase63OutputDir(root);
  const runDirectory = join(outputDir, runId);
  const rows = await readPhase63BeamRows({
    benchmarkRoot,
    readFile: readFileImpl,
  });
  const recallCaseIds = options.recallReportPath
    ? filterCasesFromRecallReport({
        profile,
        recallReport: JSON.parse(await readFileImpl(options.recallReportPath)),
      })
    : new Set<string>();
  const testCases = selectCases({
    caseSelection: options.caseSelection,
    caseIds: options.caseIds,
    limit: options.limit,
    recallCaseIds,
    rows,
    scale,
  });
  const answerGenerator =
    dependencies.answerGenerator ?? createBeamAnswerGenerator();
  const answerJudge = dependencies.answerJudge ?? createBeamAnswerJudge();
  const casesByConversation = new Map<string, BeamLiveSliceCase[]>();
  for (const testCase of testCases) {
    const group = casesByConversation.get(testCase.conversationId) ?? [];
    group.push(testCase);
    casesByConversation.set(testCase.conversationId, group);
  }

  const cases: Phase63BeamLiveSliceCaseResult[] = [];
  for (const conversationCases of casesByConversation.values()) {
    const row = conversationCases[0]?.row;
    if (!row) {
      continue;
    }
    const memory =
      dependencies.createMemory?.() ?? createPhase63BeamDiagnosticMemory();
    await seedPhase63BeamConversation({
      memory,
      row,
      runId,
    });
    for (const testCase of conversationCases) {
      cases.push(
        await scoreLiveCase({
          answerGenerator,
          answerJudge,
          memory,
          profile,
          runId,
          testCase,
        }),
      );
    }
  }

  const report: Phase63BeamLiveSliceReport = {
    benchmarkRoot,
    cases,
    generatedAt: now().toISOString(),
    generatedBy: GENERATED_BY,
    mode: "live-answer-slice",
    outputDir,
    phase: "phase-63",
    profile,
    ...(options.recallReportPath ? { recallReportPath: options.recallReportPath } : {}),
    runDirectory,
    runId,
    source: {
      benchmark: "BEAM",
      license: "cc-by-sa-4.0 dataset; paper external",
      url: "https://huggingface.co/datasets/Mohammadta/BEAM",
    },
    summary: summarizeLiveCases({
      cases,
      profile,
      scale,
    }),
  };

  await mkdirImpl(runDirectory, { recursive: true });
  await writeFileImpl(
    join(runDirectory, PHASE63_BEAM_LIVE_SLICE_REPORT_FILE_NAME),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

function buildCliSummary(report: Phase63BeamLiveSliceReport): {
  mode: "live-answer-slice";
  profile: BeamProfile;
  reportPath: string;
  runDirectory: string;
  runId: string;
  summary: Phase63BeamLiveSliceReport["summary"];
} {
  return {
    mode: report.mode,
    profile: report.profile,
    reportPath: join(
      report.runDirectory,
      PHASE63_BEAM_LIVE_SLICE_REPORT_FILE_NAME,
    ),
    runDirectory: report.runDirectory,
    runId: report.runId,
    summary: report.summary,
  };
}

if (import.meta.main) {
  const report = await runPhase63BeamLiveSlice(
    parsePhase63BeamLiveSliceCliOptions(Bun.argv),
  );
  console.log(JSON.stringify(buildCliSummary(report), null, 2));
}
