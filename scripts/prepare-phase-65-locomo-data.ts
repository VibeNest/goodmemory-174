// Reproducible Phase 65 LoCoMo external-root prep. Fetches the upstream
// snap-research/locomo `locomo10.json` (CC BY-NC 4.0 — NON-COMMERCIAL; NOT
// vendored) and writes an ALREADY-NORMALIZED `cases.json` into the external root
// (GOODMEMORY_LOCOMO_ROOT / --output-root, default /private/tmp/LOCOMO) so the
// smoke can apply real distractor pressure. No upstream data enters the repo;
// only this normalization code does.
//
//   bun run scripts/prepare-phase-65-locomo-data.ts -- --max-conversations 1 --max-questions-per-case 40
//   GOODMEMORY_LOCOMO_ROOT=/private/tmp/LOCOMO bun run eval:phase-65-smoke -- --benchmark-root /private/tmp/LOCOMO --live --evidence-pack
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  deriveLocomoMatchMode,
  normalizeLocomoCategoryCode,
  type LocomoCase,
  type LocomoQuestion,
  type LocomoTurn,
} from "../src/eval/locomo";
import { resolveCliFlagValueStrict } from "./cli-options";

const UPSTREAM_URL =
  "https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json";
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

export function parseLocomoPrepCliOptions(
  argv: readonly string[],
): LocomoPrepCliOptions {
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
    outputRoot:
      resolveCliFlagValueStrict(argv, "--output-root") ??
      process.env.GOODMEMORY_LOCOMO_ROOT ??
      "/private/tmp/LOCOMO",
    sourceFile: resolveCliFlagValueStrict(argv, "--source-file"),
    sourceUrl: resolveCliFlagValueStrict(argv, "--source-url") ?? UPSTREAM_URL,
  };
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
      turns.push(date === undefined ? { content, diaId, speaker } : { content, date, diaId, speaker });
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

  const raw = sourceFile
    ? await readFile(sourceFile, "utf8")
    : await (await fetch(sourceUrl)).text();
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
