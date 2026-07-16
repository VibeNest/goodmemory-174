import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  alignBeamEventOrderingItems,
  buildBeamPaperCategorySummary,
  canonicalizeBeamAbility,
  computeBeamEventOrderingTauNorm,
  computeKendallTauB,
  runBeamPaperProtocolRescore,
} from "../../scripts/rescore-beam-paper-protocol";

describe("BEAM paper protocol rescore", () => {
  it("maps information-extraction subtypes into the upstream ability", () => {
    expect(canonicalizeBeamAbility("event_ordering")).toBe("event_ordering");
    expect(canonicalizeBeamAbility("numerical_precision")).toBe(
      "information_extraction",
    );
    expect(canonicalizeBeamAbility("Timeline Integration")).toBe(
      "information_extraction",
    );
    expect(() => canonicalizeBeamAbility("event_orderin")).toThrow(
      "unknown BEAM question type",
    );
  });

  it("rejects an output directory that contains any source input", async () => {
    const outputDir = join(tmpdir(), "beam-paper-collision");
    const runId = "collision";
    await expect(runBeamPaperProtocolRescore({
      concurrency: 1,
      outputDir,
      reportPath: join(outputDir, runId, "rescore-summary.json"),
      rubricRescoreDir: join(outputDir, "rubric-source"),
      rubricsPath: join(outputDir, "rubrics.json"),
      runId,
    })).rejects.toThrow("overlaps source input");
  });

  it("rejects a symlinked output alias of a source directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "beam-paper-alias-"));
    const sourceDir = join(root, "source");
    const outputLink = join(root, "output-link");
    const runId = "collision";
    try {
      await mkdir(sourceDir, { recursive: true });
      await symlink(sourceDir, outputLink, "dir");

      await expect(runBeamPaperProtocolRescore({
        concurrency: 1,
        outputDir: outputLink,
        reportPath: join(sourceDir, runId, "rescore-summary.json"),
        rubricRescoreDir: join(root, "rubric-source"),
        rubricsPath: join(root, "rubrics.json"),
        runId,
      })).rejects.toThrow("overlaps source input");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects malformed report rows before judging", async () => {
    await withBeamRunnerFixture({
      report: {
        cases: [{
          hypothesis: "answer",
          questionId: "question-1",
          questionType: "event_orderin",
        }],
      },
      run: async (fixture) => {
        await expect(runBeamPaperProtocolRescore(fixture.options)).rejects.toThrow(
          "unknown BEAM question type",
        );
      },
    });
  });

  it("resumes from cached event-ordering rows and ignores only a torn tail", async () => {
    await withBeamRunnerFixture({
      alignmentProgress: [
        JSON.stringify({
          equivalent: true,
          key: "question-1#0#0",
          questionId: "question-1",
          referenceIndex: 0,
          systemIndex: 0,
        }),
        JSON.stringify({
          equivalent: true,
          key: "question-1#1#1",
          questionId: "question-1",
          referenceIndex: 1,
          systemIndex: 1,
        }),
        '{"equivalent":',
      ].join("\n"),
      report: {
        cases: [{
          hypothesis: "first\nsecond",
          questionId: "question-1",
          questionType: "event_ordering",
        }],
      },
      rubrics: {
        "question-1": {
          question: "What happened first?",
          rubric: ["first", "second"],
        },
      },
      run: async (fixture) => {
        const summary = await runBeamPaperProtocolRescore(fixture.options);
        expect(summary).toMatchObject({
          eventOrderingAlignmentVerdicts: 2,
          eventOrderingNewAlignmentVerdicts: 0,
          overallMacroByAbility: 1,
          overallMicroByQuestion: 1,
        });
        expect(JSON.parse(await readFile(
          join(fixture.runDirectory, "event-ordering-scores.json"),
          "utf8",
        ))).toHaveLength(1);
      },
    });
  });

  it("computes Kendall tau-b with the same normalized endpoints as BEAM", () => {
    expect(computeKendallTauB([1, 2, 3], [1, 2, 3])).toBe(1);
    expect(computeKendallTauB([1, 2, 3], [3, 2, 1])).toBe(-1);
    expect(
      computeBeamEventOrderingTauNorm({
        alignedSystemItems: ["first", "second", "third"],
        referenceItems: ["first", "second", "third"],
      }),
    ).toBe(1);
    expect(
      computeBeamEventOrderingTauNorm({
        alignedSystemItems: ["third", "second", "first"],
        referenceItems: ["first", "second", "third"],
      }),
    ).toBe(0);
  });

  it("aligns each response line to the first unused equivalent rubric item", async () => {
    const calls: string[] = [];
    const result = await alignBeamEventOrderingItems({
      equivalent: async ({ referenceItem, systemItem }) => {
        calls.push(`${systemItem}->${referenceItem}`);
        return (
          (systemItem === "Beta paraphrase" && referenceItem === "beta") ||
          (systemItem === "Alpha paraphrase" && referenceItem === "alpha")
        );
      },
      referenceItems: ["alpha", "beta", "gamma"],
      systemItems: ["Beta paraphrase", "Alpha paraphrase", "unmatched"],
    });

    expect(result).toEqual(["beta", "alpha", "unmatched"]);
    expect(calls).toEqual([
      "Beta paraphrase->alpha",
      "Beta paraphrase->beta",
      "Alpha paraphrase->alpha",
      "unmatched->gamma",
    ]);
  });

  it("aggregates a frozen single-ability slice without inventing missing abilities", () => {
    expect(
      buildBeamPaperCategorySummary([
        { questionType: "event_ordering", score: 0.25 },
        { questionType: "event_ordering", score: 0.75 },
      ]),
    ).toEqual({
      categories: {
        event_ordering: { meanScore: 0.5, questions: 2 },
      },
      overallMacroByAbility: 0.5,
      overallMicroByQuestion: 0.5,
    });
  });
});

async function withBeamRunnerFixture(input: {
  alignmentProgress?: string;
  report: unknown;
  rubrics?: Record<string, { question: string; rubric: string[] }>;
  run: (fixture: {
    options: Parameters<typeof runBeamPaperProtocolRescore>[0];
    runDirectory: string;
  }) => Promise<void>;
}): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "beam-paper-runner-"));
  const outputDir = join(root, "output");
  const reportPath = join(root, "report.json");
  const rubricRescoreDir = join(root, "rubric-rescore");
  const rubricsPath = join(root, "rubrics.json");
  const runId = "runner-test";
  const runDirectory = join(outputDir, runId);
  const reportBytes = `${JSON.stringify(input.report, null, 2)}\n`;
  const rubricsBytes = `${JSON.stringify(input.rubrics ?? {
    "question-1": {
      question: "Question?",
      rubric: ["answer"],
    },
  }, null, 2)}\n`;
  const rubricProgressBytes = "";
  const previousJudgeEnv = {
    apiKey: process.env.GOODMEMORY_JUDGE_API_KEY,
    baseUrl: process.env.GOODMEMORY_JUDGE_BASE_URL,
    model: process.env.GOODMEMORY_JUDGE_MODEL,
  };
  try {
    await Promise.all([
      mkdir(rubricRescoreDir, { recursive: true }),
      mkdir(runDirectory, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(reportPath, reportBytes, "utf8"),
      writeFile(rubricsPath, rubricsBytes, "utf8"),
      writeFile(
        join(rubricRescoreDir, "progress.jsonl"),
        rubricProgressBytes,
        "utf8",
      ),
      writeFile(
        join(runDirectory, "progress.jsonl"),
        input.alignmentProgress ?? "",
        "utf8",
      ),
    ]);
    await writeFile(
      join(rubricRescoreDir, "run-identity.json"),
      `${JSON.stringify({
        benchmark: "beam",
        judgeModel: "test-judge",
        sourceAnswersUnchanged: true,
        sourceInputFingerprints: {
          reportPath: fingerprint(reportBytes),
          rubricsPath: fingerprint(rubricsBytes),
        },
      }, null, 2)}\n`,
      "utf8",
    );
    process.env.GOODMEMORY_JUDGE_API_KEY = "test-key";
    process.env.GOODMEMORY_JUDGE_BASE_URL = "https://judge.invalid/v1";
    process.env.GOODMEMORY_JUDGE_MODEL = "test-judge";
    await input.run({
      options: {
        concurrency: 1,
        outputDir,
        reportPath,
        rubricRescoreDir,
        rubricsPath,
        runId,
      },
      runDirectory,
    });
  } finally {
    restoreEnv("GOODMEMORY_JUDGE_API_KEY", previousJudgeEnv.apiKey);
    restoreEnv("GOODMEMORY_JUDGE_BASE_URL", previousJudgeEnv.baseUrl);
    restoreEnv("GOODMEMORY_JUDGE_MODEL", previousJudgeEnv.model);
    await rm(root, { force: true, recursive: true });
  }
}

function fingerprint(value: string): { bytes: number; sha256: string } {
  return {
    bytes: Buffer.byteLength(value),
    sha256: createHash("sha256").update(value).digest("hex"),
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
