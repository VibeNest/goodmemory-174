import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { createGoodMemory } from "../src/api/createGoodMemory";
import {
  assertCliPathSegmentValue,
  resolveCliFlagValueStrict,
} from "./cli-options";
import { PHASE72_UPSTREAMS } from "./phase-72-external-contracts";
import {
  evaluateMINTEvalSmoke,
  type MINTEvalSmokeDiagnostics,
} from "./phase-72-minteval";

const mintevalContextSchema = z.object({
  content: z.string().min(1),
  timestamp: z.string().nullish(),
}).passthrough();

const mintevalQuestionSchema = z.object({
  question: z.string().min(1),
}).passthrough();

const mintevalRowSchema = z.object({
  contexts: z.array(mintevalContextSchema).min(1),
  id: z.string().min(1),
  metadata: z.unknown().optional(),
  questions: z.array(mintevalQuestionSchema).min(1),
}).passthrough();

type MINTEvalContext = z.infer<typeof mintevalContextSchema>;
type MINTEvalRow = z.infer<typeof mintevalRowSchema>;

export interface Phase72MINTEvalOptions {
  datasetFile: string;
  outputDir: string;
  runId: string;
  upstreamRoot: string;
}

export interface MINTEvalSmokeSelection {
  contexts: MINTEvalContext[];
  id: string;
  question: string;
  questionCount: number;
}

export function parsePhase72MINTEvalOptions(
  argv: readonly string[],
): Phase72MINTEvalOptions {
  const root = process.cwd();
  const cacheRoot = join(homedir(), ".cache", "goodmemory-benchmarks");
  const runId = resolveCliFlagValueStrict(argv, "--run-id") ??
    "run-phase72-minteval-state-tracking-smoke";
  assertCliPathSegmentValue({ flag: "--run-id", value: runId });
  return {
    datasetFile: resolveCliFlagValueStrict(argv, "--dataset-file") ?? join(
      cacheRoot,
      "phase72-runs",
      "minteval",
      "state_tracking_first.json",
    ),
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir") ?? join(
      root,
      "reports",
      "eval",
      "research",
      "phase-72",
      "minteval",
    ),
    runId,
    upstreamRoot: resolveCliFlagValueStrict(argv, "--upstream-root") ?? join(
      cacheRoot,
      "MINTEval",
    ),
  };
}

export function selectMINTEvalSmokeRow(value: unknown): MINTEvalSmokeSelection {
  const row = mintevalRowSchema.parse(value);
  return {
    contexts: row.contexts,
    id: row.id,
    question: row.questions[0]!.question,
    questionCount: row.questions.length,
  };
}

export function buildMINTEvalContextMessage(context: MINTEvalContext): string {
  const timestamp = context.timestamp?.trim();
  return timestamp
    ? `[${timestamp}]\n${context.content}`
    : context.content;
}

export async function runPhase72MINTEvalSmoke(
  options: Phase72MINTEvalOptions,
): Promise<Record<string, unknown>> {
  await assertPinnedUpstream(options.upstreamRoot);
  const source = await readFile(options.datasetFile, "utf8");
  const selection = selectMINTEvalSmokeRow(JSON.parse(source) as unknown);
  const memory = createGoodMemory({
    adapters: {
      assistedExtractor: {
        async extract(input) {
          return {
            candidates: [],
            ignoredMessageCount: input.messages.length,
          };
        },
      },
      embeddingAdapter: {
        async embed(texts) {
          return texts.map(() => [1]);
        },
      },
    },
    retrieval: { preset: "recommended" },
    storage: { provider: "memory" },
    testing: {
      createId: (() => {
        let id = 0;
        return () => `phase72-minteval-${++id}`;
      })(),
      now: (() => {
        let tick = 0;
        return () => new Date(Date.UTC(2026, 6, 12, 9, 0, tick++));
      })(),
    },
  });
  const scope = {
    userId: `minteval:${selection.id}`,
    workspaceId: "phase-72-state-tracking-smoke",
  };
  let diagnostics: MINTEvalSmokeDiagnostics;
  try {
    const remember = await memory.remember({
      annotations: selection.contexts.map((_, messageIndex) => ({
        confirmed: true,
        kindHint: "fact" as const,
        messageIndex,
        metadataPatch: {
          attributes: { sourceIndex: messageIndex },
          category: "event",
          factKind: "project_state",
          scopeKind: "project",
          tags: ["minteval", "state-tracking"],
        },
        reason: "MINTEval state tracking smoke context",
        remember: "always" as const,
        verified: true,
      })),
      extractionStrategy: "rules-only",
      messages: selection.contexts.map((context) => ({
        content: buildMINTEvalContextMessage(context),
        role: "user",
      })),
      scope,
    });
    const recall = await memory.recall({
      decompose: true,
      multiHop: 2,
      query: selection.question,
      retrievalProfile: "general_chat",
      scope,
    });
    diagnostics = {
      acceptedMemories: remember.accepted,
      contextCount: selection.contexts.length,
      executionFailures: 0,
      questionCount: selection.questionCount,
      recalledMemories:
        recall.facts.length +
        recall.preferences.length +
        recall.references.length +
        recall.feedback.length +
        recall.episodes.length,
    };
  } catch (error) {
    diagnostics = {
      acceptedMemories: 0,
      contextCount: selection.contexts.length,
      executionFailures: 1,
      questionCount: selection.questionCount,
      recalledMemories: 0,
    };
    console.error("[phase-72:minteval] smoke failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const gate = evaluateMINTEvalSmoke(diagnostics);
  const report = {
    benchmark: "MINTEval",
    dataset: {
      license: PHASE72_UPSTREAMS.minteval.datasetLicense,
      rawArtifactsTracked: false,
      revision: PHASE72_UPSTREAMS.minteval.datasetRevision,
      rowId: selection.id,
      sha256: sha256Text(source),
      split: "state_tracking",
    },
    diagnostics,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/run-phase-72-minteval-smoke.ts",
    gate,
    mode: "smoke-only",
    querySha256: sha256Text(selection.question),
    runId: options.runId,
    scored: false,
    upstream: {
      codeCommit: PHASE72_UPSTREAMS.minteval.codeCommit,
      codeLicense: PHASE72_UPSTREAMS.minteval.codeLicense,
      historicalName: PHASE72_UPSTREAMS.minteval.historicalName,
      repository: PHASE72_UPSTREAMS.minteval.repository,
    },
  };
  const reportDir = join(options.outputDir, options.runId);
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    join(reportDir, "minteval-smoke-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  return report;
}

async function assertPinnedUpstream(upstreamRoot: string): Promise<void> {
  const child = Bun.spawn({
    cmd: ["git", "-C", upstreamRoot, "rev-parse", "HEAD"],
    stderr: "pipe",
    stdout: "pipe",
  });
  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  if (await child.exited !== 0) {
    throw new Error(`Cannot inspect MINTEval upstream: ${stderr.trim()}`);
  }
  if (stdout.trim() !== PHASE72_UPSTREAMS.minteval.codeCommit) {
    throw new Error("MINTEval upstream commit is not pinned.");
  }
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

if (import.meta.main) {
  runPhase72MINTEvalSmoke(parsePhase72MINTEvalOptions(process.argv))
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if ((report.gate as { status?: string }).status !== "passed") {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
