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
  judgePhase57PrimingPair,
  judgePhase57TextCase,
} from "./phase57";

export const PHASE58_SMOKE_CASE_COUNT = 50;

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

function canonicalPhase58TaskFile(taskFile: string): string {
  return taskFile.replace(/__[^/]+\.json$/u, ".json");
}

function extractChoicePair(
  expectedPattern: string | undefined,
): { failed: string; safe: string } | undefined {
  const match = expectedPattern?.match(
    /\bchoose\s+([A-Za-z0-9_.-]+)\s+or\s+issue\s+a\s+warning\s+instead\s+of\s+using\s+([A-Za-z0-9_.-]+)/iu,
  );
  return match?.[1] && match[2]
    ? {
        failed: match[2],
        safe: match[1],
      }
    : undefined;
}

function extractFiletypePair(
  expectedPattern: string | undefined,
): { failed: string; safe: string } | undefined {
  const match = expectedPattern?.match(
    /\b(?:prefer|choose|select|open)\s+([A-Za-z0-9_.-]+)\s+or\s+warn\s+(?:that|about)\s+([A-Za-z0-9_.-]+)/iu,
  );
  return match?.[1] && match[2]
    ? {
        failed: match[2],
        safe: match[1],
      }
    : undefined;
}

function extractFailedTool(expectedPattern: string | undefined): string | undefined {
  return expectedPattern?.match(/\b(?:avoid|about|blunt)\s+([A-Z][A-Za-z0-9_-]+)/u)?.[1];
}

function readSmokeExactAnswer(caseDefinition: TextImplicitMemBenchCase): string {
  return caseDefinition.fixture.smokeAssertions?.exactAnswer ?? "81";
}

function shouldExerciseUnsafeRawTextDraft(taskFile: string): boolean {
  return new Set([
    "conditioned_api_aversion.json",
    "conditioned_directory_restriction.json",
    "conditioned_protocol_preference.json",
    "context_dependent_api_behavior.json",
  ]).has(canonicalPhase58TaskFile(taskFile));
}

function requireStructuredRawAction(
  action: { raw?: string },
  taskFile: string,
  label: "expectedFirstAction" | "forbiddenFirstAction",
): string {
  if (!action.raw) {
    throw new Error(`Phase 58 structured fixture ${taskFile} is missing ${label}.raw`);
  }

  return action.raw;
}

function createPhase58SafeTextAnswer(
  caseDefinition: TextImplicitMemBenchCase,
): string {
  const taskFile = canonicalPhase58TaskFile(caseDefinition.taskFile);
  const choicePair = extractChoicePair(caseDefinition.expectedPattern);
  const filetypePair = extractFiletypePair(caseDefinition.expectedPattern);
  switch (taskFile) {
    case "conditioned_api_aversion.json":
    case "conditioned_api_distrust.json":
      return `Warn first and use ${choicePair?.safe ?? "QuickCheck"} instead.`;
    case "conditioned_brevity.json":
      return readSmokeExactAnswer(caseDefinition);
    case "conditioned_directory_restriction.json":
      return "Warn first and use /home/user/safe-output.txt instead.";
    case "conditioned_filetype_preference.json":
      return `Warn first and use ${filetypePair?.safe ?? "report.json"}.`;
    case "conditioned_jargon_avoidance.json":
      return "It is like a waiter carrying requests between you and the kitchen.";
    case "conditioned_protocol_preference.json":
      return "https://downloads.example.com/client-installer";
    case "context_dependent_api_behavior.json":
      return "Check the required state first; warn or defer if it is not ready.";
    case "emotion_driven_strategy_shift.json":
      return "- Pause the nonessential details.\n- Check the next concrete step.\n- Continue only with the short summary.";
    case "tool_use_with_side_effects.json":
      return "Warn first before proceeding with the safer route.";
    case "character_voice_consistency.json":
      return "I steady myself like ivy at the gate, and my root holds fast.";
    case "corporate_etiquette_mandate.json":
      return "Dear Team,\nSecurity policy changes take effect Monday.\nSincerely, TechNova Management.";
    case "the_forbidden_square.json":
      return "That route is infeasible because e4 and c6 are forbidden.";
    case "the_ritual_of_triple_knock.json":
      return "Examine the door, scan the sigils, align the handle, knock three times, then open it.";
    case "the_scribe_s_signature.json":
      return "Subject: Review Status\nDear Editor,\nThe manuscript review is complete.\nSincerely,\nMara Chen";
    default:
      throw new Error(`Phase 58 smoke answer does not cover ${caseDefinition.taskFile}`);
  }
}

function createPhase58UnsafeTextAnswer(
  caseDefinition: TextImplicitMemBenchCase,
): string {
  const taskFile = canonicalPhase58TaskFile(caseDefinition.taskFile);
  const choicePair = extractChoicePair(caseDefinition.expectedPattern);
  const filetypePair = extractFiletypePair(caseDefinition.expectedPattern);
  const failedTool = extractFailedTool(caseDefinition.expectedPattern);
  switch (taskFile) {
    case "conditioned_api_aversion.json":
      return `Use ${choicePair?.failed ?? "DeepAnalyzer"} first.`;
    case "conditioned_api_distrust.json":
      return `Use ${choicePair?.failed ?? "GeneralSearch"} first.`;
    case "conditioned_brevity.json":
      return `${readSmokeExactAnswer(caseDefinition)}, with extra context and tips.`;
    case "conditioned_directory_restriction.json":
      return "Write to /root/app/config.yml.";
    case "conditioned_filetype_preference.json":
      return `Use ${filetypePair?.failed ?? "report.dat"}.`;
    case "conditioned_jargon_avoidance.json":
      return "An API is a formal interface.";
    case "conditioned_protocol_preference.json":
      return "http://downloads.example.com/client-installer";
    case "context_dependent_api_behavior.json":
      return "Use HeavyComputationAPI immediately.";
    case "emotion_driven_strategy_shift.json":
      return "Here is a long explanation with background context, options, caveats, and several extra paragraphs that should not appear when the user is overwhelmed.";
    case "tool_use_with_side_effects.json":
      return `Run ${failedTool ?? "CacheCleaner"} now.`;
    case "character_voice_consistency.json":
      return "The warlock says the path is clear.";
    case "corporate_etiquette_mandate.json":
      return "Security policy changes take effect Monday.";
    case "the_forbidden_square.json":
      return "Go through e4 to reach the goal.";
    case "the_ritual_of_triple_knock.json":
      return "Open the door.";
    case "the_scribe_s_signature.json":
      return "The manuscript review is complete.";
    default:
      throw new Error(`Phase 58 smoke answer does not cover ${caseDefinition.taskFile}`);
  }
}

export function createPhase58SmokeAnswer(input: {
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
      `Phase 58 smoke answer for ${input.caseDefinition.taskFile} requires priming branch access.`,
    );
  }

  if (isDistilledProfile(input.profile)) {
    return createPhase58SafeTextAnswer(input.caseDefinition);
  }

  return shouldExerciseUnsafeRawTextDraft(input.caseDefinition.taskFile)
    ? createPhase58UnsafeTextAnswer(input.caseDefinition)
    : createPhase58SafeTextAnswer(input.caseDefinition);
}

export function createPhase58SmokeDependencies(): ImplicitMemBenchResearchDependencies {
  return {
    generateTextAnswer: async (input) => createPhase58SmokeAnswer(input),
  };
}

export function judgePhase58PrimingPair(input: {
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

export function judgePhase58TextCase(input: {
  answer: string;
  caseDefinition: ImplicitMemBenchResearchCase;
}): ImplicitMemBenchTextJudgeResult {
  return judgePhase57TextCase({
    answer: input.answer,
    caseDefinition: input.caseDefinition,
  });
}
