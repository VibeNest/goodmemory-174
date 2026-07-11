import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { LocomoQaCategory } from "../src/eval/locomo";
import {
  resolveCliFlagValueStrict,
  resolveEnvValueStrict,
} from "./cli-options";
import {
  PHASE70_LOCOMO_BENCHMARK_FINGERPRINT,
  collectPacketTurnIds,
} from "./phase-70-reranker-contracts";
import {
  buildLocomoScope,
  collectLocomoRetrievedTurnIds,
  createLocomoSmokeMemory,
  loadLocomoCases,
  scoreLocomoRetrieval,
  seedLocomoCase,
} from "./run-phase-65-locomo-smoke";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

const TARGET_QUESTIONS_PER_CATEGORY = 12;
const PROTECTION_QUESTIONS_PER_CATEGORY = 4;
const TARGET_CATEGORIES = ["multi_hop", "open_domain"] as const;
const PROTECTION_CATEGORIES = [
  "adversarial",
  "single_hop",
  "temporal",
] as const;

export interface Phase70SelectionDiagnostic {
  candidateCount: number;
  caseId: string;
  category: string;
  fullEvidenceRecall: number;
  packetEvidenceRecall: number;
  packetNoiseTurnCount: number;
  questionId: string;
}

function selectDiverseProtectionRows(
  rows: readonly Phase70SelectionDiagnostic[],
): Phase70SelectionDiagnostic[] {
  const groups = new Map<string, Phase70SelectionDiagnostic[]>();
  for (const row of [...rows].sort((left, right) =>
    left.questionId.localeCompare(right.questionId),
  )) {
    const groupId = row.caseId;
    const group = groups.get(groupId) ?? [];
    group.push(row);
    groups.set(groupId, group);
  }
  const selected: Phase70SelectionDiagnostic[] = [];
  const groupIds = [...groups.keys()].sort();
  let round = 0;
  while (selected.length < PROTECTION_QUESTIONS_PER_CATEGORY) {
    let added = false;
    for (const groupId of groupIds) {
      const row = groups.get(groupId)?.[round];
      if (row) {
        selected.push(row);
        added = true;
      }
      if (selected.length >= PROTECTION_QUESTIONS_PER_CATEGORY) {
        break;
      }
    }
    if (!added) {
      break;
    }
    round += 1;
  }
  return selected;
}

export interface Phase70SelectedSlice {
  protectionQuestionIds: string[];
  targetQuestionIds: string[];
}

function targetRank(
  left: Phase70SelectionDiagnostic,
  right: Phase70SelectionDiagnostic,
): number {
  const leftGap = left.fullEvidenceRecall - left.packetEvidenceRecall;
  const rightGap = right.fullEvidenceRecall - right.packetEvidenceRecall;
  return (
    rightGap - leftGap ||
    right.packetNoiseTurnCount - left.packetNoiseTurnCount ||
    left.questionId.localeCompare(right.questionId)
  );
}

export function selectPhase70RerankerSlice(
  diagnostics: readonly Phase70SelectionDiagnostic[],
): Phase70SelectedSlice {
  const targetQuestionIds = TARGET_CATEGORIES.flatMap((category) =>
    diagnostics
      .filter(
        (row) =>
          row.category === category &&
          row.candidateCount >= 2 &&
          row.fullEvidenceRecall > row.packetEvidenceRecall,
      )
      .sort(targetRank)
      .slice(0, TARGET_QUESTIONS_PER_CATEGORY)
      .map((row) => row.questionId),
  );
  const protectionQuestionIds = PROTECTION_CATEGORIES.flatMap((category) =>
    selectDiverseProtectionRows(
      diagnostics.filter(
        (row) => row.category === category && row.candidateCount >= 2,
      ),
    ).map((row) => row.questionId),
  );
  const expectedTargets =
    TARGET_CATEGORIES.length * TARGET_QUESTIONS_PER_CATEGORY;
  const expectedProtections =
    PROTECTION_CATEGORIES.length * PROTECTION_QUESTIONS_PER_CATEGORY;
  if (targetQuestionIds.length !== expectedTargets) {
    throw new Error(
      `Phase 70 selection found ${targetQuestionIds.length}/${expectedTargets} target gaps.`,
    );
  }
  if (protectionQuestionIds.length !== expectedProtections) {
    throw new Error(
      `Phase 70 selection found ${protectionQuestionIds.length}/${expectedProtections} protection questions.`,
    );
  }
  return { protectionQuestionIds, targetQuestionIds };
}

function shouldMeasureProtection(
  category: LocomoQaCategory,
  caseId: string,
  covered: ReadonlySet<string>,
): boolean {
  return (
    (PROTECTION_CATEGORIES as readonly string[]).includes(category) &&
    !covered.has(`${caseId}:${category}`)
  );
}

export async function buildPhase70RerankerSelection(input: {
  benchmarkRoot: string;
  now?: () => Date;
  progress?: (message: string) => void;
}): Promise<{
  benchmarkFingerprint: string;
  generatedAt: string;
  protectionQuestionIds: string[];
  schemaVersion: 1;
  selectionBasis: string;
  targetQuestionIds: string[];
}> {
  const loaded = await loadLocomoCases({
    benchmarkRoot: input.benchmarkRoot,
    readFile: (path) => readFile(path, "utf8"),
  });
  if (loaded.benchmarkFingerprint !== PHASE70_LOCOMO_BENCHMARK_FINGERPRINT) {
    throw new Error("LoCoMo source does not match the pinned Phase 70 dataset.");
  }
  const diagnostics: Phase70SelectionDiagnostic[] = [];
  const coveredProtectionCategories = new Set<string>();
  const runId = "phase70-reranker-selection";
  for (const testCase of loaded.cases) {
    input.progress?.(`Phase 70 selection: indexing ${testCase.caseId}`);
    const memory = createLocomoSmokeMemory({ generalizedFusion: true });
    await seedLocomoCase({
      labelFreeIngest: true,
      memory,
      runId,
      testCase,
    });
    const scope = buildLocomoScope({ caseId: testCase.caseId, runId });
    for (const question of testCase.questions) {
      const target = (TARGET_CATEGORIES as readonly string[]).includes(
        question.category,
      );
      const protection = shouldMeasureProtection(
        question.category,
        testCase.caseId,
        coveredProtectionCategories,
      );
      if (!target && !protection) {
        continue;
      }
      const recall = await memory.recall({
        query: question.question,
        scope,
        strategy: "hybrid",
      });
      const full = scoreLocomoRetrieval({
        question,
        retrievedTurnIds: collectLocomoRetrievedTurnIds(recall),
        testCase,
      });
      const packet = scoreLocomoRetrieval({
        question,
        retrievedTurnIds: collectPacketTurnIds(recall.packet),
        testCase,
      });
      diagnostics.push({
        candidateCount: recall.facts.length,
        caseId: testCase.caseId,
        category: question.category,
        fullEvidenceRecall: full.evidenceRecall,
        packetEvidenceRecall: packet.evidenceRecall,
        packetNoiseTurnCount: packet.noiseTurnCount,
        questionId: question.questionId,
      });
      if (protection && recall.facts.length >= 2) {
        coveredProtectionCategories.add(
          `${testCase.caseId}:${question.category}`,
        );
      }
    }
    input.progress?.(
      `Phase 70 selection: completed ${testCase.caseId} (${diagnostics.length} diagnostics)`,
    );
  }
  return {
    benchmarkFingerprint: loaded.benchmarkFingerprint,
    generatedAt: (input.now ?? (() => new Date()))().toISOString(),
    ...selectPhase70RerankerSlice(diagnostics),
    schemaVersion: 1,
    selectionBasis:
      "Baseline-only diagnostic: target rows have gold evidence in Phase 69 recalled membership but outside the real MemoryPacket top-6; protection rows are stable category samples. No reranker output was inspected.",
  };
}

if (import.meta.main) {
  const repoRoot = resolveRepoRootFromScriptUrl(import.meta.url);
  const benchmarkRoot =
    resolveCliFlagValueStrict(process.argv, "--benchmark-root") ??
    resolveEnvValueStrict(process.env, "GOODMEMORY_LOCOMO_ROOT");
  if (!benchmarkRoot) {
    throw new Error("--benchmark-root is required.");
  }
  const outputPath =
    resolveCliFlagValueStrict(process.argv, "--output-path") ??
    join(
      repoRoot,
      "scripts",
      "eval-profiles",
      "phase-70",
      "locomo-reranker-selection.json",
    );
  const manifest = await buildPhase70RerankerSelection({
    benchmarkRoot,
    progress: (message) => process.stderr.write(`${message}\n`),
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({
      outputPath,
      protectionCount: manifest.protectionQuestionIds.length,
      targetCount: manifest.targetQuestionIds.length,
    }, null, 2)}\n`,
  );
}
