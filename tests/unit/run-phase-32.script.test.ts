import { describe, expect, it } from "bun:test";
import {
  buildPhase32FallbackRunId,
  parsePhase32EvalCliOptions,
  resolvePhase32FallbackOutputDir,
  runPhase32FallbackEval,
} from "../../scripts/run-phase-32-eval";

describe("run-phase-32 eval script", () => {
  it("resolves the phase-32 deterministic output directory", () => {
    expect(resolvePhase32FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-32",
    );
  });

  it("builds a deterministic phase-32 run id", () => {
    expect(buildPhase32FallbackRunId("2026-04-22T17:30:45.000Z")).toBe(
      "run-20260422173045",
    );
  });

  it("parses phase-32 eval cli flags", () => {
    expect(
      parsePhase32EvalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-32-eval.ts",
        "--output-dir",
        "/tmp/phase32",
        "--run-id",
        "run-phase32",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase32",
      runId: "run-phase32",
    });
  });

  it("writes a deterministic dual-baseline report with event-backed non-regression and no-memory wins", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];

    const report = await runPhase32FallbackEval(
      {
        outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-32",
        runId: "run-phase32",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-22T17:30:45.000Z",
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.phase).toBe("phase-32");
    expect(report.mode).toBe("fallback");
    expect(report.runId).toBe("run-phase32");
    expect(report.summary.totalCases).toBe(3);
    expect(report.summary.eventBackedNonRegressionPassCount).toBe(3);
    expect(report.summary.eventBackedClearWinCount).toBeGreaterThanOrEqual(2);
    expect(report.summary.eventBackedAverageScore).toBeGreaterThanOrEqual(
      report.summary.textOnlyAverageScore,
    );
    expect(report.summary.eventBackedAverageScore).toBeGreaterThan(
      report.summary.noMemoryAverageScore,
    );
    expect(
      report.cases.every(
        (caseResult) =>
          caseResult.eventBacked.score > caseResult.textOnly.score &&
          caseResult.eventBacked.score > caseResult.noMemory.score,
      ),
    ).toBe(true);
    expect(
      report.cases.find((caseResult) => caseResult.caseId === "continuity-open-loop")
        ?.eventBacked.context,
    ).toContain("Task transition:");
    expect(
      report.cases.find((caseResult) => caseResult.caseId === "continuity-open-loop")
        ?.textOnly.context,
    ).not.toContain("Task transition:");
    expect(
      report.cases.find((caseResult) => caseResult.caseId === "procedure-adherence")
        ?.eventBacked.context,
    ).toContain("## Evidence");
    expect(
      report.cases.find((caseResult) => caseResult.caseId === "procedure-adherence")
        ?.eventBacked.context,
    ).toContain("Verification:");
    expect(
      report.cases.find((caseResult) => caseResult.caseId === "procedure-adherence")
        ?.textOnly.context,
    ).not.toContain("Verification:");
    expect(
      report.cases.find((caseResult) => caseResult.caseId === "repeated-correction")
        ?.textOnly.context,
    ).not.toContain("## Evidence");
    expect(
      report.cases.find((caseResult) => caseResult.caseId === "repeated-correction")
        ?.eventBacked.context.match(/- Use bullet points in summaries\./g)?.length ?? 0,
    ).toBe(1);
    expect(
      report.cases.find((caseResult) => caseResult.caseId === "repeated-correction")
        ?.eventBacked.context,
    ).not.toContain("appliesTo:");
    expect(
      report.cases.every((caseResult) => caseResult.noMemory.context.trim().length === 0),
    ).toBe(true);
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/eval/fallback/phase-32/run-phase32",
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-32/run-phase32/report.json",
    );
    expect(JSON.parse(writes[0]!.content)).toEqual(report);
  });

  it("stays rules-only even when extractor and embedding env vars are set", async () => {
    const previousEnv = {
      GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY:
        process.env.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY,
      GOODMEMORY_ASSISTED_EXTRACTOR_MODEL:
        process.env.GOODMEMORY_ASSISTED_EXTRACTOR_MODEL,
      GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER:
        process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER,
      GOODMEMORY_EMBEDDING_API_KEY: process.env.GOODMEMORY_EMBEDDING_API_KEY,
      GOODMEMORY_EMBEDDING_MODEL: process.env.GOODMEMORY_EMBEDDING_MODEL,
      GOODMEMORY_EMBEDDING_PROVIDER: process.env.GOODMEMORY_EMBEDDING_PROVIDER,
    };

    process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER = "openai";
    process.env.GOODMEMORY_ASSISTED_EXTRACTOR_MODEL = "openai/gpt-4o-mini";
    process.env.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY = "extractor-key";
    process.env.GOODMEMORY_EMBEDDING_PROVIDER = "openai";
    process.env.GOODMEMORY_EMBEDDING_MODEL = "openai/text-embedding-3-small";
    process.env.GOODMEMORY_EMBEDDING_API_KEY = "embedding-key";

    try {
      const report = await runPhase32FallbackEval(
        {
          outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-32",
          runId: "run-phase32-rules-only",
        },
        {
          ensureDir: async () => {},
          now: () => "2026-04-22T17:30:45.000Z",
          writeTextFile: async () => {},
        },
      );

      expect(report.acceptance.decision).toBe("accepted");
      expect(process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER).toBe("openai");
      expect(process.env.GOODMEMORY_EMBEDDING_PROVIDER).toBe("openai");
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});
