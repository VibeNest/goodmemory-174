// P65-R001 eval-only experiment: does retrieving over conversational WINDOWS
// (each dialog turn plus its +-radius neighbors) reduce LoCoMo's zero-retrieval
// vs atomic-turn retrieval? Motivated by the retrieval-gap finding that for ~54%
// of gold turns (79% multi_hop) a neighbor turn lexically out-overlaps the gold
// turn, so the question-answerable signal sits in the conversational span.
//
// It changes NOTHING in the recall engine or public API: it seeds a separate
// in-memory store per mode and compares. Retrieval-only (no live answer). It
// reports BOTH metrics so it cannot flatter itself:
//   exactTurnEvidenceRecall      gold turn is a retrieved record's CENTER
//   containedTurnEvidenceRecall  gold turn is anywhere inside a retrieved window
//
//   bun run eval:phase-65-locomo-window -- --benchmark-root /private/tmp/LOCOMO-all --window-radius 2
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GoodMemory } from "../src/api/contracts";
import type { LocomoCase, LocomoQuestion } from "../src/eval/locomo";
import {
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
  resolveEnvValueStrict,
} from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";
import {
  buildLocomoScope,
  collectLocomoRetrievedTurnIds,
  collectLocomoTurnIdsFromRecord,
  createLocomoSmokeMemory,
  loadLocomoCases,
  scoreLocomoRetrieval,
  seedLocomoCase,
} from "./run-phase-65-locomo-smoke";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Seed each turn's +-radius conversational neighborhood as one record. The
// record content carries every window turn's `[LOCOMO dia_id=...]` marker (so the
// shared collector recovers the CONTAINED set) and a `centerDiaId` attribute (the
// window's anchor turn).
async function seedLocomoWindows(input: {
  memory: GoodMemory;
  radius: number;
  runId: string;
  testCase: LocomoCase;
}): Promise<void> {
  const { turns } = input.testCase;
  const windows = turns.map((centerTurn, index) => {
    const low = Math.max(0, index - input.radius);
    const high = Math.min(turns.length - 1, index + input.radius);
    return { centerTurn, windowTurns: turns.slice(low, high + 1) };
  });
  await input.memory.remember({
    annotations: windows.map((window, messageIndex) => ({
      confirmed: true,
      kindHint: "fact" as const,
      messageIndex,
      metadataPatch: {
        attributes: {
          centerDiaId: window.centerTurn.diaId,
          speaker: window.centerTurn.speaker,
        },
        category: "external_benchmark",
        tags: ["locomo", `center_dia_id:${window.centerTurn.diaId}`],
      },
      reason: "LoCoMo window retrieval seeds each turn's conversational neighborhood.",
      remember: "always" as const,
      verified: true,
    })),
    extractionStrategy: "rules-only",
    messages: windows.map((window) => ({
      content: window.windowTurns
        .map((turn) => `[LOCOMO dia_id=${turn.diaId} speaker=${turn.speaker}] ${turn.content}`)
        .join(" "),
      role: "user",
    })),
    scope: buildLocomoScope({ caseId: input.testCase.caseId, runId: input.runId }),
  });
}

function collectWindowEvidence(recall: unknown): {
  centers: Set<string>;
  contained: Set<string>;
} {
  const centers = new Set<string>();
  const contained = new Set<string>();
  const record = recall as Record<string, unknown>;
  for (const key of [
    "preferences",
    "references",
    "facts",
    "feedback",
    "archives",
    "evidence",
    "episodes",
  ]) {
    const records = record[key];
    if (!Array.isArray(records)) {
      continue;
    }
    for (const entry of records) {
      for (const id of collectLocomoTurnIdsFromRecord(entry)) {
        contained.add(id);
      }
      if (isRecord(entry) && isRecord(entry.attributes)) {
        const center = entry.attributes.centerDiaId;
        if (typeof center === "string") {
          centers.add(center);
        }
      }
    }
  }
  return { centers, contained };
}

interface ModeBucket {
  evidenceRecallSum: number;
  noiseSum: number;
  total: number;
  zeroRetrieval: number;
}

function emptyBucket(): ModeBucket {
  return { evidenceRecallSum: 0, noiseSum: 0, total: 0, zeroRetrieval: 0 };
}

function add(bucket: ModeBucket, recall: number, noise: number): void {
  bucket.evidenceRecallSum += recall;
  bucket.noiseSum += noise;
  bucket.total += 1;
  if (recall <= 0) {
    bucket.zeroRetrieval += 1;
  }
}

function summarize(bucket: ModeBucket) {
  return {
    meanEvidenceRecall: bucket.total === 0 ? 0 : Number((bucket.evidenceRecallSum / bucket.total).toFixed(4)),
    meanNoiseTurns: bucket.total === 0 ? 0 : Number((bucket.noiseSum / bucket.total).toFixed(2)),
    questionCount: bucket.total,
    zeroRetrievalShare: bucket.total === 0 ? 0 : Number((bucket.zeroRetrieval / bucket.total).toFixed(4)),
  };
}

function recallOf(gold: readonly string[], retrieved: Set<string>): number {
  if (gold.length === 0) {
    return 1;
  }
  return gold.filter((id) => retrieved.has(id)).length / gold.length;
}

export interface LocomoWindowRetrievalCliOptions {
  benchmarkRoot: string;
  radius: number;
  runId: string;
}

function parsePositiveIntegerFlag(
  argv: readonly string[],
  flagName: string,
  defaultValue: number,
): number {
  const raw = resolveCliFlagValueStrict(argv, flagName);
  if (raw === undefined) {
    return defaultValue;
  }
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return value;
}

export function parseLocomoWindowRetrievalCliOptions(
  argv: readonly string[],
): LocomoWindowRetrievalCliOptions {
  const radius = parsePositiveIntegerFlag(argv, "--window-radius", 2);
  const runId =
    resolveCliPathSegmentFlagValueStrict(argv, "--run-id") ??
    "locomo-window-retrieval";
  const benchmarkRoot =
    resolveCliFlagValueStrict(argv, "--benchmark-root") ??
    resolveEnvValueStrict(process.env, "GOODMEMORY_LOCOMO_ROOT");
  if (!benchmarkRoot) {
    throw new Error("--benchmark-root or GOODMEMORY_LOCOMO_ROOT is required.");
  }
  return { benchmarkRoot, radius, runId };
}

export async function runLocomoWindowRetrieval(input: {
  benchmarkRoot: string;
  radius: number;
  readFile?: (path: string) => Promise<string>;
}): Promise<{
  byCategory: Record<string, unknown>;
  overall: unknown;
  windowRadius: number;
}> {
  const readFileImpl = input.readFile ?? ((path: string) => readFile(path, "utf8"));
  const runId = "locomo-window-retrieval";
  const { cases } = await loadLocomoCases({
    benchmarkRoot: input.benchmarkRoot,
    readFile: readFileImpl,
  });

  const buckets = {
    turn: new Map<string, ModeBucket>(),
    windowContained: new Map<string, ModeBucket>(),
    windowExact: new Map<string, ModeBucket>(),
  };
  const bucketFor = (map: Map<string, ModeBucket>, key: string): ModeBucket => {
    let bucket = map.get(key);
    if (!bucket) {
      bucket = emptyBucket();
      map.set(key, bucket);
    }
    return bucket;
  };
  const recordQuestion = (
    map: Map<string, ModeBucket>,
    question: LocomoQuestion,
    recall: number,
    noise: number,
  ): void => {
    add(bucketFor(map, "OVERALL"), recall, noise);
    add(bucketFor(map, question.category), recall, noise);
  };

  for (const testCase of cases) {
    // Turn baseline.
    const turnMemory = createLocomoSmokeMemory();
    const turnScope = buildLocomoScope({ caseId: testCase.caseId, runId });
    await seedLocomoCase({ memory: turnMemory, runId, testCase });
    // Window mode (separate store).
    const windowMemory = createLocomoSmokeMemory();
    const windowScope = buildLocomoScope({ caseId: testCase.caseId, runId: `${runId}-window` });
    await seedLocomoWindows({ memory: windowMemory, radius: input.radius, runId: `${runId}-window`, testCase });

    for (const question of testCase.questions) {
      const turnRecall = await turnMemory.recall({
        query: question.question,
        scope: turnScope,
        strategy: "rules-only",
      });
      const turnScore = scoreLocomoRetrieval({
        question,
        retrievedTurnIds: collectLocomoRetrievedTurnIds(turnRecall),
        testCase,
      });
      recordQuestion(buckets.turn, question, turnScore.evidenceRecall, turnScore.noiseTurnCount);

      const windowRecall = await windowMemory.recall({
        query: question.question,
        scope: windowScope,
        strategy: "rules-only",
      });
      const evidence = collectWindowEvidence(windowRecall);
      const exact = recallOf(question.evidenceTurnIds, evidence.centers);
      const contained = recallOf(question.evidenceTurnIds, evidence.contained);
      const noise = [...evidence.contained].filter(
        (id) => !question.evidenceTurnIds.includes(id),
      ).length;
      recordQuestion(buckets.windowExact, question, exact, noise);
      recordQuestion(buckets.windowContained, question, contained, noise);
    }
  }

  const byCategory: Record<string, unknown> = {};
  const categories = new Set<string>([...buckets.turn.keys()].filter((k) => k !== "OVERALL"));
  for (const category of [...categories].sort()) {
    byCategory[category] = {
      turnBaseline: summarize(bucketFor(buckets.turn, category)),
      windowContained: summarize(bucketFor(buckets.windowContained, category)),
      windowExact: summarize(bucketFor(buckets.windowExact, category)),
    };
  }

  return {
    byCategory,
    overall: {
      turnBaseline: summarize(bucketFor(buckets.turn, "OVERALL")),
      windowContained: summarize(bucketFor(buckets.windowContained, "OVERALL")),
      windowExact: summarize(bucketFor(buckets.windowExact, "OVERALL")),
    },
    windowRadius: input.radius,
  };
}

if (import.meta.main) {
  const { benchmarkRoot, radius, runId } =
    parseLocomoWindowRetrievalCliOptions(Bun.argv);
  const result = await runLocomoWindowRetrieval({ benchmarkRoot, radius });
  const repoRoot = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputPath = join(
    repoRoot,
    "reports",
    "eval",
    "research",
    "phase-65",
    "locomo",
    runId,
    "window-retrieval-comparison.json",
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ ...result, outputPath }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
