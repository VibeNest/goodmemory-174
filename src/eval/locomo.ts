// LoCoMo (Phase 65) evaluation contract and synthetic smoke fixtures.
//
// Upstream: https://github.com/snap-research/locomo (dataset `data/locomo10.json`,
// released under CC BY-NC 4.0 — NON-COMMERCIAL). LoCoMo is a very-long-term
// conversational-memory benchmark: ten multi-session conversations between two
// speakers (avg ~300 turns / ~9K tokens over up to 35 sessions), each annotated
// with question-answering pairs whose gold evidence is a list of dialog-turn ids.
//
// Because the licence is non-commercial we do NOT vendor any upstream data. This
// module defines a normalized case shape, the deterministic answer metrics
// (LoCoMo's primary QA metric is token-level F1, plus an adversarial-abstention
// check), the upstream category-code mapping, and a small synthetic smoke fixture
// (one case per QA category) so the Phase 65 adapter can be built and gated
// before any external-root run.

// Upstream QA "category" is an integer 1-5; these are the normalized names.
export const LOCOMO_QA_CATEGORIES = [
  "single_hop",
  "multi_hop",
  "temporal",
  "open_domain",
  "adversarial",
] as const;

export type LocomoQaCategory = (typeof LOCOMO_QA_CATEGORIES)[number];

// The upstream integer "category" code -> normalized category name. Verified
// against snap-research/locomo: 1 multi-hop, 2 temporal, 3 open-domain, 4
// single-hop, 5 adversarial. External normalization (raw locomo10.json ->
// normalized cases.json) applies this; it lives here so the mapping is recorded
// in one auditable place rather than re-derived per consumer.
export const LOCOMO_UPSTREAM_CATEGORY_CODES: Record<number, LocomoQaCategory> = {
  1: "multi_hop",
  2: "temporal",
  3: "open_domain",
  4: "single_hop",
  5: "adversarial",
};

export function normalizeLocomoCategoryCode(code: number): LocomoQaCategory {
  const category = LOCOMO_UPSTREAM_CATEGORY_CODES[code];
  if (category === undefined) {
    throw new Error(`Unknown LoCoMo category code: ${code}`);
  }
  return category;
}

// LoCoMo scores answerable QA with token-level F1; adversarial questions are
// scored on whether the model resists the tempting answer (abstention). The
// smoke contract carries the mode each category is graded with so a later live
// mode applies the matching deterministic check.
export const LOCOMO_MATCH_MODES = [
  "f1_token_overlap",
  "exact_match",
  "adversarial_abstention",
] as const;

export type LocomoMatchMode = (typeof LOCOMO_MATCH_MODES)[number];

// Categories 1-4 are answerable and scored with token-F1; category 5 is
// adversarial and scored on abstention from the tempting answer.
export function deriveLocomoMatchMode(
  category: LocomoQaCategory,
): LocomoMatchMode {
  return category === "adversarial" ? "adversarial_abstention" : "f1_token_overlap";
}

// One dialog turn. `diaId` is the upstream "dia_id" string, formatted
// "D<session>:<turn>" (e.g. "D1:3"); the recall diagnostic keys on it.
export interface LocomoTurn {
  content: string;
  diaId: string;
  speaker: string;
}

// One QA sample against the conversation. `evidenceTurnIds` are the dia_ids
// carrying the gold evidence (the upstream "evidence" list; may be empty for an
// unanswerable adversarial probe). `adversarialAnswer` is the tempting wrong
// answer the model must NOT give (null for non-adversarial categories).
export interface LocomoQuestion {
  adversarialAnswer: string | null;
  category: LocomoQaCategory;
  evidenceTurnIds: string[];
  goldAnswer: string;
  matchMode: LocomoMatchMode;
  question: string;
  questionId: string;
}

export interface LocomoCase {
  caseId: string;
  questions: LocomoQuestion[];
  // Mirrors the upstream conversation index (e.g. "conversation-1"); synthetic
  // fixtures use a "synthetic-*" prefix.
  sourceConversation: string;
  // The two conversation participants, in upstream order.
  speakers: [string, string];
  turns: LocomoTurn[];
}

const LOCOMO_DIA_ID_PATTERN = /^D(\d+):\d+$/u;

// The 1-based session index encoded in a dia_id ("D3:7" -> 3). Multi-hop recall
// diagnostics use this to confirm cross-session composition.
export function parseLocomoSession(diaId: string): number {
  const match = LOCOMO_DIA_ID_PATTERN.exec(diaId);
  if (match === null) {
    throw new Error(`Malformed LoCoMo dia_id: ${diaId}`);
  }
  return Number(match[1]);
}

// SQuAD-style token normalization (lowercase, drop punctuation and the leading
// articles a/an/the, collapse whitespace) — the basis of LoCoMo's F1 metric.
const LOCOMO_F1_ARTICLES = new Set(["a", "an", "the"]);

export function normalizeLocomoAnswer(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

export function tokenizeLocomoAnswer(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter((token) => token.length > 0 && !LOCOMO_F1_ARTICLES.has(token));
}

// Token-level F1 (multiset overlap), LoCoMo's primary QA metric. Returns 1 when
// both sides normalize to empty, 0 when exactly one does (SQuAD convention).
export function locomoTokenF1(answer: string, gold: string): number {
  const answerTokens = tokenizeLocomoAnswer(answer);
  const goldTokens = tokenizeLocomoAnswer(gold);
  if (answerTokens.length === 0 || goldTokens.length === 0) {
    return answerTokens.length === 0 && goldTokens.length === 0 ? 1 : 0;
  }
  const goldCounts = new Map<string, number>();
  for (const token of goldTokens) {
    goldCounts.set(token, (goldCounts.get(token) ?? 0) + 1);
  }
  let overlap = 0;
  for (const token of answerTokens) {
    const remaining = goldCounts.get(token) ?? 0;
    if (remaining > 0) {
      overlap += 1;
      goldCounts.set(token, remaining - 1);
    }
  }
  if (overlap === 0) {
    return 0;
  }
  const precision = overlap / answerTokens.length;
  const recall = overlap / goldTokens.length;
  return (2 * precision * recall) / (precision + recall);
}

export function locomoExactMatch(answer: string, gold: string): boolean {
  return normalizeLocomoAnswer(answer) === normalizeLocomoAnswer(gold);
}

// Deterministic pass threshold for the token-F1 modes. LoCoMo reports the raw F1
// number; the smoke uses this threshold as the boolean gate, and a live mode can
// still report locomoTokenF1() directly.
export const LOCOMO_F1_PASS_THRESHOLD = 0.5;

// Deterministic correctness for the deferred live-answer layer. f1_token_overlap
// passes when token-F1 with the gold answer clears the threshold; exact_match is
// normalized equality; adversarial_abstention passes only when the answer both
// resists the tempting answer AND matches the gold (correct) answer.
export function scoreLocomoAnswer(input: {
  adversarialAnswer?: string | null;
  answer: string;
  goldAnswer: string;
  matchMode: LocomoMatchMode;
}): boolean {
  if (input.matchMode === "exact_match") {
    return locomoExactMatch(input.answer, input.goldAnswer);
  }
  if (input.matchMode === "adversarial_abstention") {
    const matchesGold =
      locomoTokenF1(input.answer, input.goldAnswer) >= LOCOMO_F1_PASS_THRESHOLD;
    const tempting = input.adversarialAnswer ?? null;
    const tookTheBait =
      tempting !== null &&
      locomoTokenF1(input.answer, tempting) >= LOCOMO_F1_PASS_THRESHOLD;
    return matchesGold && !tookTheBait;
  }
  return locomoTokenF1(input.answer, input.goldAnswer) >= LOCOMO_F1_PASS_THRESHOLD;
}

// Synthetic smoke fixture: one small multi-session conversation per QA category,
// following the LoCoMo turn/QA shape. No upstream data is vendored.
export function buildLocomoSmokeCases(): LocomoCase[] {
  return [
    // single_hop: a fact stated in one turn, asked directly.
    {
      caseId: "synthetic-single-hop-dog",
      sourceConversation: "synthetic-conversation-1",
      speakers: ["Caroline", "Melanie"],
      turns: [
        {
          diaId: "D1:1",
          speaker: "Melanie",
          content: "Hey Caroline! Anything new with you this spring?",
        },
        {
          diaId: "D1:2",
          speaker: "Caroline",
          content:
            "Yes! I adopted a dog named Pepper on 10 March 2023 — she's a rescue beagle.",
        },
      ],
      questions: [
        {
          questionId: "synthetic-single-hop-dog:1",
          category: "single_hop",
          question: "What is the name of Caroline's dog?",
          goldAnswer: "Pepper",
          matchMode: "f1_token_overlap",
          evidenceTurnIds: ["D1:2"],
          adversarialAnswer: null,
        },
      ],
    },
    // multi_hop: composition across two sessions.
    {
      caseId: "synthetic-multi-hop-visit",
      sourceConversation: "synthetic-conversation-2",
      speakers: ["Caroline", "Melanie"],
      turns: [
        {
          diaId: "D1:1",
          speaker: "Caroline",
          content: "My sister Anna just moved to Seattle for a new job.",
        },
        {
          diaId: "D1:2",
          speaker: "Melanie",
          content: "That's exciting! Hope you get to see her soon.",
        },
        {
          diaId: "D3:1",
          speaker: "Caroline",
          content: "I'm finally flying out to visit my sister this weekend.",
        },
      ],
      questions: [
        {
          questionId: "synthetic-multi-hop-visit:1",
          category: "multi_hop",
          question: "Which city is Caroline flying to this weekend?",
          goldAnswer: "Seattle",
          matchMode: "f1_token_overlap",
          evidenceTurnIds: ["D1:1", "D3:1"],
          adversarialAnswer: null,
        },
      ],
    },
    // temporal: date arithmetic across turns.
    {
      caseId: "synthetic-temporal-promotion",
      sourceConversation: "synthetic-conversation-3",
      speakers: ["Caroline", "Melanie"],
      turns: [
        {
          diaId: "D1:1",
          speaker: "Caroline",
          content: "I started my new job on 1 February 2023.",
        },
        {
          diaId: "D2:1",
          speaker: "Caroline",
          content: "Great news — I got promoted exactly three months after starting.",
        },
      ],
      questions: [
        {
          questionId: "synthetic-temporal-promotion:1",
          category: "temporal",
          question: "On what date was Caroline promoted?",
          goldAnswer: "1 May 2023",
          matchMode: "f1_token_overlap",
          evidenceTurnIds: ["D1:1", "D2:1"],
          adversarialAnswer: null,
        },
      ],
    },
    // open_domain: a stated persona preference.
    {
      caseId: "synthetic-open-domain-cuisine",
      sourceConversation: "synthetic-conversation-4",
      speakers: ["Caroline", "Melanie"],
      turns: [
        {
          diaId: "D1:1",
          speaker: "Melanie",
          content: "We should grab dinner sometime. What are you into these days?",
        },
        {
          diaId: "D1:2",
          speaker: "Caroline",
          content: "My favorite cuisine is Thai food — the spicier the better.",
        },
      ],
      questions: [
        {
          questionId: "synthetic-open-domain-cuisine:1",
          category: "open_domain",
          question: "What type of cuisine does Caroline prefer?",
          goldAnswer: "Thai",
          matchMode: "f1_token_overlap",
          evidenceTurnIds: ["D1:2"],
          adversarialAnswer: null,
        },
      ],
    },
    // adversarial: a tempting "Yes" the turn refutes.
    {
      caseId: "synthetic-adversarial-bowl",
      sourceConversation: "synthetic-conversation-5",
      speakers: ["Caroline", "Melanie"],
      turns: [
        {
          diaId: "D1:1",
          speaker: "Melanie",
          content: "That black and white bowl in your photo is gorgeous!",
        },
        {
          diaId: "D1:2",
          speaker: "Melanie",
          content: "Did you make it in your pottery class?",
        },
        {
          diaId: "D1:3",
          speaker: "Caroline",
          content: "No, my sister Anna made that bowl; I only made the blue mug.",
        },
      ],
      questions: [
        {
          questionId: "synthetic-adversarial-bowl:1",
          category: "adversarial",
          question: "Did Caroline make the black and white bowl in the photo?",
          goldAnswer: "No",
          matchMode: "adversarial_abstention",
          evidenceTurnIds: ["D1:3"],
          adversarialAnswer: "Yes",
        },
      ],
    },
  ];
}

// Per-question evaluation result for the Phase 65 smoke report.
export interface LocomoQuestionResult {
  answerCorrect: boolean;
  caseId: string;
  category: LocomoQaCategory;
  // Evidence dia_ids the system retrieved (when the adapter can report them).
  evidenceRecall: number;
  noiseTurnCount: number;
  questionId: string;
}

export interface LocomoCategorySummary {
  answerAccuracy: number;
  averageEvidenceRecall: number;
  category: LocomoQaCategory;
  correctCount: number;
  noiseTurnTotal: number;
  questionCount: number;
}

export function summarizeLocomoResults(
  results: LocomoQuestionResult[],
): LocomoCategorySummary[] {
  return LOCOMO_QA_CATEGORIES.map((category) => {
    const bucket = results.filter((result) => result.category === category);
    const questionCount = bucket.length;
    const correctCount = bucket.filter((result) => result.answerCorrect).length;
    const recallTotal = bucket.reduce(
      (sum, result) => sum + result.evidenceRecall,
      0,
    );
    return {
      answerAccuracy: questionCount === 0 ? 0 : correctCount / questionCount,
      averageEvidenceRecall:
        questionCount === 0 ? 0 : recallTotal / questionCount,
      category,
      correctCount,
      noiseTurnTotal: bucket.reduce(
        (sum, result) => sum + result.noiseTurnCount,
        0,
      ),
      questionCount,
    };
  });
}
