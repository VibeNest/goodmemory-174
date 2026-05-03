import type {
  ImplicitMemBenchPrimingJudgeResult,
  ImplicitMemBenchResearchCase,
  ImplicitMemBenchResearchDependencies,
  ImplicitMemBenchResearchProfile,
  ImplicitMemBenchTextJudgeResult,
  PrimingImplicitMemBenchCase,
  StructuredImplicitMemBenchCase,
  TextImplicitMemBenchCase,
} from "./implicitmembench-research";
import {
  PHASE56_SMOKE_CASE_COUNT,
  createPhase56SmokeAnswer,
  judgePhase56PrimingPair,
  judgePhase56TextCase,
} from "./phase56";

export const PHASE57_SMOKE_CASE_COUNT = PHASE56_SMOKE_CASE_COUNT;

export function createPhase57SmokeAnswer(input: {
  caseDefinition:
    | PrimingImplicitMemBenchCase
    | StructuredImplicitMemBenchCase
    | TextImplicitMemBenchCase;
  memoryContext?: string;
  profile: ImplicitMemBenchResearchProfile;
  prompt: string;
}): string {
  const generated = createPhase56SmokeAnswer(input.caseDefinition, input.profile);
  if (typeof generated !== "string") {
    throw new Error(
      `Phase 57 smoke answer for ${input.caseDefinition.taskFile} requires priming branch access.`,
    );
  }

  return generated;
}

export function createPhase57SmokeDependencies(): ImplicitMemBenchResearchDependencies {
  return {
    generateTextAnswer: async (input) => createPhase57SmokeAnswer(input),
  };
}

export function judgePhase57PrimingPair(input: {
  caseDefinition: ImplicitMemBenchResearchCase;
  controlAnswer: string;
  experimentalAnswer: string;
}): ImplicitMemBenchPrimingJudgeResult {
  return judgePhase56PrimingPair({
    caseDefinition: input.caseDefinition,
    controlAnswer: input.controlAnswer,
    experimentalAnswer: input.experimentalAnswer,
  });
}

export function judgePhase57TextCase(input: {
  answer: string;
  caseDefinition: ImplicitMemBenchResearchCase;
}): ImplicitMemBenchTextJudgeResult {
  return judgePhase56TextCase({
    answer: input.answer,
    caseDefinition: input.caseDefinition,
  });
}

export interface Phase57Judges {
  judgePrimingPair: (input: {
    caseDefinition: PrimingImplicitMemBenchCase;
    controlAnswer: string;
    experimentalAnswer: string;
  }) => Promise<{ influenceScore: number; reason: string }>;
  judgeTextBehavior: (input: {
    answer: string;
    caseDefinition: TextImplicitMemBenchCase;
  }) => Promise<{ passed: boolean; reason: string }>;
}
