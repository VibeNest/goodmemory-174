import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  parseCliPositiveIntegerFlagStrict,
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "./cli-options";
import {
  callJudge,
  readOfficialRescoreRubricProgressRows,
  resolveOfficialRescoreJudgeEnvironment,
} from "./rescore-official-protocols";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

const GENERATED_BY = "scripts/rescore-beam-paper-protocol.ts";
const UPSTREAM_REPOSITORY = "https://github.com/mohammadtavakoli78/BEAM";
const UPSTREAM_COMMIT = "3e12035532eb85768f1a7cd779832b650c4b2ef9";
const DEFAULT_CONCURRENCY = 40;
const EVENT_ORDERING_SYSTEM_PROMPT = `
You are a binary classifier.
If the TWO snippets describe the SAME event/fact, reply **YES**
Otherwise reply **NO**. No extra words.
DO NOT provide any exaplanation.
`.trim();

export const BEAM_ABILITIES = [
  "abstention",
  "contradiction_resolution",
  "event_ordering",
  "information_extraction",
  "instruction_following",
  "knowledge_update",
  "multi_session_reasoning",
  "preference_following",
  "summarization",
  "temporal_reasoning",
] as const;

export type BeamAbility = (typeof BEAM_ABILITIES)[number];

const EXPLICIT_BEAM_ABILITIES: ReadonlySet<string> = new Set(
  BEAM_ABILITIES.filter((ability) => ability !== "information_extraction"),
);
const BEAM_INFORMATION_EXTRACTION_TYPES: ReadonlySet<string> = new Set([
  "Context-Based Recall",
  "Comparison Questions",
  "Discovery and Learning Process",
  "Problem-Solution Context",
  "Relationship and Connection Context",
  "Timeline Integration",
  "context_based_recall",
  "context_date/time",
  "context_detail",
  "date_recall",
  "distance_recall",
  "duration_recall",
  "information_extraction",
  "location_and_distance_recall",
  "named_entity",
  "name_recognition",
  "number_recall",
  "numerical_precision",
  "preference_recall",
  "temporal_and_location_recall",
  "temporal_discrimination",
]);

export interface BeamPaperProtocolCliOptions {
  concurrency: number;
  outputDir?: string;
  reportPath?: string;
  rubricRescoreDir?: string;
  rubricsPath?: string;
  runId: string;
}

interface BeamReportCase {
  hypothesis?: string;
  questionId: string;
  questionType: string;
}

interface BeamRubricEntry {
  question: string;
  rubric: string[];
}

interface FileFingerprint {
  bytes: number;
  sha256: string;
}

interface AlignmentProgressRow {
  equivalent: boolean;
  key: string;
  questionId: string;
  referenceIndex: number;
  systemIndex: number;
}

interface BeamEventOrderingResult {
  alignedSystemItems: string[];
  questionId: string;
  referenceItems: string[];
  systemItems: string[];
  tauNorm: number;
}

interface BeamPaperRunIdentity {
  generatedBy: typeof GENERATED_BY;
  judgeModel: string;
  protocol: "beam-paper";
  runId: string;
  sourceAnswersUnchanged: true;
  sourceFingerprints: {
    report: FileFingerprint;
    rubricRescoreIdentity: FileFingerprint;
    rubricRescoreProgress: FileFingerprint;
    rubrics: FileFingerprint;
  };
  sourcePaths: {
    report: string;
    rubricRescoreIdentity: string;
    rubricRescoreProgress: string;
    rubrics: string;
  };
  upstream: {
    commit: typeof UPSTREAM_COMMIT;
    repository: typeof UPSTREAM_REPOSITORY;
  };
}

export interface BeamEventOrderingEquivalenceInput {
  referenceIndex: number;
  referenceItem: string;
  systemIndex: number;
  systemItem: string;
}

export function canonicalizeBeamAbility(questionType: string): BeamAbility {
  if (EXPLICIT_BEAM_ABILITIES.has(questionType)) {
    return questionType as BeamAbility;
  }
  if (BEAM_INFORMATION_EXTRACTION_TYPES.has(questionType)) {
    return "information_extraction";
  }
  throw new Error(`unknown BEAM question type: ${questionType}`);
}

export function buildBeamPaperCategorySummary(
  questions: readonly { questionType: string; score: number }[],
): {
  categories: Partial<
    Record<BeamAbility, { meanScore: number; questions: number }>
  >;
  overallMacroByAbility: number;
  overallMicroByQuestion: number;
} {
  if (questions.length === 0) {
    throw new Error("BEAM paper category summary requires at least one question.");
  }
  const scoresByAbility = new Map<BeamAbility, number[]>();
  for (const question of questions) {
    const ability = canonicalizeBeamAbility(question.questionType);
    const scores = scoresByAbility.get(ability) ?? [];
    scores.push(question.score);
    scoresByAbility.set(ability, scores);
  }
  const categories = Object.fromEntries(
    BEAM_ABILITIES.flatMap((ability) => {
      const scores = scoresByAbility.get(ability);
      return scores
        ? [[ability, { meanScore: mean(scores), questions: scores.length }]]
        : [];
    }),
  ) as Partial<Record<BeamAbility, { meanScore: number; questions: number }>>;
  const abilityMeans = BEAM_ABILITIES.flatMap((ability) => {
    const category = categories[ability];
    return category ? [category.meanScore] : [];
  });
  return {
    categories,
    overallMacroByAbility: mean(abilityMeans),
    overallMicroByQuestion: mean(questions.map((question) => question.score)),
  };
}

export function computeKendallTauB(
  left: readonly number[],
  right: readonly number[],
): number {
  if (left.length !== right.length || left.length < 2) {
    throw new Error("Kendall tau-b requires equal sequences with at least two items.");
  }
  let concordant = 0;
  let discordant = 0;
  let leftTies = 0;
  let rightTies = 0;
  for (let first = 0; first < left.length - 1; first += 1) {
    for (let second = first + 1; second < left.length; second += 1) {
      const leftDelta = left[first]! - left[second]!;
      const rightDelta = right[first]! - right[second]!;
      if (leftDelta === 0 && rightDelta === 0) {
        continue;
      }
      if (leftDelta === 0) {
        leftTies += 1;
      } else if (rightDelta === 0) {
        rightTies += 1;
      } else if (leftDelta * rightDelta > 0) {
        concordant += 1;
      } else {
        discordant += 1;
      }
    }
  }
  const comparable = concordant + discordant;
  const denominator = Math.sqrt(
    (comparable + leftTies) * (comparable + rightTies),
  );
  if (denominator === 0) {
    throw new Error("Kendall tau-b is undefined for the supplied sequences.");
  }
  return (concordant - discordant) / denominator;
}

function rankSequence(
  sequence: readonly string[],
  union: readonly string[],
): number[] {
  const rankByItem = new Map<string, number>();
  sequence.forEach((item, index) => rankByItem.set(item, index + 1));
  const tieRank = union.length + 1;
  return union.map((item) => rankByItem.get(item) ?? tieRank);
}

export function computeBeamEventOrderingTauNorm(input: {
  alignedSystemItems: readonly string[];
  referenceItems: readonly string[];
}): number {
  const union = [
    ...new Set([...input.referenceItems, ...input.alignedSystemItems]),
  ];
  const tau = computeKendallTauB(
    rankSequence(input.referenceItems, union),
    rankSequence(input.alignedSystemItems, union),
  );
  return (tau + 1) / 2;
}

export async function alignBeamEventOrderingItems(input: {
  equivalent: (input: BeamEventOrderingEquivalenceInput) => Promise<boolean>;
  referenceItems: readonly string[];
  systemItems: readonly string[];
}): Promise<string[]> {
  const usedReferenceIndexes = new Set<number>();
  const aligned: string[] = [];
  for (const [systemIndex, systemItem] of input.systemItems.entries()) {
    let matchedReferenceIndex: number | undefined;
    for (const [referenceIndex, referenceItem] of input.referenceItems.entries()) {
      if (usedReferenceIndexes.has(referenceIndex)) {
        continue;
      }
      if (
        await input.equivalent({
          referenceIndex,
          referenceItem,
          systemIndex,
          systemItem,
        })
      ) {
        matchedReferenceIndex = referenceIndex;
        break;
      }
    }
    if (matchedReferenceIndex === undefined) {
      aligned.push(systemItem);
      continue;
    }
    usedReferenceIndexes.add(matchedReferenceIndex);
    aligned.push(input.referenceItems[matchedReferenceIndex]!);
  }
  return aligned;
}

function requiredPath(value: string | undefined, flag: string): string {
  if (value === undefined) {
    throw new Error(`${flag} is required.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBeamReport(value: unknown, path: string): { cases: BeamReportCase[] } {
  if (!isRecord(value) || !Array.isArray(value.cases) || value.cases.length === 0) {
    throw new Error(`malformed BEAM report at ${path}: cases must be non-empty`);
  }
  const cases = value.cases.map((entry, index): BeamReportCase => {
    if (
      !isRecord(entry) ||
      typeof entry.questionId !== "string" ||
      entry.questionId.length === 0 ||
      typeof entry.questionType !== "string" ||
      entry.questionType.length === 0 ||
      (entry.hypothesis !== undefined && typeof entry.hypothesis !== "string")
    ) {
      throw new Error(`malformed BEAM report case at ${path}:${index + 1}`);
    }
    canonicalizeBeamAbility(entry.questionType);
    return {
      ...(entry.hypothesis === undefined ? {} : { hypothesis: entry.hypothesis }),
      questionId: entry.questionId,
      questionType: entry.questionType,
    };
  });
  return { cases };
}

function parseBeamRubrics(
  value: unknown,
  path: string,
): Record<string, BeamRubricEntry> {
  if (!isRecord(value)) {
    throw new Error(`malformed BEAM rubrics at ${path}: expected an object`);
  }
  const rubrics: Record<string, BeamRubricEntry> = {};
  for (const [questionId, entry] of Object.entries(value)) {
    if (
      !isRecord(entry) ||
      typeof entry.question !== "string" ||
      entry.question.length === 0 ||
      !Array.isArray(entry.rubric) ||
      entry.rubric.length === 0 ||
      !entry.rubric.every((item) => typeof item === "string" && item.length > 0)
    ) {
      throw new Error(`malformed BEAM rubric at ${path}:${questionId}`);
    }
    rubrics[questionId] = {
      question: entry.question,
      rubric: entry.rubric,
    };
  }
  return rubrics;
}

function pathInsideOrEqual(parentPath: string, candidatePath: string): boolean {
  const child = relative(parentPath, candidatePath);
  return child.length === 0 ||
    (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

async function resolvePhysicalPath(path: string): Promise<string> {
  let ancestor = resolve(path);
  const missingSegments: string[] = [];
  while (true) {
    try {
      return resolve(await realpath(ancestor), ...missingSegments);
    } catch (error) {
      if (!hasErrorCode(error, "ENOENT")) {
        throw error;
      }
      const parent = dirname(ancestor);
      if (parent === ancestor) {
        throw error;
      }
      missingSegments.unshift(basename(ancestor));
      ancestor = parent;
    }
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === code;
}

async function assertOutputSourcesDisjoint(input: {
  reportPath: string;
  rubricRescoreDir: string;
  rubricsPath: string;
  runDirectory: string;
}): Promise<void> {
  const [reportPath, rubricRescoreDir, rubricsPath, runDirectory] =
    await Promise.all([
      resolvePhysicalPath(input.reportPath),
      resolvePhysicalPath(input.rubricRescoreDir),
      resolvePhysicalPath(input.rubricsPath),
      resolvePhysicalPath(input.runDirectory),
    ]);
  const sourceFiles = [reportPath, rubricsPath];
  if (
    sourceFiles.some((path) => pathInsideOrEqual(runDirectory, path)) ||
    pathInsideOrEqual(runDirectory, rubricRescoreDir) ||
    pathInsideOrEqual(rubricRescoreDir, runDirectory)
  ) {
    throw new Error(
      `BEAM paper rescore output ${input.runDirectory} overlaps source input`,
    );
  }
}

export function parseBeamPaperProtocolCliOptions(
  argv: readonly string[],
): BeamPaperProtocolCliOptions {
  return {
    concurrency:
      parseCliPositiveIntegerFlagStrict(argv, "--concurrency") ??
      DEFAULT_CONCURRENCY,
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir"),
    reportPath: resolveCliFlagValueStrict(argv, "--report"),
    rubricRescoreDir: resolveCliFlagValueStrict(argv, "--rubric-rescore-dir"),
    rubricsPath: resolveCliFlagValueStrict(argv, "--rubrics"),
    runId:
      resolveCliPathSegmentFlagValueStrict(argv, "--run-id") ??
      "rescore-beam-paper-protocol-current",
  };
}

async function fingerprintFile(path: string): Promise<FileFingerprint> {
  const content = await readFile(path);
  return {
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

function identitiesEqual(
  left: BeamPaperRunIdentity,
  right: BeamPaperRunIdentity,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function ensureRunIdentity(
  path: string,
  expected: BeamPaperRunIdentity,
): Promise<void> {
  try {
    const current = JSON.parse(await readFile(path, "utf8")) as BeamPaperRunIdentity;
    if (!identitiesEqual(current, expected)) {
      throw new Error(`BEAM paper rescore run identity changed at ${path}.`);
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      await writeFile(path, `${JSON.stringify(expected, null, 2)}\n`);
      return;
    }
    throw error;
  }
}

function parseAlignmentProgress(raw: string, path: string): AlignmentProgressRow[] {
  const rows: AlignmentProgressRow[] = [];
  const lines = raw.split("\n");
  for (const [index, line] of lines.entries()) {
    if (line.length === 0) {
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      if (index === lines.length - 1 && !raw.endsWith("\n")) {
        continue;
      }
      throw new Error(`malformed BEAM paper progress row at ${path}:${index + 1}`);
    }
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(",") !==
        "equivalent,key,questionId,referenceIndex,systemIndex" ||
      typeof (value as AlignmentProgressRow).equivalent !== "boolean" ||
      typeof (value as AlignmentProgressRow).key !== "string" ||
      typeof (value as AlignmentProgressRow).questionId !== "string" ||
      !Number.isInteger((value as AlignmentProgressRow).referenceIndex) ||
      !Number.isInteger((value as AlignmentProgressRow).systemIndex)
    ) {
      throw new Error(`malformed BEAM paper progress row at ${path}:${index + 1}`);
    }
    rows.push(value as AlignmentProgressRow);
  }
  return rows;
}

async function readAlignmentProgress(
  path: string,
  allowedKeys: ReadonlySet<string>,
): Promise<Map<string, boolean>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return new Map();
    }
    throw error;
  }
  const done = new Map<string, boolean>();
  for (const row of parseAlignmentProgress(raw, path)) {
    if (!allowedKeys.has(row.key)) {
      throw new Error(`BEAM paper progress row is outside selected scope: ${row.key}`);
    }
    if (done.has(row.key)) {
      throw new Error(`duplicate BEAM paper progress row: ${row.key}`);
    }
    done.set(row.key, row.equivalent);
  }
  return done;
}

function buildPairKey(input: {
  questionId: string;
  referenceIndex: number;
  systemIndex: number;
}): string {
  return `${input.questionId}#${input.systemIndex}#${input.referenceIndex}`;
}

function buildEquivalencePrompt(referenceItem: string, systemItem: string): string {
  return `First snippet: ${referenceItem} \nSecond snippet: ${systemItem}`;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const run = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index]!);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(concurrency, items.length || 1)) },
      () => run(),
    ),
  );
  return results;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function runBeamPaperProtocolRescore(
  options: BeamPaperProtocolCliOptions,
): Promise<Record<string, unknown>> {
  const reportPath = resolve(requiredPath(options.reportPath, "--report"));
  const rubricsPath = resolve(requiredPath(options.rubricsPath, "--rubrics"));
  const rubricRescoreDir = resolve(
    requiredPath(options.rubricRescoreDir, "--rubric-rescore-dir"),
  );
  const repoRoot = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputRoot = resolve(
    options.outputDir ?? join(repoRoot, "reports/eval/research/official-rescore"),
  );
  const runDirectory = join(outputRoot, options.runId);
  const summaryPath = join(runDirectory, "rescore-summary.json");
  const eventScoresPath = join(runDirectory, "event-ordering-scores.json");
  const progressPath = join(runDirectory, "progress.jsonl");
  const identityPath = join(runDirectory, "run-identity.json");
  const rubricRescoreIdentityPath = join(rubricRescoreDir, "run-identity.json");
  const rubricRescoreProgressPath = join(rubricRescoreDir, "progress.jsonl");

  await assertOutputSourcesDisjoint({
    reportPath,
    rubricRescoreDir,
    rubricsPath,
    runDirectory,
  });
  const report = parseBeamReport(
    JSON.parse(await readFile(reportPath, "utf8")) as unknown,
    reportPath,
  );
  const rubrics = parseBeamRubrics(
    JSON.parse(await readFile(rubricsPath, "utf8")) as unknown,
    rubricsPath,
  );
  resolveOfficialRescoreJudgeEnvironment(process.env);
  const rubricRescoreIdentity = JSON.parse(
    await readFile(rubricRescoreIdentityPath, "utf8"),
  ) as {
    benchmark?: unknown;
    judgeModel?: unknown;
    sourceAnswersUnchanged?: unknown;
    sourceInputFingerprints?: {
      reportPath?: FileFingerprint;
      rubricsPath?: FileFingerprint;
    };
  };
  const judgeModel = process.env.GOODMEMORY_JUDGE_MODEL!;
  const sourceFingerprints = {
    report: await fingerprintFile(reportPath),
    rubricRescoreIdentity: await fingerprintFile(rubricRescoreIdentityPath),
    rubricRescoreProgress: await fingerprintFile(rubricRescoreProgressPath),
    rubrics: await fingerprintFile(rubricsPath),
  };
  if (
    rubricRescoreIdentity.benchmark !== "beam" ||
    rubricRescoreIdentity.judgeModel !== judgeModel ||
    rubricRescoreIdentity.sourceAnswersUnchanged !== true ||
    rubricRescoreIdentity.sourceInputFingerprints?.reportPath?.sha256 !==
      sourceFingerprints.report.sha256 ||
    rubricRescoreIdentity.sourceInputFingerprints?.rubricsPath?.sha256 !==
      sourceFingerprints.rubrics.sha256
  ) {
    throw new Error(
      "The reusable BEAM rubric rescore does not match the report, rubrics, or judge model.",
    );
  }

  const identity: BeamPaperRunIdentity = {
    generatedBy: GENERATED_BY,
    judgeModel,
    protocol: "beam-paper",
    runId: options.runId,
    sourceAnswersUnchanged: true,
    sourceFingerprints,
    sourcePaths: {
      report: reportPath,
      rubricRescoreIdentity: rubricRescoreIdentityPath,
      rubricRescoreProgress: rubricRescoreProgressPath,
      rubrics: rubricsPath,
    },
    upstream: {
      commit: UPSTREAM_COMMIT,
      repository: UPSTREAM_REPOSITORY,
    },
  };
  await mkdir(runDirectory, { recursive: true });
  await ensureRunIdentity(identityPath, identity);

  const seenQuestionIds = new Set<string>();
  const eventCases: Array<{
    entry: BeamReportCase;
    rubric: BeamRubricEntry;
    systemItems: string[];
  }> = [];
  for (const entry of report.cases) {
    if (seenQuestionIds.has(entry.questionId)) {
      throw new Error(`duplicate BEAM report question: ${entry.questionId}`);
    }
    seenQuestionIds.add(entry.questionId);
    const rubric = rubrics[entry.questionId];
    if (!rubric || rubric.rubric.length === 0) {
      throw new Error(`no BEAM rubric for ${entry.questionId}`);
    }
    if (canonicalizeBeamAbility(entry.questionType) === "event_ordering") {
      eventCases.push({
        entry,
        rubric,
        systemItems: (entry.hypothesis ?? "").split("\n"),
      });
    }
  }

  const allowedPairKeys = new Set<string>();
  for (const eventCase of eventCases) {
    for (const systemIndex of eventCase.systemItems.keys()) {
      for (const referenceIndex of eventCase.rubric.rubric.keys()) {
        allowedPairKeys.add(
          buildPairKey({
            questionId: eventCase.entry.questionId,
            referenceIndex,
            systemIndex,
          }),
        );
      }
    }
  }
  const alignmentVerdicts = await readAlignmentProgress(
    progressPath,
    allowedPairKeys,
  );
  let newAlignmentVerdicts = 0;
  let judgeFailures = 0;
  const eventResults = await mapWithConcurrency(
    eventCases,
    options.concurrency,
    async (eventCase): Promise<BeamEventOrderingResult | undefined> => {
      try {
        const alignedSystemItems = await alignBeamEventOrderingItems({
          equivalent: async ({ referenceIndex, referenceItem, systemIndex, systemItem }) => {
            const key = buildPairKey({
              questionId: eventCase.entry.questionId,
              referenceIndex,
              systemIndex,
            });
            const cached = alignmentVerdicts.get(key);
            if (cached !== undefined) {
              return cached;
            }
            const raw = await callJudge({
              maxTokens: 10,
              prompt: buildEquivalencePrompt(referenceItem, systemItem),
              system: EVENT_ORDERING_SYSTEM_PROMPT,
            });
            const equivalent = raw.toLowerCase().includes("yes");
            alignmentVerdicts.set(key, equivalent);
            newAlignmentVerdicts += 1;
            const row: AlignmentProgressRow = {
              equivalent,
              key,
              questionId: eventCase.entry.questionId,
              referenceIndex,
              systemIndex,
            };
            await appendFile(progressPath, `${JSON.stringify(row)}\n`);
            if (newAlignmentVerdicts % 100 === 0) {
              console.log(
                `${newAlignmentVerdicts} new event-ordering pair verdicts recorded`,
              );
            }
            return equivalent;
          },
          referenceItems: eventCase.rubric.rubric,
          systemItems: eventCase.systemItems,
        });
        return {
          alignedSystemItems,
          questionId: eventCase.entry.questionId,
          referenceItems: [...eventCase.rubric.rubric],
          systemItems: eventCase.systemItems,
          tauNorm: computeBeamEventOrderingTauNorm({
            alignedSystemItems,
            referenceItems: eventCase.rubric.rubric,
          }),
        };
      } catch (error) {
        judgeFailures += 1;
        console.error(
          `BEAM paper event-ordering judge failed for ${eventCase.entry.questionId}: ${String(error).slice(0, 240)}`,
        );
        return undefined;
      }
    },
  );
  if (judgeFailures > 0) {
    throw new Error(
      `BEAM paper protocol had ${judgeFailures} event-ordering judge failure(s); resume with the same run id.`,
    );
  }
  const completeEventResults = eventResults.filter(
    (result): result is BeamEventOrderingResult => result !== undefined,
  );
  const eventScoreByQuestionId = new Map(
    completeEventResults.map((result) => [result.questionId, result.tauNorm]),
  );

  const rubricRows = readOfficialRescoreRubricProgressRows(
    await readFile(rubricRescoreProgressPath, "utf8"),
    rubricRescoreProgressPath,
  );
  const rubricScoreByKey = new Map(
    rubricRows.map((row) => [row.key, row.score]),
  );
  const questionScores = new Map<string, number>();
  let rubricItemsReused = 0;
  for (const entry of report.cases) {
    const ability = canonicalizeBeamAbility(entry.questionType);
    if (ability === "event_ordering") {
      const score = eventScoreByQuestionId.get(entry.questionId);
      if (score === undefined) {
        throw new Error(`missing BEAM event-ordering score for ${entry.questionId}`);
      }
      questionScores.set(entry.questionId, score);
      continue;
    }
    const rubric = rubrics[entry.questionId]!;
    const scores = rubric.rubric.map((_, itemIndex) => {
      const score = rubricScoreByKey.get(`${entry.questionId}#${itemIndex}`);
      if (score === undefined) {
        throw new Error(
          `reusable BEAM rubric rescore is missing ${entry.questionId}#${itemIndex}`,
        );
      }
      rubricItemsReused += 1;
      return score;
    });
    questionScores.set(entry.questionId, mean(scores));
  }

  const categorySummary = buildBeamPaperCategorySummary(
    report.cases.map((entry) => ({
      questionType: entry.questionType,
      score: questionScores.get(entry.questionId)!,
    })),
  );
  const summary = {
    benchmark: "beam",
    categories: categorySummary.categories,
    claimBoundary:
      "Stored-answer BEAM paper-protocol rescore; public promotion still requires the benchmark claim gate.",
    eventOrderingAlignmentVerdicts: alignmentVerdicts.size,
    eventOrderingNewAlignmentVerdicts: newAlignmentVerdicts,
    generatedAt: new Date().toISOString(),
    generatedBy: GENERATED_BY,
    judgeFailures,
    judgeModel,
    outputPath: summaryPath,
    overallMacroByAbility: categorySummary.overallMacroByAbility,
    overallMicroByQuestion: categorySummary.overallMicroByQuestion,
    protocol:
      "BEAM upstream report protocol: tau_norm for event_ordering; unified 1.0/0.5/0.0 rubric judge means for the other nine abilities.",
    rubricItemsReused,
    runId: options.runId,
    sourceAnswersUnchanged: true,
    sourceInputs: identity.sourcePaths,
    sourceQuestions: report.cases.length,
    upstream: identity.upstream,
  };
  await writeFile(
    eventScoresPath,
    `${JSON.stringify(completeEventResults, null, 2)}\n`,
  );
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

if (import.meta.main) {
  const summary = await runBeamPaperProtocolRescore(
    parseBeamPaperProtocolCliOptions(Bun.argv),
  );
  console.log(JSON.stringify(summary, null, 2));
}
