import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertOfficialRescoreRunIdentityCompatible,
  assertOfficialRescoreSourceInputsOutsideOutputDir,
  buildOfficialRescoreRunIdentity,
  buildOfficialRescoreMetadata,
  buildOfficialRescoreScopeMetadata,
  buildOfficialRescoreSourceInputFingerprints,
  ensureOfficialRescoreRunIdentity,
  parseOfficialRescoreCliOptions,
  parseOfficialRescoreProgressLine,
  parseOfficialRescoreRubricProgressLine,
  requireOfficialRescoreCompleteJudging,
  readOfficialRescoreProgressRows,
  readOfficialRescoreRubricProgressRows,
  requireOfficialRescoreProgressRowsWithinSelection,
  requireOfficialRescoreRubricProgressRowsWithinSelection,
  resolveOfficialRescoreJudgeEnvironment,
} from "../../scripts/rescore-official-protocols";

describe("official protocol rescore CLI", () => {
  it("parses a canonical benchmark rescore command", () => {
    expect(
      parseOfficialRescoreCliOptions([
        "bun",
        "scripts/rescore-official-protocols.ts",
        "--benchmark",
        "locomo",
        "--report",
        "/reports/locomo/smoke-report.json",
        "--root",
        "/private/tmp/LOCOMO-full/cases.json",
        "--run-id",
        "locomo-official-rescore-current",
        "--concurrency",
        "2",
        "--limit",
        "25",
      ]),
    ).toEqual({
      benchmark: "locomo",
      concurrency: 2,
      limit: 25,
      reportPath: "/reports/locomo/smoke-report.json",
      rootPath: "/private/tmp/LOCOMO-full/cases.json",
      runId: "locomo-official-rescore-current",
    });
  });

  it("rejects ambiguous or unsafe rescore selectors", () => {
    expect(() =>
      parseOfficialRescoreCliOptions([
        "bun",
        "scripts/rescore-official-protocols.ts",
        "--benchmark",
        "beam",
        "--benchmark",
        "locomo",
      ]),
    ).toThrow("--benchmark cannot be specified more than once.");

    expect(() =>
      parseOfficialRescoreCliOptions([
        "bun",
        "scripts/rescore-official-protocols.ts",
        "--benchmark",
        "beam",
        "--run-id",
        "../beam-official",
      ]),
    ).toThrow("--run-id must be a single path segment.");

    expect(() =>
      parseOfficialRescoreCliOptions([
        "bun",
        "scripts/rescore-official-protocols.ts",
        "--benchmark",
        "longmemeval",
        "--limit",
        "1.5",
      ]),
    ).toThrow("--limit must be a positive integer.");

    expect(() =>
      parseOfficialRescoreCliOptions([
        "bun",
        "scripts/rescore-official-protocols.ts",
        "--benchmark",
        "unknown",
      ]),
    ).toThrow("--benchmark must be longmemeval, locomo, or beam.");
  });

  it("rejects benchmark-incompatible source selectors", () => {
    expect(() =>
      parseOfficialRescoreCliOptions([
        "bun",
        "scripts/rescore-official-protocols.ts",
        "--benchmark",
        "locomo",
        "--reference",
        "/tmp/longmemeval.json",
      ]),
    ).toThrow("--reference is only valid with --benchmark longmemeval.");

    expect(() =>
      parseOfficialRescoreCliOptions([
        "bun",
        "scripts/rescore-official-protocols.ts",
        "--benchmark",
        "beam",
        "--root",
        "/tmp/locomo/cases.json",
      ]),
    ).toThrow("--root is only valid with --benchmark locomo.");

    expect(() =>
      parseOfficialRescoreCliOptions([
        "bun",
        "scripts/rescore-official-protocols.ts",
        "--benchmark",
        "longmemeval",
        "--rubrics",
        "/tmp/beam/rubrics-by-question-id.json",
      ]),
    ).toThrow("--rubrics is only valid with --benchmark beam.");
  });

  it("rejects source inputs inside the official-rescore output run directory", () => {
    expect(() =>
      assertOfficialRescoreSourceInputsOutsideOutputDir({
        outputDir:
          "/repo/reports/eval/research/official-rescore/locomo-official-current",
        sourceInputs: {
          reportPath:
            "/repo/reports/eval/research/official-rescore/locomo-official-current/source-report.json",
          rootPath: "/private/tmp/LOCOMO-full/cases.json",
        },
      }),
    ).toThrow(
      "official rescore source input reportPath resolves inside output run directory",
    );

    expect(() =>
      assertOfficialRescoreSourceInputsOutsideOutputDir({
        outputDir:
          "/repo/reports/eval/research/official-rescore/beam-official-current",
        sourceInputs: {
          reportPath: "/repo/reports/eval/live/beam-report.json",
          rubricsPath:
            "/repo/reports/eval/research/official-rescore/beam-official-current",
        },
      }),
    ).toThrow(
      "official rescore source input rubricsPath resolves inside output run directory",
    );
  });

  it("requires canonical judge environment before rescore identity creation", () => {
    expect(() =>
      resolveOfficialRescoreJudgeEnvironment({
        GOODMEMORY_JUDGE_API_KEY: "key",
        GOODMEMORY_JUDGE_BASE_URL: "https://judge.example/v1",
      }),
    ).toThrow("GOODMEMORY_JUDGE_MODEL is required");

    expect(() =>
      resolveOfficialRescoreJudgeEnvironment({
        GOODMEMORY_JUDGE_API_KEY: "key",
        GOODMEMORY_JUDGE_BASE_URL: " https://judge.example/v1",
        GOODMEMORY_JUDGE_MODEL: "gpt-5.4-mini",
      }),
    ).toThrow("GOODMEMORY_JUDGE_BASE_URL must not have leading or trailing whitespace");

    expect(
      resolveOfficialRescoreJudgeEnvironment({
        GOODMEMORY_JUDGE_API_KEY: "key",
        GOODMEMORY_JUDGE_BASE_URL: "https://judge.example/v1",
        GOODMEMORY_JUDGE_MODEL: "gpt-5.4-mini",
      }),
    ).toEqual({
      apiKey: "key",
      baseURL: "https://judge.example/v1",
      model: "gpt-5.4-mini",
    });
  });

  it("rejects final official-rescore summaries when judge failures remain", () => {
    expect(() =>
      requireOfficialRescoreCompleteJudging({
        failureCount: 0,
        label: "locomo",
      }),
    ).not.toThrow();

    expect(() =>
      requireOfficialRescoreCompleteJudging({
        failureCount: 2,
        label: "beam",
      }),
    ).toThrow(
      "official rescore beam had 2 judge failure(s); rerun with the same run id to resume before writing a final summary.",
    );
  });

  it("builds auditable diagnostic metadata for stored-answer rescore reports", () => {
    expect(
      buildOfficialRescoreMetadata({
        benchmark: "beam",
        generatedAt: "2026-07-05T16:10:00.000Z",
        judgeModel: "gpt-5.4-mini",
        limit: 25,
        outputPath:
          "/repo/reports/eval/research/official-rescore/beam-current/rescore-summary.json",
        runId: "beam-current",
        sourceInputs: {
          reportPath: "/reports/beam/live-slice-report.json",
          rubricsPath: "/tmp/BEAM/rubrics-by-question-id.json",
        },
        sourceInputFingerprints: {
          reportPath: {
            bytes: 3,
            sha256: "report-sha",
          },
          rubricsPath: {
            bytes: 4,
            sha256: "rubrics-sha",
          },
        },
      }),
    ).toEqual({
      benchmark: "beam",
      claimBoundary:
        "Official-protocol comparability rescore of stored answers; not answer regeneration or a public benchmark claim unless promoted by the benchmark-claim gate.",
      generatedAt: "2026-07-05T16:10:00.000Z",
      generatedBy: "scripts/rescore-official-protocols.ts",
      judgeModel: "gpt-5.4-mini",
      limit: 25,
      limitUnit: "rubric-items",
      outputPath:
        "/repo/reports/eval/research/official-rescore/beam-current/rescore-summary.json",
      runId: "beam-current",
      sourceAnswersUnchanged: true,
      sourceInputFingerprints: {
        reportPath: {
          bytes: 3,
          sha256: "report-sha",
        },
        rubricsPath: {
          bytes: 4,
          sha256: "rubrics-sha",
        },
      },
      sourceInputs: {
        reportPath: "/reports/beam/live-slice-report.json",
        rubricsPath: "/tmp/BEAM/rubrics-by-question-id.json",
      },
    });

    expect(
      buildOfficialRescoreMetadata({
        benchmark: "locomo",
        generatedAt: "2026-07-05T16:20:00.000Z",
        judgeModel: "gpt-5.4-mini",
        outputPath:
          "/repo/reports/eval/research/official-rescore/locomo-current/rescore-summary.json",
        runId: "locomo-current",
        sourceInputs: {
          reportPath: "/reports/locomo/union-live-report.json",
          rootPath: "/tmp/LOCOMO/cases.json",
        },
        sourceInputFingerprints: {},
      }).limit,
    ).toBe(null);

    expect(
      buildOfficialRescoreMetadata({
        benchmark: "locomo",
        generatedAt: "2026-07-05T16:20:00.000Z",
        judgeModel: "gpt-5.4-mini",
        outputPath:
          "/repo/reports/eval/research/official-rescore/locomo-current/rescore-summary.json",
        runId: "locomo-current",
        sourceInputs: {
          reportPath: "/reports/locomo/union-live-report.json",
          rootPath: "/tmp/LOCOMO/cases.json",
        },
        sourceInputFingerprints: {},
      }).limitUnit,
    ).toBe("cases");
  });

  it("builds stable source input content fingerprints", () => {
    expect(
      buildOfficialRescoreSourceInputFingerprints({
        contents: {
          reportPath: "abc",
        },
        sourceInputs: {
          reportPath: "/reports/source.json",
        },
      }),
    ).toEqual({
      reportPath: {
        bytes: 3,
        sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      },
    });
  });

  it("builds unambiguous source and selected scope metadata", () => {
    expect(
      buildOfficialRescoreScopeMetadata({
        benchmark: "beam",
        selectedQuestionCount: 9,
        selectedRubricItemCount: 25,
        sourceQuestionCount: 400,
        sourceRubricItemCount: 1051,
      }),
    ).toEqual({
      selectedQuestions: 9,
      selectedRubricItems: 25,
      sourceQuestions: 400,
      sourceRubricItems: 1051,
    });

    expect(
      buildOfficialRescoreScopeMetadata({
        benchmark: "locomo",
        selectedCaseCount: 25,
        sourceCaseCount: 1986,
      }),
    ).toEqual({
      selectedCases: 25,
      sourceCases: 1986,
    });
  });

  it("rejects rescore progress cache identity drift", () => {
    const identity = buildOfficialRescoreRunIdentity({
      benchmark: "locomo",
      judgeModel: "gpt-5.4-mini",
      limit: 25,
      runId: "locomo-official-rescore-current",
      sourceInputFingerprints: {
        reportPath: {
          bytes: 7,
          sha256: "old-report",
        },
        rootPath: {
          bytes: 6,
          sha256: "old-root",
        },
      },
      sourceInputs: {
        reportPath: "/reports/locomo/union-live-report.json",
        rootPath: "/private/tmp/LOCOMO-full10/cases.json",
      },
    });
    expect(identity.limit).toBe(25);

    expect(() =>
      assertOfficialRescoreRunIdentityCompatible(identity, {
        ...identity,
        judgeModel: "gemini-flash",
      }),
    ).toThrow("official rescore run identity changed: judgeModel");

    expect(() =>
      assertOfficialRescoreRunIdentityCompatible(identity, {
        ...identity,
        benchmark: "beam",
      }),
    ).toThrow("official rescore run identity changed: benchmark");

    expect(() =>
      assertOfficialRescoreRunIdentityCompatible(identity, {
        ...identity,
        limit: 50,
      }),
    ).toThrow("official rescore run identity changed: limit");

    expect(() =>
      assertOfficialRescoreRunIdentityCompatible(identity, {
        ...identity,
        sourceInputFingerprints: {
          ...identity.sourceInputFingerprints,
          reportPath: {
            bytes: 8,
            sha256: "new-report",
          },
        },
      }),
    ).toThrow("official rescore run identity changed: sourceInputFingerprints");

    expect(() =>
      assertOfficialRescoreRunIdentityCompatible(identity, {
        ...identity,
        sourceInputs: {
          reportPath: "/reports/locomo/other-report.json",
          rootPath: "/private/tmp/LOCOMO-full10/cases.json",
        },
      }),
    ).toThrow("official rescore run identity changed: sourceInputs");
  });

  it("rejects malformed rescore progress rows", () => {
    expect(
      parseOfficialRescoreProgressLine(
        '{"questionId":"q1","correct":true}',
        "progress.jsonl:1",
      ),
    ).toEqual({
      correct: true,
      questionId: "q1",
    });

    expect(() =>
      parseOfficialRescoreProgressLine(
        '{"questionId":"q1","correct":"yes"}',
        "progress.jsonl:2",
      ),
    ).toThrow("malformed official rescore progress row at progress.jsonl:2");

    expect(() =>
      parseOfficialRescoreProgressLine(
        '{"questionId":"","correct":false}',
        "progress.jsonl:3",
      ),
    ).toThrow("malformed official rescore progress row at progress.jsonl:3");

    expect(
      parseOfficialRescoreRubricProgressLine(
        '{"key":"q1#0","questionId":"q1","score":0.5}',
        "progress.jsonl:4",
      ),
    ).toEqual({
      key: "q1#0",
      questionId: "q1",
      score: 0.5,
    });

    expect(() =>
      parseOfficialRescoreRubricProgressLine(
        '{"key":"q1#0","questionId":"q1","score":0.25}',
        "progress.jsonl:5",
      ),
    ).toThrow("malformed official rescore rubric progress row at progress.jsonl:5");

    expect(() =>
      parseOfficialRescoreRubricProgressLine(
        '{"key":"q1#0","questionId":"q2","score":0.5}',
        "progress.jsonl:6",
      ),
    ).toThrow("malformed official rescore rubric progress row at progress.jsonl:6");
  });

  it("rejects duplicate rescore progress rows", () => {
    expect(() =>
      readOfficialRescoreProgressRows(
        [
          '{"questionId":"q1","correct":true}',
          '{"questionId":"q1","correct":false}',
        ].join("\n"),
        "progress.jsonl",
      ),
    ).toThrow("duplicate official rescore progress row for q1 at progress.jsonl:2");

    expect(() =>
      readOfficialRescoreRubricProgressRows(
        [
          '{"key":"q1#0","questionId":"q1","score":1}',
          '{"key":"q1#0","questionId":"q1","score":0}',
        ].join("\n"),
        "progress.jsonl",
      ),
    ).toThrow("duplicate official rescore rubric progress row for q1#0 at progress.jsonl:2");
  });

  it("rejects cached progress rows outside the selected rescore scope", () => {
    expect(() =>
      requireOfficialRescoreProgressRowsWithinSelection(
        [
          { correct: true, questionId: "q1" },
          { correct: false, questionId: "q3" },
        ],
        new Set(["q1", "q2"]),
        "progress.jsonl",
      ),
    ).toThrow("official rescore progress row q3 is outside selected scope at progress.jsonl");

    expect(() =>
      requireOfficialRescoreRubricProgressRowsWithinSelection(
        [
          { key: "q1#0", questionId: "q1", score: 1 },
          { key: "q2#0", questionId: "q2", score: 0.5 },
        ],
        new Set(["q1#0", "q1#1"]),
        "progress.jsonl",
      ),
    ).toThrow("official rescore rubric progress row q2#0 is outside selected scope at progress.jsonl");
  });

  it("does not migrate legacy progress without an auditable run identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "gm-rescore-identity-"));
    try {
      const identityPath = join(root, "run-identity.json");
      const progressPath = join(root, "progress.jsonl");
      const identity = buildOfficialRescoreRunIdentity({
        benchmark: "locomo",
        judgeModel: "gpt-5.4-mini",
        runId: "locomo-official-rescore-current",
        sourceInputFingerprints: {
          reportPath: {
            bytes: 7,
            sha256: "report-sha",
          },
          rootPath: {
            bytes: 6,
            sha256: "root-sha",
          },
        },
        sourceInputs: {
          reportPath: "/reports/locomo/union-live-report.json",
          rootPath: "/private/tmp/LOCOMO-full10/cases.json",
        },
      });

      await writeFile(
        progressPath,
        '{"questionId":"q1","correct":true}\n',
      );

      await expect(
        ensureOfficialRescoreRunIdentity(identityPath, progressPath, identity),
      ).rejects.toThrow("progress cache exists without run-identity.json");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("initializes an auditable run identity for a fresh rescore run", async () => {
    const root = await mkdtemp(join(tmpdir(), "gm-rescore-identity-"));
    try {
      const identityPath = join(root, "run-identity.json");
      const progressPath = join(root, "progress.jsonl");
      const identity = buildOfficialRescoreRunIdentity({
        benchmark: "longmemeval",
        judgeModel: "gpt-5.4-mini",
        runId: "longmemeval-official-rescore-current",
        sourceInputFingerprints: {
          referencePath: {
            bytes: 4,
            sha256: "reference-sha",
          },
          reportPath: {
            bytes: 7,
            sha256: "report-sha",
          },
        },
        sourceInputs: {
          referencePath: "/tmp/longmemeval_s.json",
          reportPath: "/reports/longmemeval/report.json",
        },
      });

      await ensureOfficialRescoreRunIdentity(identityPath, progressPath, identity);
      expect(JSON.parse(await readFile(identityPath, "utf8"))).toEqual(identity);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
