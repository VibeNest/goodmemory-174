import { describe, expect, it } from "bun:test";

import {
  createSimpleVectorMemory,
  evaluateHaluMemComparison,
  normalizeHaluMemJudgeContent,
  readHaluMemOfficialMetrics,
  reanswerHaluMemProfile,
  runHaluMemProfile,
  selectHaluMemSlice,
  type HaluMemUser,
} from "../../scripts/phase-72-halumem";

const USER: HaluMemUser = {
  persona_info: "User's name is Test User",
  sessions: [
    {
      dialogue: [{ content: "Alpha lives in Rome", role: "user", timestamp: "t0" }],
      memory_points: [],
      questions: [],
      start_time: "t0",
    },
    {
      dialogue: [{ content: "Beta lives in Paris", role: "user", timestamp: "t1" }],
      memory_points: [],
      questions: [],
      start_time: "t1",
    },
    {
      dialogue: [{ content: "Gamma lives in Tokyo", role: "user", timestamp: "t2" }],
      memory_points: [],
      questions: [],
      start_time: "t2",
    },
  ],
  uuid: "user-1",
};

function officialResult(input: {
  extraction: number;
  update: number;
  qa: number;
  invalid?: number;
}) {
  const invalid = input.invalid ?? 0;
  return {
    overall_score: {
      memory_accuracy: {
        memory_num: 10,
        memory_valid_num: 10 - invalid,
      },
      memory_extraction_f1: input.extraction,
      memory_integrity: {
        memory_num: 12,
        memory_valid_num: 12 - invalid,
      },
      memory_update: {
        "correct_update_memory_ratio(all)": input.update,
        update_memory_num: 4,
        update_memory_valid_num: 4 - invalid,
      },
      question_answering: {
        "correct_qa_ratio(all)": input.qa,
        qa_num: 6,
        qa_valid_num: 6 - invalid,
      },
    },
  };
}

describe("Phase 72 HaluMem adapter", () => {
  it("normalizes only valid raw JSON for the upstream fenced parser", () => {
    expect(normalizeHaluMemJudgeContent('{"score":"2"}')).toBe(
      '```json\n{"score":"2"}\n```',
    );
    expect(normalizeHaluMemJudgeContent('```json\n{"score":"2"}\n```')).toBe(
      '```json\n{"score":"2"}\n```',
    );
    expect(normalizeHaluMemJudgeContent("not json")).toBe("not json");
    expect(normalizeHaluMemJudgeContent("[1,2]")).toBe("[1,2]");
  });

  it("selects the frozen sessions in source chronology", () => {
    const slice = selectHaluMemSlice(USER, [2, 0]);

    expect(slice.sessions.map((session) => session.start_time)).toEqual(["t0", "t2"]);
    expect(() => selectHaluMemSlice(USER, [3])).toThrow("session index 3");
  });

  it("retrieves a stable top-k from the simple vector baseline", async () => {
    const vector = createSimpleVectorMemory({
      embed: async (texts) => texts.map((text) => [
        text.toLowerCase().includes("rome") ? 1 : 0,
        text.toLowerCase().includes("paris") ? 1 : 0,
      ]),
    });
    await vector.add([
      { id: "rome", text: "Alpha lives in Rome" },
      { id: "paris", text: "Beta lives in Paris" },
      { id: "tie", text: "Another Rome note" },
    ]);

    expect((await vector.search("Where is Rome?", 2)).map(({ id }) => id)).toEqual([
      "rome",
      "tie",
    ]);
  });

  it("emits the upstream adapter shape without mutating source data", async () => {
    const source = structuredClone(USER);
    source.sessions[0]!.memory_points = [{
      importance: 1,
      is_update: "True",
      memory_content: "Alpha now lives in Milan",
      memory_source: "secondary",
      memory_type: "Persona Memory",
      original_memories: ["Alpha lives in Rome"],
      timestamp: "t0",
    }];
    source.sessions[0]!.questions = [{
      answer: "Milan",
      evidence: [{ memory_content: "Alpha now lives in Milan" }],
      question: "Where does Alpha live?",
    }];

    const searches: Array<{ purpose: string; query: string }> = [];
    const result = await runHaluMemProfile({
      adapter: {
        async ingest(session) {
          return { durationMs: 3, extractedMemories: [`stored:${session.start_time}`] };
        },
        async search(search) {
          searches.push(search);
          return { durationMs: 2, memories: [`found:${search.query}`] };
        },
      },
      answer: async ({ context, question }) => `${question} via ${context}`,
      user: source,
      userName: "Alpha",
    });

    expect(result.sessions[0]).toMatchObject({
      add_dialogue_duration_ms: 3,
      extracted_memories: ["stored:t0"],
      memory_points: [{ memories_from_system: ["found:Alpha now lives in Milan"] }],
      questions: [{
        context: "found:Where does Alpha live?",
        search_duration_ms: 2,
        system_response:
          "Where does Alpha live? via found:Where does Alpha live?",
      }],
    });
    expect(searches).toEqual([
      { purpose: "memory_update", query: "Alpha now lives in Milan" },
      { purpose: "question_answering", query: "Where does Alpha live?" },
    ]);
    expect(USER.sessions[0]!.memory_points).toEqual([]);
  });

  it("reanswers stored contexts without mutating retrieval artifacts", async () => {
    const source = structuredClone(USER);
    source.sessions[0]!.questions = [{
      answer: "Milan",
      context: "Alpha lives in Milan.",
      evidence: [{ memory_content: "Alpha lives in Milan" }],
      question: "Where does Alpha live?",
      system_response: "old answer",
    }];
    const adapted = {
      ...source,
      sessions: source.sessions.map((session) => ({
        ...session,
        add_dialogue_duration_ms: 3,
        extracted_memories: ["stored memory"],
      })),
      user_name: "Alpha",
    };

    const result = await reanswerHaluMemProfile({
      answer: async ({ context, question }) => `${question} via ${context}`,
      user: adapted,
    });

    expect(result.answerOperations).toBe(1);
    expect(result.user.sessions[0]!.questions?.[0]).toMatchObject({
      context: "Alpha lives in Milan.",
      system_response: "Where does Alpha live? via Alpha lives in Milan.",
    });
    expect(result.user.sessions[0]!.extracted_memories).toEqual(["stored memory"]);
    expect(adapted.sessions[0]!.questions?.[0]?.system_response).toBe("old answer");
  });

  it("reads all three official metrics and counts invalid judge rows", () => {
    expect(readHaluMemOfficialMetrics(officialResult({
      extraction: 0.7,
      invalid: 1,
      qa: 0.8,
      update: 0.6,
    }))).toEqual({
      executionFailures: 4,
      extractionF1: 0.7,
      questionAnsweringAccuracy: 0.8,
      updateAccuracy: 0.6,
    });
  });

  it("requires GoodMemory to beat the baseline unless both reach the metric ceiling", () => {
    const passed = evaluateHaluMemComparison({
      baseline: readHaluMemOfficialMetrics(officialResult({
        extraction: 0.4,
        qa: 0.45,
        update: 0.3,
      })),
      goodmemory: readHaluMemOfficialMetrics(officialResult({
        extraction: 0.52,
        qa: 0.61,
        update: 0.48,
      })),
    });
    expect(passed).toMatchObject({ status: "passed", failures: [] });

    const blocked = evaluateHaluMemComparison({
      baseline: passed.baseline,
      goodmemory: {
        ...passed.goodmemory,
        executionFailures: 1,
        updateAccuracy: passed.baseline.updateAccuracy,
      },
    });
    expect(blocked.status).toBe("failed");
    expect(blocked.failures).toContain("HaluMem judge executionFailures must be 0");
    expect(blocked.failures).toContain("GoodMemory must beat the vector baseline on memory update");

    const ceilingTie = evaluateHaluMemComparison({
      baseline: { ...passed.baseline, questionAnsweringAccuracy: 1 },
      goodmemory: { ...passed.goodmemory, questionAnsweringAccuracy: 1 },
    });
    expect(ceilingTie.status).toBe("passed");

    const belowCeilingTie = evaluateHaluMemComparison({
      baseline: { ...passed.baseline, questionAnsweringAccuracy: 0.8 },
      goodmemory: { ...passed.goodmemory, questionAnsweringAccuracy: 0.8 },
    });
    expect(belowCeilingTie.failures).toContain(
      "GoodMemory must beat the vector baseline on question answering",
    );
  });
});
