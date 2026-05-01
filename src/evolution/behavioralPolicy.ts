import type {
  FeedbackKind,
  FeedbackMemory,
  MemoryAttributeValue,
} from "../domain/records";
import { normalizeFeedbackAppliesTo } from "../domain/records";

export type BehavioralPolicyActionKind = "command" | "tool_call" | "warning";
export type BehavioralKind =
  | "preference"
  | "avoidance"
  | "format_contract"
  | "first_action"
  | "syntax_constraint"
  | "transformation_rule"
  | "exemplar_fact";
export type BehavioralTransferMode = "example_only" | "pattern_bounded" | "general";
export type BehavioralEnactmentSurface = "text_response" | "host_action";

export interface BehavioralPolicyAction {
  args?: string[];
  kind: BehavioralPolicyActionKind;
  name: string;
  raw?: string;
}

export interface BehavioralPolicyFragments {
  prefixes?: string[];
  required?: string[];
  suffixes?: string[];
}

export interface BehavioralPolicyApplicability {
  actionSummaryContains?: string[];
  appliesTo?: string;
  argumentOrder?: string[];
  canonicalFirstAction?: BehavioralPolicyAction;
  exactFragments?: BehavioralPolicyFragments;
  queryContains?: string[];
}

export interface BehavioralPolicy {
  behavioralKind: BehavioralKind;
  enactmentSurface: BehavioralEnactmentSurface;
  applicability: BehavioralPolicyApplicability;
  transferMode: BehavioralTransferMode;
}

export interface BehavioralPolicySelection {
  feedback: FeedbackMemory;
  matchedQueryTokens: string[];
  policy: BehavioralPolicy;
  score: number;
}

export interface BehavioralPolicySelectionInput {
  appliesTo: string;
  feedback?: readonly FeedbackMemory[];
  query?: string;
  surface: BehavioralEnactmentSurface;
}

export interface DeriveRuleBehavioralPolicyInput {
  appliesTo?: string;
  exemplarCount?: number;
  kind: Exclude<FeedbackKind, "validated_pattern">;
  rule: string;
}

const BEHAVIORAL_POLICY_ATTRIBUTE_KEY = "goodmemory.behavioral_policy";
const BEHAVIORAL_POLICY_STEERING_ONLY_ATTRIBUTE_KEY =
  "goodmemory.behavioral_policy.steering_only";
const BEHAVIORAL_POLICY_VERSION_ATTRIBUTE_KEY = "goodmemory.behavioral_policy.version";
const BEHAVIORAL_POLICY_VERSION = 1;
const GENERAL_RULE_MARKERS = [
  "always",
  "for any",
  "in this environment",
  "must",
  "should",
  "whenever",
  "when using",
];
const FORMAT_RULE_MARKERS = [
  "closing",
  "end with",
  "opening",
  "prefix",
  "sign off",
  "signature",
  "start with",
  "subject line",
  "suffix",
];
const HOST_ACTION_HINT_MARKERS = [
  "argument",
  "command",
  "first action",
  "parameter",
  "query language",
  "tool",
];
const NEGATIVE_RULE_MARKERS = [
  "avoid",
  "don't",
  "do not",
  "must not",
  "never",
  "rather than",
  "instead of",
];
const RULE_TRIGGER_PATTERNS = [
  /\bwhen\s+(.+?)(?:[,.]|$)/iu,
  /\bif\s+(.+?)(?:[,.]|$)/iu,
  /\bbefore\s+(.+?)(?:[,.]|$)/iu,
  /\bfor\s+(.+?)(?:[,.]|$)/iu,
] as const;
const HOST_ACTION_NAME_PATTERNS = [
  /\b([a-z_][a-z0-9_]*\([^)]*\))\b/u,
  /\b(?:command|tool|action|use|run|output)\s+([A-Za-z_][A-Za-z0-9_]*)\b/iu,
  /\b([A-Z][A-Za-z0-9_]*|[a-z_]+_[a-z0-9_]*)(?=\s+(?:takes|path|file|first|second|third|before|instead))/u,
] as const;
const HOST_ACTION_STOP_WORDS = new Set([
  "a",
  "an",
  "before",
  "exact",
  "for",
  "if",
  "the",
  "when",
]);
const BEHAVIORAL_KIND_RANK: Record<BehavioralKind, number> = {
  first_action: 7,
  syntax_constraint: 6,
  format_contract: 5,
  avoidance: 4,
  preference: 3,
  transformation_rule: 2,
  exemplar_fact: 1,
};
const TRANSFER_MODE_RANK: Record<BehavioralTransferMode, number> = {
  example_only: 3,
  pattern_bounded: 2,
  general: 1,
};

function normalizeText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function uniqueStrings(values: Iterable<string | undefined>): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function normalizeAction(
  action: BehavioralPolicyAction,
): BehavioralPolicyAction {
  return {
    ...action,
    args: action.args && action.args.length > 0 ? [...action.args] : undefined,
    raw: action.raw?.trim() || undefined,
  };
}

function parseActionTokens(value: string): string[] {
  return [...value.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/gu)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? "")
    .filter((token) => token.length > 0);
}

function resolveComparableActionArgs(
  action: BehavioralPolicyAction,
): string[] | undefined {
  const normalized = normalizeAction(action);
  if (normalized.args && normalized.args.length > 0) {
    return normalized.args;
  }

  if (
    normalized.kind === "warning" ||
    !normalized.raw ||
    normalized.raw.trim().length === 0
  ) {
    return undefined;
  }

  const tokens = parseActionTokens(normalized.raw);
  return tokens.length > 1 ? tokens.slice(1) : undefined;
}

function orderedArgsIncluded(
  currentArgs: readonly string[],
  canonicalArgs: readonly string[],
): boolean {
  if (canonicalArgs.length === 0) {
    return true;
  }

  let currentIndex = 0;
  for (const canonicalArg of canonicalArgs) {
    let matched = false;

    while (currentIndex < currentArgs.length) {
      if (currentArgs[currentIndex] === canonicalArg) {
        matched = true;
        currentIndex += 1;
        break;
      }
      currentIndex += 1;
    }

    if (!matched) {
      return false;
    }
  }

  return true;
}

export function serializeBehavioralPolicyAction(
  action: BehavioralPolicyAction,
): string {
  const normalized = normalizeAction(action);
  return JSON.stringify({
    ...(normalized.args ? { args: normalized.args } : {}),
    kind: normalized.kind,
    name: normalized.name,
    ...(normalized.raw ? { raw: normalized.raw } : {}),
  });
}

export function behavioralPolicyActionsEqual(
  left: BehavioralPolicyAction | undefined,
  right: BehavioralPolicyAction | undefined,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return serializeBehavioralPolicyAction(left) === serializeBehavioralPolicyAction(right);
}

export function behavioralPolicyActionSatisfiesCanonical(
  current: BehavioralPolicyAction | undefined,
  canonical: BehavioralPolicyAction | undefined,
): boolean {
  if (!current || !canonical) {
    return current === canonical;
  }

  if (current.kind !== canonical.kind || current.name.trim() !== canonical.name.trim()) {
    return false;
  }

  if (canonical.kind === "warning") {
    return behavioralPolicyActionsEqual(current, canonical);
  }

  const canonicalArgs = resolveComparableActionArgs(canonical);
  if (!canonicalArgs || canonicalArgs.length === 0) {
    return true;
  }

  const currentArgs = resolveComparableActionArgs(current);
  if (!currentArgs || currentArgs.length === 0) {
    return false;
  }

  return orderedArgsIncluded(currentArgs, canonicalArgs);
}

function parseBehavioralPolicyAction(value: unknown): BehavioralPolicyAction | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (
    (value.kind !== "command" &&
      value.kind !== "tool_call" &&
      value.kind !== "warning") ||
    typeof value.name !== "string"
  ) {
    return undefined;
  }

  const args = Array.isArray(value.args) &&
      value.args.every((item) => typeof item === "string")
    ? [...value.args]
    : undefined;

  return {
    ...(args ? { args } : {}),
    kind: value.kind,
    name: value.name,
    ...(typeof value.raw === "string" ? { raw: value.raw } : {}),
  };
}

function parseBehavioralPolicyFragments(
  value: unknown,
): BehavioralPolicyFragments | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const prefixes = parseStringArray(value.prefixes);
  const required = parseStringArray(value.required);
  const suffixes = parseStringArray(value.suffixes);
  if (!prefixes && !required && !suffixes) {
    return undefined;
  }

  return {
    ...(prefixes ? { prefixes } : {}),
    ...(required ? { required } : {}),
    ...(suffixes ? { suffixes } : {}),
  };
}

function parseBehavioralPolicyApplicability(
  value: unknown,
): BehavioralPolicyApplicability | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const actionSummaryContains = parseStringArray(value.actionSummaryContains);
  const queryContains = parseStringArray(value.queryContains);
  const argumentOrder = parseStringArray(value.argumentOrder);
  const exactFragments = parseBehavioralPolicyFragments(value.exactFragments);
  const canonicalFirstAction = parseBehavioralPolicyAction(value.canonicalFirstAction);
  const appliesTo =
    typeof value.appliesTo === "string"
      ? normalizeFeedbackAppliesTo(value.appliesTo)
      : undefined;

  return {
    ...(actionSummaryContains ? { actionSummaryContains } : {}),
    ...(appliesTo ? { appliesTo } : {}),
    ...(argumentOrder ? { argumentOrder } : {}),
    ...(canonicalFirstAction ? { canonicalFirstAction } : {}),
    ...(exactFragments ? { exactFragments } : {}),
    ...(queryContains ? { queryContains } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return undefined;
  }

  const normalized = uniqueStrings(value);
  return normalized.length > 0 ? normalized : undefined;
}

export function parseBehavioralPolicy(
  value: unknown,
): BehavioralPolicy | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (
    value.behavioralKind !== "preference" &&
    value.behavioralKind !== "avoidance" &&
    value.behavioralKind !== "format_contract" &&
    value.behavioralKind !== "first_action" &&
    value.behavioralKind !== "syntax_constraint" &&
    value.behavioralKind !== "transformation_rule" &&
    value.behavioralKind !== "exemplar_fact"
  ) {
    return undefined;
  }
  if (
    value.transferMode !== "example_only" &&
    value.transferMode !== "pattern_bounded" &&
    value.transferMode !== "general"
  ) {
    return undefined;
  }
  if (
    value.enactmentSurface !== "text_response" &&
    value.enactmentSurface !== "host_action"
  ) {
    return undefined;
  }

  return {
    behavioralKind: value.behavioralKind,
    enactmentSurface: value.enactmentSurface,
    applicability: parseBehavioralPolicyApplicability(value.applicability) ?? {},
    transferMode: value.transferMode,
  };
}

export function serializeBehavioralPolicy(policy: BehavioralPolicy): string {
  return JSON.stringify(policy);
}

export function attachBehavioralPolicyAttributes(
  attributes: Record<string, MemoryAttributeValue> | undefined,
  policy: BehavioralPolicy,
): Record<string, MemoryAttributeValue> {
  return {
    ...(attributes ?? {}),
    [BEHAVIORAL_POLICY_ATTRIBUTE_KEY]: serializeBehavioralPolicy(policy),
    [BEHAVIORAL_POLICY_STEERING_ONLY_ATTRIBUTE_KEY]: true,
    [BEHAVIORAL_POLICY_VERSION_ATTRIBUTE_KEY]: BEHAVIORAL_POLICY_VERSION,
  };
}

export function readBehavioralPolicyFromAttributes(
  attributes: Record<string, MemoryAttributeValue> | undefined,
): BehavioralPolicy | undefined {
  const raw = attributes?.[BEHAVIORAL_POLICY_ATTRIBUTE_KEY];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return undefined;
  }

  try {
    return parseBehavioralPolicy(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export function readBehavioralPolicyFromFeedbackMemory(
  feedback: Pick<FeedbackMemory, "attributes">,
): BehavioralPolicy | undefined {
  return readBehavioralPolicyFromAttributes(feedback.attributes);
}

export function isSteeringOnlyBehavioralPolicy(
  feedback: Pick<FeedbackMemory, "attributes">,
): boolean {
  return feedback.attributes?.[BEHAVIORAL_POLICY_STEERING_ONLY_ATTRIBUTE_KEY] === true;
}

function transferModeForRule(input: {
  exemplarCount?: number;
  hasGeneralRuleMarker: boolean;
}): BehavioralTransferMode {
  if (input.exemplarCount !== undefined && input.exemplarCount <= 1 && !input.hasGeneralRuleMarker) {
    return "example_only";
  }
  if (input.hasGeneralRuleMarker) {
    return "general";
  }
  return (input.exemplarCount ?? 0) >= 2 ? "pattern_bounded" : "example_only";
}

function extractQuotedFragment(rule: string, kind: "prefix" | "suffix"): string | undefined {
  const patterns =
    kind === "prefix"
      ? [
          /\b(?:start|begin)(?:[^"'`]+)?with\s+["'`]([^"'`]+)["'`]/iu,
          /\bsubject(?: line)?(?:[^"'`]+)?["'`]([^"'`]+)["'`]/iu,
        ]
      : [
          /\b(?:end|close|sign off)(?:[^"'`]+)?with\s+["'`]([^"'`]+)["'`]/iu,
          /\bclosing(?:[^"'`]+)?["'`]([^"'`]+)["'`]/iu,
        ];

  for (const pattern of patterns) {
    const match = rule.match(pattern);
    const fragment = match?.[1]?.trim();
    if (fragment) {
      return fragment;
    }
  }

  return undefined;
}

function extractRequiredFragments(rule: string): string[] | undefined {
  const matches = [...rule.matchAll(/["'`]([^"'`]+)["'`]/gu)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
  const unique = uniqueStrings(matches);
  return unique.length > 0 ? unique : undefined;
}

function extractTriggerPhrases(rule: string): string[] | undefined {
  const phrases: string[] = [];

  for (const pattern of RULE_TRIGGER_PATTERNS) {
    const match = rule.match(pattern);
    const phrase = match?.[1]?.trim();
    if (phrase) {
      phrases.push(phrase);
    }
  }

  const normalized = uniqueStrings(phrases);
  return normalized.length > 0 ? normalized : undefined;
}

function looksLikeFormatRule(rule: string): boolean {
  const normalized = normalizeText(rule);
  return FORMAT_RULE_MARKERS.some((marker) => normalized.includes(marker));
}

function looksLikeNegativeRule(rule: string): boolean {
  const normalized = normalizeText(rule);
  return NEGATIVE_RULE_MARKERS.some((marker) => normalized.includes(marker));
}

function looksLikeHostActionRule(rule: string): boolean {
  const normalized = normalizeText(rule);
  if (HOST_ACTION_HINT_MARKERS.some((marker) => normalized.includes(marker))) {
    return true;
  }

  return extractHostActionName(rule) !== undefined;
}

function extractHostActionName(rule: string): string | undefined {
  for (const pattern of HOST_ACTION_NAME_PATTERNS) {
    const match = rule.match(pattern);
    const value = match?.[1]?.trim();
    if (!value) {
      continue;
    }
    const toolCallMatch = value.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/u);
    if (toolCallMatch) {
      const candidate = toolCallMatch[1];
      if (!HOST_ACTION_STOP_WORDS.has(normalizeText(candidate))) {
        return candidate;
      }
      continue;
    }
    const candidate = value.split(/\s+/u)[0]?.trim();
    if (candidate && !HOST_ACTION_STOP_WORDS.has(normalizeText(candidate))) {
      return candidate;
    }
  }

  return undefined;
}

function extractArgumentOrder(rule: string): string[] | undefined {
  const pairs = [...rule.matchAll(/\b([a-z_][a-z0-9_ -]+?)\s+(first|second|third)\b/giu)];
  if (pairs.length === 0) {
    return undefined;
  }

  const byOrdinal = new Map<string, string>();
  for (const match of pairs) {
    const label = match[1]
      ?.trim()
      .replace(/\s+/gu, " ")
      .replace(/.*\b(?:takes|use|with)\s+/iu, "");
    const normalizedLabel = label?.replace(/^(?:and|then)\s+/iu, "");
    const ordinal = match[2]?.toLowerCase();
    if (!normalizedLabel || !ordinal) {
      continue;
    }
    byOrdinal.set(ordinal, normalizedLabel);
  }

  const ordered = ["first", "second", "third"]
    .map((ordinal) => byOrdinal.get(ordinal))
    .filter((value): value is string => Boolean(value));

  return ordered.length > 0 ? ordered : undefined;
}

function hasGeneralRuleMarker(rule: string): boolean {
  const normalized = normalizeText(rule);
  return GENERAL_RULE_MARKERS.some((marker) => normalized.includes(marker));
}

export function deriveRuleBehavioralPolicy(
  input: DeriveRuleBehavioralPolicyInput,
): BehavioralPolicy {
  const generalRule = hasGeneralRuleMarker(input.rule);
  const transferMode = transferModeForRule({
    exemplarCount: input.exemplarCount,
    hasGeneralRuleMarker: generalRule,
  });
  const queryContains = extractTriggerPhrases(input.rule);
  const appliesTo = normalizeFeedbackAppliesTo(input.appliesTo);

  if (looksLikeFormatRule(input.rule)) {
    const prefix = extractQuotedFragment(input.rule, "prefix");
    const suffix = extractQuotedFragment(input.rule, "suffix");
    const required = extractRequiredFragments(input.rule);
    return {
      behavioralKind: "format_contract",
      enactmentSurface: "text_response",
      applicability: {
        appliesTo,
        exactFragments: {
          ...(prefix ? { prefixes: [prefix] } : {}),
          ...(required ? { required } : {}),
          ...(suffix ? { suffixes: [suffix] } : {}),
        },
        ...(queryContains ? { queryContains } : {}),
      },
      transferMode,
    };
  }

  if (looksLikeHostActionRule(input.rule)) {
    const actionName = extractHostActionName(input.rule);
    const argumentOrder = extractArgumentOrder(input.rule);
    const negative = looksLikeNegativeRule(input.rule) || input.kind === "dont";
    return {
      behavioralKind: negative ? "first_action" : "syntax_constraint",
      enactmentSurface: "host_action",
      applicability: {
        appliesTo,
        ...(actionName
          ? {
              canonicalFirstAction: {
                kind: actionName.includes("_") ? "tool_call" : "command",
                name: actionName,
              },
            }
          : {}),
        ...(argumentOrder ? { argumentOrder } : {}),
        ...(queryContains ? { queryContains } : {}),
      },
      transferMode:
        transferMode === "general" ? "pattern_bounded" : transferMode,
    };
  }

  if (input.kind === "prefer") {
    return {
      behavioralKind: "preference",
      enactmentSurface: "text_response",
      applicability: {
        appliesTo,
        ...(queryContains ? { queryContains } : {}),
      },
      transferMode,
    };
  }

  if (input.kind === "dont" || looksLikeNegativeRule(input.rule)) {
    return {
      behavioralKind: "avoidance",
      enactmentSurface: "text_response",
      applicability: {
        appliesTo,
        ...(queryContains ? { queryContains } : {}),
      },
      transferMode,
    };
  }

  if (input.kind === "do" && !queryContains) {
    return {
      behavioralKind: "transformation_rule",
      enactmentSurface: "text_response",
      applicability: {
        appliesTo,
      },
      transferMode: generalRule ? "general" : "pattern_bounded",
    };
  }

  if (generalRule || (input.exemplarCount ?? 0) >= 2) {
    return {
      behavioralKind: "transformation_rule",
      enactmentSurface: "text_response",
      applicability: {
        appliesTo,
        ...(queryContains ? { queryContains } : {}),
      },
      transferMode: generalRule ? "general" : "pattern_bounded",
    };
  }

  return {
    behavioralKind: "exemplar_fact",
    enactmentSurface: "text_response",
    applicability: {
      appliesTo,
      ...(queryContains ? { queryContains } : {}),
    },
    transferMode: "example_only",
  };
}

function countMatchedPhrases(
  haystack: string,
  phrases: readonly string[] | undefined,
): string[] {
  if (!phrases || phrases.length === 0) {
    return [];
  }

  const normalizedHaystack = normalizeText(haystack);
  return phrases.filter((phrase) => normalizedHaystack.includes(normalizeText(phrase)));
}

export function selectBehavioralPolicies(
  input: BehavioralPolicySelectionInput,
): BehavioralPolicySelection[] {
  const normalizedAppliesTo = normalizeFeedbackAppliesTo(input.appliesTo);
  const normalizedQuery = normalizeText(input.query);
  const selections: BehavioralPolicySelection[] = [];

  for (const feedback of input.feedback ?? []) {
    if (feedback.lifecycle !== "active") {
      continue;
    }

    const policy = readBehavioralPolicyFromFeedbackMemory(feedback);
    if (!policy || policy.enactmentSurface !== input.surface) {
      continue;
    }

    const policyAppliesTo = normalizeFeedbackAppliesTo(
      policy.applicability.appliesTo ?? feedback.appliesTo,
    );
    const exactScopeMatch = policyAppliesTo === normalizedAppliesTo;
    if (!exactScopeMatch && policyAppliesTo !== "general_response") {
      continue;
    }

    const matchedQueryTokens = uniqueStrings([
      ...countMatchedPhrases(normalizedQuery, policy.applicability.queryContains),
      ...countMatchedPhrases(
        normalizedQuery,
        policy.applicability.actionSummaryContains,
      ),
    ]);
    if (
      policy.transferMode === "example_only" &&
      matchedQueryTokens.length === 0
    ) {
      continue;
    }

    const score =
      (exactScopeMatch ? 10_000 : 0) +
      (input.surface === "host_action" && policy.enactmentSurface === "host_action"
        ? 2_000
        : 0) +
      BEHAVIORAL_KIND_RANK[policy.behavioralKind] * 100 +
      TRANSFER_MODE_RANK[policy.transferMode] * 10 +
      matchedQueryTokens.length;

    selections.push({
      feedback,
      matchedQueryTokens,
      policy,
      score,
    });
  }

  return selections.sort((left, right) => right.score - left.score);
}

export function buildBehavioralSteeringLines(
  policies: readonly BehavioralPolicySelection[],
): string[] {
  const lines: string[] = [];

  for (const { feedback, policy } of policies) {
    if (policy.enactmentSurface !== "text_response") {
      continue;
    }

    if (policy.behavioralKind === "format_contract") {
      const prefixes = policy.applicability.exactFragments?.prefixes ?? [];
      const required = policy.applicability.exactFragments?.required ?? [];
      const suffixes = policy.applicability.exactFragments?.suffixes ?? [];
      if (prefixes.length > 0) {
        lines.push(`Start the response with "${prefixes[0]}".`);
      }
      for (const fragment of required) {
        lines.push(`Include the exact fragment "${fragment}".`);
      }
      if (suffixes.length > 0) {
        lines.push(`End the response with "${suffixes[0]}".`);
      }
      if (feedback.rule) {
        lines.push(`Follow this exact formatting rule: ${feedback.rule}`);
      }
      continue;
    }

    if (policy.behavioralKind === "transformation_rule") {
      if (feedback.rule) {
        lines.push(`Apply this rule only when it matches the current probe: ${feedback.rule}`);
      }
      continue;
    }

    if (policy.behavioralKind === "preference") {
      if (feedback.rule) {
        lines.push(`Prefer this behavior when it fits the current probe: ${feedback.rule}`);
      }
      continue;
    }

    if (policy.behavioralKind === "avoidance") {
      if (feedback.rule) {
        lines.push(`Avoid this behavior when the trigger matches: ${feedback.rule}`);
      }
      continue;
    }

    if (policy.behavioralKind === "exemplar_fact" && feedback.rule) {
      lines.push(
        `Treat this as example-bound guidance unless the probe clearly matches: ${feedback.rule}`,
      );
      continue;
    }
  }

  return uniqueStrings(lines);
}

export function buildBehavioralActionSteeringLines(
  policies: readonly BehavioralPolicySelection[],
): string[] {
  const lines: string[] = [];

  for (const { feedback, policy } of policies) {
    if (policy.enactmentSurface !== "host_action") {
      continue;
    }

    if (feedback.rule) {
      lines.push(`Follow this first-action rule: ${feedback.rule}`);
    }

    const canonicalFirstAction = policy.applicability.canonicalFirstAction;
    if (canonicalFirstAction?.raw) {
      lines.push(`The first line must be exactly: ${canonicalFirstAction.raw}`);
    } else if (canonicalFirstAction?.name) {
      lines.push(`Use "${canonicalFirstAction.name}" as the first executable action.`);
    }

    if ((policy.applicability.argumentOrder?.length ?? 0) > 0) {
      lines.push(
        `Preserve argument order exactly: ${policy.applicability.argumentOrder!.join(" before ")}.`,
      );
    }

    lines.push(
      "Do not replace the canonical action with generic shell prose, alternative utilities, or explanation-first text.",
    );
  }

  return uniqueStrings(lines);
}
