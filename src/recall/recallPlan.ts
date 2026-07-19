import type { MemoryScope } from "../domain/scope";
import type { MemoryPlane } from "../domain/taxonomy";
import {
  createLanguageService,
  type LanguageService,
} from "../language";
import { extractEntityKeys } from "./entityExtraction";
import { splitQueryIntoSubQueries } from "./queryDecomposition";

export const RECALL_PLAN_PRE_RANK_LIMIT = 32;
export const RECALL_PLAN_SELECTED_LIMIT = 12;
export const RECALL_PLAN_MAX_RENDERED_TOKENS = 6_000;

export type RecallAggregation = "change" | "count" | "current" | "history";
export type RecallEvidenceNeed =
  | "aggregation"
  | "direct"
  | "multi_facet"
  | "relation"
  | "temporal";
export type RecallPlanUncertainty = "high" | "low" | "medium";

export interface TemporalConstraint {
  kind: "after" | "before" | "current" | "history";
  referenceTime: string;
}

export interface RecallPlan {
  entities: string[];
  facets: string[];
  temporalConstraints: TemporalConstraint[];
  aggregation?: RecallAggregation;
  evidenceNeeds: RecallEvidenceNeed[];
  planes: MemoryPlane[];
  maxHops: number;
  preRankLimit: number;
  selectedLimit: number;
  maxRenderedTokens: number;
  uncertainty: RecallPlanUncertainty;
}

export interface BuildRecallPlanInput {
  language?: LanguageService;
  locale?: string;
  query: string;
  referenceTime: string;
  scope: MemoryScope;
}

const CURRENT_QUERY_PATTERN =
  /\b(?:current|currently|latest|now|present)\b|(?:当前|目前|现在|最新|如今)/iu;
const HISTORY_QUERY_PATTERN =
  /\b(?:historical|history|previously|timeline|over time)\b|(?:历史|过去|此前|之前|历来)/iu;
const CHANGE_QUERY_PATTERN =
  /\b(?:change(?:d|s)?|replac(?:e|ed)|switch(?:ed)?|used to|no longer)\b|(?:后来|换成|改成|变成|不再|从[^？?。.!]{1,80}(?:到|换成|改成))/iu;
const BEFORE_QUERY_PATTERN = /\b(?:before|prior to)\b|(?:之前|以前|早于)/iu;
const AFTER_QUERY_PATTERN = /\b(?:after|since)\b|(?:之后|以后|晚于|自从)/iu;
const RELATION_QUERY_PATTERN =
  /\b(?:known for|associated with|connected to|related to|reports to|mentored by)\b|(?:以什么闻名|因什么出名|与谁有关|关联到|汇报给)/iu;
const PROCEDURAL_QUERY_PATTERN =
  /\b(?:how (?:do|can|should) i|steps?|procedure|runbook|workflow|instructions?)\b|(?:怎么做|如何做|步骤|流程|操作手册|说明)/iu;

// Acronyms that describe an interface or data shape are facets, not named
// entities. Keeping this list narrow avoids erasing real product names.
const GENERIC_ENTITY_KEYS = new Set(["api", "id", "url"]);

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function explicitTemporalReferenceTime(query: string): string | undefined {
  const isoDate = query.match(/(?:^|[^\d])(\d{4})-(\d{2})-(\d{2})(?:$|[^\d])/u);
  if (isoDate) {
    const [, yearText, monthText, dayText] = isoDate;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date.toISOString();
    }
  }
  const yearMatch = query.match(/(?:^|[^\d])(\d{4})(?:\s*年)?(?:$|[^\d-])/u);
  if (!yearMatch) {
    return undefined;
  }
  const year = Number(yearMatch[1]);
  return new Date(Date.UTC(year, 0, 1)).toISOString();
}

function resolveAggregation(input: {
  language: LanguageService;
  locale: string;
  query: string;
}): RecallAggregation | undefined {
  if (input.language.isAggregateCountQuery(input.query, input.locale)) {
    return "count";
  }
  if (CHANGE_QUERY_PATTERN.test(input.query)) {
    return "change";
  }
  if (HISTORY_QUERY_PATTERN.test(input.query)) {
    return "history";
  }
  if (CURRENT_QUERY_PATTERN.test(input.query)) {
    return "current";
  }
  return undefined;
}

function buildTemporalConstraints(input: {
  aggregation: RecallAggregation | undefined;
  query: string;
  referenceTime: string;
}): TemporalConstraint[] {
  const kinds: TemporalConstraint["kind"][] = [];
  if (CURRENT_QUERY_PATTERN.test(input.query) || input.aggregation === "current") {
    kinds.push("current");
  }
  if (HISTORY_QUERY_PATTERN.test(input.query) || input.aggregation === "history") {
    kinds.push("history");
  }
  if (BEFORE_QUERY_PATTERN.test(input.query)) {
    kinds.push("before");
  }
  if (AFTER_QUERY_PATTERN.test(input.query)) {
    kinds.push("after");
  }
  const explicitReferenceTime = explicitTemporalReferenceTime(input.query);
  return unique(kinds).map((kind) => ({
    kind,
    referenceTime:
      (kind === "before" || kind === "after") && explicitReferenceTime
        ? explicitReferenceTime
        : input.referenceTime,
  }));
}

/**
 * Build the provider-free recall plan from request-local information only.
 * Benchmark labels, case ids, expected answers, and retrieved memories are not
 * inputs, so this plan can be reproduced before retrieval starts.
 */
export function buildDeterministicRecallPlan(
  input: BuildRecallPlanInput,
): RecallPlan {
  const language = input.language ?? createLanguageService();
  const resolvedLanguage = language.resolveFromText({
    locale: input.locale,
    text: input.query,
  });
  const locale = resolvedLanguage.locale;
  const facets = splitQueryIntoSubQueries(input.query, { language, locale });
  const aggregation = resolveAggregation({ language, locale, query: input.query });
  const temporalConstraints = buildTemporalConstraints({
    aggregation,
    query: input.query,
    referenceTime: input.referenceTime,
  });
  const relation = RELATION_QUERY_PATTERN.test(input.query);

  const evidenceNeeds: RecallEvidenceNeed[] = ["direct"];
  if (aggregation) {
    evidenceNeeds.push("aggregation");
  }
  if (temporalConstraints.length > 0 || aggregation === "change") {
    evidenceNeeds.push("temporal");
  }
  if (relation) {
    evidenceNeeds.push("relation");
  }
  if (facets.length > 0) {
    evidenceNeeds.push("multi_facet");
  }

  const planes: MemoryPlane[] = ["semantic"];
  if (
    temporalConstraints.length > 0 ||
    aggregation === "change" ||
    relation ||
    facets.length > 0
  ) {
    planes.push("episodic");
  }
  if (
    PROCEDURAL_QUERY_PATTERN.test(input.query) ||
    language.isGuidanceSeekingQuery(input.query, locale)
  ) {
    planes.push("procedural");
  }
  if (input.scope.sessionId || language.isContinuationQuery(input.query, locale)) {
    planes.push("runtime");
  }

  const maxHops = relation ? 2 : 1;
  const broadAggregation =
    aggregation === "change" ||
    aggregation === "count" ||
    aggregation === "history";
  const uncertainty: RecallPlanUncertainty =
    facets.length > 0 || maxHops > 1 || broadAggregation
      ? "high"
      : aggregation || temporalConstraints.length > 0
        ? "medium"
        : "low";
  const entities = [...extractEntityKeys(input.query)].filter(
    (entity) => !GENERIC_ENTITY_KEYS.has(entity),
  );

  return {
    entities,
    facets,
    temporalConstraints,
    ...(aggregation ? { aggregation } : {}),
    evidenceNeeds: unique(evidenceNeeds),
    planes: unique(planes),
    maxHops,
    preRankLimit: RECALL_PLAN_PRE_RANK_LIMIT,
    selectedLimit: RECALL_PLAN_SELECTED_LIMIT,
    maxRenderedTokens: RECALL_PLAN_MAX_RENDERED_TOKENS,
    uncertainty,
  };
}
