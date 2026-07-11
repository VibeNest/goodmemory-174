// Gateway-free, embedding-free floor-lift measurement for the entity
// candidate-admission arm retained under scripts/eval-profiles.
//
// It compares a lexical-floor baseline retriever against the SAME baseline UNION
// the entity arm, over LoCoMo turns, and reports the entity arm's ADDITIVE
// retrieval delta per category: recall, fully-retrieved, noise, and recall per
// 100 added noise turns (the plan's promote/kill metric). No provider, no LLM,
// no embeddings — this isolates whether the entity arm lifts the rules-only
// floor, which is the value the arm is scoped to.
//
// Retrieval-only and research-diagnostic: it scores retrieved turn-ids against
// gold evidence turn-ids and never generates or judges an answer, so it is not a
// benchmark claim and needs no answer gateway. The pure core is exported for
// unit tests; the CLI wrapper loads a prepared `cases.json` root (or the
// synthetic smoke cases) and writes a JSON report.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  buildLocomoSmokeCases,
  LOCOMO_QA_CATEGORIES,
} from "../src/eval/locomo";
import type { LocomoCase, LocomoQaCategory } from "../src/eval/locomo";
import { buildEntityDocumentFrequency } from "../src/recall/entityExtraction";
import type { EntityDocument } from "../src/recall/entityExtraction";
import { selectEntityUnionCandidates } from "./eval-profiles/generalized-probes/entityUnion";
import type { EntityUnionGates } from "./eval-profiles/generalized-probes/entityUnion";

// SQuAD-ish tokenization for the lexical floor: lower-case, split on
// non-alphanumerics, drop short tokens and a small function-word set.
const LEXICAL_STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "on", "at", "for", "with", "by", "from",
  "and", "or", "is", "are", "was", "were", "did", "do", "does", "what", "when",
  "where", "which", "who", "why", "how", "i", "you", "he", "she", "it", "they",
]);

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const token of text.toLowerCase().split(/[^a-z0-9]+/u)) {
    if (token.length >= 2 && !LEXICAL_STOPWORDS.has(token)) {
      tokens.add(token);
    }
  }
  return tokens;
}

function lexicalTopK(
  query: string,
  turns: readonly EntityDocument[],
  topK: number,
): string[] {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) {
    return [];
  }
  const scored: { id: string; score: number }[] = [];
  for (const turn of turns) {
    let overlap = 0;
    for (const token of tokenize(turn.content)) {
      if (queryTokens.has(token)) {
        overlap += 1;
      }
    }
    if (overlap > 0) {
      scored.push({ id: turn.id, score: overlap });
    }
  }
  scored.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return scored.slice(0, topK).map((entry) => entry.id);
}

export interface EntityFloorLiftConfig {
  baseTopK: number;
  categories: readonly LocomoQaCategory[];
  gates: Partial<EntityUnionGates>;
  maxAdditions: number;
}

export const DEFAULT_ENTITY_FLOOR_LIFT_CONFIG: EntityFloorLiftConfig = {
  baseTopK: 10,
  categories: ["open_domain", "multi_hop"],
  gates: { minEntityOverlap: 2, rareEntityMaxDocFrequency: 2 },
  maxAdditions: 4,
};

export interface CategoryLift {
  addedNoiseTurns: number;
  augmentedAverageRecall: number;
  augmentedFullyRetrieved: number;
  baseAverageRecall: number;
  baseFullyRetrieved: number;
  category: LocomoQaCategory;
  fullyRetrievedGain: number;
  questionCount: number;
  // Retrieval-recall gained per 100 entity-admitted non-gold (noise) turns; the
  // plan's promote/kill metric. Null when the arm admitted no noise.
  recallGainPer100Noise: number | null;
  scoredQuestionCount: number;
}

export interface EntityFloorLiftReport {
  categories: CategoryLift[];
  config: EntityFloorLiftConfig;
  generatedBy: string;
  overall: {
    addedNoiseTurns: number;
    fullyRetrievedGain: number;
    recallGain: number;
    recallGainPer100Noise: number | null;
    scoredQuestionCount: number;
  };
}

function turnsAsDocuments(testCase: LocomoCase): EntityDocument[] {
  return testCase.turns.map((turn) => ({ content: turn.content, id: turn.diaId }));
}

function recallOf(retrieved: ReadonlySet<string>, gold: readonly string[]): number {
  if (gold.length === 0) {
    return 1;
  }
  let hit = 0;
  for (const id of gold) {
    if (retrieved.has(id)) {
      hit += 1;
    }
  }
  return hit / gold.length;
}

function isFullyRetrieved(retrieved: ReadonlySet<string>, gold: readonly string[]): boolean {
  return gold.every((id) => retrieved.has(id));
}

/**
 * Pure measurement core: for each in-scope question, retrieve the lexical top-K
 * base, admit the entity arm's net-new candidates on top, and accumulate the
 * additive retrieval delta per category. Deterministic.
 */
export function measureEntityFloorLift(
  cases: readonly LocomoCase[],
  config: EntityFloorLiftConfig = DEFAULT_ENTITY_FLOOR_LIFT_CONFIG,
): EntityFloorLiftReport {
  const categorySet = new Set(config.categories);
  const perCategory = new Map<
    LocomoQaCategory,
    {
      addedNoise: number;
      augmentedFully: number;
      augmentedRecall: number;
      baseFully: number;
      baseRecall: number;
      fullyGain: number;
      questionCount: number;
      recallGain: number;
      scored: number;
    }
  >();

  for (const testCase of cases) {
    const documents = turnsAsDocuments(testCase);
    const documentFrequency = buildEntityDocumentFrequency(documents);
    for (const question of testCase.questions) {
      if (!categorySet.has(question.category)) {
        continue;
      }
      const bucket = perCategory.get(question.category) ?? {
        addedNoise: 0,
        augmentedFully: 0,
        augmentedRecall: 0,
        baseFully: 0,
        baseRecall: 0,
        fullyGain: 0,
        questionCount: 0,
        recallGain: 0,
        scored: 0,
      };
      bucket.questionCount += 1;
      perCategory.set(question.category, bucket);

      // Empty-gold (adversarial) questions have no retrieval target to score.
      if (question.evidenceTurnIds.length === 0) {
        continue;
      }
      bucket.scored += 1;

      const baseIds = lexicalTopK(question.question, documents, config.baseTopK);
      const baseSet = new Set(baseIds);
      const entity = selectEntityUnionCandidates({
        alreadySelectedIds: baseSet,
        documentFrequency,
        documents,
        gates: config.gates,
        maxAdditions: config.maxAdditions,
        query: question.question,
      });
      const augmentedSet = new Set(baseSet);
      for (const id of entity.admittedIds) {
        augmentedSet.add(id);
      }

      const goldSet = new Set(question.evidenceTurnIds);
      for (const id of entity.admittedIds) {
        if (!goldSet.has(id)) {
          bucket.addedNoise += 1;
        }
      }

      const baseRecall = recallOf(baseSet, question.evidenceTurnIds);
      const augmentedRecall = recallOf(augmentedSet, question.evidenceTurnIds);
      bucket.baseRecall += baseRecall;
      bucket.augmentedRecall += augmentedRecall;
      bucket.recallGain += augmentedRecall - baseRecall;

      const baseFully = isFullyRetrieved(baseSet, question.evidenceTurnIds);
      const augmentedFully = isFullyRetrieved(augmentedSet, question.evidenceTurnIds);
      if (baseFully) {
        bucket.baseFully += 1;
      }
      if (augmentedFully) {
        bucket.augmentedFully += 1;
      }
      if (!baseFully && augmentedFully) {
        bucket.fullyGain += 1;
      }
    }
  }

  const categories: CategoryLift[] = [];
  let overallRecallGain = 0;
  let overallAddedNoise = 0;
  let overallFullyGain = 0;
  let overallScored = 0;
  for (const category of LOCOMO_QA_CATEGORIES) {
    const bucket = perCategory.get(category);
    if (!bucket) {
      continue;
    }
    overallRecallGain += bucket.recallGain;
    overallAddedNoise += bucket.addedNoise;
    overallFullyGain += bucket.fullyGain;
    overallScored += bucket.scored;
    categories.push({
      addedNoiseTurns: bucket.addedNoise,
      augmentedAverageRecall: bucket.scored > 0 ? bucket.augmentedRecall / bucket.scored : 0,
      augmentedFullyRetrieved: bucket.augmentedFully,
      baseAverageRecall: bucket.scored > 0 ? bucket.baseRecall / bucket.scored : 0,
      baseFullyRetrieved: bucket.baseFully,
      category,
      fullyRetrievedGain: bucket.fullyGain,
      questionCount: bucket.questionCount,
      recallGainPer100Noise:
        bucket.addedNoise > 0 ? (bucket.recallGain / bucket.addedNoise) * 100 : null,
      scoredQuestionCount: bucket.scored,
    });
  }

  return {
    categories,
    config,
    generatedBy: "scripts/measure-locomo-entity-floor-lift.ts",
    overall: {
      addedNoiseTurns: overallAddedNoise,
      fullyRetrievedGain: overallFullyGain,
      recallGain: overallRecallGain,
      recallGainPer100Noise:
        overallAddedNoise > 0 ? (overallRecallGain / overallAddedNoise) * 100 : null,
      scoredQuestionCount: overallScored,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI wrapper
// ---------------------------------------------------------------------------

const CLAIM_BOUNDARY =
  "Research diagnostic only: gateway-free, retrieval-only entity-arm floor-lift " +
  "measured against a tight lexical-proxy base (not the engine floor or the " +
  "neural union base). Not answer-scored, not a benchmark or public claim.";

function parseScalarFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : undefined;
}

function parsePositiveIntFlag(argv: string[], flag: string): number | undefined {
  const raw = parseScalarFlag(argv, flag);
  if (raw === undefined) {
    return undefined;
  }
  if (!/^[1-9][0-9]*$/u.test(raw)) {
    throw new Error(`Flag ${flag} expects a positive integer, got: ${raw}`);
  }
  return Number(raw);
}

async function loadCases(root: string): Promise<LocomoCase[]> {
  const raw = await readFile(join(root, "cases.json"), "utf8");
  const parsed: unknown = JSON.parse(raw);
  const cases = Array.isArray(parsed)
    ? parsed
    : (parsed as { cases?: unknown }).cases;
  if (!Array.isArray(cases)) {
    throw new Error("cases.json must be a LocomoCase[] array or { cases: [...] }");
  }
  return cases as LocomoCase[];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const useSynthetic = argv.includes("--synthetic");
  const root = parseScalarFlag(argv, "--benchmark-root");
  const runId = parseScalarFlag(argv, "--run-id") ?? "locomo-entity-floor-lift-current";
  if (/[\\/]/u.test(runId)) {
    throw new Error("--run-id must be a single path segment");
  }
  const categoriesFlag = parseScalarFlag(argv, "--categories");
  const config: EntityFloorLiftConfig = {
    baseTopK: parsePositiveIntFlag(argv, "--base-top-k") ?? DEFAULT_ENTITY_FLOOR_LIFT_CONFIG.baseTopK,
    categories: categoriesFlag
      ? (categoriesFlag.split(",").filter(Boolean) as LocomoQaCategory[])
      : DEFAULT_ENTITY_FLOOR_LIFT_CONFIG.categories,
    gates: {
      minEntityOverlap:
        parsePositiveIntFlag(argv, "--min-entity-overlap") ??
        DEFAULT_ENTITY_FLOOR_LIFT_CONFIG.gates.minEntityOverlap,
      rareEntityMaxDocFrequency:
        parsePositiveIntFlag(argv, "--rare-entity-max-doc-frequency") ??
        DEFAULT_ENTITY_FLOOR_LIFT_CONFIG.gates.rareEntityMaxDocFrequency,
      requireRareEntity: argv.includes("--require-rare-entity"),
    },
    maxAdditions:
      parsePositiveIntFlag(argv, "--max-additions") ?? DEFAULT_ENTITY_FLOOR_LIFT_CONFIG.maxAdditions,
  };

  if (!useSynthetic && !root) {
    throw new Error("Provide --benchmark-root <dir with cases.json> or --synthetic");
  }
  const cases = useSynthetic ? buildLocomoSmokeCases() : await loadCases(root as string);
  const report = measureEntityFloorLift(cases, config);

  // Run-context metadata wraps the deterministic core so the artifact is
  // auditable (lineage, timestamp, and explicit non-claim boundary) without
  // making the measured core itself time-dependent.
  const output = {
    benchmarkSource: useSynthetic ? "synthetic-smoke-cases" : join(root as string, "cases.json"),
    caseCount: cases.length,
    claimBoundary: CLAIM_BOUNDARY,
    generatedAt: new Date().toISOString(),
    runId,
    ...report,
  };

  const outputDir = join(
    "reports/eval/research/phase-65/locomo",
    runId,
  );
  const outputPath = join(outputDir, "entity-floor-lift.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  process.stdout.write(
    `[entity-floor-lift] scored ${report.overall.scoredQuestionCount} Qs; ` +
      `recallGain ${report.overall.recallGain.toFixed(4)}, ` +
      `fullyRetrievedGain ${report.overall.fullyRetrievedGain}, ` +
      `addedNoise ${report.overall.addedNoiseTurns}, ` +
      `recall/100noise ${report.overall.recallGainPer100Noise?.toFixed(4) ?? "n/a"}\n`,
  );
  for (const category of report.categories) {
    process.stdout.write(
      `  ${category.category}: base recall ${category.baseAverageRecall.toFixed(4)} -> ` +
        `${category.augmentedAverageRecall.toFixed(4)}, fully +${category.fullyRetrievedGain}, ` +
        `addedNoise ${category.addedNoiseTurns}, ` +
        `recall/100noise ${category.recallGainPer100Noise?.toFixed(4) ?? "n/a"}\n`,
    );
  }
  process.stdout.write(`[entity-floor-lift] wrote ${outputPath}\n`);
}

if (import.meta.main) {
  await main();
}
