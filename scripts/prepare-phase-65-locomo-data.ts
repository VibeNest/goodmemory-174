// Reproducible Phase 65 LoCoMo external-root prep. Fetches the upstream
// snap-research/locomo `locomo10.json` (CC BY-NC 4.0 — NON-COMMERCIAL; NOT
// vendored) and writes an ALREADY-NORMALIZED `cases.json` into the external root
// (GOODMEMORY_LOCOMO_ROOT / --output-root, default /private/tmp/LOCOMO) so the
// smoke can apply real distractor pressure. No upstream data enters the repo;
// only this normalization code does.
//
//   bun run scripts/prepare-phase-65-locomo-data.ts -- --max-conversations 1 --max-questions-per-case 40
//   GOODMEMORY_LOCOMO_ROOT=/private/tmp/LOCOMO bun run eval:phase-65-smoke -- --benchmark-root /private/tmp/LOCOMO --live --evidence-pack
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  deriveLocomoMatchMode,
  normalizeLocomoCategoryCode,
  type LocomoCase,
  type LocomoQuestion,
  type LocomoTurn,
} from "../src/eval/locomo";
import {
  assertDistinctCliPathValues,
  resolveCliFlagValueStrict,
} from "./cli-options";

export const LOCOMO_UPSTREAM_COMMIT =
  "cbfbc1dba6bc53d00625212a0f22d55ffee7c1fc";
export const LOCOMO_UPSTREAM_SHA256 =
  "79fa87e90f04081343b8c8debecb80a9a6842b76a7aa537dc9fdf651ea698ff4";
export const LOCOMO_UPSTREAM_URL =
  `https://raw.githubusercontent.com/snap-research/locomo/${LOCOMO_UPSTREAM_COMMIT}/data/locomo10.json`;
const ADVERSARIAL_ABSTENTION_GOLD = "No information available";
const CANONICAL_LOCOMO_DIA_ID_PATTERN = /^D(\d+):(\d+)$/u;
const LEGACY_LOCOMO_DIA_ID_PATTERN = /^D:(\d+):(\d+)$/u;

export interface LocomoPrepNormalizeOptions {
  maxConversations: number;
  maxQuestionsPerCase: number;
}

export interface LocomoPrepCliOptions extends LocomoPrepNormalizeOptions {
  outputRoot: string;
  sourceFile?: string;
  sourceUrl: string;
}

export interface LocomoPrepFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNonNegativeIntegerFlag(
  argv: readonly string[],
  flagName: string,
  fallback: number,
): number {
  const raw = resolveCliFlagValueStrict(argv, flagName);
  if (raw === undefined) {
    return fallback;
  }
  if (!/^(0|[1-9]\d*)$/.test(raw)) {
    throw new Error(`${flagName} must be a non-negative integer.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${flagName} must be a non-negative integer.`);
  }
  return value;
}

function resolveOutputRootEnv(): string | undefined {
  const value = process.env.GOODMEMORY_LOCOMO_ROOT;
  if (value === undefined) {
    return undefined;
  }
  if (value.trim().length === 0 || value.trim() !== value) {
    throw new Error(
      "GOODMEMORY_LOCOMO_ROOT cannot be empty or whitespace-padded.",
    );
  }
  return value;
}

export function parseLocomoPrepCliOptions(
  argv: readonly string[],
): LocomoPrepCliOptions {
  const outputRoot =
    resolveCliFlagValueStrict(argv, "--output-root") ??
    resolveOutputRootEnv() ??
    "/private/tmp/LOCOMO";
  const sourceFile = resolveCliFlagValueStrict(argv, "--source-file");
  const sourceUrl = resolveCliFlagValueStrict(argv, "--source-url");

  if (sourceFile !== undefined) {
    if (sourceUrl !== undefined) {
      throw new Error("--source-file and --source-url cannot both be specified.");
    }
    assertDistinctCliPathValues({
      firstFlag: "--source-file",
      firstValue: sourceFile,
      secondFlag: "--output-root/cases.json",
      secondValue: join(outputRoot, "cases.json"),
    });
  }

  return {
    maxConversations: parseNonNegativeIntegerFlag(
      argv,
      "--max-conversations",
      1,
    ),
    maxQuestionsPerCase: parseNonNegativeIntegerFlag(
      argv,
      "--max-questions-per-case",
      40,
    ),
    outputRoot,
    sourceFile,
    sourceUrl: sourceUrl ?? LOCOMO_UPSTREAM_URL,
  };
}

export async function loadLocomoPrepSource(input: {
  fetchSource?: (url: string) => Promise<LocomoPrepFetchResponse>;
  readTextFile?: (path: string) => Promise<string>;
  sourceFile?: string;
  sourceUrl: string;
}): Promise<string> {
  if (input.sourceFile !== undefined) {
    const readTextFile =
      input.readTextFile ?? ((path: string) => readFile(path, "utf8"));
    return readTextFile(input.sourceFile);
  }

  const fetchSource = input.fetchSource ?? fetch;
  const response = await fetchSource(input.sourceUrl);
  if (!response.ok) {
    const statusText =
      response.statusText.length > 0 ? ` ${response.statusText}` : "";
    throw new Error(
      `Failed to fetch LoCoMo source ${input.sourceUrl}: ` +
        `${response.status}${statusText}.`,
    );
  }

  return response.text();
}

export function validateLocomoPrepSource(input: {
  raw: string;
  sourceFile?: string;
  sourceUrl: string;
}): string {
  const sourceSha256 = createHash("sha256").update(input.raw).digest("hex");
  if (
    input.sourceFile === undefined &&
    input.sourceUrl === LOCOMO_UPSTREAM_URL &&
    sourceSha256 !== LOCOMO_UPSTREAM_SHA256
  ) {
    throw new Error(
      `Pinned LoCoMo source SHA-256 mismatch: expected ${LOCOMO_UPSTREAM_SHA256}, received ${sourceSha256}.`,
    );
  }
  return sourceSha256;
}

export function normalizeLocomoDiaId(value: string): string | null {
  const trimmed = value.trim();
  const canonical = CANONICAL_LOCOMO_DIA_ID_PATTERN.exec(trimmed);
  if (canonical !== null) {
    return `D${canonical[1]}:${canonical[2]}`;
  }
  const legacy = LEGACY_LOCOMO_DIA_ID_PATTERN.exec(trimmed);
  if (legacy !== null) {
    return `D${legacy[1]}:${legacy[2]}`;
  }
  return null;
}

function normalizeTurns(conversation: Record<string, unknown>): LocomoTurn[] {
  const turns: LocomoTurn[] = [];
  const sessionKeys = Object.keys(conversation)
    .filter((key) => /^session_\d+$/u.test(key))
    .sort((left, right) => {
      const ln = Number(left.replace("session_", ""));
      const rn = Number(right.replace("session_", ""));
      return ln - rn;
    });
  for (const key of sessionKeys) {
    const session = conversation[key];
    if (!Array.isArray(session)) {
      continue;
    }
    // Absolute session date/time (e.g. "1:56 pm on 8 May, 2023"), stored under a
    // sibling "<session>_date_time" key upstream. Carried per turn so temporal
    // answering can resolve relative dates to absolute ones.
    const sessionDate = conversation[`${key}_date_time`];
    const date = typeof sessionDate === "string" ? sessionDate : undefined;
    for (const entry of session) {
      if (!isRecord(entry)) {
        continue;
      }
      const rawDiaId = entry.dia_id;
      const speaker = entry.speaker;
      const content = entry.text;
      if (
        typeof rawDiaId !== "string" ||
        typeof speaker !== "string" ||
        typeof content !== "string" ||
        content.trim().length === 0
      ) {
        continue;
      }
      const diaId = normalizeLocomoDiaId(rawDiaId);
      if (diaId === null) {
        continue;
      }
      const imageCaption =
        typeof entry.blip_caption === "string" ? entry.blip_caption.trim() : "";
      const sourceContent = imageCaption.length > 0
        ? `${content}\n\nImage caption: ${imageCaption}`
        : content;
      turns.push(
        date === undefined
          ? { content: sourceContent, diaId, speaker }
          : { content: sourceContent, date, diaId, speaker },
      );
    }
  }
  return turns;
}

function normalizeEvidenceTurnIds(evidence: unknown): string[] {
  if (!Array.isArray(evidence)) {
    return [];
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of evidence) {
    if (typeof value !== "string") {
      continue;
    }
    const diaId = normalizeLocomoDiaId(value);
    if (diaId === null || seen.has(diaId)) {
      continue;
    }
    seen.add(diaId);
    ids.push(diaId);
  }
  return ids;
}

function normalizeQuestions(
  qa: unknown,
  sampleId: string,
  maxQuestions: number,
): LocomoQuestion[] {
  if (!Array.isArray(qa)) {
    return [];
  }
  const questions: LocomoQuestion[] = [];
  for (const entry of qa) {
    if (!isRecord(entry) || typeof entry.category !== "number") {
      continue;
    }
    const category = normalizeLocomoCategoryCode(entry.category);
    const adversarial = category === "adversarial";
    const evidenceTurnIds = normalizeEvidenceTurnIds(entry.evidence);
    const goldAnswer = adversarial
      ? ADVERSARIAL_ABSTENTION_GOLD
      : entry.answer === undefined || entry.answer === null
        ? ""
        : String(entry.answer);
    if (typeof entry.question !== "string" || goldAnswer.length === 0) {
      continue;
    }
    questions.push({
      adversarialAnswer:
        adversarial && typeof entry.adversarial_answer === "string"
          ? entry.adversarial_answer
          : null,
      category,
      evidenceTurnIds,
      goldAnswer,
      matchMode: deriveLocomoMatchMode(category),
      question: entry.question,
      questionId: `${sampleId}:q${questions.length}`,
    });
    if (maxQuestions > 0 && questions.length >= maxQuestions) {
      break;
    }
  }
  return questions;
}

export function normalizeLocomoPrepCases(
  parsed: unknown,
  { maxConversations, maxQuestionsPerCase }: LocomoPrepNormalizeOptions,
): LocomoCase[] {
  if (!Array.isArray(parsed)) {
    throw new Error("Upstream locomo10.json must be a JSON array of conversations.");
  }

  const cases: LocomoCase[] = [];
  const selected =
    maxConversations > 0 ? parsed.slice(0, maxConversations) : parsed;
  for (let index = 0; index < selected.length; index += 1) {
    const entry = selected[index];
    if (!isRecord(entry) || !isRecord(entry.conversation)) {
      continue;
    }
    const sampleId =
      typeof entry.sample_id === "string"
        ? entry.sample_id
        : `conversation-${index + 1}`;
    const conversation = entry.conversation;
    const turns = normalizeTurns(conversation);
    const questions = normalizeQuestions(entry.qa, sampleId, maxQuestionsPerCase);
    if (turns.length === 0 || questions.length === 0) {
      continue;
    }
    cases.push({
      caseId: `locomo-${sampleId}`,
      questions,
      sourceConversation: sampleId,
      speakers: [
        typeof conversation.speaker_a === "string" ? conversation.speaker_a : "speaker_a",
        typeof conversation.speaker_b === "string" ? conversation.speaker_b : "speaker_b",
      ],
      turns,
    });
  }
  return cases;
}

async function main(): Promise<void> {
  const {
    maxConversations,
    maxQuestionsPerCase,
    outputRoot,
    sourceFile,
    sourceUrl,
  } = parseLocomoPrepCliOptions(Bun.argv);

  const raw = await loadLocomoPrepSource({ sourceFile, sourceUrl });
  const sourceSha256 = validateLocomoPrepSource({
    raw,
    sourceFile,
    sourceUrl,
  });
  const parsed = JSON.parse(raw) as unknown;
  const cases = normalizeLocomoPrepCases(parsed, {
    maxConversations,
    maxQuestionsPerCase,
  });

  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    join(outputRoot, "cases.json"),
    `${JSON.stringify({ cases }, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        casesFile: join(outputRoot, "cases.json"),
        caseCount: cases.length,
        license: "CC BY-NC 4.0 (not vendored)",
        questionCount: cases.reduce((sum, item) => sum + item.questions.length, 0),
        source: sourceFile ?? sourceUrl,
        sourceCommit:
          sourceFile === undefined && sourceUrl === LOCOMO_UPSTREAM_URL
            ? LOCOMO_UPSTREAM_COMMIT
            : null,
        sourceSha256,
        turnCount: cases.reduce((sum, item) => sum + item.turns.length, 0),
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
