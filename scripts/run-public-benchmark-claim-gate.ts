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
  if (report.dataset.vendored !== false) {
    blockers.push("dataset must not be vendored into the repo (dataset.vendored must be false)");
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
  notes: string[];
  schemaErrors: string[];
  status: ClaimStatus;
}

// Non-blocking observations that must stay visible on every gate run (e.g. a
// non-commercial dataset license is legal for research evidence but any public
// claim wording must disclose it).
export function collectClaimNotes(report: BenchmarkClaimReport): string[] {
  const notes: string[] = [];
  const license = report.dataset.license;
  if (isNonEmpty(license) && /\bNC\b|non-?commercial/iu.test(license)) {
    notes.push(
      `non-commercial dataset license (${license.trim()}): any public claim must disclose the non-commercial scope`,
    );
  }
  return notes;
}

// A README "public claims" table row is itself a public claim. The tables are
// delimited by explicit markers so the check is language-agnostic (README.md and
// README.zh-CN.md share the same markers).
export const README_CLAIMS_TABLE_START = "<!-- public-claims-table:start -->";
export const README_CLAIMS_TABLE_END = "<!-- public-claims-table:end -->";

export interface ReadmeClaimTableCheck {
  consistent: boolean;
  file: string;
  forbiddenRows: string[];
  markersFound: boolean;
  missingClaimableBenchmarks: string[];
  rows: string[];
  unmatchedRows: string[];
}

export function extractPublicClaimsTableRows(markdown: string): {
  markersFound: boolean;
  rows: string[];
} {
  const start = markdown.indexOf(README_CLAIMS_TABLE_START);
  const end = markdown.indexOf(README_CLAIMS_TABLE_END);
  if (start === -1 || end === -1 || end < start) {
    return { markersFound: false, rows: [] };
  }
  const rows: string[] = [];
  for (const line of markdown.slice(start, end).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      continue;
    }
    const firstCell = trimmed
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0)[0];
    if (!isNonEmpty(firstCell)) {
      continue;
    }
    if (/^:?-+:?$/u.test(firstCell)) {
      continue;
    }
    if (rows.length === 0 && /benchmark|基准|基準/iu.test(firstCell)) {
      continue;
    }
    rows.push(firstCell);
  }
  return { markersFound: true, rows };
}

export function checkReadmeClaimTables(
  readmes: Array<{ content: string; file: string }>,
  entries: ClaimGateEntry[],
): ReadmeClaimTableCheck[] {
  const claimable = entries
    .filter((entry) => entry.computedPublicClaimAllowed && entry.consistent)
    .map((entry) => entry.benchmark);
  const declared = entries.map((entry) => entry.benchmark);
  const matches = (row: string, benchmark: string): boolean =>
    row.toLowerCase().includes(benchmark.toLowerCase());
  return readmes.map(({ content, file }) => {
    const { markersFound, rows } = extractPublicClaimsTableRows(content);
    const forbiddenRows = rows.filter((row) =>
      declared.some((benchmark) => !claimable.includes(benchmark) && matches(row, benchmark)),
    );
    const unmatchedRows = rows.filter(
      (row) => !declared.some((benchmark) => matches(row, benchmark)),
    );
    const missingClaimableBenchmarks = claimable.filter(
      (benchmark) => !rows.some((row) => matches(row, benchmark)),
    );
    return {
      // Missing claimable benchmarks are under-claiming (promotion waits for
      // explicit sign-off), so they are informational and do not fail the check.
      consistent: markersFound && forbiddenRows.length === 0 && unmatchedRows.length === 0,
      file,
      forbiddenRows,
      markersFound,
      missingClaimableBenchmarks,
      rows,
      unmatchedRows,
    };
  });
}

export interface ClaimGateReport {
  allConsistent: boolean;
  entries: ClaimGateEntry[];
  generatedAt: string;
  generatedBy: string;
  phase: "phase-67";
  publicClaimable: string[];
  readmeChecks: ReadmeClaimTableCheck[];
  readmeConsistent: boolean;
  summary: { consistent: number; overClaiming: number; publicClaimable: number; total: number };
}

export function buildClaimGateReport(
  declarations: Array<{ file: string; value: unknown }>,
  now: string,
  readmes: Array<{ content: string; file: string }> = [],
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
        notes: [],
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
      notes: collectClaimNotes(report),
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
  const readmeChecks = checkReadmeClaimTables(readmes, entries);

  return {
    allConsistent: entries.every((entry) => entry.consistent && entry.schemaErrors.length === 0),
    entries,
    generatedAt: now,
    generatedBy: "scripts/run-public-benchmark-claim-gate.ts",
    phase: "phase-67",
    publicClaimable,
    readmeChecks,
    readmeConsistent: readmeChecks.every((check) => check.consistent),
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

  // A missing README (or missing table markers) is a real signal, not an error:
  // the check reports markersFound=false and fails --strict.
  const readmes: Array<{ content: string; file: string }> = [];
  for (const file of ["README.md", "README.zh-CN.md"]) {
    try {
      readmes.push({ content: await readFileImpl(join(repoRoot, file)), file });
    } catch {
      readmes.push({ content: "", file });
    }
  }

  const report = buildClaimGateReport(declarations, now, readmes);
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
  for (const check of report.readmeChecks) {
    const detail = !check.markersFound
      ? "public-claims-table markers missing"
      : check.consistent
        ? `${check.rows.length} row(s), consistent`
        : [
            check.forbiddenRows.length > 0
              ? `FORBIDDEN rows (declaration not claimable): ${check.forbiddenRows.join("; ")}`
              : "",
            check.unmatchedRows.length > 0
              ? `UNMATCHED rows (no declaration): ${check.unmatchedRows.join("; ")}`
              : "",
          ]
            .filter((part) => part.length > 0)
            .join(" | ");
    lines.push(`- README check ${check.file}: ${check.consistent ? "OK" : "FAIL"} — ${detail}`);
    if (check.missingClaimableBenchmarks.length > 0) {
      lines.push(
        `  (info: claimable but not yet promoted to ${check.file}: ` +
          `${check.missingClaimableBenchmarks.join(", ")})`,
      );
    }
  }
  for (const entry of report.entries) {
    for (const note of entry.notes) {
      lines.push(`- note [${entry.benchmark}]: ${note}`);
    }
  }
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
  if (
    strict &&
    (!report.allConsistent || report.summary.overClaiming > 0 || !report.readmeConsistent)
  ) {
    process.exitCode = 1;
  }
}
