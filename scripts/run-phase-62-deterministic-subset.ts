/**
 * Phase 62 / P67-B — LongMemEval deterministic-subset accuracy.
 *
 * The LongMemEval answer scorer (src/eval/longmemeval.ts) runs deterministic
 * match methods FIRST (abstention/exact/contains/expected_alternative/
 * numeric_count) and only falls through to an LLM `semantic_judge` when every
 * deterministic method returns `mismatch`. Because GoodMemory's answer model
 * and judge model are the SAME model (gpt-5.5), a public claim cannot lean on
 * `semantic_judge` without same-model judge bias.
 *
 * This analyzer carves out the JUDGE-FREE subset: a case counts as correct only
 * when it was scored correct by a deterministic method. That subset accuracy is
 * a strict LOWER BOUND on overall accuracy and contains no judge contribution at
 * all, so it is publicly claimable under the benchmark claim gate.
 *
 * It consumes the merged `report.json` produced by `eval:phase-62-full500-summary`
 * (a full LongMemEvalReport that retains per-case `answerScore.method`).
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import {
  resolvePhase62OutputDir,
  resolvePhase62RepoRoot,
} from "./run-phase-62-shared";
import {
  LONGMEMEVAL_PROFILES,
  type LongMemEvalAnswerScoreMethod,
  type LongMemEvalCaseResult,
  type LongMemEvalProfile,
  type LongMemEvalReport,
} from "../src/eval/longmemeval";

const GENERATED_BY = "scripts/run-phase-62-deterministic-subset.ts";

/**
 * Methods that score a case correct WITHOUT invoking the LLM judge. A correct
 * case scored by any of these is judge-free; `semantic_judge` is excluded by
 * construction, and `mismatch` never marks a case correct.
 */
export const LONGMEMEVAL_DETERMINISTIC_METHODS: readonly LongMemEvalAnswerScoreMethod[] =
  ["abstention", "exact", "contains", "expected_alternative", "numeric_count"];

const DEFAULT_CLAIM_PROFILE: LongMemEvalProfile = "goodmemory-hybrid";
const DEFAULT_BASELINE_PROFILE: LongMemEvalProfile = "baseline-no-memory";

export interface DeterministicSubsetProfileBreakdown {
  profile: string;
  totalCases: number;
  executionFailures: number;
  /** Cases scored correct by a deterministic (judge-free) method. */
  deterministicCorrect: number;
  /** deterministicCorrect / totalCases — the judge-free lower bound. */
  deterministicSubsetAccuracy: number;
  /** Cases scored correct only because the LLM judge rescued a mismatch. */
  judgeRescuedCorrect: number;
  /** Cases scored correct by any method (deterministic + judge). */
  overallCorrect: number;
  /** overallCorrect / totalCases. */
  overallAccuracy: number;
  /** overallAccuracy − deterministicSubsetAccuracy: the judge's contribution. */
  judgeContribution: number;
  /** Count of correct cases by the method that scored them. */
  correctMethodCounts: Record<string, number>;
  /** Defensive: correct cases with no recorded answerScore (not counted as deterministic). */
  correctMissingScore: number;
}

export interface DeterministicSubsetReport {
  generatedBy: string;
  sourceReportRunId: string;
  claimProfile: string;
  baselineProfile: string | null;
  profiles: DeterministicSubsetProfileBreakdown[];
  claim: {
    profile: string;
    deterministicSubsetAccuracy: number;
    executionFailures: number;
    judgeFree: true;
  } | null;
  baseline: {
    profile: string;
    deterministicSubsetAccuracy: number;
  } | null;
  /** claim.deterministicSubsetAccuracy − baseline.deterministicSubsetAccuracy. */
  memoryLift: number | null;
}

function isDeterministicCorrect(caseResult: LongMemEvalCaseResult): boolean {
  if (!caseResult.correct) {
    return false;
  }
  const method = caseResult.answerScore?.method;
  if (method === undefined) {
    return false;
  }
  return LONGMEMEVAL_DETERMINISTIC_METHODS.includes(method);
}

export function summarizeProfileDeterministicSubset(
  profile: string,
  cases: readonly LongMemEvalCaseResult[],
): DeterministicSubsetProfileBreakdown {
  const totalCases = cases.length;
  let deterministicCorrect = 0;
  let judgeRescuedCorrect = 0;
  let overallCorrect = 0;
  let executionFailures = 0;
  let correctMissingScore = 0;
  const correctMethodCounts: Record<string, number> = {};

  for (const caseResult of cases) {
    if (caseResult.executionError) {
      executionFailures += 1;
    }
    if (!caseResult.correct) {
      continue;
    }
    overallCorrect += 1;
    const method = caseResult.answerScore?.method;
    if (method === undefined) {
      correctMissingScore += 1;
      continue;
    }
    correctMethodCounts[method] = (correctMethodCounts[method] ?? 0) + 1;
    if (method === "semantic_judge") {
      judgeRescuedCorrect += 1;
    } else if (isDeterministicCorrect(caseResult)) {
      deterministicCorrect += 1;
    }
  }

  const deterministicSubsetAccuracy =
    totalCases === 0 ? 0 : deterministicCorrect / totalCases;
  const overallAccuracy = totalCases === 0 ? 0 : overallCorrect / totalCases;

  return {
    profile,
    totalCases,
    executionFailures,
    deterministicCorrect,
    deterministicSubsetAccuracy,
    judgeRescuedCorrect,
    overallCorrect,
    overallAccuracy,
    judgeContribution: overallAccuracy - deterministicSubsetAccuracy,
    correctMethodCounts,
    correctMissingScore,
  };
}

export function summarizeLongMemEvalDeterministicSubset(input: {
  report: LongMemEvalReport;
  claimProfile?: LongMemEvalProfile;
  baselineProfile?: LongMemEvalProfile;
}): DeterministicSubsetReport {
  const claimProfile = input.claimProfile ?? DEFAULT_CLAIM_PROFILE;
  const baselineProfile = input.baselineProfile ?? DEFAULT_BASELINE_PROFILE;

  const breakdowns: DeterministicSubsetProfileBreakdown[] = [];
  for (const profile of LONGMEMEVAL_PROFILES) {
    const profileReport = input.report.profiles[profile];
    if (!profileReport) {
      continue;
    }
    breakdowns.push(
      summarizeProfileDeterministicSubset(profile, profileReport.cases),
    );
  }

  const claimBreakdown = breakdowns.find((b) => b.profile === claimProfile);
  const baselineBreakdown = breakdowns.find(
    (b) => b.profile === baselineProfile,
  );

  const claim = claimBreakdown
    ? {
        profile: claimBreakdown.profile,
        deterministicSubsetAccuracy:
          claimBreakdown.deterministicSubsetAccuracy,
        executionFailures: claimBreakdown.executionFailures,
        judgeFree: true as const,
      }
    : null;
  const baseline = baselineBreakdown
    ? {
        profile: baselineBreakdown.profile,
        deterministicSubsetAccuracy:
          baselineBreakdown.deterministicSubsetAccuracy,
      }
    : null;

  return {
    generatedBy: GENERATED_BY,
    sourceReportRunId: input.report.runId,
    claimProfile,
    baselineProfile: baseline ? baselineProfile : null,
    profiles: breakdowns,
    claim,
    baseline,
    memoryLift:
      claim && baseline
        ? claim.deterministicSubsetAccuracy -
          baseline.deterministicSubsetAccuracy
        : null,
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function renderDeterministicSubsetMarkdown(
  report: DeterministicSubsetReport,
): string {
  const lines: string[] = [];
  lines.push("# LongMemEval Deterministic-Subset Accuracy (judge-free)");
  lines.push("");
  lines.push(`- source report: ${report.sourceReportRunId}`);
  lines.push(`- claim profile: ${report.claimProfile}`);
  lines.push(
    `- baseline profile: ${report.baselineProfile ?? "(none present)"}`,
  );
  if (report.claim) {
    lines.push(
      `- judge-free claim: ${formatPercent(report.claim.deterministicSubsetAccuracy)} ` +
        `(executionFailures ${report.claim.executionFailures})`,
    );
  }
  if (report.memoryLift !== null) {
    lines.push(`- memory lift over no-memory baseline: ${formatPercent(report.memoryLift)}`);
  }
  lines.push("");
  lines.push(
    "| Profile | Total | Det. correct | Det. subset acc | Judge-rescued | Overall acc | Exec fails |",
  );
  lines.push("|---|---|---|---|---|---|---|");
  for (const profile of report.profiles) {
    lines.push(
      `| ${profile.profile} | ${profile.totalCases} | ${profile.deterministicCorrect} | ` +
        `${formatPercent(profile.deterministicSubsetAccuracy)} | ${profile.judgeRescuedCorrect} | ` +
        `${formatPercent(profile.overallAccuracy)} | ${profile.executionFailures} |`,
    );
  }
  lines.push("");
  lines.push(
    "Det. subset acc is JUDGE-FREE (no semantic_judge): it counts only cases scored correct by " +
      "abstention/exact/contains/expected_alternative/numeric_count. It is a strict lower bound on overall accuracy.",
  );
  return `${lines.join("\n")}\n`;
}

interface DeterministicSubsetCliOptions {
  reportPath?: string;
  runId?: string;
  outputDir?: string;
  claimProfile?: LongMemEvalProfile;
  baselineProfile?: LongMemEvalProfile;
}

function parseProfileFlag(
  value: string | undefined,
  flag: string,
): LongMemEvalProfile | undefined {
  if (!value) {
    return undefined;
  }
  if (!(LONGMEMEVAL_PROFILES as readonly string[]).includes(value)) {
    throw new Error(
      `${flag} must be one of ${LONGMEMEVAL_PROFILES.join(", ")}`,
    );
  }
  return value as LongMemEvalProfile;
}

function parseCliOptions(
  argv: readonly string[],
): DeterministicSubsetCliOptions {
  return {
    reportPath: resolveCliFlagValue(argv, "--report-path"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    claimProfile: parseProfileFlag(
      resolveCliFlagValue(argv, "--claim-profile"),
      "--claim-profile",
    ),
    baselineProfile: parseProfileFlag(
      resolveCliFlagValue(argv, "--baseline-profile"),
      "--baseline-profile",
    ),
  };
}

function resolveReportPath(options: DeterministicSubsetCliOptions): string {
  if (options.reportPath) {
    return options.reportPath;
  }
  if (!options.runId) {
    throw new Error(
      "Provide --report-path <merged report.json> or --run-id <full500 summary run id>",
    );
  }
  const root = resolvePhase62RepoRoot();
  const outputDir = options.outputDir ?? resolvePhase62OutputDir(root);
  return join(outputDir, options.runId, "report.json");
}

async function runCli(argv: readonly string[]): Promise<void> {
  const options = parseCliOptions(argv);
  const reportPath = resolveReportPath(options);
  const raw = await readFile(reportPath, "utf8");
  const report = JSON.parse(raw) as LongMemEvalReport;
  if (report.phase !== "phase-62" || report.source?.benchmark !== "LongMemEval") {
    throw new Error(
      `Not a phase-62 LongMemEval report: ${reportPath}`,
    );
  }

  const subset = summarizeLongMemEvalDeterministicSubset({
    report,
    claimProfile: options.claimProfile,
    baselineProfile: options.baselineProfile,
  });

  const markdown = renderDeterministicSubsetMarkdown(subset);
  console.log(markdown);

  const root = resolvePhase62RepoRoot();
  const outputDir = options.outputDir ?? resolvePhase62OutputDir(root);
  const runDirectory = join(
    outputDir,
    `${report.runId}-deterministic-subset`,
  );
  await mkdir(runDirectory, { recursive: true });
  await writeFile(
    join(runDirectory, "deterministic-subset.json"),
    `${JSON.stringify(subset, null, 2)}\n`,
  );
  await writeFile(join(runDirectory, "deterministic-subset.md"), markdown);
}

if (import.meta.main) {
  await runCli(Bun.argv);
}
