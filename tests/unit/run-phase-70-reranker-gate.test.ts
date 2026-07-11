import { describe, expect, it } from "bun:test";

import {
  PHASE70_RERANKER_GATEWAY,
  PHASE70_RERANKER_MODEL,
  PHASE70_RERANKER_REQUEST_TIMEOUT_MS,
  collectPacketTurnIds,
  evaluatePhase70RerankerGate,
  parsePhase70SelectionManifest,
  resolvePhase70RerankerModel,
  runPhase70RerankerEval,
  summarizePhase70RerankerRows,
  type Phase70RerankerEvalReport,
} from "../../scripts/run-phase-70-reranker-eval";
import { buildPhase70FallbackProof } from "../../scripts/run-phase-70-gate";
import { selectPhase70RerankerSlice } from "../../scripts/select-phase-70-reranker-slice";

function row(input: {
  baselineEvidenceRecall?: number;
  baselineNoise?: number;
  candidateEvidenceRecall?: number;
  candidateNoise?: number;
  cohort: "protection" | "target";
  index: number;
}): Phase70RerankerEvalReport["rows"][number] {
  return {
    baseline: {
      contextTurnIds: ["D1:1", "D1:2"],
      evidenceRecall: input.baselineEvidenceRecall ?? 0.4,
      noiseTurnCount: input.baselineNoise ?? 4,
    },
    candidate: {
      contextTurnIds: ["D1:1", "D1:3"],
      evidenceRecall: input.candidateEvidenceRecall ?? 0.45,
      noiseTurnCount: input.candidateNoise ?? 3,
    },
    caseId: `case-${input.index}`,
    category: input.cohort === "target" ? "multi_hop" : "single_hop",
    cohort: input.cohort,
    evidenceTurnIds: ["D1:1"],
    membershipUnchanged: true,
    questionId: `q-${input.index}`,
    reranker: {
      candidateCount: 10,
      latencyMs: 25,
      scoreCount: 10,
      status: "applied",
    },
  };
}

function passingReport(): Phase70RerankerEvalReport {
  const rows = [
    ...Array.from({ length: 20 }, (_, index) =>
      row({ cohort: "target", index }),
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      row({
        baselineEvidenceRecall: 0.8,
        baselineNoise: 2,
        candidateEvidenceRecall: 0.8,
        candidateNoise: 2,
        cohort: "protection",
        index: index + 20,
      }),
    ),
  ];
  return {
    benchmark: "locomo",
    benchmarkFingerprint:
      "d134ede9c6e3371ca31f6b9769e3ceeeaebaacaebbc1a4d3548220e9887abc66",
    benchmarkSource: "/tmp/locomo/cases.json",
    executionFailures: 0,
    generatedAt: "2026-07-11T00:00:00.000Z",
    metric: "memory-packet-top-6",
    model: {
      gateway: PHASE70_RERANKER_GATEWAY,
      model: PHASE70_RERANKER_MODEL,
      provider: "openai",
      requestTimeoutMs: PHASE70_RERANKER_REQUEST_TIMEOUT_MS,
      role: "reranker",
    },
    rows,
    runId: "phase70-reranker-focused",
    selection: {
      manifestPath: "/tmp/phase70-selection.json",
      manifestSha256:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      protectionCount: 10,
      targetCount: 20,
    },
    summary: summarizePhase70RerankerRows(rows),
  };
}

describe("Phase 70 provider reranker gate", () => {
  it("runs the frozen dual-arm slice through the pointwise HTTP provider without persisting its key", async () => {
    const originalFetch = globalThis.fetch;
    const writes: string[] = [];
    globalThis.fetch = Object.assign(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                index: 0,
                message: { content: '{"score":0.8}', role: "assistant" },
              },
            ],
            id: "phase70-fake",
            model: PHASE70_RERANKER_MODEL,
            object: "chat.completion",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      { preconnect: originalFetch.preconnect },
    );
    try {
      const report = await runPhase70RerankerEval(
        {
          benchmarkRoot: "/tmp/locomo",
          outputDir: "/tmp/phase70-output",
          runId: "phase70-fake-provider",
          selectionManifest: "/tmp/phase70-selection.json",
        },
        {
          env: {
            GOODMEMORY_RERANKING_API_KEY: "must-not-persist",
            GOODMEMORY_RERANKING_BASE_URL: PHASE70_RERANKER_GATEWAY,
            GOODMEMORY_RERANKING_MODEL: PHASE70_RERANKER_MODEL,
            GOODMEMORY_RERANKING_PROVIDER: "openai",
          },
          loadCases: async () => ({
            benchmarkFingerprint:
              "d134ede9c6e3371ca31f6b9769e3ceeeaebaacaebbc1a4d3548220e9887abc66",
            benchmarkSource: "/tmp/locomo/cases.json",
            cases: [
              {
                caseId: "locomo-test",
                questions: [
                  {
                    adversarialAnswer: null,
                    category: "multi_hop",
                    evidenceTurnIds: ["D1:1"],
                    goldAnswer: "legal approval",
                    matchMode: "f1_token_overlap",
                    question: "What does the migration need?",
                    questionId: "target-q",
                  },
                  {
                    adversarialAnswer: null,
                    category: "single_hop",
                    evidenceTurnIds: ["D1:2"],
                    goldAnswer: "security review",
                    matchMode: "f1_token_overlap",
                    question: "What review does the migration need?",
                    questionId: "protection-q",
                  },
                ],
                sourceConversation: "test",
                speakers: ["A", "B"],
                turns: [
                  {
                    content: "The migration needs legal approval.",
                    diaId: "D1:1",
                    speaker: "A",
                  },
                  {
                    content: "The migration needs security review.",
                    diaId: "D1:2",
                    speaker: "B",
                  },
                  {
                    content: "The migration needs a rollback plan.",
                    diaId: "D1:3",
                    speaker: "A",
                  },
                ],
              },
            ],
          }),
          log: () => undefined,
          mkdir: async () => undefined,
          now: () => new Date("2026-07-11T00:00:00.000Z"),
          readFile: async () =>
            JSON.stringify({
              benchmarkFingerprint:
                "d134ede9c6e3371ca31f6b9769e3ceeeaebaacaebbc1a4d3548220e9887abc66",
              protectionQuestionIds: ["protection-q"],
              schemaVersion: 1,
              targetQuestionIds: ["target-q"],
            }),
          writeFile: async (_path, data) => {
            writes.push(String(data));
          },
        },
      );

      expect(report.rows).toHaveLength(2);
      expect(report.rows.every((entry) => entry.reranker.status === "applied")).toBe(
        true,
      );
      expect(JSON.stringify(report)).not.toContain("must-not-persist");
      expect(writes).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("selects target gaps without consulting candidate reranker results", () => {
    const diagnostics = [
      ...Array.from({ length: 14 }, (_, index) => ({
        candidateCount: 10,
        caseId: `case-${index % 4}`,
        category: "multi_hop" as const,
        fullEvidenceRecall: 1,
        packetEvidenceRecall: index < 12 ? 0.5 : 1,
        packetNoiseTurnCount: 4,
        questionId: `multi-${index}`,
      })),
      ...Array.from({ length: 14 }, (_, index) => ({
        candidateCount: 10,
        caseId: `case-${index % 4}`,
        category: "open_domain" as const,
        fullEvidenceRecall: 1,
        packetEvidenceRecall: index < 12 ? 0 : 1,
        packetNoiseTurnCount: 5,
        questionId: `open-${index}`,
      })),
      ...["adversarial", "single_hop", "temporal"].flatMap((category) =>
        Array.from({ length: 4 }, (_, index) => ({
          candidateCount: 8,
          caseId: `case-${index}`,
          category,
          fullEvidenceRecall: 1,
          packetEvidenceRecall: 1,
          packetNoiseTurnCount: 2,
          questionId: `${category}-${index}`,
        })),
      ),
    ];

    const selected = selectPhase70RerankerSlice(diagnostics);

    expect(selected.targetQuestionIds).toHaveLength(24);
    expect(selected.protectionQuestionIds).toHaveLength(12);
    expect(selected.targetQuestionIds).not.toContain("multi-13");
    expect(selected.protectionQuestionIds).toEqual([
      "adversarial-0",
      "adversarial-1",
      "adversarial-2",
      "adversarial-3",
      "single_hop-0",
      "single_hop-1",
      "single_hop-2",
      "single_hop-3",
      "temporal-0",
      "temporal-1",
      "temporal-2",
      "temporal-3",
    ]);
  });

  it("pins the focused runner to the Gurki gateway and gpt-5.6-terra", () => {
    expect(
      resolvePhase70RerankerModel({
        GOODMEMORY_RERANKING_API_KEY: "secret",
        GOODMEMORY_RERANKING_BASE_URL: `${PHASE70_RERANKER_GATEWAY}/`,
        GOODMEMORY_RERANKING_MODEL: PHASE70_RERANKER_MODEL,
        GOODMEMORY_RERANKING_PROVIDER: "openai",
      }),
    ).toEqual({
      apiKey: "secret",
      baseURL: PHASE70_RERANKER_GATEWAY,
      model: PHASE70_RERANKER_MODEL,
      provider: "openai",
      requestTimeoutMs: PHASE70_RERANKER_REQUEST_TIMEOUT_MS,
    });
    expect(() =>
      resolvePhase70RerankerModel({
        GOODMEMORY_RERANKING_API_KEY: "secret",
        GOODMEMORY_RERANKING_BASE_URL: PHASE70_RERANKER_GATEWAY,
        GOODMEMORY_RERANKING_MODEL: "gpt-5.5",
        GOODMEMORY_RERANKING_PROVIDER: "openai",
      }),
    ).toThrow(PHASE70_RERANKER_MODEL);
  });

  it("rejects overlapping or oversized focused selections", () => {
    expect(() =>
      parsePhase70SelectionManifest(
        JSON.stringify({
          benchmarkFingerprint:
            "d134ede9c6e3371ca31f6b9769e3ceeeaebaacaebbc1a4d3548220e9887abc66",
          protectionQuestionIds: ["q-1"],
          schemaVersion: 1,
          targetQuestionIds: ["q-1"],
        }),
      ),
    ).toThrow("overlap");
  });

  it("proves provider failure preserves the deterministic recall payload", async () => {
    const proof = await buildPhase70FallbackProof();

    expect(proof.status).toBe("fallback");
    expect(proof.fallbackReason).toBe("provider_error");
    expect(proof.fallbackResultDigest).toBe(proof.originalResultDigest);
  });

  it("extracts only packet-visible LoCoMo turn ids in stable order", () => {
    expect(
      collectPacketTurnIds({
        factSummary: [
          "- [LOCOMO dia_id=D2:3 speaker=Sam] first",
          "- [LOCOMO dia_id=D1:2 speaker=Alex] second",
          "- duplicate dia_id:D2:3",
        ].join("\n"),
      }),
    ).toEqual(["D2:3", "D1:2"]);
  });

  it("passes on a three-point context-evidence lift with stable protections", () => {
    const result = evaluatePhase70RerankerGate(passingReport(), {
      fallbackReason: "provider_error",
      fallbackResultDigest: "same",
      originalResultDigest: "same",
      status: "fallback",
    });

    expect(result.status).toBe("passed");
    expect(result.failures).toEqual([]);
    expect(result.target.evidenceRecallDelta).toBeCloseTo(0.05);
  });

  it("also passes when noise falls materially without losing evidence", () => {
    const report = passingReport();
    report.rows = report.rows.map((entry) =>
      entry.cohort === "target"
        ? {
            ...entry,
            candidate: {
              ...entry.candidate,
              evidenceRecall: entry.baseline.evidenceRecall,
              noiseTurnCount: 2,
            },
          }
        : entry,
    );
    report.summary = summarizePhase70RerankerRows(report.rows);

    expect(
      evaluatePhase70RerankerGate(report, {
        fallbackReason: "provider_error",
        fallbackResultDigest: "same",
        originalResultDigest: "same",
        status: "fallback",
      }).status,
    ).toBe("passed");
  });

  it("rejects skipped protection rows instead of accepting partial provider coverage", () => {
    const report = passingReport();
    const protectionIndex = report.rows.findIndex(
      (entry) => entry.cohort === "protection",
    );
    report.rows[protectionIndex] = {
      ...report.rows[protectionIndex]!,
      reranker: {
        candidateCount: 1,
        fallbackReason: "insufficient_candidates",
        latencyMs: 0,
        scoreCount: 0,
        status: "skipped",
      },
    };
    report.summary = summarizePhase70RerankerRows(report.rows);

    expect(
      evaluatePhase70RerankerGate(report, {
        fallbackReason: "provider_error",
        fallbackResultDigest: "same",
        originalResultDigest: "same",
        status: "fallback",
      }).failures,
    ).toContain("every focused row must apply provider reranking");
  });

  it("rejects the wrong model, provider fallbacks, weak lift, and protection regression", () => {
    const report = passingReport();
    report.model.model = "gpt-5.5";
    report.rows[0] = {
      ...report.rows[0]!,
      candidate: {
        ...report.rows[0]!.candidate,
        evidenceRecall: 0,
      },
      reranker: {
        candidateCount: 10,
        fallbackReason: "provider_error",
        latencyMs: 100,
        scoreCount: 0,
        status: "fallback",
      },
    };
    report.rows = report.rows.map((entry) =>
      entry.cohort === "target"
        ? {
            ...entry,
            candidate: {
              ...entry.candidate,
              evidenceRecall: entry.baseline.evidenceRecall,
              noiseTurnCount: entry.baseline.noiseTurnCount,
            },
          }
        : entry,
    );
    report.summary = summarizePhase70RerankerRows(report.rows);

    const result = evaluatePhase70RerankerGate(report, {
      fallbackReason: "provider_error",
      fallbackResultDigest: "changed",
      originalResultDigest: "original",
      status: "fallback",
    });

    expect(result.status).toBe("failed");
    expect(result.failures.some((failure) => failure.includes(PHASE70_RERANKER_MODEL))).toBe(
      true,
    );
    expect(result.failures.some((failure) => failure.includes("fallback"))).toBe(true);
    expect(result.failures.some((failure) => failure.includes("target"))).toBe(true);
    expect(result.failures.some((failure) => failure.includes("deterministic"))).toBe(
      true,
    );
  });
});
