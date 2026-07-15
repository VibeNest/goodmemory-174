#!/usr/bin/env bun
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GoodMemory } from "../src/api/contracts";
import {
  PHASE63_BEAM_LIVE_SLICE_REPORT_FILE_NAME,
  parsePhase63BeamLiveSliceCliOptions,
  runPhase63BeamLiveSlice,
  type Phase63BeamLiveSliceCliOptions,
  type Phase63BeamLiveSliceDependencies,
  type Phase63BeamLiveSliceReport,
} from "./run-phase-63-beam-live-slice";
import {
  createBeamGeneralLeverMemory,
} from "./measure-beam-general-levers";
import {
  __resetNarrowGateDisablesForTest,
  listRegisteredNarrowGateIds,
} from "./eval-profiles/legacy-fitted/recall/narrowGates";
import { resolveCliFlagValueStrict } from "./cli-options";
import {
  PHASE72_ANSWER_GATEWAY,
  PHASE72_ANSWER_MODEL,
  PHASE72_INDEPENDENT_JUDGE_MODEL,
} from "./phase-72-external-contracts";

export const PHASE72_BEAM_GENERALIZATION_DEFAULT_SEMANTIC_TOPK = 96;
export const PHASE72_BEAM_GENERALIZATION_MANIFEST_FILE_NAME =
  "phase-72-generalization-manifest.json";

export type Phase72BeamGeneralizationLiveCliOptions = Omit<
  Phase63BeamLiveSliceCliOptions,
  "evidencePack" | "packetEvidence" | "profile"
> & {
  evidencePack: true;
  packetEvidence: false;
  profile: "goodmemory-hybrid";
  semanticTopK: number;
};

export interface Phase72BeamGeneralizationManifest {
  answerModel: {
    baseURL: string;
    model: string;
    provider: string;
  };
  benchmark: "BEAM-100K";
  evidenceContext: "full-recall-evidence-pack";
  generatedAt: string;
  generatedBy: "scripts/run-phase-72-beam-generalization-live.ts";
  judgeModel: {
    baseURL: string;
    model: string;
    provider: string;
  };
  narrowGateCount: number;
  narrowGatesDisabled: true;
  profile: "goodmemory-hybrid";
  recallReportPath: string;
  reranking: {
    answerContextConsumesRank: false;
    enabled: false;
    reason: "full_recall_context_uses_membership_not_rank";
  };
  runId: string;
  semanticCandidates: {
    embeddingBaseURL: string;
    embeddingModel: string;
    topK: number;
  };
}

export interface Phase72BeamGeneralizationLiveResult {
  manifestPath: string;
  narrowGateCount: number;
  report: Phase63BeamLiveSliceReport;
  semanticTopK: number;
}

export type Phase72BeamGeneralizationLiveRunner = (
  options: Phase63BeamLiveSliceCliOptions,
  dependencies?: Phase63BeamLiveSliceDependencies,
) => Promise<Phase63BeamLiveSliceReport>;

export interface Phase72BeamGeneralizationLiveDependencies {
  createMemory?: () => GoodMemory;
  env?: Record<string, string | undefined>;
  listNarrowGateIds?: () => string[];
  now?: () => Date;
  resetNarrowGateDisables?: () => void;
  runLiveSlice?: Phase72BeamGeneralizationLiveRunner;
  writeFile?: typeof writeFile;
}

function parsePositiveInteger(value: string | undefined, flag: string): number {
  if (value === undefined) {
    return PHASE72_BEAM_GENERALIZATION_DEFAULT_SEMANTIC_TOPK;
  }
  if (!/^[1-9]\d*$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return Number(value);
}

function normalizedBaseURL(value: string | undefined): string {
  return value?.replace(/\/$/u, "") ?? "";
}

function requiredEnv(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required for the Phase 72 BEAM live run.`);
  }
  return value;
}

function assertPhase72ModelPins(
  env: Record<string, string | undefined>,
): void {
  if (
    env.GOODMEMORY_EVAL_MODEL !== PHASE72_ANSWER_MODEL ||
    env.GOODMEMORY_EVAL_PROVIDER !== "openai" ||
    normalizedBaseURL(env.GOODMEMORY_EVAL_BASE_URL) !== PHASE72_ANSWER_GATEWAY
  ) {
    throw new Error(
      `Phase 72 BEAM answers must use ${PHASE72_ANSWER_MODEL} through ${PHASE72_ANSWER_GATEWAY}.`,
    );
  }
  if (
    env.GOODMEMORY_JUDGE_MODEL !== PHASE72_INDEPENDENT_JUDGE_MODEL ||
    normalizedBaseURL(env.GOODMEMORY_JUDGE_BASE_URL) !== PHASE72_ANSWER_GATEWAY
  ) {
    throw new Error(
      `Phase 72 BEAM judging must use ${PHASE72_INDEPENDENT_JUDGE_MODEL} through ${PHASE72_ANSWER_GATEWAY}.`,
    );
  }
}

export function parsePhase72BeamGeneralizationLiveCliOptions(
  argv: readonly string[],
): Phase72BeamGeneralizationLiveCliOptions {
  const base = parsePhase63BeamLiveSliceCliOptions(argv);
  if (base.profile !== undefined && base.profile !== "goodmemory-hybrid") {
    throw new Error(
      "Phase 72 BEAM generalization live runs require --profile goodmemory-hybrid.",
    );
  }
  if (base.packetEvidence) {
    throw new Error(
      "Phase 72 BEAM generalization runs use full recalled membership; --packet-evidence requires a separate rank-consuming experiment.",
    );
  }
  return {
    ...base,
    evidencePack: true,
    packetEvidence: false,
    profile: "goodmemory-hybrid",
    semanticTopK: parsePositiveInteger(
      resolveCliFlagValueStrict(argv, "--semantic-topk"),
      "--semantic-topk",
    ),
  };
}

export async function runPhase72BeamGeneralizationLive(
  options: Phase72BeamGeneralizationLiveCliOptions,
  dependencies: Phase72BeamGeneralizationLiveDependencies = {},
): Promise<Phase72BeamGeneralizationLiveResult> {
  const env = dependencies.env ?? process.env;
  assertPhase72ModelPins(env);
  const gateIds =
    dependencies.listNarrowGateIds?.() ?? listRegisteredNarrowGateIds();
  const resetNarrowGateDisables =
    dependencies.resetNarrowGateDisables ?? __resetNarrowGateDisablesForTest;
  const previousDisabledGates = env.GOODMEMORY_DISABLED_NARROW_GATES;
  env.GOODMEMORY_DISABLED_NARROW_GATES = gateIds.join(",");
  resetNarrowGateDisables();

  const {
    semanticTopK,
    ...liveOptions
  } = options;
  try {
    const report = await (dependencies.runLiveSlice ?? runPhase63BeamLiveSlice)(
      liveOptions,
      {
        createMemory:
          dependencies.createMemory ??
          (() =>
            createBeamGeneralLeverMemory({
              bm25: false,
              env,
              providerEmbedding: true,
              union: { topK: semanticTopK },
            })),
      },
    );
    const manifestPath = join(
      report.runDirectory,
      PHASE72_BEAM_GENERALIZATION_MANIFEST_FILE_NAME,
    );
    const manifest: Phase72BeamGeneralizationManifest = {
      answerModel: {
        baseURL: requiredEnv(env, "GOODMEMORY_EVAL_BASE_URL"),
        model: requiredEnv(env, "GOODMEMORY_EVAL_MODEL"),
        provider: requiredEnv(env, "GOODMEMORY_EVAL_PROVIDER"),
      },
      benchmark: "BEAM-100K",
      evidenceContext: "full-recall-evidence-pack",
      generatedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
      generatedBy: "scripts/run-phase-72-beam-generalization-live.ts",
      judgeModel: {
        baseURL: requiredEnv(env, "GOODMEMORY_JUDGE_BASE_URL"),
        model: requiredEnv(env, "GOODMEMORY_JUDGE_MODEL"),
        provider: requiredEnv(env, "GOODMEMORY_JUDGE_PROVIDER"),
      },
      narrowGateCount: gateIds.length,
      narrowGatesDisabled: true,
      profile: "goodmemory-hybrid",
      recallReportPath: join(
        report.runDirectory,
        PHASE63_BEAM_LIVE_SLICE_REPORT_FILE_NAME,
      ),
      reranking: {
        answerContextConsumesRank: false,
        enabled: false,
        reason: "full_recall_context_uses_membership_not_rank",
      },
      runId: report.runId,
      semanticCandidates: {
        embeddingBaseURL: requiredEnv(env, "GOODMEMORY_EMBEDDING_BASE_URL"),
        embeddingModel: requiredEnv(env, "GOODMEMORY_EMBEDDING_MODEL"),
        topK: semanticTopK,
      },
    };
    await (dependencies.writeFile ?? writeFile)(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    return {
      manifestPath,
      narrowGateCount: gateIds.length,
      report,
      semanticTopK,
    };
  } finally {
    if (previousDisabledGates === undefined) {
      delete env.GOODMEMORY_DISABLED_NARROW_GATES;
    } else {
      env.GOODMEMORY_DISABLED_NARROW_GATES = previousDisabledGates;
    }
    resetNarrowGateDisables();
  }
}

export async function main(argv: readonly string[] = Bun.argv): Promise<void> {
  const result = await runPhase72BeamGeneralizationLive(
    parsePhase72BeamGeneralizationLiveCliOptions(argv),
  );
  console.log(
    JSON.stringify(
      {
        executionFailures: result.report.summary.executionFailures,
        manifestPath: result.manifestPath,
        narrowGateCount: result.narrowGateCount,
        runId: result.report.runId,
        semanticTopK: result.semanticTopK,
        summary: result.report.summary,
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) {
  await main();
}
