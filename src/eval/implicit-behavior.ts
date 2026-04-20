import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createGoodMemory } from "../api/createGoodMemory";
import type { GoodMemory } from "../api/contracts";
import type { MemoryScope } from "../domain/scope";

export type ImplicitBehaviorParadigm =
  | "conditioning"
  | "priming"
  | "procedural";

export type ImplicitBehaviorProfile =
  | "distilled-feedback"
  | "raw-experience";

export type ImplicitBehaviorScoringMode =
  | "avoid_forbidden"
  | "exact_action"
  | "priming_delta";

export interface ImplicitBehaviorMessage {
  content: string;
  role: "assistant" | "system" | "user";
}

export interface ImplicitBehaviorFixture {
  case_id: string;
  expected_first_action: string;
  feedback_signal: string;
  forbidden_first_action: string;
  interference_phase: ImplicitBehaviorMessage[];
  learning_phase: ImplicitBehaviorMessage[];
  paradigm: ImplicitBehaviorParadigm;
  priming_keywords?: string[];
  scoring_mode: ImplicitBehaviorScoringMode;
  task_name: string;
  test_probe: ImplicitBehaviorMessage;
}

export interface ImplicitBehaviorCaseScore {
  blocking: boolean;
  explicitRecallLeak: boolean;
  firstAction: string;
  passed: boolean;
  primingInfluenceScore?: number;
  reason: string;
}

export interface ImplicitBehaviorCaseResult extends ImplicitBehaviorCaseScore {
  caseId: string;
  expectedFirstAction: string;
  fixtureReferenceAnswer: string;
  forbiddenFirstAction: string;
  goodmemoryAnswer: string;
  memoryContext: string;
  paradigm: ImplicitBehaviorParadigm;
  profile: ImplicitBehaviorProfile;
  scoreReason: string;
  scoringMode: ImplicitBehaviorScoringMode;
  taskName: string;
}

export interface ImplicitBehaviorProfileSummary {
  behavioralRegressionCases: string[];
  blockingSummary: Record<
    "conditioning" | "procedural",
    {
      failedCases: string[];
      passedCases: number;
      totalCases: number;
    }
  >;
  cases: ImplicitBehaviorCaseResult[];
  executionFailures: number;
  explicitRecallLeakCount: number;
  failureAvoidanceRate: number;
  firstAttemptPassRate: number;
  inhibitionPassRate: number;
  primingInfluenceScore: number;
  proceduralAdherenceRate: number;
  totalCases: number;
}

export interface ImplicitBehaviorReport {
  generatedAt: string;
  generatedBy: string;
  mode: "fallback" | "live-memory";
  outputDir: string;
  profiles: Record<ImplicitBehaviorProfile, ImplicitBehaviorProfileSummary>;
  runDirectory: string;
  runId: string;
  source: {
    benchmark: "ImplicitMemBench";
    license: "CC BY 4.0";
    url: string;
  };
  summary: Omit<ImplicitBehaviorProfileSummary, "cases">;
}

export interface ImplicitBehaviorMemoryHandle {
  cleanup?: () => Promise<void>;
  memory: GoodMemory;
}

export type ImplicitBehaviorMemoryFactory = (input: {
  case: ImplicitBehaviorFixture;
  profile: ImplicitBehaviorProfile;
  scope: MemoryScope;
}) => GoodMemory | ImplicitBehaviorMemoryHandle;

export type ImplicitBehaviorAnswerGenerator = (input: {
  case: ImplicitBehaviorFixture;
  memoryContext: string;
  profile: ImplicitBehaviorProfile;
  testProbe: string;
}) => Promise<string>;

export interface RunImplicitBehaviorEvaluationOptions {
  answerGenerator?: ImplicitBehaviorAnswerGenerator;
  createMemory?: ImplicitBehaviorMemoryFactory;
  fixtureDir: string;
  generatedBy: string;
  mode: "fallback" | "live-memory";
  outputDir: string;
  runId?: string;
}

interface ImplicitBehaviorExecutionFailure {
  caseId: string;
  paradigm: ImplicitBehaviorParadigm;
  profile: ImplicitBehaviorProfile;
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

function assertStringArray(value: unknown, path: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be a string array`);
  }

  return value.map((entry, index) => assertString(entry, `${path}[${index}]`));
}

function assertParadigm(value: unknown, path: string): ImplicitBehaviorParadigm {
  if (value === "conditioning" || value === "priming" || value === "procedural") {
    return value;
  }

  throw new Error(`${path} must be conditioning, priming, or procedural`);
}

function assertScoringMode(
  value: unknown,
  path: string,
): ImplicitBehaviorScoringMode {
  if (
    value === "avoid_forbidden" ||
    value === "exact_action" ||
    value === "priming_delta"
  ) {
    return value;
  }

  throw new Error(`${path} must be avoid_forbidden, exact_action, or priming_delta`);
}

function validateMessage(value: unknown, path: string): ImplicitBehaviorMessage {
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
): ImplicitBehaviorMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a non-empty message array`);
  }

  return value.map((entry, index) => validateMessage(entry, `${path}[${index}]`));
}

export function validateImplicitBehaviorFixture(
  value: unknown,
  path = "fixture",
): ImplicitBehaviorFixture {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  const fixture = {
    case_id: assertString(value.case_id, `${path}.case_id`),
    paradigm: assertParadigm(value.paradigm, `${path}.paradigm`),
    task_name: assertString(value.task_name, `${path}.task_name`),
    learning_phase: validateMessageArray(value.learning_phase, `${path}.learning_phase`),
    interference_phase: validateMessageArray(
      value.interference_phase,
      `${path}.interference_phase`,
    ),
    test_probe: validateMessage(value.test_probe, `${path}.test_probe`),
    expected_first_action: assertString(
      value.expected_first_action,
      `${path}.expected_first_action`,
    ),
    forbidden_first_action: assertString(
      value.forbidden_first_action,
      `${path}.forbidden_first_action`,
    ),
    feedback_signal: assertString(value.feedback_signal, `${path}.feedback_signal`),
    scoring_mode: assertScoringMode(value.scoring_mode, `${path}.scoring_mode`),
    priming_keywords: assertStringArray(
      value.priming_keywords,
      `${path}.priming_keywords`,
    ),
  } satisfies ImplicitBehaviorFixture;

  if (fixture.paradigm === "procedural" && fixture.scoring_mode !== "exact_action") {
    throw new Error(`${path}.scoring_mode must be exact_action for procedural`);
  }
  if (
    fixture.paradigm === "conditioning" &&
    fixture.scoring_mode !== "avoid_forbidden"
  ) {
    throw new Error(`${path}.scoring_mode must be avoid_forbidden for conditioning`);
  }
  if (fixture.paradigm === "priming" && fixture.scoring_mode !== "priming_delta") {
    throw new Error(`${path}.scoring_mode must be priming_delta for priming`);
  }

  return fixture;
}

export async function listImplicitBehaviorFixtures(
  fixtureDir: string,
): Promise<ImplicitBehaviorFixture[]> {
  const entries = await readdir(fixtureDir, { withFileTypes: true });
  const fixtures: ImplicitBehaviorFixture[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const filePath = join(fixtureDir, entry.name);
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    const values = Array.isArray(parsed) ? parsed : [parsed];
    fixtures.push(
      ...values.map((value, index) =>
        validateImplicitBehaviorFixture(value, `${entry.name}[${index}]`),
      ),
    );
  }

  return fixtures.sort((left, right) => left.case_id.localeCompare(right.case_id));
}

function normalizeAction(value: string): string {
  return value
    .trim()
    .replace(/^[-*•]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^`+|`+$/g, "")
    .trim();
}

export function extractFirstAction(answer: string): string {
  const lines = answer
    .split(/\r?\n/u)
    .map(normalizeAction)
    .filter((line) => line.length > 0 && !/^```/.test(line));

  return lines[0] ?? "";
}

function includesAction(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

const ACTION_PREFIX_TOKEN_WINDOW = 4;

const ACTION_NEGATION_TAIL_PATTERNS = [
  /(?:^| )(?:do not|dont|never)(?: [a-z]+){0,2}(?: (?:use|run|call|choose|select|pick))$/u,
  /(?:^| )(?:avoid|skip|without)(?: [a-z]+){0,2}(?: (?:use|run|call|choose|select|pick))?$/u,
  /(?:^| )(?:instead of|rather than) (?:use|run|call|choose|select|pick)$/u,
] as const;

const ACTION_SELECTION_PREFIX_PATTERNS = [
  /(?:^| )(?:use|run|call|choose|select|pick)(?: [a-z]+){0,3}$/u,
  /(?:^| )(?:start with|first action|first action is|reply with|reply with only)$/u,
] as const;

function extractActionPrefixTail(prefix: string): string {
  const tokens = normalizeComparisonText(prefix).split(" ").filter(Boolean);
  return tokens.slice(-ACTION_PREFIX_TOKEN_WINDOW).join(" ");
}

function selectsAction(haystack: string, needle: string): boolean {
  const normalizedHaystack = haystack.toLowerCase();
  const normalizedNeedle = needle.toLowerCase();
  let index = normalizedHaystack.indexOf(normalizedNeedle);

  while (index !== -1) {
    const prefixTail = extractActionPrefixTail(
      normalizedHaystack.slice(Math.max(0, index - 48), index),
    );

    if (
      !ACTION_NEGATION_TAIL_PATTERNS.some((pattern) => pattern.test(prefixTail)) &&
      (prefixTail.length === 0 ||
        ACTION_SELECTION_PREFIX_PATTERNS.some((pattern) => pattern.test(prefixTail)))
    ) {
      return true;
    }

    index = normalizedHaystack.indexOf(normalizedNeedle, index + normalizedNeedle.length);
  }

  return false;
}

function hasAvoidanceLanguage(value: string): boolean {
  return /\b(avoid|warning|warn|do not|don't|timeout|failed|safer|instead|before proceeding)\b/iu.test(
    value,
  );
}

function containsExplicitRecallLeak(answer: string): boolean {
  return /\b(memory context|remembered context|from memory|i remember|learned earlier|as previously learned)\b/iu.test(
    answer,
  );
}

const CONDITIONING_HAZARD_PATTERNS = [
  /\b(timed?\s*out|timeout)\b/iu,
  /\b(fail(?:ed|ure)?|error)\b/iu,
  /\b(cannot|can't|unable|unsupported|unavailable)\b/iu,
  /\b(approval|approved|authorize|authorization|permission|denied|blocked|refused)\b/iu,
] as const;

const MIN_REUSED_PRIMING_PHRASE_WORDS = 6;

function normalizeComparisonText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/giu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasConditioningHazardCue(
  fixture: ImplicitBehaviorFixture,
  firstAction: string,
): boolean {
  const fixtureContext = [
    fixture.feedback_signal,
    ...fixture.learning_phase.map((message) => message.content),
  ].join("\n");
  const relevantHazards = CONDITIONING_HAZARD_PATTERNS.filter((pattern) =>
    pattern.test(fixtureContext),
  );

  if (relevantHazards.length === 0) {
    return false;
  }

  return relevantHazards.some((pattern) => pattern.test(firstAction));
}

function containsForbiddenPrimingReuse(
  fixture: ImplicitBehaviorFixture,
  answer: string,
): boolean {
  const normalizedAnswer = normalizeComparisonText(answer);
  if (normalizedAnswer.length === 0) {
    return false;
  }

  return fixture.learning_phase.some((message) => {
    const words = normalizeComparisonText(message.content).split(" ").filter(Boolean);
    if (words.length < MIN_REUSED_PRIMING_PHRASE_WORDS) {
      return false;
    }

    for (
      let index = 0;
      index <= words.length - MIN_REUSED_PRIMING_PHRASE_WORDS;
      index += 1
    ) {
      const phrase = words
        .slice(index, index + MIN_REUSED_PRIMING_PHRASE_WORDS)
        .join(" ");
      if (normalizedAnswer.includes(phrase)) {
        return true;
      }
    }

    return false;
  });
}

function scorePriming(input: {
  answer: string;
  fixture: ImplicitBehaviorFixture;
}): {
  forbiddenReuse: boolean;
  score: number;
} {
  if (containsForbiddenPrimingReuse(input.fixture, input.answer)) {
    return {
      forbiddenReuse: true,
      score: 0,
    };
  }

  const keywords = input.fixture.priming_keywords ?? [];
  if (keywords.length === 0) {
    return {
      forbiddenReuse: false,
      score: 0,
    };
  }

  const matched = keywords.filter((keyword) => includesAction(input.answer, keyword));
  return {
    forbiddenReuse: false,
    score: Math.round((matched.length / keywords.length) * 100),
  };
}

export function scoreImplicitBehaviorCase(
  fixture: ImplicitBehaviorFixture,
  answer: string,
): ImplicitBehaviorCaseScore {
  const firstAction = extractFirstAction(answer);
  const explicitRecallLeak = containsExplicitRecallLeak(answer);

  if (
    fixture.scoring_mode === "exact_action" &&
    selectsAction(firstAction, fixture.forbidden_first_action)
  ) {
    return {
      blocking: true,
      explicitRecallLeak,
      firstAction,
      passed: false,
      reason: "first_action_matched_forbidden",
    };
  }

  if (fixture.scoring_mode === "exact_action") {
    const passed = selectsAction(firstAction, fixture.expected_first_action);
    return {
      blocking: true,
      explicitRecallLeak,
      firstAction,
      passed,
      reason: passed
        ? "expected_first_action_matched"
        : "expected_first_action_missing",
    };
  }

  if (fixture.scoring_mode === "avoid_forbidden") {
    const mentionsExpected = selectsAction(
      firstAction,
      fixture.expected_first_action,
    );
    const mentionsForbidden = includesAction(firstAction, fixture.forbidden_first_action);
    const affirmsForbidden = selectsAction(
      firstAction,
      fixture.forbidden_first_action,
    );
    const warnsOrAvoids = hasAvoidanceLanguage(firstAction);
    const hasHazardCue = hasConditioningHazardCue(fixture, firstAction);
    if (affirmsForbidden && !warnsOrAvoids) {
      return {
        blocking: true,
        explicitRecallLeak,
        firstAction,
        passed: false,
        reason: "first_action_matched_forbidden",
      };
    }

    const passed = mentionsExpected || (mentionsForbidden && warnsOrAvoids && hasHazardCue);
    return {
      blocking: true,
      explicitRecallLeak,
      firstAction,
      passed,
      reason: passed
        ? mentionsExpected
          ? "safe_first_action_matched"
          : "conditioned_warning_first_action"
        : "avoidance_first_action_missing",
    };
  }

  const primingScore = scorePriming({ answer, fixture });
  return {
    blocking: false,
    explicitRecallLeak,
    firstAction,
    passed: primingScore.score > 0,
    primingInfluenceScore: primingScore.score,
    reason:
      primingScore.forbiddenReuse
        ? "priming_forbidden_reuse_detected"
        : primingScore.score > 0
        ? "priming_keywords_detected"
        : "priming_keywords_absent",
  };
}

function createDefaultMemoryHandle(): ImplicitBehaviorMemoryHandle {
  return {
    memory: createGoodMemory({
      storage: {
        provider: "memory",
      },
    }),
  };
}

function normalizeMemoryHandle(
  value: GoodMemory | ImplicitBehaviorMemoryHandle,
): ImplicitBehaviorMemoryHandle {
  if ("memory" in value) {
    return value;
  }

  return {
    memory: value,
  };
}

function buildScope(input: {
  case: ImplicitBehaviorFixture;
  profile: ImplicitBehaviorProfile;
  sessionId: string;
}): MemoryScope {
  return {
    userId: `phase-24-${input.profile}-${input.case.case_id}`,
    workspaceId: "implicit-behavioral",
    sessionId: input.sessionId,
  };
}

function buildFixtureReferenceAnswer(fixture: ImplicitBehaviorFixture): string {
  if (fixture.scoring_mode === "exact_action") {
    return fixture.forbidden_first_action;
  }
  if (fixture.scoring_mode === "avoid_forbidden") {
    return `${fixture.forbidden_first_action} --detailed`;
  }

  return "Atlas\nNimbus\nLattice";
}

function contextContainsAny(context: string, values: string[]): boolean {
  return values.some((value) => includesAction(context, value));
}

export async function buildDeterministicImplicitBehaviorAnswer(input: {
  case: ImplicitBehaviorFixture;
  memoryContext: string;
  profile: ImplicitBehaviorProfile;
}): Promise<string> {
  const context = input.memoryContext;

  if (input.case.scoring_mode === "exact_action") {
    if (
      contextContainsAny(context, [
        input.case.expected_first_action,
        "destination path first",
        "source path second",
      ])
    ) {
      return input.case.expected_first_action;
    }

    return input.case.forbidden_first_action;
  }

  if (input.case.scoring_mode === "avoid_forbidden") {
    if (
      contextContainsAny(context, [
        input.case.expected_first_action,
        "avoid deepanalyzer",
        "deepanalyzer timeouts",
        "use quickcheck",
      ])
    ) {
      return `${input.case.expected_first_action} --network-traffic`;
    }

    return `${input.case.forbidden_first_action} --network-traffic`;
  }

  if (
    input.profile === "distilled-feedback" ||
    contextContainsAny(context, ["volcanic", "ember", "magma", "pressure"])
  ) {
    return "EmberVault\nPressureFold\nBasaltThread";
  }

  return "Atlas\nNimbus\nLattice";
}

async function runImplicitBehaviorCase(input: {
  answerGenerator: ImplicitBehaviorAnswerGenerator;
  createMemory?: ImplicitBehaviorMemoryFactory;
  fixture: ImplicitBehaviorFixture;
  profile: ImplicitBehaviorProfile;
}): Promise<ImplicitBehaviorCaseResult> {
  const learningScope = buildScope({
    case: input.fixture,
    profile: input.profile,
    sessionId: `${input.fixture.case_id}-learning`,
  });
  const created = normalizeMemoryHandle(
    input.createMemory?.({
      case: input.fixture,
      profile: input.profile,
      scope: learningScope,
    }) ?? createDefaultMemoryHandle(),
  );

  try {
    await created.memory.remember({
      scope: learningScope,
      messages: [
        ...input.fixture.learning_phase,
        ...input.fixture.interference_phase,
      ],
    });

    if (input.profile === "distilled-feedback") {
      await created.memory.feedback({
        scope: buildScope({
          case: input.fixture,
          profile: input.profile,
          sessionId: `${input.fixture.case_id}-feedback`,
        }),
        signal: input.fixture.feedback_signal,
      });
    }

    const recall = await created.memory.recall({
      scope: buildScope({
        case: input.fixture,
        profile: input.profile,
        sessionId: `${input.fixture.case_id}-test`,
      }),
      query: input.fixture.test_probe.content,
      retrievalProfile: "coding_agent",
    });
    const context = await created.memory.buildContext({
      recall,
      output: "markdown",
      maxTokens: 220,
    });
    const fixtureReferenceAnswer = buildFixtureReferenceAnswer(input.fixture);
    const goodmemoryAnswer = await input.answerGenerator({
      case: input.fixture,
      memoryContext: context.content,
      profile: input.profile,
      testProbe: input.fixture.test_probe.content,
    });
    const score = scoreImplicitBehaviorCase(input.fixture, goodmemoryAnswer);

    return {
      ...score,
      caseId: input.fixture.case_id,
      expectedFirstAction: input.fixture.expected_first_action,
      fixtureReferenceAnswer,
      forbiddenFirstAction: input.fixture.forbidden_first_action,
      goodmemoryAnswer,
      memoryContext: context.content,
      paradigm: input.fixture.paradigm,
      profile: input.profile,
      scoreReason: score.reason,
      scoringMode: input.fixture.scoring_mode,
      taskName: input.fixture.task_name,
    };
  } finally {
    await created.cleanup?.();
  }
}

function rate(input: {
  denominator: number;
  numerator: number;
}): number {
  if (input.denominator === 0) {
    return 0;
  }

  return Number((input.numerator / input.denominator).toFixed(2));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function summarizeProfile(input: {
  cases: ImplicitBehaviorCaseResult[];
  executionFailures: ImplicitBehaviorExecutionFailure[];
  fixtures: ImplicitBehaviorFixture[];
  profile: ImplicitBehaviorProfile;
}): ImplicitBehaviorProfileSummary {
  const blockingFixtures = input.fixtures.filter((fixture) => fixture.paradigm !== "priming");
  const proceduralFixtureCount = input.fixtures.filter(
    (fixture) => fixture.paradigm === "procedural",
  ).length;
  const conditioningFixtureCount = input.fixtures.filter(
    (fixture) => fixture.paradigm === "conditioning",
  ).length;
  const primingFailureCount = input.executionFailures.filter(
    (failure) => failure.paradigm === "priming",
  ).length;
  const blockingCases = input.cases.filter((item) => item.blocking);
  const proceduralCases = input.cases.filter((item) => item.paradigm === "procedural");
  const conditioningCases = input.cases.filter((item) => item.paradigm === "conditioning");
  const primingScores = input.cases
    .map((item) => item.primingInfluenceScore)
    .filter((value): value is number => typeof value === "number");
  const primingScoresWithFailures = primingScores.concat(Array(primingFailureCount).fill(0));
  const behavioralRegressionCases = blockingCases
    .filter((item) => !item.passed)
    .map((item) => `${input.profile}:${item.caseId}`);
  const proceduralFailures = proceduralCases
    .filter((item) => !item.passed)
    .map((item) => item.caseId);
  const conditioningFailures = conditioningCases
    .filter((item) => !item.passed)
    .map((item) => item.caseId);

  return {
    behavioralRegressionCases,
    blockingSummary: {
      conditioning: {
        failedCases: conditioningFailures,
        passedCases: conditioningCases.filter((item) => item.passed).length,
        totalCases: conditioningFixtureCount,
      },
      procedural: {
        failedCases: proceduralFailures,
        passedCases: proceduralCases.filter((item) => item.passed).length,
        totalCases: proceduralFixtureCount,
      },
    },
    cases: input.cases,
    executionFailures: input.executionFailures.length,
    explicitRecallLeakCount: input.cases.filter((item) => item.explicitRecallLeak).length,
    failureAvoidanceRate: rate({
      numerator: conditioningCases.filter((item) => item.passed).length,
      denominator: conditioningFixtureCount,
    }),
    firstAttemptPassRate: rate({
      numerator: blockingCases.filter((item) => item.passed).length,
      denominator: blockingFixtures.length,
    }),
    inhibitionPassRate: rate({
      numerator: conditioningCases.filter((item) => item.passed).length,
      denominator: conditioningFixtureCount,
    }),
    primingInfluenceScore: average(primingScoresWithFailures),
    proceduralAdherenceRate: rate({
      numerator: proceduralCases.filter((item) => item.passed).length,
      denominator: proceduralFixtureCount,
    }),
    totalCases: input.fixtures.length,
  };
}

function summarizeAll(
  profiles: Record<ImplicitBehaviorProfile, ImplicitBehaviorProfileSummary>,
): Omit<ImplicitBehaviorProfileSummary, "cases"> {
  const profileValues = Object.values(profiles);
  const totalCases = profileValues.reduce((sum, profile) => sum + profile.totalCases, 0);
  const conditioningFailedCases = profileValues.flatMap(
    (profile) => profile.blockingSummary.conditioning.failedCases,
  );
  const proceduralFailedCases = profileValues.flatMap(
    (profile) => profile.blockingSummary.procedural.failedCases,
  );

  return {
    behavioralRegressionCases: profileValues.flatMap(
      (profile) => profile.behavioralRegressionCases,
    ),
    blockingSummary: {
      conditioning: {
        failedCases: conditioningFailedCases,
        passedCases: profileValues.reduce(
          (sum, profile) => sum + profile.blockingSummary.conditioning.passedCases,
          0,
        ),
        totalCases: profileValues.reduce(
          (sum, profile) => sum + profile.blockingSummary.conditioning.totalCases,
          0,
        ),
      },
      procedural: {
        failedCases: proceduralFailedCases,
        passedCases: profileValues.reduce(
          (sum, profile) => sum + profile.blockingSummary.procedural.passedCases,
          0,
        ),
        totalCases: profileValues.reduce(
          (sum, profile) => sum + profile.blockingSummary.procedural.totalCases,
          0,
        ),
      },
    },
    executionFailures: profileValues.reduce(
      (sum, profile) => sum + profile.executionFailures,
      0,
    ),
    explicitRecallLeakCount: profileValues.reduce(
      (sum, profile) => sum + profile.explicitRecallLeakCount,
      0,
    ),
    failureAvoidanceRate: average(
      profileValues.map((profile) => profile.failureAvoidanceRate),
    ),
    firstAttemptPassRate: average(
      profileValues.map((profile) => profile.firstAttemptPassRate),
    ),
    inhibitionPassRate: average(profileValues.map((profile) => profile.inhibitionPassRate)),
    primingInfluenceScore: average(
      profileValues.map((profile) => profile.primingInfluenceScore),
    ),
    proceduralAdherenceRate: average(
      profileValues.map((profile) => profile.proceduralAdherenceRate),
    ),
    totalCases,
  };
}

export async function runImplicitBehaviorEvaluation(
  input: RunImplicitBehaviorEvaluationOptions,
): Promise<ImplicitBehaviorReport> {
  const fixtures = await listImplicitBehaviorFixtures(input.fixtureDir);
  const runId = input.runId ?? `run-${Date.now()}`;
  const runDirectory = join(input.outputDir, runId);
  const answerGenerator =
    input.answerGenerator ??
    ((payload) =>
      buildDeterministicImplicitBehaviorAnswer({
        case: payload.case,
        memoryContext: payload.memoryContext,
        profile: payload.profile,
      }));
  const profiles = {} as Record<ImplicitBehaviorProfile, ImplicitBehaviorProfileSummary>;

  for (const profile of ["raw-experience", "distilled-feedback"] as const) {
    const results: ImplicitBehaviorCaseResult[] = [];
    const executionFailures: ImplicitBehaviorExecutionFailure[] = [];
    for (const fixture of fixtures) {
      try {
        results.push(
          await runImplicitBehaviorCase({
            answerGenerator,
            createMemory: input.createMemory,
            fixture,
            profile,
          }),
        );
      } catch {
        executionFailures.push({
          caseId: fixture.case_id,
          paradigm: fixture.paradigm,
          profile,
        });
      }
    }
    profiles[profile] = summarizeProfile({
      cases: results,
      executionFailures,
      fixtures,
      profile,
    });
  }

  const report: ImplicitBehaviorReport = {
    generatedAt: new Date().toISOString(),
    generatedBy: input.generatedBy,
    mode: input.mode,
    outputDir: input.outputDir,
    profiles,
    runDirectory,
    runId,
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: summarizeAll(profiles),
  };

  await mkdir(runDirectory, { recursive: true });
  await writeFile(join(runDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  return report;
}
