// In-process, gateway-free measurement of each opt-in retrieval lever's marginal
// effect on LoCoMo gold-turn evidence recall (deterministic, no LLM judge). Runs
// all arms in one process with a unique runId each, so there is no shared-report
// file race. Reuses the trusted smoke-harness loader + scorer read-only.
//
//   bun run scripts/measure-locomo-levers.ts --benchmark-root /private/tmp/LOCOMO3
import {
  overallLocomoEvidenceRecall,
  runLocomoSmoke,
  type LocomoSmokeCliOptions,
  type LocomoSmokeReport,
} from "./run-phase-65-locomo-smoke";
import {
  hasCliFlagStrict,
  resolveCliFlagValueStrict,
  resolveEnvValueStrict,
} from "./cli-options";

type ArmOptions = Pick<
  LocomoSmokeCliOptions,
  "bm25" | "decompose" | "multiHop" | "rerank" | "conversationalExtraction"
>;

export interface LocomoLeversCliOptions {
  armLabels?: string[];
  benchmarkRoot?: string;
  limit?: number;
  live: boolean;
  outputDir?: string;
}

const ARMS: ReadonlyArray<{ label: string; options: ArmOptions }> = [
  { label: "jaccard-baseline", options: {} },
  { label: "bm25", options: { bm25: true } },
  { label: "bm25+decompose", options: { bm25: true, decompose: true } },
  { label: "bm25+multihop", options: { bm25: true, multiHop: true } },
  { label: "bm25+rerank", options: { bm25: true, rerank: true } },
  {
    label: "bm25+decompose+rerank",
    options: { bm25: true, decompose: true, rerank: true },
  },
  {
    label: "bm25+conversational",
    options: { bm25: true, conversationalExtraction: true },
  },
  {
    label: "bm25+decompose+multihop+rerank",
    options: { bm25: true, decompose: true, multiHop: true, rerank: true },
  },
];

function categoryRecall(report: LocomoSmokeReport): Record<string, number> {
  const out: Record<string, number> = {};
  for (const summary of report.categories ?? []) {
    out[summary.category] = summary.averageEvidenceRecall;
  }
  return out;
}

function answerAccuracy(report: LocomoSmokeReport): number | null {
  const answered = report.cases.filter((entry) => entry.answerCorrect !== null);
  if (answered.length === 0) {
    return null;
  }
  const correct = answered.filter((entry) => entry.answerCorrect === true).length;
  return correct / answered.length;
}

function parsePositiveIntegerFlag(
  argv: readonly string[],
  flag: string,
): number | undefined {
  const raw = resolveCliFlagValueStrict(argv, flag);
  if (raw === undefined) {
    return undefined;
  }
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return value;
}

function parseArmLabelsFlag(
  argv: readonly string[],
  flag: string,
): string[] | undefined {
  const raw = resolveCliFlagValueStrict(argv, flag);
  if (raw === undefined) {
    return undefined;
  }
  const labels = raw.split(",");
  if (labels.length === 0) {
    throw new Error(`${flag} requires at least one arm label.`);
  }
  const validLabels = new Set(ARMS.map((arm) => arm.label));
  const seen = new Set<string>();
  const parsed: string[] = [];
  for (const label of labels) {
    const trimmed = label.trim();
    if (trimmed.length === 0) {
      throw new Error(`${flag} contains an empty arm label.`);
    }
    if (trimmed !== label) {
      throw new Error(
        `${flag} contains whitespace-padded arm '${trimmed}'.`,
      );
    }
    if (!validLabels.has(label)) {
      throw new Error(
        `${flag} contains unknown arm '${label}'. Valid arms: ${ARMS.map((arm) => arm.label).join(", ")}.`,
      );
    }
    if (seen.has(label)) {
      throw new Error(`${flag} contains duplicate arm '${label}'.`);
    }
    seen.add(label);
    parsed.push(label);
  }
  return parsed;
}

export function parseLocomoLeversCliOptions(
  argv: readonly string[],
): LocomoLeversCliOptions {
  return {
    armLabels: parseArmLabelsFlag(argv, "--arms"),
    benchmarkRoot:
      resolveCliFlagValueStrict(argv, "--benchmark-root") ??
      resolveEnvValueStrict(process.env, "GOODMEMORY_LOCOMO_ROOT"),
    limit: parsePositiveIntegerFlag(argv, "--limit"),
    live: hasCliFlagStrict(argv, "--live"),
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir"),
  };
}

async function main(): Promise<void> {
  const { armLabels, benchmarkRoot, limit, live, outputDir } =
    parseLocomoLeversCliOptions(Bun.argv);
  // Live answer A/B (deterministic F1, no judge) is bounded to the key arms.
  const liveArms = ["jaccard-baseline", "bm25", "bm25+decompose"];
  const armsFilter = armLabels ?? null;
  // An explicit --arms list selects from ALL arms; otherwise --live narrows to
  // the key answer-A/B arms, and the default runs every arm.
  const arms = armsFilter
    ? ARMS.filter((arm) => armsFilter.includes(arm.label))
    : live
      ? ARMS.filter((arm) => liveArms.includes(arm.label))
      : ARMS;

  const rows: Array<{
    label: string;
    overall: number;
    categories: Record<string, number>;
    answer: number | null;
    fails: number;
    questions: number;
  }> = [];
  for (const arm of arms) {
    const report = await runLocomoSmoke({
      ...arm.options,
      benchmarkRoot,
      outputDir,
      limit,
      live,
      evidencePack: live ? true : undefined,
      runId: `measure-locomo-levers-${live ? "live-" : ""}${arm.label}`,
    });
    rows.push({
      label: arm.label,
      overall: overallLocomoEvidenceRecall(report.cases),
      categories: categoryRecall(report),
      answer: answerAccuracy(report),
      fails: report.executionFailures,
      questions: report.questionCount,
    });
  }

  const categories = ["single_hop", "multi_hop", "temporal", "open_domain"];
  console.log(
    live
      ? "# LoCoMo answer accuracy + recall by lever (deterministic F1, no judge)"
      : "# LoCoMo gold-turn evidence recall by lever (deterministic, no judge)",
  );
  console.log("");
  const answerHeader = live ? " answer acc |" : "";
  const answerDivider = live ? "---:|" : "";
  console.log(
    `| arm |${answerHeader} overall recall | ${categories.join(" | ")} | exec fails | questions |`,
  );
  console.log(
    `|---|${answerDivider}---:|${categories.map(() => "---:").join("|")}|---:|---:|`,
  );
  for (const row of rows) {
    const cells = categories.map(
      (category) => `${((row.categories[category] ?? 0) * 100).toFixed(1)}%`,
    );
    const answerCell = live
      ? ` ${row.answer === null ? "n/a" : `${(row.answer * 100).toFixed(1)}%`} |`
      : "";
    console.log(
      `| ${row.label} |${answerCell} ${(row.overall * 100).toFixed(1)}% | ${cells.join(" | ")} | ${row.fails} | ${row.questions} |`,
    );
  }
}

if (import.meta.main) {
  await main();
}
