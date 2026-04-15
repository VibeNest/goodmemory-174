import { generateObject } from "ai";
import { z } from "zod";

import type { AISDKRetryOptions } from "../llm/ai-sdk-runtime";
import type { FetchLike } from "../llm/ai-sdk-runtime";
import type { AISDKModelConfig } from "../llm/ai-sdk-runtime";
import {
  requestOpenAICompatibleObject,
  resolveAISDKModel,
  withAISDKRetries,
} from "../llm/ai-sdk-runtime";
import type {
  MemoryCandidateExplicitness,
  MemoryCandidateKindHint,
  MemoryExtractionInput,
  MemoryExtractionResult,
  MemoryExtractor,
} from "../remember/candidates";

interface MemoryExtractorDependencies {
  fetch?: FetchLike;
  generateObject?: typeof generateObject;
  requestTimeoutMs?: number;
  resolveModel?: typeof resolveAISDKModel;
  retryOptions?: AISDKRetryOptions;
}

const MEMORY_CANDIDATE_KIND_HINT_VALUES = [
  "profile",
  "preference",
  "reference",
  "fact",
  "feedback",
  "episode",
  "noise",
] as const satisfies [MemoryCandidateKindHint, ...MemoryCandidateKindHint[]];

const MEMORY_CANDIDATE_EXPLICITNESS_VALUES = [
  "explicit",
  "inferred",
] as const satisfies [MemoryCandidateExplicitness, ...MemoryCandidateExplicitness[]];

const MEMORY_EXTRACTION_SYSTEM_PROMPT = [
  "You extract durable memory candidates from a conversation.",
  "Prefer profile updates, preferences, references, durable facts, and reusable feedback.",
  "Return an empty candidate list when nothing should be remembered.",
].join(" ");

const MEMORY_CANDIDATE_KIND_HINT_ALIASES = {
  document_reference: "reference",
  durable_fact: "fact",
  episode: "episode",
  episodic_memory: "episode",
  event: "episode",
  fact: "fact",
  feedback: "feedback",
  feedback_rule: "feedback",
  generic_fact: "fact",
  ignore: "noise",
  ignored: "noise",
  instruction: "feedback",
  memory_fact: "fact",
  none: "noise",
  noise: "noise",
  preference: "preference",
  preference_update: "preference",
  procedural_feedback: "feedback",
  profile: "profile",
  profile_memory: "profile",
  profile_update: "profile",
  project_fact: "fact",
  reference: "reference",
  reference_memory: "reference",
  skip: "noise",
  source_of_truth: "reference",
  source_reference: "reference",
  style_preference: "preference",
  user_preference: "preference",
  user_profile: "profile",
} as const satisfies Record<string, MemoryCandidateKindHint>;

const MEMORY_CANDIDATE_EXPLICITNESS_ALIASES = {
  deduced: "inferred",
  derived: "inferred",
  direct: "explicit",
  explicit: "explicit",
  implicit: "inferred",
  inferred: "inferred",
  stated: "explicit",
  verbatim: "explicit",
} as const satisfies Record<string, MemoryCandidateExplicitness>;

const memoryCandidateSchema = z.object({
  id: z.string(),
  kindHint: z.enum(MEMORY_CANDIDATE_KIND_HINT_VALUES),
  explicitness: z.enum(MEMORY_CANDIDATE_EXPLICITNESS_VALUES),
  content: z.string(),
  sourceMessageIndex: z.number().int().nonnegative(),
  sourceRole: z.string(),
  metadata: z
    .object({
      appliesTo: z.string().optional(),
      category: z
        .enum(["project", "technical", "personal", "relationship", "event"])
        .optional(),
      factKind: z
        .enum([
          "blocker",
          "open_loop",
          "role_update",
          "focus_update",
          "project_state",
          "generic_project",
        ])
        .optional(),
      feedbackKind: z.enum(["do", "dont", "prefer", "validated_pattern"]).optional(),
      preferenceCategory: z.string().optional(),
      preferenceValue: z.string().optional(),
      profileField: z
        .enum([
          "name",
          "role",
          "organization",
          "location",
          "timezone",
          "languagePreference",
          "currentProject",
        ])
        .optional(),
      referenceKind: z
        .enum(["source_of_truth", "runbook", "doc", "dashboard", "tracker"])
        .optional(),
      referencePointer: z.string().optional(),
      referenceTitle: z.string().optional(),
      scopeKind: z
        .enum(["identity", "project", "runtime", "reference", "preference"])
        .optional(),
      subject: z.string().optional(),
      supersedesPointer: z.string().optional(),
    })
    .partial()
    .optional(),
});

export const memoryExtractionResultSchema = z.object({
  candidates: z.array(memoryCandidateSchema),
  ignoredMessageCount: z.number().int().nonnegative(),
});

function normalizeAliasKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeAliasedEnumValue<TValue extends string>(
  value: unknown,
  aliases: Readonly<Record<string, TValue>>,
): TValue | unknown {
  if (typeof value !== "string") {
    return value;
  }

  return aliases[normalizeAliasKey(value)] ?? value;
}

function coerceNonNegativeInteger(value: unknown): number | unknown {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return value;
}

function finalizeMemoryExtractionResult(
  result: MemoryExtractionResult,
): MemoryExtractionResult {
  return {
    candidates: result.candidates.map((candidate) => ({
      ...candidate,
      content: candidate.content.trim(),
    })),
    ignoredMessageCount: result.ignoredMessageCount,
  };
}

export function normalizeMemoryExtractionPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  const candidates = record.candidates;

  return {
    ...record,
    candidates: Array.isArray(candidates)
      ? candidates.map((candidate, index) => {
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
            return candidate;
          }

          const normalizedCandidate = candidate as Record<string, unknown>;
          const id = normalizedCandidate.id;
          const sourceRole = normalizedCandidate.sourceRole;

          return {
            ...normalizedCandidate,
            id:
              typeof id === "string"
                ? id
                : typeof id === "number"
                  ? String(id)
                  : `llm-${index + 1}`,
            kindHint: normalizeAliasedEnumValue(
              normalizedCandidate.kindHint,
              MEMORY_CANDIDATE_KIND_HINT_ALIASES,
            ),
            explicitness: normalizeAliasedEnumValue(
              normalizedCandidate.explicitness,
              MEMORY_CANDIDATE_EXPLICITNESS_ALIASES,
            ),
            sourceMessageIndex: coerceNonNegativeInteger(
              normalizedCandidate.sourceMessageIndex,
            ),
            sourceRole:
              typeof sourceRole === "string"
                ? sourceRole.trim().toLowerCase()
                : sourceRole,
          };
        })
      : candidates,
    ignoredMessageCount: coerceNonNegativeInteger(record.ignoredMessageCount),
  };
}

export function buildMemoryExtractionPrompt(
  input: MemoryExtractionInput,
): string {
  const transcript = input.messages
    .map((message, index) => `[${index}] ${message.role}: ${message.content}`)
    .join("\n");

  return [
    "Extract durable memory candidates from this conversation.",
    "Return only useful long-lived memory candidates and the ignored message count.",
    "Respond with a single JSON object. Do not use markdown fences or commentary.",
    [
      "The JSON object must contain:",
      "candidates: an array of objects with id, kindHint, explicitness, content, sourceMessageIndex, sourceRole, and optional metadata.",
      "ignoredMessageCount: a non-negative integer.",
      `Allowed kindHint values: ${MEMORY_CANDIDATE_KIND_HINT_VALUES.join(", ")}.`,
      `Allowed explicitness values: ${MEMORY_CANDIDATE_EXPLICITNESS_VALUES.join(" or ")}.`,
    ].join(" "),
    `Locale hint: ${input.locale ?? "auto"}`,
    `Requested extraction strategy: ${input.extractionStrategy ?? "rules-only"}`,
    "Conversation:",
    transcript,
  ].join("\n\n");
}

export function createLLMMemoryExtractor(input: {
  dependencies?: MemoryExtractorDependencies;
  model: AISDKModelConfig;
  promptBuilder?: (input: MemoryExtractionInput) => string;
  system?: string;
}): MemoryExtractor {
  return {
    async extract(payload): Promise<MemoryExtractionResult> {
      const prompt = (input.promptBuilder ?? buildMemoryExtractionPrompt)(payload);
      const system = input.system ?? MEMORY_EXTRACTION_SYSTEM_PROMPT;

      return withAISDKRetries(async () => {
        if (input.model.provider === "openai" && input.model.baseURL) {
          const object = await requestOpenAICompatibleObject({
            model: input.model,
            schema: memoryExtractionResultSchema,
            system,
            prompt,
            fetch: input.dependencies?.fetch,
            timeoutMs: input.dependencies?.requestTimeoutMs,
            normalizePayload: normalizeMemoryExtractionPayload,
          });

          return finalizeMemoryExtractionResult(object);
        }

        const { object } = await (input.dependencies?.generateObject ?? generateObject)({
          model: (input.dependencies?.resolveModel ?? resolveAISDKModel)(input.model),
          schema: memoryExtractionResultSchema,
          system,
          prompt,
        });

        return finalizeMemoryExtractionResult(object);
      }, input.dependencies?.retryOptions);
    },
  };
}
