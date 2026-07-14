import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { buildLocomoSmokeCases } from "../../src/eval/locomo";
import { assertLocomoReportQuestionCountMatchesCases } from "../../scripts/locomo-report-compatibility";
import {
  buildLocomoUnionLiveReport,
  buildLocomoUnionLiveAnswerSystem,
  formatLocomoUnionSeedFailure,
  formatLocomoUnionQuestionAttempt,
  formatLocomoUnionQuestionRetry,
  parseLocomoUnionLiveCliOptions,
} from "../../scripts/measure-locomo-union-live";

describe("LoCoMo union live measurement", () => {
  it("writes a canonical report contract with source and retrieval lineage", () => {
    const testCase = buildLocomoSmokeCases()[0]!;
    const question = testCase.questions[0]!;
    const report = buildLocomoUnionLiveReport({
      answerAttempts: 2,
      answerTimeoutMs: 45_000,
      benchmarkFingerprint: "sha256-fixture",
      benchmarkRoot: "/tmp/LOCOMO",
      benchmarkSource: "/tmp/LOCOMO/cases.json",
      cases: [testCase],
      concurrency: 2,
      executionFailures: 0,
      generatedAt: "2026-07-13T12:00:00.000Z",
      noMemory: false,
      results: [
        {
          answerCorrect: true,
          answerTokenF1: 1,
          caseId: testCase.caseId,
          category: question.category,
          evidenceRecall: 1,
          evidenceTurnIds: [...question.evidenceTurnIds],
          generatedAnswer: question.goldAnswer,
          goldEvidenceFullyRetrieved: true,
          missingEvidenceTurnIds: [],
          noiseTurnCount: 0,
          noiseTurnIds: [],
          questionId: question.questionId,
          retrievedTurnIds: [...question.evidenceTurnIds],
        },
      ],
      resume: true,
      runDirectory: "/tmp/out/union-live",
      runId: "union-live",
      union: {
        maxAdditions: 8,
        minSimilarity: 0.3,
        topK: 16,
      },
      withExtraction: true,
    });

    expect(report).toMatchObject({
      answerContextMode: "evidence-pack",
      answerEvaluation: "scored",
      benchmarkFingerprint: "sha256-fixture",
      benchmarkSource: "/tmp/LOCOMO/cases.json",
      externalRoot: "/tmp/LOCOMO",
      generatedBy: "scripts/measure-locomo-union-live.ts",
      ingestMode: "conversational-extraction",
      license: "CC BY-NC 4.0",
      profilesCompared: ["goodmemory-semantic-union"],
      semanticCandidateEmbeddingSource: "provider",
      semanticCandidates: {
        enabled: true,
        maxAdditions: 8,
        minRelativeScore: null,
        minSimilarity: 0.3,
        topK: 16,
      },
      upstreamSource: "https://github.com/snap-research/locomo",
    });
    expect(() =>
      assertLocomoReportQuestionCountMatchesCases({
        path: "/tmp/out/union-live/union-live-report.json",
        report,
      }),
    ).not.toThrow();
  });

  it("adds relative-time guidance only for temporal questions", () => {
    const temporal = buildLocomoUnionLiveAnswerSystem("temporal");
    const adversarial = buildLocomoUnionLiveAnswerSystem("adversarial");

    expect(temporal).toContain("preserve the relative time relationship");
    expect(temporal).toContain("week- or weekend-level relationship");
    expect(temporal).toContain("month- or year-level relative references");
    expect(adversarial).not.toContain("preserve the relative time relationship");
    expect(adversarial).toContain("reply exactly: No information available");
  });

  it("surfaces the case and provider error when seeding fails", () => {
    expect(
      formatLocomoUnionSeedFailure({
        caseId: "locomo-conv-26",
        error: new Error("embedding provider rejected the request"),
        pendingQuestionCount: 199,
      }),
    ).toBe(
      "[union-live] case seed failed (locomo-conv-26, 199 pending questions): Error: embedding provider rejected the request\n",
    );
  });

  it("identifies slow question attempts without logging conversation text", () => {
    expect(
      formatLocomoUnionQuestionAttempt({
        attempt: 1,
        caseId: "locomo-conv-26",
        maxAttempts: 2,
        questionId: "conv-26:q42",
      }),
    ).toBe(
      "[union-live] answering locomo-conv-26/conv-26:q42 (attempt 1/2)\n",
    );
    expect(
      formatLocomoUnionQuestionRetry({
        attempt: 1,
        caseId: "locomo-conv-26",
        error: new Error("request timed out"),
        maxAttempts: 2,
        questionId: "conv-26:q42",
      }),
    ).toBe(
      "[union-live] retrying locomo-conv-26/conv-26:q42 after attempt 1/2: Error: request timed out\n",
    );
  });

  it("parses live union scope and budget flags with strict numeric validation", () => {
    expect(
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--benchmark-root",
          "/tmp/LOCOMO-full",
          "--union-topk",
          "32",
          "--max-additions",
          "0",
          "--min-similarity",
          "0.8",
          "--limit",
          "12",
          "--concurrency",
          "2",
          "--answer-attempts",
          "2",
          "--answer-timeout-ms",
          "45000",
          "--output-dir",
          "/tmp/out",
          "--run-id",
          "union-live",
          "--resume",
          "--with-extraction",
          "--no-memory",
        ],
        "/repo",
      ),
    ).toEqual({
      benchmarkRoot: "/tmp/LOCOMO-full",
      answerAttempts: 2,
      answerTimeoutMs: 45000,
      concurrency: 2,
      limit: 12,
      maxAdditions: 0,
      minSimilarity: 0.8,
      noMemory: true,
      outputDir: "/tmp/out",
      resume: true,
      runId: "union-live",
      topK: 32,
      withExtraction: true,
    });

    expect(
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
        ],
        "/repo",
      ),
    ).toMatchObject({
      answerAttempts: 2,
      answerTimeoutMs: 60000,
      concurrency: 1,
      outputDir: join(
        "/repo",
        "reports",
        "eval",
        "research",
        "phase-65",
        "locomo",
      ),
      runId: "run-locomo-union16-live",
      topK: 16,
    });

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--resume",
          "--resume",
        ],
        "/repo",
      ),
    ).toThrow("--resume cannot be specified more than once.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--with-extraction",
          "--with-extraction",
        ],
        "/repo",
      ),
    ).toThrow("--with-extraction cannot be specified more than once.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--union-topk",
          "1e2",
        ],
        "/repo",
      ),
    ).toThrow("--union-topk must be a positive integer.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--max-additions",
          "1.5",
        ],
        "/repo",
      ),
    ).toThrow("--max-additions must be a non-negative integer.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--min-similarity",
          "8e-1",
        ],
        "/repo",
      ),
    ).toThrow("--min-similarity must be a non-negative number.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--concurrency",
          "0",
        ],
        "/repo",
      ),
    ).toThrow("--concurrency must be a positive integer.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--answer-attempts",
          "0",
        ],
        "/repo",
      ),
    ).toThrow("--answer-attempts must be a positive integer.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--answer-timeout-ms",
          "1e3",
        ],
        "/repo",
      ),
    ).toThrow("--answer-timeout-ms must be a positive integer.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--limit",
          "--resume",
        ],
        "/repo",
      ),
    ).toThrow("--limit requires a value.");
  });

  it("rejects missing string flag values before falling back to defaults", () => {
    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--benchmark-root",
          "--union-topk",
          "16",
        ],
        "/repo",
      ),
    ).toThrow("--benchmark-root requires a value.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--output-dir",
          "--run-id",
          "union-live",
        ],
        "/repo",
      ),
    ).toThrow("--output-dir requires a value.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--run-id",
          "--resume",
        ],
        "/repo",
      ),
    ).toThrow("--run-id requires a value.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--run-id",
          "../outside-locomo",
        ],
        "/repo",
      ),
    ).toThrow("--run-id must be a single path segment.");
  });

  it("rejects empty or whitespace-padded LoCoMo root environment values", () => {
    const original = process.env.GOODMEMORY_LOCOMO_ROOT;
    try {
      process.env.GOODMEMORY_LOCOMO_ROOT = "/tmp/LOCOMO-env";
      expect(
        parseLocomoUnionLiveCliOptions(
          [
            "bun",
            "run",
            "scripts/measure-locomo-union-live.ts",
          ],
          "/repo",
        ).benchmarkRoot,
      ).toBe("/tmp/LOCOMO-env");

      expect(
        parseLocomoUnionLiveCliOptions(
          [
            "bun",
            "run",
            "scripts/measure-locomo-union-live.ts",
            "--benchmark-root",
            "/tmp/LOCOMO-cli",
          ],
          "/repo",
        ).benchmarkRoot,
      ).toBe("/tmp/LOCOMO-cli");

      process.env.GOODMEMORY_LOCOMO_ROOT = " /tmp/LOCOMO-env ";
      expect(() =>
        parseLocomoUnionLiveCliOptions(
          [
            "bun",
            "run",
            "scripts/measure-locomo-union-live.ts",
          ],
          "/repo",
        ),
      ).toThrow("GOODMEMORY_LOCOMO_ROOT cannot be empty or whitespace-padded.");

      process.env.GOODMEMORY_LOCOMO_ROOT = "";
      expect(() =>
        parseLocomoUnionLiveCliOptions(
          [
            "bun",
            "run",
            "scripts/measure-locomo-union-live.ts",
          ],
          "/repo",
        ),
      ).toThrow("GOODMEMORY_LOCOMO_ROOT cannot be empty or whitespace-padded.");
    } finally {
      if (original === undefined) {
        delete process.env.GOODMEMORY_LOCOMO_ROOT;
      } else {
        process.env.GOODMEMORY_LOCOMO_ROOT = original;
      }
    }
  });
});
