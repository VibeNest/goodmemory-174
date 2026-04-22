import { resolve } from "node:path";
import { describe, expect, it } from "bun:test";
import {
  buildPhase31GateCommands,
  buildPhase31GateRunId,
  buildPhase31LiveReportContract,
  parsePhase31GateCliOptions,
  resolvePhase31CanonicalLiveReportPath,
  resolvePhase31GateOutputDir,
  runPhase31GateCli,
  runPhase31QualityGate,
  validatePhase31LiveBehavioralReport,
} from "../../scripts/run-phase-31-gate";
import type {
  BehavioralAdaptationProfile,
  BehavioralAdaptationReport,
  BehavioralCaseResult,
  BehavioralProfileSummary,
} from "../../src/eval/behavioral-adaptation";

const TEST_ROOT = "/tmp/goodmemory";
const TEST_CONTRACT = buildPhase31LiveReportContract(TEST_ROOT);
const REPO_CONTRACT = buildPhase31LiveReportContract(
  resolve(import.meta.dir, "../.."),
);
const CONDITIONING_CASE_IDS = [
  "conditioning-detailed-analysis-timeout-trace",
  "conditioning-safe-delete-user-correction-trace",
  "conditioning-prod-deploy-warning-trace",
] as const;
const PROCEDURAL_CASE_ID = "procedural-copy-generalization-trace";
const PRIMING_CASE_ID = "priming-volcanic-naming-trace-research";

function buildBlockingCase(input: {
  caseId: string;
  executable?: boolean;
  withCorrection?: boolean;
  withLineage?: boolean;
  passed: boolean;
  profile: BehavioralAdaptationProfile;
  paradigm?: "conditioning" | "procedural";
}): BehavioralCaseResult {
  const executable = input.executable ?? true;
  const actionName = executable ? "QuickCheck" : "approval_required";

  return {
    baselineAnswer: executable ? "DeepAnalyzer --detailed" : "Warning: approval required.",
    baselineTrace: {
      cue: input.caseId,
      hostKind: "codex",
      traceId: `baseline-${input.caseId}`,
      events: [
        {
          actionKind: executable ? "tool_call" : "warning",
          actionName: executable ? "DeepAnalyzer" : "warning",
          outcome: executable ? "failure" : "success",
          outcomeSource: executable ? "host_lifecycle" : "warning_message",
          raw: executable ? "DeepAnalyzer --detailed" : "Warning: approval required.",
          stepIndex: 0,
        },
      ],
    },
    blocking: true,
    caseId: input.caseId,
    constraintChecks: 0,
    constraintViolations: [],
    explicitRecallLeak: false,
    firstAction: executable
      ? {
          kind: "tool_call",
          name: actionName,
          raw: "QuickCheck --network",
        }
      : {
          kind: "warning",
          name: actionName,
          raw: "Warning: approval required before deploy --prod 512.",
        },
    firstActionSource: "trace",
    goodmemoryAnswer: executable
      ? "QuickCheck --network"
      : "Warning: approval required before deploy --prod 512.",
    goodmemoryTrace: {
      cue: input.caseId,
      hostKind: "codex",
      traceId: `goodmemory-${input.caseId}`,
      events: [
        {
          actionKind: executable ? "tool_call" : "warning",
          actionName,
          outcome: input.passed ? "success" : "failure",
          outcomeSource: executable ? "host_lifecycle" : "warning_message",
          raw: executable
            ? "QuickCheck --network"
            : "Warning: approval required before deploy --prod 512.",
          stepIndex: 0,
        },
        ...(input.withCorrection
          ? [{
              actionKind: "warning" as const,
              actionName: "warning",
              correctionOfStepIndex: 0,
              outcome: "user_corrected" as const,
              outcomeSource: "warning_message" as const,
              raw: "Warning: fallback to QuickCheck --network.",
              stepIndex: 1,
              turnId: "item_2",
            }]
          : []),
      ],
    },
    memoryContext: "Developer memory notes.",
    outcomeTelemetryLineage: input.withLineage
      ? {
          acceptedPromotionIds: ["promotion-1"],
          activeValidatedPatternIds: ["feedback-1"],
          activeValidatedPatternRules: ["Avoid DeepAnalyzer and use QuickCheck."],
          evidenceIds: ["evidence-1"],
          experienceIds: ["experience-1", "experience-2"],
          proposalIds: ["proposal-1"],
        }
      : undefined,
    paradigm: input.paradigm ?? "conditioning",
    passed: input.passed,
    profile: input.profile,
    scoreReason: input.passed
      ? "expected_first_action_matched"
      : "expected_first_action_missing",
    taskName: input.caseId,
  };
}

function buildPrimingCase(input: {
  branch: "control" | "experimental";
  profile: "distilled-feedback" | "raw-experience";
}): BehavioralCaseResult {
  return {
    baselineAnswer: "Delta\nAtlas\nVector",
    blocking: false,
    branch: input.branch,
    caseId: PRIMING_CASE_ID,
    constraintChecks: 3,
    constraintViolations: [],
    explicitRecallLeak: false,
    goodmemoryAnswer:
      input.branch === "experimental" ? "Ember\nBasalt\nSurge" : "Delta\nAtlas\nVector",
    memoryContext: "",
    paradigm: "priming",
    passed: true,
    primingScore: input.branch === "experimental" ? 0.5 : 0,
    profile: input.profile,
    scoreReason: "priming_branch_scored",
    taskName: "Volcanic theme creative naming",
  };
}

function buildProfileSummary(cases: BehavioralCaseResult[]): BehavioralProfileSummary {
  const blockingCases = cases.filter((caseResult) => caseResult.blocking);
  const conditioningCases = blockingCases.filter(
    (caseResult) => caseResult.paradigm === "conditioning",
  );
  const proceduralCases = blockingCases.filter(
    (caseResult) => caseResult.paradigm === "procedural",
  );

  return {
    behavioralRegressionCases: blockingCases
      .filter((caseResult) => !caseResult.passed)
      .map((caseResult) => `${caseResult.profile}:${caseResult.caseId}`),
    blockingSummary: {
      conditioning: {
        failedCases: conditioningCases
          .filter((caseResult) => !caseResult.passed)
          .map((caseResult) => caseResult.caseId),
        passedCases: conditioningCases.filter((caseResult) => caseResult.passed).length,
        totalCases: conditioningCases.length,
      },
      procedural: {
        failedCases: proceduralCases
          .filter((caseResult) => !caseResult.passed)
          .map((caseResult) => caseResult.caseId),
        passedCases: proceduralCases.filter((caseResult) => caseResult.passed).length,
        totalCases: proceduralCases.length,
      },
    },
    cases,
    executionFailures: 0,
    explicitRecallLeakCount: 0,
    layer_d: {
      constraint_violation_rate: 0,
      failure_avoidance_rate: 0.5556,
      first_attempt_policy_adherence: 0.5833,
      inhibition_success_rate: 0.5556,
      priming_delta: 0.3333,
      procedure_generalization_rate: 0.6667,
    },
    totalCases: cases.length,
  };
}

function buildLiveReport(
  overrides: Partial<BehavioralAdaptationReport> = {},
  contract = TEST_CONTRACT,
): BehavioralAdaptationReport {
  const rawCases = [
    ...CONDITIONING_CASE_IDS.map((caseId, index) =>
      buildBlockingCase({
        caseId,
        executable: index !== 2,
        passed: index === 1,
        profile: "raw-experience",
      })
    ),
    buildBlockingCase({
      caseId: PROCEDURAL_CASE_ID,
      paradigm: "procedural",
      passed: false,
      profile: "raw-experience",
    }),
    buildPrimingCase({ branch: "experimental", profile: "raw-experience" }),
    buildPrimingCase({ branch: "control", profile: "raw-experience" }),
  ];
  const outcomeCases = [
    buildBlockingCase({
      caseId: CONDITIONING_CASE_IDS[0],
      passed: true,
      profile: "outcome-telemetry",
      withLineage: true,
    }),
    buildBlockingCase({
      caseId: CONDITIONING_CASE_IDS[1],
      passed: true,
      profile: "outcome-telemetry",
      withCorrection: true,
    }),
    buildBlockingCase({
      caseId: CONDITIONING_CASE_IDS[2],
      executable: false,
      passed: false,
      profile: "outcome-telemetry",
    }),
    buildBlockingCase({
      caseId: PROCEDURAL_CASE_ID,
      paradigm: "procedural",
      passed: true,
      profile: "outcome-telemetry",
      withLineage: true,
    }),
  ];
  const distilledCases = [
    buildBlockingCase({
      caseId: CONDITIONING_CASE_IDS[0],
      passed: false,
      profile: "distilled-feedback",
    }),
    buildBlockingCase({
      caseId: CONDITIONING_CASE_IDS[1],
      passed: true,
      profile: "distilled-feedback",
    }),
    buildBlockingCase({
      caseId: CONDITIONING_CASE_IDS[2],
      executable: false,
      passed: true,
      profile: "distilled-feedback",
    }),
    buildBlockingCase({
      caseId: PROCEDURAL_CASE_ID,
      paradigm: "procedural",
      passed: true,
      profile: "distilled-feedback",
    }),
    buildPrimingCase({ branch: "experimental", profile: "distilled-feedback" }),
    buildPrimingCase({ branch: "control", profile: "distilled-feedback" }),
  ];
  const profiles = {
    "raw-experience": buildProfileSummary(rawCases),
    "outcome-telemetry": buildProfileSummary(outcomeCases),
    "distilled-feedback": buildProfileSummary(distilledCases),
  };

  return {
    evidenceContract: {
      phase31: {
        fixtureDir: contract.expectedFixtureDir,
        hostRuntime: {
          blockingExecutableOutcomeSource: "host_lifecycle",
          correctionLineage: "native_host_events",
          modelTransport: "codex-exec-json",
          structuredFirstAction: "disabled",
          warningOutcomeSource: "warning_message",
        },
        providerBackedStorage: {
          envVar: "GOODMEMORY_TEST_POSTGRES_URL",
          memoryStackPreflight: "passed",
          provider: "postgres",
          storageBootstrap: "passed",
        },
        requireTraceForStructuredCases: true,
        runner: contract.expectedGeneratedBy,
        scopePrefix: "phase31-live",
      },
    },
    generatedAt: "2026-04-22T00:00:00.000Z",
    generatedBy: contract.expectedGeneratedBy,
    mode: "live-memory",
    outputDir: contract.expectedOutputDir,
    profiles,
    runDirectory: contract.expectedRunDirectory,
    runId: contract.expectedRunId,
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: {
      behavioralRegressionCases: [
        ...profiles["raw-experience"].behavioralRegressionCases,
        ...profiles["outcome-telemetry"].behavioralRegressionCases,
        ...profiles["distilled-feedback"].behavioralRegressionCases,
      ],
      blockingSummary: {
        conditioning: {
          failedCases: [
            ...profiles["raw-experience"].blockingSummary.conditioning.failedCases,
            ...profiles["outcome-telemetry"].blockingSummary.conditioning.failedCases,
            ...profiles["distilled-feedback"].blockingSummary.conditioning.failedCases,
          ],
          passedCases: 5,
          totalCases: 9,
        },
        procedural: {
          failedCases: [
            ...profiles["raw-experience"].blockingSummary.procedural.failedCases,
          ],
          passedCases: 2,
          totalCases: 3,
        },
      },
      executionFailures: 0,
      explicitRecallLeakCount: 0,
      layer_d: {
        constraint_violation_rate: 0,
        failure_avoidance_rate: 0.5556,
        first_attempt_policy_adherence: 0.5833,
        inhibition_success_rate: 0.5556,
        priming_delta: 0.3333,
        procedure_generalization_rate: 0.6667,
      },
      totalCases: 16,
    },
    ...overrides,
  };
}

describe("run-phase-31 gate", () => {
  it("builds phase-31 gate commands and canonical paths", () => {
    expect(resolvePhase31GateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-31",
    );
    expect(resolvePhase31CanonicalLiveReportPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-31/run-phase31-live-current/report.json",
    );
    expect(buildPhase31GateCommands("/tmp/goodmemory")).toEqual([
      {
        args: ["bun", "run", "typecheck"],
        cwd: "/tmp/goodmemory",
        label: "typecheck",
      },
      {
        args: [
          "bun",
          "test",
          "tests/unit/host.behavioral-trace.test.ts",
          "tests/unit/host.codex-exec-behavioral-trace.test.ts",
          "tests/unit/host.behavioral-trace-recorder.test.ts",
          "tests/unit/host.behavioral-trace-bridge.test.ts",
          "tests/unit/host.adapter.test.ts",
          "tests/unit/eval.behavioral-adaptation.test.ts",
          "tests/unit/run-phase-31.script.test.ts",
          "tests/unit/run-phase-31.gate.test.ts",
          "tests/integration/evolution.outcome-telemetry.test.ts",
        ],
        cwd: "/tmp/goodmemory",
        label: "phase-31-targeted-regressions",
      },
      {
        args: ["bun", "run", "eval:phase-31"],
        cwd: "/tmp/goodmemory",
        label: "phase-31-fallback-eval",
      },
    ]);
    expect(buildPhase31GateRunId("2026-04-22T12:34:56.000Z")).toBe(
      "run-20260422123456",
    );
  });

  it("validates the canonical phase-31 live report contract", async () => {
    const report = buildLiveReport({}, REPO_CONTRACT);
    const livePath = resolvePhase31CanonicalLiveReportPath(resolve(import.meta.dir, "../.."));

    const evidence = await validatePhase31LiveBehavioralReport({
      contract: REPO_CONTRACT,
      liveReportPath: livePath,
      readTextFile: async () => JSON.stringify(report),
    });

    expect(evidence).toEqual({
      blockingCases: 12,
      canonicalLiveReportPath: livePath,
      firstAttemptPolicyAdherence: 0.5833,
      hostLifecycleBlockingCases: 9,
      liveReportPath: livePath,
      nativeCorrectionLineageCases: 1,
      passedBlockingCases: 7,
      reason: "Phase 31 live-memory behavioral report is trace-backed and accepted.",
      status: "accepted",
      traceBackedBlockingCases: 12,
    });
  });

  it("blocks reports whose executable blocking outcomes are not host-lifecycle derived", async () => {
    const brokenReport = buildLiveReport();
    const firstExecutableCase = brokenReport.profiles["raw-experience"].cases.find(
      (caseResult) => caseResult.firstAction?.kind === "tool_call",
    );
    if (!firstExecutableCase?.goodmemoryTrace?.events[0]) {
      throw new Error("expected an executable case");
    }
    delete firstExecutableCase.goodmemoryTrace.events[0].outcomeSource;

    const evidence = await validatePhase31LiveBehavioralReport({
      contract: TEST_CONTRACT,
      liveReportPath: TEST_CONTRACT.canonicalLiveReportPath,
      readTextFile: async () => JSON.stringify(brokenReport),
    });

    expect(evidence.status).toBe("blocked");
    expect(evidence.reason).toContain("host-lifecycle derived");
  });

  it("blocks reports whose warning-only blocking outcomes are not warning-message derived", async () => {
    const brokenReport = buildLiveReport();
    const warningOnlyCase = brokenReport.profiles["outcome-telemetry"].cases.find(
      (caseResult) => caseResult.firstAction?.kind === "warning",
    );
    if (!warningOnlyCase?.goodmemoryTrace?.events[0]) {
      throw new Error("expected a warning-only case");
    }
    warningOnlyCase.goodmemoryTrace.events[0].outcomeSource = "host_lifecycle";

    const evidence = await validatePhase31LiveBehavioralReport({
      contract: TEST_CONTRACT,
      liveReportPath: TEST_CONTRACT.canonicalLiveReportPath,
      readTextFile: async () => JSON.stringify(brokenReport),
    });

    expect(evidence.status).toBe("blocked");
    expect(evidence.reason).toContain("warning-message derived");
  });

  it("blocks reports that lack native targeted correction lineage", async () => {
    const brokenReport = buildLiveReport();
    for (const profile of Object.values(brokenReport.profiles)) {
      for (const caseResult of profile.cases) {
        caseResult.goodmemoryTrace?.events.forEach((event) => {
          delete event.correctionOfStepIndex;
        });
      }
    }

    const evidence = await validatePhase31LiveBehavioralReport({
      contract: TEST_CONTRACT,
      liveReportPath: TEST_CONTRACT.canonicalLiveReportPath,
      readTextFile: async () => JSON.stringify(brokenReport),
    });

    expect(evidence.status).toBe("blocked");
    expect(evidence.reason).toContain("native targeted correction lineage");
  });

  it("runs the phase-31 quality gate and writes an accepted report", async () => {
    const writes = new Map<string, string>();
    const report = await runPhase31QualityGate(
      {
        liveReportPath: REPO_CONTRACT.canonicalLiveReportPath,
        outputDir: resolvePhase31GateOutputDir(resolve(import.meta.dir, "../..")),
        runId: "run-phase31-gate",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-04-22T12:00:00.000Z",
        readTextFile: async (path) => {
          if (path === REPO_CONTRACT.canonicalLiveReportPath) {
            return JSON.stringify(buildLiveReport({}, REPO_CONTRACT));
          }
          throw new Error(`unexpected read: ${path}`);
        },
        runCommand: async (command) => ({
          durationMs: 10,
          exitCode: 0,
          stderr: "",
          stdout: `ok:${command.label}`,
        }),
        writeTextFile: async (path, content) => {
          writes.set(path, content);
        },
      },
    );

    expect(report.acceptance).toEqual({
      decision: "accepted",
      reason:
        "Phase 31 deterministic regressions and a native Codex host trace-backed provider live-memory behavioral report are accepted.",
    });
    expect(
      writes.get(
        `${resolve(import.meta.dir, "../..")}/reports/quality-gates/phase-31/run-phase31-gate/phase-31-quality-gate.json`,
      ),
    ).toContain("\"phase\": \"phase-31\"");
  });

  it("parses phase-31 gate cli flags and wires the CLI wrapper", async () => {
    expect(
      parsePhase31GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-31-gate.ts",
        "--live-report",
        "/tmp/live/report.json",
        "--output-dir",
        "/tmp/gates",
        "--run-id",
        "run-phase31-gate",
      ]),
    ).toEqual({
      liveReportPath: "/tmp/live/report.json",
      outputDir: "/tmp/gates",
      runId: "run-phase31-gate",
    });

    const logs: string[] = [];
    const exits: number[] = [];
    await runPhase31GateCli({
      argv: ["bun", "run", "scripts/run-phase-31-gate.ts"],
      exit: (code) => {
        exits.push(code);
      },
      log: (message) => {
        logs.push(message);
      },
      runGate: async () => ({
        acceptance: {
          decision: "accepted",
          reason: "accepted",
        },
        commands: [],
        evidence: {
          liveMemoryReport: {
            blockingCases: 12,
            canonicalLiveReportPath: TEST_CONTRACT.canonicalLiveReportPath,
            firstAttemptPolicyAdherence: 0.5833,
            hostLifecycleBlockingCases: 8,
            liveReportPath: TEST_CONTRACT.canonicalLiveReportPath,
            nativeCorrectionLineageCases: 1,
            passedBlockingCases: 7,
            reason: "accepted",
            status: "accepted",
            traceBackedBlockingCases: 12,
          },
        },
        generatedAt: "2026-04-22T12:00:00.000Z",
        generatedBy: "tests",
        phase: "phase-31",
        runDirectory: "reports/quality-gates/phase-31/run-phase31-gate",
        runId: "run-phase31-gate",
        scope: {
          inScope: [],
          outOfScope: [],
        },
      }),
    });

    expect(exits).toEqual([]);
    expect(logs.join("\n")).toContain("\"phase\": \"phase-31\"");
  });
});
