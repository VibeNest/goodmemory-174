import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import type { LocomoCase } from "../../src/eval/locomo";
import {
  buildLocomoScope,
  collectLocomoRetrievedTurnIds,
  loadLocomoCases,
  LOCOMO_SMOKE_REPORT_FILE_NAME,
  parseLocomoSmokeCliOptions,
  runLocomoSmoke,
  scoreLocomoRetrieval,
  summarizeLocomoRetrieval,
  type LocomoQuestionRetrieval,
} from "../../scripts/run-phase-65-locomo-smoke";

function category(
  report: Awaited<ReturnType<typeof runLocomoSmoke>>,
  name: string,
) {
  const entry = report.categories.find((item) => item.category === name);
  if (!entry) {
    throw new Error(`category not found in report: ${name}`);
  }
  return entry;
}

describe("phase-65 LoCoMo smoke adapter", () => {
  it("parses smoke cli flags and rejects a non-positive limit", () => {
    expect(
      parseLocomoSmokeCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-smoke.ts",
        "--benchmark-root",
        "/tmp/LOCOMO",
        "--run-id",
        "run-locomo",
        "--output-dir",
        "/tmp/out",
        "--limit",
        "2",
      ]),
    ).toEqual({
      benchmarkRoot: "/tmp/LOCOMO",
      evidencePack: false,
      limit: 2,
      live: false,
      outputDir: "/tmp/out",
      runId: "run-locomo",
    });

    expect(() =>
      parseLocomoSmokeCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-smoke.ts",
        "--limit",
        "0",
      ]),
    ).toThrow("--limit must be a positive integer.");
  });

  it("loads synthetic cases by default and normalized cases from an external root", async () => {
    const synthetic = await loadLocomoCases({
      readFile: async () => {
        throw new Error("must not read files for the synthetic default");
      },
    });
    expect(synthetic.benchmarkSource).toBe("synthetic-smoke");
    expect(synthetic.cases.length).toBeGreaterThan(0);

    const externalCase: LocomoCase = {
      caseId: "external-single-hop",
      sourceConversation: "external-conversation-1",
      speakers: ["Caroline", "Melanie"],
      turns: [
        { diaId: "D1:1", speaker: "Caroline", content: "The vault code is 7788." },
      ],
      questions: [
        {
          questionId: "external-single-hop:1",
          category: "single_hop",
          question: "What is the vault code?",
          goldAnswer: "7788",
          matchMode: "f1_token_overlap",
          evidenceTurnIds: ["D1:1"],
          adversarialAnswer: null,
        },
      ],
    };
    const external = await loadLocomoCases({
      benchmarkRoot: "/tmp/LOCOMO",
      readFile: async (path) => {
        expect(path).toBe(join("/tmp/LOCOMO", "cases.json"));
        return JSON.stringify({ cases: [externalCase] });
      },
    });
    expect(external.benchmarkSource).toBe(join("/tmp/LOCOMO", "cases.json"));
    expect(external.cases).toEqual([externalCase]);
  });

  it("rejects an external root whose payload is not a normalized case array", async () => {
    await expect(
      loadLocomoCases({
        benchmarkRoot: "/tmp/LOCOMO",
        readFile: async () => JSON.stringify({ cases: [{ caseId: "broken" }] }),
      }),
    ).rejects.toThrow("is not a normalized case");
  });

  it("scores evidence recall, missing evidence, and noise from retrieved dia_ids", () => {
    const fullyRetrieved = scoreLocomoRetrieval({
      question: {
        questionId: "q1",
        category: "multi_hop",
        question: "which city?",
        goldAnswer: "Seattle",
        matchMode: "f1_token_overlap",
        evidenceTurnIds: ["D1:1", "D3:1"],
        adversarialAnswer: null,
      },
      retrievedTurnIds: ["D1:1", "D1:2", "D3:1"],
      testCase: { caseId: "c1" } as LocomoCase,
    });
    expect(fullyRetrieved.evidenceRecall).toBe(1);
    expect(fullyRetrieved.goldEvidenceFullyRetrieved).toBe(true);
    expect(fullyRetrieved.missingEvidenceTurnIds).toEqual([]);
    // Evidence turns D1:1/D3:1 are excluded from noise; only D1:2 is noise.
    expect(fullyRetrieved.noiseTurnCount).toBe(1);
    expect(fullyRetrieved.noiseTurnIds).toEqual(["D1:2"]);

    const partial = scoreLocomoRetrieval({
      question: {
        questionId: "q2",
        category: "multi_hop",
        question: "which city?",
        goldAnswer: "Seattle",
        matchMode: "f1_token_overlap",
        evidenceTurnIds: ["D1:1", "D3:1"],
        adversarialAnswer: null,
      },
      retrievedTurnIds: ["D1:1"],
      testCase: { caseId: "c1" } as LocomoCase,
    });
    expect(partial.evidenceRecall).toBe(0.5);
    expect(partial.goldEvidenceFullyRetrieved).toBe(false);
    expect(partial.missingEvidenceTurnIds).toEqual(["D3:1"]);
    expect(partial.noiseTurnCount).toBe(0);
    expect(partial.noiseTurnIds).toEqual([]);
  });

  it("summarizes per-category retrieval with multi-hop cross-session readiness", () => {
    const results: LocomoQuestionRetrieval[] = [
      {
        answerCorrect: null,
        caseId: "multi",
        category: "multi_hop",
        evidenceRecall: 1,
        evidenceTurnIds: ["D1:1", "D3:1"],
        generatedAnswer: null,
        goldEvidenceFullyRetrieved: true,
        missingEvidenceTurnIds: [],
        noiseTurnCount: 2,
        noiseTurnIds: ["D1:2", "D2:1"],
        questionId: "multi:1",
        retrievedTurnIds: ["D1:1", "D1:2", "D2:1", "D3:1"],
      },
    ];
    const summary = summarizeLocomoRetrieval(results);

    const multi = summary.find((entry) => entry.category === "multi_hop");
    expect(multi?.crossSessionChainReady).toBe(true);
    expect(multi?.answeredCount).toBe(0);
    expect(multi?.averageEvidenceRecall).toBe(1);
    expect(multi?.noiseTurnTotal).toBe(2);
    expect(multi?.answerAccuracy).toBeNull();

    // Non-multi-hop categories never report cross-session readiness.
    const single = summary.find((entry) => entry.category === "single_hop");
    expect(single?.crossSessionChainReady).toBeNull();
    // Empty buckets report 0, never NaN.
    expect(single?.questionCount).toBe(0);
    expect(single?.averageEvidenceRecall).toBe(0);
  });

  it("builds a stable scope per case", () => {
    expect(
      buildLocomoScope({ caseId: "single-hop-dog", runId: "run-locomo" }),
    ).toEqual({
      agentId: "phase-65-locomo-smoke",
      sessionId: "case-single-hop-dog",
      userId: "locomo:single-hop-dog",
      workspaceId: "phase-65-locomo:run-locomo",
    });
  });

  it("ignores non-array recall sections when collecting dia_ids", () => {
    expect(
      collectLocomoRetrievedTurnIds({
        facts: [
          {
            content: "[LOCOMO dia_id=D2:4 speaker=Caroline] hi",
            tags: ["dia_id:D2:4"],
          },
        ],
        preferences: "not-an-array",
      } as never),
    ).toEqual(["D2:4"]);
  });

  it("runs the synthetic smoke deterministically with full evidence recall", async () => {
    const writes: Array<{ contents: string; path: string }> = [];
    const report = await runLocomoSmoke(
      { runId: "run-locomo-smoke-test", outputDir: "/tmp/locomo-out" },
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
    expect(report.caseCount).toBe(5);
    expect(report.questionCount).toBe(5);

    // Provenance/contract header fields.
    expect(report.phase).toBe("phase-65");
    expect(report.benchmark).toBe("locomo");
    expect(report.license).toBe("CC BY-NC 4.0");
    expect(report.externalRoot).toBeNull();
    expect(report.profilesCompared).toEqual(["goodmemory-rules-only"]);
    expect(report.upstreamSource).toContain("locomo");
    expect(report.upstreamAnswerMetricByCategory).toEqual({
      single_hop: "f1_token_overlap",
      multi_hop: "f1_token_overlap",
      temporal: "f1_token_overlap",
      open_domain: "f1_token_overlap",
      adversarial: "adversarial_abstention",
    });

    // The adapter surfaces the gold evidence for every QA category.
    for (const name of [
      "single_hop",
      "multi_hop",
      "temporal",
      "open_domain",
      "adversarial",
    ]) {
      const entry = category(report, name);
      expect(entry.averageEvidenceRecall).toBe(1);
      expect(entry.fullyRetrievedCount).toBe(1);
      expect(entry.questionCount).toBe(1);
    }

    // Multi-hop: both sessions' evidence is retrieved, so cross-session
    // composition is recall-ready (and other categories report null).
    expect(category(report, "multi_hop").crossSessionChainReady).toBe(true);
    expect(category(report, "single_hop").crossSessionChainReady).toBeNull();

    // Current retrieval-breadth (noise) baseline for the tiny synthetic cases.
    expect(category(report, "single_hop").noiseTurnTotal).toBe(1);
    expect(category(report, "multi_hop").noiseTurnTotal).toBe(0);
    expect(category(report, "temporal").noiseTurnTotal).toBe(0);
    expect(category(report, "open_domain").noiseTurnTotal).toBe(1);
    expect(category(report, "adversarial").noiseTurnTotal).toBe(1);

    // The report is written under the run directory.
    expect(writes.length).toBe(1);
    expect(writes[0]?.path).toBe(
      join(
        "/tmp/locomo-out",
        "run-locomo-smoke-test",
        LOCOMO_SMOKE_REPORT_FILE_NAME,
      ),
    );
    expect(JSON.parse(writes[0]?.contents ?? "{}").runId).toBe(
      "run-locomo-smoke-test",
    );
  });

  it("scores answer accuracy in live-answer mode and resists the adversarial bait", async () => {
    // A perfect generator answers every question with its gold value.
    const perfect = await runLocomoSmoke(
      { runId: "run-locomo-live", outputDir: "/tmp/locomo-out" },
      {
        answerGenerator: async ({ question }) => question.goldAnswer,
        mkdir: async () => undefined,
        writeFile: (async () => undefined) as never,
      },
    );

    expect(perfect.mode).toBe("live-answer");
    expect(perfect.answerEvaluation).toBe("scored");
    for (const name of [
      "single_hop",
      "multi_hop",
      "temporal",
      "open_domain",
      "adversarial",
    ]) {
      const entry = category(perfect, name);
      expect(entry.answeredCount).toBe(1);
      expect(entry.answerAccuracy).toBe(1);
    }
    const single = perfect.cases.find(
      (entry) => entry.category === "single_hop",
    );
    expect(single?.answerCorrect).toBe(true);
    expect(single?.generatedAnswer).toBe("Pepper");

    // A generator that takes the adversarial bait ("Yes") fails adversarial only.
    const baited = await runLocomoSmoke(
      { runId: "run-locomo-live-baited", outputDir: "/tmp/locomo-out" },
      {
        answerGenerator: async ({ question }) =>
          question.category === "adversarial"
            ? (question.adversarialAnswer ?? "Yes")
            : question.goldAnswer,
        mkdir: async () => undefined,
        writeFile: (async () => undefined) as never,
      },
    );
    expect(category(baited, "adversarial").answerAccuracy).toBe(0);
    expect(category(baited, "single_hop").answerAccuracy).toBe(1);
  });
});
