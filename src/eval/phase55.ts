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
  summarizePhase52Profiles,
} from "./phase52";
import { judgePhase53TextCase } from "./phase53";

const PHASE55_SMOKE_CASE_COUNT = 12;

function createStructuredSmokeAnswer(
  caseDefinition: ImplicitMemBenchResearchCase,
  fallback: string,
): string {
  if (caseDefinition.scorerFamily !== "structured_first_action") {
    return fallback;
  }

  return caseDefinition.fixture.expectedFirstAction.raw ?? fallback;
}

export function createPhase55SmokeAnswer(
  caseDefinition: ImplicitMemBenchResearchCase,
  profile: ImplicitMemBenchResearchProfile,
): string | { control: string; experimental: string } {
  switch (caseDefinition.taskFile) {
    case "session_key_prefix_rule.json":
      return createStructuredSmokeAnswer(
        caseDefinition,
        "_database('TOKEN-TOKEN456 GRANT ROLE analyst TO user42 -TOKEN456')",
      );
    case "the_eccentric_api_call.json":
      return createStructuredSmokeAnswer(
        caseDefinition,
        "get_data(query_payload={'value': 'invoice-042'}, buffer=['preface','suffix'], auth='token')",
      );
    case "the_alien_filesystem.json":
      return createStructuredSmokeAnswer(caseDefinition, "nav |Projects|");
    default:
      return createPhase52SmokeAnswer(caseDefinition, profile);
  }
}

export function createPhase55SmokeDependencies(): ImplicitMemBenchResearchDependencies {
  return {
    generateTextAnswer: async (input) => {
      const generated = createPhase55SmokeAnswer(input.caseDefinition, input.profile);
      if (typeof generated !== "string") {
        throw new Error(
          `Phase 55 smoke answer for ${input.caseDefinition.taskFile} requires priming branch access.`,
        );
      }
      return generated;
    },
  };
}

export function judgePhase55TextCase(input: {
  answer: string;
  caseDefinition: ImplicitMemBenchResearchCase;
}): ImplicitMemBenchTextJudgeResult {
  return judgePhase53TextCase(input);
}

export function judgePhase55PrimingPair(input: {
  caseDefinition: ImplicitMemBenchResearchCase;
  controlAnswer: string;
  experimentalAnswer: string;
}): ImplicitMemBenchPrimingJudgeResult {
  return judgePhase52PrimingPair(input);
}

export function summarizePhase55Profiles(
  cases: readonly ImplicitMemBenchCaseResult[],
): ReturnType<typeof summarizePhase52Profiles> {
  return summarizePhase52Profiles(cases);
}

export { PHASE55_SMOKE_CASE_COUNT };
