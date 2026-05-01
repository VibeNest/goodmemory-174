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

export interface BehavioralPolicyReplacement {
  from: string;
  to: string;
}

export interface BehavioralPolicyGuard {
  allowedStates?: string[];
  check: string;
  fallbackInstruction?: string;
  subject?: string;
}

export interface BehavioralPolicyUrlTemplate {
  example: string;
  host: string;
  pathPlacement: "path_after_host";
  scheme: "http" | "https";
}

export interface BehavioralPolicyPathTemplate {
  anchor: string;
  example: string;
  variableSegment: "filename";
}

export interface BehavioralPolicyApplicability {
  actionSummaryContains?: string[];
  appliesTo?: string;
  argumentOrder?: string[];
  canonicalFirstAction?: BehavioralPolicyAction;
  exactFragments?: BehavioralPolicyFragments;
  fallbackInstruction?: string;
  forbiddenFragments?: string[];
  guard?: BehavioralPolicyGuard;
  preferredAlternatives?: string[];
  preferredFragments?: string[];
  pathTemplate?: BehavioralPolicyPathTemplate;
  queryContains?: string[];
  replacementPairs?: BehavioralPolicyReplacement[];
  urlTemplate?: BehavioralPolicyUrlTemplate;
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

function hasStructuredTextResponseSteering(policy: BehavioralPolicy): boolean {
  if (policy.enactmentSurface !== "text_response") {
    return false;
  }

  return Boolean(
    policy.applicability.urlTemplate ||
      policy.applicability.pathTemplate ||
      policy.applicability.guard ||
      (policy.applicability.replacementPairs?.length ?? 0) > 0 ||
      (policy.applicability.forbiddenFragments?.length ?? 0) > 0 ||
      (policy.applicability.preferredAlternatives?.length ?? 0) > 0 ||
      (policy.applicability.preferredFragments?.length ?? 0) > 0 ||
      (policy.applicability.exactFragments?.prefixes?.length ?? 0) > 0 ||
      (policy.applicability.exactFragments?.required?.length ?? 0) > 0 ||
      (policy.applicability.exactFragments?.suffixes?.length ?? 0) > 0,
  );
}

export interface BehavioralPolicySelectionInput {
  appliesTo: string;
  feedback?: readonly FeedbackMemory[];
  query?: string;
  surface: BehavioralEnactmentSurface;
  transientFeedback?: readonly FeedbackMemory[];
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
  /\bon\s+(.+?)\s+requests?(?:[,.]|$)/iu,
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
const URL_PROTOCOL_REWRITE = {
  from: "http://",
  to: "https://",
} as const;
const URL_TEMPLATE_PAGE_TOKEN = "<page>";
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

function parseBehavioralPolicyReplacement(
  value: unknown,
): BehavioralPolicyReplacement | undefined {
  if (!isRecord(value) || typeof value.from !== "string" || typeof value.to !== "string") {
    return undefined;
  }

  const from = value.from.trim();
  const to = value.to.trim();
  if (from.length === 0 || to.length === 0) {
    return undefined;
  }

  return { from, to };
}

function parseBehavioralPolicyGuard(
  value: unknown,
): BehavioralPolicyGuard | undefined {
  if (!isRecord(value) || typeof value.check !== "string") {
    return undefined;
  }

  const check = value.check.trim();
  if (check.length === 0) {
    return undefined;
  }

  const allowedStates = parseStringArray(value.allowedStates);
  const fallbackInstruction =
    typeof value.fallbackInstruction === "string" && value.fallbackInstruction.trim().length > 0
      ? value.fallbackInstruction.trim()
      : undefined;
  const subject =
    typeof value.subject === "string" && value.subject.trim().length > 0
      ? value.subject.trim()
      : undefined;

  return {
    ...(allowedStates ? { allowedStates } : {}),
    check,
    ...(fallbackInstruction ? { fallbackInstruction } : {}),
    ...(subject ? { subject } : {}),
  };
}

function parseBehavioralPolicyUrlTemplate(
  value: unknown,
): BehavioralPolicyUrlTemplate | undefined {
  if (
    !isRecord(value) ||
    typeof value.example !== "string" ||
    typeof value.host !== "string" ||
    value.pathPlacement !== "path_after_host" ||
    (value.scheme !== "http" && value.scheme !== "https")
  ) {
    return undefined;
  }

  const example = value.example.trim();
  const host = value.host.trim();
  if (example.length === 0 || host.length === 0) {
    return undefined;
  }

  return {
    example,
    host,
    pathPlacement: "path_after_host",
    scheme: value.scheme,
  };
}

function parseBehavioralPolicyPathTemplate(
  value: unknown,
): BehavioralPolicyPathTemplate | undefined {
  if (
    !isRecord(value) ||
    typeof value.anchor !== "string" ||
    typeof value.example !== "string" ||
    value.variableSegment !== "filename"
  ) {
    return undefined;
  }

  const anchor = value.anchor.trim();
  const example = value.example.trim();
  if (anchor.length === 0 || example.length === 0) {
    return undefined;
  }

  return {
    anchor,
    example,
    variableSegment: "filename",
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
  const forbiddenFragments = parseStringArray(value.forbiddenFragments);
  const preferredAlternatives = parseStringArray(value.preferredAlternatives);
  const preferredFragments = parseStringArray(value.preferredFragments);
  const pathTemplate = parseBehavioralPolicyPathTemplate(value.pathTemplate);
  const replacementPairs =
    Array.isArray(value.replacementPairs)
      ? value.replacementPairs
          .map((entry) => parseBehavioralPolicyReplacement(entry))
          .filter((entry): entry is BehavioralPolicyReplacement => Boolean(entry))
      : undefined;
  const urlTemplate = parseBehavioralPolicyUrlTemplate(value.urlTemplate);
  const guard = parseBehavioralPolicyGuard(value.guard);
  const canonicalFirstAction = parseBehavioralPolicyAction(value.canonicalFirstAction);
  const appliesTo =
    typeof value.appliesTo === "string"
      ? normalizeFeedbackAppliesTo(value.appliesTo)
      : undefined;
  const fallbackInstruction =
    typeof value.fallbackInstruction === "string" && value.fallbackInstruction.trim().length > 0
      ? value.fallbackInstruction.trim()
      : undefined;

  return {
    ...(actionSummaryContains ? { actionSummaryContains } : {}),
    ...(appliesTo ? { appliesTo } : {}),
    ...(argumentOrder ? { argumentOrder } : {}),
    ...(canonicalFirstAction ? { canonicalFirstAction } : {}),
    ...(exactFragments ? { exactFragments } : {}),
    ...(fallbackInstruction ? { fallbackInstruction } : {}),
    ...(forbiddenFragments ? { forbiddenFragments } : {}),
    ...(guard ? { guard } : {}),
    ...(preferredAlternatives ? { preferredAlternatives } : {}),
    ...(preferredFragments ? { preferredFragments } : {}),
    ...(pathTemplate ? { pathTemplate } : {}),
    ...(queryContains ? { queryContains } : {}),
    ...(replacementPairs && replacementPairs.length > 0
      ? { replacementPairs }
      : {}),
    ...(urlTemplate ? { urlTemplate } : {}),
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

function extractSlashPaths(rule: string): string[] | undefined {
  const matches = [...rule.matchAll(/(?:~\/|\/)[A-Za-z0-9._/-]*[A-Za-z0-9_/-]/gu)]
    .map((match) => match[0]?.trim())
    .filter((value): value is string => Boolean(value));
  const normalized = uniqueStrings(matches);
  return normalized.length > 0 ? normalized : undefined;
}

function extractPreferredAlternativeNames(rule: string): string[] | undefined {
  const matches: string[] = [];
  const ignored = new Set(["url", "urls", "file", "files", "warning", "warnings"]);

  for (const pattern of [
    /\bprefer\s+([A-Z][A-Za-z0-9_]*|[a-z_]+_[a-z0-9_]*)\s+or\s+(?:a|an)\s+warning\b/giu,
    /\bprefer\s+([A-Z][A-Za-z0-9_]*|[a-z_]+_[a-z0-9_]*)\b/giu,
  ]) {
    for (const match of rule.matchAll(pattern)) {
      const value = match[1]?.trim();
      if (value && !ignored.has(value.toLowerCase())) {
        matches.push(value);
      }
    }
  }

  const normalized = uniqueStrings(matches);
  return normalized.length > 0 ? normalized : undefined;
}

function extractGuard(rule: string): BehavioralPolicyGuard | undefined {
  const match = rule.match(
    /\bBefore using\s+([A-Za-z_][A-Za-z0-9_]*)\s*,\s*check\s+(.+?)\s+first\s+and\s+only proceed when\s+(.+?)(?:[.]|$)/iu,
  );
  if (!match) {
    return undefined;
  }

  const subject = match[1]?.trim();
  const check = match[2]?.trim();
  const allowedClause = match[3]?.trim();
  if (!check) {
    return undefined;
  }

  const allowedStates = uniqueStrings(
    allowedClause
      ?.split(/\bor\b|,/iu)
      .map((part) =>
        part
          .replace(/\b(?:is|are|equals?)\b/giu, " ")
          .replace(/\s+/gu, " ")
          .trim(),
      ) ?? [],
  );

  return {
    ...(allowedStates.length > 0 ? { allowedStates } : {}),
    check,
    fallbackInstruction:
      "If the required check cannot be verified, warn or defer instead of assuming it already passed.",
    ...(subject ? { subject } : {}),
  };
}

function deriveProtocolRewriteApplicability(
  rule: string,
): Pick<
  BehavioralPolicyApplicability,
  | "fallbackInstruction"
  | "forbiddenFragments"
  | "preferredFragments"
  | "queryContains"
  | "replacementPairs"
  | "urlTemplate"
> | null {
  const normalized = normalizeText(rule);
  if (!normalized.includes("https") || !normalized.includes("http")) {
    return null;
  }
  if (
    !normalized.includes("prefer https") &&
    !normalized.includes("prefer urls in the form https://") &&
    !normalized.includes("avoid http") &&
    !normalized.includes("warn instead of producing http")
  ) {
    return null;
  }

  const templateMatch = rule.match(
    /(https:\/\/[A-Za-z0-9.-]+\/<page>)/u,
  );
  let preferredFragments: string[] | undefined;
  let urlTemplate: BehavioralPolicyUrlTemplate | undefined;
  if (templateMatch?.[1]) {
    const example = templateMatch[1].trim();
    const parsed = new URL(example.replace(URL_TEMPLATE_PAGE_TOKEN, "page"));
    preferredFragments = [`${parsed.protocol}//${parsed.host}/`];
    urlTemplate = {
      example,
      host: parsed.host,
      pathPlacement: "path_after_host",
      scheme: parsed.protocol === "https:" ? "https" : "http",
    };
  }

  return {
    fallbackInstruction:
      "If the current probe explicitly requests http, warn first and then offer the https URL instead of silently substituting protocols.",
    forbiddenFragments: [URL_PROTOCOL_REWRITE.from],
    ...(preferredFragments ? { preferredFragments } : {}),
    queryContains: ["url"],
    replacementPairs: [URL_PROTOCOL_REWRITE],
    ...(urlTemplate ? { urlTemplate } : {}),
  };
}

function deriveDirectoryRestrictionApplicability(
  rule: string,
): Pick<
  BehavioralPolicyApplicability,
  "fallbackInstruction" | "forbiddenFragments" | "pathTemplate" | "preferredFragments"
> | null {
  const normalized = normalizeText(rule);
  const forbiddenRoot =
    rule.match(/\bdo not write under\s+((?:~\/|\/)[A-Za-z0-9._/-]*[A-Za-z0-9_/-])/iu)?.[1] ??
    (extractSlashPaths(rule) ?? []).find((path) =>
      path.startsWith("/root") || path.startsWith("/system") || path.startsWith("/etc"),
    );
  const safeTemplateMatch = rule.match(
    /(?:in the form|under)\s+(~\/[A-Za-z0-9._/-]+\/<file>|\/home\/[A-Za-z0-9._/-]+\/<file>)/u,
  );
  let preferredFragments: string[] | undefined;
  let pathTemplate: BehavioralPolicyPathTemplate | undefined;
  if (safeTemplateMatch?.[1]) {
    const example = safeTemplateMatch[1].trim();
    const anchor = example.replace(/<file>$/u, "");
    preferredFragments = [anchor];
    pathTemplate = {
      anchor,
      example,
      variableSegment: "filename",
    };
  }

  if (!forbiddenRoot && !normalized.includes("home-directory") && !pathTemplate) {
    return null;
  }

  return {
    fallbackInstruction:
      "Refuse the unsafe path and redirect to a safe user-writable home-directory path instead.",
    ...(forbiddenRoot ? { forbiddenFragments: [forbiddenRoot] } : {}),
    ...(preferredFragments
      ? { preferredFragments }
      : normalized.includes("home-directory")
        ? { preferredFragments: ["/home/"] }
        : {}),
    ...(pathTemplate ? { pathTemplate } : {}),
  };
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
  const protocolApplicability = deriveProtocolRewriteApplicability(input.rule);
  const directoryApplicability = deriveDirectoryRestrictionApplicability(
    input.rule,
  );
  const mergedQueryContains = uniqueStrings([
    ...(extractTriggerPhrases(input.rule) ?? []),
    ...(protocolApplicability?.queryContains ?? []),
  ]);
  const preferredAlternatives = extractPreferredAlternativeNames(input.rule);
  const guard = extractGuard(input.rule);
  const forbiddenFragments = uniqueStrings([
    ...(protocolApplicability?.forbiddenFragments ?? []),
    ...(directoryApplicability?.forbiddenFragments ?? []),
  ]);
  const preferredFragments = uniqueStrings([
    ...(protocolApplicability?.preferredFragments ?? []),
    ...(directoryApplicability?.preferredFragments ?? []),
  ]);
  const pathTemplate = directoryApplicability?.pathTemplate;
  const replacementPairs = protocolApplicability?.replacementPairs;
  const urlTemplate = protocolApplicability?.urlTemplate;
  const fallbackInstruction =
    guard?.fallbackInstruction ??
    protocolApplicability?.fallbackInstruction ??
    directoryApplicability?.fallbackInstruction ??
    (preferredAlternatives && preferredAlternatives.length > 0 && looksLikeNegativeRule(input.rule)
      ? `Prefer ${preferredAlternatives.join(" or ")} or warn instead of implying the avoided behavior.`
      : undefined);

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
        ...(fallbackInstruction ? { fallbackInstruction } : {}),
        ...(forbiddenFragments.length > 0 ? { forbiddenFragments } : {}),
        ...(guard ? { guard } : {}),
        ...(preferredAlternatives ? { preferredAlternatives } : {}),
        ...(preferredFragments.length > 0 ? { preferredFragments } : {}),
        ...(pathTemplate ? { pathTemplate } : {}),
        ...(mergedQueryContains.length > 0
          ? { queryContains: mergedQueryContains }
          : {}),
        ...(replacementPairs && replacementPairs.length > 0
          ? { replacementPairs }
          : {}),
        ...(urlTemplate ? { urlTemplate } : {}),
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
        ...(fallbackInstruction ? { fallbackInstruction } : {}),
        ...(forbiddenFragments.length > 0 ? { forbiddenFragments } : {}),
        ...(guard ? { guard } : {}),
        ...(preferredAlternatives ? { preferredAlternatives } : {}),
        ...(preferredFragments.length > 0 ? { preferredFragments } : {}),
        ...(pathTemplate ? { pathTemplate } : {}),
        ...(mergedQueryContains.length > 0
          ? { queryContains: mergedQueryContains }
          : {}),
        ...(replacementPairs && replacementPairs.length > 0
          ? { replacementPairs }
          : {}),
        ...(urlTemplate ? { urlTemplate } : {}),
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
        ...(fallbackInstruction ? { fallbackInstruction } : {}),
        ...(forbiddenFragments.length > 0 ? { forbiddenFragments } : {}),
        ...(guard ? { guard } : {}),
        ...(preferredAlternatives ? { preferredAlternatives } : {}),
        ...(preferredFragments.length > 0 ? { preferredFragments } : {}),
        ...(pathTemplate ? { pathTemplate } : {}),
        ...(mergedQueryContains.length > 0
          ? { queryContains: mergedQueryContains }
          : {}),
        ...(replacementPairs && replacementPairs.length > 0
          ? { replacementPairs }
          : {}),
        ...(urlTemplate ? { urlTemplate } : {}),
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
        ...(fallbackInstruction ? { fallbackInstruction } : {}),
        ...(forbiddenFragments.length > 0 ? { forbiddenFragments } : {}),
        ...(guard ? { guard } : {}),
        ...(preferredAlternatives ? { preferredAlternatives } : {}),
        ...(preferredFragments.length > 0 ? { preferredFragments } : {}),
        ...(pathTemplate ? { pathTemplate } : {}),
        ...(mergedQueryContains.length > 0
          ? { queryContains: mergedQueryContains }
          : {}),
        ...(replacementPairs && replacementPairs.length > 0
          ? { replacementPairs }
          : {}),
        ...(urlTemplate ? { urlTemplate } : {}),
      },
      transferMode: generalRule ? "general" : "pattern_bounded",
    };
  }

  return {
    behavioralKind: "exemplar_fact",
    enactmentSurface: "text_response",
    applicability: {
      appliesTo,
      ...(fallbackInstruction ? { fallbackInstruction } : {}),
      ...(forbiddenFragments.length > 0 ? { forbiddenFragments } : {}),
      ...(guard ? { guard } : {}),
      ...(preferredAlternatives ? { preferredAlternatives } : {}),
      ...(preferredFragments.length > 0 ? { preferredFragments } : {}),
      ...(pathTemplate ? { pathTemplate } : {}),
      ...(mergedQueryContains.length > 0
        ? { queryContains: mergedQueryContains }
        : {}),
      ...(replacementPairs && replacementPairs.length > 0
        ? { replacementPairs }
        : {}),
      ...(urlTemplate ? { urlTemplate } : {}),
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

function selectTransientFeedbackPolicies(
  input: BehavioralPolicySelectionInput,
): BehavioralPolicySelection[] {
  if (
    input.surface !== "text_response" ||
    !input.transientFeedback ||
    input.transientFeedback.length === 0
  ) {
    return [];
  }

  const normalizedAppliesTo = normalizeFeedbackAppliesTo(input.appliesTo);
  const normalizedQuery = normalizeText(input.query);
  const selections: BehavioralPolicySelection[] = [];

  for (const feedback of input.transientFeedback) {
    if (feedback.lifecycle !== "active" || feedback.kind === "validated_pattern") {
      continue;
    }
    if (readBehavioralPolicyFromFeedbackMemory(feedback)) {
      continue;
    }

    const policy = deriveRuleBehavioralPolicy({
      appliesTo: feedback.appliesTo,
      exemplarCount: 1,
      kind: feedback.kind,
      rule: feedback.rule,
    });
    if (policy.enactmentSurface !== "text_response") {
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
      ...countMatchedPhrases(
        normalizedQuery,
        policy.applicability.forbiddenFragments,
      ),
      ...countMatchedPhrases(
        normalizedQuery,
        policy.applicability.preferredFragments,
      ),
    ]);
    if (
      policy.transferMode !== "general" &&
      matchedQueryTokens.length === 0
    ) {
      continue;
    }

    const score =
      (exactScopeMatch ? 10_000 : 0) +
      BEHAVIORAL_KIND_RANK[policy.behavioralKind] * 100 +
      TRANSFER_MODE_RANK[policy.transferMode] * 10 +
      matchedQueryTokens.length +
      5;

    selections.push({
      feedback,
      matchedQueryTokens,
      policy,
      score,
    });
  }

  return selections;
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

  const transientSelections = selectTransientFeedbackPolicies(input);

  return [...selections, ...transientSelections].sort(
    (left, right) => right.score - left.score,
  );
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

    for (const replacement of policy.applicability.replacementPairs ?? []) {
      lines.push(
        `If the answer would contain "${replacement.from}", rewrite it to "${replacement.to}" instead of emitting the disallowed form.`,
      );
    }

    for (const fragment of policy.applicability.forbiddenFragments ?? []) {
      lines.push(
        `Do not emit the exact fragment "${fragment}" in the final answer unless directly quoting user input.`,
      );
    }

    for (const fragment of policy.applicability.preferredFragments ?? []) {
      lines.push(
        `Prefer a safe replacement fragment such as "${fragment}" when the current probe matches.`,
      );
    }

    if (policy.applicability.urlTemplate) {
      const { urlTemplate } = policy.applicability;
      lines.push(
        `When answering with a URL, keep the established origin "${urlTemplate.scheme}://${urlTemplate.host}" and place the requested page after the host as a path segment, for example "${urlTemplate.example}".`,
      );
      lines.push(
        "Do not rewrite the requested page into a subdomain when the learned URL pattern uses a path after the host.",
      );
    }

    if (policy.applicability.pathTemplate) {
      const { pathTemplate } = policy.applicability;
      lines.push(
        `When redirecting a file path, keep the established safe directory anchor "${pathTemplate.anchor}" and preserve the requested filename under that directory, for example "${pathTemplate.example}".`,
      );
      lines.push(
        "Do not invent a new top-level directory when the learned safe path already provides a concrete user-writable location.",
      );
    }

    if (policy.applicability.guard) {
      const { guard } = policy.applicability;
      const subject = guard.subject ? `"${guard.subject}"` : "the guarded behavior";
      lines.push(`Before using or implying ${subject}, ${guard.check}.`);
      if ((guard.allowedStates?.length ?? 0) > 0) {
        lines.push(
          `Only proceed when the required check resolves to ${guard.allowedStates!.join(" or ")}.`,
        );
      }
      if (guard.fallbackInstruction) {
        lines.push(guard.fallbackInstruction);
      }
    }

    if ((policy.applicability.preferredAlternatives?.length ?? 0) > 0) {
      lines.push(
        `Prefer ${policy.applicability.preferredAlternatives!
          .map((value) => `"${value}"`)
          .join(" or ")} as the safer replacement behavior when the trigger matches.`,
      );
    }

    if (policy.applicability.fallbackInstruction) {
      lines.push(policy.applicability.fallbackInstruction);
    }

    if (hasStructuredTextResponseSteering(policy)) {
      lines.push(
        "If a short compliant answer, redirect, or warning already satisfies the request, stop there instead of expanding into a longer response.",
      );
    }

    if (policy.behavioralKind === "transformation_rule") {
      if (feedback.rule && !hasStructuredTextResponseSteering(policy)) {
        lines.push(`Apply this rule only when it matches the current probe: ${feedback.rule}`);
      }
      continue;
    }

    if (policy.behavioralKind === "preference") {
      if (feedback.rule && !hasStructuredTextResponseSteering(policy)) {
        lines.push(`Prefer this behavior when it fits the current probe: ${feedback.rule}`);
      }
      continue;
    }

    if (policy.behavioralKind === "avoidance") {
      if (feedback.rule && !hasStructuredTextResponseSteering(policy)) {
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
