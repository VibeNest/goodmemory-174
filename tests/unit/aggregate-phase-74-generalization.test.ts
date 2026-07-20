import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import {
  aggregatePhase74GeneralizationArtifacts,
  parsePhase74AggregationCliOptions,
  runPhase74GeneralizationAggregation,
} from "../../scripts/aggregate-phase-74-generalization";
import { PHASE74_EXPERIMENT_ARMS } from "../../src/eval/phase74ExperimentDesign";
import { PHASE74_PROVIDER_OBJECT_CALL_CONFIGURATION } from "../../src/eval/phase74FullRuntime";
import { buildPhase74ProtocolScoringIdentity } from "../../src/eval/phase74ProtocolScoring";
import { buildPhase74ReplicateComparison } from "../../src/eval/phase74Replicates";
import {
  buildEvalRunIdentity,
  hashEvalExperimentIdentity,
  hashEvalRunIdentity,
} from "../../src/eval/runIdentity";

const roots: string[] = [];
const STAGES = ["E1", "E2", "E3", "E4"] as const;
const FORMATS = [
  "prose",
  "chronology",
  "compact_json",
  "json_locale_note",
] as const;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {
    force: true,
    recursive: true,
  })));
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonLines(
  path: string,
  values: readonly unknown[],
): Promise<void> {
  await writeFile(
    path,
    values.map((value) => JSON.stringify(value)).join("\n") + "\n",
    "utf8",
  );
}

function stageArms(stage: "E1" | "E2" | "E3") {
  return PHASE74_EXPERIMENT_ARMS[stage];
}

function comparisonArms(stage: "E1" | "E2" | "E3") {
  const comparison = buildPhase74ReplicateComparison({
    benchmark: "locomo",
    selectedCaseIdsSha256: "a".repeat(64),
    stage,
  });
  return {
    baseline: comparison.baselineArm,
    candidate: comparison.candidateArm,
  };
}

function branchUsage(input: {
  candidate: boolean;
  caseIds: readonly string[];
}) {
  return {
    answerGenerationCaseCount: input.caseIds.length,
    caseIdsSha256: sha256(JSON.stringify([...input.caseIds].sort())),
    completeRequestCount: input.caseIds.length,
    logicalCaseCount: input.caseIds.length,
    missingRequestCount: 0,
    operationCounts: { answer_generation: input.caseIds.length },
    partialRequestCount: 0,
    requestCount: input.caseIds.length,
    totalTokens: input.caseIds.length * (input.candidate ? 110 : 100),
    unobservedCaseIds: [],
  };
}

function usageEvidence(
  caseIds: readonly string[],
  costBoundary: "full-product" | "query-only",
) {
  return {
    accountingVersion: "phase74-model-usage-v1",
    baseline: branchUsage({ candidate: false, caseIds }),
    candidate: branchUsage({ candidate: true, caseIds }),
    costBoundary,
  };
}

interface FixtureOptions {
  admission?:
    | "canonical"
    | "deterministic-reranker"
    | "legacy"
    | "missing-embedding"
    | "missing-evaluator-source"
    | "missing-provider-object-calls"
    | "noncanonical-scorer";
  costBoundary?: "full-product" | "query-only";
  includeE4Scores?: boolean;
  negativeE3Replicate?: {
    benchmark: "locomo" | "longmemeval";
    replicate: 1 | 2 | 3;
  };
  subsetSelection?: boolean;
}

async function createArtifactFixture(options: FixtureOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), "goodmemory-phase74-aggregate-"));
  roots.push(root);
  const runDirectories: string[] = [];

  for (const benchmark of ["longmemeval", "locomo"] as const) {
    const cases = benchmark === "locomo"
      ? [
          { caseId: "locomo-1/q1", clusterId: "conversation-1" },
          { caseId: "locomo-1/q2", clusterId: "conversation-1" },
          { caseId: "locomo-2/q1", clusterId: "conversation-2" },
        ]
      : [
          { caseId: "lme-q1", clusterId: "lme-q1" },
          { caseId: "lme-q2", clusterId: "lme-q2" },
        ];
    const caseIds = cases.map(({ caseId }) => caseId);
    const caseKeys = cases.map(({ caseId }) => `case-${sha256(caseId)}`);
    const selectedCaseIdsSha256 = sha256(JSON.stringify(caseIds));

    for (const replicate of [1, 2, 3] as const) {
      const runDirectory = join(root, `${benchmark}-replicate-${replicate}`);
      runDirectories.push(runDirectory);
      await mkdir(runDirectory, { recursive: true });
      const datasetManifest = {
        adaptedCasesSha256: sha256(JSON.stringify(cases)),
        benchmark,
        caseCount: cases.length,
        datasetSha256: sha256(`${benchmark}-dataset`),
        normalizedFingerprint: sha256(`${benchmark}-normalized`),
        schemaVersion: 2,
        selectedCaseIdsSha256,
        source: {
          commit: "source-commit",
          license: "test-only",
          repository: "https://example.test/benchmark",
          sourceSha256: sha256(`${benchmark}-source`),
          sourceUrl: "https://example.test/benchmark/data.json",
        },
        unresolvedGoldEvidence: [],
        unresolvedGoldEvidenceCount: 0,
      };
      const canonicalConfiguration = {
        answer: {
          maxTokens: 512,
          reasoningEffort: "medium",
          temperature: 0,
        },
        callBudget: {
          embeddingSpendLimitUsd: 0.1,
          maxLanguageCalls: 80,
        },
        caseConcurrency: 1,
        context: {
          maxTokens: 6_000,
          tokenizer: "utf8-byte-upper-bound-v1",
        },
        costBoundary: "query-only-comparison-with-shadow-ingestion",
        dataset: datasetManifest,
        ...(options.admission === "missing-embedding"
          ? {}
          : {
              embedding: {
                gateway: "https://openrouter.ai/api/v1",
                model: "text-embedding-3-small",
                provider: "openai",
              },
            }),
        ...(options.admission === "missing-evaluator-source"
          ? {}
          : {
              evaluatorSource: {
                commit: "a".repeat(40),
                sha256: "b".repeat(64),
              },
            }),
        ...(options.admission === "missing-provider-object-calls"
          ? {}
          : { providerObjectCalls: PHASE74_PROVIDER_OBJECT_CALL_CONFIGURATION }),
        modelUsageAccounting: "phase74-model-usage-v1",
        preRankLimit: 32,
        reader: "generic-label-free-v1",
        replicate,
        reranker: {
          gateway: "https://ai.gurkiai.com/v1",
          implementation: "provider-pointwise-v1",
          mode: "provider",
          model: "gpt-5.6-terra",
          provider: "openai",
        },
        scoring: buildPhase74ProtocolScoringIdentity(benchmark, {
          gateway: "https://judge.example/v1",
          model: "gpt-5.5",
          provider: "openai",
        }),
        selection: {
          mode: options.subsetSelection
            ? "deterministic-content-hash-v2"
            : "all",
          populationContentSha256: sha256(`${benchmark}-population`),
          populationSize: cases.length + (options.subsetSelection ? 7 : 0),
          ...(options.subsetSelection ? { seed: 74 } : {}),
          selectedCaseIdsSha256,
          selectedCaseKeysSha256: sha256(JSON.stringify([...caseKeys].sort())),
          selectedSize: cases.length,
        },
        selectedCaseIdsSha256,
        selectedLimit: 12,
        seenCasesOnly: true,
      };
      const admission = options.admission ?? "canonical";
      const identity = buildEvalRunIdentity({
        answerModel: {
          gateway: "https://ai.gurkiai.com/v1",
          model: "gpt-5.6-terra",
          provider: "openai",
        },
        benchmark: `${benchmark}-full`,
        configuration: admission === "legacy"
          ? {
              costBoundary: "diagnostic-all-live-calls",
              reader: "generic-label-free-v1",
              replicate,
              seenCasesOnly: true,
            }
          : {
              ...canonicalConfiguration,
              ...(admission === "deterministic-reranker"
                ? {
                    reranker: {
                      implementation: "lexical-coverage-v1",
                      mode: "deterministic",
                    },
                  }
                : {}),
              ...(admission === "noncanonical-scorer"
                ? {
                    scoring: {
                      ...canonicalConfiguration.scoring,
                      scorer: "unapproved-scorer",
                    },
                  }
                : {}),
            },
        datasetSha256: datasetManifest.datasetSha256,
        generatedAt: `2026-07-1${replicate}T00:00:00.000Z`,
        generatedBy: "scripts/run-phase-74-generalization.ts",
        judgeModel: {
          gateway: "https://judge.example/v1",
          model: "gpt-5.5",
          provider: "openai",
        },
        promptSha256s: {
          genericReader: "reader-prompt",
          judge: "judge-prompt",
        },
        runId: `${benchmark}-replicate-${replicate}`,
      });
      const identityHash = hashEvalRunIdentity(identity);
      const experimentIdentityHash = hashEvalExperimentIdentity(identity);
      await writeJson(join(runDirectory, "run-identity.json"), identity);
      await writeJson(join(runDirectory, "dataset-manifest.json"), datasetManifest);

      for (const stage of STAGES) {
        const prefix = stage.toLowerCase();
        if (stage === "E4") {
          const e4Rows = cases.flatMap(({ caseId, clusterId }) =>
            FORMATS.map((format, formatIndex) => ({
              answer: "answer",
              caseId,
              clusterId,
              contextTokens: [120, 80, 100, 90][formatIndex],
              contextTokensBeforeTruncation: [120, 80, 100, 90][formatIndex],
              contextTruncated: false,
              correct: true,
              format,
              ...(options.includeE4Scores === false
                ? {}
                : { score: [0.82, 0.835, 0.84, 0.81][formatIndex] }),
              snapshotId: sha256(`${identity.runId}/${caseId}/E4`),
            }))
          );
          const packets = cases.map(({ caseId }) => ({
            retrievedMemories: [],
            snapshotId: sha256(`${identity.runId}/${caseId}/E4`),
            storedMemories: [],
          }));
          const report = {
            e4: {
              cases: e4Rows,
              formatResults: [],
              selectedFormat: "not_evaluable",
            },
            executions: [],
            experimentIdentityHash,
            identity,
            identityHash,
            oracle: [],
            reason: "fixture",
            schemaVersion: 1,
            status: "not_evaluable",
            summary: {
              caseCount: cases.length,
              executionFailures: 0,
              renderedContextMaxTokens: 120,
            },
          };
          await Promise.all([
            writeJsonLines(join(runDirectory, `${prefix}-progress.jsonl`), e4Rows),
            writeJsonLines(
              join(runDirectory, `${prefix}-retrieval-packets.jsonl`),
              packets,
            ),
            writeJson(join(runDirectory, `${prefix}-model-usage-summary.json`), {
              reason: "not applicable",
              status: "not_applicable",
            }),
            writeJson(join(runDirectory, `${prefix}-report.json`), report),
            writeJson(join(runDirectory, `${prefix}-summary.json`), {
              benchmark,
              caseCount: cases.length,
              comparison: null,
              endToEndScores: {},
              executionFailures: 0,
              experimentIdentityHash,
              identityHash,
              modelUsage: null,
              renderedContextMaxTokens: 120,
              replicate,
              stage,
              status: "not_evaluable",
            }),
          ]);
          continue;
        }

        const arms = stageArms(stage);
        const comparison = buildPhase74ReplicateComparison({
          benchmark,
          selectedCaseIdsSha256,
          stage,
        });
        const targetArms = comparisonArms(stage);
        const baselineScore = 0.4;
        const candidateDelta =
            stage === "E3" &&
              options.negativeE3Replicate?.benchmark === benchmark &&
              options.negativeE3Replicate.replicate === replicate
          ? -0.02
          : benchmark === "longmemeval" ? 0.04 : 0.02;
        const rows = cases.flatMap(({ caseId, clusterId }) =>
          arms.map((arm) => {
            const isCandidate = arm === targetArms.candidate;
            const score = isCandidate
              ? baselineScore + candidateDelta
              : baselineScore;
            return {
              answer: "answer",
              answerLatencyMs: isCandidate ? 30 : 25,
              arm,
              caseId,
              clusterId,
              configuration: {},
              contextTokens: isCandidate ? 120 : 100,
              contextTokensBeforeTruncation: isCandidate ? 120 : 100,
              contextTruncated: false,
              correct: isCandidate && candidateDelta > 0,
              productLatencyMs: isCandidate ? 110 : 100,
              recallLatencyMs: isCandidate ? 80 : 75,
              score,
              snapshotId: sha256(`${identity.runId}/${caseId}/${stage}/${arm}`),
              stage,
            };
          })
        );
        const packets = rows.map(({ snapshotId }) => ({
          retrievedMemories: [],
          snapshotId,
          storedMemories: [],
        }));
        const modelUsage = usageEvidence(
          caseKeys,
          options.costBoundary ?? "full-product",
        );
        const endToEndScores = Object.fromEntries(arms.map((arm) => {
          const armRows = rows.filter((row) => row.arm === arm);
          return [arm, {
            caseCount: armRows.length,
            meanFamilyScore:
              armRows.reduce((total, row) => total + row.score, 0) /
              armRows.length,
            scoredCaseCount: armRows.length,
            semanticAccuracy:
              armRows.filter(({ correct }) => correct).length / armRows.length,
          }];
        }));
        await Promise.all([
          writeJsonLines(join(runDirectory, `${prefix}-progress.jsonl`), rows),
          writeJsonLines(
            join(runDirectory, `${prefix}-retrieval-packets.jsonl`),
            packets,
          ),
          writeJson(
            join(runDirectory, `${prefix}-model-usage-summary.json`),
            modelUsage,
          ),
          writeJson(join(runDirectory, `${prefix}-summary.json`), {
            benchmark,
            caseCount: cases.length,
            comparison,
            endToEndScores,
            executionFailures: 0,
            experimentIdentityHash,
            identityHash,
            modelUsage,
            renderedContextMaxTokens: 120,
            replicate,
            stage,
            status: "not_evaluable",
          }),
        ]);
      }
    }
  }
  return { root, runDirectories };
}

async function writeProtectionArtifact(root: string): Promise<string> {
  const path = join(root, "frozen-protection.json");
  const formatDeltas = Object.fromEntries(FORMATS.map((format) => [
    format,
    [
      { delta: format === "json_locale_note" ? -0.02 : -0.005, name: "beam" },
      { delta: 0, name: "memory-agent-bench" },
    ],
  ]));
  await writeJson(path, {
    artifactKind: "phase74-frozen-protection-evidence",
    e4: { formatDeltas },
    promotion: {
      protections: [
        { delta: -0.005, name: "beam" },
        { delta: 0, name: "memory-agent-bench" },
      ],
      safety: {
        abstentionAccuracyDelta: 0,
        hallucinationRateDelta: 0,
        privacyPassRateDelta: 0,
        updateCorrectnessDelta: 0,
      },
    },
    schemaVersion: 1,
    source: {
      identityHashes: ["b".repeat(64)],
      runIds: ["protection-run-1"],
    },
  });
  return path;
}

describe("Phase 74 frozen artifact aggregation", () => {
  it("derives repeated statistics and blocks seen-case evidence from promotion", async () => {
    const fixture = await createArtifactFixture();
    const protectionArtifactPath = await writeProtectionArtifact(fixture.root);

    const report = await aggregatePhase74GeneralizationArtifacts({
      bootstrapSamples: 500,
      promotionStage: "E3",
      protectionArtifactPath,
      runDirectories: fixture.runDirectories,
      seed: 74,
    });

    expect(report.stageAggregations).toHaveLength(6);
    const locomoE3 = report.stageAggregations.find(
      ({ benchmark, stage }) => benchmark === "locomo" && stage === "E3",
    );
    expect(locomoE3).toMatchObject({
      caseCount: 3,
      clusterCount: 2,
      latency: {
        baselineP95Ms: 100,
        candidateP95Ms: 110,
      },
    });
    expect(locomoE3?.aggregate.inference.delta).toBeCloseTo(0.02);
    expect(locomoE3?.aggregate.inference).toMatchObject({
      replicateCount: 3,
      samplingUnit: "replicate-and-cluster",
    });
    expect(locomoE3?.perCase[0]?.baselineMean).toBeCloseTo(0.4);
    expect(locomoE3?.perCase[0]?.candidateMean).toBeCloseTo(0.42);
    expect(locomoE3?.perCase[0]?.delta).toBeCloseTo(0.02);
    expect(locomoE3?.aggregate.mcnemarByReplicate).toHaveLength(3);
    expect(report.e4).toMatchObject({
      selectedFormat: "chronology",
      status: "evaluated",
    });
    expect(report.e4.formats.find(({ format }) => format === "chronology"))
      .toMatchObject({ averageTokens: 80, macroScore: 0.835 });
    expect(report.promotion.status).toBe("not_evaluable");
    expect(report.promotion.gaps.join(" ")).toContain("seen-case");
  });

  it("fails closed on comparison drift, missing cluster identity, and missing latency", async () => {
    const fixture = await createArtifactFixture();
    const runDirectory = fixture.runDirectories[0]!;
    const summaryPath = join(runDirectory, "e2-summary.json");
    const summary = JSON.parse(await readFile(summaryPath, "utf8"));
    summary.comparison.candidateArm = "recall-plan-deterministic";
    await writeJson(summaryPath, summary);

    await expect(aggregatePhase74GeneralizationArtifacts({
      runDirectories: fixture.runDirectories,
    })).rejects.toThrow("comparison arms");

    summary.comparison.candidateArm = "claim-temporal-on";
    await writeJson(summaryPath, summary);
    const progressPath = join(runDirectory, "e2-progress.jsonl");
    const progress = (await readFile(progressPath, "utf8")).trim().split("\n")
      .map((line) => JSON.parse(line));
    delete progress[0].clusterId;
    await writeJsonLines(progressPath, progress);
    await expect(aggregatePhase74GeneralizationArtifacts({
      runDirectories: fixture.runDirectories,
    })).rejects.toThrow("clusterId");

    progress[0].clusterId = "lme-q1";
    delete progress[0].productLatencyMs;
    await writeJsonLines(progressPath, progress);
    await expect(aggregatePhase74GeneralizationArtifacts({
      runDirectories: fixture.runDirectories,
    })).rejects.toThrow("productLatencyMs");
  });

  it("rejects identities that do not satisfy scoring, reranker, and selection admission", async () => {
    for (const [admission, message] of [
      ["legacy", "admission"],
      ["deterministic-reranker", "reranker"],
      ["noncanonical-scorer", "scoring"],
      ["missing-embedding", "missing embedding"],
      ["missing-evaluator-source", "missing evaluatorSource"],
      ["missing-provider-object-calls", "missing providerObjectCalls"],
    ] as const) {
      const fixture = await createArtifactFixture({ admission });
      await expect(aggregatePhase74GeneralizationArtifacts({
        runDirectories: fixture.runDirectories,
      })).rejects.toThrow(message);
    }
  });

  it("reports explicit blockers for legacy E4 scores, query-only usage, and missing protection", async () => {
    const fixture = await createArtifactFixture({
      costBoundary: "query-only",
      includeE4Scores: false,
    });

    const report = await aggregatePhase74GeneralizationArtifacts({
      promotionStage: "E3",
      runDirectories: fixture.runDirectories,
    });

    expect(report.e4.status).toBe("not_evaluable");
    expect(report.e4.gaps.join(" ")).toContain("per-case score");
    expect(report.e4.gaps.join(" ")).toContain("protection artifact");
    expect(report.promotion.status).toBe("not_evaluable");
    expect(report.promotion.gaps.join(" ")).toContain("full-product");
    expect(report.promotion.gaps.join(" ")).toContain("seen-case");
    expect(report.promotion.gaps.join(" ")).toContain("protection artifact");
  });

  it("aggregates a case-consistent subset but never promotes it as a full-family result", async () => {
    const fixture = await createArtifactFixture({ subsetSelection: true });
    const protectionArtifactPath = await writeProtectionArtifact(fixture.root);
    const report = await aggregatePhase74GeneralizationArtifacts({
      promotionStage: "E3",
      protectionArtifactPath,
      runDirectories: fixture.runDirectories,
    });

    expect(report.stageAggregations).toHaveLength(6);
    expect(report.promotion.status).toBe("not_evaluable");
    expect(report.promotion.gaps.join(" ")).toContain("selected subset");
  });

  it("blocks promotion when one independent replicate reverses direction", async () => {
    const fixture = await createArtifactFixture({
      negativeE3Replicate: { benchmark: "locomo", replicate: 3 },
    });
    const protectionArtifactPath = await writeProtectionArtifact(fixture.root);

    const report = await aggregatePhase74GeneralizationArtifacts({
      bootstrapSamples: 500,
      promotionStage: "E3",
      protectionArtifactPath,
      runDirectories: fixture.runDirectories,
      seed: 74,
    });

    const locomoE3 = report.stageAggregations.find(
      ({ benchmark, stage }) => benchmark === "locomo" && stage === "E3",
    );
    expect(locomoE3?.replicateStability.direction).toBe("mixed");
    expect(locomoE3?.replicateStability.deltas[0]).toBeCloseTo(0.02);
    expect(locomoE3?.replicateStability.deltas[1]).toBeCloseTo(0.02);
    expect(locomoE3?.replicateStability.deltas[2]).toBeCloseTo(-0.02);
    expect(locomoE3?.aggregate.inference.lower).toBeLessThanOrEqual(0);
    expect(report.promotion.status).toBe("not_evaluable");
    expect(report.promotion.gaps.join(" ")).toContain(
      "each of the three independent replicates",
    );
  });

  it("rejects protection artifacts that contain derivable promotion fields", async () => {
    const fixture = await createArtifactFixture();
    const protectionArtifactPath = await writeProtectionArtifact(fixture.root);
    const protection = JSON.parse(await readFile(protectionArtifactPath, "utf8"));
    protection.promotion.families = [];
    await writeJson(protectionArtifactPath, protection);

    await expect(aggregatePhase74GeneralizationArtifacts({
      promotionStage: "E3",
      protectionArtifactPath,
      runDirectories: fixture.runDirectories,
    })).rejects.toThrow("protection artifact");
  });

  it("rejects cross-stage, E4, and model-usage population drift", async () => {
    const stageFixture = await createArtifactFixture();
    const stageRun = stageFixture.runDirectories[0]!;
    const e3ProgressPath = join(stageRun, "e3-progress.jsonl");
    const e3Progress = (await readFile(e3ProgressPath, "utf8")).trim()
      .split("\n").map((line) => JSON.parse(line));
    const driftedCaseId = e3Progress[0].caseId;
    for (const row of e3Progress) {
      if (row.caseId === driftedCaseId) {
        row.clusterId = "drifted-cluster";
      }
    }
    await writeJsonLines(e3ProgressPath, e3Progress);
    await expect(aggregatePhase74GeneralizationArtifacts({
      runDirectories: stageFixture.runDirectories,
    })).rejects.toThrow("cluster population drifted from E1");

    const e4Fixture = await createArtifactFixture();
    const e4Run = e4Fixture.runDirectories[0]!;
    const e4ProgressPath = join(e4Run, "e4-progress.jsonl");
    const e4Progress = (await readFile(e4ProgressPath, "utf8")).trim()
      .split("\n").map((line) => JSON.parse(line));
    const e4CaseId = e4Progress[0].caseId;
    for (const row of e4Progress) {
      if (row.caseId === e4CaseId) {
        row.clusterId = "drifted-e4-cluster";
      }
    }
    await writeJsonLines(e4ProgressPath, e4Progress);
    const e4ReportPath = join(e4Run, "e4-report.json");
    const e4Report = JSON.parse(await readFile(e4ReportPath, "utf8"));
    e4Report.e4.cases = e4Progress;
    await writeJson(e4ReportPath, e4Report);
    await expect(aggregatePhase74GeneralizationArtifacts({
      runDirectories: e4Fixture.runDirectories,
    })).rejects.toThrow("E4 cluster population drifted from retrieval stages");

    const usageFixture = await createArtifactFixture();
    const usageRun = usageFixture.runDirectories[0]!;
    const usageSummaryPath = join(usageRun, "e2-summary.json");
    const usageFilePath = join(usageRun, "e2-model-usage-summary.json");
    const usageSummary = JSON.parse(await readFile(usageSummaryPath, "utf8"));
    usageSummary.modelUsage.baseline.unobservedCaseIds = ["unknown-case"];
    await writeJson(usageSummaryPath, usageSummary);
    await writeJson(usageFilePath, usageSummary.modelUsage);
    await expect(aggregatePhase74GeneralizationArtifacts({
      runDirectories: usageFixture.runDirectories,
    })).rejects.toThrow("non-opaque unobserved case");
  });

  it("writes a reproducible report and parses strict paths", async () => {
    const fixture = await createArtifactFixture();
    const outputPath = join(fixture.root, "aggregate", "report.json");
    const options = parsePhase74AggregationCliOptions([
      "bun",
      "scripts/aggregate-phase-74-generalization.ts",
      ...fixture.runDirectories.flatMap((path) => ["--run-dir", path]),
      "--output",
      outputPath,
      "--promotion-stage",
      "E3",
    ]);
    expect(options.runDirectories).toEqual(fixture.runDirectories);

    await runPhase74GeneralizationAggregation(options);
    const persisted = JSON.parse(await readFile(outputPath, "utf8"));
    expect(persisted.schemaVersion).toBe(1);

    expect(() => parsePhase74AggregationCliOptions([
      "--run-dir",
      fixture.runDirectories[0]!,
      "--run-dir",
      fixture.runDirectories[0]!,
      "--output",
      outputPath,
    ])).toThrow("duplicate");
    expect(() => parsePhase74AggregationCliOptions([
      ...fixture.runDirectories.flatMap((path) => ["--run-dir", path]),
      "--output",
      outputPath,
      "--unknown",
      "value",
    ])).toThrow("unknown option");
    expect(() => parsePhase74AggregationCliOptions([
      ...fixture.runDirectories.flatMap((path) => ["--run-dir", path]),
      "--output",
      outputPath,
      "stray-value",
    ])).toThrow("unexpected positional argument");
  });
});
