import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInternalGoodMemory } from "../api/createGoodMemory";
import { readGoodMemoryEvalSupport } from "../api/evalSupport";
import type { GoodMemory } from "../api/contracts";
import type { MemoryScope } from "../domain/scope";
import type {
  BehavioralFirstAction,
  BehavioralOutcomeRecordInput,
} from "../evolution/behavioralTelemetry";
import {
  behavioralFirstActionsEqual,
  isToolOutcomeExperience,
} from "../evolution/behavioralTelemetry";
import {
  extractFirstBehavioralTraceAction,
  type HostBehavioralTrace,
  toBehavioralFirstAction,
  validateBehavioralTrace,
} from "../host/behavioralTrace";
import { recordBehavioralTrace } from "../host/behavioralTraceBridge";

export type BehavioralAdaptationParadigm =
  | "conditioning"
  | "priming"
  | "procedural";

export type BehavioralAdaptationProfile =
  | "distilled-feedback"
  | "outcome-telemetry"
  | "raw-experience";

export type PrimingBranchName = "control" | "experimental";

export interface BehavioralAdaptationMessage {
  content: string;
  role: "assistant" | "system" | "user";
}

export interface BehavioralConstraintCheck {
  expectedLineCount?: number;
  forbiddenPhrases?: string[];
  type: "no_prompt_quote_reuse" | "output_shape" | "task_format_compliance";
}

export interface PrimingBranchFixture {
  constraint_checks: BehavioralConstraintCheck[];
  interference_phase: BehavioralAdaptationMessage[];
  learning_phase: BehavioralAdaptationMessage[];
  priming_keywords: string[];
  task_name: string;
  test_probe: BehavioralAdaptationMessage;
}

export interface BehavioralOutcomeFixture extends BehavioralOutcomeRecordInput {}

export interface ProceduralOrConditioningFixture {
  behavioral_outcomes?: BehavioralOutcomeFixture[];
  behavioral_trace_replays?: HostBehavioralTrace[];
  case_id: string;
  expected_first_action: BehavioralFirstAction;
  feedback_signal: string;
  forbidden_first_action: BehavioralFirstAction;
  generalization_case?: boolean;
  interference_phase: BehavioralAdaptationMessage[];
  learning_phase: BehavioralAdaptationMessage[];
  paradigm: "conditioning" | "procedural";
  task_name: string;
  test_probe: BehavioralAdaptationMessage;
}

export interface PrimingFixture {
  case_id: string;
  control: PrimingBranchFixture;
  experimental: PrimingBranchFixture;
  feedback_signal: string;
  paradigm: "priming";
  task_name: string;
}

export type BehavioralAdaptationFixture =
  | PrimingFixture
  | ProceduralOrConditioningFixture;

export interface BehavioralGeneratedAnswer {
  answer: string;
  first_action?: BehavioralFirstAction;
  trace?: HostBehavioralTrace;
}

export interface BehavioralOutcomeTelemetryLineage {
  acceptedPromotionIds: string[];
  activeValidatedPatternIds: string[];
  activeValidatedPatternRules: string[];
  evidenceIds: string[];
  experienceIds: string[];
  proposalIds: string[];
}

export interface BehavioralLayerD {
  constraint_violation_rate: number;
  failure_avoidance_rate: number;
  first_attempt_policy_adherence: number;
  inhibition_success_rate: number;
  priming_delta: number;
  procedure_generalization_rate: number;
}

export interface BehavioralCaseResult {
  baselineAnswer: string;
  baselineTrace?: HostBehavioralTrace;
  baselineTraceParseError?: string;
  blocking: boolean;
  branch?: PrimingBranchName;
  caseId: string;
  constraintChecks: number;
  constraintViolations: string[];
  explicitRecallLeak: boolean;
  firstAction?: BehavioralFirstAction;
  firstActionSource?: "missing" | "self_reported" | "trace";
  firstActionTraceParseError?: string;
  goodmemoryTrace?: HostBehavioralTrace;
  goodmemoryTraceParseError?: string;
  goodmemoryAnswer: string;
  memoryContext: string;
  outcomeTelemetryLineage?: BehavioralOutcomeTelemetryLineage;
  paradigm: BehavioralAdaptationParadigm;
  passed: boolean;
  primingScore?: number;
  profile: BehavioralAdaptationProfile;
  scoreReason: string;
  taskName: string;
}

export interface BehavioralBlockingSummary {
  conditioning: {
    failedCases: string[];
    passedCases: number;
    totalCases: number;
  };
  procedural: {
    failedCases: string[];
    passedCases: number;
    totalCases: number;
  };
}

export interface BehavioralProfileSummary {
  behavioralRegressionCases: string[];
  blockingSummary: BehavioralBlockingSummary;
  cases: BehavioralCaseResult[];
  executionFailures: number;
  explicitRecallLeakCount: number;
  layer_d: BehavioralLayerD;
  totalCases: number;
}

export interface BehavioralAdaptationEvidenceContract {
  phase30?: {
    fixtureDir: string;
    hostRuntime: {
      modelTransport: "codex-exec-json";
      structuredFirstAction: "disabled";
    };
    providerBackedStorage: {
      envVar: "GOODMEMORY_TEST_POSTGRES_URL";
      memoryStackPreflight: "passed";
      provider: "postgres";
      storageBootstrap: "passed";
    };
    requireTraceForStructuredCases: true;
    runner: "scripts/run-phase-30-live-memory.ts";
    scopePrefix: "phase30-live";
  };
}

export interface BehavioralAdaptationReport {
  evidenceContract?: BehavioralAdaptationEvidenceContract;
  generatedAt: string;
  generatedBy: string;
  mode: "fallback" | "live-memory";
  outputDir: string;
  profiles: Record<BehavioralAdaptationProfile, BehavioralProfileSummary>;
  runDirectory: string;
  runId: string;
  source: {
    benchmark: "ImplicitMemBench";
    license: "CC BY 4.0";
    url: string;
  };
  summary: Omit<BehavioralProfileSummary, "cases">;
}

export type BehavioralAnswerGenerator = (input: {
  branch?: PrimingBranchName;
  fixture: BehavioralAdaptationFixture;
  memoryContext: string;
  mode: "baseline" | "goodmemory";
  profile: BehavioralAdaptationProfile;
  prompt: string;
}) => Promise<BehavioralGeneratedAnswer>;

export interface BehavioralAdaptationMemoryHandle {
  cleanup?: () => Promise<void>;
  memory: GoodMemory;
}

export type BehavioralAdaptationMemoryFactory = (input: {
  fixture: BehavioralAdaptationFixture;
  profile: BehavioralAdaptationProfile;
  scope: MemoryScope;
}) => GoodMemory | BehavioralAdaptationMemoryHandle;

export interface RunBehavioralAdaptationEvaluationOptions {
  answerGenerator?: BehavioralAnswerGenerator;
  createMemory?: BehavioralAdaptationMemoryFactory;
  evidenceContract?: BehavioralAdaptationEvidenceContract;
  fixtureDir: string;
  generatedBy: string;
  mode: "fallback" | "live-memory";
  outputDir: string;
  requireTraceForStructuredCases?: boolean;
  runId?: string;
  scopePrefix?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }

  return value;
}

function validateMessage(value: unknown, path: string): BehavioralAdaptationMessage {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  const role = assertString(value.role, `${path}.role`);
  if (role !== "assistant" && role !== "system" && role !== "user") {
    throw new Error(`${path}.role must be assistant, system, or user`);
  }

  return {
    role,
    content: assertString(value.content, `${path}.content`),
  };
}

function validateMessageArray(
  value: unknown,
  path: string,
): BehavioralAdaptationMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a non-empty message array`);
  }

  return value.map((entry, index) => validateMessage(entry, `${path}[${index}]`));
}

function validateFirstAction(value: unknown, path: string): BehavioralFirstAction {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  const kind = assertString(value.kind, `${path}.kind`);
  if (kind !== "command" && kind !== "tool_call" && kind !== "warning") {
    throw new Error(`${path}.kind must be command, tool_call, or warning`);
  }

  const name = assertString(value.name, `${path}.name`);
  const args = value.args;
  if (args !== undefined && (!Array.isArray(args) || args.some((item) => typeof item !== "string"))) {
    throw new Error(`${path}.args must be a string array`);
  }
  const raw = value.raw;
  if (raw !== undefined && typeof raw !== "string") {
    throw new Error(`${path}.raw must be a string`);
  }

  return {
    kind,
    name,
    ...(args ? { args: [...args] } : {}),
    ...(typeof raw === "string" && raw.trim().length > 0 ? { raw } : {}),
  };
}

function validateConstraintCheck(value: unknown, path: string): BehavioralConstraintCheck {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  const type = assertString(value.type, `${path}.type`);
  if (
    type !== "output_shape" &&
    type !== "no_prompt_quote_reuse" &&
    type !== "task_format_compliance"
  ) {
    throw new Error(`${path}.type must be output_shape, no_prompt_quote_reuse, or task_format_compliance`);
  }

  const expectedLineCount = value.expectedLineCount;
  if (expectedLineCount !== undefined && typeof expectedLineCount !== "number") {
    throw new Error(`${path}.expectedLineCount must be a number`);
  }
  const forbiddenPhrases = value.forbiddenPhrases;
  if (
    forbiddenPhrases !== undefined &&
    (!Array.isArray(forbiddenPhrases) ||
      forbiddenPhrases.some((item) => typeof item !== "string"))
  ) {
    throw new Error(`${path}.forbiddenPhrases must be a string array`);
  }

  return {
    type,
    ...(typeof expectedLineCount === "number" ? { expectedLineCount } : {}),
    ...(forbiddenPhrases ? { forbiddenPhrases: [...forbiddenPhrases] } : {}),
  };
}

function validateBehavioralOutcomeFixture(
  value: unknown,
  path: string,
): BehavioralOutcomeFixture {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  return {
    cue: assertString(value.cue, `${path}.cue`),
    evidenceExcerpt:
      typeof value.evidenceExcerpt === "string" ? value.evidenceExcerpt : undefined,
    failureClass: assertString(value.failureClass, `${path}.failureClass`),
    firstAction: validateFirstAction(value.firstAction, `${path}.firstAction`),
    modelInfluence:
      value.modelInfluence === "llm-assisted" ||
      value.modelInfluence === "mixed" ||
      value.modelInfluence === "none"
        ? value.modelInfluence
        : "rules-only",
    saferAlternative: value.saferAlternative
      ? validateFirstAction(value.saferAlternative, `${path}.saferAlternative`)
      : undefined,
  };
}

function validatePrimingBranch(value: unknown, path: string): PrimingBranchFixture {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  const checks = value.constraint_checks;
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new Error(`${path}.constraint_checks must be a non-empty array`);
  }
  const primingKeywords = value.priming_keywords;
  if (
    !Array.isArray(primingKeywords) ||
    primingKeywords.length === 0 ||
    primingKeywords.some((item) => typeof item !== "string")
  ) {
    throw new Error(`${path}.priming_keywords must be a non-empty string array`);
  }

  return {
    constraint_checks: checks.map((check, index) =>
      validateConstraintCheck(check, `${path}.constraint_checks[${index}]`),
    ),
    interference_phase: validateMessageArray(
      value.interference_phase,
      `${path}.interference_phase`,
    ),
    learning_phase: validateMessageArray(value.learning_phase, `${path}.learning_phase`),
    priming_keywords: [...primingKeywords],
    task_name: assertString(value.task_name, `${path}.task_name`),
    test_probe: validateMessage(value.test_probe, `${path}.test_probe`),
  };
}

export function validateBehavioralAdaptationFixture(
  value: unknown,
  path = "fixture",
): BehavioralAdaptationFixture {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  const paradigm = assertString(value.paradigm, `${path}.paradigm`);
  if (paradigm === "priming") {
    return {
      case_id: assertString(value.case_id, `${path}.case_id`),
      feedback_signal: assertString(value.feedback_signal, `${path}.feedback_signal`),
      paradigm: "priming",
      task_name: assertString(value.task_name, `${path}.task_name`),
      experimental: validatePrimingBranch(value.experimental, `${path}.experimental`),
      control: validatePrimingBranch(value.control, `${path}.control`),
    };
  }

  if (paradigm !== "conditioning" && paradigm !== "procedural") {
    throw new Error(`${path}.paradigm must be procedural, conditioning, or priming`);
  }

  const behavioralOutcomes = value.behavioral_outcomes;
  if (
    behavioralOutcomes !== undefined &&
    (!Array.isArray(behavioralOutcomes) ||
      behavioralOutcomes.some((entry) => !isRecord(entry)))
  ) {
    throw new Error(`${path}.behavioral_outcomes must be an object array`);
  }
  const behavioralTraceReplays = value.behavioral_trace_replays;
  if (
    behavioralTraceReplays !== undefined &&
    (!Array.isArray(behavioralTraceReplays) ||
      behavioralTraceReplays.some((entry) => !isRecord(entry)))
  ) {
    throw new Error(`${path}.behavioral_trace_replays must be an object array`);
  }

  return {
    case_id: assertString(value.case_id, `${path}.case_id`),
    expected_first_action: validateFirstAction(
      value.expected_first_action,
      `${path}.expected_first_action`,
    ),
    feedback_signal: assertString(value.feedback_signal, `${path}.feedback_signal`),
    forbidden_first_action: validateFirstAction(
      value.forbidden_first_action,
      `${path}.forbidden_first_action`,
    ),
    generalization_case:
      typeof value.generalization_case === "boolean"
        ? value.generalization_case
        : undefined,
    interference_phase: validateMessageArray(
      value.interference_phase,
      `${path}.interference_phase`,
    ),
    learning_phase: validateMessageArray(value.learning_phase, `${path}.learning_phase`),
    paradigm,
    task_name: assertString(value.task_name, `${path}.task_name`),
    test_probe: validateMessage(value.test_probe, `${path}.test_probe`),
    behavioral_outcomes: behavioralOutcomes?.map((entry, index) =>
      validateBehavioralOutcomeFixture(
        entry,
        `${path}.behavioral_outcomes[${index}]`,
      ),
    ),
    behavioral_trace_replays: behavioralTraceReplays?.map((entry, index) =>
      validateBehavioralTrace(
        entry,
        `${path}.behavioral_trace_replays[${index}]`,
      ),
    ),
  };
}

export async function listBehavioralAdaptationFixtures(
  fixtureDir: string,
): Promise<BehavioralAdaptationFixture[]> {
  const entries = await readdir(fixtureDir, { withFileTypes: true });
  const fixtures: BehavioralAdaptationFixture[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const filePath = join(fixtureDir, entry.name);
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    const values = Array.isArray(parsed) ? parsed : [parsed];
    fixtures.push(
      ...values.map((value, index) =>
        validateBehavioralAdaptationFixture(value, `${entry.name}[${index}]`),
      ),
    );
  }

  return fixtures.sort((left, right) => left.case_id.localeCompare(right.case_id));
}

function createDefaultMemoryFactory(): BehavioralAdaptationMemoryFactory {
  return ({ scope }) => {
    const memory = createInternalGoodMemory(
      {
        storage: { provider: "memory" },
      },
      {
        behavioralOutcomeRecorder: true,
      },
    );

    return {
      memory,
      cleanup: async () => {
        await memory.deleteAllMemory({
          scope: {
            userId: scope.userId,
            workspaceId: scope.workspaceId,
          },
          includeRuntime: true,
        });
      },
    };
  };
}

function normalizeMemoryHandle(
  value: GoodMemory | BehavioralAdaptationMemoryHandle,
): BehavioralAdaptationMemoryHandle {
  return "memory" in value ? value : { memory: value };
}

function actionToAnswer(action: BehavioralFirstAction): string {
  if (action.raw) {
    return action.raw;
  }

  return action.args && action.args.length > 0
    ? `${action.name}(${action.args.join(", ")})`
    : action.name;
}

function createDefaultFallbackAnswerGenerator(): BehavioralAnswerGenerator {
  return async ({ branch, fixture, mode, profile }) => {
    if (fixture.paradigm === "priming") {
      if (mode === "baseline") {
        return {
          answer: "VectorNest\nSignalWeave\nCompressionGrid",
        };
      }

      if (branch === "experimental") {
        return {
          answer:
            profile === "raw-experience" || profile === "distilled-feedback"
              ? "EmberVault\nPressureFold\nBasaltThread"
              : "VectorNest\nSignalWeave\nCompressionGrid",
        };
      }

      return {
        answer: "VectorNest\nSignalWeave\nCompressionGrid",
      };
    }

    if (mode === "baseline") {
      return {
            answer: actionToAnswer(fixture.forbidden_first_action),
            first_action: fixture.forbidden_first_action,
            trace: {
              cue: fixture.task_name,
              hostKind: "codex",
              traceId: `baseline-${fixture.case_id}`,
          events: [
            {
              stepIndex: 0,
              actionKind: fixture.forbidden_first_action.kind,
              actionName: fixture.forbidden_first_action.name,
              ...(fixture.forbidden_first_action.args
                ? { args: fixture.forbidden_first_action.args }
                : {}),
              ...(fixture.forbidden_first_action.raw
                ? { raw: fixture.forbidden_first_action.raw }
                : {}),
              outcome: "failure",
            },
          ],
        },
      };
    }

    if (fixture.paradigm === "procedural") {
      return profile === "distilled-feedback"
        ? {
            answer: actionToAnswer(fixture.expected_first_action),
            first_action: fixture.expected_first_action,
            trace: {
              cue: fixture.task_name,
              hostKind: "codex",
              traceId: `${profile}-${fixture.case_id}`,
              events: [
                {
                  stepIndex: 0,
                  actionKind: fixture.expected_first_action.kind,
                  actionName: fixture.expected_first_action.name,
                  ...(fixture.expected_first_action.args
                    ? { args: fixture.expected_first_action.args }
                    : {}),
                  ...(fixture.expected_first_action.raw
                    ? { raw: fixture.expected_first_action.raw }
                    : {}),
                  outcome: "success",
                },
              ],
            },
          }
        : {
            answer: actionToAnswer(fixture.forbidden_first_action),
            first_action: fixture.forbidden_first_action,
            trace: {
              cue: fixture.task_name,
              hostKind: "codex",
              traceId: `${profile}-${fixture.case_id}`,
              events: [
                {
                  stepIndex: 0,
                  actionKind: fixture.forbidden_first_action.kind,
                  actionName: fixture.forbidden_first_action.name,
                  ...(fixture.forbidden_first_action.args
                    ? { args: fixture.forbidden_first_action.args }
                    : {}),
                  ...(fixture.forbidden_first_action.raw
                    ? { raw: fixture.forbidden_first_action.raw }
                    : {}),
                  outcome: "failure",
                },
              ],
            },
          };
    }

    return profile === "outcome-telemetry" || profile === "distilled-feedback"
      ? {
          answer: actionToAnswer(fixture.expected_first_action),
          first_action: fixture.expected_first_action,
          trace: {
            cue: fixture.task_name,
            hostKind: "codex",
            traceId: `${profile}-${fixture.case_id}`,
            events: [
              {
                stepIndex: 0,
                actionKind: fixture.expected_first_action.kind,
                actionName: fixture.expected_first_action.name,
                ...(fixture.expected_first_action.args
                  ? { args: fixture.expected_first_action.args }
                  : {}),
                ...(fixture.expected_first_action.raw
                  ? { raw: fixture.expected_first_action.raw }
                  : {}),
                outcome: "success",
              },
            ],
          },
        }
      : {
          answer: actionToAnswer(fixture.forbidden_first_action),
          first_action: fixture.forbidden_first_action,
          trace: {
            cue: fixture.task_name,
            hostKind: "codex",
            traceId: `${profile}-${fixture.case_id}`,
            events: [
              {
                stepIndex: 0,
                actionKind: fixture.forbidden_first_action.kind,
                actionName: fixture.forbidden_first_action.name,
                ...(fixture.forbidden_first_action.args
                  ? { args: fixture.forbidden_first_action.args }
                  : {}),
                ...(fixture.forbidden_first_action.raw
                  ? { raw: fixture.forbidden_first_action.raw }
                  : {}),
                outcome: "failure",
              },
            ],
          },
        };
  };
}

function resolveReportTrace(
  trace: HostBehavioralTrace | undefined,
  path: string,
): {
  parseError?: string;
  trace?: HostBehavioralTrace;
} {
  if (!trace) {
    return {};
  }

  try {
    return {
      trace: validateBehavioralTrace(trace, path),
    };
  } catch (error) {
    return {
      parseError: error instanceof Error ? error.message : `${path} failed to validate`,
    };
  }
}

function resolveScoredFirstAction(
  generated: BehavioralGeneratedAnswer,
  options?: {
    requireTrace?: boolean;
  },
): {
  action?: BehavioralFirstAction;
  source: "missing" | "self_reported" | "trace";
  traceParseError?: string;
} {
  const traceResult = resolveReportTrace(generated.trace, "generated.trace");

  if (!traceResult.trace) {
    if (traceResult.parseError) {
      return {
        source: "missing",
        traceParseError: traceResult.parseError,
      };
    }

    if (options?.requireTrace) {
      return {
        source: "missing",
      };
    }

    return {
      action: generated.first_action,
      source: generated.first_action ? "self_reported" : "missing",
    };
  }

  const firstTraceEvent = extractFirstBehavioralTraceAction(traceResult.trace);

  return firstTraceEvent
    ? {
        action: toBehavioralFirstAction(firstTraceEvent),
        source: "trace",
      }
    : {
        source: "missing",
      };
}

function buildPrompt(input: {
  branch?: PrimingBranchName;
  fixture: BehavioralAdaptationFixture;
  memoryContext: string;
}): string {
  if (input.fixture.paradigm === "priming") {
    const branch = input.branch ?? "experimental";
    const fixture = input.fixture[branch];
    return [
      input.memoryContext ? `Memory context:\n${input.memoryContext}` : undefined,
      `Probe:\n${fixture.test_probe.content}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    input.memoryContext ? `Memory context:\n${input.memoryContext}` : undefined,
    `Probe:\n${input.fixture.test_probe.content}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildScope(
  fixture: BehavioralAdaptationFixture,
  profile: BehavioralAdaptationProfile,
  branch?: PrimingBranchName,
  scopePrefix = "behavioral-adaptation",
): MemoryScope {
  return {
    userId: `${scopePrefix}-${profile}-${fixture.case_id}`,
    workspaceId: branch
      ? `${scopePrefix}-${fixture.case_id}-${branch}`
      : `${scopePrefix}-${fixture.case_id}`,
  };
}

async function replayMessages(
  memory: GoodMemory,
  scope: MemoryScope,
  messages: BehavioralAdaptationMessage[],
): Promise<void> {
  await memory.remember({
    scope,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  });
}

function countExplicitRecallLeaks(answer: string): boolean {
  return /\b(memory|remember|earlier|previous|learned)\b/i.test(answer);
}

const WARNING_TOKEN_STOP_WORDS = new Set([
  "abort",
  "before",
  "caution",
  "proceeding",
  "request",
  "requires",
  "required",
  "stop",
  "warn",
  "warning",
]);

function normalizeWarningToken(token: string): string {
  if (token.startsWith("approv")) {
    return "approval";
  }
  if (token.startsWith("authori")) {
    return "authorization";
  }
  if (token.startsWith("confirm")) {
    return "approval";
  }
  if (token.startsWith("deploy")) {
    return "deploy";
  }
  if (token.startsWith("prod")) {
    return "production";
  }
  if (token.startsWith("releas")) {
    return "release";
  }

  return token;
}

function warningTokens(value: string): string[] {
  return [
    ...new Set(
      (value.toLowerCase().match(/[a-z0-9]+/gu) ?? [])
        .map(normalizeWarningToken)
        .filter((token) => token.length >= 4 && !WARNING_TOKEN_STOP_WORDS.has(token)),
    ),
  ];
}

const APPROVAL_NEGATION_TOKENS = new Set(["no", "not", "never"]);
const APPROVAL_REQUIREMENT_TOKENS = new Set([
  "necessary",
  "need",
  "needed",
  "needs",
  "require",
  "required",
  "requires",
  "requiring",
]);
const APPROVAL_SUBJECT_TOKENS = new Set([
  "deploy",
  "deployment",
  "production",
  "release",
]);

function approvalNegationTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\bisn['’]?t\b/gu, "is not")
    .replace(/\bwon['’]?t\b/gu, "will not")
    .replace(/\bdoesn['’]?t\b/gu, "does not")
    .replace(/\bdon['’]?t\b/gu, "do not")
    .replace(/\bcan['’]?t\b/gu, "can not")
    .match(/[a-z0-9]+/gu) ?? [];
}

function tokensContainNegatedRequirement(tokens: readonly string[]): boolean {
  return tokens.some((token, index) => {
    if (!APPROVAL_NEGATION_TOKENS.has(token)) {
      return false;
    }

    return tokens
      .slice(index + 1, index + 5)
      .some((candidate) => APPROVAL_REQUIREMENT_TOKENS.has(candidate));
  });
}

function tokensContainRequirementNoApproval(tokens: readonly string[]): boolean {
  return tokens.some((token, index) => {
    if (!APPROVAL_REQUIREMENT_TOKENS.has(token)) {
      return false;
    }

    return tokens.slice(index + 1, index + 4).includes("no");
  });
}

function tokensContainPermissiveWithoutApproval(tokens: readonly string[]): boolean {
  return tokens.some((token, index) => {
    if (token !== "without") {
      return false;
    }

    const before = tokens.slice(Math.max(0, index - 5), index);
    return (
      before.some((candidate) => candidate === "can" || candidate === "may") &&
      !before.some((candidate) => APPROVAL_NEGATION_TOKENS.has(candidate))
    );
  });
}

function warningTextNegatesApprovalRequirement(value: string): boolean {
  const tokens = approvalNegationTokens(value);

  return tokens.some((token, index) => {
    if (token !== "approval" && token !== "authorization") {
      return false;
    }

    const before = tokens.slice(Math.max(0, index - 5), index);
    const after = tokens.slice(index + 1, index + 5);

    return (
      before.slice(-3).some((candidate) => APPROVAL_NEGATION_TOKENS.has(candidate)) ||
      after.some((candidate) => candidate === "optional" || candidate === "unnecessary") ||
      tokensContainNegatedRequirement(after) ||
      tokensContainNegatedRequirement(before) ||
      tokensContainRequirementNoApproval(before) ||
      (before.some((candidate) => APPROVAL_SUBJECT_TOKENS.has(candidate)) &&
        tokensContainPermissiveWithoutApproval(before))
    );
  });
}

function warningTextMatchesExpected(input: {
  actualRaw: string;
  expectedRaw: string;
}): boolean {
  const actual = input.actualRaw.trim().replace(/\s+/gu, " ").toLowerCase();
  const expected = input.expectedRaw.trim().replace(/\s+/gu, " ").toLowerCase();
  if (actual === expected) {
    return true;
  }

  const actualTokens = new Set(warningTokens(actual));
  const expectedTokens = warningTokens(expected);
  if (expectedTokens.length === 0) {
    return false;
  }

  const expectedRequiresApproval =
    expectedTokens.includes("approval") || expectedTokens.includes("authorization");
  if (expectedRequiresApproval && warningTextNegatesApprovalRequirement(actual)) {
    return false;
  }

  const actualHasApproval =
    actualTokens.has("approval") || actualTokens.has("authorization");
  if (expectedRequiresApproval && !actualHasApproval) {
    return false;
  }

  const overlap = expectedTokens.filter((token) => actualTokens.has(token)).length;
  return overlap >= Math.min(2, expectedTokens.length);
}

export function behavioralFirstActionMatchesExpectedForScoring(
  actual: BehavioralFirstAction | undefined,
  expected: BehavioralFirstAction | undefined,
): boolean {
  if (!actual || !expected) {
    return actual === expected;
  }

  if (actual.kind === "warning" && expected.kind === "warning") {
    if (actual.name.toLowerCase() !== expected.name.toLowerCase()) {
      return false;
    }

    if (!expected.raw) {
      return true;
    }

    return Boolean(
      actual.raw &&
        warningTextMatchesExpected({
          actualRaw: actual.raw,
          expectedRaw: expected.raw,
        }),
    );
  }

  return behavioralFirstActionsEqual(actual, expected);
}

function lines(answer: string): string[] {
  return answer
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function scoreFirstActionCase(input: {
  actual?: BehavioralFirstAction;
  expected: BehavioralFirstAction;
  forbidden: BehavioralFirstAction;
  paradigm: "conditioning" | "procedural";
}): Pick<
  BehavioralCaseResult,
  "blocking" | "constraintChecks" | "constraintViolations" | "passed" | "scoreReason"
> {
  if (!input.actual) {
    return {
      blocking: true,
      passed: false,
      scoreReason: "missing_first_action",
      constraintChecks: 0,
      constraintViolations: [],
    };
  }

  if (behavioralFirstActionMatchesExpectedForScoring(input.actual, input.forbidden)) {
    return {
      blocking: true,
      passed: false,
      scoreReason: "first_action_matched_forbidden",
      constraintChecks: 0,
      constraintViolations: [],
    };
  }

  if (behavioralFirstActionMatchesExpectedForScoring(input.actual, input.expected)) {
    return {
      blocking: true,
      passed: true,
      scoreReason: "expected_first_action_matched",
      constraintChecks: 0,
      constraintViolations: [],
    };
  }

  return {
    blocking: true,
    passed: false,
    scoreReason: "expected_first_action_missing",
    constraintChecks: 0,
    constraintViolations: [],
  };
}

function scorePrimingAnswer(
  answer: string,
  fixture: PrimingBranchFixture,
): Pick<
  BehavioralCaseResult,
  "blocking" | "constraintChecks" | "constraintViolations" | "passed" | "primingScore" | "scoreReason"
> {
  const lowerAnswer = answer.toLowerCase();
  const keywordHits = fixture.priming_keywords.filter((keyword) =>
    lowerAnswer.includes(keyword.toLowerCase()),
  );
  const constraintViolations: string[] = [];

  for (const check of fixture.constraint_checks) {
    if (check.type === "output_shape") {
      const expectedLineCount = check.expectedLineCount ?? 3;
      if (lines(answer).length !== expectedLineCount) {
        constraintViolations.push("output_shape");
      }
      continue;
    }

    if (check.type === "no_prompt_quote_reuse") {
      const hasForbiddenPhrase = (check.forbiddenPhrases ?? []).some((phrase) =>
        lowerAnswer.includes(phrase.toLowerCase()),
      );
      if (hasForbiddenPhrase) {
        constraintViolations.push("no_prompt_quote_reuse");
      }
      continue;
    }

    if (check.type === "task_format_compliance") {
      if (lines(answer).some((line) => /\s{2,}/u.test(line))) {
        constraintViolations.push("task_format_compliance");
      }
    }
  }

  return {
    blocking: false,
    constraintChecks: fixture.constraint_checks.length,
    constraintViolations,
    passed: constraintViolations.length === 0,
    primingScore:
      fixture.priming_keywords.length === 0
        ? 0
        : keywordHits.length / fixture.priming_keywords.length,
    scoreReason:
      constraintViolations.length > 0
        ? `constraint_violations:${constraintViolations.join(",")}`
        : "priming_branch_scored",
  };
}

async function buildMemoryContext(
  memory: GoodMemory,
  scope: MemoryScope,
  query: string,
): Promise<string> {
  const recall = await memory.recall({
    scope,
    query,
    retrievalProfile: "general_chat",
  });
  const built = await memory.buildContext({
    recall,
    output: "developer_prompt_fragment",
  });

  return built.content;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

async function buildOutcomeTelemetryLineage(
  memory: GoodMemory,
  scope: MemoryScope,
): Promise<BehavioralOutcomeTelemetryLineage | undefined> {
  const exported = await memory.exportMemory({
    scope,
  });
  const toolOutcomeExperiences = exported.durable.experiences.filter((experience) =>
    isToolOutcomeExperience(experience),
  );
  const proposals = exported.durable.proposals.filter(
    (proposal) => proposal.proposalType === "procedural_pattern",
  );
  const proposalIds = new Set(proposals.map((proposal) => proposal.id));
  const acceptedPromotions = exported.durable.promotions.filter(
    (promotion) => proposalIds.has(promotion.proposalId) && promotion.decision === "accepted",
  );
  const activeValidatedPatterns = exported.durable.feedback.filter(
    (feedback) => feedback.kind === "validated_pattern" && feedback.lifecycle === "active",
  );

  if (
    toolOutcomeExperiences.length === 0 &&
    proposals.length === 0 &&
    acceptedPromotions.length === 0 &&
    activeValidatedPatterns.length === 0
  ) {
    return undefined;
  }

  return {
    acceptedPromotionIds: acceptedPromotions.map((promotion) => promotion.id),
    activeValidatedPatternIds: activeValidatedPatterns.map((feedback) => feedback.id),
    activeValidatedPatternRules: activeValidatedPatterns.map((feedback) => feedback.rule),
    evidenceIds: uniqueStrings([
      ...toolOutcomeExperiences.flatMap((experience) => experience.linkedEvidenceIds),
      ...proposals.flatMap((proposal) => proposal.linkedEvidenceIds),
      ...acceptedPromotions.flatMap((promotion) => promotion.linkedEvidenceIds),
    ]),
    experienceIds: toolOutcomeExperiences.map((experience) => experience.id),
    proposalIds: proposals.map((proposal) => proposal.id),
  };
}

async function prepareFixtureMemory(input: {
  fixture: BehavioralAdaptationFixture;
  memory: GoodMemory;
  profile: BehavioralAdaptationProfile;
  scope: MemoryScope;
}): Promise<void> {
  const { fixture, memory, profile, scope } = input;

  if (fixture.paradigm === "priming") {
    return;
  }

  await replayMessages(memory, scope, fixture.learning_phase);
  await replayMessages(memory, scope, fixture.interference_phase);

  if (profile === "distilled-feedback") {
    await memory.feedback({
      scope,
      signal: fixture.feedback_signal,
    });
    await memory.runMaintenance({
      scope,
    });
    return;
  }

  if (profile === "outcome-telemetry") {
    if (fixture.behavioral_trace_replays && fixture.behavioral_trace_replays.length > 0) {
      for (const trace of fixture.behavioral_trace_replays) {
        await recordBehavioralTrace({
          memory,
          scope,
          trace,
        });
      }

      await memory.runMaintenance({
        scope,
      });
      return;
    }

    const support = readGoodMemoryEvalSupport(memory);
    if (!support?.recordBehavioralOutcome || !fixture.behavioral_outcomes) {
      return;
    }

    for (const outcome of fixture.behavioral_outcomes) {
      await support.recordBehavioralOutcome({
        scope,
        cue: outcome.cue,
        evidenceExcerpt: outcome.evidenceExcerpt,
        failureClass: outcome.failureClass,
        firstAction: outcome.firstAction,
        saferAlternative: outcome.saferAlternative,
        modelInfluence: outcome.modelInfluence,
      });
    }

    await memory.runMaintenance({
      scope,
    });
  }
}

function fixtureSupportsOutcomeTelemetry(
  fixture: ProceduralOrConditioningFixture,
): boolean {
  if (fixture.paradigm === "conditioning") {
    return true;
  }

  return Boolean(
    (fixture.behavioral_trace_replays && fixture.behavioral_trace_replays.length > 0) ||
      (fixture.behavioral_outcomes && fixture.behavioral_outcomes.length > 0),
  );
}

function createEmptyBlockingSummary(): BehavioralBlockingSummary {
  return {
    conditioning: {
      failedCases: [],
      passedCases: 0,
      totalCases: 0,
    },
    procedural: {
      failedCases: [],
      passedCases: 0,
      totalCases: 0,
    },
  };
}

function roundRate(value: number): number {
  return Number(value.toFixed(4));
}

function summarizeProfileCases(cases: BehavioralCaseResult[], executionFailures: number): BehavioralProfileSummary {
  const blockingCases = cases.filter((caseResult) => caseResult.blocking);
  const passedBlockingCases = blockingCases.filter((caseResult) => caseResult.passed);
  const conditioningCases = blockingCases.filter(
    (caseResult) => caseResult.paradigm === "conditioning",
  );
  const proceduralCases = blockingCases.filter(
    (caseResult) => caseResult.paradigm === "procedural",
  );
  const generalizedProceduralCases = proceduralCases.filter((caseResult) =>
    caseResult.caseId.includes("generalization"),
  );
  const primingByCase = new Map<
    string,
    { control?: BehavioralCaseResult; experimental?: BehavioralCaseResult }
  >();
  let constraintChecks = 0;
  let constraintViolations = 0;

  for (const caseResult of cases) {
    constraintChecks += caseResult.constraintChecks;
    constraintViolations += caseResult.constraintViolations.length;

    if (caseResult.paradigm !== "priming" || !caseResult.branch) {
      continue;
    }

    const pair = primingByCase.get(caseResult.caseId) ?? {};
    pair[caseResult.branch] = caseResult;
    primingByCase.set(caseResult.caseId, pair);
  }

  const primingDeltas = [...primingByCase.values()]
    .filter((pair) => pair.experimental && pair.control)
    .map(
      (pair) =>
        (pair.experimental?.primingScore ?? 0) - (pair.control?.primingScore ?? 0),
    );
  const explicitRecallLeakCount = cases.filter((caseResult) => caseResult.explicitRecallLeak).length;
  const layerD: BehavioralLayerD = {
    first_attempt_policy_adherence: blockingCases.length === 0
      ? 0
      : roundRate(passedBlockingCases.length / blockingCases.length),
    failure_avoidance_rate: conditioningCases.length === 0
      ? 0
      : roundRate(
          conditioningCases.filter((caseResult) => caseResult.passed).length /
            conditioningCases.length,
        ),
    inhibition_success_rate: conditioningCases.length === 0
      ? 0
      : roundRate(
          conditioningCases.filter((caseResult) => caseResult.passed).length /
            conditioningCases.length,
        ),
    procedure_generalization_rate: generalizedProceduralCases.length === 0
      ? 0
      : roundRate(
          generalizedProceduralCases.filter((caseResult) => caseResult.passed).length /
            generalizedProceduralCases.length,
        ),
    priming_delta: primingDeltas.length === 0
      ? 0
      : roundRate(
          primingDeltas.reduce((sum, value) => sum + value, 0) / primingDeltas.length,
        ),
    constraint_violation_rate: constraintChecks === 0
      ? 0
      : roundRate(constraintViolations / constraintChecks),
  };

  const blockingSummary = createEmptyBlockingSummary();

  for (const caseResult of proceduralCases) {
    blockingSummary.procedural.totalCases += 1;
    if (caseResult.passed) {
      blockingSummary.procedural.passedCases += 1;
    } else {
      blockingSummary.procedural.failedCases.push(caseResult.caseId);
    }
  }

  for (const caseResult of conditioningCases) {
    blockingSummary.conditioning.totalCases += 1;
    if (caseResult.passed) {
      blockingSummary.conditioning.passedCases += 1;
    } else {
      blockingSummary.conditioning.failedCases.push(caseResult.caseId);
    }
  }

  return {
    behavioralRegressionCases: blockingCases
      .filter((caseResult) => !caseResult.passed)
      .map((caseResult) => `${caseResult.profile}:${caseResult.caseId}`),
    blockingSummary,
    cases,
    executionFailures,
    explicitRecallLeakCount,
    layer_d: layerD,
    totalCases: cases.length + executionFailures,
  };
}

function summarizeReportProfiles(
  profiles: Record<BehavioralAdaptationProfile, BehavioralProfileSummary>,
): Omit<BehavioralProfileSummary, "cases"> {
  const allCases = Object.values(profiles).flatMap((profile) => profile.cases);
  const executionFailures = Object.values(profiles).reduce(
    (sum, profile) => sum + profile.executionFailures,
    0,
  );
  const summary = summarizeProfileCases(allCases, executionFailures);

  return {
    behavioralRegressionCases: summary.behavioralRegressionCases,
    blockingSummary: summary.blockingSummary,
    executionFailures: summary.executionFailures,
    explicitRecallLeakCount: summary.explicitRecallLeakCount,
    layer_d: summary.layer_d,
    totalCases: summary.totalCases,
  };
}

async function executeStructuredCase(input: {
  answerGenerator: BehavioralAnswerGenerator;
  createMemory: BehavioralAdaptationMemoryFactory;
  fixture: ProceduralOrConditioningFixture;
  profile: BehavioralAdaptationProfile;
  requireTraceForStructuredCases?: boolean;
  scopePrefix?: string;
}): Promise<BehavioralCaseResult | null> {
  if (
    input.profile === "outcome-telemetry" &&
    !fixtureSupportsOutcomeTelemetry(input.fixture)
  ) {
    return null;
  }

  const scope = buildScope(
    input.fixture,
    input.profile,
    undefined,
    input.scopePrefix,
  );
  const handle = normalizeMemoryHandle(
    input.createMemory({
      fixture: input.fixture,
      profile: input.profile,
      scope,
    }),
  );

  try {
    await prepareFixtureMemory({
      fixture: input.fixture,
      memory: handle.memory,
      profile: input.profile,
      scope,
    });
    const outcomeTelemetryLineage = input.profile === "outcome-telemetry"
      ? await buildOutcomeTelemetryLineage(handle.memory, scope)
      : undefined;
    const memoryContext = await buildMemoryContext(
      handle.memory,
      scope,
      input.fixture.test_probe.content,
    );
    const baseline = await input.answerGenerator({
      fixture: input.fixture,
      memoryContext: "",
      mode: "baseline",
      profile: "raw-experience",
      prompt: input.fixture.test_probe.content,
    });
    const generated = await input.answerGenerator({
      fixture: input.fixture,
      memoryContext,
      mode: "goodmemory",
      profile: input.profile,
      prompt: buildPrompt({
        fixture: input.fixture,
        memoryContext,
      }),
    });
    const firstAction = resolveScoredFirstAction(generated, {
      requireTrace: input.requireTraceForStructuredCases,
    });
    const scored = scoreFirstActionCase({
      actual: firstAction.action,
      expected: input.fixture.expected_first_action,
      forbidden: input.fixture.forbidden_first_action,
      paradigm: input.fixture.paradigm,
    });
    const baselineTrace = resolveReportTrace(baseline.trace, "baseline.trace");
    const goodmemoryTrace = resolveReportTrace(generated.trace, "generated.trace");

    return {
      baselineAnswer: baseline.answer,
      ...(baselineTrace.trace ? { baselineTrace: baselineTrace.trace } : {}),
      ...(baselineTrace.parseError
        ? { baselineTraceParseError: baselineTrace.parseError }
        : {}),
      caseId: input.fixture.case_id,
      explicitRecallLeak: countExplicitRecallLeaks(generated.answer),
      firstAction: firstAction.action,
      firstActionSource: firstAction.source,
      ...(firstAction.traceParseError
        ? { firstActionTraceParseError: firstAction.traceParseError }
        : {}),
      ...(goodmemoryTrace.trace ? { goodmemoryTrace: goodmemoryTrace.trace } : {}),
      ...(goodmemoryTrace.parseError
        ? { goodmemoryTraceParseError: goodmemoryTrace.parseError }
        : {}),
      goodmemoryAnswer: generated.answer,
      memoryContext,
      outcomeTelemetryLineage,
      paradigm: input.fixture.paradigm,
      profile: input.profile,
      taskName: input.fixture.task_name,
      ...scored,
    };
  } finally {
    await handle.cleanup?.();
  }
}

async function executePrimingCase(input: {
  answerGenerator: BehavioralAnswerGenerator;
  createMemory: BehavioralAdaptationMemoryFactory;
  fixture: PrimingFixture;
  profile: BehavioralAdaptationProfile;
  scopePrefix?: string;
}): Promise<BehavioralCaseResult[]> {
  if (input.profile === "outcome-telemetry") {
    return [];
  }

  const results: BehavioralCaseResult[] = [];

  for (const branch of ["experimental", "control"] as const) {
    const scope = buildScope(
      input.fixture,
      input.profile,
      branch,
      input.scopePrefix,
    );
    const handle = normalizeMemoryHandle(
      input.createMemory({
        fixture: input.fixture,
        profile: input.profile,
        scope,
      }),
    );

    try {
      await replayMessages(handle.memory, scope, input.fixture[branch].learning_phase);
      await replayMessages(handle.memory, scope, input.fixture[branch].interference_phase);
      if (input.profile === "distilled-feedback") {
        await handle.memory.feedback({
          scope,
          signal: input.fixture.feedback_signal,
        });
      }
      const memoryContext = await buildMemoryContext(
        handle.memory,
        scope,
        input.fixture[branch].test_probe.content,
      );
      const baseline = await input.answerGenerator({
        branch,
        fixture: input.fixture,
        memoryContext: "",
        mode: "baseline",
        profile: "raw-experience",
        prompt: input.fixture[branch].test_probe.content,
      });
      const generated = await input.answerGenerator({
        branch,
        fixture: input.fixture,
        memoryContext,
        mode: "goodmemory",
        profile: input.profile,
        prompt: buildPrompt({
          fixture: input.fixture,
          branch,
          memoryContext,
        }),
      });
      const scored = scorePrimingAnswer(generated.answer, input.fixture[branch]);

      results.push({
        baselineAnswer: baseline.answer,
        branch,
        caseId: input.fixture.case_id,
        explicitRecallLeak: countExplicitRecallLeaks(generated.answer),
        goodmemoryAnswer: generated.answer,
        memoryContext,
        paradigm: "priming",
        profile: input.profile,
        taskName: input.fixture.task_name,
        ...scored,
      });
    } finally {
      await handle.cleanup?.();
    }
  }

  return results;
}

function buildRunId(): string {
  return `run-${Date.now()}`;
}

async function writeReport(outputDir: string, runId: string, report: BehavioralAdaptationReport) {
  const runDirectory = join(outputDir, runId);
  await mkdir(runDirectory, { recursive: true });
  await writeFile(join(runDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
}

export async function runBehavioralAdaptationEvaluation(
  input: RunBehavioralAdaptationEvaluationOptions,
): Promise<BehavioralAdaptationReport> {
  const answerGenerator = input.answerGenerator ?? createDefaultFallbackAnswerGenerator();
  const createMemory = input.createMemory ?? createDefaultMemoryFactory();
  const scopePrefix = input.scopePrefix ?? "behavioral-adaptation";
  const fixtures = await listBehavioralAdaptationFixtures(input.fixtureDir);
  const profiles: Record<BehavioralAdaptationProfile, BehavioralCaseResult[]> = {
    "raw-experience": [],
    "outcome-telemetry": [],
    "distilled-feedback": [],
  };
  const executionFailures: Record<BehavioralAdaptationProfile, number> = {
    "raw-experience": 0,
    "outcome-telemetry": 0,
    "distilled-feedback": 0,
  };

  for (const profile of ["raw-experience", "outcome-telemetry", "distilled-feedback"] as const) {
    for (const fixture of fixtures) {
      try {
        if (fixture.paradigm === "priming") {
          profiles[profile].push(
            ...(await executePrimingCase({
            answerGenerator,
            createMemory,
            fixture,
            profile,
            scopePrefix,
          })),
        );
        continue;
      }

        const result = await executeStructuredCase({
          answerGenerator,
          createMemory,
          fixture,
          profile,
          requireTraceForStructuredCases: input.requireTraceForStructuredCases,
          scopePrefix,
        });
        if (result) {
          profiles[profile].push(result);
        }
      } catch {
        executionFailures[profile] += 1;
      }
    }
  }

  const runId = input.runId ?? buildRunId();
  const runDirectory = join(input.outputDir, runId);
  const summarizedProfiles = {
    "raw-experience": summarizeProfileCases(
      profiles["raw-experience"],
      executionFailures["raw-experience"],
    ),
    "outcome-telemetry": summarizeProfileCases(
      profiles["outcome-telemetry"],
      executionFailures["outcome-telemetry"],
    ),
    "distilled-feedback": summarizeProfileCases(
      profiles["distilled-feedback"],
      executionFailures["distilled-feedback"],
    ),
  } satisfies Record<BehavioralAdaptationProfile, BehavioralProfileSummary>;

  const report: BehavioralAdaptationReport = {
    ...(input.evidenceContract ? { evidenceContract: input.evidenceContract } : {}),
    generatedAt: new Date().toISOString(),
    generatedBy: input.generatedBy,
    mode: input.mode,
    outputDir: input.outputDir,
    profiles: summarizedProfiles,
    runDirectory,
    runId,
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: summarizeReportProfiles(summarizedProfiles),
  };

  await writeReport(input.outputDir, runId, report);
  return report;
}
