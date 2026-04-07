import type { PersonaSpec, ScenarioFixture } from "./dataset";
import type { EvalAnswerPackage } from "./runners";

export interface JudgePromptInput {
  personaSummary: string;
  userPrompt: string;
  baselineAnswer: string;
  goodMemoryAnswer: string;
  improvementHypothesis: string;
}

export interface JudgeScores {
  identity_understanding: number;
  history_continuation: number;
  factual_alignment: number;
  relevance: number;
  personalization?: number;
}

export interface JudgeResult {
  winner: "baseline" | "goodmemory" | "tie";
  scores: JudgeScores;
  baseline_scores?: JudgeScores;
  goodmemory_scores?: JudgeScores;
  reasoning: string;
  failure_tags: string[];
}

export interface JudgeModel {
  complete(input: {
    purpose: string;
    prompt: string;
  }): Promise<{ content: string }>;
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
  const fields: Array<keyof JudgeScores> = [
    "identity_understanding",
    "history_continuation",
    "factual_alignment",
    "relevance",
  ];

  for (const field of fields) {
    if (typeof record[field] !== "number") {
      throw new Error(`${path}.${field} must be a number`);
    }
  }

  if (
    record.personalization !== undefined &&
    typeof record.personalization !== "number"
  ) {
    throw new Error(`${path}.personalization must be a number when present`);
  }

  return {
    identity_understanding: record.identity_understanding as number,
    history_continuation: record.history_continuation as number,
    factual_alignment: record.factual_alignment as number,
    relevance: record.relevance as number,
    personalization: record.personalization as number | undefined,
  };
}

export function buildJudgePrompt(input: JudgePromptInput): string {
  return [
    "You are judging which answer better serves the user.",
    "Return strict JSON with fields:",
    "winner, scores, baseline_scores, goodmemory_scores, reasoning, failure_tags.",
    "Use 0-10 scores for identity_understanding, history_continuation, factual_alignment, relevance, and personalization.",
    "Rubric: identity_understanding, history_continuation, factual_alignment, relevance, personalization.",
    `expected improvement hypothesis: ${input.improvementHypothesis}`,
    `persona: ${input.personaSummary}`,
    `user prompt: ${input.userPrompt}`,
    `baseline: ${input.baselineAnswer}`,
    `goodmemory: ${input.goodMemoryAnswer}`,
  ].join("\n");
}

export function parseJudgeResult(raw: string): JudgeResult {
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  if (
    parsed.winner !== "baseline" &&
    parsed.winner !== "goodmemory" &&
    parsed.winner !== "tie"
  ) {
    throw new Error("Invalid judge result winner");
  }

  const scores = validateScores(parsed.scores, "scores");
  if (!scores) {
    throw new Error("scores must be present");
  }

  const reasoning = parsed.reasoning;
  if (typeof reasoning !== "string") {
    throw new Error("reasoning must be a string");
  }

  const failureTags = parsed.failure_tags;
  if (!Array.isArray(failureTags) || failureTags.some((tag) => typeof tag !== "string")) {
    throw new Error("failure_tags must be a string array");
  }

  return {
    winner: parsed.winner,
    scores,
    baseline_scores: validateScores(parsed.baseline_scores, "baseline_scores"),
    goodmemory_scores: validateScores(
      parsed.goodmemory_scores,
      "goodmemory_scores",
    ),
    reasoning,
    failure_tags: failureTags as string[],
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
    improvementHypothesis: input.scenario.evaluation.improvement_hypothesis,
  });
  const response = await input.judge.complete({
    purpose: "eval_judge",
    prompt,
  });

  return parseJudgeResult(response.content);
}
