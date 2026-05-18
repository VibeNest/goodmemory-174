import { describe, expect, it } from "bun:test";
import {
  PHASE63_CANONICAL_GATE_RUN_ID,
  runPhase63Gate,
} from "../../scripts/run-phase-63-gate";
import { PHASE63_CANONICAL_RUN_ID } from "../../scripts/run-phase-63-eval";

function buildBeamReport(): string {
  return JSON.stringify({
    benchmarkRoot: "/tmp/goodmemory/fixtures/external-benchmarks/beam",
    generatedAt: "2026-05-18T00:00:00.000Z",
    generatedBy: "scripts/run-phase-63-eval.ts",
    mode: "smoke",
    outputDir: "/tmp/goodmemory/reports/eval/research/phase-63/beam",
    phase: "phase-63",
    profiles: {
      "baseline-full-context": {
        summary: { accuracy: 1, correctCases: 3 },
      },
      "baseline-no-memory": {
        summary: { accuracy: 0.33, correctCases: 1 },
      },
      "goodmemory-hybrid": {
        summary: { accuracy: 1, correctCases: 3 },
      },
      "goodmemory-rules-only": {
        summary: { accuracy: 1, correctCases: 3 },
      },
    },
    runDirectory:
      "/tmp/goodmemory/reports/eval/research/phase-63/beam/run-phase63-beam-smoke-current",
    runId: PHASE63_CANONICAL_RUN_ID,
    source: {
      benchmark: "BEAM",
      license: "cc-by-sa-4.0 dataset; paper external",
      url: "https://huggingface.co/datasets/Mohammadta/BEAM",
    },
    summary: {
      caseCountsByQuestionType: {},
      executionFailures: 0,
      profilesCompared: [
        "baseline-no-memory",
        "baseline-full-context",
        "goodmemory-rules-only",
        "goodmemory-hybrid",
      ],
      scale: "100K",
      totalCases: 3,
    },
  });
}

describe("run-phase-63 gate", () => {
  it("writes an accepted gate for the canonical BEAM smoke report", async () => {
    const commands: string[][] = [];
    const writes = new Map<string, string>();

    const result = await runPhase63Gate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-63",
        runId: "run-gate",
      },
      {
        readFile: async () => buildBeamReport(),
        runCommand: async (command) => {
          commands.push(command);
        },
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(commands).toContainEqual([
      "bun",
      "test",
      "tests/unit/analyze-phase-63-beam-report.test.ts",
      "tests/unit/beam.test.ts",
      "tests/unit/run-phase-63.beam-live-slice.test.ts",
      "tests/unit/prepare-phase-63-beam-data.test.ts",
      "tests/unit/run-phase-63.beam-recall-diagnostic.test.ts",
      "tests/unit/run-phase-63.script.test.ts",
      "tests/unit/run-phase-63.gate.test.ts",
    ]);
    expect(result.status).toBe("accepted");
    expect(result.phase).toBe("phase-63");
    expect(
      writes.has(
        "/tmp/goodmemory/reports/quality-gates/phase-63/run-gate/phase-63-quality-gate.json",
      ),
    ).toBe(true);
  });

  it("uses the canonical gate run id by default", async () => {
    const writes = new Map<string, string>();

    await runPhase63Gate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-63",
      },
      {
        readFile: async () => buildBeamReport(),
        runCommand: async () => {},
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(
      writes.has(
        `/tmp/goodmemory/reports/quality-gates/phase-63/${PHASE63_CANONICAL_GATE_RUN_ID}/phase-63-quality-gate.json`,
      ),
    ).toBe(true);
  });
});
