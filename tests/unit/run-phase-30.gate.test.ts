import { resolve } from "node:path";
import { describe, expect, it } from "bun:test";
import {
  buildPhase30GateCommands,
  buildPhase30GateRunId,
  buildPhase30LiveReportContract,
  parsePhase30GateCliOptions,
  resolvePhase30CanonicalLiveReportPath,
  resolvePhase30GateOutputDir,
  runPhase30GateCli,
  runPhase30QualityGate,
  validatePhase30LiveBehavioralReport,
} from "../../scripts/run-phase-30-gate";
import type {
  BehavioralAdaptationProfile,
  BehavioralAdaptationReport,
  BehavioralCaseResult,
  BehavioralProfileSummary,
} from "../../src/eval/behavioral-adaptation";

const TEST_ROOT = "/tmp/goodmemory";
const TEST_CONTRACT = buildPhase30LiveReportContract(TEST_ROOT);
const REPO_CONTRACT = buildPhase30LiveReportContract(
  resolve(import.meta.dir, "../.."),
);
const PHASE30_CONDITIONING_CASE_IDS = [
  "conditioning-detailed-analysis-timeout-trace",
  "conditioning-safe-delete-user-correction-trace",
  "conditioning-prod-deploy-warning-trace",
] as const;
const PHASE30_PROCEDURAL_CASE_ID = "procedural-copy-generalization-trace";
const PHASE30_PRIMING_CASE_ID = "priming-volcanic-naming-trace-research";

function buildTrace(raw: string, actionName = "QuickCheck") {
  return {
    cue: "detailed analysis",
    hostKind: "codex" as const,
    traceId: `trace-${raw.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
    events: [
      {
        stepIndex: 0,
        actionKind: "tool_call" as const,
        actionName,
        raw,
        outcome: "success" as const,
      },
    ],
  };
}

function buildCase(input: {
  caseId: string;
  paradigm?: "conditioning" | "procedural";
  passed: boolean;
  profile: BehavioralAdaptationProfile;
  withLineage?: boolean;
}): BehavioralCaseResult {
  return {
    baselineAnswer: "DeepAnalyzer --detailed",
    baselineTrace: buildTrace("DeepAnalyzer --detailed", "DeepAnalyzer"),
    blocking: true,
    caseId: input.caseId,
    constraintChecks: 0,
    constraintViolations: [],
    explicitRecallLeak: false,
    firstAction: input.passed
      ? {
          kind: "tool_call",
          name: "QuickCheck",
          raw: "QuickCheck --network",
        }
      : {
          kind: "tool_call",
          name: "DeepAnalyzer",
          raw: "DeepAnalyzer --detailed",
        },
    firstActionSource: "trace",
    goodmemoryAnswer: input.passed ? "QuickCheck --network" : "DeepAnalyzer --detailed",
    goodmemoryTrace: input.passed
      ? buildTrace("QuickCheck --network", "QuickCheck")
      : buildTrace("DeepAnalyzer --detailed", "DeepAnalyzer"),
    memoryContext: "Developer memory notes: avoid DeepAnalyzer and use QuickCheck.",
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
      : "first_action_matched_forbidden",
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
    caseId: PHASE30_PRIMING_CASE_ID,
    constraintChecks: 3,
    constraintViolations: [],
    explicitRecallLeak: false,
    goodmemoryAnswer:
      input.branch === "experimental" ? "Ember\nBasalt\nSurge" : "Delta\nAtlas\nVector",
    memoryContext:
      input.profile === "distilled-feedback"
        ? "Subtle volcanic imagery may influence naming without quote reuse."
        : "",
    paradigm: "priming",
    passed: true,
    primingScore: input.branch === "experimental" ? 0.5 : 0,
    profile: input.profile,
    scoreReason: "priming_branch_scored",
    taskName: "Volcanic theme creative naming",
  };
}

function buildProfileSummary(
  cases: BehavioralCaseResult[],
): BehavioralProfileSummary {
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
        passedCases: conditioningCases.filter((caseResult) => caseResult.passed)
          .length,
        totalCases: conditioningCases.length,
      },
      procedural: {
        failedCases: proceduralCases
          .filter((caseResult) => !caseResult.passed)
          .map((caseResult) => caseResult.caseId),
        passedCases: proceduralCases.filter((caseResult) => caseResult.passed)
          .length,
        totalCases: proceduralCases.length,
      },
    },
    cases,
    executionFailures: 0,
    explicitRecallLeakCount: 0,
    layer_d: {
      first_attempt_policy_adherence:
        blockingCases.length === 0
          ? 0
          : blockingCases.filter((caseResult) => caseResult.passed).length /
            blockingCases.length,
      failure_avoidance_rate:
        conditioningCases.length === 0
          ? 0
          : conditioningCases.filter((caseResult) => caseResult.passed).length /
            conditioningCases.length,
      inhibition_success_rate:
        conditioningCases.length === 0
          ? 0
          : conditioningCases.filter((caseResult) => caseResult.passed).length /
            conditioningCases.length,
      procedure_generalization_rate:
        proceduralCases.length === 0
          ? 0
          : proceduralCases.filter((caseResult) => caseResult.passed).length /
            proceduralCases.length,
      priming_delta: cases.some((caseResult) => caseResult.paradigm === "priming")
        ? 0.5
        : 0,
      constraint_violation_rate: 0,
    },
    totalCases: cases.length,
  };
}

function buildLiveReport(
  overrides: Partial<BehavioralAdaptationReport> = {},
  contract = TEST_CONTRACT,
): BehavioralAdaptationReport {
  const rawCases = [
    ...PHASE30_CONDITIONING_CASE_IDS.map((caseId) =>
      buildCase({
        caseId,
        passed: false,
        profile: "raw-experience",
      }),
    ),
    buildCase({
      caseId: PHASE30_PROCEDURAL_CASE_ID,
      paradigm: "procedural",
      passed: false,
      profile: "raw-experience",
    }),
    buildPrimingCase({ branch: "experimental", profile: "raw-experience" }),
    buildPrimingCase({ branch: "control", profile: "raw-experience" }),
  ];
  const outcomeCases = PHASE30_CONDITIONING_CASE_IDS.map((caseId, index) =>
    buildCase({
      caseId,
      passed: index > 0,
      profile: "outcome-telemetry",
      withLineage: index === 1,
    }),
  );
  outcomeCases.push(
    buildCase({
      caseId: PHASE30_PROCEDURAL_CASE_ID,
      paradigm: "procedural",
      passed: true,
      profile: "outcome-telemetry",
      withLineage: true,
    }),
  );
  const distilledCases = [
    ...PHASE30_CONDITIONING_CASE_IDS.map((caseId) =>
      buildCase({
        caseId,
        passed: true,
        profile: "distilled-feedback",
      }),
    ),
    buildCase({
      caseId: PHASE30_PROCEDURAL_CASE_ID,
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
      phase30: {
        fixtureDir: contract.expectedFixtureDir,
        hostRuntime: {
          modelTransport: "codex-exec-json",
          structuredFirstAction: "disabled",
        },
        providerBackedStorage: {
          envVar: "GOODMEMORY_TEST_POSTGRES_URL",
          memoryStackPreflight: "passed",
          provider: "postgres",
          storageBootstrap: "passed",
        },
        requireTraceForStructuredCases: true,
        runner: contract.expectedGeneratedBy,
        scopePrefix: "phase30-live",
      },
    },
    generatedAt: "2026-04-21T12:00:00.000Z",
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
            ...profiles["outcome-telemetry"].blockingSummary.procedural.failedCases,
            ...profiles["distilled-feedback"].blockingSummary.procedural.failedCases,
          ],
          passedCases: 2,
          totalCases: 3,
        },
      },
      executionFailures: 0,
      explicitRecallLeakCount: 0,
      layer_d: {
        first_attempt_policy_adherence: 0.5833,
        failure_avoidance_rate: 0.5556,
        inhibition_success_rate: 0.5556,
        procedure_generalization_rate: 0.6667,
        priming_delta: 0,
        constraint_violation_rate: 0,
      },
      totalCases: 16,
    },
    ...overrides,
  };
}

describe("run-phase-30 gate", () => {
  it("resolves output directories, canonical live report path, and command list", () => {
    expect(resolvePhase30GateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-30",
    );
    expect(resolvePhase30CanonicalLiveReportPath("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-30/run-phase30-live-current/report.json",
    );
    expect(buildPhase30GateRunId("2026-04-21T12:00:00.000Z")).toBe(
      "run-20260421120000",
    );
    expect(buildPhase30GateCommands("/tmp/goodmemory").map((command) => command.label)).toEqual([
      "typecheck",
      "phase-30-targeted-regressions",
      "phase-30-fallback-eval",
    ]);
  });

  it("accepts a trace-backed live-memory behavioral report with a strict GoodMemory majority", async () => {
    const evidence = await validatePhase30LiveBehavioralReport({
      contract: TEST_CONTRACT,
      liveReportPath: TEST_CONTRACT.canonicalLiveReportPath,
      readTextFile: async () => JSON.stringify(buildLiveReport()),
    });

    expect(evidence.status).toBe("accepted");
    expect(evidence.blockingCases).toBe(12);
    expect(evidence.passedBlockingCases).toBe(7);
    expect(evidence.traceBackedBlockingCases).toBe(12);
  });

  it("blocks live-memory reports that are not trace-backed", async () => {
    const report = buildLiveReport();
    report.profiles["outcome-telemetry"].cases[0] = {
      ...report.profiles["outcome-telemetry"].cases[0]!,
      firstActionSource: "self_reported",
    };

    const evidence = await validatePhase30LiveBehavioralReport({
      contract: TEST_CONTRACT,
      liveReportPath: TEST_CONTRACT.canonicalLiveReportPath,
      readTextFile: async () => JSON.stringify(report),
    });

    expect(evidence.status).toBe("blocked");
    expect(evidence.reason).toContain("not trace-backed");
  });

  it("blocks live-memory reports outside the canonical Phase 30 evidence path", async () => {
    const evidence = await validatePhase30LiveBehavioralReport({
      contract: TEST_CONTRACT,
      liveReportPath: "/tmp/live/report.json",
      readTextFile: async () => JSON.stringify(buildLiveReport()),
    });

    expect(evidence.status).toBe("blocked");
    expect(evidence.reason).toContain("path is not canonical");
  });

  it("blocks live-memory reports without canonical runner and provider-backed evidence", async () => {
    const evidence = await validatePhase30LiveBehavioralReport({
      contract: TEST_CONTRACT,
      liveReportPath: TEST_CONTRACT.canonicalLiveReportPath,
      readTextFile: async () =>
        JSON.stringify(
          buildLiveReport({
            evidenceContract: undefined,
            generatedBy: "tests",
          }),
        ),
    });

    expect(evidence.status).toBe("blocked");
    expect(evidence.reason).toContain("canonical live runner");
  });

  it("blocks partial reports without full Phase 30 fixture and profile coverage", async () => {
    const partialReport = buildLiveReport();
    partialReport.profiles["distilled-feedback"].cases.pop();
    partialReport.profiles["distilled-feedback"].totalCases -= 1;
    partialReport.summary.totalCases -= 1;

    const evidence = await validatePhase30LiveBehavioralReport({
      contract: TEST_CONTRACT,
      liveReportPath: TEST_CONTRACT.canonicalLiveReportPath,
      readTextFile: async () => JSON.stringify(partialReport),
    });

    expect(evidence.status).toBe("blocked");
    expect(evidence.reason).toContain("full Phase 30 fixture/profile matrix");
  });

  it("builds an accepted phase-30 quality gate report when regressions and live evidence pass", async () => {
    const report = await runPhase30QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-30",
        runId: "run-phase30",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-04-21T12:00:00.000Z",
        readTextFile: async () => JSON.stringify(buildLiveReport({}, REPO_CONTRACT)),
        runCommand: async (command) => ({
          durationMs: 5,
          exitCode: 0,
          stderr: "",
          stdout: `${command.label} ok`,
        }),
        writeTextFile: async () => undefined,
      },
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(report.evidence.liveMemoryReport.status).toBe("accepted");
    expect(report.commands.map((command) => command.status)).toEqual([
      "passed",
      "passed",
      "passed",
    ]);
  });

  it("fails closed and writes a blocked gate artifact for incomplete JSON objects", async () => {
    let writtenPath = "";
    let writtenContent = "";
    const report = await runPhase30QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-30",
        runId: "run-phase30",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-04-21T12:00:00.000Z",
        readTextFile: async () => JSON.stringify({ mode: "live-memory" }),
        runCommand: async (command) => ({
          durationMs: 5,
          exitCode: 0,
          stderr: "",
          stdout: `${command.label} ok`,
        }),
        writeTextFile: async (path, content) => {
          writtenPath = path;
          writtenContent = content;
        },
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.evidence.liveMemoryReport.status).toBe("blocked");
    expect(report.acceptance.reason).toContain("missing generatedBy");
    expect(writtenPath.endsWith("phase-30-quality-gate.json")).toBeTrue();
    expect(writtenContent).toContain("\"decision\": \"blocked\"");
  });

  it("blocks the gate when deterministic commands pass but live evidence is missing", async () => {
    const report = await runPhase30QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-30",
        runId: "run-phase30",
      },
      {
        ensureDir: async () => undefined,
        now: () => "2026-04-21T12:00:00.000Z",
        readTextFile: async () => {
          throw new Error("missing");
        },
        runCommand: async (command) => ({
          durationMs: 5,
          exitCode: 0,
          stderr: "",
          stdout: `${command.label} ok`,
        }),
        writeTextFile: async () => undefined,
      },
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.commands.every((command) => command.status === "passed")).toBeTrue();
    expect(report.evidence.liveMemoryReport.status).toBe("blocked");
    expect(report.acceptance.reason).toContain("missing or unreadable");
  });

  it("parses phase-30 gate cli flags and exits non-zero when blocked", async () => {
    expect(
      parsePhase30GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-30-gate.ts",
        "--output-dir",
        "/tmp/phase30",
        "--run-id",
        "run-phase30",
        "--live-report",
        "/tmp/live/report.json",
      ]),
    ).toEqual({
      liveReportPath: "/tmp/live/report.json",
      outputDir: "/tmp/phase30",
      runId: "run-phase30",
    });

    let exitCode = 0;
    const logs: string[] = [];
    const report = await runPhase30GateCli({
      argv: [
        "bun",
        "run",
        "scripts/run-phase-30-gate.ts",
        "--run-id",
        "run-phase30",
      ],
      exit: (code) => {
        exitCode = code;
      },
      log: (message) => {
        logs.push(message);
      },
      runGate: async () => ({
        acceptance: {
          decision: "blocked",
          reason: "missing live report",
        },
        commands: [],
        evidence: {
          liveMemoryReport: {
            blockingCases: 0,
            canonicalLiveReportPath: "/tmp/live/report.json",
            firstAttemptPolicyAdherence: 0,
            liveReportPath: "/tmp/live/report.json",
            passedBlockingCases: 0,
            reason: "missing live report",
            status: "blocked",
            traceBackedBlockingCases: 0,
          },
        },
        generatedAt: "2026-04-21T12:00:00.000Z",
        generatedBy: "tests",
        phase: "phase-30",
        runDirectory: "/tmp/phase30/run-phase30",
        runId: "run-phase30",
        scope: {
          inScope: [],
          outOfScope: [],
        },
      }),
    });

    expect(report.runId).toBe("run-phase30");
    expect(exitCode).toBe(1);
    expect(logs[0]).toContain("\"phase\": \"phase-30\"");
  });
});
