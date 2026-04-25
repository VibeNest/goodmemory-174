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
  fixture?: "accepted";
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
  evidenceSource: "deterministic_fixture" | "local_audit_ledger";
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
  const fixture = resolveCliFlagValue(argv, "--fixture");
  return {
    fixture: fixture === "accepted" ? "accepted" : undefined,
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
  const events: InstalledHostWritebackAuditEvent[] = options.fixture === "accepted"
    ? buildAcceptedDeterministicDogfoodEvents()
    : [];
  let legacyEventCount = 0;
  let hostCount = 1;

  if (options.fixture !== "accepted") {
    hostCount = HOSTS.length;
    for (const host of HOSTS) {
      const ledger = await readInstalledHostWritebackLedger(host, homeRoot);
      events.push(...ledger.auditEvents);
      legacyEventCount += ledger.events.length;
    }
  }

  const sessionDigests = new Set(
    events.flatMap((event) =>
      event.sessionDigest ? [event.sessionDigest] : []
    ),
  );
  const durableWriteEvents = events.filter(hasDurableWriteStatus);
  const durableWriteCount = durableWriteEvents.length;
  const falseWriteCount = events.filter(
    (event) => hasDurableWriteStatus(event) &&
      event.review?.outcome === "false_write",
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
  const evidenceSource = options.fixture === "accepted"
    ? "deterministic_fixture"
    : "local_audit_ledger";
  const report: Phase371DogfoodReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? evidenceSource === "deterministic_fixture"
          ? "Phase 37.1 deterministic dogfood fixture met the minimum acceptance floor without raw conversation content."
          : "Phase 37.1 dogfood audit summary met the minimum real-session evidence floor without raw conversation content."
        : `Phase 37.1 dogfood audit summary needs at least ${minSessions} sessions, durable writes, next-session recall hits, and complete metrics.`,
    },
    generatedAt: timestamp,
    generatedBy: GENERATED_BY,
    hostCount,
    mode: "dogfood",
    outputDir,
    phase: "phase-37.1",
    runDirectory,
    runId,
    summary,
    evidenceSource,
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

function hasDurableWriteStatus(event: InstalledHostWritebackAuditEvent): boolean {
  return event.memoryIds.length > 0 &&
    (event.status === "committed" || event.status === "forgotten");
}

function buildAcceptedDeterministicDogfoodEvents(): InstalledHostWritebackAuditEvent[] {
  return Array.from({ length: DEFAULT_DOGFOOD_MIN_SESSIONS }, (_, index) => {
    const ordinal = index + 1;
    const sessionDigest = `session:fixture-write-${String(ordinal).padStart(2, "0")}`;
    const occurredAt = `2026-04-24T08:${String(ordinal).padStart(2, "0")}:00.000Z`;
    const updatedAt = `2026-04-24T08:${String(ordinal).padStart(2, "0")}:01.000Z`;
    return {
      candidateKey: `scope:phase371-fixture:candidate:dogfood-${ordinal}`,
      command: "session-end",
      contentPreview: `Next step is to audit deterministic writeback event ${ordinal}.`,
      eventId: `wb_phase371_fixture_${String(ordinal).padStart(2, "0")}`,
      forgottenLinkedRecordIds: ordinal === 1
        ? [{ forgottenAt: "2026-04-24T08:00:03.000Z", id: "fact-phase371-fixture-01", type: "memory" }]
        : [],
      forgottenMemoryIds: ordinal === 1 ? ["fact-phase371-fixture-01"] : [],
      host: "codex",
      kind: "fact",
      linkedRecordIds: [{ id: `fact-phase371-fixture-${String(ordinal).padStart(2, "0")}`, type: "memory" }],
      memoryIds: [`fact-phase371-fixture-${String(ordinal).padStart(2, "0")}`],
      mode: "selective",
      occurredAt,
      reason: "open_loop",
      recallHitCount: ordinal <= 8 ? 1 : 0,
      recalledBy: ordinal <= 8
        ? [
            {
              occurredAt: `2026-04-24T09:${String(ordinal).padStart(2, "0")}:00.000Z`,
              sessionDigest: `session:fixture-recall-${String(ordinal).padStart(2, "0")}`,
            },
          ]
        : [],
      review: ordinal === 1
        ? { outcome: "false_write", reason: "Manual deterministic fixture review." }
        : undefined,
      scopeDigest: "scope:phase371-fixture",
      sessionDigest,
      source: "user",
      status: ordinal === 1 ? "forgotten" : "committed",
      updatedAt,
    };
  });
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
