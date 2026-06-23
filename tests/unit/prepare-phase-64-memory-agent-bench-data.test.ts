import { describe, expect, it } from "bun:test";
import {
  buildPhase64MabRowsUrl,
  parsePhase64MabPrepareCliOptions,
  preparePhase64MemoryAgentBenchData,
} from "../../scripts/prepare-phase-64-memory-agent-bench-data";

// A tiny synthetic event_qa row (no upstream data vendored): two questions over
// a three-event ordering sequence. event 1 = previous_events[0]; the gold next
// events are answers[i][0].
function buildEventQaRowsResponse() {
  return {
    num_rows_total: 22,
    partial: false,
    rows: [
      {
        row: {
          answers: [["B happens"], ["C happens"]],
          context: "the long source story text...",
          metadata: {
            previous_events: ["1. A happens.\n", "1. A happens.\n2. B happens.\n"],
            qa_pair_ids: ["eventqa_full_no0", "eventqa_full_no1"],
            source: "eventqa_full",
          },
          questions: [
            'Already occurred:\n1. A happens.\nNext from ["B happens","Z happens"]?',
            'Already occurred:\n1. A happens.\n2. B happens.\nNext from ["C happens","Y happens"]?',
          ],
        },
        row_idx: 5,
        truncated_cells: [],
      },
    ],
  };
}

describe("prepare-phase-64 MemoryAgentBench data script", () => {
  it("parses competency, offset, max-questions, and merge flags", () => {
    expect(
      parsePhase64MabPrepareCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-64-memory-agent-bench-data.ts",
        "--competency",
        "AR",
        "--offset",
        "5",
        "--max-questions",
        "20",
        "--merge",
        "--output-root",
        "/tmp/MAB",
      ]),
    ).toEqual({
      competency: "AR",
      dataset: "ai-hyz/MemoryAgentBench",
      maxQuestions: 20,
      merge: true,
      offset: 5,
      outputRoot: "/tmp/MAB",
    });
  });

  it("defaults AR to the eventqa_full row (offset 5), all questions, no merge", () => {
    expect(
      parsePhase64MabPrepareCliOptions([
        "bun",
        "run",
        "scripts/prepare-phase-64-memory-agent-bench-data.ts",
        "--output-root",
        "/tmp/MAB",
      ]),
    ).toEqual({
      competency: "AR",
      dataset: "ai-hyz/MemoryAgentBench",
      maxQuestions: null,
      merge: false,
      offset: 5,
      outputRoot: "/tmp/MAB",
    });
  });

  it("rejects an unknown competency", () => {
    expect(() =>
      parsePhase64MabPrepareCliOptions([
        "bun",
        "run",
        "x",
        "--competency",
        "XX",
      ]),
    ).toThrow("--competency must be one of");
  });

  it("builds the Hugging Face rows endpoint URL for a competency split", () => {
    expect(
      buildPhase64MabRowsUrl({
        dataset: "ai-hyz/MemoryAgentBench",
        length: 1,
        offset: 5,
        split: "Accurate_Retrieval",
      }),
    ).toBe(
      "https://datasets-server.huggingface.co/rows?dataset=ai-hyz%2FMemoryAgentBench&config=default&split=Accurate_Retrieval&offset=5&length=1",
    );
  });

  it("normalizes an event_qa row into the smoke cases.json contract", async () => {
    const writes = new Map<string, string>();
    const result = await preparePhase64MemoryAgentBenchData(
      {
        competency: "AR",
        dataset: "ai-hyz/MemoryAgentBench",
        maxQuestions: null,
        merge: false,
        offset: 5,
        outputRoot: "/tmp/MAB",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-06-23T00:00:00.000Z"),
        requestJson: async (url) => {
          expect(url).toContain("split=Accurate_Retrieval");
          expect(url).toContain("offset=5");
          return buildEventQaRowsResponse();
        },
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(result.casesFile).toBe("/tmp/MAB/cases.json");
    expect(result.competency).toBe("AR");
    expect(result.sourceDataset).toBe("eventqa_full");
    expect(result.caseId).toBe("ar_eventqa_full");
    expect(result.chunkCount).toBe(3);
    expect(result.questionCount).toBe(2);
    expect(result.totalQuestionsAvailable).toBe(2);
    expect(result.totalCasesWritten).toBe(1);

    const parsed = JSON.parse(writes.get("/tmp/MAB/cases.json") ?? "{}");
    expect(parsed.cases).toHaveLength(1);
    const testCase = parsed.cases[0];
    // event 1 from previous_events[0] (number prefix stripped); events 2/3 from answers.
    expect(testCase.chunks).toEqual([
      { content: "A happens.", id: 1, role: "user" },
      { content: "B happens", id: 2, role: "user" },
      { content: "C happens", id: 3, role: "user" },
    ]);
    // question i's gold evidence is the NEXT-event chunk (id i+2), by construction.
    expect(testCase.questions[0]).toMatchObject({
      competency: "AR",
      evidenceChunkIds: [2],
      goldAnswer: "B happens",
      matchMode: "substring_exact_match",
      questionId: "eventqa_full_no0",
      staleChunkIds: [],
    });
    expect(testCase.questions[1]).toMatchObject({
      evidenceChunkIds: [3],
      goldAnswer: "C happens",
      questionId: "eventqa_full_no1",
    });
    expect(writes.has("/tmp/MAB/phase-64-mab-export-metadata.json")).toBe(true);
    const metadata = JSON.parse(
      writes.get("/tmp/MAB/phase-64-mab-export-metadata.json") ?? "{}",
    );
    expect(metadata.upstreamLicense).toBe("MIT");
  });

  it("caps questions with --max-questions and keeps only the needed event chunks", async () => {
    const writes = new Map<string, string>();
    const result = await preparePhase64MemoryAgentBenchData(
      {
        competency: "AR",
        dataset: "ai-hyz/MemoryAgentBench",
        maxQuestions: 1,
        merge: false,
        offset: 5,
        outputRoot: "/tmp/MAB",
      },
      {
        mkdir: async () => undefined,
        requestJson: async () => buildEventQaRowsResponse(),
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );
    expect(result.questionCount).toBe(1);
    expect(result.chunkCount).toBe(2); // seed event + 1 gold next event
    expect(result.totalQuestionsAvailable).toBe(2);
    const parsed = JSON.parse(writes.get("/tmp/MAB/cases.json") ?? "{}");
    expect(parsed.cases[0].questions).toHaveLength(1);
    expect(parsed.cases[0].chunks).toHaveLength(2);
  });

  it("merges by replacing same-competency cases while retaining others", async () => {
    const writes = new Map<string, string>();
    const existing = {
      cases: [
        { caseId: "cr_existing", chunks: [], competency: "CR", questions: [], sourceDataset: "fact_sh" },
        { caseId: "ar_stale", chunks: [], competency: "AR", questions: [], sourceDataset: "old" },
      ],
    };
    await preparePhase64MemoryAgentBenchData(
      {
        competency: "AR",
        dataset: "ai-hyz/MemoryAgentBench",
        maxQuestions: null,
        merge: true,
        offset: 5,
        outputRoot: "/tmp/MAB",
      },
      {
        mkdir: async () => undefined,
        readFile: async () => JSON.stringify(existing),
        requestJson: async () => buildEventQaRowsResponse(),
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );
    const parsed = JSON.parse(writes.get("/tmp/MAB/cases.json") ?? "{}");
    const ids = parsed.cases.map((c: { caseId: string }) => c.caseId);
    expect(ids).toContain("cr_existing"); // other competency retained
    expect(ids).not.toContain("ar_stale"); // stale AR replaced
    expect(ids).toContain("ar_eventqa_full"); // fresh AR added
    expect(parsed.cases).toHaveLength(2);
  });

  it("overwrites (does not merge) by default", async () => {
    const writes = new Map<string, string>();
    let readCount = 0;
    await preparePhase64MemoryAgentBenchData(
      {
        competency: "AR",
        dataset: "ai-hyz/MemoryAgentBench",
        maxQuestions: null,
        merge: false,
        offset: 5,
        outputRoot: "/tmp/MAB",
      },
      {
        mkdir: async () => undefined,
        readFile: async () => {
          readCount += 1;
          return '{"cases":[{"caseId":"cr_existing","competency":"CR","chunks":[],"questions":[],"sourceDataset":"x"}]}';
        },
        requestJson: async () => buildEventQaRowsResponse(),
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );
    expect(readCount).toBe(0); // no read in overwrite mode
    const parsed = JSON.parse(writes.get("/tmp/MAB/cases.json") ?? "{}");
    expect(parsed.cases).toHaveLength(1);
    expect(parsed.cases[0].caseId).toBe("ar_eventqa_full");
  });

  it("rejects a row whose consumed cell was truncated by the rows endpoint", async () => {
    await expect(
      preparePhase64MemoryAgentBenchData(
        {
          competency: "AR",
          dataset: "ai-hyz/MemoryAgentBench",
          maxQuestions: null,
          merge: false,
          offset: 5,
          outputRoot: "/tmp/MAB",
        },
        {
          mkdir: async () => undefined,
          requestJson: async () => ({
            ...buildEventQaRowsResponse(),
            rows: [
              {
                ...buildEventQaRowsResponse().rows[0],
                truncated_cells: ["metadata"],
              },
            ],
          }),
          writeFile: async () => undefined,
        },
      ),
    ).rejects.toThrow("truncated");
  });

  it("rejects an empty rows response (offset out of range)", async () => {
    await expect(
      preparePhase64MemoryAgentBenchData(
        {
          competency: "AR",
          dataset: "ai-hyz/MemoryAgentBench",
          maxQuestions: null,
          merge: false,
          offset: 999,
          outputRoot: "/tmp/MAB",
        },
        {
          mkdir: async () => undefined,
          requestJson: async () => ({ rows: [] }),
          writeFile: async () => undefined,
        },
      ),
    ).rejects.toThrow("empty");
  });

  it("throws a clear not-implemented error for non-AR competencies", async () => {
    await expect(
      preparePhase64MemoryAgentBenchData(
        {
          competency: "CR",
          dataset: "ai-hyz/MemoryAgentBench",
          maxQuestions: null,
          merge: false,
          offset: 0,
          outputRoot: "/tmp/MAB",
        },
        {
          mkdir: async () => undefined,
          requestJson: async () => buildEventQaRowsResponse(),
          writeFile: async () => undefined,
        },
      ),
    ).rejects.toThrow("not implemented yet");
  });
});
