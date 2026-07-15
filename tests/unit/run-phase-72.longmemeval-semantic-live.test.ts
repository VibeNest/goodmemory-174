import { describe, expect, it } from "bun:test";

import {
  collectPhase72LongMemEvalExecutionFailureIds,
  parsePhase72LongMemEvalSemanticLiveOptions,
  resolvePhase72LongMemEvalSemanticCaseScope,
  resolvePhase72LongMemEvalSemanticLiveModels,
} from "../../scripts/run-phase-72-longmemeval-semantic-live";
import type { LongMemEvalReport } from "../../src/eval/longmemeval";

const LIVE_ENV = {
  GOODMEMORY_EMBEDDING_API_KEY: "embedding-key",
  GOODMEMORY_EMBEDDING_BASE_URL: "https://openrouter.ai/api/v1",
  GOODMEMORY_EMBEDDING_MODEL: "text-embedding-3-small",
  GOODMEMORY_EMBEDDING_PROVIDER: "openai",
  GOODMEMORY_EVAL_API_KEY: "eval-key",
  GOODMEMORY_EVAL_BASE_URL: "https://ai.gurkiai.com/v1",
  GOODMEMORY_EVAL_MODEL: "gpt-5.6-terra",
  GOODMEMORY_EVAL_PROVIDER: "openai",
  GOODMEMORY_JUDGE_API_KEY: "judge-key",
  GOODMEMORY_JUDGE_BASE_URL: "https://ai.gurkiai.com/v1",
  GOODMEMORY_JUDGE_MODEL: "gpt-5.5",
  GOODMEMORY_JUDGE_PROVIDER: "openai",
} as const;

describe("Phase 72 LongMemEval semantic live runner", () => {
  it("defaults the fixed answer slice to 40-way concurrency", () => {
    expect(parsePhase72LongMemEvalSemanticLiveOptions([
      "bun",
      "run-phase-72-longmemeval-semantic-live.ts",
    ], "/repo", "/cache")).toEqual({
      allCases: false,
      assistedExtraction: false,
      benchmarkRoot: "/cache/LongMemEval",
      denseSessionAugmentation: false,
      denseSessionAugmentationLimit: 2,
      maxConcurrency: 40,
      outputDir: "/repo/reports/eval/research/phase-72/longmemeval",
      rerank: false,
      runId: "run-phase72-longmemeval-semantic-live-slice-v1",
      selectionFile:
        "/repo/scripts/eval-profiles/phase-72/longmemeval-semantic-recall-selection.json",
      supplementalEvidenceLimit: 6,
      supplementalEvidencePerSessionLimit: 2,
    });
  });

  it("supports a disclosed full-500 run", () => {
    expect(parsePhase72LongMemEvalSemanticLiveOptions([
      "bun",
      "run-phase-72-longmemeval-semantic-live.ts",
      "--all-cases",
      "--max-concurrency",
      "20",
    ], "/repo", "/cache")).toMatchObject({
      allCases: true,
      maxConcurrency: 20,
    });
  });

  it("supports an explicit provider-reranked arm", () => {
    expect(parsePhase72LongMemEvalSemanticLiveOptions([
      "bun",
      "run-phase-72-longmemeval-semantic-live.ts",
      "--rerank",
    ], "/repo", "/cache")).toMatchObject({
      rerank: true,
    });
  });

  it("supports a disclosed retrieved-session dense evidence arm", () => {
    expect(parsePhase72LongMemEvalSemanticLiveOptions([
      "bun",
      "run-phase-72-longmemeval-semantic-live.ts",
      "--dense-session-augmentation",
      "--dense-session-augmentation-limit",
      "3",
    ], "/repo", "/cache")).toMatchObject({
      denseSessionAugmentation: true,
      denseSessionAugmentationLimit: 3,
      maxConcurrency: 40,
    });
  });

  it("supports an explicit Terra conversational-extraction arm", () => {
    expect(parsePhase72LongMemEvalSemanticLiveOptions([
      "bun",
      "run-phase-72-longmemeval-semantic-live.ts",
      "--assisted-extraction",
    ], "/repo", "/cache")).toMatchObject({
      assistedExtraction: true,
    });
  });

  it("supports a disclosed expanded evidence-pack arm", () => {
    expect(parsePhase72LongMemEvalSemanticLiveOptions([
      "bun",
      "run-phase-72-longmemeval-semantic-live.ts",
      "--supplemental-evidence-limit",
      "12",
      "--supplemental-evidence-per-session-limit",
      "4",
    ], "/repo", "/cache")).toMatchObject({
      supplementalEvidenceLimit: 12,
      supplementalEvidencePerSessionLimit: 4,
    });
  });

  it("describes arbitrary frozen selections without hard-coding 64 cases", () => {
    expect(resolvePhase72LongMemEvalSemanticCaseScope({
      allCases: false,
    })).toBe("frozen-selection");
    expect(resolvePhase72LongMemEvalSemanticCaseScope({
      allCases: true,
    })).toBe("full-500");
    expect(resolvePhase72LongMemEvalSemanticCaseScope({
      allCases: false,
      retryReportPath: "/reports/source/report.json",
    })).toBe("execution-failure-retry");
  });

  it("supports retrying only execution failures from a prior report", () => {
    expect(parsePhase72LongMemEvalSemanticLiveOptions([
      "bun",
      "run-phase-72-longmemeval-semantic-live.ts",
      "--retry-report",
      "/reports/source/report.json",
      "--max-concurrency",
      "40",
    ], "/repo", "/cache")).toMatchObject({
      allCases: false,
      maxConcurrency: 40,
      retryReportPath: "/reports/source/report.json",
    });
  });

  it("rejects combining full-500 and failure-retry scopes", () => {
    expect(() => parsePhase72LongMemEvalSemanticLiveOptions([
      "bun",
      "run-phase-72-longmemeval-semantic-live.ts",
      "--all-cases",
      "--retry-report",
      "/reports/source/report.json",
    ], "/repo", "/cache")).toThrow("--all-cases");
  });

  it("extracts only execution-failure ids from a semantic source report", () => {
    const report = {
      phase: "phase-62",
      source: { benchmark: "LongMemEval" },
      profiles: {
        "goodmemory-recommended": {
          cases: [
            { questionId: "ok" },
            { executionError: { message: "timeout", stage: "memory_context" }, questionId: "retry" },
          ],
        },
      },
    } as LongMemEvalReport;

    expect(collectPhase72LongMemEvalExecutionFailureIds(report)).toEqual([
      "retry",
    ]);
  });

  it("requires failure retries to match the frozen benchmark fingerprint", () => {
    const report = {
      phase: "phase-62",
      source: { benchmark: "LongMemEval" },
      profiles: {
        "goodmemory-recommended": {
          cases: [
            { executionError: { message: "timeout", stage: "memory_context" }, questionId: "retry" },
          ],
        },
      },
    } as LongMemEvalReport;

    expect(() =>
      collectPhase72LongMemEvalExecutionFailureIds(report, "frozen-fingerprint")
    ).toThrow("frozen LongMemEval dataset");
    report.benchmarkFingerprint = "frozen-fingerprint";
    expect(
      collectPhase72LongMemEvalExecutionFailureIds(report, "frozen-fingerprint"),
    ).toEqual(["retry"]);
  });

  it("rejects failure retries whose retrieval configuration drifted", () => {
    const expectedRunConfiguration = {
      contextMaxTokens: 6_000,
      extractionStrategy: "rules-only",
      generalizedFusion: {
        maxCandidates: 180,
        maxTotalFacts: 40,
        minRelativeStrength: 0.2,
        rrfK: 60,
      },
      projection: {
        bulkBackfill: true,
        writeThrough: false,
      },
      providerEmbedding: true,
      recallStrategy: "hybrid",
    } as const;
    const report = {
      benchmarkFingerprint: "frozen-fingerprint",
      phase: "phase-62",
      runConfiguration: {
        ...expectedRunConfiguration,
        evidenceAugmentation: {
          maxAdditions: 1,
          strategy: "retrieved-session-dense",
        },
      },
      source: { benchmark: "LongMemEval" },
      profiles: {
        "goodmemory-recommended": {
          cases: [
            { executionError: { message: "timeout", stage: "memory_context" }, questionId: "retry" },
          ],
        },
      },
    } as LongMemEvalReport;

    expect(() => collectPhase72LongMemEvalExecutionFailureIds(
      report,
      "frozen-fingerprint",
      expectedRunConfiguration,
    )).toThrow("run configuration");
  });

  it("pins Terra answers and an independent gpt-5.5 judge", () => {
    const models = resolvePhase72LongMemEvalSemanticLiveModels(LIVE_ENV);
    expect(models).toEqual({
      answer: {
        gateway: "https://ai.gurkiai.com/v1",
        model: "gpt-5.6-terra",
        provider: "openai",
      },
      judge: {
        gateway: "https://ai.gurkiai.com/v1",
        model: "gpt-5.5",
        provider: "openai",
      },
    });
    expect(JSON.stringify(models)).not.toContain("eval-key");
    expect(JSON.stringify(models)).not.toContain("judge-key");
  });

  it("rejects answer-model self-judging", () => {
    expect(() => resolvePhase72LongMemEvalSemanticLiveModels({
      ...LIVE_ENV,
      GOODMEMORY_JUDGE_MODEL: "gpt-5.6-terra",
    })).toThrow("gpt-5.5");
  });
});
