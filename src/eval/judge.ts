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

function extractJsonObject(raw: string): Record<string, unknown> {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("Judge output did not contain a JSON object");
  }

  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
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

function normalizeFailureTags(value: unknown): string[] {
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

  throw new Error("failure_tags must be a string array");
}

export function buildJudgePrompt(input: JudgePromptInput): string {
  return [
    "You are judging which answer better serves the user.",
    "Return only JSON. No prose, no markdown, no code fences, no <think> tags.",
    "Use this exact top-level shape:",
    "winner, scores, baseline_scores, goodmemory_scores, reasoning, failure_tags.",
    "Use 0-10 scores for identity_understanding, history_continuation, factual_alignment, relevance, and personalization.",
    "Rubric: identity_understanding, history_continuation, factual_alignment, relevance, personalization.",
    "failure_tags must be a flat string array.",
    "scores, baseline_scores, and goodmemory_scores must all use the same per-dimension keys.",
    `expected improvement hypothesis: ${input.improvementHypothesis}`,
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

  return {
    winner: parsed.winner,
    scores,
    baseline_scores: baselineScores,
    goodmemory_scores: goodmemoryScores,
    reasoning,
    failure_tags: normalizeFailureTags(parsed.failure_tags),
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
