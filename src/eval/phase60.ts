import {
  type ImplicitMemBenchCaseResult,
  type ImplicitMemBenchResearchCase,
  type ImplicitMemBenchResearchMode,
  type ImplicitMemBenchResearchProfile,
  type ImplicitMemBenchResearchReport,
  type PrimingImplicitMemBenchCase,
  detectExplicitRecallLeak,
} from "./implicitmembench-research";

export type Phase60OverallProfile =
  | ImplicitMemBenchResearchProfile
  | "goodmemory-controlled-priming"
  | "goodmemory-distilled-feedback+controlled-priming";

export interface Phase60ExpectedCaseShape {
  blockingCases: number;
  primingCases: number;
  totalCases: number;
}

export interface Phase60Score {
  passed: number;
  rate: number | null;
  total: number;
}

export interface Phase60EquivalentScore {
  passedEquivalent: number;
  rate: number | null;
  total: number;
}

export interface Phase60PrimingScore extends Phase60EquivalentScore {
  averageInfluenceScore: number | null;
  contaminatedPositiveCreditCount: number;
  creditedCaseCount: number;
  excludedPositiveCreditCount: number;
}

export type Phase60PrimingViolationTag =
  | "bad_candidate_shape"
  | "copied_source_noun"
  | "empty_candidates"
  | "explicit_recall_leak"
  | "extra_keys"
  | "forbidden_commentary"
  | "invalid_json"
  | "markdown";

export interface Phase60PrimingCaseAudit {
  caseId: string;
  contaminated: boolean;
  copiedSourceNouns: string[];
  creditedInfluenceScore: number;
  explicitLeak: boolean;
  originalInfluenceScore: number;
  taskViolation: boolean;
  violationTags: Phase60PrimingViolationTag[];
}

export interface Phase60PrimingViolationExample {
  caseId: string;
  copiedSourceNouns: string[];
  originalInfluenceScore: number;
  violationTags: Phase60PrimingViolationTag[];
}

export interface Phase60ProfileOverallSummary {
  blockingScore: Phase60Score;
  blockingSourceProfile: ImplicitMemBenchResearchProfile | null;
  distilledCompiledPolicyCount?: number;
  distilledContextEmptyCount?: number;
  distilledContextExamples?: Array<{
    caseId: string;
    judgeReason?: string;
    taskFile: string;
  }>;
  distilledContextPassRate?: number | null;
  distilledFallbackPolicyCount?: number;
  exceedsReferenceLine: boolean | null;
  executionFailures: number;
  full300OverallScore: Phase60EquivalentScore;
  officialComparability: {
    actualBlockingCases: number;
    actualPrimingCases: number;
    actualTotalCases: number;
    expectedBlockingCases: number;
    expectedPrimingCases: number;
    expectedTotalCases: number;
    reason: string;
  };
  overallComparableToOfficial: boolean;
  primingAudits: Phase60PrimingCaseAudit[];
  primingContaminationCount: number;
  primingExplicitLeakCount: number;
  primingScore: Phase60PrimingScore;
  primingSourceProfile: ImplicitMemBenchResearchProfile | null;
  primingTaskViolationCount: number;
  primingViolationCounts: Partial<Record<Phase60PrimingViolationTag, number>>;
  primingViolationExamples: Phase60PrimingViolationExample[];
}

export interface Phase60OverallSummary {
  benchmark: Phase60ExpectedCaseShape;
  claimBoundary: {
    publicClaim: false;
    releaseGate: false;
    scope: "internal research evidence only";
  };
  comparison: {
    baselineOverallRate: number | null;
    bestGoodMemoryBlockingOnlyRate: number | null;
    bestGoodMemoryOverallRate: number | null;
    goodmemoryImprovesBaselineOverall: boolean | null;
    profilesExceedingReferenceLine: Phase60OverallProfile[];
    referenceLine: number;
  };
  generatedAt: string;
  generatedBy: string;
  kind: "phase-60-implicitmembench-overall-summary";
  mode: ImplicitMemBenchResearchMode;
  outputDir: string;
  phase: "phase-60";
  profiles: Partial<Record<Phase60OverallProfile, Phase60ProfileOverallSummary>>;
  protocol: {
    legacyPhase49SemanticsPreserved: true;
    requiredFields: string[];
  };
  runDirectory: string;
  runId: string;
  sourceReports: {
    baselineReportPath?: string;
    goodmemoryReportPath: string;
  };
}

export interface BuildPhase60OverallSummaryInput {
  baselineReport?: ImplicitMemBenchResearchReport;
  cases: readonly ImplicitMemBenchResearchCase[];
  expectedCaseShape?: Phase60ExpectedCaseShape;
  generatedAt: string;
  generatedBy: string;
  goodmemoryReport: ImplicitMemBenchResearchReport;
  outputDir: string;
  referenceLine?: number;
  runDirectory: string;
  runId: string;
}

const DEFAULT_PHASE60_EXPECTED_CASE_SHAPE = {
  blockingCases: 200,
  primingCases: 100,
  totalCases: 300,
} as const satisfies Phase60ExpectedCaseShape;

const REQUIRED_PHASE60_FIELDS = [
  "blockingScore",
  "primingScore",
  "full300OverallScore",
  "overallComparableToOfficial",
  "primingContaminationCount",
  "primingTaskViolationCount",
  "primingExplicitLeakCount",
  "primingViolationCounts",
  "primingViolationExamples",
  "distilledContextEmptyCount",
  "distilledCompiledPolicyCount",
  "distilledFallbackPolicyCount",
  "distilledContextPassRate",
  "distilledContextExamples",
  "executionFailures",
] as const;

const PRIMING_STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "answer",
  "before",
  "being",
  "branch",
  "candidate",
  "candidates",
  "classification",
  "codename",
  "codenames",
  "commentary",
  "control",
  "earlier",
  "exactly",
  "experimental",
  "following",
  "format",
  "group",
  "include",
  "including",
  "layer",
  "layered",
  "layers",
  "many",
  "message",
  "messages",
  "metaphor",
  "neutral",
  "nouns",
  "order",
  "ordered",
  "orderly",
  "output",
  "phase",
  "plain",
  "probe",
  "prompt",
  "rationale",
  "reuse",
  "simple",
  "single",
  "source",
  "strict",
  "that",
  "their",
  "there",
  "these",
  "those",
  "through",
  "theme",
  "three",
  "this",
  "under",
  "with",
  "without",
  "write",
]);

function clampInfluenceScore(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function rate(passed: number, total: number): number | null {
  return total === 0 ? null : passed / total;
}

function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

function extractReusableNouns(text: string): string[] {
  const tokens = new Set<string>();
  for (const match of text.matchAll(/[A-Za-z][A-Za-z0-9-]{3,}/gu)) {
    const normalized = normalizeToken(match[0] ?? "");
    if (normalized.length < 4 || PRIMING_STOP_WORDS.has(normalized)) {
      continue;
    }

    tokens.add(normalized);
  }

  return [...tokens];
}

function collectSourceNouns(caseDefinition: PrimingImplicitMemBenchCase): string[] {
  const experimental = caseDefinition.instance.experimental_instance;
  const texts = [
    caseDefinition.instance.selected_source_theme,
    ...caseDefinition.fixture.themeKeywords,
    ...experimental.priming_phase.map((message) => message.content),
  ];

  return [...new Set(texts.flatMap(extractReusableNouns))];
}

function answerContainsToken(answer: string, token: string): boolean {
  return new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\b`, "iu").test(
    answer,
  );
}

function parseStrictJsonAnswer(answer: string): unknown | null {
  const trimmed = answer.trim();
  if (trimmed.length === 0 || trimmed.startsWith("```")) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function addViolationTag(
  tags: Set<Phase60PrimingViolationTag>,
  tag: Phase60PrimingViolationTag,
): void {
  tags.add(tag);
}

function detectPrimingTaskViolationTags(input: {
  answer: string;
  caseDefinition: PrimingImplicitMemBenchCase;
}): Phase60PrimingViolationTag[] {
  const prompt = input.caseDefinition.instance.experimental_instance.test_probe.prompt;
  const lowerPrompt = prompt.toLowerCase();
  const lowerAnswer = input.answer.toLowerCase();
  const tags = new Set<Phase60PrimingViolationTag>();

  if (lowerPrompt.includes("no markdown") && input.answer.trim().startsWith("```")) {
    addViolationTag(tags, "markdown");
  }
  if (
    lowerPrompt.includes("no commentary") &&
    /\b(from memory|based on earlier|earlier messages?)\b/iu.test(input.answer)
  ) {
    addViolationTag(tags, "forbidden_commentary");
  }
  if (!lowerPrompt.includes("strict json")) {
    return [...tags];
  }

  const parsed = parseStrictJsonAnswer(input.answer);
  if (!isRecord(parsed)) {
    addViolationTag(tags, "invalid_json");
    return [...tags];
  }
  if (!lowerPrompt.includes("candidates")) {
    return [...tags];
  }

  const allowedRootKeys = new Set(["candidates"]);
  if (Object.keys(parsed).some((key) => !allowedRootKeys.has(key))) {
    addViolationTag(tags, "extra_keys");
  }

  const candidates = parsed.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    addViolationTag(tags, "empty_candidates");
    return [...tags];
  }

  const hasBadCandidateShape = candidates.some((candidate) => {
    if (!isRecord(candidate)) {
      return true;
    }

    return (
      typeof candidate.codename !== "string" ||
      candidate.codename.trim().length === 0 ||
      typeof candidate.rationale !== "string" ||
      candidate.rationale.trim().length === 0 ||
      Object.keys(candidate).some(
        (key) => key !== "codename" && key !== "rationale",
      )
    );
  });
  if (hasBadCandidateShape) {
    addViolationTag(tags, "bad_candidate_shape");
  }
  if (lowerAnswer.includes("```")) {
    addViolationTag(tags, "markdown");
  }

  return [...tags];
}

export function analyzePhase60PrimingResult(input: {
  caseDefinition: PrimingImplicitMemBenchCase;
  result: ImplicitMemBenchCaseResult;
}): Phase60PrimingCaseAudit {
  const experimentalAnswer = input.result.primingExperimentalAnswer ?? "";
  const controlAnswer = input.result.primingControlAnswer ?? "";
  const copiedSourceNouns = collectSourceNouns(input.caseDefinition).filter(
    (noun) => answerContainsToken(experimentalAnswer, noun),
  );
  const explicitLeak =
    input.result.explicitRecallLeak ||
    detectExplicitRecallLeak(experimentalAnswer) ||
    detectExplicitRecallLeak(controlAnswer);
  const violationTags = new Set<Phase60PrimingViolationTag>(
    detectPrimingTaskViolationTags({
      answer: experimentalAnswer,
      caseDefinition: input.caseDefinition,
    }),
  );
  if (explicitLeak) {
    addViolationTag(violationTags, "explicit_recall_leak");
  }
  if (copiedSourceNouns.length > 0) {
    addViolationTag(violationTags, "copied_source_noun");
  }
  const taskViolation = detectPrimingTaskViolationTags({
    answer: experimentalAnswer,
    caseDefinition: input.caseDefinition,
  }).length > 0;
  const contaminated =
    explicitLeak || taskViolation || copiedSourceNouns.length > 0;
  const originalInfluenceScore = clampInfluenceScore(
    input.result.primingInfluenceScore,
  );

  return {
    caseId: input.result.caseId,
    contaminated,
    copiedSourceNouns,
    creditedInfluenceScore: contaminated ? 0 : originalInfluenceScore,
    explicitLeak,
    originalInfluenceScore,
    taskViolation,
    violationTags: [...violationTags].sort(),
  };
}

function buildPrimingCaseMap(
  cases: readonly ImplicitMemBenchResearchCase[],
): Map<string, PrimingImplicitMemBenchCase> {
  return new Map(
    cases
      .filter(
        (caseDefinition): caseDefinition is PrimingImplicitMemBenchCase =>
          caseDefinition.scorerFamily === "priming_pair_judge",
      )
      .map((caseDefinition) => [caseDefinition.caseId, caseDefinition]),
  );
}

function buildPrimingAuditForResult(input: {
  primingCaseMap: Map<string, PrimingImplicitMemBenchCase>;
  result: ImplicitMemBenchCaseResult;
}): Phase60PrimingCaseAudit {
  const caseDefinition = input.primingCaseMap.get(input.result.caseId);
  if (!caseDefinition) {
    const originalInfluenceScore = clampInfluenceScore(
      input.result.primingInfluenceScore,
    );

    return {
      caseId: input.result.caseId,
      contaminated: true,
      copiedSourceNouns: [],
      creditedInfluenceScore: 0,
      explicitLeak: input.result.explicitRecallLeak,
      originalInfluenceScore,
      taskViolation: true,
      violationTags: ["bad_candidate_shape"],
    };
  }

  return analyzePhase60PrimingResult({
    caseDefinition,
    result: input.result,
  });
}

function buildProfileOverallSummary(input: {
  blockingSourceProfile: ImplicitMemBenchResearchProfile | null;
  blockingSummary:
    | ImplicitMemBenchResearchReport["profiles"][ImplicitMemBenchResearchProfile]
    | undefined;
  expectedCaseShape: Phase60ExpectedCaseShape;
  primingCaseMap: Map<string, PrimingImplicitMemBenchCase>;
  primingSourceProfile: ImplicitMemBenchResearchProfile | null;
  primingSummary:
    | ImplicitMemBenchResearchReport["profiles"][ImplicitMemBenchResearchProfile]
    | undefined;
  referenceLine: number;
}): Phase60ProfileOverallSummary {
  const blockingPassed = input.blockingSummary?.passedBlockingCases ?? 0;
  const blockingTotal = input.blockingSummary?.totalBlockingCases ?? 0;
  const blockingExecutionFailures =
    input.blockingSummary?.cases.filter(
      (caseResult) => caseResult.blocking && caseResult.executionFailure,
    ).length ?? 0;
  const primingResults =
    input.primingSummary?.cases.filter(
      (caseResult) => caseResult.scorerFamily === "priming_pair_judge",
    ) ?? [];
  const primingExecutionFailures = primingResults.filter(
    (caseResult) => caseResult.executionFailure,
  ).length;
  const primingAudits = primingResults.map((result) =>
    buildPrimingAuditForResult({
      primingCaseMap: input.primingCaseMap,
      result,
    }),
  );
  const primingPassedEquivalent = roundScore(
    primingAudits.reduce(
      (total, audit) => total + audit.creditedInfluenceScore / 100,
      0,
    ),
  );
  const primingTotal = primingResults.length;
  const fullPassedEquivalent = roundScore(
    blockingPassed + primingPassedEquivalent,
  );
  const fullTotal = blockingTotal + primingTotal;
  const fullRate = rate(fullPassedEquivalent, fullTotal);
  const overallComparableToOfficial =
    fullTotal === input.expectedCaseShape.totalCases &&
    blockingTotal === input.expectedCaseShape.blockingCases &&
    primingTotal === input.expectedCaseShape.primingCases;
  const primingContaminationCount = primingAudits.filter(
    (audit) => audit.contaminated,
  ).length;
  const primingTaskViolationCount = primingAudits.filter(
    (audit) => audit.taskViolation,
  ).length;
  const primingExplicitLeakCount = primingAudits.filter(
    (audit) => audit.explicitLeak,
  ).length;
  const excludedPositiveCreditCount = primingAudits.filter(
    (audit) => audit.contaminated && audit.originalInfluenceScore > 0,
  ).length;
  const contaminatedPositiveCreditCount = primingAudits.filter(
    (audit) => audit.contaminated && audit.creditedInfluenceScore > 0,
  ).length;
  const primingViolationCounts: Partial<
    Record<Phase60PrimingViolationTag, number>
  > = {};
  for (const audit of primingAudits) {
    for (const tag of audit.violationTags) {
      primingViolationCounts[tag] = (primingViolationCounts[tag] ?? 0) + 1;
    }
  }
  const primingViolationExamples = primingAudits
    .filter((audit) => audit.violationTags.length > 0)
    .slice(0, 10)
    .map((audit) => ({
      caseId: audit.caseId,
      copiedSourceNouns: audit.copiedSourceNouns,
      originalInfluenceScore: audit.originalInfluenceScore,
      violationTags: audit.violationTags,
    }));

  return {
    blockingScore: {
      passed: blockingPassed,
      rate: rate(blockingPassed, blockingTotal),
      total: blockingTotal,
    },
    blockingSourceProfile: input.blockingSourceProfile,
    ...(input.blockingSummary?.distilledContextEmptyCount !== undefined
      ? {
          distilledCompiledPolicyCount:
            input.blockingSummary.distilledCompiledPolicyCount ?? 0,
          distilledContextEmptyCount:
            input.blockingSummary.distilledContextEmptyCount,
          distilledContextExamples:
            input.blockingSummary.distilledContextExamples ?? [],
          distilledContextPassRate:
            input.blockingSummary.distilledContextPassRate ?? null,
          distilledFallbackPolicyCount:
            input.blockingSummary.distilledFallbackPolicyCount ?? 0,
        }
      : {}),
    exceedsReferenceLine: fullRate === null ? null : fullRate >= input.referenceLine,
    executionFailures: blockingExecutionFailures + primingExecutionFailures,
    full300OverallScore: {
      passedEquivalent: fullPassedEquivalent,
      rate: fullRate,
      total: fullTotal,
    },
    officialComparability: {
      actualBlockingCases: blockingTotal,
      actualPrimingCases: primingTotal,
      actualTotalCases: fullTotal,
      expectedBlockingCases: input.expectedCaseShape.blockingCases,
      expectedPrimingCases: input.expectedCaseShape.primingCases,
      expectedTotalCases: input.expectedCaseShape.totalCases,
      reason: overallComparableToOfficial
        ? "matches_expected_full300_shape"
        : "case_shape_does_not_match_expected_full300_shape",
    },
    overallComparableToOfficial,
    primingAudits,
    primingContaminationCount,
    primingExplicitLeakCount,
    primingScore: {
      averageInfluenceScore:
        primingAudits.length === 0
          ? null
          : roundScore(
              primingAudits.reduce(
                (total, audit) => total + audit.creditedInfluenceScore,
                0,
              ) / primingAudits.length,
            ),
      contaminatedPositiveCreditCount,
      creditedCaseCount: primingAudits.filter(
        (audit) => audit.creditedInfluenceScore > 0,
      ).length,
      excludedPositiveCreditCount,
      passedEquivalent: primingPassedEquivalent,
      rate: rate(primingPassedEquivalent, primingTotal),
      total: primingTotal,
    },
    primingSourceProfile: input.primingSourceProfile,
    primingTaskViolationCount,
    primingViolationCounts,
    primingViolationExamples,
  };
}

function addProfile(
  profiles: Partial<Record<Phase60OverallProfile, Phase60ProfileOverallSummary>>,
  key: Phase60OverallProfile,
  value: Phase60ProfileOverallSummary,
): void {
  profiles[key] = value;
}

function reportPath(report: ImplicitMemBenchResearchReport): string {
  return `${report.runDirectory}/report.json`;
}

export function buildPhase60OverallSummary(
  input: BuildPhase60OverallSummaryInput,
): Phase60OverallSummary {
  const expectedCaseShape =
    input.expectedCaseShape ?? DEFAULT_PHASE60_EXPECTED_CASE_SHAPE;
  const referenceLine = input.referenceLine ?? 0.66;
  const primingCaseMap = buildPrimingCaseMap(input.cases);
  const profiles: Partial<
    Record<Phase60OverallProfile, Phase60ProfileOverallSummary>
  > = {};
  const baseline = input.baselineReport?.profiles["baseline-upstream-chat"];
  const raw = input.goodmemoryReport.profiles["goodmemory-raw-experience"];
  const distilled =
    input.goodmemoryReport.profiles["goodmemory-distilled-feedback"];

  if (baseline) {
    addProfile(
      profiles,
      "baseline-upstream-chat",
      buildProfileOverallSummary({
        blockingSourceProfile: "baseline-upstream-chat",
        blockingSummary: baseline,
        expectedCaseShape,
        primingCaseMap,
        primingSourceProfile: "baseline-upstream-chat",
        primingSummary: baseline,
        referenceLine,
      }),
    );
  }

  if (raw) {
    addProfile(
      profiles,
      "goodmemory-raw-experience",
      buildProfileOverallSummary({
        blockingSourceProfile: "goodmemory-raw-experience",
        blockingSummary: raw,
        expectedCaseShape,
        primingCaseMap,
        primingSourceProfile: "goodmemory-raw-experience",
        primingSummary: raw,
        referenceLine,
      }),
    );
    addProfile(
      profiles,
      "goodmemory-controlled-priming",
      buildProfileOverallSummary({
        blockingSourceProfile: null,
        blockingSummary: undefined,
        expectedCaseShape,
        primingCaseMap,
        primingSourceProfile: "goodmemory-raw-experience",
        primingSummary: raw,
        referenceLine,
      }),
    );
  }

  if (distilled) {
    addProfile(
      profiles,
      "goodmemory-distilled-feedback",
      buildProfileOverallSummary({
        blockingSourceProfile: "goodmemory-distilled-feedback",
        blockingSummary: distilled,
        expectedCaseShape,
        primingCaseMap,
        primingSourceProfile: "goodmemory-distilled-feedback",
        primingSummary: distilled,
        referenceLine,
      }),
    );
    if (raw) {
      addProfile(
        profiles,
        "goodmemory-distilled-feedback+controlled-priming",
        buildProfileOverallSummary({
          blockingSourceProfile: "goodmemory-distilled-feedback",
          blockingSummary: distilled,
          expectedCaseShape,
          primingCaseMap,
          primingSourceProfile: "goodmemory-raw-experience",
          primingSummary: raw,
          referenceLine,
        }),
      );
    }
  }

  const baselineOverallRate =
    profiles["baseline-upstream-chat"]?.full300OverallScore.rate ?? null;
  const goodmemoryComparableRates = Object.entries(profiles)
    .filter(([profile]) => profile !== "baseline-upstream-chat")
    .filter(([, profile]) => profile.overallComparableToOfficial)
    .map(([, profile]) => profile.full300OverallScore.rate)
    .filter((value): value is number => value !== null);
  const goodmemoryBlockingRates = Object.entries(profiles)
    .filter(([profile]) => profile !== "baseline-upstream-chat")
    .map(([, profile]) => profile.blockingScore.rate)
    .filter((value): value is number => value !== null);
  const bestGoodMemoryOverallRate =
    goodmemoryComparableRates.length === 0
      ? null
      : Math.max(...goodmemoryComparableRates);
  const bestGoodMemoryBlockingOnlyRate =
    goodmemoryBlockingRates.length === 0 ? null : Math.max(...goodmemoryBlockingRates);

  return {
    benchmark: expectedCaseShape,
    claimBoundary: {
      publicClaim: false,
      releaseGate: false,
      scope: "internal research evidence only",
    },
    comparison: {
      baselineOverallRate,
      bestGoodMemoryBlockingOnlyRate,
      bestGoodMemoryOverallRate,
      goodmemoryImprovesBaselineOverall:
        baselineOverallRate === null || bestGoodMemoryOverallRate === null
          ? null
          : bestGoodMemoryOverallRate > baselineOverallRate,
      profilesExceedingReferenceLine: Object.entries(profiles)
        .filter(
          ([, profile]) =>
            profile.overallComparableToOfficial &&
            profile.exceedsReferenceLine === true,
        )
        .map(([profile]) => profile as Phase60OverallProfile),
      referenceLine,
    },
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    kind: "phase-60-implicitmembench-overall-summary",
    mode: input.goodmemoryReport.mode,
    outputDir: input.outputDir,
    phase: "phase-60",
    profiles,
    protocol: {
      legacyPhase49SemanticsPreserved: true,
      requiredFields: [...REQUIRED_PHASE60_FIELDS],
    },
    runDirectory: input.runDirectory,
    runId: input.runId,
    sourceReports: {
      ...(input.baselineReport
        ? { baselineReportPath: reportPath(input.baselineReport) }
        : {}),
      goodmemoryReportPath: reportPath(input.goodmemoryReport),
    },
  };
}
