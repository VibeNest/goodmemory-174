import { readFile } from "node:fs/promises";
import { relative } from "node:path";

interface CoverageRecord {
  path: string;
  covered: number;
  found: number;
}

interface ThresholdGroup {
  name: string;
  threshold: number;
  matches: (path: string) => boolean;
}

const GROUPS: ThresholdGroup[] = [
  {
    name: "src/domain",
    threshold: 90,
    matches: (path) => path.startsWith("src/domain/"),
  },
  {
    name: "src/remember",
    threshold: 90,
    matches: (path) => path.startsWith("src/remember/"),
  },
  {
    name: "src/recall",
    threshold: 90,
    matches: (path) => path.startsWith("src/recall/"),
  },
  {
    name: "src/runtime",
    threshold: 90,
    matches: (path) => path.startsWith("src/runtime/"),
  },
  {
    name: "src/maintenance",
    threshold: 90,
    matches: (path) => path.startsWith("src/maintenance/"),
  },
  {
    name: "src/verify",
    threshold: 90,
    matches: (path) => path.startsWith("src/verify/"),
  },
  {
    name: "src/storage",
    threshold: 90,
    matches: (path) => path.startsWith("src/storage/"),
  },
  {
    name: "src/eval",
    threshold: 80,
    matches: (path) => path.startsWith("src/eval/"),
  },
  {
    name: "src/llm",
    threshold: 80,
    matches: (path) => path.startsWith("src/llm/"),
  },
  {
    name: "scripts/run-eval.ts",
    threshold: 80,
    matches: (path) => path === "scripts/run-eval.ts",
  },
];

function normalizeCoveragePath(value: string): string {
  const path = relative(process.cwd(), value).replaceAll("\\", "/");
  return path.startsWith("../") ? value.replaceAll("\\", "/") : path;
}

function parseLcov(content: string): CoverageRecord[] {
  const records: CoverageRecord[] = [];
  let currentPath: string | null = null;
  let currentCovered = 0;
  let currentFound = 0;

  const flush = () => {
    if (!currentPath) {
      return;
    }

    records.push({
      path: normalizeCoveragePath(currentPath),
      covered: currentCovered,
      found: currentFound,
    });
  };

  for (const line of content.split("\n")) {
    if (line.startsWith("SF:")) {
      flush();
      currentPath = line.slice(3).trim();
      currentCovered = 0;
      currentFound = 0;
      continue;
    }

    if (line.startsWith("LH:")) {
      currentCovered = Number(line.slice(3));
      continue;
    }

    if (line.startsWith("LF:")) {
      currentFound = Number(line.slice(3));
      continue;
    }
  }

  flush();
  return records;
}

function formatPercent(covered: number, found: number): string {
  if (found === 0) {
    return "0.00";
  }

  return ((covered / found) * 100).toFixed(2);
}

function resolveOverallRecords(records: CoverageRecord[]): CoverageRecord[] {
  return records.filter((record) => {
    if (record.path.startsWith("src/")) {
      return true;
    }

    return record.path === "scripts/run-eval.ts";
  });
}

async function main(): Promise<void> {
  const raw = await readFile("coverage/lcov.info", "utf8");
  const records = parseLcov(raw);
  const failures: string[] = [];

  const overallRecords = resolveOverallRecords(records);
  const overallCovered = overallRecords.reduce((sum, record) => sum + record.covered, 0);
  const overallFound = overallRecords.reduce((sum, record) => sum + record.found, 0);
  const overallPercent = Number(formatPercent(overallCovered, overallFound));

  console.log(`Coverage overall: ${overallPercent.toFixed(2)}% (${overallCovered}/${overallFound})`);
  if (overallPercent < 93) {
    failures.push(`overall deterministic line coverage ${overallPercent.toFixed(2)}% < 93.00%`);
  }

  for (const group of GROUPS) {
    const matched = records.filter((record) => group.matches(record.path));
    const covered = matched.reduce((sum, record) => sum + record.covered, 0);
    const found = matched.reduce((sum, record) => sum + record.found, 0);
    const percent = Number(formatPercent(covered, found));

    console.log(`${group.name}: ${percent.toFixed(2)}% (${covered}/${found})`);

    if (matched.length === 0) {
      failures.push(`coverage group ${group.name} did not match any files`);
      continue;
    }

    if (percent < group.threshold) {
      failures.push(
        `${group.name} line coverage ${percent.toFixed(2)}% < ${group.threshold.toFixed(2)}%`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(`Coverage gate failed:\n- ${failures.join("\n- ")}`);
  }
}

await main();
