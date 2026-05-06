import { generateObject } from "ai";
import { z } from "zod";

import type {
  RecallAssistantPlan,
  RecallAssistantPlanInput,
  RecallAssistantRerank,
  RecallAssistantRerankInput,
  RecallRouterAssistant,
} from "../recall/assistant";
import type {
  RecallSource,
  RecallSlot,
} from "../recall/router";
import type { AISDKModelConfig } from "./ai-sdk-runtime";
import type {
  AISDKRetryOptions,
  FetchLike,
} from "./ai-sdk-runtime";
import {
  DEFAULT_AISDK_REQUEST_TIMEOUT_MS,
  requestOpenAICompatibleObject,
  resolveAISDKModel,
  withAISDKRetries,
} from "./ai-sdk-runtime";

interface RecallRouterDependencies {
  fetch?: FetchLike;
  generateObject?: typeof generateObject;
  requestTimeoutMs?: number;
  resolveModel?: typeof resolveAISDKModel;
  retryOptions?: AISDKRetryOptions;
}

const RECALL_SLOT_VALUES = [
  "role",
  "focus",
  "blocker",
  "open_loop",
  "reference",
  "project_state_support",
  "runtime_continuity",
  "feedback_guidance",
] as const satisfies [RecallSlot, ...RecallSlot[]];

const RECALL_SOURCE_VALUES = [
  "profile",
  "feedback",
  "fact",
  "evidence",
  "session_archive",
  "episode",
  "working_memory",
  "session_journal",
] as const satisfies [RecallSource, ...RecallSource[]];

const RECALL_RERANK_REASON_VALUES = [
  "continuation_support",
  "query_alignment",
  "reference_priority",
  "role_mismatch",
  "source_of_truth",
  "task_blocker",
] as const;

const RECALL_SLOT_ALIASES = {
  blocker_context: "project_state_support",
  feedback_guidance: "feedback_guidance",
  focus: "focus",
  open_loop: "open_loop",
  project_state: "project_state_support",
  project_state_support: "project_state_support",
  reference: "reference",
  role: "role",
  runtime_continuation: "runtime_continuity",
  runtime_continuity: "runtime_continuity",
  source_of_truth: "reference",
} as const satisfies Record<string, RecallSlot>;

const RECALL_SOURCE_ALIASES = {
  archive: "session_archive",
  episode: "episode",
  evidence: "evidence",
  fact: "fact",
  feedback: "feedback",
  journal: "session_journal",
  profile: "profile",
  session_archive: "session_archive",
  session_journal: "session_journal",
  working_memory: "working_memory",
  workingmemory: "working_memory",
} as const satisfies Record<string, RecallSource>;

const RECALL_RERANK_REASON_ALIASES = {
  blocker: "task_blocker",
  blocker_priority: "task_blocker",
  continuation: "continuation_support",
  continuation_support: "continuation_support",
  next_step: "continuation_support",
  query_alignment: "query_alignment",
  relevance: "query_alignment",
  role_mismatch: "role_mismatch",
  source_of_truth: "source_of_truth",
  source_priority: "reference_priority",
  source_reference: "source_of_truth",
  task_blocker: "task_blocker",
} as const satisfies Record<
  string,
  (typeof RECALL_RERANK_REASON_VALUES)[number]
>;

const RECALL_RERANK_DECISION_ALIASES = {
  demote: "suppress",
  drop: "suppress",
  prioritize: "promote",
  promote: "promote",
  reorder: "promote",
  suppress: "suppress",
} as const satisfies Record<string, "promote" | "suppress">;

const recallAssistantPlanSchema = z.object({
  querySummary: z.string().default(""),
  rationale: z.string().default(""),
  requestedSlotAdditions: z.array(z.enum(RECALL_SLOT_VALUES)).optional(),
  sourcePriorityOrder: z.array(z.enum(RECALL_SOURCE_VALUES)).optional(),
  supportSlotAdditions: z.array(z.enum(RECALL_SLOT_VALUES)).optional(),
});

export const recallAssistantRerankSchema = z.object({
  decisions: z
    .array(
      z.object({
        candidateId: z.string(),
        decision: z.enum(["promote", "suppress"]),
        reason: z.enum(RECALL_RERANK_REASON_VALUES),
      }),
    )
    .optional(),
  orderedCandidateIds: z.array(z.string()),
  rationale: z.string().default(""),
  suppressCandidateIds: z.array(z.string()).optional(),
});

const RECALL_ROUTER_PLAN_SYSTEM_PROMPT = [
  "You refine a recall routing plan after deterministic rules already ran.",
  "You may only add small slot hints and reorder the existing source list.",
  "Do not invent new recall sources or remove the deterministic requested slots.",
  "Keep the response as a single JSON object that matches the schema.",
].join(" ");

const RECALL_ROUTER_RERANK_SYSTEM_PROMPT = [
  "You rerank a bounded durable-memory candidate set after deterministic recall and policy filtering already finished.",
  "You may only reorder the provided candidate IDs or suppress a provided candidate ID.",
  "Never suppress candidates marked protected=true; they are deterministic hard-floor hits.",
  "Do not invent new candidate IDs or rely on hidden sources.",
  "Keep the response as a single JSON object that matches the schema.",
].join(" ");

function normalizeUniqueStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (normalized.length === 0) {
    return undefined;
  }

  return [...new Set(normalized)];
}

function normalizeCandidateId(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  return normalizeCandidateId(
    record.id ??
      record.candidateId ??
      record.candidate_id ??
      record.memoryId ??
      record.memory_id,
  );
}

function normalizeCandidateIdArray(value: unknown): string[] | undefined {
  const single = normalizeCandidateId(value);
  if (single) {
    return [single];
  }
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((item) => normalizeCandidateId(item) ?? "")
    .filter((item) => item.length > 0);

  if (normalized.length === 0) {
    return undefined;
  }

  return [...new Set(normalized)];
}

function normalizeAliasKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeAliasArray<TValue extends string>(
  value: unknown,
  aliases: Readonly<Record<string, TValue>>,
): TValue[] | undefined {
  const normalized = normalizeUniqueStringArray(value);
  if (!normalized) {
    return undefined;
  }

  return normalized
    .map((item) => aliases[normalizeAliasKey(item)] ?? item)
    .filter((item): item is TValue => typeof item === "string");
}

function normalizeRecallAssistantPlanPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  const requestedSlots =
    record.requestedSlotAdditions ??
    record.requested_slot_additions ??
    record.requested_slots;
  const sourcePriorities =
    record.sourcePriorityOrder ??
    record.source_priority_order ??
    record.source_priorities ??
    record.priority_sources ??
    record.sources;
  const supportSlots =
    record.supportSlotAdditions ??
    record.support_slot_additions ??
    record.support_slots;

  return {
    ...record,
    querySummary:
      typeof record.querySummary === "string"
        ? record.querySummary
        : typeof record.query_summary === "string"
          ? record.query_summary
          : "",
    rationale:
      typeof record.rationale === "string"
        ? record.rationale
        : typeof record.reasoning === "string"
          ? record.reasoning
          : "",
    requestedSlotAdditions: normalizeAliasArray(
      requestedSlots,
      RECALL_SLOT_ALIASES,
    ),
    sourcePriorityOrder: normalizeAliasArray(
      sourcePriorities,
      RECALL_SOURCE_ALIASES,
    ),
    supportSlotAdditions: normalizeAliasArray(
      supportSlots,
      RECALL_SLOT_ALIASES,
    ),
  };
}

function normalizeRecallAssistantRerankPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  const orderedCandidateIds =
    record.orderedCandidateIds ??
    record.ordered_candidate_ids ??
    record.orderedCandidates ??
    record.ordered_candidates ??
    record.ranked_ids ??
    record.rankedIds ??
    record.rankedCandidateIds ??
    record.ranked_candidate_ids ??
    record.rankedCandidates ??
    record.ranked_candidates ??
    record.candidateOrder ??
    record.candidate_order ??
    record.candidates;
  const suppressCandidateIds =
    record.suppressCandidateIds ??
    record.suppress_candidate_ids ??
    record.suppressed_ids ??
    record.suppressedIds ??
    record.suppressedCandidates ??
    record.suppressed_candidates ??
    record.suppressions ??
    record.suppressed;
  const normalizedOrderedIds = normalizeCandidateIdArray(orderedCandidateIds);
  const normalizedSuppressIds = normalizeCandidateIdArray(suppressCandidateIds);
  const normalizedDecisions = Array.isArray(record.decisions)
    ? record.decisions
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        )
        .map((decision) => {
          const candidateId = normalizeCandidateId(decision);
          if (!candidateId) {
            return undefined;
          }

          return {
            candidateId,
            decision:
              typeof decision.decision === "string"
                ? (RECALL_RERANK_DECISION_ALIASES as Record<string, "promote" | "suppress">)[
                    normalizeAliasKey(decision.decision)
                  ] ??
                  decision.decision
                : decision.decision,
            reason:
              typeof decision.reason === "string"
                ? (RECALL_RERANK_REASON_ALIASES as Record<
                    string,
                    (typeof RECALL_RERANK_REASON_VALUES)[number]
                  >)[normalizeAliasKey(decision.reason)] ??
                  decision.reason
                : typeof decision.rationale === "string"
                  ? (RECALL_RERANK_REASON_ALIASES as Record<
                      string,
                      (typeof RECALL_RERANK_REASON_VALUES)[number]
                    >)[normalizeAliasKey(decision.rationale)] ??
                    "query_alignment"
                  : "query_alignment",
          };
        })
        .filter((decision): decision is NonNullable<typeof decision> => Boolean(decision))
    : undefined;
  const synthesizedDecisions =
    normalizedDecisions && normalizedDecisions.length > 0
      ? normalizedDecisions
      : [
          ...(normalizedOrderedIds ?? []).map((candidateId) => ({
            candidateId,
            decision: "promote" as const,
            reason: "query_alignment" as const,
          })),
          ...(normalizedSuppressIds ?? []).map((candidateId) => ({
            candidateId,
            decision: "suppress" as const,
            reason: "query_alignment" as const,
          })),
        ];

  return {
    ...record,
    orderedCandidateIds: normalizedOrderedIds,
    suppressCandidateIds: normalizedSuppressIds,
    decisions: synthesizedDecisions.length > 0 ? synthesizedDecisions : undefined,
    rationale:
      typeof record.rationale === "string"
        ? record.rationale
        : typeof record.reasoning === "string"
          ? record.reasoning
          : "",
  };
}

export function buildRecallAssistantPlanPrompt(
  input: RecallAssistantPlanInput,
): string {
  return [
    "Refine this deterministic recall routing decision.",
    "Return only JSON. Do not use markdown fences or commentary.",
    `Locale: ${input.locale}`,
    `Query: ${input.query}`,
    `Intent: ${input.routingDecision.intent}`,
    `Current strategy: ${input.routingDecision.strategy}`,
    `Current requested slots: ${input.routingDecision.requestedSlots.join(", ") || "none"}`,
    `Current support slots: ${input.routingDecision.supportSlots.join(", ") || "none"}`,
    `Current source priorities: ${input.routingDecision.sourcePriorities.join(", ")}`,
    `Continuation: ${String(input.routingDecision.continuation)}`,
    `Reference seeking: ${String(input.routingDecision.referenceSeeking)}`,
    `Action driving: ${String(input.routingDecision.actionDriving)}`,
    `Working memory available: ${String(input.runtime.hasWorkingMemory)}`,
    `Session journal available: ${String(input.runtime.hasJournal)}`,
  ].join("\n");
}

export function buildRecallAssistantRerankPrompt(
  input: RecallAssistantRerankInput,
): string {
  const candidates = input.candidates
    .map(
      (candidate, index) =>
        `[${index}] id=${candidate.id} type=${candidate.type} protected=${String(candidate.protected)} summary=${candidate.summary}`,
    )
    .join("\n");

  return [
    "Rerank this bounded durable recall candidate set.",
    "Return only JSON. Do not use markdown fences or commentary.",
    `Locale: ${input.locale}`,
    `Query: ${input.query}`,
    `Query summary: ${input.querySummary ?? "n/a"}`,
    `Intent: ${input.routingDecision.intent}`,
    `Requested slots: ${input.routingDecision.requestedSlots.join(", ") || "none"}`,
    `Support slots: ${input.routingDecision.supportSlots.join(", ") || "none"}`,
    "Candidates:",
    candidates,
  ].join("\n");
}

function finalizeRecallAssistantPlan(
  plan: RecallAssistantPlan,
): RecallAssistantPlan {
  return {
    querySummary: plan.querySummary.trim(),
    rationale:
      plan.rationale.trim() || "llm-assisted recall router refined the deterministic routing floor",
    requestedSlotAdditions: plan.requestedSlotAdditions?.filter(Boolean),
    sourcePriorityOrder: plan.sourcePriorityOrder?.filter(Boolean),
    supportSlotAdditions: plan.supportSlotAdditions?.filter(Boolean),
  };
}

function finalizeRecallAssistantRerank(
  rerank: RecallAssistantRerank,
): RecallAssistantRerank {
  return {
    decisions: rerank.decisions
      ?.map((decision) => {
        const candidateId = normalizeCandidateId(decision.candidateId);
        if (!candidateId) {
          return undefined;
        }

        return {
          ...decision,
          candidateId,
        };
      })
      .filter((decision): decision is NonNullable<typeof decision> => Boolean(decision)),
    orderedCandidateIds: rerank.orderedCandidateIds
      .map((candidateId) => normalizeCandidateId(candidateId) ?? "")
      .filter((candidateId) => candidateId.length > 0),
    rationale:
      rerank.rationale.trim() || "llm-assisted recall router reranked the bounded durable candidate set",
    suppressCandidateIds: rerank.suppressCandidateIds
      ?.map((candidateId) => normalizeCandidateId(candidateId) ?? "")
      .filter((candidateId) => candidateId.length > 0),
  };
}

export function createLLMRecallRouter(input: {
  dependencies?: RecallRouterDependencies;
  model: AISDKModelConfig;
  planPromptBuilder?: (input: RecallAssistantPlanInput) => string;
  planSystem?: string;
  rerankPromptBuilder?: (input: RecallAssistantRerankInput) => string;
  rerankSystem?: string;
}): RecallRouterAssistant {
  return {
    async plan(payload): Promise<RecallAssistantPlan> {
      const prompt = (input.planPromptBuilder ?? buildRecallAssistantPlanPrompt)(payload);
      const system = input.planSystem ?? RECALL_ROUTER_PLAN_SYSTEM_PROMPT;

      return withAISDKRetries(async () => {
        if (input.model.provider === "openai" && input.model.baseURL) {
          const object = await requestOpenAICompatibleObject({
            model: input.model,
            schema: recallAssistantPlanSchema,
            system,
            prompt,
            fetch: input.dependencies?.fetch,
            timeoutMs: input.dependencies?.requestTimeoutMs,
            normalizePayload: normalizeRecallAssistantPlanPayload,
          });

          return finalizeRecallAssistantPlan(object);
        }

        const { object } = await (input.dependencies?.generateObject ?? generateObject)({
          maxRetries: 0,
          model: (input.dependencies?.resolveModel ?? resolveAISDKModel)(input.model),
          schema: recallAssistantPlanSchema,
          system,
          prompt,
          timeout:
            input.dependencies?.requestTimeoutMs ??
            DEFAULT_AISDK_REQUEST_TIMEOUT_MS,
        });

        return finalizeRecallAssistantPlan(object);
      }, input.dependencies?.retryOptions);
    },

    async rerank(payload): Promise<RecallAssistantRerank> {
      const prompt = (input.rerankPromptBuilder ?? buildRecallAssistantRerankPrompt)(
        payload,
      );
      const system = input.rerankSystem ?? RECALL_ROUTER_RERANK_SYSTEM_PROMPT;

      return withAISDKRetries(async () => {
        if (input.model.provider === "openai" && input.model.baseURL) {
          const object = await requestOpenAICompatibleObject({
            model: input.model,
            schema: recallAssistantRerankSchema,
            system,
            prompt,
            fetch: input.dependencies?.fetch,
            timeoutMs: input.dependencies?.requestTimeoutMs,
            normalizePayload: normalizeRecallAssistantRerankPayload,
          });

          return finalizeRecallAssistantRerank(object);
        }

        const { object } = await (input.dependencies?.generateObject ?? generateObject)({
          maxRetries: 0,
          model: (input.dependencies?.resolveModel ?? resolveAISDKModel)(input.model),
          schema: recallAssistantRerankSchema,
          system,
          prompt,
          timeout:
            input.dependencies?.requestTimeoutMs ??
            DEFAULT_AISDK_REQUEST_TIMEOUT_MS,
        });

        return finalizeRecallAssistantRerank(object);
      }, input.dependencies?.retryOptions);
    },
  };
}
