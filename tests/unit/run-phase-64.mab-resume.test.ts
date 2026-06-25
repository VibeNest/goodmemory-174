import { describe, expect, it } from "bun:test";
import {
  createMemoryAgentBenchSmokeMemory,
  runMemoryAgentBenchSmoke,
} from "../../scripts/run-phase-64-memory-agent-bench-smoke";

// In-memory file store so the progress JSONL append/read can be exercised without
// touching disk.
function fileStore() {
  const files = new Map<string, string>();
  return {
    appendFile: async (path: string, data: string) => {
      files.set(path, (files.get(path) ?? "") + data);
    },
    files,
    readFile: async (path: string) => {
      const value = files.get(path);
      if (value === undefined) {
        throw new Error(`ENOENT ${path}`);
      }
      return value;
    },
  };
}

describe("MAB smoke resume", () => {
  it("retries only the failed question on a --resume pass and reaches executionFailures 0", async () => {
    const store = fileStore();
    let failTtl = true;
    const deps = {
      answerGenerator: async ({ question }: { question: { competency: string; goldAnswer: string } }) => {
        if (question.competency === "TTL" && failTtl) {
          throw new Error("simulated transient failure");
        }
        return question.goldAnswer;
      },
      appendFile: store.appendFile,
      createMemory: createMemoryAgentBenchSmokeMemory,
      mkdir: async () => undefined,
      readFile: store.readFile,
      writeFile: (async () => undefined) as never,
    };
    const options = { live: true, outputDir: "/tmp/mab-resume", resume: true, runId: "r1" };

    // Pass 1: TTL fails, the other three competencies succeed.
    const first = await runMemoryAgentBenchSmoke(options, deps);
    expect(first.executionFailures).toBe(1);
    expect(first.resumed).toBe(true);
    const ttlFirst = first.cases.find((c) => c.competency === "TTL");
    expect(ttlFirst).toBeUndefined();

    // Pass 2: resume loads the 3 cached successes and re-runs only TTL.
    failTtl = false;
    const second = await runMemoryAgentBenchSmoke(options, deps);
    expect(second.executionFailures).toBe(0);
    expect(second.cases.find((c) => c.competency === "TTL")?.answerCorrect).toBe(true);
    // every competency now present
    expect(new Set(second.cases.map((c) => c.competency)).size).toBe(4);
  });
});

describe("MAB no-memory baseline", () => {
  it("answers with an empty memory context when --no-memory is set", async () => {
    const seenContexts: string[] = [];
    const report = await runMemoryAgentBenchSmoke(
      { live: true, noMemory: true, outputDir: "/tmp/mab-nomem", runId: "b1" },
      {
        answerGenerator: async ({ memoryContext, question }) => {
          seenContexts.push(memoryContext);
          return question.goldAnswer;
        },
        appendFile: async () => undefined,
        createMemory: createMemoryAgentBenchSmokeMemory,
        mkdir: async () => undefined,
        writeFile: (async () => undefined) as never,
      },
    );
    expect(report.noMemoryBaseline).toBe(true);
    expect(seenContexts.length).toBeGreaterThan(0);
    expect(seenContexts.every((ctx) => ctx === "")).toBe(true);
  });
});
