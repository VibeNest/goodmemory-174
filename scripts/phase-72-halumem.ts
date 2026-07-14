import type { EmbeddingAdapter } from "../src/embedding/contracts";

export interface HaluMemDialogueTurn {
  content: string;
  dialogue_turn?: number;
  role: string;
  timestamp: string;
}

export interface HaluMemMemoryPoint {
  importance: number;
  is_update: string;
  memory_content: string;
  memory_source: string;
  memory_type: string;
  original_memories: string[];
  timestamp: string;
  memories_from_system?: string[];
}

export interface HaluMemQuestion {
  answer: string;
  difficulty?: string;
  evidence: Array<{ memory_content: string }>;
  question: string;
  question_type?: string;
  context?: string;
  search_duration_ms?: number;
  system_response?: string;
}

export interface HaluMemSession {
  dialogue: HaluMemDialogueTurn[];
  memory_points: HaluMemMemoryPoint[];
  questions?: HaluMemQuestion[];
  start_time: string;
}

export interface HaluMemUser {
  persona_info: string;
  sessions: HaluMemSession[];
  uuid: string;
}

export interface SimpleVectorDocument {
  id: string;
  text: string;
}

export interface SimpleVectorSearchResult extends SimpleVectorDocument {
  score: number;
}

export interface SimpleVectorMemory {
  add(documents: readonly SimpleVectorDocument[]): Promise<void>;
  search(query: string, topK: number): Promise<SimpleVectorSearchResult[]>;
}

export interface HaluMemOfficialMetrics {
  executionFailures: number;
  extractionF1: number;
  questionAnsweringAccuracy: number;
  updateAccuracy: number;
}

export interface HaluMemComparisonResult {
  baseline: HaluMemOfficialMetrics;
  failures: string[];
  goodmemory: HaluMemOfficialMetrics;
  status: "failed" | "passed";
}

export interface HaluMemProfileAdapter {
  ingest(session: HaluMemSession): Promise<{
    durationMs: number;
    extractedMemories: string[];
  }>;
  search(input: {
    purpose: "memory_update" | "question_answering";
    query: string;
  }): Promise<{
    durationMs: number;
    memories: string[];
  }>;
}

export interface HaluMemAdapterSession extends HaluMemSession {
  add_dialogue_duration_ms: number;
  extracted_memories: string[];
}

export interface HaluMemAdapterUser {
  sessions: HaluMemAdapterSession[];
  user_name: string;
  uuid: string;
}

export interface HaluMemReanswerResult {
  answerOperations: number;
  user: HaluMemAdapterUser;
}

export function selectHaluMemSlice(
  user: HaluMemUser,
  sessionIndexes: readonly number[],
): HaluMemUser {
  const indexes = [...new Set(sessionIndexes)].sort((left, right) => left - right);
  const sessions = indexes.map((index) => {
    const session = user.sessions[index];
    if (!session) {
      throw new Error(`HaluMem session index ${index} is outside the source user.`);
    }
    return session;
  });
  return { ...user, sessions };
}

export function normalizeHaluMemJudgeContent(content: string): string {
  const trimmed = content.trim();
  if (/^```json\s/iu.test(trimmed)) {
    return content;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? `\`\`\`json\n${trimmed}\n\`\`\``
      : content;
  } catch {
    return content;
  }
}

export function createSimpleVectorMemory(
  embedding: EmbeddingAdapter,
): SimpleVectorMemory {
  const documents: Array<SimpleVectorDocument & { index: number; vector: number[] }> = [];
  return {
    async add(newDocuments) {
      const vectors = await embedding.embed(newDocuments.map(({ text }) => text));
      for (const [index, document] of newDocuments.entries()) {
        const vector = vectors[index];
        if (!vector) {
          throw new Error("Simple vector baseline returned fewer embeddings than documents.");
        }
        documents.push({ ...document, index: documents.length, vector });
      }
    },
    async search(query, topK) {
      const [queryVector] = await embedding.embed([query]);
      if (!queryVector) {
        throw new Error("Simple vector baseline returned no query embedding.");
      }
      return documents
        .map((document) => ({
          id: document.id,
          index: document.index,
          score: cosineSimilarity(queryVector, document.vector),
          text: document.text,
        }))
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, topK)
        .map(({ id, score, text }) => ({ id, score, text }));
    },
  };
}

export async function runHaluMemProfile(input: {
  adapter: HaluMemProfileAdapter;
  answer: (input: { context: string; question: string }) => Promise<string>;
  user: HaluMemUser;
  userName: string;
}): Promise<HaluMemAdapterUser> {
  const sessions: HaluMemAdapterSession[] = [];
  for (const sourceSession of input.user.sessions) {
    const ingested = await input.adapter.ingest(sourceSession);
    const memoryPoints = sourceSession.memory_points.map((memory) => ({
      ...memory,
      original_memories: [...memory.original_memories],
    }));
    for (const memory of memoryPoints) {
      if (memory.is_update !== "True" || memory.original_memories.length === 0) {
        continue;
      }
      const search = await input.adapter.search({
        purpose: "memory_update",
        query: memory.memory_content,
      });
      if (search.memories.length > 0) {
        memory.memories_from_system = search.memories;
      }
    }
    const questions: HaluMemQuestion[] | undefined = sourceSession.questions
      ? []
      : undefined;
    for (const question of sourceSession.questions ?? []) {
      const search = await input.adapter.search({
        purpose: "question_answering",
        query: question.question,
      });
      const context = search.memories.join("\n");
      questions!.push({
        ...question,
        evidence: question.evidence.map((evidence) => ({ ...evidence })),
        context,
        search_duration_ms: search.durationMs,
        system_response: await input.answer({
          context,
          question: question.question,
        }),
      });
    }
    sessions.push({
      ...sourceSession,
      dialogue: sourceSession.dialogue.map((turn) => ({ ...turn })),
      memory_points: memoryPoints,
      ...(questions ? { questions } : {}),
      add_dialogue_duration_ms: ingested.durationMs,
      extracted_memories: ingested.extractedMemories,
    });
  }
  return {
    sessions,
    user_name: input.userName,
    uuid: input.user.uuid,
  };
}

export async function reanswerHaluMemProfile(input: {
  answer: (input: { context: string; question: string }) => Promise<string>;
  user: HaluMemAdapterUser;
}): Promise<HaluMemReanswerResult> {
  const user = structuredClone(input.user);
  let answerOperations = 0;
  for (const session of user.sessions) {
    for (const question of session.questions ?? []) {
      question.system_response = await input.answer({
        context: question.context ?? "",
        question: question.question,
      });
      answerOperations += 1;
    }
  }
  return { answerOperations, user };
}

export function readHaluMemOfficialMetrics(value: unknown): HaluMemOfficialMetrics {
  const overall = readRecord(readRecord(value, "root").overall_score, "overall_score");
  const accuracy = readRecord(overall.memory_accuracy, "memory_accuracy");
  const integrity = readRecord(overall.memory_integrity, "memory_integrity");
  const update = readRecord(overall.memory_update, "memory_update");
  const qa = readRecord(overall.question_answering, "question_answering");
  const counts = [
    [readNumber(accuracy.memory_num, "memory_accuracy.memory_num"), readNumber(accuracy.memory_valid_num, "memory_accuracy.memory_valid_num")],
    [readNumber(integrity.memory_num, "memory_integrity.memory_num"), readNumber(integrity.memory_valid_num, "memory_integrity.memory_valid_num")],
    [readNumber(update.update_memory_num, "memory_update.update_memory_num"), readNumber(update.update_memory_valid_num, "memory_update.update_memory_valid_num")],
    [readNumber(qa.qa_num, "question_answering.qa_num"), readNumber(qa.qa_valid_num, "question_answering.qa_valid_num")],
  ] as const;
  return {
    executionFailures: counts.reduce(
      (sum, [total, valid]) => sum + Math.max(0, total - valid),
      0,
    ),
    extractionF1: readNumber(overall.memory_extraction_f1, "memory_extraction_f1"),
    questionAnsweringAccuracy: readNumber(
      qa["correct_qa_ratio(all)"],
      "question_answering.correct_qa_ratio(all)",
    ),
    updateAccuracy: readNumber(
      update["correct_update_memory_ratio(all)"],
      "memory_update.correct_update_memory_ratio(all)",
    ),
  };
}

export function evaluateHaluMemComparison(input: {
  baseline: HaluMemOfficialMetrics;
  goodmemory: HaluMemOfficialMetrics;
}): HaluMemComparisonResult {
  const failures: string[] = [];
  if (input.baseline.executionFailures !== 0 || input.goodmemory.executionFailures !== 0) {
    failures.push("HaluMem judge executionFailures must be 0");
  }
  if (!beatsBaselineOrMatchesCeiling(
    input.goodmemory.extractionF1,
    input.baseline.extractionF1,
  )) {
    failures.push("GoodMemory must beat the vector baseline on memory extraction");
  }
  if (!beatsBaselineOrMatchesCeiling(
    input.goodmemory.updateAccuracy,
    input.baseline.updateAccuracy,
  )) {
    failures.push("GoodMemory must beat the vector baseline on memory update");
  }
  if (
    !beatsBaselineOrMatchesCeiling(
      input.goodmemory.questionAnsweringAccuracy,
      input.baseline.questionAnsweringAccuracy,
    )
  ) {
    failures.push("GoodMemory must beat the vector baseline on question answering");
  }
  return {
    ...input,
    failures,
    status: failures.length === 0 ? "passed" : "failed",
  };
}

function beatsBaselineOrMatchesCeiling(
  candidate: number,
  baseline: number,
): boolean {
  return candidate > baseline || (candidate === 1 && baseline === 1);
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  return leftNorm === 0 || rightNorm === 0
    ? 0
    : dot / Math.sqrt(leftNorm * rightNorm);
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`HaluMem official result is missing ${label}.`);
  }
  return value as Record<string, unknown>;
}

function readNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`HaluMem official result has invalid ${label}.`);
  }
  return value;
}
