import type { MemoryScope } from "../domain/scope";
import type {
  MemoryCandidate,
  MemoryCandidateExplicitness,
  MemoryCandidateKindHint,
  MemoryCandidateMetadata,
  MemoryExtractionInput,
  MemoryExtractionResult,
  MemoryExtractor,
} from "./candidates";

export type RememberPresetId = "default" | "coding_agent";

export interface AssistantMemoryPolicy {
  mode:
    | "ignore"
    | "host_tagged_only"
    | "confirmed_only"
    | "verified_only"
    | "confirmed_or_verified_only";
}

export type RememberProfileMatcher =
  | {
      tenantId?: string;
      workspaceId?: string;
      agentId?: string;
      sessionId?: string;
    }
  | ((input: { scope: MemoryScope }) => boolean);

export interface RememberRuleMessageContext {
  input: MemoryExtractionInput;
  message: { role: string; content: string };
  messageIndex: number;
  scope: MemoryScope;
}

export interface RememberRuleMatchContext extends RememberRuleMessageContext {
  match: RegExpMatchArray;
}

type RuleValue<
  TValue,
  TContext extends RememberRuleMessageContext = RememberRuleMatchContext,
> =
  | TValue
  | ((context: TContext) => TValue);

export interface RememberRule {
  id: string;
  extract(input: MemoryExtractionInput): MemoryCandidate[];
}

export interface RememberProfile {
  id: string;
  when?: RememberProfileMatcher;
  extends?: RememberPresetId;
  rules?: RememberRule[];
  extractors?: MemoryExtractor[];
  assistantOutputs?: AssistantMemoryPolicy;
}

export interface RememberConfig {
  preset?: RememberPresetId;
  profiles?: RememberProfile[];
  fallbackPreset?: RememberPresetId;
}

export interface ResolvedRememberProfile {
  assistantOutputs: AssistantMemoryPolicy;
  extractors: MemoryExtractor[];
  id: string;
  presetId: RememberPresetId;
  rules: RememberRule[];
}

function resolveRuleValue<
  TValue,
  TContext extends RememberRuleMessageContext,
>(value: RuleValue<TValue, TContext>, context: TContext): TValue {
  return typeof value === "function"
    ? (value as (context: TContext) => TValue)(context)
    : value;
}

function appendRuleId(
  candidate: MemoryCandidate,
  ruleId: string,
): MemoryCandidate {
  return {
    ...candidate,
    ruleIds: [...new Set([...(candidate.ruleIds ?? []), ruleId])],
  };
}

function buildRegexRule(input: {
  id: string;
  kindHint: Exclude<MemoryCandidateKindHint, "episode" | "noise">;
  pattern: RegExp;
  content: RuleValue<string>;
  metadata?: RuleValue<MemoryCandidateMetadata>;
}): RememberRule {
  return {
    id: input.id,
    extract(extractionInput) {
      const candidates: MemoryCandidate[] = [];

      extractionInput.messages.forEach((message, messageIndex) => {
        const match = message.content.match(input.pattern);
        if (!match) {
          return;
        }

        const context: RememberRuleMatchContext = {
          input: extractionInput,
          match,
          message,
          messageIndex,
          scope: extractionInput.scope,
        };
        const content = resolveRuleValue(input.content, context).trim();
        if (content.length === 0) {
          return;
        }

        candidates.push({
          id: `${input.id}-${messageIndex + 1}`,
          kindHint: input.kindHint,
          explicitness: "explicit",
          extractionSources: ["rules-only"],
          ruleIds: [input.id],
          content,
          sourceMessageIndex: messageIndex,
          sourceRole: message.role,
          metadata: input.metadata
            ? resolveRuleValue(input.metadata, context)
            : undefined,
        });
      });

      return candidates;
    },
  };
}

function buildPredicateRule(input: {
  id: string;
  kindHint: Exclude<MemoryCandidateKindHint, "episode" | "noise">;
  when: (context: RememberRuleMessageContext) => boolean;
  content: RuleValue<string, RememberRuleMessageContext>;
  explicitness?: RuleValue<
    MemoryCandidateExplicitness,
    RememberRuleMessageContext
  >;
  metadata?: RuleValue<MemoryCandidateMetadata, RememberRuleMessageContext>;
}): RememberRule {
  return {
    id: input.id,
    extract(extractionInput) {
      const candidates: MemoryCandidate[] = [];

      extractionInput.messages.forEach((message, messageIndex) => {
        const context: RememberRuleMessageContext = {
          input: extractionInput,
          message,
          messageIndex,
          scope: extractionInput.scope,
        };
        if (!input.when(context)) {
          return;
        }

        const content = resolveRuleValue(input.content, context).trim();
        if (content.length === 0) {
          return;
        }

        candidates.push({
          id: `${input.id}-${messageIndex + 1}`,
          kindHint: input.kindHint,
          explicitness: input.explicitness
            ? resolveRuleValue(input.explicitness, context)
            : "explicit",
          extractionSources: ["rules-only"],
          ruleIds: [input.id],
          content,
          sourceMessageIndex: messageIndex,
          sourceRole: message.role,
          metadata: input.metadata
            ? resolveRuleValue(input.metadata, context)
            : undefined,
        });
      });

      return candidates;
    },
  };
}

export const rememberRules = {
  fact(
    pattern: RegExp,
    options: {
      id: string;
      category?: RuleValue<NonNullable<MemoryCandidateMetadata["category"]>>;
      content: RuleValue<string>;
      metadata?: RuleValue<MemoryCandidateMetadata>;
      tags?: RuleValue<string[]>;
      attributes?: RuleValue<NonNullable<MemoryCandidateMetadata["attributes"]>>;
    },
  ): RememberRule {
    return buildRegexRule({
      id: options.id,
      kindHint: "fact",
      pattern,
      content: options.content,
      metadata: (context) => {
        const metadata = options.metadata
          ? resolveRuleValue(options.metadata, context)
          : {};

        return {
          ...metadata,
          category: options.category
            ? resolveRuleValue(options.category, context)
            : metadata.category,
          tags: options.tags
            ? resolveRuleValue(options.tags, context)
            : metadata.tags,
          attributes: options.attributes
            ? resolveRuleValue(options.attributes, context)
            : metadata.attributes,
        };
      },
    });
  },

  preference(
    pattern: RegExp,
    options: {
      id: string;
      category: RuleValue<string>;
      value: RuleValue<string>;
      content?: RuleValue<string>;
      tags?: RuleValue<string[]>;
      attributes?: RuleValue<NonNullable<MemoryCandidateMetadata["attributes"]>>;
    },
  ): RememberRule {
    return buildRegexRule({
      id: options.id,
      kindHint: "preference",
      pattern,
      content: options.content ?? options.value,
      metadata: (context) => ({
        attributes: options.attributes
          ? resolveRuleValue(options.attributes, context)
          : undefined,
        preferenceCategory: resolveRuleValue(options.category, context),
        preferenceValue: resolveRuleValue(options.value, context),
        tags: options.tags ? resolveRuleValue(options.tags, context) : undefined,
      }),
    });
  },

  feedback(
    pattern: RegExp,
    options: {
      id: string;
      appliesTo?: RuleValue<string>;
      content: RuleValue<string>;
      feedbackKind?: RuleValue<NonNullable<MemoryCandidateMetadata["feedbackKind"]>>;
      tags?: RuleValue<string[]>;
      attributes?: RuleValue<NonNullable<MemoryCandidateMetadata["attributes"]>>;
    },
  ): RememberRule {
    return buildRegexRule({
      id: options.id,
      kindHint: "feedback",
      pattern,
      content: options.content,
      metadata: (context) => ({
        appliesTo: options.appliesTo
          ? resolveRuleValue(options.appliesTo, context)
          : undefined,
        attributes: options.attributes
          ? resolveRuleValue(options.attributes, context)
          : undefined,
        feedbackKind: options.feedbackKind
          ? resolveRuleValue(options.feedbackKind, context)
          : "do",
        tags: options.tags ? resolveRuleValue(options.tags, context) : undefined,
      }),
    });
  },

  profile(
    pattern: RegExp,
    options: {
      id: string;
      content: RuleValue<string>;
      field: RuleValue<NonNullable<MemoryCandidateMetadata["profileField"]>>;
    },
  ): RememberRule {
    return buildRegexRule({
      id: options.id,
      kindHint: "profile",
      pattern,
      content: options.content,
      metadata: (context) => ({
        profileField: resolveRuleValue(options.field, context),
      }),
    });
  },

  reference(
    pattern: RegExp,
    options: {
      id: string;
      pointer: RuleValue<string>;
      title?: RuleValue<string>;
      content?: RuleValue<string>;
      tags?: RuleValue<string[]>;
      attributes?: RuleValue<NonNullable<MemoryCandidateMetadata["attributes"]>>;
    },
  ): RememberRule {
    return buildRegexRule({
      id: options.id,
      kindHint: "reference",
      pattern,
      content: options.content ?? options.pointer,
      metadata: (context) => ({
        attributes: options.attributes
          ? resolveRuleValue(options.attributes, context)
          : undefined,
        referencePointer: resolveRuleValue(options.pointer, context),
        referenceTitle: options.title
          ? resolveRuleValue(options.title, context)
          : undefined,
        tags: options.tags ? resolveRuleValue(options.tags, context) : undefined,
      }),
    });
  },

  predicate(options: {
    id: string;
    when: (context: RememberRuleMessageContext) => boolean;
    kindHint: Exclude<MemoryCandidateKindHint, "episode" | "noise">;
    content: RuleValue<string, RememberRuleMessageContext>;
    explicitness?: RuleValue<
      MemoryCandidateExplicitness,
      RememberRuleMessageContext
    >;
    metadata?: RuleValue<MemoryCandidateMetadata, RememberRuleMessageContext>;
  }): RememberRule {
    return buildPredicateRule(options);
  },

  mapper(options: {
    id: string;
    map(input: MemoryExtractionInput): MemoryCandidate[];
  }): RememberRule {
    return {
      id: options.id,
      extract(input) {
        return options.map(input).map((candidate) =>
          appendRuleId(candidate, options.id),
        );
      },
    };
  },
};

export function resolveRememberProfile(input: {
  config?: RememberConfig;
  scope: MemoryScope;
}): ResolvedRememberProfile {
  const presetId = input.config?.preset ?? input.config?.fallbackPreset ?? "default";
  const profiles = input.config?.profiles ?? [];
  const profileMatches = (profile: RememberProfile): boolean => {
    if (!profile.when) {
      return false;
    }

    if (typeof profile.when === "function") {
      return profile.when({ scope: input.scope });
    }

    return Object.entries(profile.when).every(([key, value]) =>
      value === undefined
        ? true
        : input.scope[key as keyof MemoryScope] === value
    );
  };
  const matchedProfile =
    profiles.find((profile) => profile.when && profileMatches(profile)) ??
    profiles.find((profile) => !profile.when);

  return {
    assistantOutputs: matchedProfile?.assistantOutputs ?? { mode: "ignore" },
    extractors: matchedProfile?.extractors ?? [],
    id: matchedProfile?.id ?? presetId,
    presetId: matchedProfile?.extends ?? presetId,
    rules: matchedProfile?.rules ?? [],
  };
}

export function createRuleMemoryExtractor(input: {
  profileId: string;
  presetId: string;
  rules: RememberRule[];
}): MemoryExtractor {
  return {
    async extract(extractionInput): Promise<MemoryExtractionResult> {
      const candidates = input.rules.flatMap((rule) =>
        rule.extract(extractionInput).map((candidate) => ({
          ...candidate,
          profileId: input.profileId,
          presetId: input.presetId,
          ruleIds: [...new Set([...(candidate.ruleIds ?? []), rule.id])],
        })),
      );

      return {
        candidates,
        ignoredMessageCount: 0,
      };
    },
  };
}
