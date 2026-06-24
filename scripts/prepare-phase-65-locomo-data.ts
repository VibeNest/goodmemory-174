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
import { resolveCliFlagValue } from "./cli-options";

const UPSTREAM_URL =
  "https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json";
const ADVERSARIAL_ABSTENTION_GOLD = "No information available";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePositiveIntFlag(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Expected a non-negative integer, got ${raw}`);
  }
  return value;
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
    for (const entry of session) {
      if (!isRecord(entry)) {
        continue;
      }
      const diaId = entry.dia_id;
      const speaker = entry.speaker;
      const content = entry.text;
      if (
        typeof diaId !== "string" ||
        typeof speaker !== "string" ||
        typeof content !== "string" ||
        content.trim().length === 0
      ) {
        continue;
      }
      turns.push({ content, diaId, speaker });
    }
  }
  return turns;
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
    const evidenceTurnIds = Array.isArray(entry.evidence)
      ? entry.evidence.filter((id): id is string => typeof id === "string")
      : [];
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

async function main(): Promise<void> {
  const argv = Bun.argv;
  const outputRoot =
    resolveCliFlagValue(argv, "--output-root") ??
    process.env.GOODMEMORY_LOCOMO_ROOT ??
    "/private/tmp/LOCOMO";
  const sourceFile = resolveCliFlagValue(argv, "--source-file");
  const sourceUrl = resolveCliFlagValue(argv, "--source-url") ?? UPSTREAM_URL;
  const maxConversations = parsePositiveIntFlag(
    resolveCliFlagValue(argv, "--max-conversations"),
    1,
  );
  const maxQuestionsPerCase = parsePositiveIntFlag(
    resolveCliFlagValue(argv, "--max-questions-per-case"),
    40,
  );

  const raw = sourceFile
    ? await readFile(sourceFile, "utf8")
    : await (await fetch(sourceUrl)).text();
  const parsed = JSON.parse(raw) as unknown;
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

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
