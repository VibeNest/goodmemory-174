// Phase 67-A public benchmark claim gate. Before any benchmark score is promoted
// to a public claim (e.g. a non-blank README benchmark row), it must have a claim
// declaration under benchmark-claims/<benchmark>.json, and that declaration's
// self-asserted `claimBoundary.publicClaimAllowed` must MATCH the verdict the gate
// computes from hard methodology rules. This catches over-claiming (declaring a
// public claim the rules forbid) and keeps every claim honest, reproducible, and
// provenance-complete.
//
// The gate is pure governance tooling: it reads JSON declarations and applies
// deterministic rules. It runs no benchmarks and touches no benchmark code.
//
//   bun run scripts/run-public-benchmark-claim-gate.ts -- [--strict]
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export const CLAIM_STATUSES = [
  "candidate_public_claim",
  "internal_evidence",
  "paused_boundary",
  "not_started",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface BenchmarkClaimReport {
  benchmark: string;
  claimBoundary: { publicClaimAllowed: boolean; reason: string };
  // Optional coverage gate: a benchmark whose competencies/questions are only
  // partially evaluated cannot be a public claim even if the measured slice scores
  // well (e.g. MAB with TTL/LRU unfinished).
  coverage?: { complete: boolean; note?: string };
  dataset: { license: string | null; source: string | null; vendored: boolean };
  metrics: { baseline: number | null; primary: string; score: number };
  model: { answerModel: string | null; judgeModel: string | null; sameModelJudge: boolean };
  run: {
    command: string | null;
    commit: string | null;
    executionFailures: number;
    packageVersion: string | null;
  };
  status: ClaimStatus;
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Hard methodology rules. A public claim is allowed only when NONE fire. The rules
// encode the user's claim discipline: zero failures, a baseline to compare to, a
// reproducible run, complete dataset provenance, an independent judge for
// judge-scored metrics, and complete benchmark coverage.
export function evaluateClaimBoundary(report: BenchmarkClaimReport): {
  blockers: string[];
  publicClaimAllowed: boolean;
} {
  const blockers: string[] = [];
  if (report.run.executionFailures !== 0) {
    blockers.push(`executionFailures must be 0 (got ${report.run.executionFailures})`);
  }
  if (report.metrics.baseline === null || report.metrics.baseline === undefined) {
    blockers.push("no baseline/reference score for comparison");
  }
  if (!isNonEmpty(report.run.commit)) {
    blockers.push("run.commit missing (not reproducible)");
  }
  if (!isNonEmpty(report.run.command)) {
    blockers.push("run.command missing (not reproducible)");
  }
  if (!isNonEmpty(report.run.packageVersion)) {
    blockers.push("run.packageVersion missing (not reproducible)");
  }
  if (!isNonEmpty(report.dataset.source)) {
    blockers.push("dataset.source missing");
  }
  if (!isNonEmpty(report.dataset.license)) {
    blockers.push("dataset.license missing/unverified");
  }
  if (report.model.sameModelJudge && isNonEmpty(report.model.judgeModel)) {
    blockers.push(
      "same-model judge bias (answer and judge are the same model); needs an independent judge or a deterministic scorer",
    );
  }
  if (report.coverage && report.coverage.complete === false) {
    blockers.push(
      `benchmark coverage incomplete${report.coverage.note ? `: ${report.coverage.note}` : ""}`,
    );
  }
  return { blockers, publicClaimAllowed: blockers.length === 0 };
}

// Schema validation independent of the boundary rules: every consumer of a claim
// declaration can rely on these fields existing with the right types.
export function validateClaimReport(value: unknown): { errors: string[]; valid: boolean } {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { errors: ["claim report must be an object"], valid: false };
  }
  if (!isNonEmpty(value.benchmark)) {
    errors.push("benchmark must be a non-empty string");
  }
  if (!CLAIM_STATUSES.includes(value.status as ClaimStatus)) {
    errors.push(`status must be one of ${CLAIM_STATUSES.join(", ")}`);
  }
  if (!isRecord(value.dataset) || typeof value.dataset.vendored !== "boolean") {
    errors.push("dataset.vendored must be a boolean");
  }
  if (!isRecord(value.run) || typeof value.run.executionFailures !== "number") {
    errors.push("run.executionFailures must be a number");
  }
  if (!isRecord(value.model) || typeof value.model.sameModelJudge !== "boolean") {
    errors.push("model.sameModelJudge must be a boolean");
  }
  if (
    !isRecord(value.metrics) ||
    typeof value.metrics.score !== "number" ||
    !isNonEmpty(value.metrics.primary)
  ) {
    errors.push("metrics.primary (string) and metrics.score (number) are required");
  }
  if (
    !isRecord(value.claimBoundary) ||
    typeof value.claimBoundary.publicClaimAllowed !== "boolean" ||
    !isNonEmpty(value.claimBoundary.reason)
  ) {
    errors.push("claimBoundary.publicClaimAllowed (boolean) and reason (string) are required");
  }
  return { errors, valid: errors.length === 0 };
}

export interface ClaimGateEntry {
  benchmark: string;
  blockers: string[];
  computedPublicClaimAllowed: boolean;
  consistent: boolean;
  declaredPublicClaimAllowed: boolean;
  file: string;
  schemaErrors: string[];
  status: ClaimStatus;
}

export interface ClaimGateReport {
  allConsistent: boolean;
  entries: ClaimGateEntry[];
  generatedAt: string;
  generatedBy: string;
  phase: "phase-67";
  publicClaimable: string[];
  summary: { consistent: number; overClaiming: number; publicClaimable: number; total: number };
}

export function buildClaimGateReport(
  declarations: Array<{ file: string; value: unknown }>,
  now: string,
): ClaimGateReport {
  const entries: ClaimGateEntry[] = [];
  for (const { file, value } of declarations) {
    const schema = validateClaimReport(value);
    if (!schema.valid) {
      entries.push({
        benchmark: isRecord(value) && isNonEmpty(value.benchmark) ? value.benchmark : file,
        blockers: [],
        computedPublicClaimAllowed: false,
        consistent: false,
        declaredPublicClaimAllowed: false,
        file,
        schemaErrors: schema.errors,
        status: "not_started",
        // schema invalid -> not consistent
      });
      continue;
    }
    const report = value as BenchmarkClaimReport;
    const verdict = evaluateClaimBoundary(report);
    entries.push({
      benchmark: report.benchmark,
      blockers: verdict.blockers,
      computedPublicClaimAllowed: verdict.publicClaimAllowed,
      consistent: report.claimBoundary.publicClaimAllowed === verdict.publicClaimAllowed,
      declaredPublicClaimAllowed: report.claimBoundary.publicClaimAllowed,
      file,
      schemaErrors: [],
      status: report.status,
    });
  }

  // Over-claiming is the dangerous direction: declaring a public claim the rules
  // forbid. (Under-claiming — declaring false when rules allow — is also flagged
  // as inconsistent but is merely overly cautious.)
  const overClaiming = entries.filter(
    (entry) => entry.declaredPublicClaimAllowed && !entry.computedPublicClaimAllowed,
  ).length;
  const publicClaimable = entries
    .filter((entry) => entry.computedPublicClaimAllowed && entry.consistent)
    .map((entry) => entry.benchmark);

  return {
    allConsistent: entries.every((entry) => entry.consistent && entry.schemaErrors.length === 0),
    entries,
    generatedAt: now,
    generatedBy: "scripts/run-public-benchmark-claim-gate.ts",
    phase: "phase-67",
    publicClaimable,
    summary: {
      consistent: entries.filter((entry) => entry.consistent).length,
      overClaiming,
      publicClaimable: publicClaimable.length,
      total: entries.length,
    },
  };
}

export async function runPublicBenchmarkClaimGate(input: {
  claimsDir?: string;
  now?: () => string;
  outputDir?: string;
  readDir?: (path: string) => Promise<string[]>;
  readFile?: (path: string) => Promise<string>;
}): Promise<ClaimGateReport> {
  const repoRoot = resolveRepoRootFromScriptUrl(import.meta.url);
  const claimsDir = input.claimsDir ?? join(repoRoot, "benchmark-claims");
  const readDirImpl = input.readDir ?? ((path: string) => readdir(path));
  const readFileImpl = input.readFile ?? ((path: string) => readFile(path, "utf8"));
  const now = (input.now ?? (() => new Date().toISOString()))();

  const files = (await readDirImpl(claimsDir)).filter((file) => file.endsWith(".json")).sort();
  const declarations: Array<{ file: string; value: unknown }> = [];
  for (const file of files) {
    const raw = await readFileImpl(join(claimsDir, file));
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      value = { __parseError: String(error) };
    }
    declarations.push({ file, value });
  }

  const report = buildClaimGateReport(declarations, now);
  const outputDir = input.outputDir ?? join(repoRoot, "reports", "release", "claims");
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "claim-gate-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outputDir, "summary.md"), renderClaimGateSummary(report));
  return report;
}

export function renderClaimGateSummary(report: ClaimGateReport): string {
  const lines: string[] = [];
  lines.push("# Public Benchmark Claim Gate");
  lines.push("");
  lines.push(`- generated: ${report.generatedAt}`);
  lines.push(
    `- declarations: ${report.summary.total} | consistent: ${report.summary.consistent} | ` +
      `over-claiming: ${report.summary.overClaiming} | publicly claimable: ${report.summary.publicClaimable}`,
  );
  lines.push(
    `- publicly claimable now: ${report.publicClaimable.length > 0 ? report.publicClaimable.join(", ") : "none"}`,
  );
  lines.push("");
  lines.push("| Benchmark | Status | Declared | Computed | Consistent | Blockers |");
  lines.push("|---|---|---|---|---|---|");
  for (const entry of report.entries) {
    const blockers =
      entry.schemaErrors.length > 0
        ? `SCHEMA: ${entry.schemaErrors.join("; ")}`
        : entry.blockers.length > 0
          ? entry.blockers.join("; ")
          : "(none)";
    lines.push(
      `| ${entry.benchmark} | ${entry.status} | ${entry.declaredPublicClaimAllowed} | ` +
        `${entry.computedPublicClaimAllowed} | ${entry.consistent ? "yes" : "NO"} | ` +
        `${blockers.replace(/\n/gu, " ").replace(/\|/gu, "\\|").slice(0, 200)} |`,
    );
  }
  lines.push("");
  lines.push(
    "A benchmark may be promoted to a public README row only when it is publicly" +
      " claimable (no blockers) and its declaration is consistent.",
  );
  lines.push("");
  return `${lines.join("\n")}\n`;
}

if (import.meta.main) {
  const strict = Bun.argv.includes("--strict");
  const report = await runPublicBenchmarkClaimGate({
    claimsDir: resolveCliFlagValue(Bun.argv, "--claims-dir"),
  });
  process.stdout.write(renderClaimGateSummary(report));
  if (strict && (!report.allConsistent || report.summary.overClaiming > 0)) {
    process.exitCode = 1;
  }
}
