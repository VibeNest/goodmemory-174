// Phase 64 MemoryAgentBench external-root preparation.
//
// Mirrors scripts/prepare-phase-63-beam-data.ts: it fetches one upstream row
// from the Hugging Face `ai-hyz/MemoryAgentBench` dataset (MIT) via the
// datasets-server rows endpoint and writes an ALREADY-NORMALIZED cases.json into
// the external root (GOODMEMORY_MAB_ROOT / --output-root, default /private/tmp/MAB).
// No upstream data is vendored into the repo; only this normalizer and its test
// live here. The output is the exact MemoryAgentBenchCase contract the Phase 64
// smoke adapter (scripts/run-phase-64-memory-agent-bench-smoke.ts) consumes.
//
// The recurring Phase 64 friction was that the external root was hand-normalized
// and lost whenever /private/tmp/MAB was cleared. This makes the per-competency
// external root reproducible and deterministic (no LLM).
//
// Competencies map to upstream splits:
//   AR  -> Accurate_Retrieval        (implemented: event_qa rows, see below)
//   TTL -> Test_Time_Learning        (follow-up)
//   LRU -> Long_Range_Understanding  (follow-up)
//   CR  -> Conflict_Resolution       (follow-up)
//
// AR / event_qa normalization (the only one with a fully STRUCTURAL gold-evidence
// derivation, so no fragile substring guessing): the upstream row carries
// `metadata.previous_events` (cumulative numbered event lists) and `answers`
// (the correct next event per question). The event sequence is therefore
// event 1 = previous_events[0] and event (i+2) = answers[i][0]. We make each
// event a retrievable chunk (chunk id == event number) and set question i's
// gold evidence to the next-event chunk (id i+2) by construction. This matches
// the upstream EventQA ordering task and gives a meaningful retrieval signal
// (the multiple-choice query dilutes token overlap, so recall measures top-K
// ranking quality, not a trivial lookup). ruler_qa rows are intentionally NOT
// used for AR: their natural-language answers (e.g. "France") recur across dozens
// of documents, so substring-derived evidence would be trivially noisy.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import type {
  MemoryAgentBenchCase,
  MemoryAgentBenchChunk,
  MemoryAgentBenchCompetency,
  MemoryAgentBenchQuestion,
} from "../src/eval/memoryAgentBench";

export const MEMORY_AGENT_BENCH_DATASET = "ai-hyz/MemoryAgentBench";
export const MEMORY_AGENT_BENCH_UPSTREAM_SOURCE =
  "https://github.com/HUST-AI-HYZ/MemoryAgentBench";
export const MEMORY_AGENT_BENCH_UPSTREAM_LICENSE = "MIT";
export const MEMORY_AGENT_BENCH_CASES_FILE_NAME = "cases.json";
export const MEMORY_AGENT_BENCH_METADATA_FILE_NAME =
  "phase-64-mab-export-metadata.json";
const DEFAULT_OUTPUT_ROOT = "/private/tmp/MAB";

// Competency -> upstream datasets-server split (config "default").
export const MEMORY_AGENT_BENCH_COMPETENCY_SPLITS: Record<
  MemoryAgentBenchCompetency,
  string
> = {
  AR: "Accurate_Retrieval",
  TTL: "Test_Time_Learning",
  LRU: "Long_Range_Understanding",
  CR: "Conflict_Resolution",
};

// Default upstream row per competency: the row index whose sub-dataset has an
// implemented normalizer. AR row 5 is `eventqa_full`.
const DEFAULT_OFFSET_BY_COMPETENCY: Record<MemoryAgentBenchCompetency, number> = {
  AR: 5,
  TTL: 0,
  LRU: 0,
  CR: 0,
};

export interface Phase64MabPrepareOptions {
  competency: MemoryAgentBenchCompetency;
  dataset: string;
  // null = keep every question in the row.
  maxQuestions: number | null;
  // When true, retain existing cases of OTHER competencies in cases.json and
  // replace only this competency's cases. When false, overwrite cases.json.
  merge: boolean;
  offset: number;
  outputRoot: string;
}

export interface Phase64MabPrepareResult {
  caseId: string;
  casesFile: string;
  chunkCount: number;
  competency: MemoryAgentBenchCompetency;
  dataset: string;
  generatedAt: string;
  merged: boolean;
  metadataFile: string;
  offset: number;
  outputRoot: string;
  questionCount: number;
  rowsEndpoint: string;
  sourceDataset: string;
  split: string;
  totalCasesWritten: number;
  totalQuestionsAvailable: number;
}

export interface Phase64MabPrepareDependencies {
  mkdir?: typeof mkdir;
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  requestJson?: (url: string) => Promise<unknown>;
  writeFile?: (path: string, value: string) => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCompetency(value: string | undefined): MemoryAgentBenchCompetency {
  if (!value) {
    return "AR";
  }
  if (value === "AR" || value === "TTL" || value === "LRU" || value === "CR") {
    return value;
  }
  throw new Error("--competency must be one of AR, TTL, LRU, CR");
}

function parseNonNegativeInteger(
  value: string | undefined,
  fallback: number,
  flagName: string,
): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be a non-negative integer`);
  }
  return parsed;
}

function parseMaxQuestions(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  // 0 (or any non-positive) means "no cap" so callers can opt into the full row.
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("--max-questions must be a non-negative integer (0 = all)");
  }
  return parsed === 0 ? null : parsed;
}

export function parsePhase64MabPrepareCliOptions(
  argv: readonly string[],
): Phase64MabPrepareOptions {
  const competency = parseCompetency(resolveCliFlagValue(argv, "--competency"));
  return {
    competency,
    dataset: resolveCliFlagValue(argv, "--dataset") ?? MEMORY_AGENT_BENCH_DATASET,
    maxQuestions: parseMaxQuestions(resolveCliFlagValue(argv, "--max-questions")),
    merge: argv.includes("--merge"),
    offset: parseNonNegativeInteger(
      resolveCliFlagValue(argv, "--offset"),
      DEFAULT_OFFSET_BY_COMPETENCY[competency],
      "--offset",
    ),
    outputRoot:
      resolveCliFlagValue(argv, "--output-root") ??
      process.env.GOODMEMORY_MAB_ROOT ??
      DEFAULT_OUTPUT_ROOT,
  };
}

export function buildPhase64MabRowsUrl(input: {
  dataset: string;
  length: number;
  offset: number;
  split: string;
}): string {
  const params = new URLSearchParams({
    dataset: input.dataset,
    config: "default",
    split: input.split,
    offset: String(input.offset),
    length: String(input.length),
  });
  return `https://datasets-server.huggingface.co/rows?${params.toString()}`;
}

export function buildPhase64MabCurlRequestCommand(url: string): string[] {
  return [
    "curl",
    "-sS",
    "-L",
    "--retry",
    "4",
    "--retry-delay",
    "1",
    "--retry-all-errors",
    "--connect-timeout",
    "20",
    "--max-time",
    "180",
    url,
  ];
}

async function requestJsonWithCurl(url: string): Promise<unknown> {
  const proc = Bun.spawn(buildPhase64MabCurlRequestCommand(url), {
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`curl failed for MemoryAgentBench request: ${stderr.trim()}`);
  }
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `MemoryAgentBench request did not return valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

interface UpstreamRow {
  row: Record<string, unknown>;
  truncatedCells: string[];
}

function readSingleUpstreamRow(value: unknown): UpstreamRow {
  if (!isRecord(value) || !Array.isArray(value.rows)) {
    throw new Error("MemoryAgentBench rows response must include a rows array");
  }
  if (value.rows.length === 0) {
    throw new Error(
      "MemoryAgentBench rows response is empty (offset out of range?)",
    );
  }
  const entry = value.rows[0];
  if (!isRecord(entry) || !isRecord(entry.row)) {
    throw new Error("MemoryAgentBench rows[0] must be an object with a row object");
  }
  const truncatedCells = Array.isArray(entry.truncated_cells)
    ? entry.truncated_cells.filter((cell): cell is string => typeof cell === "string")
    : [];
  return { row: entry.row, truncatedCells };
}

function assertConsumedCellsIntact(
  truncatedCells: readonly string[],
  consumed: readonly string[],
): void {
  const hit = consumed.filter((cell) => truncatedCells.includes(cell));
  if (hit.length > 0) {
    throw new Error(
      `MemoryAgentBench row truncated the consumed cell(s): ${hit.join(", ")}; refusing incomplete export`,
    );
  }
}

function asStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`MemoryAgentBench row field "${name}" must be an array`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new Error(
        `MemoryAgentBench row field "${name}[${index}]" must be a string`,
      );
    }
    return entry;
  });
}

// answers is an array of acceptable-answer lists (e.g. [["France","France"]]);
// the first entry is the canonical gold answer. Tolerates a bare string entry.
function firstGoldAnswer(value: unknown, index: number): string {
  const entry = Array.isArray(value) ? value[index] : undefined;
  if (typeof entry === "string") {
    return entry;
  }
  if (Array.isArray(entry) && typeof entry[0] === "string") {
    return entry[0];
  }
  throw new Error(
    `MemoryAgentBench row "answers[${index}]" must be a string or string[]`,
  );
}

function stripLeadingEventNumber(value: string): string {
  return value.replace(/^\s*\d+\.\s*/u, "").trim();
}

// Accurate_Retrieval / event_qa normalizer (see module header).
function normalizeEventQaRow(
  row: Record<string, unknown>,
  truncatedCells: readonly string[],
  options: Phase64MabPrepareOptions,
): MemoryAgentBenchCase {
  assertConsumedCellsIntact(truncatedCells, ["questions", "answers", "metadata"]);
  const metadata = isRecord(row.metadata) ? row.metadata : undefined;
  if (!metadata) {
    throw new Error("MemoryAgentBench event_qa row must include a metadata object");
  }
  const previousEvents = asStringArray(
    metadata.previous_events,
    "metadata.previous_events",
  );
  if (previousEvents.length === 0) {
    throw new Error(
      "MemoryAgentBench event_qa row must include a non-empty previous_events list",
    );
  }
  const questions = asStringArray(row.questions, "questions");
  const qaPairIds = asStringArray(metadata.qa_pair_ids, "metadata.qa_pair_ids");
  if (!Array.isArray(row.answers)) {
    throw new Error('MemoryAgentBench row field "answers" must be an array');
  }
  const sourceDataset =
    typeof metadata.source === "string" && metadata.source.length > 0
      ? metadata.source
      : "event_qa";

  const available = Math.min(
    row.answers.length,
    questions.length,
    qaPairIds.length,
  );
  const limit =
    options.maxQuestions === null
      ? available
      : Math.min(options.maxQuestions, available);
  if (limit === 0) {
    throw new Error(
      "MemoryAgentBench event_qa row produced no questions (empty answers/questions)",
    );
  }

  // event 1 (the seed event) plus events 2..(limit+1) (the gold next events).
  const chunks: MemoryAgentBenchChunk[] = [
    { content: stripLeadingEventNumber(previousEvents[0]), id: 1, role: "user" },
  ];
  const normalizedQuestions: MemoryAgentBenchQuestion[] = [];
  for (let index = 0; index < limit; index += 1) {
    const goldAnswer = firstGoldAnswer(row.answers, index);
    const eventChunkId = index + 2;
    chunks.push({ content: goldAnswer, id: eventChunkId, role: "user" });
    normalizedQuestions.push({
      competency: "AR",
      evidenceChunkIds: [eventChunkId],
      goldAnswer,
      matchMode: "substring_exact_match",
      question: questions[index],
      questionId: qaPairIds[index] ?? `${sourceDataset}_no${index}`,
      staleChunkIds: [],
    });
  }

  return {
    caseId: `ar_${sourceDataset}`,
    chunks,
    competency: "AR",
    questions: normalizedQuestions,
    sourceDataset,
  };
}

function normalizeRowToCase(
  competency: MemoryAgentBenchCompetency,
  row: Record<string, unknown>,
  truncatedCells: readonly string[],
  options: Phase64MabPrepareOptions,
): MemoryAgentBenchCase {
  if (competency === "AR") {
    return normalizeEventQaRow(row, truncatedCells, options);
  }
  throw new Error(
    `MemoryAgentBench prep: the ${competency} normalizer is not implemented yet (only AR/event_qa is available). Tracked as a Phase 64 follow-up.`,
  );
}

async function loadExistingCases(
  casesFile: string,
  readFileImpl: (path: string) => Promise<string>,
): Promise<MemoryAgentBenchCase[]> {
  let raw: string;
  try {
    raw = await readFileImpl(casesFile);
  } catch {
    // Absent file: nothing to merge into.
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Existing MemoryAgentBench cases file ${casesFile} is not valid JSON; refusing to overwrite: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const cases = isRecord(parsed) ? parsed.cases : parsed;
  if (!Array.isArray(cases)) {
    throw new Error(
      `Existing MemoryAgentBench cases file ${casesFile} must contain a cases array (or {cases: [...]}).`,
    );
  }
  return cases as MemoryAgentBenchCase[];
}

export async function preparePhase64MemoryAgentBenchData(
  options: Phase64MabPrepareOptions,
  dependencies: Phase64MabPrepareDependencies = {},
): Promise<Phase64MabPrepareResult> {
  const mkdirImpl = dependencies.mkdir ?? mkdir;
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const requestJson = dependencies.requestJson ?? requestJsonWithCurl;
  const now = dependencies.now ?? (() => new Date());

  const split = MEMORY_AGENT_BENCH_COMPETENCY_SPLITS[options.competency];
  const rowsEndpoint = buildPhase64MabRowsUrl({
    dataset: options.dataset,
    length: 1,
    offset: options.offset,
    split,
  });
  const { row, truncatedCells } = readSingleUpstreamRow(
    await requestJson(rowsEndpoint),
  );
  const totalQuestionsAvailable = Array.isArray(row.questions)
    ? row.questions.length
    : 0;
  const normalizedCase = normalizeRowToCase(
    options.competency,
    row,
    truncatedCells,
    options,
  );

  const casesFile = join(options.outputRoot, MEMORY_AGENT_BENCH_CASES_FILE_NAME);
  const metadataFile = join(
    options.outputRoot,
    MEMORY_AGENT_BENCH_METADATA_FILE_NAME,
  );
  const retained = options.merge
    ? (await loadExistingCases(casesFile, readFileImpl)).filter(
        (existing) => existing.competency !== options.competency,
      )
    : [];
  const cases = [...retained, normalizedCase];

  const generatedAt = now().toISOString();
  const result: Phase64MabPrepareResult = {
    caseId: normalizedCase.caseId,
    casesFile,
    chunkCount: normalizedCase.chunks.length,
    competency: options.competency,
    dataset: options.dataset,
    generatedAt,
    merged: options.merge,
    metadataFile,
    offset: options.offset,
    outputRoot: options.outputRoot,
    questionCount: normalizedCase.questions.length,
    rowsEndpoint,
    sourceDataset: normalizedCase.sourceDataset,
    split,
    totalCasesWritten: cases.length,
    totalQuestionsAvailable,
  };

  await mkdirImpl(options.outputRoot, { recursive: true });
  await writeFileImpl(casesFile, `${JSON.stringify({ cases }, null, 2)}\n`);
  await writeFileImpl(
    metadataFile,
    `${JSON.stringify(
      {
        ...result,
        upstreamLicense: MEMORY_AGENT_BENCH_UPSTREAM_LICENSE,
        upstreamSource: MEMORY_AGENT_BENCH_UPSTREAM_SOURCE,
      },
      null,
      2,
    )}\n`,
  );
  return result;
}

if (import.meta.main) {
  const result = await preparePhase64MemoryAgentBenchData(
    parsePhase64MabPrepareCliOptions(Bun.argv),
  );
  console.log(JSON.stringify(result, null, 2));
}
