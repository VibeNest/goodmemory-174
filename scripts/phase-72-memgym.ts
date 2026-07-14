export type MemGymProfile = "goodmemory" | "no-memory";

export interface MemGymFactDecision {
  confidence: number;
  factId: string;
  recalled: boolean;
}

export interface MemGymCaseResult {
  answer: string;
  caseId: string;
  confidence: number;
  executionFailure?: string;
  factDecisions: MemGymFactDecision[];
  profile: MemGymProfile;
  sourcesUsed: string[];
}

export interface MemGymProfileSummary {
  caseCount: number;
  correctCases: number;
  executionFailures: number;
  factRecall: number;
  qaAccuracy: number;
}

export interface MemGymComparison {
  delta: number;
  failures: string[];
  status: "failed" | "passed";
}

export function summarizeMemGymProfile(
  cases: readonly MemGymCaseResult[],
): MemGymProfileSummary {
  let correctCases = 0;
  let executionFailures = 0;
  let recalledFacts = 0;
  let totalFacts = 0;

  for (const result of cases) {
    const recalled = result.factDecisions.filter(({ recalled }) => recalled).length;
    recalledFacts += recalled;
    totalFacts += result.factDecisions.length;
    if (result.executionFailure) {
      executionFailures += 1;
      continue;
    }
    if (
      result.factDecisions.length > 0 &&
      recalled / result.factDecisions.length >= 0.5
    ) {
      correctCases += 1;
    }
  }

  return {
    caseCount: cases.length,
    correctCases,
    executionFailures,
    factRecall: totalFacts === 0 ? 0 : recalledFacts / totalFacts,
    qaAccuracy: cases.length === 0 ? 0 : correctCases / cases.length,
  };
}

export function evaluateMemGymComparison(input: {
  goodmemory: MemGymProfileSummary;
  noMemory: MemGymProfileSummary;
}): MemGymComparison {
  const failures: string[] = [];
  if (
    input.goodmemory.executionFailures > 0 ||
    input.noMemory.executionFailures > 0
  ) {
    failures.push("MemGym executionFailures must be 0");
  }
  if (input.goodmemory.caseCount !== input.noMemory.caseCount) {
    failures.push("MemGym profile case counts must match");
  }
  const delta = input.goodmemory.qaAccuracy - input.noMemory.qaAccuracy;
  if (delta + Number.EPSILON < 0.05) {
    failures.push(
      "GoodMemory MemGym QA accuracy must beat no-memory by at least 0.05",
    );
  }
  return {
    delta,
    failures,
    status: failures.length === 0 ? "passed" : "failed",
  };
}
