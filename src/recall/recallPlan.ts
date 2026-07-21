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

export interface RecallPlanAssistantInput {
  deterministicPlan: RecallPlan;
  locale?: string;
  query: string;
  referenceTime: string;
  scope: MemoryScope;
}

export interface RecallPlanAssistant {
  plan(input: RecallPlanAssistantInput): Promise<Partial<RecallPlan>>;
}

export interface RecallPlanResolution {
  assistantApplied: boolean;
  fallbackReason?: "assistant_error";
  plan: RecallPlan;
}

export function buildUnplannedRecallPlan(): RecallPlan {
  return {
    entities: [],
    facets: [],
    temporalConstraints: [],
    evidenceNeeds: ["direct"],
    planes: ["semantic"],
    maxHops: 1,
    preRankLimit: RECALL_PLAN_PRE_RANK_LIMIT,
    selectedLimit: RECALL_PLAN_SELECTED_LIMIT,
    maxRenderedTokens: RECALL_PLAN_MAX_RENDERED_TOKENS,
    uncertainty: "low",
  };
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

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};
const MONTH_ABBREVIATION_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};
// Fixed northern-hemisphere calendar starts; a deliberate deterministic
// convention, documented rather than inferred.
const SEASON_START_MONTH: Record<string, number> = {
  spring: 2,
  summer: 5,
  fall: 8,
  autumn: 8,
  winter: 11,
};
const MONTH_NAME_PATTERN = Object.keys(MONTH_INDEX).join("|");
const MONTH_NAME_OR_ABBREVIATION_PATTERN = [
  ...Object.keys(MONTH_INDEX),
  ...Object.keys(MONTH_ABBREVIATION_INDEX),
].join("|");
const SEASON_PATTERN = Object.keys(SEASON_START_MONTH).join("|");

function monthFromToken(token: string): number | undefined {
  const normalized = token.toLowerCase();
  return MONTH_INDEX[normalized] ?? MONTH_ABBREVIATION_INDEX[normalized];
}

function utcInstant(year: number, month: number, day = 1): string | undefined {
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date.toISOString();
}

function utcDayStart(instantMs: number): string {
  const date = new Date(instantMs);
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  )).toISOString();
}

// Most recent start of `month` at (or strictly before) the reference time.
function mostRecentMonthStart(
  reference: Date,
  month: number,
  strictlyBefore: boolean,
): string | undefined {
  const currentMonth = reference.getUTCMonth();
  let year = reference.getUTCFullYear();
  if (strictlyBefore ? month >= currentMonth : month > currentMonth) {
    year -= 1;
  }
  return utcInstant(year, month);
}

/**
 * Deterministic date-expression anchor resolution for before/after boundaries.
 * Pure calendar arithmetic against the supplied reference time — no LLM, no
 * benchmark-derived vocabulary. Precedence runs from most to least specific;
 * relative day/week forms truncate to the UTC day start. The bare form of
 * "May" must be capitalized so the modal verb never becomes a month; all other
 * bare month names match case-insensitively, and three-letter abbreviations
 * are honored only when a day or year disambiguates them.
 */
function explicitTemporalReferenceTime(
  query: string,
  referenceTime: string,
): string | undefined {
  const referenceMs = Date.parse(referenceTime);
  const reference = Number.isFinite(referenceMs)
    ? new Date(referenceMs)
    : undefined;

  const isoDate = query.match(/(?:^|[^\d])(\d{4})-(\d{2})-(\d{2})(?:$|[^\d])/u);
  if (isoDate) {
    const instant = utcInstant(
      Number(isoDate[1]),
      Number(isoDate[2]) - 1,
      Number(isoDate[3]),
    );
    if (instant) {
      return instant;
    }
  }

  // Chinese year + numeric month (+ optional day): 2026年5月 / 2026年5月7日.
  const hanDate = query.match(
    /(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*[日号])?/u,
  );
  if (hanDate) {
    const month = Number(hanDate[2]) - 1;
    if (month >= 0 && month <= 11) {
      const instant = utcInstant(
        Number(hanDate[1]),
        month,
        hanDate[3] ? Number(hanDate[3]) : 1,
      );
      if (instant) {
        return instant;
      }
    }
  }

  // Month day, year: "March 5, 2026" / "Mar 5 2026" / "5 March 2026".
  const monthDayYear = query.match(
    new RegExp(
      `\\b(${MONTH_NAME_OR_ABBREVIATION_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
      "iu",
    ),
  );
  if (monthDayYear) {
    const month = monthFromToken(monthDayYear[1]!);
    if (month !== undefined) {
      const instant = utcInstant(
        Number(monthDayYear[3]),
        month,
        Number(monthDayYear[2]),
      );
      if (instant) {
        return instant;
      }
    }
  }
  const dayMonthYear = query.match(
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAME_OR_ABBREVIATION_PATTERN})\\.?,?\\s+(\\d{4})\\b`,
      "iu",
    ),
  );
  if (dayMonthYear) {
    const month = monthFromToken(dayMonthYear[2]!);
    if (month !== undefined) {
      const instant = utcInstant(
        Number(dayMonthYear[3]),
        month,
        Number(dayMonthYear[1]),
      );
      if (instant) {
        return instant;
      }
    }
  }

  // Month + year: "May 2026" / "Sep 2026".
  const monthYear = query.match(
    new RegExp(
      `\\b(${MONTH_NAME_OR_ABBREVIATION_PATTERN})\\.?,?\\s+(\\d{4})\\b`,
      "iu",
    ),
  );
  if (monthYear) {
    const month = monthFromToken(monthYear[1]!);
    if (month !== undefined) {
      const instant = utcInstant(Number(monthYear[2]), month);
      if (instant) {
        return instant;
      }
    }
  }

  // Quarter: "Q2 2026".
  const quarter = query.match(/\bQ([1-4])\s*(\d{4})\b/iu);
  if (quarter) {
    return utcInstant(Number(quarter[2]), (Number(quarter[1]) - 1) * 3);
  }

  // Season + explicit year: "summer 2026".
  const seasonYear = query.match(
    new RegExp(`\\b(${SEASON_PATTERN})\\s+(\\d{4})\\b`, "iu"),
  );
  if (seasonYear) {
    return utcInstant(
      Number(seasonYear[2]),
      SEASON_START_MONTH[seasonYear[1]!.toLowerCase()]!,
    );
  }

  if (reference) {
    // "last <season>": most recent season start strictly before the reference.
    const lastSeason = query.match(
      new RegExp(`\\blast\\s+(${SEASON_PATTERN})\\b`, "iu"),
    );
    if (lastSeason) {
      const month = SEASON_START_MONTH[lastSeason[1]!.toLowerCase()]!;
      return mostRecentMonthStart(reference, month, true);
    }

    // "last <month-name>": most recent occurrence strictly before.
    const lastMonthName = query.match(
      new RegExp(`\\blast\\s+(${MONTH_NAME_PATTERN})\\b`, "iu"),
    );
    if (lastMonthName) {
      const month = monthFromToken(lastMonthName[1]!);
      if (month !== undefined) {
        return mostRecentMonthStart(reference, month, true);
      }
    }

    // Relative offsets: "N days/weeks/months/years ago", "yesterday",
    // "last week/month/year".
    const unitsAgo = query.match(
      /\b(\d{1,3})\s+(day|week|month|year)s?\s+ago\b/iu,
    );
    if (unitsAgo) {
      const count = Number(unitsAgo[1]);
      const unit = unitsAgo[2]!.toLowerCase();
      if (unit === "day" || unit === "week") {
        const days = unit === "week" ? count * 7 : count;
        return utcDayStart(referenceMs - days * 86_400_000);
      }
      if (unit === "month") {
        return utcInstant(
          reference.getUTCFullYear(),
          reference.getUTCMonth() - count,
        );
      }
      return utcInstant(reference.getUTCFullYear() - count, 0);
    }
    if (/\byesterday\b/iu.test(query)) {
      return utcDayStart(referenceMs - 86_400_000);
    }
    if (/\blast\s+week\b/iu.test(query)) {
      return utcDayStart(referenceMs - 7 * 86_400_000);
    }
    if (/\blast\s+month\b/iu.test(query)) {
      return utcInstant(
        reference.getUTCFullYear(),
        reference.getUTCMonth() - 1,
      );
    }
    if (/\blast\s+year\b/iu.test(query)) {
      return utcInstant(reference.getUTCFullYear() - 1, 0);
    }

    // Bare month name: most recent occurrence at or before the reference.
    // "May" must be capitalized (modal-verb guard); other full names match
    // case-insensitively.
    const bareMonth = query.match(
      new RegExp(`\\b(${MONTH_NAME_PATTERN})\\b`, "iu"),
    );
    if (bareMonth) {
      const token = bareMonth[1]!;
      const month = monthFromToken(token);
      if (month !== undefined && (token.toLowerCase() !== "may" || token === "May")) {
        return mostRecentMonthStart(reference, month, false);
      }
    }
  }

  const yearMatch = query.match(/(?:^|[^\d])(\d{4})(?:\s*年)?(?:$|[^\d-])/u);
  if (!yearMatch) {
    return undefined;
  }
  return utcInstant(Number(yearMatch[1]), 0);
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
  const explicitReferenceTime = explicitTemporalReferenceTime(
    input.query,
    input.referenceTime,
  );
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

export async function resolveRecallPlan(input: {
  assistant?: RecallPlanAssistant;
  input: BuildRecallPlanInput;
}): Promise<RecallPlanResolution> {
  const deterministicPlan = buildDeterministicRecallPlan(input.input);
  if (!input.assistant || deterministicPlan.uncertainty === "low") {
    return { assistantApplied: false, plan: deterministicPlan };
  }
  try {
    const assisted = await input.assistant.plan({
      deterministicPlan,
      locale: input.input.locale,
      query: input.input.query,
      referenceTime: input.input.referenceTime,
      scope: input.input.scope,
    });
    const entities = unique([
      ...deterministicPlan.entities,
      ...(assisted.entities ?? []),
    ]);
    const normalizedEntities = entities
      .map((entity) => entity.normalize("NFKC").toLocaleLowerCase())
      .filter((entity) => entity.length > 0);
    const assistedFacets = (assisted.facets ?? []).filter((facet) => {
      const normalizedFacet = facet.normalize("NFKC").toLocaleLowerCase();
      return normalizedEntities.some((entity) => {
        const entityIndex = normalizedFacet.indexOf(entity);
        if (entityIndex < 0) {
          return false;
        }
        return `${normalizedFacet.slice(0, entityIndex)}${normalizedFacet.slice(
          entityIndex + entity.length,
        )}`.replace(/[\p{P}\p{S}\s]+/gu, "").length > 0;
      });
    });
    const facets = unique([
      ...deterministicPlan.facets,
      ...assistedFacets,
    ]);
    return {
      assistantApplied: true,
      plan: {
        ...deterministicPlan,
        entities,
        facets,
        evidenceNeeds: unique([
          ...deterministicPlan.evidenceNeeds,
          ...(assistedFacets.length > 0 ? ["multi_facet" as const] : []),
        ]),
        planes: unique([
          ...deterministicPlan.planes,
          ...(assistedFacets.length > 0 ? ["episodic" as const] : []),
        ]),
        preRankLimit: RECALL_PLAN_PRE_RANK_LIMIT,
        selectedLimit: RECALL_PLAN_SELECTED_LIMIT,
        maxRenderedTokens: RECALL_PLAN_MAX_RENDERED_TOKENS,
        uncertainty: facets.length > 0
          ? "high"
          : deterministicPlan.uncertainty,
      },
    };
  } catch {
    return {
      assistantApplied: false,
      fallbackReason: "assistant_error",
      plan: deterministicPlan,
    };
  }
}
