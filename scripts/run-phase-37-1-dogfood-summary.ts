import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  readInstalledHostWritebackLedger,
  type InstalledHostWritebackAuditEvent,
} from "../src/install/hostWritebackAuditLedger";
import type { InstalledHostKind } from "../src/install/hostInstall";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase371DogfoodSummaryOptions {
  homeRoot?: string;
  minSessions?: number;
  outputDir?: string;
  runId?: string;
}

export interface Phase371DogfoodSummary {
  candidateCount: number;
  duplicateCount: number;
  durableWriteCount: number;
  falseWriteRateManual: number;
  forgottenCount: number;
  nextSessionRecallHitCount: number;
  sessionCount: number;
}

export interface Phase371DogfoodReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-37-1-dogfood-summary.ts";
  hostCount: number;
  mode: "dogfood";
  outputDir: string;
  phase: "phase-37.1";
  runDirectory: string;
  runId: string;
  summary: Phase371DogfoodSummary;
}

const GENERATED_BY = "scripts/run-phase-37-1-dogfood-summary.ts";
const DEFAULT_DOGFOOD_MIN_SESSIONS = 20;
const HOSTS: InstalledHostKind[] = ["codex", "claude"];

export function resolvePhase371DogfoodOutputDir(root: string): string {
  return join(root, "reports/eval/dogfood/phase-37-1");
}

export function resolvePhase371DogfoodReportPath(
  outputDir: string,
  runId: string,
): string {
  return join(outputDir, runId, "report.json");
}

export function buildPhase371DogfoodRunId(timestamp: string): string {
  return `run-${timestamp.replace(/\D/g, "").slice(0, 14) || "phase371dogfood"}`;
}

export function parsePhase371DogfoodCliOptions(
  argv: readonly string[],
): Phase371DogfoodSummaryOptions {
  const minSessions = resolveCliFlagValue(argv, "--min-sessions");
  return {
    homeRoot: resolveCliFlagValue(argv, "--home-root"),
    minSessions: minSessions === undefined ? undefined : Number(minSessions),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export async function runPhase371DogfoodSummary(
  options: Phase371DogfoodSummaryOptions = {},
): Promise<Phase371DogfoodReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const timestamp = new Date().toISOString();
  const outputDir = options.outputDir ?? resolvePhase371DogfoodOutputDir(root);
  const runId = options.runId ?? buildPhase371DogfoodRunId(timestamp);
  const runDirectory = join(outputDir, runId);
  const homeRoot = options.homeRoot;
  const minSessions = options.minSessions ?? DEFAULT_DOGFOOD_MIN_SESSIONS;
  const events: InstalledHostWritebackAuditEvent[] = [];
  let legacyEventCount = 0;

  for (const host of HOSTS) {
    const ledger = await readInstalledHostWritebackLedger(host, homeRoot);
    events.push(...ledger.auditEvents);
    legacyEventCount += ledger.events.length;
  }

  const sessionDigests = new Set(
    events.flatMap((event) =>
      event.sessionDigest ? [event.sessionDigest] : []
    ),
  );
  const durableWriteCount = events.filter(
    (event) => event.memoryIds.length > 0 &&
      (event.status === "committed" || event.status === "forgotten"),
  ).length;
  const falseWriteCount = events.filter(
    (event) => event.review?.outcome === "false_write",
  ).length;
  const summary: Phase371DogfoodSummary = {
    candidateCount: events.length,
    duplicateCount: Math.max(0, legacyEventCount - new Set(events.map((event) => event.candidateKey)).size),
    durableWriteCount,
    falseWriteRateManual: durableWriteCount === 0 ? 0 : falseWriteCount / durableWriteCount,
    forgottenCount: events.filter((event) => event.status === "forgotten").length,
    nextSessionRecallHitCount: events.filter(hasWritebackOwnedNextSessionRecallHit)
      .length,
    sessionCount: sessionDigests.size,
  };
  const accepted = summary.sessionCount >= minSessions &&
    summary.candidateCount >= minSessions &&
    summary.durableWriteCount > 0 &&
    summary.nextSessionRecallHitCount > 0 &&
    Number.isFinite(summary.falseWriteRateManual) &&
    summary.falseWriteRateManual >= 0 &&
    summary.falseWriteRateManual <= 1;
  const report: Phase371DogfoodReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 37.1 dogfood audit summary met the minimum real-session evidence floor without raw conversation content."
        : `Phase 37.1 dogfood audit summary needs at least ${minSessions} sessions, durable writes, next-session recall hits, and complete metrics.`,
    },
    generatedAt: timestamp,
    generatedBy: GENERATED_BY,
    hostCount: HOSTS.length,
    mode: "dogfood",
    outputDir,
    phase: "phase-37.1",
    runDirectory,
    runId,
    summary,
  };

  await mkdir(runDirectory, { recursive: true });
  await writeFile(
    resolvePhase371DogfoodReportPath(outputDir, runId),
    JSON.stringify(report, null, 2) + "\n",
    "utf8",
  );
  return report;
}

function hasWritebackOwnedNextSessionRecallHit(
  event: InstalledHostWritebackAuditEvent,
): boolean {
  return event.memoryIds.length > 0 &&
    Boolean(event.sessionDigest) &&
    event.recalledBy.some((hit) => hit.sessionDigest !== event.sessionDigest);
}

export async function runPhase371DogfoodSummaryCli(
  argv: readonly string[] = process.argv,
): Promise<Phase371DogfoodReport> {
  const report = await runPhase371DogfoodSummary(parsePhase371DogfoodCliOptions(argv));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.acceptance.decision === "accepted" ? 0 : 1);
  return report;
}

if (import.meta.main) {
  await runPhase371DogfoodSummaryCli();
}
