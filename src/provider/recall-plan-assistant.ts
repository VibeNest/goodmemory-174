import { generateObject } from "ai";
import { z } from "zod";

import type {
  RecallPlanAssistant,
  RecallPlanAssistantInput,
} from "../recall/recallPlan";
import {
  DEFAULT_AISDK_REQUEST_TIMEOUT_MS,
  requestOpenAICompatibleObject,
  requestOpenAICompatibleObjectResult,
  resolveAISDKModel,
  withAISDKRetries,
} from "./ai-sdk-runtime";
import {
  normalizeAISDKLanguageModelUsage,
  runWithModelUsageAttempt,
} from "./model-usage";
import type { ModelUsageSink } from "./model-usage";
import type {
  AISDKModelConfig,
  AISDKRetryOptions,
  FetchLike,
} from "./ai-sdk-runtime";

const MEMORY_PLANE_VALUES = [
  "runtime",
  "semantic",
  "episodic",
  "procedural",
  "derived",
] as const;
const RECALL_AGGREGATION_VALUES = [
  "change",
  "count",
  "current",
  "history",
] as const;
const RECALL_EVIDENCE_NEED_VALUES = [
  "aggregation",
  "direct",
  "multi_facet",
  "relation",
  "temporal",
] as const;
const RECALL_PLAN_UNCERTAINTY_VALUES = ["high", "low", "medium"] as const;
const TEMPORAL_CONSTRAINT_KIND_VALUES = [
  "after",
  "before",
  "current",
  "history",
] as const;

export const recallPlanAssistanceSchema = z
  .object({
    aggregation: z.enum(RECALL_AGGREGATION_VALUES).optional(),
    entities: z.array(z.string().min(1)).optional(),
    evidenceNeeds: z.array(z.enum(RECALL_EVIDENCE_NEED_VALUES)).optional(),
    facets: z.array(z.string().min(1)).optional(),
    maxHops: z.number().int().min(1).max(3).optional(),
    planes: z.array(z.enum(MEMORY_PLANE_VALUES)).optional(),
    temporalConstraints: z
      .array(
        z
          .object({
            kind: z.enum(TEMPORAL_CONSTRAINT_KIND_VALUES),
            referenceTime: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
    uncertainty: z.enum(RECALL_PLAN_UNCERTAINTY_VALUES).optional(),
  })
  .strict();

export const RECALL_PLAN_ASSISTANT_SYSTEM_PROMPT = [
  "Refine a query-only retrieval plan before retrieval starts.",
  "Use only the request-local query, scope, reference time, and deterministic plan.",
  "Do not invent user facts or infer facts outside the supplied query.",
  "Return only a JSON object containing useful changes to entities, facets, temporalConstraints, aggregation, evidenceNeeds, planes, maxHops, or uncertainty.",
  "Every facet must be a complete standalone retrieval query that repeats its subject or entity, never a bare noun label.",
  "Do not add temporalConstraints or aggregation unless the query explicitly asks for that temporal or aggregate operation.",
  "Do not raise maxHops above the deterministic plan.",
  "Allowed aggregation values: change, count, current, history.",
  "Allowed evidenceNeeds values: aggregation, direct, multi_facet, relation, temporal.",
  "Allowed planes values: runtime, semantic, episodic, procedural, derived.",
  "Allowed temporalConstraints kind values: after, before, current, history; each entry must have exactly this shape: {\"kind\":\"before\",\"referenceTime\":\"<ISO-8601>\"}.",
  "Allowed uncertainty values: high, low, medium; maxHops must be an integer from 1 through 3.",
  "Omit a field instead of returning null or an unlisted value.",
  "Do not return preRankLimit, selectedLimit, or maxRenderedTokens.",
].join(" ");

export interface RecallPlanAssistantDependencies {
  fetch?: FetchLike;
  generateObject?: typeof generateObject;
  modelUsageSink?: ModelUsageSink;
  requestTimeoutMs?: number;
  resolveModel?: typeof resolveAISDKModel;
  retryOptions?: AISDKRetryOptions;
}

export function buildRecallPlanAssistantPrompt(
  input: RecallPlanAssistantInput,
): string {
  const providerInput = {
    deterministicPlan: input.deterministicPlan,
    ...(input.locale === undefined ? {} : { locale: input.locale }),
    query: input.query,
    referenceTime: input.referenceTime,
    scope: input.scope,
  };

  return [
    "Refine the deterministic retrieval plan for this query.",
    "Return only fields that should change. An empty object keeps the deterministic plan.",
    JSON.stringify(providerInput),
  ].join("\n\n");
}

export function createLLMRecallPlanAssistant(input: {
  dependencies?: RecallPlanAssistantDependencies;
  maxOutputTokens?: number;
  model: AISDKModelConfig;
  system?: string;
  temperature?: number;
}): RecallPlanAssistant {
  return {
    async plan(payload) {
      const prompt = buildRecallPlanAssistantPrompt(payload);
      const system = input.system ?? RECALL_PLAN_ASSISTANT_SYSTEM_PROMPT;
      let attempt = 0;

      return withAISDKRetries(async () => {
        attempt += 1;
        return runWithModelUsageAttempt({
          attempt,
          modelId: input.model.model,
          operation: "recall_plan",
          providerId: input.model.provider,
          sink: input.dependencies?.modelUsageSink,
          run: async (report) => {
            if (input.model.provider === "openai" && input.model.baseURL) {
              return input.dependencies?.modelUsageSink
                ? (await requestOpenAICompatibleObjectResult({
                    fetch: input.dependencies?.fetch,
                    maxOutputTokens: input.maxOutputTokens,
                    model: input.model,
                    onUsage: (usage) => report(
                      usage ?? normalizeAISDKLanguageModelUsage(undefined),
                    ),
                    prompt,
                    schema: recallPlanAssistanceSchema,
                    system,
                    temperature: input.temperature,
                    timeoutMs: input.dependencies?.requestTimeoutMs,
                  })).object
                : requestOpenAICompatibleObject({
                    fetch: input.dependencies?.fetch,
                    maxOutputTokens: input.maxOutputTokens,
                    model: input.model,
                    prompt,
                    schema: recallPlanAssistanceSchema,
                    system,
                    temperature: input.temperature,
                    timeoutMs: input.dependencies?.requestTimeoutMs,
                  });
            }

            const response = await (
              input.dependencies?.generateObject ?? generateObject
            )({
              maxRetries: 0,
              ...(input.maxOutputTokens === undefined
                ? {}
                : { maxOutputTokens: input.maxOutputTokens }),
              model: (input.dependencies?.resolveModel ?? resolveAISDKModel)(
                input.model,
              ),
              prompt,
              schema: recallPlanAssistanceSchema,
              system,
              ...(input.temperature === undefined
                ? {}
                : { temperature: input.temperature }),
              timeout:
                input.dependencies?.requestTimeoutMs ??
                DEFAULT_AISDK_REQUEST_TIMEOUT_MS,
            });
            report(normalizeAISDKLanguageModelUsage(response.usage));
            return recallPlanAssistanceSchema.parse(response.object);
          },
        });
      }, input.dependencies?.retryOptions);
    },
  };
}
