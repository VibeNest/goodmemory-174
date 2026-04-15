import { z } from "zod";

import type { PersonaSpec, ScenarioFixture } from "./dataset";
import type { EvalAnswerPackage } from "./runners";

export interface JudgePromptInput {
  personaSummary: string;
  userPrompt: string;
  baselineAnswer: string;
  goodMemoryAnswer: string;
  expectedIdentitySignals: string[];
  expectedHistorySignals: string[];
  taskFamily: ScenarioFixture["task_family"];
  targetDomain: string;
  memorySourceDomains: string[];
  evaluationSetting: ScenarioFixture["evaluation_setting"];
  expectedTransferSignals: string[];
  expectedNonTransferSignals: string[];
  expectedUpdateWins: string[];
  expectedStaleSuppression: string[];
  wrongPersonalizationSignals: string[];
  improvementHypothesis: string;
  userSatisfactionHypothesis: string;
}

export interface JudgeScores {
  factual_recall: number;
  preference_consistency: number;
  cross_domain_transfer: number;
  contamination_penalty: number;
  update_correctness: number;
  personalization_usefulness: number;
  provenance_explainability: number;
}

export interface JudgeResult {
  winner: "baseline" | "goodmemory" | "tie";
  scores: JudgeScores;
  baseline_scores?: JudgeScores;
  goodmemory_scores?: JudgeScores;
  reasoning: string;
  failure_tags: string[];
  blocking_failure_tags?: string[];
}

function findMissingBlockingFailureTags(
  failureTags: string[],
  blockingFailureTags?: string[],
): string[] {
  if (!blockingFailureTags || blockingFailureTags.length === 0) {
    return [];
  }

  const failureTagSet = new Set(failureTags);
  return blockingFailureTags.filter((tag) => !failureTagSet.has(tag));
}

const JUDGE_SCORE_FIELDS = [
  "factual_recall",
  "preference_consistency",
  "cross_domain_transfer",
  "contamination_penalty",
  "update_correctness",
  "personalization_usefulness",
  "provenance_explainability",
] as const satisfies readonly (keyof JudgeScores)[];

const judgeScoreShape = {
  factual_recall: z.number(),
  preference_consistency: z.number(),
  cross_domain_transfer: z.number(),
  contamination_penalty: z.number(),
  update_correctness: z.number(),
  personalization_usefulness: z.number(),
  provenance_explainability: z.number(),
} satisfies Record<(typeof JUDGE_SCORE_FIELDS)[number], z.ZodNumber>;

export const judgeScoresSchema = z.object(judgeScoreShape);

const judgeResultBaseSchema = z.object({
  winner: z.enum(["baseline", "goodmemory", "tie"]),
  scores: judgeScoresSchema,
  baseline_scores: judgeScoresSchema.optional(),
  goodmemory_scores: judgeScoresSchema.optional(),
  reasoning: z.string(),
  failure_tags: z.array(z.string()),
  blocking_failure_tags: z.array(z.string()).optional(),
});

export const judgeResultSchema = judgeResultBaseSchema.superRefine((value, ctx) => {
  const missingBlockingTags = findMissingBlockingFailureTags(
    value.failure_tags,
    value.blocking_failure_tags,
  );

  if (missingBlockingTags.length === 0) {
    return;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["blocking_failure_tags"],
    message:
      `blocking_failure_tags must be a subset of failure_tags: ${missingBlockingTags.join(", ")}`,
  });
});

export interface JudgeModel {
  complete(input: {
    purpose: string;
    prompt: string;
  }): Promise<{ content: string }>;
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const normalized = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("Judge output did not contain a JSON object");
  }

  return JSON.parse(normalized.slice(start, end + 1)) as Record<string, unknown>;
}

function validateScores(
  value: unknown,
  path: string,
): JudgeScores | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "object" || value === null) {
    throw new Error(`${path} must be an object`);
  }

  const record = value as Record<string, unknown>;
  for (const field of JUDGE_SCORE_FIELDS) {
    if (typeof record[field] !== "number") {
      throw new Error(`${path}.${field} must be a number`);
    }
  }

  return {
    factual_recall: record.factual_recall as number,
    preference_consistency: record.preference_consistency as number,
    cross_domain_transfer: record.cross_domain_transfer as number,
    contamination_penalty: record.contamination_penalty as number,
    update_correctness: record.update_correctness as number,
    personalization_usefulness: record.personalization_usefulness as number,
    provenance_explainability: record.provenance_explainability as number,
  };
}

function tryValidateScores(
  value: unknown,
  path: string,
): JudgeScores | undefined {
  try {
    return validateScores(value, path);
  } catch {
    return undefined;
  }
}

function normalizeFailureTags(
  value: unknown,
  fieldName = "failure_tags",
): string[] {
  if (Array.isArray(value) && value.every((tag) => typeof tag === "string")) {
    return value as string[];
  }

  if (typeof value === "object" && value !== null) {
    const groups = value as Record<string, unknown>;

    return Object.entries(groups).flatMap(([group, tags]) => {
      if (!Array.isArray(tags)) {
        return [];
      }

      return tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => `${group}:${tag}`);
    });
  }

  throw new Error(`${fieldName} must be a string array`);
}

export function buildJudgePrompt(input: JudgePromptInput): string {
  return [
    "You are judging which answer better serves the user.",
    "Return only JSON. No prose, no markdown, no code fences, no <think> tags.",
    "Use this exact top-level shape:",
    "winner, scores, baseline_scores, goodmemory_scores, reasoning, failure_tags, blocking_failure_tags.",
    `Use 0-10 scores for ${JUDGE_SCORE_FIELDS.join(", ")}.`,
    "Higher contamination_penalty means less incorrect personalization or cross-domain contamination.",
    `Rubric: ${JUDGE_SCORE_FIELDS.join(", ")}.`,
    "failure_tags must be a flat string array.",
    "blocking_failure_tags must be a flat string array.",
    "Prefix every failure tag with baseline_, goodmemory_, or shared_.",
    "If GoodMemory wins and baseline made the mistake, use baseline_ tags rather than unscoped tags.",
    "Only use goodmemory_ tags for defects that still apply to the GoodMemory answer.",
    "failure_tags is the full diagnostic set, including non-blocking nits and observations.",
    "blocking_failure_tags is the strict subset that should still fail release gating or enter failures/summary.json if GoodMemory would otherwise win.",
    "Leave blocking_failure_tags empty for style, verbosity, or explicitness nits that do not make the answer materially incorrect, unsafe, stale, privacy-leaking, or cross-contaminated.",
    "Do not penalize an answer for refusing to invent unavailable details. If remembered context only proves that an item remains an open loop, explicitly saying that finer-grained details are not yet recorded is acceptable and should not be tagged as a defect.",
    "Expected identity signals are evidence of available memory, not a checklist of mandatory tokens. Only penalize missing identity details when the user asked for them explicitly or they materially change the recommendation.",
    "scores, baseline_scores, and goodmemory_scores must all use the same per-dimension keys.",
    `task family: ${input.taskFamily}`,
    `evaluation setting: ${input.evaluationSetting}`,
    `target domain: ${input.targetDomain}`,
    `memory source domains: ${input.memorySourceDomains.join(", ")}`,
    `expected identity signals: ${input.expectedIdentitySignals.join(" | ")}`,
    `expected history signals: ${input.expectedHistorySignals.join(" | ")}`,
    `expected transfer signals: ${input.expectedTransferSignals.join(" | ")}`,
    `expected non-transfer signals: ${input.expectedNonTransferSignals.join(" | ")}`,
    `expected update wins: ${input.expectedUpdateWins.join(" | ")}`,
    `expected stale suppression: ${input.expectedStaleSuppression.join(" | ")}`,
    `wrong personalization signals: ${input.wrongPersonalizationSignals.join(" | ")}`,
    `expected improvement hypothesis: ${input.improvementHypothesis}`,
    `user satisfaction hypothesis: ${input.userSatisfactionHypothesis}`,
    `persona: ${input.personaSummary}`,
    `user prompt: ${input.userPrompt}`,
    `baseline: ${input.baselineAnswer}`,
    `goodmemory: ${input.goodMemoryAnswer}`,
  ].join("\n");
}

export function parseJudgeResult(raw: string): JudgeResult {
  const parsed = extractJsonObject(raw);

  if (
    parsed.winner !== "baseline" &&
    parsed.winner !== "goodmemory" &&
    parsed.winner !== "tie"
  ) {
    throw new Error("Invalid judge result winner");
  }

  const baselineScores = tryValidateScores(
    parsed.baseline_scores,
    "baseline_scores",
  );
  const goodmemoryScores = tryValidateScores(
    parsed.goodmemory_scores,
    "goodmemory_scores",
  );
  const scores =
    tryValidateScores(parsed.scores, "scores") ??
    (parsed.winner === "baseline"
      ? baselineScores
      : parsed.winner === "goodmemory"
        ? goodmemoryScores
        : goodmemoryScores ?? baselineScores);

  if (!scores) {
    throw new Error("scores must be present");
  }

  const reasoning = parsed.reasoning;
  if (typeof reasoning !== "string") {
    throw new Error("reasoning must be a string");
  }

  const failureTags = normalizeFailureTags(parsed.failure_tags);
  const blockingFailureTags =
    parsed.blocking_failure_tags === undefined
      ? undefined
      : normalizeFailureTags(parsed.blocking_failure_tags, "blocking_failure_tags");
  const missingBlockingTags = findMissingBlockingFailureTags(
    failureTags,
    blockingFailureTags,
  );

  if (missingBlockingTags.length > 0) {
    throw new Error(
      `blocking_failure_tags must be a subset of failure_tags: ${missingBlockingTags.join(", ")}`,
    );
  }

  return {
    winner: parsed.winner,
    scores,
    baseline_scores: baselineScores,
    goodmemory_scores: goodmemoryScores,
    reasoning,
    failure_tags: failureTags,
    blocking_failure_tags: blockingFailureTags,
  };
}

function summarizePersona(persona: PersonaSpec): string {
  return [
    `${persona.name}, ${persona.profession}`,
    persona.locale,
    `Current project: ${persona.current_projects[0]}`,
    `Preference: ${persona.communication_preferences[0]}`,
  ].join(" | ");
}

export async function runJudgeComparison(input: {
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  baseline: EvalAnswerPackage;
  goodmemory: EvalAnswerPackage;
  judge: JudgeModel;
}): Promise<JudgeResult> {
  const prompt = buildJudgePrompt({
    personaSummary: summarizePersona(input.persona),
    userPrompt: input.scenario.evaluation.prompt,
    baselineAnswer: input.baseline.answer,
    goodMemoryAnswer: input.goodmemory.answer,
    expectedIdentitySignals: input.scenario.evaluation.expected_identity_signals,
    expectedHistorySignals: input.scenario.evaluation.expected_history_signals,
    taskFamily: input.scenario.task_family,
    targetDomain: input.scenario.domain,
    memorySourceDomains: input.scenario.memory_source_domains,
    evaluationSetting: input.scenario.evaluation_setting,
    expectedTransferSignals: input.scenario.evaluation.expected_transfer_signals,
    expectedNonTransferSignals:
      input.scenario.evaluation.expected_non_transfer_signals,
    expectedUpdateWins: input.scenario.evaluation.expected_update_wins,
    expectedStaleSuppression:
      input.scenario.evaluation.expected_stale_suppression,
    wrongPersonalizationSignals:
      input.scenario.evaluation.wrong_personalization_signals,
    improvementHypothesis: input.scenario.evaluation.improvement_hypothesis,
    userSatisfactionHypothesis:
      input.scenario.evaluation.user_satisfaction_hypothesis,
  });
  const response = await input.judge.complete({
    purpose: "eval_judge",
    prompt,
  });

  return parseJudgeResult(response.content);
}
