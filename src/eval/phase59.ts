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
import { createInternalGoodMemory } from "../api/createGoodMemory";
import type { EmbeddingAdapter } from "../embedding/contracts";
import {
  judgePhase57PrimingPair,
  judgePhase57TextCase,
} from "./phase57";

export const PHASE59_SMOKE_CASE_COUNT = 60;

function isDistilledProfile(profile: ImplicitMemBenchResearchProfile): boolean {
  return profile === "goodmemory-distilled-feedback";
}

function isStructuredCase(
  caseDefinition:
    | PrimingImplicitMemBenchCase
    | StructuredImplicitMemBenchCase
    | TextImplicitMemBenchCase,
): caseDefinition is StructuredImplicitMemBenchCase {
  return caseDefinition.scorerFamily === "structured_first_action";
}

function requireStructuredRawAction(
  action: { raw?: string },
  taskFile: string,
  label: "expectedFirstAction" | "forbiddenFirstAction",
): string {
  if (!action.raw) {
    throw new Error(`Phase 59 structured fixture ${taskFile} is missing ${label}.raw`);
  }

  return action.raw;
}

function createPhase59SafeTextAnswer(
  caseDefinition: TextImplicitMemBenchCase,
): string {
  const assertions = caseDefinition.fixture.smokeAssertions;
  if (assertions?.exactAnswer) {
    return assertions.exactAnswer;
  }
  if (assertions?.requiredPhrases?.length) {
    return assertions.requiredPhrases.join(" ");
  }
  if (assertions?.requiredKeywords?.length) {
    return assertions.requiredKeywords.join(" ");
  }

  return caseDefinition.expectedPattern ?? "Compliant response.";
}

function createPhase59UnsafeTextAnswer(
  caseDefinition: TextImplicitMemBenchCase,
): string {
  const assertions = caseDefinition.fixture.smokeAssertions;
  if (assertions?.forbiddenPhrases?.[0]) {
    return assertions.forbiddenPhrases[0];
  }
  if (assertions?.exactAnswer) {
    return `Developer memory notes: previous examples say ${assertions.exactAnswer}`;
  }

  return "Developer memory notes: use the unsafe draft from previous examples.";
}

export function createPhase59SmokeAnswer(input: {
  caseDefinition:
    | PrimingImplicitMemBenchCase
    | StructuredImplicitMemBenchCase
    | TextImplicitMemBenchCase;
  memoryContext?: string;
  profile: ImplicitMemBenchResearchProfile;
  prompt: string;
}): string {
  if (isStructuredCase(input.caseDefinition)) {
    if (isDistilledProfile(input.profile)) {
      return requireStructuredRawAction(
        input.caseDefinition.fixture.expectedFirstAction,
        input.caseDefinition.taskFile,
        "expectedFirstAction",
      );
    }

    return input.caseDefinition.fixture.forbiddenFirstAction?.raw
      ? input.caseDefinition.fixture.forbiddenFirstAction.raw
      : requireStructuredRawAction(
          input.caseDefinition.fixture.expectedFirstAction,
          input.caseDefinition.taskFile,
          "expectedFirstAction",
        );
  }

  if (input.caseDefinition.scorerFamily === "priming_pair_judge") {
    throw new Error(
      `Phase 59 smoke answer for ${input.caseDefinition.taskFile} requires priming branch access.`,
    );
  }

  if (isDistilledProfile(input.profile)) {
    return createPhase59SafeTextAnswer(input.caseDefinition);
  }

  return createPhase59UnsafeTextAnswer(input.caseDefinition);
}

export function createPhase59SmokeDependencies(): ImplicitMemBenchResearchDependencies {
  return {
    createMemory: () =>
      createInternalGoodMemory({
        adapters: {
          embeddingAdapter: phase59SmokeEmbeddingAdapter,
        },
        storage: { provider: "memory" },
      }),
    generateTextAnswer: async (input) => createPhase59SmokeAnswer(input),
  };
}

export function judgePhase59PrimingPair(input: {
  caseDefinition: ImplicitMemBenchResearchCase;
  controlAnswer: string;
  experimentalAnswer: string;
}): ImplicitMemBenchPrimingJudgeResult {
  return judgePhase57PrimingPair({
    caseDefinition: input.caseDefinition,
    controlAnswer: input.controlAnswer,
    experimentalAnswer: input.experimentalAnswer,
  });
}

export function judgePhase59TextCase(input: {
  answer: string;
  caseDefinition: ImplicitMemBenchResearchCase;
}): ImplicitMemBenchTextJudgeResult {
  return judgePhase57TextCase({
    answer: input.answer,
    caseDefinition: input.caseDefinition,
  });
}

export interface Phase59Judges {
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

const phase59SmokeEmbeddingAdapter: EmbeddingAdapter = {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const seed = [...text].reduce(
        (total, char) => (total + char.charCodeAt(0)) % 997,
        0,
      );
      return [1, seed / 997, text.length / 1000];
    });
  },
};
