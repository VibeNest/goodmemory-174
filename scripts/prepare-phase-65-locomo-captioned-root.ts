// P65-R002 Step 3 eval-only research probe: does ADDING a model-generated
// semantic caption to each short dialog turn at ingest time make the SAME gold
// turn retrievable? Steps 1 (positional windows) and 2 (rules-light query
// expansion) both failed — the LoCoMo question<->dialog gap is open-ended
// SEMANTIC ("occupation" must reach "my shift at the clinic"), which hand-crafted
// lexical bridges cannot cover. This probe tests the remaining plausible lever:
// learned semantic enrichment.
//
// It is a PREPARATION script, NOT a product feature. It reads an already-
// normalized external LoCoMo root (cases.json) and writes a NEW captioned root
// whose turns keep their original diaId and raw text but gain a retrievable
// caption. Evidence ids are unchanged, so any recall lift means the same gold
// turn became findable after enrichment. It changes NOTHING in the recall engine,
// public API, or storage schema; the existing eval:phase-65-smoke and
// analyze:phase-65-locomo-retrieval-gap run against the captioned root unchanged.
//
// DISCIPLINE — the captioner is given ONLY dialog turns (the center turn, plus
// for local-window-2 its immediate neighbors). It NEVER sees the questions, gold
// answers, or evidence ids. That boundary is enforced structurally: the caption
// functions take turns, never the LocomoQuestion[]. This models what a
// conversational memory system legitimately does at ingest (interpret a short
// utterance in its local dialog context), not benchmark leakage.
//
// Two variants (the user's P65-R002 spec):
//   --mode turn-only        caption from the center turn alone (tests paraphrase)
//   --mode local-window-2   caption the center turn using +-radius neighbors only
//                           to resolve pronouns/references (tests grounding)
//
//   bun run scripts/prepare-phase-65-locomo-captioned-root.ts -- \
//     --mode turn-only --source-root /private/tmp/LOCOMO-all \
//     --output-root /private/tmp/LOCOMO_CAPTIONED_TURN_ONLY
//   bun run eval:phase-65-smoke -- --benchmark-root /private/tmp/LOCOMO_CAPTIONED_TURN_ONLY \
//     --run-id locomo-caption-turn-only-retrieval
//   bun run analyze:phase-65-locomo-retrieval-gap -- \
//     --report reports/eval/research/phase-65/locomo/locomo-caption-turn-only-retrieval/smoke-report.json \
//     --cases /private/tmp/LOCOMO_CAPTIONED_TURN_ONLY/cases.json
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LocomoCase, LocomoTurn } from "../src/eval/locomo";
import {
  requestOpenAICompatibleText,
  stripThinkingBlocks,
  withAISDKRetries,
} from "../src/provider/ai-sdk-runtime";
import { resolveCliFlagValue } from "./cli-options";
import { resolveLiveModelConfig } from "./run-eval";

export const CAPTION_MODES = ["turn-only", "local-window-2"] as const;
export type CaptionMode = (typeof CAPTION_MODES)[number];

const DEFAULT_SOURCE_ROOT = "/private/tmp/LOCOMO-all";
const DEFAULT_OUTPUT_ROOT = "/private/tmp/LOCOMO_CAPTIONED";
const DEFAULT_WINDOW_RADIUS = 2;
const DEFAULT_CONCURRENCY = 6;
const MAX_CAPTIONS_PER_TURN = 3;
const CAPTION_REQUEST_TIMEOUT_MS = 60_000;
const CASES_FILE_NAME = "cases.json";
const METADATA_FILE_NAME = "phase-65-caption-metadata.json";
const CACHE_FILE_NAME = "caption-cache.jsonl";
const UPSTREAM_LICENSE = "CC BY-NC 4.0 (not vendored)";
const GENERATED_BY = "scripts/prepare-phase-65-locomo-captioned-root.ts";

// The captioner sees ONE dialog turn (the center) plus, for local-window-2, the
// surrounding window used only to resolve references. Questions/gold/evidence are
// structurally absent from this type.
export interface CaptionerInput {
  centerTurn: LocomoTurn;
  contextTurns: readonly LocomoTurn[];
  mode: CaptionMode;
}

export type Captioner = (input: CaptionerInput) => Promise<string[]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Constrained system prompt (the user's P65-R002 spec, verbatim intent): caption
// the center turn, never answer, never invent, never use questions/gold/evidence.
export const CAPTION_SYSTEM_PROMPT = [
  "You are creating retrieval captions for one dialog turn in a long conversation.",
  "Write 1-3 short factual search captions for the CENTER turn only.",
  "Use local context only to resolve pronouns, speaker references, and implicit topics.",
  "Do not mention facts that are not supported by the center turn plus local context.",
  "Do not answer any question.",
  "Do not use future questions, gold answers, or evidence labels.",
  'Return JSON only: {"captions": ["..."]}',
].join("\n");

export function buildCaptionUserPrompt(input: CaptionerInput): string {
  if (input.mode === "turn-only") {
    return [
      "Rewrite THIS dialog turn into 1-3 short, fact-like search captions a reader",
      "might later search for. Paraphrase only what the turn itself states.",
      "",
      `Turn — ${input.centerTurn.speaker}: ${input.centerTurn.content}`,
      "",
      'Return JSON only: {"captions": ["..."]}',
    ].join("\n");
  }
  // local-window-2: show the window, mark the center, caption the center only.
  const windowLines = input.contextTurns.map((turn) => {
    const marker = turn.diaId === input.centerTurn.diaId ? ">> CENTER >> " : "   ";
    return `${marker}${turn.speaker}: ${turn.content}`;
  });
  return [
    "Below is a short window of a conversation. Write 1-3 short, fact-like search",
    "captions for the CENTER turn (marked '>> CENTER >>') only. Use the neighboring",
    "turns ONLY to resolve pronouns, references, and implicit topics — do not",
    "caption the neighbors and do not add facts they introduce on their own.",
    "",
    "Conversation window:",
    ...windowLines,
    "",
    'Return JSON only: {"captions": ["..."]}',
  ].join("\n");
}

// Tolerant JSON extraction: strip <think> blocks and code fences, take the first
// balanced object, read .captions, normalize, cap at MAX_CAPTIONS_PER_TURN. Any
// failure yields [] (the turn keeps its raw text — a neutral, non-leaking fallback
// rather than a crash).
export function parseCaptionsFromModel(text: string): string[] {
  let source = stripThinkingBlocks(text).trim();
  const fence = source.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (fence?.[1]) {
    source = fence[1].trim();
  }
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.captions)) {
    return [];
  }
  const seen = new Set<string>();
  const captions: string[] = [];
  for (const entry of parsed.captions) {
    if (typeof entry !== "string") {
      continue;
    }
    const normalized = entry.replace(/\s+/gu, " ").trim();
    if (normalized.length === 0 || seen.has(normalized.toLowerCase())) {
      continue;
    }
    seen.add(normalized.toLowerCase());
    captions.push(normalized);
    if (captions.length >= MAX_CAPTIONS_PER_TURN) {
      break;
    }
  }
  return captions;
}

// Enriched retrievable text: keep the raw turn (so we never lose the original
// lexical signal) and append the captions. On a caption failure the turn is left
// exactly as the baseline (no empty marker injected).
export function enrichTurnContent(rawContent: string, captions: readonly string[]): string {
  if (captions.length === 0) {
    return rawContent;
  }
  return [
    "Original dialog:",
    rawContent,
    "",
    "Semantic caption:",
    ...captions,
  ].join("\n");
}

// The +-radius window around a turn, in source order, including the center.
export function buildLocalWindow(
  turns: readonly LocomoTurn[],
  index: number,
  radius: number,
): LocomoTurn[] {
  const low = Math.max(0, index - radius);
  const high = Math.min(turns.length - 1, index + radius);
  return turns.slice(low, high + 1);
}

function captionerInputFor(
  turns: readonly LocomoTurn[],
  index: number,
  mode: CaptionMode,
  windowRadius: number,
): CaptionerInput {
  const centerTurn = turns[index] as LocomoTurn;
  return {
    centerTurn,
    contextTurns:
      mode === "local-window-2"
        ? buildLocalWindow(turns, index, windowRadius)
        : [centerTurn],
    mode,
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index] as T, index);
    }
  });
  await Promise.all(runners);
  return results;
}

export interface CaptionedCaseResult {
  captionedCase: LocomoCase;
  captionsByDiaId: Record<string, string[]>;
  captionFailureCount: number;
  captionedTurnCount: number;
}

// Pure builder (no IO): captions every turn of a case via the injected captioner
// and returns the enriched case. The questions array is passed through BYTE-FOR-
// BYTE — it is never handed to the captioner.
export async function buildCaptionedCase(input: {
  captioner: Captioner;
  concurrency: number;
  mode: CaptionMode;
  testCase: LocomoCase;
  windowRadius: number;
}): Promise<CaptionedCaseResult> {
  const { turns } = input.testCase;
  const captionsByDiaId: Record<string, string[]> = {};
  let captionFailureCount = 0;
  let captionedTurnCount = 0;

  const enrichedTurns = await mapWithConcurrency(turns, input.concurrency, async (turn, index) => {
    const captions = await input.captioner(
      captionerInputFor(turns, index, input.mode, input.windowRadius),
    );
    captionsByDiaId[turn.diaId] = captions;
    if (captions.length === 0) {
      captionFailureCount += 1;
    } else {
      captionedTurnCount += 1;
    }
    return {
      content: enrichTurnContent(turn.content, captions),
      diaId: turn.diaId,
      speaker: turn.speaker,
    } satisfies LocomoTurn;
  });

  return {
    captionedCase: {
      caseId: input.testCase.caseId,
      // Questions pass through untouched: same wording, same evidence ids.
      questions: input.testCase.questions,
      sourceConversation: input.testCase.sourceConversation,
      speakers: input.testCase.speakers,
      turns: enrichedTurns,
    },
    captionFailureCount,
    captionedTurnCount,
    captionsByDiaId,
  };
}

function assertNormalizedCase(value: unknown, index: number): LocomoCase {
  if (
    !isRecord(value) ||
    typeof value.caseId !== "string" ||
    !Array.isArray(value.turns) ||
    !Array.isArray(value.questions)
  ) {
    throw new Error(
      `LoCoMo source case at index ${index} is not normalized (need caseId, turns[], questions[]).`,
    );
  }
  return value as unknown as LocomoCase;
}

export async function loadSourceCases(input: {
  readFile: (path: string) => Promise<string>;
  sourceRoot: string;
}): Promise<LocomoCase[]> {
  const path = join(input.sourceRoot, CASES_FILE_NAME);
  const parsed = JSON.parse(await input.readFile(path)) as unknown;
  const rawCases = isRecord(parsed) ? parsed.cases : parsed;
  if (!Array.isArray(rawCases)) {
    throw new Error(`LoCoMo source root ${path} must contain a cases array (or {cases: [...]}).`);
  }
  return rawCases.map((value, index) => assertNormalizedCase(value, index));
}

// FNV-1a content hash: keys the resumable cache so a reused caption always
// corresponds to the exact turn text it was generated from.
function contentHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

interface CacheEntry {
  captions: string[];
  contentHash: string;
  diaId: string;
  mode: CaptionMode;
}

async function loadCaptionCache(input: {
  cachePath: string;
  readFile: (path: string) => Promise<string>;
}): Promise<Map<string, string[]>> {
  const cache = new Map<string, string[]>();
  let raw: string;
  try {
    raw = await input.readFile(input.cachePath);
  } catch {
    return cache;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    try {
      const entry = JSON.parse(trimmed) as CacheEntry;
      if (
        typeof entry?.diaId === "string" &&
        typeof entry?.contentHash === "string" &&
        Array.isArray(entry?.captions)
      ) {
        cache.set(`${entry.mode}:${entry.diaId}:${entry.contentHash}`, entry.captions);
      }
    } catch {
      // Skip a corrupt cache line rather than failing the whole run.
    }
  }
  return cache;
}

// Real gpt-5.5 captioner. Wrapped by the IO layer in a cache so a TLS outage
// mid-run (the BEAM live-slice hazard) never forces a full re-caption.
export function createLiveCaptioner(): Captioner {
  const model = resolveLiveModelConfig("GOODMEMORY_EVAL");
  return async (input) => {
    const text = await withAISDKRetries(() =>
      requestOpenAICompatibleText({
        model,
        prompt: buildCaptionUserPrompt(input),
        system: CAPTION_SYSTEM_PROMPT,
        timeoutMs: CAPTION_REQUEST_TIMEOUT_MS,
      }),
    );
    return parseCaptionsFromModel(text);
  };
}

export interface PrepareCaptionedRootResult {
  caseCount: number;
  captionFailureCount: number;
  captionedTurnCount: number;
  casesFile: string;
  meanCaptionsPerCaptionedTurn: number;
  metadataFile: string;
  mode: CaptionMode;
  outputRoot: string;
  turnCount: number;
}

export async function prepareCaptionedRoot(input: {
  appendFile?: (path: string, data: string) => Promise<unknown>;
  captioner: Captioner;
  concurrency: number;
  mkdir?: (path: string, options: { recursive: boolean }) => Promise<unknown>;
  mode: CaptionMode;
  modelLabel: string;
  outputRoot: string;
  readFile?: (path: string) => Promise<string>;
  sourceRoot: string;
  windowRadius: number;
  writeFile?: (path: string, data: string) => Promise<unknown>;
}): Promise<PrepareCaptionedRootResult> {
  const readFileImpl = input.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl =
    input.writeFile ?? ((path: string, data: string) => writeFile(path, data));
  const mkdirImpl =
    input.mkdir ?? ((path: string, options: { recursive: boolean }) => mkdir(path, options));
  const appendFileImpl =
    input.appendFile ?? ((path: string, data: string) => appendFile(path, data));

  const cases = await loadSourceCases({ readFile: readFileImpl, sourceRoot: input.sourceRoot });
  await mkdirImpl(input.outputRoot, { recursive: true });
  const cachePath = join(input.outputRoot, CACHE_FILE_NAME);
  const cache = await loadCaptionCache({ cachePath, readFile: readFileImpl });

  // Cache-aware wrapper around the supplied captioner. Cache hits cost nothing;
  // misses call the captioner and append to the resumable JSONL cache.
  const cachingCaptioner: Captioner = async (captionerInput) => {
    const key = `${captionerInput.mode}:${captionerInput.centerTurn.diaId}:${contentHash(
      captionerInput.centerTurn.content,
    )}`;
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const captions = await input.captioner(captionerInput);
    cache.set(key, captions);
    const entry: CacheEntry = {
      captions,
      contentHash: contentHash(captionerInput.centerTurn.content),
      diaId: captionerInput.centerTurn.diaId,
      mode: captionerInput.mode,
    };
    await appendFileImpl(cachePath, `${JSON.stringify(entry)}\n`);
    return captions;
  };

  const outputCases: LocomoCase[] = [];
  const captionsByDiaId: Record<string, string[]> = {};
  let turnCount = 0;
  let captionedTurnCount = 0;
  let captionFailureCount = 0;
  let captionTotal = 0;
  for (const testCase of cases) {
    const result = await buildCaptionedCase({
      captioner: cachingCaptioner,
      concurrency: input.concurrency,
      mode: input.mode,
      testCase,
      windowRadius: input.windowRadius,
    });
    outputCases.push(result.captionedCase);
    Object.assign(captionsByDiaId, result.captionsByDiaId);
    turnCount += testCase.turns.length;
    captionedTurnCount += result.captionedTurnCount;
    captionFailureCount += result.captionFailureCount;
    for (const captions of Object.values(result.captionsByDiaId)) {
      captionTotal += captions.length;
    }
  }

  const meanCaptionsPerCaptionedTurn =
    captionedTurnCount === 0 ? 0 : Number((captionTotal / captionedTurnCount).toFixed(3));

  const casesFile = join(input.outputRoot, CASES_FILE_NAME);
  await writeFileImpl(casesFile, `${JSON.stringify({ cases: outputCases }, null, 2)}\n`);

  const metadataFile = join(input.outputRoot, METADATA_FILE_NAME);
  await writeFileImpl(
    metadataFile,
    `${JSON.stringify(
      {
        captionFailureCount,
        captionedTurnCount,
        // Full per-turn caption audit/export surface.
        captionsByDiaId,
        caseCount: outputCases.length,
        generatedAt: new Date().toISOString(),
        generatedBy: GENERATED_BY,
        leakageGuard:
          "captioner received dialog turns only; questions, gold answers, and evidence ids were never supplied",
        license: UPSTREAM_LICENSE,
        meanCaptionsPerCaptionedTurn,
        mode: input.mode,
        model: input.modelLabel,
        phase: "phase-65",
        sourceRoot: input.sourceRoot,
        turnCount,
        windowRadius: input.mode === "local-window-2" ? input.windowRadius : null,
      },
      null,
      2,
    )}\n`,
  );

  return {
    caseCount: outputCases.length,
    captionFailureCount,
    captionedTurnCount,
    casesFile,
    meanCaptionsPerCaptionedTurn,
    metadataFile,
    mode: input.mode,
    outputRoot: input.outputRoot,
    turnCount,
  };
}

function parseMode(raw: string | undefined): CaptionMode {
  const mode = raw ?? "turn-only";
  if ((CAPTION_MODES as readonly string[]).includes(mode)) {
    return mode as CaptionMode;
  }
  throw new Error(`--mode must be one of ${CAPTION_MODES.join(", ")} (got ${mode}).`);
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Expected a positive integer, got ${raw}`);
  }
  return value;
}

if (import.meta.main) {
  const argv = Bun.argv;
  const mode = parseMode(resolveCliFlagValue(argv, "--mode"));
  const sourceRoot =
    resolveCliFlagValue(argv, "--source-root") ??
    process.env.GOODMEMORY_LOCOMO_ROOT ??
    DEFAULT_SOURCE_ROOT;
  const outputRoot = resolveCliFlagValue(argv, "--output-root") ?? DEFAULT_OUTPUT_ROOT;
  const windowRadius = parsePositiveInt(
    resolveCliFlagValue(argv, "--window-radius"),
    DEFAULT_WINDOW_RADIUS,
  );
  const concurrency = parsePositiveInt(
    resolveCliFlagValue(argv, "--concurrency") ??
      process.env.GOODMEMORY_EVAL_MAX_CONCURRENCY,
    DEFAULT_CONCURRENCY,
  );
  const model = resolveLiveModelConfig("GOODMEMORY_EVAL");
  const result = await prepareCaptionedRoot({
    captioner: createLiveCaptioner(),
    concurrency,
    mode,
    modelLabel: `${model.provider}:${model.model}`,
    outputRoot,
    sourceRoot,
    windowRadius,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
