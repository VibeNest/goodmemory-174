// P65-R001 Step 2 eval-only experiment: does GENERIC conversational query
// expansion reduce LoCoMo zero-retrieval? The window experiment ruled out
// positional expansion; the gap is semantic (a question asking about "occupation"
// must reach a turn that says "my shift at the clinic"). This expands the
// fact-seeking question with generic conversational vocabulary clusters, runs
// recall per probe, and unions the retrieved turn ids. It changes nothing in the
// recall engine or public API and is retrieval-only.
//
// The clusters are GENERAL (work/where/relationship/preference/health/education/
// time), NOT LoCoMo-fixture rules: no "if question == <dataset case>" branching.
//
//   bun run scripts/run-phase-65-locomo-query-expansion.ts -- --benchmark-root /private/tmp/LOCOMO-all
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LocomoQuestion } from "../src/eval/locomo";
import {
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
  resolveEnvValueStrict,
} from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";
import {
  buildLocomoScope,
  collectLocomoRetrievedTurnIds,
  createLocomoSmokeMemory,
  loadLocomoCases,
  scoreLocomoRetrieval,
  seedLocomoCase,
} from "./run-phase-65-locomo-smoke";

// Generic conversational vocabulary clusters: a question trigger word -> the
// everyday dialog vocabulary that fact tends to surface in. Deliberately broad
// and dataset-agnostic.
const EXPANSION_CLUSTERS: { terms: string[]; triggers: string[] }[] = [
  {
    triggers: ["occupation", "job", "work", "working", "profession", "career", "living", "employed", "employer", "do"],
    terms: ["work", "job", "shift", "office", "clinic", "patients", "company", "school", "project", "business", "boss", "colleague", "client"],
  },
  {
    triggers: ["where", "location", "place", "city", "country", "live", "lives", "lived", "living", "moved", "travel", "trip", "visit", "visited", "went"],
    terms: ["went", "moved", "stayed", "visited", "lived", "trip", "place", "city", "town", "country", "home", "drove", "flew"],
  },
  {
    triggers: ["relationship", "friend", "family", "married", "partner", "sister", "brother", "mother", "father", "parent", "child", "kid", "son", "daughter", "wife", "husband"],
    terms: ["friend", "roommate", "sister", "brother", "partner", "colleague", "classmate", "family", "wife", "husband", "son", "daughter", "mom", "dad", "kids"],
  },
  {
    triggers: ["like", "likes", "love", "enjoy", "favorite", "prefer", "hobby", "interest", "interested"],
    terms: ["like", "love", "enjoy", "hate", "favorite", "prefer", "hobby", "interested", "fun", "tried"],
  },
  {
    triggers: ["health", "doctor", "sick", "illness", "disease", "medical", "pain", "hospital", "diagnosed"],
    terms: ["doctor", "clinic", "medicine", "appointment", "pain", "treatment", "hospital", "symptoms", "therapy", "surgery"],
  },
  {
    triggers: ["school", "study", "studied", "class", "course", "degree", "university", "college", "exam", "education", "major", "graduate"],
    terms: ["class", "school", "professor", "exam", "assignment", "campus", "semester", "study", "course", "degree", "university", "homework"],
  },
  {
    triggers: ["when", "time", "date", "day", "week", "year", "month", "ago", "recently", "long"],
    terms: ["today", "yesterday", "week", "month", "year", "before", "after", "later", "next", "weekend", "recently", "ago", "morning"],
  },
];

function questionWords(question: string): Set<string> {
  return new Set(
    question
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((token) => token.length > 0),
  );
}

// Build retrieval probes for a question: the original question plus one joined
// probe per triggered cluster.
export function buildQueryExpansionProbes(question: string): string[] {
  const words = questionWords(question);
  const probes = [question];
  for (const cluster of EXPANSION_CLUSTERS) {
    if (cluster.triggers.some((trigger) => words.has(trigger))) {
      probes.push(cluster.terms.join(" "));
    }
  }
  return probes;
}

export interface LocomoQueryExpansionCliOptions {
  benchmarkRoot: string;
  runId: string;
}

export function parseLocomoQueryExpansionCliOptions(
  argv: readonly string[],
): LocomoQueryExpansionCliOptions {
  const runId =
    resolveCliPathSegmentFlagValueStrict(argv, "--run-id") ??
    "locomo-query-expansion";
  const benchmarkRoot =
    resolveCliFlagValueStrict(argv, "--benchmark-root") ??
    resolveEnvValueStrict(process.env, "GOODMEMORY_LOCOMO_ROOT");
  if (!benchmarkRoot) {
    throw new Error("--benchmark-root or GOODMEMORY_LOCOMO_ROOT is required.");
  }
  return { benchmarkRoot, runId };
}

interface Bucket {
  expandedProbeSum: number;
  noiseSum: number;
  recallSum: number;
  total: number;
  zeroRetrieval: number;
}

function emptyBucket(): Bucket {
  return { expandedProbeSum: 0, noiseSum: 0, recallSum: 0, total: 0, zeroRetrieval: 0 };
}

function summarize(bucket: Bucket) {
  const safe = (sum: number) => (bucket.total === 0 ? 0 : Number((sum / bucket.total).toFixed(4)));
  return {
    meanEvidenceRecall: safe(bucket.recallSum),
    meanNoiseTurns: Number(safe(bucket.noiseSum).toFixed(2)),
    questionCount: bucket.total,
    zeroRetrievalShare: safe(bucket.zeroRetrieval),
  };
}

export async function runLocomoQueryExpansion(input: {
  benchmarkRoot: string;
  readFile?: (path: string) => Promise<string>;
}): Promise<{ byCategory: Record<string, unknown>; overall: unknown }> {
  const readFileImpl = input.readFile ?? ((path: string) => readFile(path, "utf8"));
  const runId = "locomo-query-expansion";
  const { cases } = await loadLocomoCases({ benchmarkRoot: input.benchmarkRoot, readFile: readFileImpl });

  const baseline = new Map<string, Bucket>();
  const expanded = new Map<string, Bucket>();
  const bucketFor = (map: Map<string, Bucket>, key: string): Bucket => {
    let bucket = map.get(key);
    if (!bucket) {
      bucket = emptyBucket();
      map.set(key, bucket);
    }
    return bucket;
  };
  const record = (
    map: Map<string, Bucket>,
    question: LocomoQuestion,
    recall: number,
    noise: number,
    probeCount: number,
  ): void => {
    for (const key of ["OVERALL", question.category]) {
      const bucket = bucketFor(map, key);
      bucket.recallSum += recall;
      bucket.noiseSum += noise;
      bucket.expandedProbeSum += probeCount;
      bucket.total += 1;
      if (recall <= 0) {
        bucket.zeroRetrieval += 1;
      }
    }
  };

  for (const testCase of cases) {
    const memory = createLocomoSmokeMemory();
    const scope = buildLocomoScope({ caseId: testCase.caseId, runId });
    await seedLocomoCase({ memory, runId, testCase });
    for (const question of testCase.questions) {
      const probes = buildQueryExpansionProbes(question.question);

      const baseRecall = await memory.recall({
        query: question.question,
        scope,
        strategy: "rules-only",
      });
      const baseScore = scoreLocomoRetrieval({
        question,
        retrievedTurnIds: collectLocomoRetrievedTurnIds(baseRecall),
        testCase,
      });
      record(baseline, question, baseScore.evidenceRecall, baseScore.noiseTurnCount, 1);

      const unionIds = new Set<string>();
      for (const probe of probes) {
        const probeRecall = await memory.recall({ query: probe, scope, strategy: "rules-only" });
        for (const id of collectLocomoRetrievedTurnIds(probeRecall)) {
          unionIds.add(id);
        }
      }
      const expandedScore = scoreLocomoRetrieval({
        question,
        retrievedTurnIds: [...unionIds],
        testCase,
      });
      record(expanded, question, expandedScore.evidenceRecall, expandedScore.noiseTurnCount, probes.length);
    }
  }

  const byCategory: Record<string, unknown> = {};
  for (const category of [...baseline.keys()].filter((k) => k !== "OVERALL").sort()) {
    byCategory[category] = {
      baseline: summarize(bucketFor(baseline, category)),
      expanded: summarize(bucketFor(expanded, category)),
    };
  }
  return {
    byCategory,
    overall: {
      baseline: summarize(bucketFor(baseline, "OVERALL")),
      expanded: summarize(bucketFor(expanded, "OVERALL")),
    },
  };
}

if (import.meta.main) {
  const { benchmarkRoot, runId } = parseLocomoQueryExpansionCliOptions(Bun.argv);
  const result = await runLocomoQueryExpansion({ benchmarkRoot });
  const repoRoot = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputPath = join(
    repoRoot,
    "reports",
    "eval",
    "research",
    "phase-65",
    "locomo",
    runId,
    "query-expansion-comparison.json",
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ ...result, outputPath }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
