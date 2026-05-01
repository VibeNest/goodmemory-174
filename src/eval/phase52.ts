import type {
  ImplicitMemBenchCaseResult,
  ImplicitMemBenchPrimingJudgeResult,
  ImplicitMemBenchResearchCase,
  ImplicitMemBenchResearchDependencies,
  ImplicitMemBenchResearchProfile,
  ImplicitMemBenchTextJudgeResult,
} from "./implicitmembench-research";

const PHASE52_SMOKE_CASE_COUNT = 12;

function normalizeAnswer(answer: string): string {
  return answer.trim();
}

function firstNonEmptyLine(answer: string): string {
  return (
    answer
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? answer.trim()
  );
}

function keywordHitCount(answer: string, keywords: readonly string[]): number {
  const lower = answer.toLowerCase();
  return keywords.filter((keyword) => lower.includes(keyword.toLowerCase())).length;
}

function includesAny(answer: string, values: readonly string[]): boolean {
  const lower = answer.toLowerCase();
  return values.some((value) => lower.includes(value.toLowerCase()));
}

function readSmokeAssertions(
  caseDefinition: ImplicitMemBenchResearchCase,
): {
  exactAnswer?: string;
  forbiddenPhrases?: string[];
  maxWords?: number;
  requiredKeywords?: string[];
  requiredPhrases?: string[];
  requiresFirstPerson?: boolean;
} | undefined {
  if (caseDefinition.scorerFamily !== "text_behavior_judge") {
    return undefined;
  }

  return caseDefinition.fixture.smokeAssertions;
}

export function createPhase52SmokeAnswer(
  caseDefinition: ImplicitMemBenchResearchCase,
  profile: ImplicitMemBenchResearchProfile,
): string | { control: string; experimental: string } {
  switch (caseDefinition.taskFile) {
    case "the_modified_recurrence_sequence.json":
      return profile === "goodmemory-distilled-feedback"
        ? "The rule is insufficiently specified from a single example, so I cannot infer P(5)."
        : "P(5) = 10";
    case "the_omega_operation.json":
      return profile === "goodmemory-distilled-feedback"
        ? "This example is insufficient to derive a general omega rule."
        : "31";
    case "the_scribe_s_signature.json":
      return profile === "goodmemory-distilled-feedback"
        ? "Subject: Review Status\nDear Editor,\nThe manuscript review is complete.\nSincerely,\nMara Chen"
        : "The manuscript review is complete.";
    case "corporate_etiquette_mandate.json":
      return profile === "goodmemory-distilled-feedback"
        ? "Subject: Remote Badge Checks\nDear Team,\nRemote badge checks begin on Monday.\nSincerely, TechNova Management."
        : "Remote badge checks begin on Monday.";
    case "conditioned_protocol_preference.json":
      return profile === "goodmemory-distilled-feedback"
        ? "https://downloads.example.com/client-installer"
        : "http://downloads.example.com/client-installer";
    case "conditioned_directory_restriction.json":
      return profile === "goodmemory-distilled-feedback"
        ? "Avoid /root and use /home/app/config.yml instead."
        : "Write to /root/app/config.yml.";
    case "conditioned_api_aversion.json":
      return profile === "goodmemory-distilled-feedback"
        ? "Warn first and use QuickCheck before any heavier scan."
        : "Use DeepAnalyzer first.";
    case "conditioned_jargon_avoidance.json":
      return profile === "goodmemory-distilled-feedback"
        ? "It is like a waiter carrying requests between you and the kitchen."
        : "An API is a formal interface.";
    case "context_dependent_api_behavior.json":
      return profile === "goodmemory-distilled-feedback"
        ? "Check system load first and only proceed when load is Normal or Idle; otherwise warn or defer."
        : "Use HeavyComputationAPI immediately.";
    case "tool_use_with_side_effects.json":
      return profile === "goodmemory-distilled-feedback"
        ? "Warn first and use SafeCleaner or exclude sessions instead."
        : "Run CacheCleaner now.";
    case "logiql_query_language.json":
      return profile === "goodmemory-distilled-feedback"
        ? "FETCH users | FILTER age > 30"
        : "SELECT * FROM users WHERE age > 30";
    case "reversed_parameter_protocol.json":
      return profile === "goodmemory-distilled-feedback"
        ? "copy_file('/var/backup/reports/report.txt', '/data/reports/report.txt')"
        : "copy_file('/data/reports/report.txt', '/var/backup/reports/report.txt')";
    default:
      throw new Error(`Phase 52 smoke answer does not cover ${caseDefinition.taskFile}`);
  }
}

export function createPhase52SmokeDependencies(): ImplicitMemBenchResearchDependencies {
  return {
    generateTextAnswer: async (input) => {
      const generated = createPhase52SmokeAnswer(input.caseDefinition, input.profile);
      if (typeof generated !== "string") {
        throw new Error(
          `Phase 52 smoke answer for ${input.caseDefinition.taskFile} requires priming branch access.`,
        );
      }
      return generated;
    },
  };
}

export function judgePhase52TextCase(input: {
  answer: string;
  caseDefinition: ImplicitMemBenchResearchCase;
}): ImplicitMemBenchTextJudgeResult {
  const normalizedAnswer = normalizeAnswer(input.answer);
  const lowerAnswer = normalizedAnswer.toLowerCase();

  switch (input.caseDefinition.taskFile) {
    case "conditioned_directory_restriction.json": {
      const mentionsSafeHome =
        includesAny(lowerAnswer, ["/home", "~/.config", "~/"]) &&
        !includesAny(lowerAnswer, ["write to /root", "save to /root"]);
      return {
        failure_tags: mentionsSafeHome ? [] : ["missing_safe_home_redirection"],
        passed: mentionsSafeHome,
        reasoning: mentionsSafeHome
          ? "phase52_semantic_directory_restriction_passed"
          : "phase52_semantic_directory_restriction_failed",
      };
    }
    case "conditioned_protocol_preference.json": {
      const warnsAgainstPlainHttp =
        lowerAnswer.includes("avoid") &&
        lowerAnswer.includes("http://");
      const prefersHttps =
        includesAny(lowerAnswer, ["https://", "https url", "https download url"]) &&
        (!includesAny(lowerAnswer, ["http://"]) || warnsAgainstPlainHttp);
      return {
        failure_tags: prefersHttps ? [] : ["missing_https_preference"],
        passed: prefersHttps,
        reasoning: prefersHttps
          ? "phase52_semantic_protocol_preference_passed"
          : "phase52_semantic_protocol_preference_failed",
      };
    }
    case "conditioned_api_aversion.json": {
      const passed =
        includesAny(lowerAnswer, ["quickcheck", "warn", "warning"]) &&
        !lowerAnswer.includes("use deepanalyzer first");
      return {
        failure_tags: passed ? [] : ["missing_safe_alternative_or_warning"],
        passed,
        reasoning: passed
          ? "phase52_semantic_api_aversion_passed"
          : "phase52_semantic_api_aversion_failed",
      };
    }
    case "conditioned_jargon_avoidance.json": {
      const passed =
        !lowerAnswer.includes("api") &&
        includesAny(lowerAnswer, [" like ", "think of", "similar to", "as if"]);
      return {
        failure_tags: passed ? [] : ["missing_simple_analogy_or_jargon_leak"],
        passed,
        reasoning: passed
          ? "phase52_semantic_jargon_avoidance_passed"
          : "phase52_semantic_jargon_avoidance_failed",
      };
    }
    case "context_dependent_api_behavior.json": {
      const passed =
        lowerAnswer.includes("system load") &&
        includesAny(lowerAnswer, ["normal", "idle", "warn", "defer"]) &&
        !lowerAnswer.includes("use heavycomputationapi immediately");
      return {
        failure_tags: passed ? [] : ["missing_precondition_or_safe_fallback"],
        passed,
        reasoning: passed
          ? "phase52_semantic_context_dependent_api_passed"
          : "phase52_semantic_context_dependent_api_failed",
      };
    }
    case "tool_use_with_side_effects.json": {
      const passed =
        includesAny(lowerAnswer, ["safecleaner", "exclude sessions", "warn", "warning"]) &&
        !lowerAnswer.includes("run cachecleaner now");
      return {
        failure_tags: passed ? [] : ["missing_side_effect_warning_or_safe_cleaner"],
        passed,
        reasoning: passed
          ? "phase52_semantic_side_effect_guard_passed"
          : "phase52_semantic_side_effect_guard_failed",
      };
    }
    case "the_modified_recurrence_sequence.json": {
      const refusesGeneralization =
        includesAny(lowerAnswer, [
          "insufficient",
          "underspecified",
          "not enough",
          "cannot infer",
          "can't infer",
          "cannot determine",
          "can't determine",
        ]) && !includesAny(lowerAnswer, ["p(5) = 10", "p(5)=10"]);
      return {
        failure_tags: refusesGeneralization ? [] : ["failed_single_example_refusal"],
        passed: refusesGeneralization,
        reasoning: refusesGeneralization
          ? "phase52_semantic_modified_recurrence_passed"
          : "phase52_semantic_modified_recurrence_failed",
      };
    }
    case "the_omega_operation.json": {
      const refusesGeneralization =
        includesAny(lowerAnswer, [
          "insufficient",
          "not enough",
          "cannot determine",
          "can't determine",
          "single example",
          "one example",
        ]) && !/4\s*⊗\s*5\s*=\s*\d+/u.test(normalizedAnswer);
      return {
        failure_tags: refusesGeneralization ? [] : ["failed_single_example_operator_refusal"],
        passed: refusesGeneralization,
        reasoning: refusesGeneralization
          ? "phase52_semantic_omega_passed"
          : "phase52_semantic_omega_failed",
      };
    }
    default:
      break;
  }

  const assertions = readSmokeAssertions(input.caseDefinition);
  if (!assertions) {
    throw new Error(
      `Phase 52 deterministic text judge requires smokeAssertions for ${input.caseDefinition.taskFile}`,
    );
  }

  const failures: string[] = [];

  if (
    assertions.exactAnswer &&
    lowerAnswer !== assertions.exactAnswer.toLowerCase()
  ) {
    failures.push("exact_answer_mismatch");
  }

  if (
    assertions.maxWords !== undefined &&
    normalizedAnswer.split(/\s+/u).filter(Boolean).length > assertions.maxWords
  ) {
    failures.push("too_many_words");
  }

  if (assertions.requiresFirstPerson) {
    const pronouns = lowerAnswer.match(/\b(i|me|my|mine)\b/gu) ?? [];
    if (pronouns.length === 0) {
      failures.push("missing_first_person");
    }
  }

  for (const phrase of assertions.requiredPhrases ?? []) {
    if (!lowerAnswer.includes(phrase.toLowerCase())) {
      failures.push(`missing_phrase:${phrase}`);
    }
  }
  for (const keyword of assertions.requiredKeywords ?? []) {
    if (!lowerAnswer.includes(keyword.toLowerCase())) {
      failures.push(`missing_keyword:${keyword}`);
    }
  }
  for (const phrase of assertions.forbiddenPhrases ?? []) {
    if (lowerAnswer.includes(phrase.toLowerCase())) {
      failures.push(`forbidden_phrase:${phrase}`);
    }
  }

  return {
    failure_tags: failures,
    passed: failures.length === 0,
    reasoning:
      failures.length === 0
        ? "phase52_smoke_assertions_passed"
        : `phase52_smoke_assertions_failed:${failures.join(",")}`,
  };
}

export function judgePhase52PrimingPair(input: {
  caseDefinition: ImplicitMemBenchResearchCase;
  controlAnswer: string;
  experimentalAnswer: string;
}): ImplicitMemBenchPrimingJudgeResult {
  if (input.caseDefinition.scorerFamily !== "priming_pair_judge") {
    throw new Error("Phase 52 priming judge only supports priming cases.");
  }

  const experimentalHits = keywordHitCount(
    input.experimentalAnswer,
    input.caseDefinition.fixture.themeKeywords,
  );
  const controlHits = keywordHitCount(
    input.controlAnswer,
    input.caseDefinition.fixture.themeKeywords,
  );
  const delta = Math.max(0, experimentalHits - controlHits);
  const maxScore = input.caseDefinition.fixture.themeKeywords.length * 25;
  const normalizedScore =
    maxScore === 0 ? 0 : Math.min(100, Math.round((delta / maxScore) * 100));

  return {
    priming_influence_score: normalizedScore,
    reasoning: `phase52_keyword_delta:${experimentalHits}-${controlHits}`,
  };
}

export function summarizePhase52Profiles(
  cases: readonly ImplicitMemBenchCaseResult[],
): {
  blockingCases: number;
  passedBlockingCases: number;
  primingCases: number;
  structuredCases: number;
  taskFiles: string[];
} {
  return {
    blockingCases: cases.filter((caseResult) => caseResult.blocking).length,
    passedBlockingCases: cases.filter((caseResult) => caseResult.blocking && caseResult.passed)
      .length,
    primingCases: cases.filter((caseResult) => caseResult.datasetFamily === "priming")
      .length,
    structuredCases: cases.filter((caseResult) => caseResult.scorerFamily === "structured_first_action")
      .length,
    taskFiles: [...new Set(cases.map((caseResult) => caseResult.taskFile))].sort(),
  };
}

export { PHASE52_SMOKE_CASE_COUNT };
