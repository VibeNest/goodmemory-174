import { describe, expect, it } from "bun:test";
import {
  parsePhase30EvalCliOptions,
  resolvePhase30FallbackOutputDir,
  resolvePhase30FixtureDir,
  runPhase30FallbackEval,
} from "../../scripts/run-phase-30-eval";
import type {
  BehavioralAdaptationReport,
  RunBehavioralAdaptationEvaluationOptions,
} from "../../src/eval/behavioral-adaptation";

function buildPhase30Report(): BehavioralAdaptationReport {
  return {
    generatedAt: "2026-04-21T12:00:00.000Z",
    generatedBy: "tests",
    mode: "fallback",
    outputDir: "/tmp/goodmemory/reports/eval/fallback/phase-30",
    profiles: {
      "raw-experience": {
        behavioralRegressionCases: [
          "raw-experience:conditioning-detailed-analysis-timeout-trace",
          "raw-experience:conditioning-prod-deploy-warning-trace",
          "raw-experience:conditioning-safe-delete-user-correction-trace",
          "raw-experience:procedural-copy-generalization-trace",
        ],
        blockingSummary: {
          conditioning: {
            failedCases: [
              "conditioning-detailed-analysis-timeout-trace",
              "conditioning-prod-deploy-warning-trace",
              "conditioning-safe-delete-user-correction-trace",
            ],
            passedCases: 0,
            totalCases: 3,
          },
          procedural: {
            failedCases: ["procedural-copy-generalization-trace"],
            passedCases: 0,
            totalCases: 1,
          },
        },
        cases: [],
        executionFailures: 0,
        explicitRecallLeakCount: 0,
        layer_d: {
          first_attempt_policy_adherence: 0,
          failure_avoidance_rate: 0,
          inhibition_success_rate: 0,
          procedure_generalization_rate: 0,
          priming_delta: 0.5,
          constraint_violation_rate: 0,
        },
        totalCases: 6,
      },
      "outcome-telemetry": {
        behavioralRegressionCases: [],
        blockingSummary: {
          conditioning: {
            failedCases: [],
            passedCases: 3,
            totalCases: 3,
          },
          procedural: {
            failedCases: [],
            passedCases: 0,
            totalCases: 0,
          },
        },
        cases: [
          {
            baselineAnswer: "deploy --prod 512",
            baselineTrace: {
              cue: "production deploy",
              hostKind: "codex",
              traceId: "baseline-trace",
              events: [
                {
                  stepIndex: 0,
                  actionKind: "command",
                  actionName: "deploy",
                  args: ["--prod", "512"],
                  raw: "deploy --prod 512",
                  outcome: "failure",
                },
              ],
            },
            blocking: true,
            caseId: "conditioning-prod-deploy-warning-trace",
            constraintChecks: 0,
            constraintViolations: [],
            explicitRecallLeak: false,
            firstAction: {
              kind: "warning",
              name: "approval_required",
              raw: "Warning: request production approval before deploy --prod 512.",
            },
            firstActionSource: "trace",
            goodmemoryAnswer: "Warning: request production approval before deploy --prod 512.",
            goodmemoryTrace: {
              cue: "production deploy",
              hostKind: "codex",
              traceId: "goodmemory-trace",
              events: [
                {
                  stepIndex: 0,
                  actionKind: "warning",
                  actionName: "approval_required",
                  raw: "Warning: request production approval before deploy --prod 512.",
                  outcome: "success",
                },
              ],
            },
            memoryContext: "Avoid direct deploy --prod until approval is present.",
            outcomeTelemetryLineage: {
              acceptedPromotionIds: ["promotion-1"],
              activeValidatedPatternIds: ["feedback-1"],
              activeValidatedPatternRules: [
                "When production deploys were blocked, warn for approval before deploy --prod.",
              ],
              evidenceIds: ["evidence-1"],
              experienceIds: ["experience-1", "experience-2"],
              proposalIds: ["proposal-1"],
            },
            paradigm: "conditioning",
            passed: true,
            profile: "outcome-telemetry",
            scoreReason: "expected_first_action_matched",
            taskName: "Trace-backed production deploy approval warning",
          },
        ],
        executionFailures: 0,
        explicitRecallLeakCount: 0,
        layer_d: {
          first_attempt_policy_adherence: 1,
          failure_avoidance_rate: 1,
          inhibition_success_rate: 1,
          procedure_generalization_rate: 0,
          priming_delta: 0,
          constraint_violation_rate: 0,
        },
        totalCases: 3,
      },
      "distilled-feedback": {
        behavioralRegressionCases: [],
        blockingSummary: {
          conditioning: {
            failedCases: [],
            passedCases: 3,
            totalCases: 3,
          },
          procedural: {
            failedCases: [],
            passedCases: 1,
            totalCases: 1,
          },
        },
        cases: [],
        executionFailures: 0,
        explicitRecallLeakCount: 0,
        layer_d: {
          first_attempt_policy_adherence: 1,
          failure_avoidance_rate: 1,
          inhibition_success_rate: 1,
          procedure_generalization_rate: 1,
          priming_delta: 0.5,
          constraint_violation_rate: 0,
        },
        totalCases: 6,
      },
    },
    runDirectory: "/tmp/goodmemory/reports/eval/fallback/phase-30/run-phase30",
    runId: "run-phase30",
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: {
      behavioralRegressionCases: [
        "raw-experience:conditioning-detailed-analysis-timeout-trace",
        "raw-experience:conditioning-prod-deploy-warning-trace",
        "raw-experience:conditioning-safe-delete-user-correction-trace",
        "raw-experience:procedural-copy-generalization-trace",
      ],
      blockingSummary: {
        conditioning: {
          failedCases: [
            "conditioning-detailed-analysis-timeout-trace",
            "conditioning-prod-deploy-warning-trace",
            "conditioning-safe-delete-user-correction-trace",
          ],
          passedCases: 6,
          totalCases: 9,
        },
        procedural: {
          failedCases: ["procedural-copy-generalization-trace"],
          passedCases: 1,
          totalCases: 2,
        },
      },
      executionFailures: 0,
      explicitRecallLeakCount: 0,
      layer_d: {
        first_attempt_policy_adherence: 0.6,
        failure_avoidance_rate: 0.6667,
        inhibition_success_rate: 0.6667,
        procedure_generalization_rate: 0.5,
        priming_delta: 0.3333,
        constraint_violation_rate: 0,
      },
      totalCases: 15,
    },
  };
}

describe("run-phase-30 script", () => {
  it("resolves phase-30 deterministic output and fixture directories", () => {
    expect(resolvePhase30FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-30",
    );
    expect(resolvePhase30FixtureDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/fixtures/behavioral-enactment",
    );
  });

  it("runs phase-30 fallback eval with trace-required structured scoring", async () => {
    let receivedInput: RunBehavioralAdaptationEvaluationOptions | undefined;

    const report = await runPhase30FallbackEval(
      {
        runId: "run-phase30",
      },
      {
        runEvaluation: async (input) => {
          receivedInput = input;
          return {
            ...buildPhase30Report(),
            outputDir: input.outputDir,
            runId: input.runId ?? "run-phase30",
          };
        },
      },
    );

    expect(receivedInput?.requireTraceForStructuredCases).toBe(true);
    expect(receivedInput?.scopePrefix).toBe("phase30");
    expect(report.runId).toBe("run-phase30");
    expect(report.profiles["outcome-telemetry"].cases[0]?.firstActionSource).toBe(
      "trace",
    );
    expect(
      report.profiles["outcome-telemetry"].cases[0]?.outcomeTelemetryLineage?.proposalIds,
    ).toEqual(["proposal-1"]);
  });

  it("parses phase-30 eval cli flags", () => {
    expect(
      parsePhase30EvalCliOptions([
        "bun",
        "run",
        "scripts/run-phase-30-eval.ts",
        "--output-dir",
        "/tmp/phase30",
        "--run-id",
        "run-phase30",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase30",
      runId: "run-phase30",
    });
  });
});
