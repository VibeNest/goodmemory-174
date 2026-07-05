import { describe, expect, it } from "bun:test";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  BeamProfile,
  BeamProfileReport,
  BeamProfileSummary,
  BeamReport,
} from "../../src/eval/beam";
import type { BeamGeneralLeverRecallDiagnosticRunner } from "../../scripts/measure-beam-general-levers";
import {
  parseBeamGeneralLeverCliOptions,
  runBeamGeneralLeverMeasure,
} from "../../scripts/measure-beam-general-levers";

const SUMMARY: BeamProfileSummary = {
  abstentionCorrectCases: 0,
  accuracy: 0,
  correctCases: 0,
  evidenceCaseCount: 0,
  evidenceChatRecall: 0.6822,
  missedRecallCases: 0,
  totalCases: 0,
  wrongAnswerCases: 0,
  wrongRecallCases: 0,
};

function buildReport(input: {
  profile: BeamProfile;
  runId: string;
}): BeamReport {
  const profileReport = {
    cases: [],
    summary: SUMMARY,
  } satisfies BeamProfileReport;

  return {
    benchmarkRoot: "/tmp/BEAM",
    generatedAt: "2026-07-05T00:00:00.000Z",
    generatedBy: "scripts/measure-beam-general-levers.ts",
    mode: "full",
    outputDir: "/tmp/out",
    phase: "phase-63",
    profiles: {
      [input.profile]: profileReport,
    },
    runDirectory: `/tmp/out/${input.runId}`,
    runId: input.runId,
    source: {
      benchmark: "BEAM",
      license: "cc-by-sa-4.0 dataset; paper external",
      url: "https://huggingface.co/datasets/Mohammadta/BEAM",
    },
    summary: {
      caseCountsByQuestionType: {},
      executionFailures: 0,
      profilesCompared: [input.profile],
      scale: "100K",
      totalCases: 0,
    },
  };
}

describe("measure BEAM general levers", () => {
  it("parses strict CLI options for a single arm", () => {
    expect(
      parseBeamGeneralLeverCliOptions([
        "bun",
        "run",
        "scripts/measure-beam-general-levers.ts",
        "--arm",
        "bm25-union16",
        "--benchmark-root",
        "/tmp/BEAM",
        "--semantic-topk",
        "32",
        "--limit",
        "12",
        "--output-dir",
        "/tmp/out",
        "--run-id",
        "run-beam-general-levers",
        "--keep-gates",
      ]),
    ).toEqual({
      arm: "bm25-union16",
      benchmarkRoot: "/tmp/BEAM",
      keepGates: true,
      limit: 12,
      outputDir: "/tmp/out",
      runId: "run-beam-general-levers",
      semanticTopK: 32,
    });
  });

  it("rejects duplicate or malformed evidence selectors before running", () => {
    expect(() =>
      parseBeamGeneralLeverCliOptions([
        "bun",
        "run",
        "scripts/measure-beam-general-levers.ts",
        "--arm",
        "floor",
        "--arm",
        "bm25",
      ]),
    ).toThrow("--arm cannot be specified more than once.");

    expect(() =>
      parseBeamGeneralLeverCliOptions([
        "bun",
        "run",
        "scripts/measure-beam-general-levers.ts",
        "--arm",
        "union16",
        "--semantic-topk",
        "0",
      ]),
    ).toThrow("--semantic-topk must be a positive integer.");

    expect(() =>
      parseBeamGeneralLeverCliOptions([
        "bun",
        "run",
        "scripts/measure-beam-general-levers.ts",
        "--arm",
        "floor",
        "--keep-gates",
        "--keep-gates",
      ]),
    ).toThrow("--keep-gates cannot be specified more than once.");
  });

  it("disables every registered narrow gate for a generalization run", async () => {
    const env: Record<string, string | undefined> = { HOME: "/tmp/home" };
    const logs: string[] = [];
    let resetCount = 0;
    let receivedProfile: BeamProfile | undefined;
    let receivedRunId: string | undefined;
    let receivedBenchmarkRoot: string | undefined;
    let receivedDisabledGates: string | undefined;
    let receivedOutputDir: string | undefined;
    let hasMemoryFactory = false;
    const runRecallDiagnostic: BeamGeneralLeverRecallDiagnosticRunner = async (
      options,
      dependencies,
    ) => {
      receivedBenchmarkRoot = options.benchmarkRoot;
      receivedDisabledGates = env.GOODMEMORY_DISABLED_NARROW_GATES;
      receivedOutputDir = options.outputDir;
      receivedProfile = options.profiles?.[0] as BeamProfile | undefined;
      receivedRunId = options.runId;
      hasMemoryFactory = typeof dependencies?.createMemory === "function";
      return buildReport({
        profile: receivedProfile ?? "goodmemory-hybrid",
        runId: receivedRunId ?? "run-missing",
      });
    };

    const summary = await runBeamGeneralLeverMeasure(
      {
        arm: "bm25",
        keepGates: false,
        outputDir: "/tmp/out",
        semanticTopK: 16,
      },
      {
        env,
        listNarrowGateIds: () => ["gate-a", "gate-b"],
        log: (message) => logs.push(message),
        resetNarrowGateDisables: () => {
          resetCount += 1;
        },
        runRecallDiagnostic,
      },
    );

    expect(receivedDisabledGates).toBe("gate-a,gate-b");
    expect(env.GOODMEMORY_DISABLED_NARROW_GATES).toBeUndefined();
    expect(logs).toEqual(["narrow gates disabled: 2"]);
    expect(resetCount).toBe(2);
    expect(receivedBenchmarkRoot).toBe("/tmp/home/.goodmemory-beam");
    expect(receivedOutputDir).toBe("/tmp/out");
    expect(receivedProfile).toBe("goodmemory-hybrid");
    expect(receivedRunId).toBe("run-p5-beam-levers-bm25-generalization");
    expect(hasMemoryFactory).toBe(true);
    expect(summary).toEqual({
      arm: "bm25",
      gatesDisabled: true,
      profile: "goodmemory-hybrid",
      runId: "run-p5-beam-levers-bm25-generalization",
      semanticTopK: null,
      summary: SUMMARY,
    });
  });

  it("clears narrow-gate disables for a fitted keep-gates run", async () => {
    const env: Record<string, string | undefined> = {
      GOODMEMORY_DISABLED_NARROW_GATES: "stale-gate",
      HOME: "/tmp/home",
    };
    let resetCount = 0;
    let receivedDisabledGates: string | undefined;
    const runRecallDiagnostic: BeamGeneralLeverRecallDiagnosticRunner = async (
      options,
    ) => {
      receivedDisabledGates = env.GOODMEMORY_DISABLED_NARROW_GATES;
      return buildReport({
        profile: (options.profiles?.[0] as BeamProfile | undefined) ?? "goodmemory-rules-only",
        runId: options.runId ?? "run-missing",
      });
    };

    const summary = await runBeamGeneralLeverMeasure(
      {
        arm: "floor",
        keepGates: true,
        semanticTopK: 16,
      },
      {
        env,
        log: () => {},
        resetNarrowGateDisables: () => {
          resetCount += 1;
        },
        runRecallDiagnostic,
      },
    );

    expect(receivedDisabledGates).toBeUndefined();
    expect(env.GOODMEMORY_DISABLED_NARROW_GATES).toBe("stale-gate");
    expect(resetCount).toBe(2);
    expect(summary.gatesDisabled).toBe(false);
    expect(summary.profile).toBe("goodmemory-rules-only");
    expect(summary.runId).toBe("run-p5-beam-levers-floor-fitted");
  });

  it("restores narrow-gate disables when the diagnostic fails", async () => {
    const env: Record<string, string | undefined> = {
      GOODMEMORY_DISABLED_NARROW_GATES: "preexisting-gate",
      HOME: "/tmp/home",
    };
    let resetCount = 0;

    await expect(
      runBeamGeneralLeverMeasure(
        {
          arm: "bm25",
          keepGates: false,
          semanticTopK: 16,
        },
        {
          env,
          listNarrowGateIds: () => ["gate-a"],
          log: () => {},
          resetNarrowGateDisables: () => {
            resetCount += 1;
          },
          runRecallDiagnostic: async () => {
            throw new Error("diagnostic failed");
          },
        },
      ),
    ).rejects.toThrow("diagnostic failed");

    expect(env.GOODMEMORY_DISABLED_NARROW_GATES).toBe("preexisting-gate");
    expect(resetCount).toBe(2);
  });

  it("runs the floor arm without assisted extractor env dependencies", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "gm-beam-general-levers-"));
    const benchmarkRoot = join(tempRoot, "beam-root");
    const outputDir = join(tempRoot, "out");
    const savedAssistedEnv = {
      apiKey: process.env.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY,
      baseUrl: process.env.GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL,
      model: process.env.GOODMEMORY_ASSISTED_EXTRACTOR_MODEL,
      provider: process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER,
    };

    try {
      await mkdir(benchmarkRoot, { recursive: true });
      await cp(
        join(
          import.meta.dir,
          "../../fixtures/external-benchmarks/beam/beam_100k_smoke.json",
        ),
        join(benchmarkRoot, "100K.json"),
      );
      process.env.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY = "present-but-partial";
      delete process.env.GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL;
      delete process.env.GOODMEMORY_ASSISTED_EXTRACTOR_MODEL;
      delete process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER;

      const summary = await runBeamGeneralLeverMeasure(
        {
          arm: "floor",
          benchmarkRoot,
          keepGates: false,
          limit: 1,
          outputDir,
          runId: "run-floor-env-isolated",
          semanticTopK: 16,
        },
        {
          env: process.env,
          listNarrowGateIds: () => ["gate-a"],
          log: () => {},
        },
      );

      expect(summary).toMatchObject({
        arm: "floor",
        gatesDisabled: true,
        profile: "goodmemory-rules-only",
        runId: "run-floor-env-isolated",
        semanticTopK: null,
      });
      expect(summary.summary?.totalCases).toBe(1);
      expect(summary.summary?.evidenceChatRecall).toBe(1);
    } finally {
      if (savedAssistedEnv.apiKey === undefined) {
        delete process.env.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY;
      } else {
        process.env.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY =
          savedAssistedEnv.apiKey;
      }
      if (savedAssistedEnv.baseUrl === undefined) {
        delete process.env.GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL;
      } else {
        process.env.GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL =
          savedAssistedEnv.baseUrl;
      }
      if (savedAssistedEnv.model === undefined) {
        delete process.env.GOODMEMORY_ASSISTED_EXTRACTOR_MODEL;
      } else {
        process.env.GOODMEMORY_ASSISTED_EXTRACTOR_MODEL = savedAssistedEnv.model;
      }
      if (savedAssistedEnv.provider === undefined) {
        delete process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER;
      } else {
        process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER =
          savedAssistedEnv.provider;
      }
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
