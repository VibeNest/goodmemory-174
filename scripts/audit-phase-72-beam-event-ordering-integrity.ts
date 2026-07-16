import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  flattenPhase63BeamCases,
  readPhase63BeamRows,
} from "./run-phase-63-beam-recall-diagnostic";
import { resolveCliFlagValueStrict } from "./cli-options";
import { resolvePhase63BeamRootEnv } from "./run-phase-63-shared";

const GENERATED_BY =
  "scripts/audit-phase-72-beam-event-ordering-integrity.ts";
const BEAM_UPSTREAM_COMMIT = "3e12035532eb85768f1a7cd779832b650c4b2ef9";
const NUMBER_WORDS = {
  eight: 8,
  five: 5,
  four: 4,
  nine: 9,
  one: 1,
  seven: 7,
  six: 6,
  ten: 10,
  three: 3,
  two: 2,
} as const;

interface BeamEventOrderingCase {
  chronologicalChatIds: readonly number[];
  evidenceChatIds: readonly number[];
  question: string;
  questionId: string;
  questionType: string;
}

interface BeamRubricEntry {
  question: string;
  rubric: readonly string[];
}

interface BeamEvidenceOrderInversion {
  currentChatId: number;
  currentIndex: number;
  previousChatId: number;
  previousIndex: number;
}

export interface BeamEventOrderingIntegrityCase {
  evidenceChatIds: readonly number[];
  evidenceOrderInversions: BeamEvidenceOrderInversion[];
  question: string;
  questionId: string;
  requestedEvidenceCountMismatch: boolean;
  requestedItemCount: number | null;
  requestedRubricCountMismatch: boolean;
  rubricItemCount: number;
  uniqueEvidenceCount: number;
}

export interface BeamEventOrderingIntegrityAudit {
  cases: BeamEventOrderingIntegrityCase[];
  summary: {
    adjacentEvidenceOrderInversions: number;
    casesWithNonChronologicalEvidenceOrder: number;
    casesWithRequestedRubricCountMismatch: number;
    casesWithRequestedUniqueEvidenceCountMismatch: number;
    strictBinaryGateEligible: boolean;
    totalEventOrderingCases: number;
  };
}

export function parseRequestedBeamItemCount(question: string): number | null {
  const match = question.match(
    /\bmention\s+only\s+and\s+only\s+([a-z]+|\d+)\s+items?\b/iu,
  );
  if (!match) {
    return null;
  }
  const token = match[1]?.toLowerCase();
  if (!token) {
    return null;
  }
  if (/^\d+$/u.test(token)) {
    return Number(token);
  }
  return NUMBER_WORDS[token as keyof typeof NUMBER_WORDS] ?? null;
}

function findEvidenceOrderInversions(
  chronologicalChatIds: readonly number[],
  evidenceChatIds: readonly number[],
): BeamEvidenceOrderInversion[] {
  const chronology = new Map(
    chronologicalChatIds.map((chatId, index) => [chatId, index]),
  );
  const inversions: BeamEvidenceOrderInversion[] = [];
  for (let currentIndex = 1; currentIndex < evidenceChatIds.length; currentIndex += 1) {
    const previousIndex = currentIndex - 1;
    const previousChatId = evidenceChatIds[previousIndex];
    const currentChatId = evidenceChatIds[currentIndex];
    const previousChronologyIndex =
      previousChatId === undefined ? undefined : chronology.get(previousChatId);
    const currentChronologyIndex =
      currentChatId === undefined ? undefined : chronology.get(currentChatId);
    if (previousChronologyIndex === undefined || currentChronologyIndex === undefined) {
      throw new Error("BEAM evidence references a chat ID outside its conversation.");
    }
    if (currentChronologyIndex < previousChronologyIndex) {
      inversions.push({
        currentChatId,
        currentIndex,
        previousChatId,
        previousIndex,
      });
    }
  }
  return inversions;
}

export function auditBeamEventOrderingIntegrity(input: {
  cases: readonly BeamEventOrderingCase[];
  rubrics: Readonly<Record<string, BeamRubricEntry>>;
}): BeamEventOrderingIntegrityAudit {
  const cases = input.cases
    .filter((testCase) => testCase.questionType === "event_ordering")
    .map((testCase): BeamEventOrderingIntegrityCase => {
      const rubric = input.rubrics[testCase.questionId];
      if (!rubric) {
        throw new Error(`BEAM rubric is missing for ${testCase.questionId}.`);
      }
      const requestedItemCount = parseRequestedBeamItemCount(testCase.question);
      const uniqueEvidenceCount = new Set(testCase.evidenceChatIds).size;
      const rubricItemCount = rubric.rubric.length;
      return {
        evidenceChatIds: testCase.evidenceChatIds,
        evidenceOrderInversions:
          findEvidenceOrderInversions(
            testCase.chronologicalChatIds,
            testCase.evidenceChatIds,
          ),
        question: testCase.question,
        questionId: testCase.questionId,
        requestedEvidenceCountMismatch:
          requestedItemCount !== null &&
          requestedItemCount !== uniqueEvidenceCount,
        requestedItemCount,
        requestedRubricCountMismatch:
          requestedItemCount !== null &&
          requestedItemCount !== rubricItemCount,
        rubricItemCount,
        uniqueEvidenceCount,
      };
    });

  const casesWithNonChronologicalEvidenceOrder = cases.filter(
    (testCase) => testCase.evidenceOrderInversions.length > 0,
  ).length;
  const casesWithRequestedRubricCountMismatch = cases.filter(
    (testCase) => testCase.requestedRubricCountMismatch,
  ).length;

  return {
    cases,
    summary: {
      adjacentEvidenceOrderInversions: cases.reduce(
        (total, testCase) => total + testCase.evidenceOrderInversions.length,
        0,
      ),
      casesWithNonChronologicalEvidenceOrder,
      casesWithRequestedRubricCountMismatch,
      casesWithRequestedUniqueEvidenceCountMismatch: cases.filter(
        (testCase) => testCase.requestedEvidenceCountMismatch,
      ).length,
      strictBinaryGateEligible:
        casesWithNonChronologicalEvidenceOrder === 0 &&
        casesWithRequestedRubricCountMismatch === 0,
      totalEventOrderingCases: cases.length,
    },
  };
}

function parseRubrics(value: unknown): Record<string, BeamRubricEntry> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("BEAM rubrics must be an object.");
  }
  const rubrics: Record<string, BeamRubricEntry> = {};
  for (const [questionId, entry] of Object.entries(value)) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      Array.isArray(entry) ||
      typeof Reflect.get(entry, "question") !== "string" ||
      !Array.isArray(Reflect.get(entry, "rubric")) ||
      !Reflect.get(entry, "rubric").every(
        (item: unknown) => typeof item === "string",
      )
    ) {
      throw new Error(`Malformed BEAM rubric for ${questionId}.`);
    }
    rubrics[questionId] = {
      question: Reflect.get(entry, "question"),
      rubric: Reflect.get(entry, "rubric"),
    };
  }
  return rubrics;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const benchmarkRoot =
    resolveCliFlagValueStrict(argv, "--benchmark-root") ??
    resolvePhase63BeamRootEnv();
  if (!benchmarkRoot) {
    throw new Error(
      "BEAM integrity audit requires --benchmark-root or GOODMEMORY_BEAM_ROOT.",
    );
  }
  const rubricsPath = resolve(
    resolveCliFlagValueStrict(argv, "--rubrics") ??
      join(homedir(), ".goodmemory-beam", "rubrics-by-question-id.json"),
  );
  const outputPath = resolve(
    resolveCliFlagValueStrict(argv, "--output") ??
      "reports/quality-gates/phase-72/run-20260716-final/beam-event-ordering-integrity-audit.json",
  );
  const [rows, rubricsText] = await Promise.all([
    readPhase63BeamRows({
      benchmarkRoot: resolve(benchmarkRoot),
      readFile: (path) => readFile(path, "utf8"),
    }),
    readFile(rubricsPath, "utf8"),
  ]);
  const rubrics = parseRubrics(JSON.parse(rubricsText));
  const audit = auditBeamEventOrderingIntegrity({
    cases: flattenPhase63BeamCases(rows, "100K").map((testCase) => ({
      ...testCase,
      chronologicalChatIds: testCase.chat
        .flat()
        .map((turn) => turn.id),
    })),
    rubrics,
  });
  const report = {
    audit,
    benchmark: "BEAM-100K",
    claimBoundary: {
      officialUnifiedScore:
        "Comparable stored-answer evidence remains valid under the disclosed independent unified-rubric protocol.",
      strictBinaryGate:
        audit.summary.strictBinaryGateEligible
          ? "Eligible as a release gate for this dataset snapshot."
          : "Diagnostic only: event_ordering ground truth contains chronological-order or question/rubric contradictions.",
    },
    generatedAt: new Date().toISOString(),
    generatedBy: GENERATED_BY,
    source: {
      benchmarkRoot: resolve(benchmarkRoot),
      normalizedRowsSha256: sha256(JSON.stringify(rows)),
      rubricsPath,
      rubricsSha256: sha256(rubricsText),
    },
    upstream: {
      commit: BEAM_UPSTREAM_COMMIT,
      repository: "https://github.com/mohammadtavakoli78/BEAM",
    },
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (import.meta.main) {
  await main();
}
