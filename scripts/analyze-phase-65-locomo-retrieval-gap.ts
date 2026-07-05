// LoCoMo retrieval-gap analyzer — DIAGNOSIS, not a fix. Joins a Phase 65 smoke
// report (per-question retrieved/gold/noise turn ids) with the external-root
// cases.json (turn text/speaker/session) and characterizes WHY recall is low for
// fact-seeking questions over short conversational utterances. Pure JSON-in /
// JSON-out: it depends only on the eval contract (token normalization, session
// parsing), never on the smoke harness internals.
//
//   bun run analyze:phase-65-locomo-retrieval-gap -- \
//     --report reports/eval/research/phase-65/locomo/<run-id>/smoke-report.json \
//     --cases /private/tmp/LOCOMO/cases.json
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseLocomoSession, tokenizeLocomoAnswer } from "../src/eval/locomo";
import {
  assertDistinctCliPathValues,
  resolveCliFlagValueStrict,
} from "./cli-options";
import {
  assertLocomoReportHasNoExecutionFailures,
  assertLocomoReportQuestionCountMatchesCases,
} from "./locomo-report-compatibility";
import type { LocomoSmokeReport } from "./run-phase-65-locomo-smoke";

export const LOCOMO_RETRIEVAL_GAP_FILE_NAME = "retrieval-gap-analysis.json";

interface ReportQuestion {
  answerCorrect: boolean | null;
  caseId: string;
  category: string;
  evidenceRecall: number;
  evidenceTurnIds: string[];
  goldEvidenceFullyRetrieved: boolean;
  missingEvidenceTurnIds: string[];
  noiseTurnIds: string[];
  questionId: string;
  retrievedTurnIds: string[];
}

interface CaseTurn {
  content: string;
  diaId: string;
  speaker: string;
}

interface NormalizedCase {
  caseId: string;
  questions: { questionId: string; question: string }[];
  turns: CaseTurn[];
}

interface TurnInfo {
  content: string;
  index: number;
  session: number;
  speaker: string;
  tokens: Set<string>;
}

function tokenSet(text: string): Set<string> {
  return new Set(tokenizeLocomoAnswer(text));
}

// Fraction of the question's content tokens that appear in the turn (recall-
// oriented: "does this turn lexically contain the question's words?").
function questionOverlap(questionTokens: Set<string>, turnTokens: Set<string>): number {
  if (questionTokens.size === 0) {
    return 0;
  }
  let hit = 0;
  for (const token of questionTokens) {
    if (turnTokens.has(token)) {
      hit += 1;
    }
  }
  return hit / questionTokens.size;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function reportQuestionKey(result: ReportQuestion): string {
  return `${result.caseId}:${result.questionId}`;
}

interface CategoryAccumulator {
  effectiveButWrong: number; // gold retrieved (recall>0) yet answer wrong
  fullRetrieval: number;
  missedGoldOverlap: number[];
  neighborBeatsGold: number; // gold turns where a +-1/+-2 neighbor out-overlaps it
  neighborConsidered: number;
  partialRetrieval: number;
  questionGoldOverlap: number[]; // best question<->gold-turn overlap per question
  recallPositiveAnswerWrong: number;
  retrievedGoldOverlap: number[];
  total: number;
  zeroRetrieval: number;
}

function emptyAccumulator(): CategoryAccumulator {
  return {
    effectiveButWrong: 0,
    fullRetrieval: 0,
    missedGoldOverlap: [],
    neighborBeatsGold: 0,
    neighborConsidered: 0,
    partialRetrieval: 0,
    questionGoldOverlap: [],
    recallPositiveAnswerWrong: 0,
    retrievedGoldOverlap: [],
    total: 0,
    zeroRetrieval: 0,
  };
}

function summarizeAccumulator(acc: CategoryAccumulator) {
  return {
    answerVsRecall: {
      // gold evidence WAS retrieved but the answer was still wrong: organization
      // or "retrieved gold turn is not actually answerable" cases.
      recallPositiveAnswerWrong: acc.recallPositiveAnswerWrong,
    },
    neighborLift: {
      // q6: how often a +-1/+-2 neighbor lexically out-overlaps the gold turn —
      // i.e. the retrievable signal sits next to the gold turn, not in it.
      goldTurnsConsidered: acc.neighborConsidered,
      neighborBeatsGoldShare:
        acc.neighborConsidered === 0
          ? 0
          : round(acc.neighborBeatsGold / acc.neighborConsidered),
    },
    questionGoldTokenOverlap: {
      // q5: how lexically close the question is to its own gold turns.
      meanBest: round(mean(acc.questionGoldOverlap)),
    },
    retrieval: {
      // q1 / partial split.
      fullRetrievalShare: round(acc.fullRetrieval / acc.total),
      partialRetrievalShare: round(acc.partialRetrieval / acc.total),
      zeroRetrievalShare: round(acc.zeroRetrieval / acc.total),
    },
    retrievedVsMissedOverlap: {
      // q2 / q3: retrieved gold turns should out-overlap missed ones if the gap
      // is plain lexical; if missed-overlap is also ~0 the gold turn simply has
      // no question keywords (paraphrase / short-utterance mismatch).
      meanMissedGoldOverlap: round(mean(acc.missedGoldOverlap)),
      meanRetrievedGoldOverlap: round(mean(acc.retrievedGoldOverlap)),
    },
    total: acc.total,
  };
}

export function analyzeLocomoRetrievalGap(input: {
  cases: NormalizedCase[];
  report: { cases: ReportQuestion[]; runId?: string };
}): unknown {
  const turnIndexByCase = new Map<string, Map<string, TurnInfo>>();
  const orderedTurnsByCase = new Map<string, TurnInfo[]>();
  for (const testCase of input.cases) {
    const byId = new Map<string, TurnInfo>();
    const ordered: TurnInfo[] = [];
    testCase.turns.forEach((turn, index) => {
      const info: TurnInfo = {
        content: turn.content,
        index,
        session: parseLocomoSession(turn.diaId),
        speaker: turn.speaker,
        tokens: tokenSet(turn.content),
      };
      byId.set(turn.diaId, info);
      ordered.push(info);
    });
    turnIndexByCase.set(testCase.caseId, byId);
    orderedTurnsByCase.set(testCase.caseId, ordered);
  }
  const questionTextByCaseAndId = new Map<string, string>();
  for (const testCase of input.cases) {
    for (const question of testCase.questions) {
      questionTextByCaseAndId.set(
        `${testCase.caseId}:${question.questionId}`,
        question.question,
      );
    }
  }

  const overall = emptyAccumulator();
  const byCategory = new Map<string, CategoryAccumulator>();
  const accFor = (category: string): CategoryAccumulator => {
    let acc = byCategory.get(category);
    if (!acc) {
      acc = emptyAccumulator();
      byCategory.set(category, acc);
    }
    return acc;
  };

  for (const result of input.report.cases) {
    const accs = [overall, accFor(result.category)];
    for (const acc of accs) {
      acc.total += 1;
      if (result.evidenceRecall <= 0) {
        acc.zeroRetrieval += 1;
      } else if (result.evidenceRecall >= 1) {
        acc.fullRetrieval += 1;
      } else {
        acc.partialRetrieval += 1;
      }
      if (result.evidenceRecall > 0 && result.answerCorrect === false) {
        acc.recallPositiveAnswerWrong += 1;
        acc.effectiveButWrong += 1;
      }
    }

    const turnById = turnIndexByCase.get(result.caseId);
    const orderedTurns = orderedTurnsByCase.get(result.caseId);
    const questionKey = reportQuestionKey(result);
    if (!turnById || !orderedTurns) {
      throw new Error(
        `Report question ${questionKey} references case ${result.caseId} ` +
          "that is not present in the LoCoMo cases file.",
      );
    }
    const questionText = questionTextByCaseAndId.get(questionKey);
    if (questionText === undefined) {
      throw new Error(
        `Report question ${questionKey} is not present in the LoCoMo cases file.`,
      );
    }
    const qTokens = tokenSet(questionText);
    const retrievedSet = new Set(result.retrievedTurnIds);

    const goldOverlaps: number[] = [];
    for (const goldId of result.evidenceTurnIds) {
      const turn = turnById.get(goldId);
      if (!turn) {
        throw new Error(
          `Report question ${questionKey} references evidence turn ` +
            `${goldId} that is not present in case ${result.caseId}.`,
        );
      }
      const overlap = questionOverlap(qTokens, turn.tokens);
      goldOverlaps.push(overlap);
      for (const acc of accs) {
        if (retrievedSet.has(goldId)) {
          acc.retrievedGoldOverlap.push(overlap);
        } else {
          acc.missedGoldOverlap.push(overlap);
        }
        // q6: does an adjacent turn lexically out-overlap this gold turn?
        let neighborMax = 0;
        for (const delta of [-2, -1, 1, 2]) {
          const neighbor = orderedTurns[turn.index + delta];
          if (neighbor) {
            neighborMax = Math.max(neighborMax, questionOverlap(qTokens, neighbor.tokens));
          }
        }
        acc.neighborConsidered += 1;
        if (neighborMax > overlap + 1e-9) {
          acc.neighborBeatsGold += 1;
        }
      }
    }
    if (goldOverlaps.length > 0) {
      const best = Math.max(...goldOverlaps);
      for (const acc of accs) {
        acc.questionGoldOverlap.push(best);
      }
    }
  }

  const categoriesOut: Record<string, unknown> = {};
  for (const [category, acc] of [...byCategory.entries()].sort()) {
    categoriesOut[category] = summarizeAccumulator(acc);
  }

  return {
    benchmark: "locomo",
    byCategory: categoriesOut,
    generatedBy: "scripts/analyze-phase-65-locomo-retrieval-gap.ts",
    overall: summarizeAccumulator(overall),
    phase: "phase-65",
    sourceRunId: input.report.runId ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertLocomoSmokeReport(
  report: unknown,
  path: string,
): asserts report is LocomoSmokeReport {
  if (!isRecord(report)) {
    throw new Error(`Report ${path} must be a JSON object.`);
  }
  if (report.phase !== "phase-65" || report.benchmark !== "locomo") {
    throw new Error(`Report ${path} is not a Phase 65 LoCoMo smoke report.`);
  }
  if (!Array.isArray(report.cases)) {
    throw new Error(`Report ${path} must include cases[].`);
  }
}

function assertOutputPathDoesNotOverwriteInput(input: {
  outputPath: string;
  sourceFlag: string;
  sourcePath: string;
}): void {
  assertDistinctCliPathValues({
    firstFlag: "--output-path",
    firstValue: input.outputPath,
    secondFlag: input.sourceFlag,
    secondValue: input.sourcePath,
  });
}

export async function runLocomoRetrievalGapAnalysis(
  argv: readonly string[],
  deps: {
    readFile?: (path: string) => Promise<string>;
    writeFile?: (path: string, value: string) => Promise<void>;
    mkdir?: (path: string, options: { recursive: boolean }) => Promise<unknown>;
  } = {},
): Promise<{ analysis: unknown; outputPath: string }> {
  const readFileImpl = deps.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = deps.writeFile ?? writeFile;
  const mkdirImpl = deps.mkdir ?? mkdir;

  const reportPath = resolveCliFlagValueStrict(argv, "--report");
  if (!reportPath) {
    throw new Error("LoCoMo retrieval-gap analysis requires --report <smoke-report.json>.");
  }
  const benchmarkRoot = resolveCliFlagValueStrict(argv, "--benchmark-root");
  const casesPath =
    resolveCliFlagValueStrict(argv, "--cases") ??
    (benchmarkRoot ? join(benchmarkRoot, "cases.json") : undefined);
  if (!casesPath) {
    throw new Error("LoCoMo retrieval-gap analysis requires --cases or --benchmark-root.");
  }
  const outputPath =
    resolveCliFlagValueStrict(argv, "--output-path") ??
    join(dirname(reportPath), LOCOMO_RETRIEVAL_GAP_FILE_NAME);
  assertOutputPathDoesNotOverwriteInput({
    outputPath,
    sourceFlag: "--report",
    sourcePath: reportPath,
  });
  assertOutputPathDoesNotOverwriteInput({
    outputPath,
    sourceFlag: "--cases",
    sourcePath: casesPath,
  });

  const report = JSON.parse(await readFileImpl(reportPath)) as unknown;
  assertLocomoSmokeReport(report, reportPath);
  const reportInput = { path: reportPath, report };
  assertLocomoReportHasNoExecutionFailures(reportInput);
  assertLocomoReportQuestionCountMatchesCases(reportInput);
  const parsedCases = JSON.parse(await readFileImpl(casesPath)) as unknown;
  const rawCases = isRecord(parsedCases) ? parsedCases.cases : parsedCases;
  if (!Array.isArray(rawCases)) {
    throw new Error(`Cases file ${casesPath} must be a cases array (or {cases: [...]}).`);
  }
  const cases = rawCases as NormalizedCase[];

  const analysis = analyzeLocomoRetrievalGap({ cases, report });
  await mkdirImpl(dirname(outputPath), { recursive: true });
  await writeFileImpl(outputPath, `${JSON.stringify(analysis, null, 2)}\n`);
  return { analysis, outputPath };
}

if (import.meta.main) {
  const { analysis, outputPath } = await runLocomoRetrievalGapAnalysis(Bun.argv);
  process.stdout.write(`${JSON.stringify({ analysis, outputPath }, null, 2)}\n`);
}
