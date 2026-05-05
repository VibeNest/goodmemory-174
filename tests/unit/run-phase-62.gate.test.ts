import { describe, expect, it } from "bun:test";
import {
  PHASE62_CANONICAL_GATE_RUN_ID,
  runPhase62Gate,
} from "../../scripts/run-phase-62-gate";
import { PHASE62_CANONICAL_RUN_ID } from "../../scripts/run-phase-62-eval";

function buildLongMemEvalReport(): string {
  return JSON.stringify({
    benchmarkRoot: "/tmp/goodmemory/fixtures/external-benchmarks/longmemeval",
    generatedAt: "2026-05-05T00:00:00.000Z",
    generatedBy: "scripts/run-phase-62-eval.ts",
    mode: "smoke",
    outputDir: "/tmp/goodmemory/reports/eval/research/phase-62/longmemeval",
    phase: "phase-62",
    profiles: {
      "baseline-full-context": {
        summary: { accuracy: 1, correctCases: 2 },
      },
      "baseline-no-memory": {
        summary: { accuracy: 0.5, correctCases: 1 },
      },
      "goodmemory-hybrid": {
        summary: { accuracy: 1, correctCases: 2 },
      },
      "goodmemory-rules-only": {
        summary: { accuracy: 1, correctCases: 2 },
      },
    },
    runDirectory:
      "/tmp/goodmemory/reports/eval/research/phase-62/longmemeval/run-phase62-longmemeval-smoke-current",
    runId: PHASE62_CANONICAL_RUN_ID,
    source: {
      benchmark: "LongMemEval",
      license: "MIT code; dataset external",
      url: "https://github.com/xiaowu0162/LongMemEval",
    },
    summary: {
      abstentionCases: 1,
      caseCountsByQuestionType: {},
      executionFailures: 0,
      profilesCompared: [
        "baseline-no-memory",
        "baseline-full-context",
        "goodmemory-rules-only",
        "goodmemory-hybrid",
      ],
      totalCases: 2,
    },
  });
}

describe("run-phase-62 gate", () => {
  it("writes an accepted gate for the canonical LongMemEval smoke report", async () => {
    const commands: string[][] = [];
    const writes = new Map<string, string>();

    const result = await runPhase62Gate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-62",
        runId: "run-gate",
      },
      {
        readFile: async () => buildLongMemEvalReport(),
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
      "tests/unit/longmemeval.test.ts",
      "tests/unit/run-phase-62.script.test.ts",
      "tests/unit/run-phase-62.gate.test.ts",
    ]);
    expect(result.status).toBe("accepted");
    expect(result.phase).toBe("phase-62");
    expect(
      writes.has(
        "/tmp/goodmemory/reports/quality-gates/phase-62/run-gate/phase-62-quality-gate.json",
      ),
    ).toBe(true);
  });

  it("uses the canonical gate run id by default", async () => {
    const writes = new Map<string, string>();

    await runPhase62Gate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-62",
      },
      {
        readFile: async () => buildLongMemEvalReport(),
        runCommand: async () => {},
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(
      writes.has(
        `/tmp/goodmemory/reports/quality-gates/phase-62/${PHASE62_CANONICAL_GATE_RUN_ID}/phase-62-quality-gate.json`,
      ),
    ).toBe(true);
  });
});
