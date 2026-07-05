/**
 * Phase A of the public-claims comparability plan: rescore EXISTING run
 * answers under each benchmark's OFFICIAL / industry-comparable judge
 * protocol, so GoodMemory numbers can sit next to published competitor
 * numbers on the same scale. No answers are regenerated - this only re-judges
 * stored hypotheses.
 *
 * Protocols (embedded verbatim from the upstream sources):
 * - longmemeval: the official evaluate_qa.py anscheck prompts
 *   (github.com/xiaowu0162/LongMemEval, src/evaluation/evaluate_qa.py) -
 *   per-type yes/no judging, temperature 0.
 * - locomo: the industry-comparable J-metric judge from
 *   github.com/mem0ai/memory-benchmarks benchmarks/locomo/prompts.py
 *   (no-evidence variant; binary CORRECT/WRONG on categories 1-4, adversarial
 *   category excluded per that methodology).
 * - beam: the official BEAM judge prompt from github.com/mohammadtavakoli78/BEAM.
 *
 * The judge model comes from GOODMEMORY_JUDGE_* (per user directive: the
 * primary gateway; gpt-5.4 = cross-version, same family as the gpt-5.5
 * answerer - disclose in any claim). Resumable via a per-question progress
 * JSONL in the output run dir.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  parseCliPositiveIntegerFlagStrict,
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export type OfficialRescoreBenchmark = "beam" | "locomo" | "longmemeval";

export interface OfficialRescoreCliOptions {
  benchmark: OfficialRescoreBenchmark;
  concurrency: number;
  limit?: number;
  referencePath?: string;
  reportPath?: string;
  rootPath?: string;
  rubricsPath?: string;
  runId: string;
}

interface JudgeCase {
  category: string;
  gold: string;
  hypothesis: string;
  question: string;
  questionId: string;
}

interface JudgeVerdict {
  correct: boolean;
  raw: string;
}

const repoRoot = resolveRepoRootFromScriptUrl(import.meta.url);

function parseOfficialRescoreBenchmark(
  value: string | undefined,
): OfficialRescoreBenchmark {
  if (value === "beam" || value === "locomo" || value === "longmemeval") {
    return value;
  }
  throw new Error("--benchmark must be longmemeval, locomo, or beam.");
}

export function parseOfficialRescoreCliOptions(
  argv: readonly string[],
): OfficialRescoreCliOptions {
  const benchmark = parseOfficialRescoreBenchmark(
    resolveCliFlagValueStrict(argv, "--benchmark"),
  );
  const concurrency =
    parseCliPositiveIntegerFlagStrict(argv, "--concurrency") ?? 4;
  const limit = parseCliPositiveIntegerFlagStrict(argv, "--limit");
  const referencePath = resolveCliFlagValueStrict(argv, "--reference");
  const reportPath = resolveCliFlagValueStrict(argv, "--report");
  const rootPath = resolveCliFlagValueStrict(argv, "--root");
  const rubricsPath = resolveCliFlagValueStrict(argv, "--rubrics");
  const runId =
    resolveCliPathSegmentFlagValueStrict(argv, "--run-id") ??
    `rescore-${benchmark}-official-judge`;

  return {
    benchmark,
    concurrency,
    ...(limit === undefined ? {} : { limit }),
    ...(referencePath === undefined ? {} : { referencePath }),
    ...(reportPath === undefined ? {} : { reportPath }),
    ...(rootPath === undefined ? {} : { rootPath }),
    ...(rubricsPath === undefined ? {} : { rubricsPath }),
    runId,
  };
}

// ---------------------------------------------------------------------------
// LongMemEval official prompts (evaluate_qa.py get_anscheck_prompt, verbatim)
// ---------------------------------------------------------------------------

const LME_DEFAULT_TEMPLATE =
  "I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. If the response only contains a subset of the information required by the answer, answer no. \n\nQuestion: {q}\n\nCorrect Answer: {a}\n\nModel Response: {r}\n\nIs the model response correct? Answer yes or no only.";
const LME_TEMPORAL_TEMPLATE =
  "I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. If the response only contains a subset of the information required by the answer, answer no. In addition, do not penalize off-by-one errors for the number of days. If the question asks for the number of days/weeks/months, etc., and the model makes off-by-one errors (e.g., predicting 19 days when the answer is 18), the model's response is still correct. \n\nQuestion: {q}\n\nCorrect Answer: {a}\n\nModel Response: {r}\n\nIs the model response correct? Answer yes or no only.";
const LME_KNOWLEDGE_UPDATE_TEMPLATE =
  "I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response contains some previous information along with an updated answer, the response should be considered as correct as long as the updated answer is the required answer.\n\nQuestion: {q}\n\nCorrect Answer: {a}\n\nModel Response: {r}\n\nIs the model response correct? Answer yes or no only.";
const LME_PREFERENCE_TEMPLATE =
  "I will give you a question, a rubric for desired personalized response, and a response from a model. Please answer yes if the response satisfies the desired response. Otherwise, answer no. The model does not need to reflect all the points in the rubric. The response is correct as long as it recalls and utilizes the user's personal information correctly.\n\nQuestion: {q}\n\nRubric: {a}\n\nModel Response: {r}\n\nIs the model response correct? Answer yes or no only.";
const LME_ABSTENTION_TEMPLATE =
  "I will give you an unanswerable question, an explanation, and a response from a model. Please answer yes if the model correctly identifies the question as unanswerable. The model could say that the information is incomplete, or some other information is given but the asked information is not.\n\nQuestion: {q}\n\nExplanation: {a}\n\nModel Response: {r}\n\nDoes the model correctly identify the question as unanswerable? Answer yes or no only.";

function fillTemplate(template: string, c: JudgeCase): string {
  return template
    .replace("{q}", c.question)
    .replace("{a}", c.gold)
    .replace("{r}", c.hypothesis);
}

function buildLongmemevalPrompt(c: JudgeCase, abstention: boolean): string {
  if (abstention) {
    return fillTemplate(LME_ABSTENTION_TEMPLATE, c);
  }
  switch (c.category) {
    case "temporal-reasoning":
      return fillTemplate(LME_TEMPORAL_TEMPLATE, c);
    case "knowledge-update":
      return fillTemplate(LME_KNOWLEDGE_UPDATE_TEMPLATE, c);
    case "single-session-preference":
      return fillTemplate(LME_PREFERENCE_TEMPLATE, c);
    default:
      return fillTemplate(LME_DEFAULT_TEMPLATE, c);
  }
}

// ---------------------------------------------------------------------------
// LoCoMo industry-comparable judge (mem0ai/memory-benchmarks, no-evidence
// variant, verbatim)
// ---------------------------------------------------------------------------

const LOCOMO_JUDGE_SYSTEM =
  "You are evaluating conversational AI memory recall. Return JSON only with the format requested.";
const LOCOMO_JUDGE_TEMPLATE = `Label the generated answer as CORRECT or WRONG.

## Rules

1. **PARTIAL CREDIT**: If the generated answer includes AT LEAST ONE correct item from the gold answer's list, mark CORRECT. Getting 1 out of 2, 2 out of 4, etc. is always acceptable. Only mark WRONG if NONE of the gold answer items appear.

2. **PARAPHRASES COUNT**: Same concept in different words is CORRECT. "Chocolate raspberry tart" = "chocolate cake with raspberries". "Shelter meal service" = "volunteering at a homeless shelter". Emotions and sentiments in the same positive/negative family count as paraphrases: "proud" = "fulfilled" = "accomplished"; "huge success" = "relieved" = "thrilled" (all express positive achievement). Judge semantic meaning, not exact wording.

3. **EXTRA DETAIL IS FINE**: A longer answer that includes the gold answer's key facts plus additional information is CORRECT. Never penalize for being more detailed or specific. If the generated answer adds extra descriptive details beyond the gold answer while still referencing the same core entity or concept, mark CORRECT.

4. **DATE TOLERANCE**: Dates within 14 days of each other are CORRECT. Durations within 50% are CORRECT (e.g., "5 months" matches "six months"; "19 days" matches "two weeks"). Relative dates ("few days before November") match specific dates in the same window. A specific date (e.g., "February 2020") that is consistent with a vague reference (e.g., "a few years ago" relative to 2023) is CORRECT. Converting "last year" to the actual year (e.g., "2022" when conversations are in 2023) is CORRECT.

5. **SEMANTIC OVERLAP**: Judge whether the generated answer addresses the same topic and captures the core idea of the gold answer. Different wording, phrasing, or level of detail should not result in WRONG if the underlying concept matches. For EMOTIONS and FEELINGS questions, answers expressing sentiments in the same valence (positive/negative) about the same event are CORRECT - do not require the exact same emotion word.

6. **SAME REFERENT**: If the generated answer mentions or references the same named entity, character, person, or concept as the gold answer, mark CORRECT - even if the generated answer provides a different physical description or includes additional details. The key question is: does the generated answer identify the same core entity? If yes, it is CORRECT.

7. **FOCUS ON KNOWLEDGE, NOT WORDING**: The goal is to assess whether the system recalled the right fact. Minor differences in specificity, phrasing, or scope should not result in WRONG. Only mark WRONG when the generated answer demonstrates a genuinely different or incorrect understanding.

## ONLY mark WRONG if:
- The generated answer contains ZERO correct items from the gold answer
- The answer addresses a completely different topic

## Question
Question: {q}
Gold answer: {a}
Generated answer: {r}

Return JSON with "reasoning" (one sentence) and "label" (CORRECT or WRONG). Do NOT include both labels.`;

// ---------------------------------------------------------------------------
// BEAM official unified judge prompt (github.com/mohammadtavakoli78/BEAM,
// src/prompts.py unified_llm_judge_base_prompt, verbatim). Scoring is per
// RUBRIC ITEM on a 1.0/0.5/0.0 scale; a question's score is the mean over its
// rubric items (run_evaluation.py). Deviation disclosed in the summary: the
// official pipeline scores event_ordering with a Kendall-tau metric
// (tau_norm) instead of the judge; the public third-party reference
// (MemPalace issue #125) judged all 1051 rubric items incl. event_ordering,
// and this rescore matches THAT protocol for comparability.
// ---------------------------------------------------------------------------

const BEAM_JUDGE_TEMPLATE = `
You are an expert evaluator tasked with judging whether the LLM's response demonstrates compliance with the specified RUBRIC CRITERION.

## EVALUATION INPUTS
- QUESTION (what the user asked): <question>
- RUBRIC CRITERION (what to check): <rubric_item>
- RESPONSE TO EVALUATE: <llm_response>

## EVALUATION RUBRIC:
The rubric defines a specific requirement, constraint, or expected behavior that the LLM response should demonstrate.

**IMPORTANT**: Pay careful attention to whether the rubric specifies:
- **Positive requirements** (things the response SHOULD include/do)
- **Negative constraints** (things the response SHOULD NOT include/do, often indicated by "no", "not", "avoid", "absent")

## RESPONSIVENESS REQUIREMENT (anchored to the QUESTION)
A compliant response must be **on-topic with respect to the QUESTION** and attempt to answer it.
- If the response does not address the QUESTION, score **0.0** and stop.
- For negative constraints, both must hold: (a) the response is responsive to the QUESTION, and (b) the prohibited element is absent.

## SEMANTIC TOLERANCE RULES:
Judge by meaning, not exact wording.
- Accept **paraphrases** and **synonyms** that preserve intent.
- **Case/punctuation/whitespace** differences must be ignored.
- **Numbers/currencies/dates** may appear in equivalent forms (e.g., "$68,000", "68k", "68,000 USD", or "sixty-eight thousand dollars"). Treat them as equal when numerically equivalent.
- If the rubric expects a number or duration, prefer **normalized comparison** (extract and compare values) over string matching.

## STYLE NEUTRALITY (prevents style contamination):
Ignore tone, politeness, length, and flourish unless the rubric explicitly requires a format/structure (e.g., "itemized list", "no citations", "one sentence").
- Do **not** penalize hedging, voice, or verbosity if content satisfies the rubric.
- Only evaluate format when the rubric **explicitly** mandates it.

## SCORING SCALE:
- **1.0 (Complete Compliance)**: Fully complies with the rubric criterion.
  - Positive: required element present, accurate, properly executed (allowing semantic equivalents).
  - Negative: prohibited element **absent** AND response is **responsive**.

- **0.5 (Partial Compliance)**: Partially complies.
  - Positive: element present but minor inaccuracies/incomplete execution.
  - Negative: generally responsive and mostly avoids the prohibited element but with minor/edge violations.

- **0.0 (No Compliance)**: Fails to comply.
  - Positive: required element missing or incorrect.
  - Negative: prohibited element present **or** response is non-responsive/evasive even if the element is absent.

## EVALUATION INSTRUCTIONS:
1. **Understand the Requirement**: Determine if the rubric is asking for something to be present (positive) or absent (negative/constraint).

2. **Parse Compound Statements**: If the rubric contains multiple elements connected by "and" or commas, evaluate whether:
   - **All elements** must be present for full compliance (1.0)
   - **Some elements** present indicates partial compliance (0.5)
   - **No elements** present indicates no compliance (0.0)

3. **Check Compliance**:
   - For positive requirements: Look for the presence and quality of the required element
   - For negative constraints: Look for the absence of the prohibited element

4. **Assign Score**: Based on compliance with the specific rubric criterion according to the scoring scale above.

5. **Provide Reasoning**: Explain whether the rubric criterion was satisfied and justify the score.

## OUTPUT FORMAT:
Return your evaluation in JSON format with two fields:

{
   "score": [your score: 1.0, 0.5, or 0.0],
   "reason": "[detailed explanation of whether the rubric criterion was satisfied and why this justified the assigned score]"
}

NOTE: ONLY output the json object, without any explanation before or after that
`;

function parseBeamScore(raw: string): number {
  const jsonMatch = /\{[\s\S]*\}/u.exec(raw);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { score?: unknown };
      const score = Number(parsed.score);
      if (score === 1 || score === 0.5 || score === 0) {
        return score;
      }
    } catch {
      // fall through
    }
  }
  const numeric = /\b(1(?:\.0)?|0\.5|0(?:\.0)?)\b/u.exec(raw);
  if (numeric) {
    return Number(numeric[1]);
  }
  throw new Error(`unparseable BEAM judge score: ${raw.slice(0, 120)}`);
}

// ---------------------------------------------------------------------------
// Judge client: direct chat-completions call so the official kwargs
// (temperature 0, bounded max_tokens) are honored exactly.
// ---------------------------------------------------------------------------

async function callJudge(input: {
  maxTokens: number;
  prompt: string;
  system?: string;
}): Promise<string> {
  const baseURL = process.env.GOODMEMORY_JUDGE_BASE_URL;
  const apiKey = process.env.GOODMEMORY_JUDGE_API_KEY;
  const model = process.env.GOODMEMORY_JUDGE_MODEL;
  if (!baseURL || !apiKey || !model) {
    throw new Error("GOODMEMORY_JUDGE_BASE_URL/API_KEY/MODEL are required");
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
        body: JSON.stringify({
          max_tokens: input.maxTokens,
          messages: [
            ...(input.system ? [{ content: input.system, role: "system" }] : []),
            { content: input.prompt, role: "user" },
          ],
          model,
          temperature: 0,
        }),
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (!response.ok || payload.error) {
        throw new Error(
          `judge gateway ${response.status}: ${payload.error?.message ?? "request failed"}`,
        );
      }
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new Error("judge returned empty content");
      }
      return content.trim();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
  throw lastError;
}

function parseYesNo(raw: string): boolean {
  return raw.toLowerCase().includes("yes");
}

function parseCorrectWrong(raw: string): boolean {
  const jsonMatch = /\{[\s\S]*\}/u.exec(raw);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { label?: string };
      if (typeof parsed.label === "string") {
        return parsed.label.toUpperCase() === "CORRECT";
      }
    } catch {
      // fall through to the string check
    }
  }
  const upper = raw.toUpperCase();
  return upper.includes("CORRECT") && !upper.includes("WRONG");
}

// ---------------------------------------------------------------------------
// Case loaders: join stored hypotheses with the benchmark roots.
// ---------------------------------------------------------------------------

async function loadJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function loadLongmemevalCases(input: {
  referencePath: string;
  reportPath: string;
}): Promise<{ abstentionIds: Set<string>; cases: JudgeCase[] }> {
  const report = (await loadJson(input.reportPath)) as {
    profiles: Record<string, { cases: Array<{ hypothesis: string; questionId: string }> }>;
  };
  const profile = report.profiles["goodmemory-rules-only"];
  if (!profile) {
    throw new Error("report is missing the goodmemory-rules-only profile");
  }
  const reference = (await loadJson(input.referencePath)) as Array<{
    answer: unknown;
    question: string;
    question_id: string;
    question_type: string;
  }>;
  const byId = new Map(reference.map((entry) => [entry.question_id, entry]));
  const abstentionIds = new Set<string>();
  const cases: JudgeCase[] = [];
  for (const entry of profile.cases) {
    const ref = byId.get(entry.questionId);
    if (!ref) {
      throw new Error(`reference missing question ${entry.questionId}`);
    }
    if (entry.questionId.includes("_abs")) {
      abstentionIds.add(entry.questionId);
    }
    cases.push({
      category: ref.question_type,
      gold: String(ref.answer),
      hypothesis: entry.hypothesis ?? "",
      question: ref.question,
      questionId: entry.questionId,
    });
  }
  return { abstentionIds, cases };
}

async function loadLocomoCases(input: {
  reportPath: string;
  rootPath: string;
}): Promise<JudgeCase[]> {
  const report = (await loadJson(input.reportPath)) as {
    cases: Array<{
      caseId: string;
      category: string;
      generatedAnswer: string | null;
      questionId: string;
    }>;
  };
  const root = (await loadJson(input.rootPath)) as {
    cases: Array<{
      caseId: string;
      questions: Array<{ goldAnswer: string | null; question: string; questionId: string }>;
    }>;
  };
  const byId = new Map<string, { goldAnswer: string | null; question: string }>();
  for (const rootCase of root.cases) {
    for (const question of rootCase.questions) {
      byId.set(question.questionId, question);
    }
  }
  const cases: JudgeCase[] = [];
  for (const entry of report.cases) {
    // The industry J-metric judges categories 1-4 only; the adversarial
    // category is excluded from the comparable number (reported separately by
    // the deterministic scorer).
    if (entry.category === "adversarial") {
      continue;
    }
    const ref = byId.get(entry.questionId);
    if (!ref) {
      throw new Error(`root missing question ${entry.questionId}`);
    }
    cases.push({
      category: entry.category,
      gold: ref.goldAnswer ?? "",
      hypothesis: entry.generatedAnswer ?? "",
      question: ref.question,
      questionId: entry.questionId,
    });
  }
  return cases;
}

// ---------------------------------------------------------------------------
// BEAM rubric-level rescore (official unified judge, per rubric item)
// ---------------------------------------------------------------------------

async function runBeamRubricRescore(input: {
  concurrency: number;
  limit?: number;
  outputDir: string;
  progressPath: string;
  reportPath: string;
  rubricsPath: string;
  runId: string;
}): Promise<void> {
  const report = (await loadJson(input.reportPath)) as {
    cases: Array<{ hypothesis?: string; questionId: string; questionType: string }>;
  };
  const rubrics = (await loadJson(input.rubricsPath)) as Record<
    string,
    { question: string; rubric: string[] }
  >;
  interface RubricUnit {
    itemIndex: number;
    key: string;
    prompt: string;
    questionId: string;
  }
  let units: RubricUnit[] = [];
  const questionMeta = new Map<string, { itemCount: number; questionType: string }>();
  for (const entry of report.cases) {
    const rubricEntry = rubrics[entry.questionId];
    if (!rubricEntry || rubricEntry.rubric.length === 0) {
      throw new Error(`no rubric for ${entry.questionId}`);
    }
    questionMeta.set(entry.questionId, {
      itemCount: rubricEntry.rubric.length,
      questionType: entry.questionType,
    });
    rubricEntry.rubric.forEach((item, itemIndex) => {
      units.push({
        itemIndex,
        key: `${entry.questionId}#${itemIndex}`,
        prompt: BEAM_JUDGE_TEMPLATE.replace("<question>", rubricEntry.question)
          .replace("<rubric_item>", item)
          .replace("<llm_response>", entry.hypothesis ?? ""),
        questionId: entry.questionId,
      });
    });
  }
  if (input.limit !== undefined) {
    units = units.slice(0, input.limit);
  }

  const done = new Map<string, number>();
  try {
    for (const line of (await readFile(input.progressPath, "utf8")).split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as { key: string; score: number };
        done.set(row.key, row.score);
      } catch {
        // torn tail line - ignore
      }
    }
  } catch {
    // fresh run
  }
  const pending = units.filter((unit) => !done.has(unit.key));
  console.log(
    `beam: ${units.length} rubric items over ${questionMeta.size} questions, ${done.size} cached, ${pending.length} to judge (model ${process.env.GOODMEMORY_JUDGE_MODEL})`,
  );

  let cursor = 0;
  let failures = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= pending.length) return;
      const unit = pending[index]!;
      try {
        const raw = await callJudge({ maxTokens: 400, prompt: unit.prompt });
        const score = parseBeamScore(raw);
        done.set(unit.key, score);
        await appendFile(
          input.progressPath,
          `${JSON.stringify({ key: unit.key, questionId: unit.questionId, score })}\n`,
        );
      } catch (error) {
        failures += 1;
        console.error(`judge failed for ${unit.key}: ${String(error).slice(0, 160)}`);
      }
      if ((index + 1) % 100 === 0) {
        console.log(`${index + 1}/${pending.length} rubric items judged`);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(input.concurrency, pending.length)) }, () =>
      worker(),
    ),
  );

  const questionScores = new Map<string, number>();
  for (const [questionId, meta] of questionMeta) {
    let sum = 0;
    let scored = 0;
    for (let itemIndex = 0; itemIndex < meta.itemCount; itemIndex += 1) {
      const score = done.get(`${questionId}#${itemIndex}`);
      if (score === undefined) continue;
      sum += score;
      scored += 1;
    }
    if (scored === meta.itemCount) {
      questionScores.set(questionId, sum / meta.itemCount);
    }
  }
  const byCategory = new Map<string, { scores: number[] }>();
  for (const [questionId, score] of questionScores) {
    const meta = questionMeta.get(questionId)!;
    const bucket = byCategory.get(meta.questionType) ?? { scores: [] };
    bucket.scores.push(score);
    byCategory.set(meta.questionType, bucket);
  }
  const categoryMeans = [...byCategory.entries()].map(([category, bucket]) => ({
    category,
    mean: bucket.scores.reduce((a, b) => a + b, 0) / bucket.scores.length,
    questions: bucket.scores.length,
  }));
  const allScores = [...questionScores.values()];
  const summary = {
    benchmark: "beam",
    categories: Object.fromEntries(
      categoryMeans.map((entry) => [
        entry.category,
        { meanScore: entry.mean, questions: entry.questions },
      ]),
    ),
    generatedBy: "scripts/rescore-official-protocols.ts",
    judgeFailures: failures,
    judgeModel: process.env.GOODMEMORY_JUDGE_MODEL,
    overallMacroByCategory:
      categoryMeans.reduce((a, b) => a + b.mean, 0) / Math.max(1, categoryMeans.length),
    overallMicroByQuestion:
      allScores.reduce((a, b) => a + b, 0) / Math.max(1, allScores.length),
    protocol:
      "official BEAM unified rubric judge (1.0/0.5/0.0 per rubric item; question = mean over items). Deviation from the paper pipeline: event_ordering is rubric-judged here (the paper scores it with tau_norm); this matches the public third-party reference which judged all 1051 rubric items.",
    rubricItemsJudged: done.size,
    runId: input.runId,
    scoredQuestions: questionScores.size,
    sourceAnswersUnchanged: true,
    totalQuestions: questionMeta.size,
    totalRubricItems: units.length,
  };
  await writeFile(
    join(input.outputDir, "rescore-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
}

// ---------------------------------------------------------------------------
// Resumable runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseOfficialRescoreCliOptions(Bun.argv);
  const { benchmark, concurrency, limit, runId } = options;

  const outputDir = join(
    repoRoot,
    "reports",
    "eval",
    "research",
    "official-rescore",
    runId,
  );
  await mkdir(outputDir, { recursive: true });
  const progressPath = join(outputDir, "progress.jsonl");

  let judgePrompt: (c: JudgeCase) => { maxTokens: number; prompt: string; system?: string };
  let parseVerdict: (raw: string) => boolean;
  let cases: JudgeCase[];

  if (benchmark === "longmemeval") {
    const { abstentionIds, cases: loaded } = await loadLongmemevalCases({
      referencePath:
        options.referencePath ??
        `${process.env.HOME}/.goodmemory-longmemeval/longmemeval_s.json`,
      reportPath:
        options.reportPath ??
        join(
          repoRoot,
          "reports/eval/research/phase-62/longmemeval/run-phase67b-longmemeval-rules-deterministic-current/report.json",
        ),
    });
    cases = loaded;
    judgePrompt = (c) => ({
      maxTokens: 10,
      prompt: buildLongmemevalPrompt(c, abstentionIds.has(c.questionId)),
    });
    parseVerdict = parseYesNo;
  } else if (benchmark === "locomo") {
    cases = await loadLocomoCases({
      reportPath:
        options.reportPath ??
        join(
          repoRoot,
          "reports/eval/research/phase-65/locomo/run-p4-full10-union16-ext-live/union-live-report.json",
        ),
      rootPath: options.rootPath ?? "/private/tmp/LOCOMO-full10/cases.json",
    });
    judgePrompt = (c) => ({
      maxTokens: 300,
      prompt: LOCOMO_JUDGE_TEMPLATE.replace("{q}", c.question)
        .replace("{a}", c.gold)
        .replace("{r}", c.hypothesis),
      system: LOCOMO_JUDGE_SYSTEM,
    });
    parseVerdict = parseCorrectWrong;
  } else {
    await runBeamRubricRescore({
      concurrency,
      limit,
      outputDir,
      progressPath,
      reportPath:
        options.reportPath ??
        join(
          repoRoot,
          "reports/eval/research/phase-63/beam/run-p5-beam-closure-rules-abstfmt-gpt54judge/live-slice-report.json",
        ),
      rubricsPath:
        options.rubricsPath ??
        `${process.env.HOME}/.goodmemory-beam/rubrics-by-question-id.json`,
      runId,
    });
    return;
  }

  if (limit !== undefined) {
    cases = cases.slice(0, limit);
  }

  const done = new Map<string, boolean>();
  try {
    for (const line of (await readFile(progressPath, "utf8")).split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as { correct: boolean; questionId: string };
        done.set(row.questionId, row.correct);
      } catch {
        // torn tail line from a killed run - ignore
      }
    }
  } catch {
    // fresh run
  }
  const pending = cases.filter((c) => !done.has(c.questionId));
  console.log(
    `${benchmark}: ${cases.length} cases, ${done.size} cached, ${pending.length} to judge (model ${process.env.GOODMEMORY_JUDGE_MODEL})`,
  );

  let cursor = 0;
  let failures = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= pending.length) return;
      const c = pending[index]!;
      try {
        const spec = judgePrompt(c);
        const raw = await callJudge(spec);
        const correct = parseVerdict(raw);
        done.set(c.questionId, correct);
        await appendFile(
          progressPath,
          `${JSON.stringify({ category: c.category, correct, questionId: c.questionId, raw: raw.slice(0, 400) })}\n`,
        );
      } catch (error) {
        failures += 1;
        console.error(`judge failed for ${c.questionId}: ${String(error).slice(0, 160)}`);
      }
      if ((index + 1) % 50 === 0) {
        console.log(`${index + 1}/${pending.length} judged`);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, pending.length)) }, () => worker()),
  );

  const byCategory = new Map<string, { correct: number; total: number }>();
  for (const c of cases) {
    const verdict = done.get(c.questionId);
    if (verdict === undefined) continue;
    const bucket = byCategory.get(c.category) ?? { correct: 0, total: 0 };
    bucket.total += 1;
    if (verdict) bucket.correct += 1;
    byCategory.set(c.category, bucket);
  }
  const judged = [...done.entries()].filter(([id]) => cases.some((c) => c.questionId === id));
  const overallCorrect = judged.filter(([, v]) => v).length;
  const summary = {
    benchmark,
    categories: Object.fromEntries(
      [...byCategory.entries()].map(([category, bucket]) => [
        category,
        {
          accuracy: bucket.total === 0 ? null : bucket.correct / bucket.total,
          correct: bucket.correct,
          total: bucket.total,
        },
      ]),
    ),
    generatedBy: "scripts/rescore-official-protocols.ts",
    judgeFailures: failures,
    judgeModel: process.env.GOODMEMORY_JUDGE_MODEL,
    judgedCases: judged.length,
    overallAccuracy: judged.length === 0 ? null : overallCorrect / judged.length,
    overallCorrect,
    protocol:
      benchmark === "longmemeval"
        ? "official LongMemEval evaluate_qa.py anscheck prompts (temperature 0)"
        : benchmark === "locomo"
          ? "mem0ai/memory-benchmarks LoCoMo judge (no-evidence variant, categories 1-4)"
          : "official BEAM judge prompt",
    runId,
    sourceAnswersUnchanged: true,
    totalCases: cases.length,
  };
  await writeFile(join(outputDir, "rescore-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.main) {
  await main();
}
