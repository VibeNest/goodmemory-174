import type {
  ImplicitMemBenchCaseResult,
  ImplicitMemBenchPrimingJudgeResult,
  ImplicitMemBenchResearchCase,
  ImplicitMemBenchResearchDependencies,
  ImplicitMemBenchResearchProfile,
  ImplicitMemBenchTextJudgeResult,
} from "./implicitmembench-research";

const PHASE51_SMOKE_CASE_COUNT = 9;

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

export function createPhase51SmokeAnswer(
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
    case "logiql_query_language.json":
      return profile === "goodmemory-distilled-feedback"
        ? "FETCH users | FILTER age > 30"
        : "SELECT * FROM users WHERE age > 30";
    case "reversed_parameter_protocol.json":
      return profile === "goodmemory-distilled-feedback"
        ? "copy_file('/var/backup/reports/report.txt', '/data/reports/report.txt')"
        : "copy_file('/data/reports/report.txt', '/var/backup/reports/report.txt')";
    case "volcanic_eruption.json":
      return profile === "goodmemory-distilled-feedback"
        ? {
            control:
              "{\"candidates\":[{\"codename\":\"Vector Loom\",\"rationale\":\"It suggests disciplined compression through ordered structure without overt thematic spillover.\"},{\"codename\":\"Quiet Span\",\"rationale\":\"It suggests compact transfer through calm structural continuity rather than dramatic release.\"},{\"codename\":\"Signal Fold\",\"rationale\":\"It suggests efficient contraction through neat layered motion and stable form.\"}]}",
            experimental:
              "{\"candidates\":[{\"codename\":\"Basalt Veil\",\"rationale\":\"It suggests heat-forged compression released through dense layered pressure and controlled concealment.\"},{\"codename\":\"Ash Lattice\",\"rationale\":\"It suggests compact structure born from drifting residue settling into disciplined geometric order.\"},{\"codename\":\"Magma Fold\",\"rationale\":\"It suggests force gathered under pressure before collapsing into a dense efficient form.\"}]}"
          }
        : {
            control:
              "{\"candidates\":[{\"codename\":\"Vector Loom\",\"rationale\":\"It suggests disciplined compression through ordered structure without overt thematic spillover.\"},{\"codename\":\"Quiet Span\",\"rationale\":\"It suggests compact transfer through calm structural continuity rather than dramatic release.\"},{\"codename\":\"Signal Fold\",\"rationale\":\"It suggests efficient contraction through neat layered motion and stable form.\"}]}",
            experimental:
              "{\"candidates\":[{\"codename\":\"Vector Loom\",\"rationale\":\"It suggests disciplined compression through ordered structure without overt thematic spillover.\"},{\"codename\":\"Quiet Span\",\"rationale\":\"It suggests compact transfer through calm structural continuity rather than dramatic release.\"},{\"codename\":\"Signal Fold\",\"rationale\":\"It suggests efficient contraction through neat layered motion and stable form.\"}]}"
          };
    default:
      throw new Error(`Phase 51 smoke answer does not cover ${caseDefinition.taskFile}`);
  }
}

export function createPhase51SmokeDependencies(): ImplicitMemBenchResearchDependencies {
  return {
    generateTextAnswer: async (input) => {
      const generated = createPhase51SmokeAnswer(input.caseDefinition, input.profile);
      if (typeof generated !== "string") {
        throw new Error(
          `Phase 51 smoke answer for ${input.caseDefinition.taskFile} requires priming branch access.`,
        );
      }
      return generated;
    },
  };
}

export function judgePhase51TextCase(input: {
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
          ? "phase51_semantic_directory_restriction_passed"
          : "phase51_semantic_directory_restriction_failed",
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
          ? "phase51_semantic_protocol_preference_passed"
          : "phase51_semantic_protocol_preference_failed",
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
          ? "phase51_semantic_modified_recurrence_passed"
          : "phase51_semantic_modified_recurrence_failed",
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
          ? "phase51_semantic_omega_passed"
          : "phase51_semantic_omega_failed",
      };
    }
    default:
      break;
  }

  const assertions = readSmokeAssertions(input.caseDefinition);
  if (!assertions) {
    throw new Error(
      `Phase 51 deterministic text judge requires smokeAssertions for ${input.caseDefinition.taskFile}`,
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
        ? "phase51_smoke_assertions_passed"
        : `phase51_smoke_assertions_failed:${failures.join(",")}`,
  };
}

export function judgePhase51PrimingPair(input: {
  caseDefinition: ImplicitMemBenchResearchCase;
  controlAnswer: string;
  experimentalAnswer: string;
}): ImplicitMemBenchPrimingJudgeResult {
  if (input.caseDefinition.scorerFamily !== "priming_pair_judge") {
    throw new Error("Phase 51 priming judge only supports priming cases.");
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
    reasoning: `phase51_keyword_delta:${experimentalHits}-${controlHits}`,
  };
}

export { PHASE51_SMOKE_CASE_COUNT };
