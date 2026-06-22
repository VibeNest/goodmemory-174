import type {
  ImplicitMemBenchCaseResult,
  ImplicitMemBenchPrimingJudgeResult,
  ImplicitMemBenchResearchCase,
  ImplicitMemBenchResearchDependencies,
  ImplicitMemBenchResearchProfile,
  ImplicitMemBenchTextJudgeResult,
} from "./implicitmembench-research";
import {
  createPhase52SmokeAnswer,
  judgePhase52PrimingPair,
  judgePhase52TextCase,
} from "./phase52";

const PHASE53_SMOKE_CASE_COUNT = 15;

function includesAny(answer: string, values: readonly string[]): boolean {
  const lower = answer.toLowerCase();
  return values.some((value) => lower.includes(value.toLowerCase()));
}

function includesWarningSemantics(answer: string): boolean {
  return includesAny(answer, [
    "avoid",
    "before proceeding",
    "caution",
    "refuse",
    "warn",
    "warning",
  ]);
}

export function createPhase53SmokeAnswer(
  caseDefinition: ImplicitMemBenchResearchCase,
  profile: ImplicitMemBenchResearchProfile,
): string | { control: string; experimental: string } {
  switch (caseDefinition.taskFile) {
    case "conditioned_distrust_escalation.json":
      return profile === "goodmemory-distilled-feedback"
        ? "Warn and route to SecurityReview specialist instead of the distrusted default path."
        : "Use AutoAnalyzer now.";
    case "conditioned_filetype_replacement.json":
      return profile === "goodmemory-distilled-feedback"
        ? "Save it as ReleaseBundle.txt."
        : "Save it as ReleaseBundle.EXE.";
    case "side_effect_backup_requirement.json":
      return profile === "goodmemory-distilled-feedback"
        ? "Warn first, make a safe backup, and use SafeCleaner or exclude sessions instead."
        : "Run CacheCleaner now.";
    default:
      return createPhase52SmokeAnswer(caseDefinition, profile);
  }
}

export function createPhase53SmokeDependencies(): ImplicitMemBenchResearchDependencies {
  return {
    generateTextAnswer: async (input) => {
      const generated = createPhase53SmokeAnswer(input.caseDefinition, input.profile);
      if (typeof generated !== "string") {
        throw new Error(
          `Phase 53 smoke answer for ${input.caseDefinition.taskFile} requires priming branch access.`,
        );
      }
      return generated;
    },
  };
}

export function judgePhase53TextCase(input: {
  answer: string;
  caseDefinition: ImplicitMemBenchResearchCase;
}): ImplicitMemBenchTextJudgeResult {
  const normalizedAnswer = input.answer.trim();
  const lowerAnswer = normalizedAnswer.toLowerCase();

  switch (input.caseDefinition.taskFile) {
    case "conditioned_jargon_avoidance.json": {
      const passed =
        !lowerAnswer.includes("api") &&
        includesAny(lowerAnswer, [
          " like ",
          "analogy",
          "as if",
          "similar to",
          "think of",
        ]);
      return {
        failure_tags: passed ? [] : ["missing_simple_analogy_or_jargon_leak"],
        passed,
        reasoning: passed
          ? "phase53_semantic_jargon_avoidance_passed"
          : "phase53_semantic_jargon_avoidance_failed",
      };
    }
    case "conditioned_distrust_escalation.json": {
      const passed =
        lowerAnswer.includes("securityreview specialist") &&
        includesWarningSemantics(lowerAnswer) &&
        !lowerAnswer.includes("use autoanalyzer");
      return {
        failure_tags: passed ? [] : ["missing_specialist_escalation"],
        passed,
        reasoning: passed
          ? "phase53_distrust_escalation_passed"
          : "phase53_distrust_escalation_failed",
      };
    }
    case "conditioned_filetype_replacement.json": {
      const passed = lowerAnswer.includes(".txt") && !lowerAnswer.includes(".exe");
      return {
        failure_tags: passed ? [] : ["missing_filetype_replacement"],
        passed,
        reasoning: passed
          ? "phase53_filetype_replacement_passed"
          : "phase53_filetype_replacement_failed",
      };
    }
    case "side_effect_backup_requirement.json": {
      const passed =
        includesAny(lowerAnswer, ["safecleaner", "exclude sessions"]) &&
        lowerAnswer.includes("backup") &&
        includesWarningSemantics(lowerAnswer) &&
        !lowerAnswer.includes("run cachecleaner now");
      return {
        failure_tags: passed ? [] : ["missing_backup_side_effect_route"],
        passed,
        reasoning: passed
          ? "phase53_side_effect_backup_passed"
          : "phase53_side_effect_backup_failed",
      };
    }
    default:
      return judgePhase52TextCase(input);
  }
}

export function judgePhase53PrimingPair(input: {
  caseDefinition: ImplicitMemBenchResearchCase;
  controlAnswer: string;
  experimentalAnswer: string;
}): ImplicitMemBenchPrimingJudgeResult {
  return judgePhase52PrimingPair(input);
}

export { PHASE53_SMOKE_CASE_COUNT };
