import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import type {
  BehavioralAdaptationFixture,
  BehavioralGeneratedAnswer,
} from "../../src/eval/behavioral-adaptation";
import {
  listBehavioralAdaptationFixtures,
  runBehavioralAdaptationEvaluation,
  validateBehavioralAdaptationFixture,
} from "../../src/eval/behavioral-adaptation";

function buildFixtures(): BehavioralAdaptationFixture[] {
  return [
    {
      case_id: "procedural-copy-generalization",
      paradigm: "procedural",
      task_name: "Procedural generalized copy_file order",
      generalization_case: true,
      learning_phase: [
        {
          role: "user",
          content: "copy_file uses destination before source here.",
        },
      ],
      interference_phase: [
        {
          role: "user",
          content: "How do I view a log?",
        },
      ],
      test_probe: {
        role: "user",
        content: "Copy /src/report.txt into /backup/report.txt. Reply with only the command.",
      },
      expected_first_action: {
        kind: "command",
        name: "copy_file",
        args: ["/backup/report.txt", "/src/report.txt"],
        raw: "copy_file('/backup/report.txt', '/src/report.txt')",
      },
      forbidden_first_action: {
        kind: "command",
        name: "copy_file",
        args: ["/src/report.txt", "/backup/report.txt"],
        raw: "copy_file('/src/report.txt', '/backup/report.txt')",
      },
      feedback_signal:
        "When using copy_file, answer with destination path first and source path second.",
    },
    {
      case_id: "conditioning-detailed-analysis-timeout",
      paradigm: "conditioning",
      task_name: "Conditioned DeepAnalyzer avoidance",
      learning_phase: [
        {
          role: "user",
          content: "I need a detailed analysis.",
        },
      ],
      interference_phase: [
        {
          role: "user",
          content: "How do I install Python?",
        },
      ],
      test_probe: {
        role: "user",
        content: "I need a detailed analysis of our network traffic.",
      },
      expected_first_action: {
        kind: "tool_call",
        name: "QuickCheck",
        raw: "QuickCheck --network",
      },
      forbidden_first_action: {
        kind: "tool_call",
        name: "DeepAnalyzer",
        raw: "DeepAnalyzer --detailed",
      },
      feedback_signal:
        "When detailed analysis previously caused DeepAnalyzer timeouts, avoid DeepAnalyzer first and use QuickCheck before proceeding.",
      behavioral_outcomes: [
        {
          cue: "detailed analysis",
          failureClass: "timeout",
          firstAction: {
            kind: "tool_call",
            name: "DeepAnalyzer",
            raw: "DeepAnalyzer --detailed",
          },
          saferAlternative: {
            kind: "tool_call",
            name: "QuickCheck",
            raw: "QuickCheck --network",
          },
        },
        {
          cue: "detailed analysis",
          failureClass: "timeout",
          firstAction: {
            kind: "tool_call",
            name: "DeepAnalyzer",
            raw: "DeepAnalyzer --detailed",
          },
          saferAlternative: {
            kind: "tool_call",
            name: "QuickCheck",
            raw: "QuickCheck --network",
          },
        },
      ],
    },
    {
      case_id: "priming-volcanic-naming",
      paradigm: "priming",
      task_name: "Volcanic priming",
      feedback_signal: "Subtle volcanic imagery may influence naming, but do not quote the priming prompt.",
      experimental: {
        task_name: "Experimental",
        learning_phase: [
          {
            role: "assistant",
            content: "Ash and ember roll across black stone.",
          },
        ],
        interference_phase: [
          {
            role: "assistant",
            content: "Calibrate displays at 6500 K.",
          },
        ],
        test_probe: {
          role: "user",
          content: "Propose three codenames for a compression library.",
        },
        priming_keywords: ["ember", "ash", "basalt"],
        constraint_checks: [
          { type: "output_shape", expectedLineCount: 3 },
          {
            type: "no_prompt_quote_reuse",
            forbiddenPhrases: ["ash and ember roll across black stone"],
          },
          { type: "task_format_compliance" },
        ],
      },
      control: {
        task_name: "Control",
        learning_phase: [
          {
            role: "assistant",
            content: "Labels are consistent and processes stay small.",
          },
        ],
        interference_phase: [
          {
            role: "assistant",
            content: "Calibrate displays at 6500 K.",
          },
        ],
        test_probe: {
          role: "user",
          content: "Propose three codenames for a compression library.",
        },
        priming_keywords: ["ember", "ash", "basalt"],
        constraint_checks: [
          { type: "output_shape", expectedLineCount: 3 },
          {
            type: "no_prompt_quote_reuse",
            forbiddenPhrases: ["ash and ember roll across black stone"],
          },
          { type: "task_format_compliance" },
        ],
      },
    },
  ];
}

function buildAnswer(input: {
  branch?: "control" | "experimental";
  fixture: BehavioralAdaptationFixture;
  mode: "baseline" | "goodmemory";
  profile: "distilled-feedback" | "outcome-telemetry" | "raw-experience";
}): BehavioralGeneratedAnswer {
  if (input.fixture.paradigm === "priming") {
    if (input.branch === "experimental") {
      return {
        answer:
          input.mode === "goodmemory"
            ? "EmberVault\nBasaltZip\nSignalForge"
            : "VectorNest\nSignalWeave\nCompressionGrid",
      };
    }

    return {
      answer: "VectorNest\nSignalWeave\nCompressionGrid",
    };
  }

  if (input.mode === "baseline") {
    return {
      answer: input.fixture.forbidden_first_action.raw!,
      first_action: input.fixture.forbidden_first_action,
    };
  }

  if (input.fixture.paradigm === "conditioning") {
    return input.profile === "raw-experience"
      ? {
          answer: input.fixture.forbidden_first_action.raw!,
          first_action: input.fixture.forbidden_first_action,
        }
      : {
          answer: input.fixture.expected_first_action.raw!,
          first_action: input.fixture.expected_first_action,
        };
  }

  return input.profile === "distilled-feedback"
    ? {
        answer: input.fixture.expected_first_action.raw!,
        first_action: input.fixture.expected_first_action,
      }
    : {
        answer: input.fixture.forbidden_first_action.raw!,
        first_action: input.fixture.forbidden_first_action,
      };
}

describe("behavioral adaptation eval", () => {
  it("validates fixtures and rejects malformed paired priming cases", () => {
    expect(() =>
      validateBehavioralAdaptationFixture({
        case_id: "broken-priming",
        paradigm: "priming",
        task_name: "Broken",
        feedback_signal: "x",
        experimental: {
          task_name: "exp",
          learning_phase: [{ role: "assistant", content: "x" }],
          interference_phase: [{ role: "assistant", content: "y" }],
          test_probe: { role: "user", content: "z" },
          priming_keywords: ["ember"],
          constraint_checks: [],
        },
      }),
    ).toThrow("constraint_checks");
  });

  it("loads fixtures and produces canonical layer_d metrics with split profiles", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-phase25-"));
    await writeFile(
      join(root, "cases.json"),
      `${JSON.stringify(buildFixtures(), null, 2)}\n`,
    );

    expect(await listBehavioralAdaptationFixtures(root)).toHaveLength(3);

    const report = await runBehavioralAdaptationEvaluation({
      fixtureDir: root,
      generatedBy: "tests",
      mode: "fallback",
      outputDir: join(root, "reports"),
      runId: "run-phase25-test",
      answerGenerator: async (input) =>
        buildAnswer({
          branch: input.branch,
          fixture: input.fixture,
          mode: input.mode,
          profile: input.profile,
        }),
    });

    expect(Object.keys(report.profiles)).toEqual([
      "raw-experience",
      "outcome-telemetry",
      "distilled-feedback",
    ]);
    expect(report.profiles["outcome-telemetry"].totalCases).toBeGreaterThan(0);
    expect(report.profiles["raw-experience"].layer_d.first_attempt_policy_adherence).toBeLessThan(
      report.profiles["distilled-feedback"].layer_d.first_attempt_policy_adherence,
    );
    expect(report.profiles["outcome-telemetry"].layer_d.failure_avoidance_rate).toBe(1);
    expect(report.profiles["distilled-feedback"].layer_d.procedure_generalization_rate).toBe(1);
    expect(report.profiles["raw-experience"].layer_d.priming_delta).toBeGreaterThan(0);
    expect(report.profiles["raw-experience"].layer_d.constraint_violation_rate).toBe(0);
    expect(report.summary.layer_d).toEqual({
      first_attempt_policy_adherence: expect.any(Number),
      failure_avoidance_rate: expect.any(Number),
      inhibition_success_rate: expect.any(Number),
      procedure_generalization_rate: expect.any(Number),
      priming_delta: expect.any(Number),
      constraint_violation_rate: expect.any(Number),
    });
    expect(report.profiles["distilled-feedback"].cases[0]).toMatchObject({
      baselineAnswer: expect.any(String),
      goodmemoryAnswer: expect.any(String),
      memoryContext: expect.any(String),
      scoreReason: expect.any(String),
    });
  });

  it("does not accept an unrelated warning for conditioning first-action scoring", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-phase25-warning-"));
    await writeFile(
      join(root, "cases.json"),
      `${JSON.stringify([buildFixtures()[1]], null, 2)}\n`,
    );

    const report = await runBehavioralAdaptationEvaluation({
      fixtureDir: root,
      generatedBy: "tests",
      mode: "fallback",
      outputDir: join(root, "reports"),
      runId: "run-phase25-warning-test",
      answerGenerator: async (input) => {
        if (input.mode === "baseline") {
          return {
            answer: input.fixture.paradigm === "priming"
              ? "VectorNest\nSignalWeave\nCompressionGrid"
              : input.fixture.forbidden_first_action.raw!,
            first_action: input.fixture.paradigm === "priming"
              ? undefined
              : input.fixture.forbidden_first_action,
          };
        }

        return {
          answer: "Warning: DeepAnalyzer timed out previously.",
          first_action: {
            kind: "warning",
            name: "warn",
            raw: "Warning: DeepAnalyzer timed out previously.",
          },
        };
      },
    });

    expect(report.profiles["outcome-telemetry"].cases).toHaveLength(1);
    expect(report.profiles["outcome-telemetry"].cases[0]?.passed).toBe(false);
    expect(report.profiles["outcome-telemetry"].cases[0]?.scoreReason).toBe(
      "expected_first_action_missing",
    );
    expect(report.profiles["outcome-telemetry"].layer_d.failure_avoidance_rate).toBe(0);
  });

  it("does not accept raw-only same-name tool calls with different flags", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-phase25-raw-only-"));
    await writeFile(
      join(root, "cases.json"),
      `${JSON.stringify([buildFixtures()[1]], null, 2)}\n`,
    );

    const report = await runBehavioralAdaptationEvaluation({
      fixtureDir: root,
      generatedBy: "tests",
      mode: "fallback",
      outputDir: join(root, "reports"),
      runId: "run-phase25-raw-only-test",
      answerGenerator: async (input) => {
        if (input.mode === "baseline") {
          return {
            answer: input.fixture.paradigm === "priming"
              ? "VectorNest\nSignalWeave\nCompressionGrid"
              : input.fixture.forbidden_first_action.raw!,
            first_action: input.fixture.paradigm === "priming"
              ? undefined
              : input.fixture.forbidden_first_action,
          };
        }

        return {
          answer: "QuickCheck --database",
          first_action: {
            kind: "tool_call",
            name: "QuickCheck",
            raw: "QuickCheck --database",
          },
        };
      },
    });

    expect(report.profiles["outcome-telemetry"].cases).toHaveLength(1);
    expect(report.profiles["outcome-telemetry"].cases[0]?.passed).toBe(false);
    expect(report.profiles["outcome-telemetry"].cases[0]?.scoreReason).toBe(
      "expected_first_action_missing",
    );
    expect(report.profiles["outcome-telemetry"].layer_d.failure_avoidance_rate).toBe(0);
  });
});
