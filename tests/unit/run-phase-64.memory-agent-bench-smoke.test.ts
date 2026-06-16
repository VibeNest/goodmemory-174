import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import type { MemoryAgentBenchCase } from "../../src/eval/memoryAgentBench";
import {
  buildMemoryAgentBenchScope,
  collectMemoryAgentBenchRetrievedChunkIds,
  loadMemoryAgentBenchCases,
  MEMORY_AGENT_BENCH_SMOKE_REPORT_FILE_NAME,
  parseMemoryAgentBenchSmokeCliOptions,
  runMemoryAgentBenchSmoke,
  scoreMemoryAgentBenchRetrieval,
  summarizeMemoryAgentBenchRetrieval,
  type MemoryAgentBenchQuestionRetrieval,
} from "../../scripts/run-phase-64-memory-agent-bench-smoke";

function competency(
  report: Awaited<ReturnType<typeof runMemoryAgentBenchSmoke>>,
  name: string,
) {
  const entry = report.competencies.find((item) => item.competency === name);
  if (!entry) {
    throw new Error(`competency not found in report: ${name}`);
  }
  return entry;
}

describe("phase-64 MemoryAgentBench smoke adapter", () => {
  it("parses smoke cli flags and rejects a non-positive limit", () => {
    expect(
      parseMemoryAgentBenchSmokeCliOptions([
        "bun",
        "run",
        "scripts/run-phase-64-memory-agent-bench-smoke.ts",
        "--benchmark-root",
        "/tmp/MAB",
        "--run-id",
        "run-mab",
        "--output-dir",
        "/tmp/out",
        "--limit",
        "2",
      ]),
    ).toEqual({
      benchmarkRoot: "/tmp/MAB",
      limit: 2,
      outputDir: "/tmp/out",
      runId: "run-mab",
    });

    expect(() =>
      parseMemoryAgentBenchSmokeCliOptions([
        "bun",
        "run",
        "scripts/run-phase-64-memory-agent-bench-smoke.ts",
        "--limit",
        "0",
      ]),
    ).toThrow("--limit must be a positive integer.");
  });

  it("loads synthetic cases by default and normalized cases from an external root", async () => {
    const synthetic = await loadMemoryAgentBenchCases({
      readFile: async () => {
        throw new Error("must not read files for the synthetic default");
      },
    });
    expect(synthetic.benchmarkSource).toBe("synthetic-smoke");
    expect(synthetic.cases.length).toBeGreaterThan(0);

    const externalCase: MemoryAgentBenchCase = {
      caseId: "external-ar",
      competency: "AR",
      sourceDataset: "external-event_qa",
      chunks: [{ id: 1, role: "user", content: "The vault code is 7788." }],
      questions: [
        {
          questionId: "external-ar:1",
          competency: "AR",
          question: "What is the vault code?",
          goldAnswer: "7788",
          matchMode: "substring_exact_match",
          evidenceChunkIds: [1],
          staleChunkIds: [],
        },
      ],
    };
    const external = await loadMemoryAgentBenchCases({
      benchmarkRoot: "/tmp/MAB",
      readFile: async (path) => {
        expect(path).toBe(join("/tmp/MAB", "cases.json"));
        return JSON.stringify({ cases: [externalCase] });
      },
    });
    expect(external.benchmarkSource).toBe(join("/tmp/MAB", "cases.json"));
    expect(external.cases).toEqual([externalCase]);
  });

  it("rejects an external root whose payload is not a normalized case array", async () => {
    await expect(
      loadMemoryAgentBenchCases({
        benchmarkRoot: "/tmp/MAB",
        readFile: async () => JSON.stringify({ cases: [{ caseId: "broken" }] }),
      }),
    ).rejects.toThrow("is not a normalized case");
  });

  it("scores evidence recall, noise, and stale selection from retrieved ids", () => {
    const fullyRetrieved = scoreMemoryAgentBenchRetrieval({
      question: {
        questionId: "q1",
        competency: "LRU",
        question: "who holds it?",
        goldAnswer: "Carol",
        matchMode: "exact_match",
        evidenceChunkIds: [3, 5],
        staleChunkIds: [1],
      },
      retrievedChunkIds: [1, 2, 3, 5],
      testCase: { caseId: "c1" } as MemoryAgentBenchCase,
    });
    expect(fullyRetrieved.evidenceRecall).toBe(1);
    expect(fullyRetrieved.goldEvidenceFullyRetrieved).toBe(true);
    expect(fullyRetrieved.missingEvidenceChunkIds).toEqual([]);
    // Stale chunk 1 and evidence chunks 3/5 are excluded from noise; only 2 is noise.
    expect(fullyRetrieved.noiseChunkCount).toBe(1);
    expect(fullyRetrieved.noiseChunkIds).toEqual([2]);
    expect(fullyRetrieved.staleChunkSelected).toBe(true);

    const partial = scoreMemoryAgentBenchRetrieval({
      question: {
        questionId: "q2",
        competency: "LRU",
        question: "who holds it?",
        goldAnswer: "Carol",
        matchMode: "exact_match",
        evidenceChunkIds: [3, 5],
        staleChunkIds: [1],
      },
      retrievedChunkIds: [3],
      testCase: { caseId: "c1" } as MemoryAgentBenchCase,
    });
    expect(partial.evidenceRecall).toBe(0.5);
    expect(partial.goldEvidenceFullyRetrieved).toBe(false);
    expect(partial.missingEvidenceChunkIds).toEqual([5]);
    expect(partial.noiseChunkCount).toBe(0);
    expect(partial.noiseChunkIds).toEqual([]);
    expect(partial.staleChunkSelected).toBe(false);
  });

  it("summarizes per-competency retrieval with TTL action-policy readiness", () => {
    const results: MemoryAgentBenchQuestionRetrieval[] = [
      {
        answerCorrect: null,
        caseId: "ttl",
        competency: "TTL",
        evidenceChunkIds: [1],
        evidenceRecall: 1,
        generatedAnswer: null,
        goldEvidenceFullyRetrieved: true,
        missingEvidenceChunkIds: [],
        noiseChunkCount: 2,
        noiseChunkIds: [2, 3],
        questionId: "ttl:1",
        retrievedChunkIds: [1, 2, 3],
        staleChunkIds: [],
        staleChunkSelected: false,
      },
    ];
    const summary = summarizeMemoryAgentBenchRetrieval(results);

    const ttl = summary.find((entry) => entry.competency === "TTL");
    expect(ttl?.actionPolicyTransferReady).toBe(true);
    expect(ttl?.answeredCount).toBe(0);
    expect(ttl?.averageEvidenceRecall).toBe(1);
    expect(ttl?.noiseChunkTotal).toBe(2);
    expect(ttl?.answerAccuracy).toBeNull();

    // Non-TTL competencies never report action-policy readiness.
    const ar = summary.find((entry) => entry.competency === "AR");
    expect(ar?.actionPolicyTransferReady).toBeNull();
    // Empty buckets report 0, never NaN.
    expect(ar?.questionCount).toBe(0);
    expect(ar?.averageEvidenceRecall).toBe(0);
  });

  it("builds a stable scope per case", () => {
    expect(
      buildMemoryAgentBenchScope({ caseId: "ar", runId: "run-mab" }),
    ).toEqual({
      agentId: "phase-64-memory-agent-bench-smoke",
      sessionId: "case-ar",
      userId: "mab:ar",
      workspaceId: "phase-64-mab:run-mab",
    });
  });

  it("ignores non-array recall sections when collecting chunk ids", () => {
    expect(
      collectMemoryAgentBenchRetrievedChunkIds({
        facts: [
          { content: "[MAB chunk_id=5 role=user] hi", tags: ["chunk_id:5"] },
        ],
        preferences: "not-an-array",
      } as never),
    ).toEqual([5]);
  });

  it("runs the synthetic smoke deterministically and surfaces the conflict-resolution gap", async () => {
    const writes: Array<{ contents: string; path: string }> = [];
    const report = await runMemoryAgentBenchSmoke(
      { runId: "run-mab-smoke-test", outputDir: "/tmp/mab-out" },
      {
        mkdir: async () => undefined,
        writeFile: (async (path: string, contents: string) => {
          writes.push({ contents, path });
        }) as never,
      },
    );

    expect(report.mode).toBe("retrieval-only");
    expect(report.answerEvaluation).toBe("deferred-to-live-mode");
    expect(report.benchmarkSource).toBe("synthetic-smoke");
    expect(report.executionFailures).toBe(0);
    expect(report.caseCount).toBe(4);
    expect(report.questionCount).toBe(4);

    // Provenance/contract header fields required by the Phase 64 breakdown board.
    expect(report.phase).toBe("phase-64");
    expect(report.benchmark).toBe("memoryagentbench");
    expect(report.license).toBe("MIT");
    expect(report.externalRoot).toBeNull();
    expect(report.profilesCompared).toEqual(["goodmemory-rules-only"]);
    expect(report.upstreamSource).toContain("MemoryAgentBench");
    expect(report.upstreamAnswerMetricByCompetency).toEqual({
      AR: "substring_exact_match",
      CR: "substring_exact_match",
      LRU: "exact_match",
      TTL: "exact_match",
    });

    // The adapter surfaces the gold evidence for every competency.
    for (const name of ["AR", "TTL", "LRU", "CR"]) {
      const entry = competency(report, name);
      expect(entry.averageEvidenceRecall).toBe(1);
      expect(entry.fullyRetrievedCount).toBe(1);
      expect(entry.questionCount).toBe(1);
    }

    // Conflict resolution: rules-only recall still pulls the superseded value,
    // so the stale counter is the measured Phase 64 gap (target for repair).
    expect(competency(report, "CR").staleSelectedCount).toBe(1);
    expect(competency(report, "AR").staleSelectedCount).toBe(0);

    // Test-time learning: the taught rule is retrievable.
    expect(competency(report, "TTL").actionPolicyTransferReady).toBe(true);

    // Current retrieval-breadth (noise) baseline for the tiny synthetic cases.
    expect(competency(report, "AR").noiseChunkTotal).toBe(2);
    expect(competency(report, "TTL").noiseChunkTotal).toBe(1);
    expect(competency(report, "LRU").noiseChunkTotal).toBe(3);
    expect(competency(report, "CR").noiseChunkTotal).toBe(1);

    // The report is written under the run directory.
    expect(writes.length).toBe(1);
    expect(writes[0]?.path).toBe(
      join(
        "/tmp/mab-out",
        "run-mab-smoke-test",
        MEMORY_AGENT_BENCH_SMOKE_REPORT_FILE_NAME,
      ),
    );
    expect(JSON.parse(writes[0]?.contents ?? "{}").runId).toBe(
      "run-mab-smoke-test",
    );
  });

  it("scores answer accuracy in live-answer mode and proves CR passes on the current value despite stale history", async () => {
    // A perfect generator answers every question with its gold value.
    const perfect = await runMemoryAgentBenchSmoke(
      { runId: "run-mab-live", outputDir: "/tmp/mab-out" },
      {
        answerGenerator: async ({ question }) => question.goldAnswer,
        mkdir: async () => undefined,
        writeFile: (async () => undefined) as never,
      },
    );

    expect(perfect.mode).toBe("live-answer");
    expect(perfect.answerEvaluation).toBe("scored");
    for (const name of ["AR", "TTL", "LRU", "CR"]) {
      const entry = competency(perfect, name);
      expect(entry.answeredCount).toBe(1);
      expect(entry.answerAccuracy).toBe(1);
    }
    // The CR reframe: the stale $5,000 chunk is still retrieved (history), but
    // the competency PASSES because the answer uses the current value.
    expect(competency(perfect, "CR").staleSelectedCount).toBe(1);
    expect(competency(perfect, "CR").answerAccuracy).toBe(1);
    const cr = perfect.cases.find((entry) => entry.competency === "CR");
    expect(cr?.answerCorrect).toBe(true);
    expect(cr?.generatedAnswer).toBe("$8,000");

    // A generator that answers CR with the superseded value fails CR only.
    const stale = await runMemoryAgentBenchSmoke(
      { runId: "run-mab-live-stale", outputDir: "/tmp/mab-out" },
      {
        answerGenerator: async ({ question }) =>
          question.competency === "CR"
            ? "The travel budget is $5,000."
            : question.goldAnswer,
        mkdir: async () => undefined,
        writeFile: (async () => undefined) as never,
      },
    );
    expect(competency(stale, "CR").answerAccuracy).toBe(0);
    expect(competency(stale, "AR").answerAccuracy).toBe(1);
  });
});
