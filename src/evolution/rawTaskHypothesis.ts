import {
  type BehavioralPolicyComputedResponseRule,
  evaluateComputedResponseRule,
  extractComputedResponseRule,
  recoverCanonicalActionFromTemplate,
  splitTopLevelCallArguments,
} from "./behavioralPolicy";
import type {
  RawBehavioralCarryoverSelection,
  RawBehavioralSurfaceFamily,
  RawCarryoverConstraintType,
  RawQueryIntent,
} from "./rawBehavioralExemplars";

export type RawTaskHypothesisMappingType =
  | "conditional_precondition"
  | "exact_surface_copy"
  | "guarded_decision"
  | "exact_format_contract"
  | "hard_constraint_contract"
  | "slot_rebinding"
  | "style_contract"
  | "symbolic_formula"
  | "symbolic_rule_execution";

export type RawTaskHypothesisExecutionMode =
  | "abstain"
  | "model_only"
  | "transient_executor";

export interface RawTaskHypothesis {
  applicability?: string;
  canonicalActionTemplate?: string;
  commandName?: string;
  confidence: number;
  conflictingPrototypeIds: string[];
  constraintTypes: RawCarryoverConstraintType[];
  computedResponseRule?: BehavioralPolicyComputedResponseRule;
  executionMode: RawTaskHypothesisExecutionMode;
  mappingType: RawTaskHypothesisMappingType;
  stableFields: string[];
  supportingExemplarIds: string[];
  supportingPrototypeIds: string[];
  surfaceFamily: RawBehavioralSurfaceFamily;
  taskFamily: string;
  varyingFields: string[];
}

export interface BuildRawTaskHypothesisInput {
  conflictPrototypeIds: string[];
  query: string;
  queryIntent: RawQueryIntent;
  selections: readonly RawBehavioralCarryoverSelection[];
  surfaceFamily: RawBehavioralSurfaceFamily;
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

function clipText(value: string, maxLength = 140): string {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function classifyMappingType(input: {
  queryIntent: RawQueryIntent;
  selections: readonly RawBehavioralCarryoverSelection[];
  surfaceFamily: RawBehavioralSurfaceFamily;
}): RawTaskHypothesisMappingType {
  const topExemplar = input.selections[0]?.exemplar;
  const selectionHasPrecondition = input.selections.some((selection) => {
    const exemplar = selection.exemplar;
    const surface = [
      exemplar.episodeShape.safeCorrectedMove,
      exemplar.episodeShape.relevantPriorMove,
      exemplar.episodeShape.observedOutcome,
    ].join(" ");
    return (
      exemplar.intentCue.query.constraintTypes.includes("precondition") ||
      exemplar.intentCue.query.actionType === "guarded_api" ||
      /\bcheck\b.+\bonly\s+(?:if|when)\b/iu.test(surface)
    );
  });
  if (
    input.queryIntent.constraintTypes.includes("formula") ||
    input.queryIntent.actionType === "symbolic_rule"
  ) {
    return "symbolic_rule_execution";
  }
  if (
    input.surfaceFamily === "text_response" &&
    (selectionHasPrecondition ||
      input.queryIntent.constraintTypes.includes("precondition") ||
      input.queryIntent.actionType === "guarded_api")
  ) {
    return "conditional_precondition";
  }
  if (
    input.surfaceFamily === "host_action" &&
    (input.queryIntent.constraintTypes.includes("arg_order") ||
      input.queryIntent.constraintTypes.includes("exact_action") ||
      Boolean(topExemplar?.exactSurface?.value) ||
      Boolean(input.queryIntent.exactSlots.commandName))
  ) {
    return topExemplar?.exactSurface?.value &&
      input.selections.length === 1 &&
      topExemplar.intentCue.query.exactSlots.commandName ===
        input.queryIntent.exactSlots.commandName
      ? "exact_surface_copy"
      : "slot_rebinding";
  }
  if (
    input.queryIntent.constraintTypes.includes("precondition") ||
    input.queryIntent.actionType === "guarded_api"
  ) {
    return "conditional_precondition";
  }
  if (input.queryIntent.actionType === "format_contract") {
    return "exact_format_contract";
  }
  if (
    input.queryIntent.constraintTypes.includes("style") ||
    input.queryIntent.actionType === "voice_style"
  ) {
    return "exact_format_contract";
  }
  if (
    input.queryIntent.constraintTypes.includes("path_root") ||
    input.queryIntent.constraintTypes.includes("safe_alternative") ||
    input.queryIntent.constraintTypes.includes("url_shape") ||
    input.queryIntent.constraintTypes.includes("analogy")
  ) {
    return "hard_constraint_contract";
  }
  if (
    topExemplar?.exactSurface?.value &&
    input.selections.length === 1 &&
    topExemplar.confidence >= 0.72
  ) {
    return "exact_surface_copy";
  }

  return "slot_rebinding";
}

function buildStableFields(input: {
  computedResponseRule?: BehavioralPolicyComputedResponseRule;
  queryIntent: RawQueryIntent;
  selections: readonly RawBehavioralCarryoverSelection[];
}): string[] {
  const topExemplar = input.selections[0]?.exemplar;
  if (!topExemplar) {
    return [];
  }

  const stableFields: string[] = [];
  const topSlots = topExemplar.intentCue.query.exactSlots;
  if (topSlots.commandName) {
    stableFields.push(`command=${topSlots.commandName}`);
  }
  if (topSlots.argOrderSignature) {
    stableFields.push(`arg_order=${topSlots.argOrderSignature}`);
  }
  if (topSlots.urlHost) {
    stableFields.push(`url_host=${topSlots.urlHost}`);
  }
  if (topSlots.pathRoot) {
    stableFields.push(`path_root=${topSlots.pathRoot}`);
  }
  if (topExemplar.exactSurface?.kind) {
    stableFields.push(`surface_kind=${topExemplar.exactSurface.kind}`);
  }
  if (topExemplar.exactSurface?.formatPrefixes?.length) {
    stableFields.push(`required_prefix=${topExemplar.exactSurface.formatPrefixes[0]}`);
  }
  if (topExemplar.exactSurface?.formatSuffixes?.length) {
    stableFields.push(`required_suffix=${topExemplar.exactSurface.formatSuffixes[0]}`);
  }
  if (topSlots.styleMarkers.length > 0) {
    stableFields.push(`style=${topSlots.styleMarkers.join(",")}`);
  }
  if (input.queryIntent.constraintTypes.includes("precondition")) {
    stableFields.push("must_check_precondition");
  }
  if (
    input.selections.some(
      (selection) =>
        selection.exemplar.intentCue.query.constraintTypes.includes("precondition") ||
        selection.exemplar.intentCue.query.actionType === "guarded_api",
    )
  ) {
    stableFields.push("must_check_precondition");
  }
  if (input.computedResponseRule) {
    stableFields.push(
      input.computedResponseRule.kind === "recurrence"
        ? `formula=${input.computedResponseRule.sequenceName}(n)=${input.computedResponseRule.expression}`
        : `formula=${input.computedResponseRule.leftVariable}${input.computedResponseRule.operatorSymbol}${input.computedResponseRule.rightVariable}=${input.computedResponseRule.expression}`,
    );
  }
  if (topExemplar.exactSurface?.value) {
    stableFields.push(`surface=${clipText(topExemplar.exactSurface.value, 96)}`);
  }

  return uniqueStrings(stableFields);
}

function buildVaryingFields(queryIntent: RawQueryIntent): string[] {
  const varying: string[] = [];
  if (queryIntent.exactSlots.filename) {
    varying.push(`filename=${queryIntent.exactSlots.filename}`);
  }
  if (queryIntent.exactSlots.extension) {
    varying.push(`extension=${queryIntent.exactSlots.extension}`);
  }
  if (queryIntent.exactSlots.pathRoot) {
    varying.push(`path_root=${queryIntent.exactSlots.pathRoot}`);
  }
  if (queryIntent.exactSlots.urlHost) {
    varying.push(`url_host=${queryIntent.exactSlots.urlHost}`);
  }
  if (queryIntent.exactSlots.urlPath) {
    varying.push(`url_path=${queryIntent.exactSlots.urlPath}`);
  }
  if (queryIntent.exactSlots.commandName) {
    varying.push(`command=${queryIntent.exactSlots.commandName}`);
  }
  if (queryIntent.exactSlots.argOrderSignature) {
    varying.push(`arg_order=${queryIntent.exactSlots.argOrderSignature}`);
  }
  if (queryIntent.exactSlots.operatorSymbols.length > 0) {
    varying.push(`operators=${queryIntent.exactSlots.operatorSymbols.join(",")}`);
  }
  if (queryIntent.exactSlots.styleMarkers.length > 0) {
    varying.push(`style=${queryIntent.exactSlots.styleMarkers.join(",")}`);
  }

  return uniqueStrings(varying);
}

function deriveComputedResponseRule(
  selections: readonly RawBehavioralCarryoverSelection[],
): BehavioralPolicyComputedResponseRule | undefined {
  for (const selection of selections) {
    const texts = [
      selection.exemplar.episodeShape.cue,
      selection.exemplar.episodeShape.relevantPriorMove,
      selection.exemplar.episodeShape.safeCorrectedMove,
      selection.exemplar.exactSurface?.value,
    ];
    for (const text of texts) {
      const normalized = normalizeText(text).replace(
        /,\s*with\s+[A-Z][A-Za-z0-9_]*\((-?\d+)\)\s*=.+$/u,
        ".",
      );
      const rule = extractComputedResponseRule(normalized);
      if (rule) {
        return rule;
      }
    }
  }

  return undefined;
}

function normalizeArgumentLabel(value: string): string {
  return normalizeText(value)
    .replace(/[^A-Za-z0-9_]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .toLowerCase();
}

function genericPlaceholderForLabel(label: string | undefined): string {
  const normalized = normalizeArgumentLabel(label ?? "value");
  if (/(?:payload|packet|query|text|term|tag)/u.test(normalized)) {
    return "<terms>";
  }
  if (/(?:qty|quantity|count|amount|number)/u.test(normalized)) {
    return "<qty>";
  }
  if (/(?:path|file|filename)/u.test(normalized)) {
    return "<filename>";
  }
  if (/(?:item|name|label)/u.test(normalized)) {
    return "<item>";
  }
  if (/(?:id|key|token|query|value|term|record)/u.test(normalized)) {
    return "<id>";
  }

  return `<${normalized || "value"}>`;
}

function replaceQuotedObjectSlot(
  value: string,
  keys: string,
  placeholder: string,
): string {
  return value.replace(
    new RegExp(`(['"])(?:${keys})\\1\\s*:\\s*(['"])[^'"]+\\2`, "giu"),
    (entry) => entry.replace(/(['"])[^'"]+\1\s*$/u, `$1${placeholder}$1`),
  );
}

function sanitizeStructuredValue(
  value: string,
  label: string | undefined,
): string {
  const normalizedLabel = normalizeArgumentLabel(label ?? "");
  let sanitized = value;

  sanitized = replaceQuotedObjectSlot(
    sanitized,
    "query|value|term|terms|text|tag|tags|record",
    "<terms>",
  );
  sanitized = replaceQuotedObjectSlot(
    sanitized,
    "id|key|token",
    "<id>",
  );
  sanitized = replaceQuotedObjectSlot(
    sanitized,
    "path|file|filename",
    "<filename>",
  );
  sanitized = replaceQuotedObjectSlot(sanitized, "item|name|label", "<item>");
  sanitized = sanitized.replace(
    /(['"])(?:qty|quantity|count|amount|number)\1\s*:\s*\d+/giu,
    (entry) => entry.replace(/\d+$/u, "<qty>"),
  );

  const simpleQuoted = sanitized.match(/^(['"])([^'"]+)\1$/u);
  if (simpleQuoted) {
    const quote = simpleQuoted[1];
    const content = simpleQuoted[2] ?? "";
    if (/(?:auth|guard|mode|buffer)/u.test(normalizedLabel)) {
      return sanitized;
    }
    if (/(?:path|file|filename)/u.test(normalizedLabel) || /^(?:\/|~\/)/u.test(content)) {
      return `${quote}<filename>${quote}`;
    }
    if (/(?:qty|quantity|count|amount|number)/u.test(normalizedLabel)) {
      return "<qty>";
    }
    if (/(?:item|name|label)/u.test(normalizedLabel)) {
      return `${quote}<item>${quote}`;
    }
    if (/(?:payload|packet|query|text|term|terms|tag|tags|record)/u.test(normalizedLabel)) {
      return `${quote}<terms>${quote}`;
    }
    if (/(?:id|key|token)/u.test(normalizedLabel)) {
      return `${quote}<id>${quote}`;
    }
  }

  if (/^\d+$/u.test(sanitized) && /(?:qty|quantity|count|amount|number)/u.test(normalizedLabel)) {
    return "<qty>";
  }

  return sanitized;
}

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function extractVariableAuthTokenLiteral(
  raw: string,
  context: string,
): string | undefined {
  if (!/\b(?:auth|key|token)\b/iu.test(context)) {
    return undefined;
  }

  return [...raw.matchAll(/\b([A-Z][A-Z0-9_]*\d[A-Z0-9_]*)\b/gu)]
    .map((match) => match[1] ?? "")
    .filter((candidate) => candidate.length > 0)
    .sort((left, right) => right.length - left.length)[0];
}

function sanitizeRepeatedCommandToken(raw: string, context = ""): string {
  const variableToken = extractVariableAuthTokenLiteral(raw, context);
  if (variableToken) {
    return raw.replace(
      new RegExp(escapeRegExpLiteral(variableToken), "gu"),
      "<token>",
    );
  }

  const matches = [...raw.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/gu)].map(
    (match) => match[1] ?? "",
  );
  const repeatedToken = [...matches]
    .sort((left, right) => right.length - left.length)
    .find(
      (candidate, index, values) =>
        candidate.length > 0 &&
        values.indexOf(candidate) === index &&
        values.filter((entry) => entry === candidate).length >= 2,
    );
  if (!repeatedToken) {
    return raw;
  }

  return raw.replace(new RegExp(repeatedToken, "gu"), "<token>");
}

function extractComparisonTemplate(raw: string): string | undefined {
  const comparison = raw.match(
    /^(.+\|\s*FILTER\s+)([A-Za-z_][A-Za-z0-9_.-]*)\s*(>=|<=|=|>|<)\s*(?:-?\d+(?:\.\d+)?|'[^']+'|"[^"]+")$/u,
  );
  if (!comparison?.[1]) {
    return undefined;
  }

  return `${comparison[1]}<field> <operator> <value>`;
}

function sanitizePipeCommandTemplate(raw: string, context: string): string {
  if (!/^[^\s]+\s+\|[^|]+\|(?:\|[^|]+\|)*$/u.test(raw)) {
    return raw;
  }

  const placeholder = /\bpipe\s+path\b/iu.test(context) ? "|path|" : "|folder|";
  return raw.replace(/\|[^|]+\|(?:\|[^|]+\|)*/u, placeholder);
}

function extractRequiredArgumentOrder(move: string): string[] {
  const order =
    move.match(
      /\b(?:required\s+)?(?:argument\s+)?order\s*(?:is|:)\s*([^.;]+)/iu,
    )?.[1] ??
    move.match(/\border\s+is\s+[^:.;]*:\s*([^.;]+)/iu)?.[1] ??
    move.match(
      /\b((?:destination|target|archive|source|owner|permissions?|perms?|mode|flags?|compression|tag|query_payload|data_packet|preface|buffer|auth)(?:\s+(?:first|second|third|fourth|last|finally))?(?:(?:\s*,?\s*(?:then|and finally|finally|,)\s*)(?:destination|target|archive|source|owner|permissions?|perms?|mode|flags?|compression|tag|query_payload|data_packet|preface|buffer|auth)(?:\s+(?:first|second|third|fourth|last|finally))?)+)/iu,
    )?.[1];
  if (!order) {
    return [];
  }

  return order
    .split(/\s*(?:,|>|then|and finally|finally|before)\s*/iu)
    .map((entry) =>
      normalizeArgumentLabel(
        entry.replace(/\b(?:first|second|third|fourth|fifth|last|finally)\b/giu, ""),
      ),
    )
    .filter(Boolean);
}

function sanitizeCommandCallTemplate(raw: string, context: string): string {
  const comparisonTemplate = extractComparisonTemplate(raw);
  if (comparisonTemplate) {
    return comparisonTemplate;
  }

  const call = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/u);
  if (!call) {
    return sanitizeRepeatedCommandToken(
      sanitizePipeCommandTemplate(raw, context),
      context,
    );
  }

  const [, commandName, argBody = ""] = call;
  const args = splitTopLevelCallArguments(argBody);
  const orderedArgs = extractRequiredArgumentOrder(context);
  if (
    orderedArgs.length === args.length &&
    orderedArgs.length > 0 &&
    args.every((arg) => !/^[A-Za-z_][A-Za-z0-9_]*\s*=/u.test(arg))
  ) {
    return `${commandName}(${orderedArgs.join(", ")})`;
  }
  const argsAreQuotedPaths =
    args.length === 2 && args.every((arg) => /^['"](?:~\/|\/)[^'"]+['"]$/u.test(arg));
  const firstPathArg = args[0]?.replace(/^['"]|['"]$/gu, "") ?? "";
  const secondPathArg = args[1]?.replace(/^['"]|['"]$/gu, "") ?? "";
  const firstLooksDestination = /(?:^|\/)(?:dest|destination|target)(?:\/|$)/iu.test(
    firstPathArg,
  );
  const secondLooksSource = /(?:^|\/)(?:src|source)(?:\/|$)/iu.test(secondPathArg);
  if (
    argsAreQuotedPaths &&
    /\b(?:destination|target|archive)(?:\s+[A-Za-z0-9_-]+){0,3}\s+first\b/iu.test(context) &&
    /\bsource(?:\s+[A-Za-z0-9_-]+){0,3}\s+second\b/iu.test(context)
  ) {
    return `${commandName}(destination_path, source_path)`;
  }
  if (
    argsAreQuotedPaths &&
    /\bdestination\b/iu.test(context) &&
    /\bsource\b/iu.test(context) &&
    firstLooksDestination &&
    secondLooksSource
  ) {
    return `${commandName}(destination_path, source_path)`;
  }
  if (
    argsAreQuotedPaths &&
    /\bsource(?:\s+[A-Za-z0-9_-]+){0,3}\s+first\b/iu.test(context) &&
    /\b(?:destination|target|archive)(?:\s+[A-Za-z0-9_-]+){0,3}\s+second\b/iu.test(context)
  ) {
    return `${commandName}(source_path, destination_path)`;
  }

  const sanitizedArgs = args.map((arg) => {
    const named = arg.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=(.+)$/u);
    if (!named) {
      return sanitizeStructuredValue(arg, undefined);
    }
    const label = named[1]!;
    return `${label}=${sanitizeStructuredValue(named[2]!.trim(), label)}`;
  });

  return sanitizeRepeatedCommandToken(
    `${commandName}(${sanitizedArgs.join(", ")})`,
    context,
  );
}

function extractCommandLikeTemplate(
  text: string,
  commandName: string | undefined,
): string | undefined {
  const escapedName = commandName?.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const callPatterns = escapedName
    ? [
        new RegExp(`\\b${escapedName}\\((?:[^()]|\\([^)]*\\))*\\)`, "u"),
        new RegExp(`["'\`](${escapedName}\\s+\\|[^"'\`]+\\|)["'\`]`, "u"),
      ]
    : [
        /\b[A-Za-z_][A-Za-z0-9_]*\((?:[^()]|\([^)]*\))*\)/u,
        /["'`]([A-Za-z_][A-Za-z0-9_]*\s+\|[^"'`]+\|)["'`]/u,
      ];

  for (const pattern of callPatterns) {
    const match = text.match(pattern);
    const raw = match?.[1] ?? match?.[0];
    if (raw) {
      return sanitizeCommandCallTemplate(raw.trim(), text);
    }
  }

  return undefined;
}

function buildArgumentTemplateFromLabel(label: string): string {
  if (/(?:source|destination|target|archive).*path|path.*(?:source|destination|target|archive)/u.test(label)) {
    return label;
  }
  if (/(?:path|file|filename)/u.test(label)) {
    return `${label}='<filename>'`;
  }
  if (/(?:payload|packet|query|record|value|term|text|tag)/u.test(label)) {
    return `${label}={'value': '<terms>'}`;
  }
  if (/(?:id|key|token)/u.test(label)) {
    return `${label}={'value': '<id>'}`;
  }
  if (/(?:item|name|label)/u.test(label)) {
    return `${label}='<item>'`;
  }
  if (/(?:qty|quantity|count|amount|number)/u.test(label)) {
    return `${label}=<qty>`;
  }

  const placeholder = genericPlaceholderForLabel(label);
  return `${label}=${placeholder}`;
}

function deriveOrderTemplateFromMove(input: {
  commandName?: string;
  move: string;
}): string | undefined {
  if (!input.commandName) {
    return undefined;
  }

  if (
    /\b(?:destination|target|archive)(?:\s+[A-Za-z0-9_-]+){0,3}\s+first\b/iu.test(input.move) &&
    /\bsource(?:\s+[A-Za-z0-9_-]+){0,3}\s+second\b/iu.test(input.move)
  ) {
    return `${input.commandName}(destination_path, source_path)`;
  }
  if (
    /\bsource(?:\s+[A-Za-z0-9_-]+){0,3}\s+first\b/iu.test(input.move) &&
    /\b(?:destination|target|archive)(?:\s+[A-Za-z0-9_-]+){0,3}\s+second\b/iu.test(input.move)
  ) {
    return `${input.commandName}(source_path, destination_path)`;
  }

  const orderedArgs = extractRequiredArgumentOrder(input.move);
  if (orderedArgs.length === 0) {
    return undefined;
  }

  return `${input.commandName}(${orderedArgs.map(buildArgumentTemplateFromLabel).join(", ")})`;
}

function deriveCanonicalActionTemplate(input: {
  queryIntent: RawQueryIntent;
  selections: readonly RawBehavioralCarryoverSelection[];
  surfaceFamily: RawBehavioralSurfaceFamily;
}): string | undefined {
  if (input.surfaceFamily !== "host_action") {
    return undefined;
  }

  const topExemplar = input.selections[0]?.exemplar;
  const templateExemplar =
    input.selections.find((selection) => selection.exemplar.exactSurface?.kind === "action")
      ?.exemplar;
  const commandName =
    templateExemplar?.intentCue.query.exactSlots.commandName ??
    topExemplar?.intentCue.query.exactSlots.commandName ??
    input.queryIntent.exactSlots.commandName;
  const move = normalizeText(
    templateExemplar?.episodeShape.safeCorrectedMove ??
      templateExemplar?.episodeShape.relevantPriorMove ??
      topExemplar?.episodeShape.safeCorrectedMove ??
      topExemplar?.episodeShape.relevantPriorMove,
  );
  const templateExactSurface =
    templateExemplar?.exactSurface?.kind === "action"
      ? templateExemplar.exactSurface.value
      : undefined;

  if (templateExactSurface) {
    return sanitizeCommandCallTemplate(templateExactSurface, move);
  }

  const commandTemplate = extractCommandLikeTemplate(move, commandName);
  if (commandTemplate) {
    return commandTemplate;
  }

  return deriveOrderTemplateFromMove({ commandName, move });
}

export function buildRawTaskHypothesis(
  input: BuildRawTaskHypothesisInput,
): RawTaskHypothesis | undefined {
  if (input.selections.length === 0) {
    return undefined;
  }

  const supportingPrototypeIds = uniqueStrings(
    input.selections.map((selection) => selection.prototypeId),
  );
  const supportingExemplarIds = uniqueStrings(
    input.selections.map((selection) => selection.exemplar.id),
  );
  const computedResponseRule = deriveComputedResponseRule(input.selections);
  const mappingType = classifyMappingType({
    queryIntent: input.queryIntent,
    selections: input.selections,
    surfaceFamily: input.surfaceFamily,
  });
  const canonicalActionTemplate = deriveCanonicalActionTemplate({
    queryIntent: input.queryIntent,
    selections: input.selections,
    surfaceFamily: input.surfaceFamily,
  });
  const averageProbability =
    input.selections.reduce((total, selection) => total + selection.probability, 0) /
    input.selections.length;
  const conflictPenalty = Math.min(0.22, input.conflictPrototypeIds.length * 0.06);
  const confidence = clamp(averageProbability - conflictPenalty, 0, 0.99);
  const deterministicHostAction =
    input.surfaceFamily === "host_action" && Boolean(canonicalActionTemplate);
  const executionMode: RawTaskHypothesisExecutionMode =
    confidence < 0.58
      ? "abstain"
      : deterministicHostAction
        ? "transient_executor"
        : mappingType === "exact_surface_copy"
        ? "model_only"
        : confidence >= 0.66
          ? "transient_executor"
          : "model_only";
  const topExemplar = input.selections[0]?.exemplar;

  return {
    applicability: clipText(input.queryIntent.goal, 96),
    canonicalActionTemplate,
    commandName:
      input.queryIntent.exactSlots.commandName ??
      topExemplar?.intentCue.query.exactSlots.commandName,
    confidence,
    conflictingPrototypeIds: [...input.conflictPrototypeIds],
    constraintTypes: uniqueStrings([
      ...input.queryIntent.constraintTypes,
      ...input.selections.flatMap(
        (selection) => selection.exemplar.intentCue.query.constraintTypes,
      ),
    ]) as RawCarryoverConstraintType[],
    computedResponseRule,
    executionMode,
    mappingType,
    stableFields: buildStableFields({
      computedResponseRule,
      queryIntent: input.queryIntent,
      selections: input.selections,
    }),
    supportingExemplarIds,
    supportingPrototypeIds,
    surfaceFamily: input.surfaceFamily,
    taskFamily: input.queryIntent.actionType,
    varyingFields: buildVaryingFields(input.queryIntent),
  };
}

export function executeRawTaskHypothesis(input: {
  hypothesis: RawTaskHypothesis | undefined;
  query: string;
}): {
  computedResponse?: string;
  lines: string[];
  mode: "computed" | "hint" | "none";
} {
  const hypothesis = input.hypothesis;
  if (!hypothesis || hypothesis.executionMode !== "transient_executor") {
    return { lines: [], mode: "none" };
  }

  switch (hypothesis.mappingType) {
    case "symbolic_rule_execution":
    case "symbolic_formula": {
      const computedResponse = evaluateComputedResponseRule({
        query: input.query,
        rule: hypothesis.computedResponseRule,
      });
      if (!computedResponse) {
        return {
          lines: [
            "Use the observed formula pattern and substitute the current probe values before answering.",
          ],
          mode: "hint",
        };
      }
      return {
        computedResponse,
        lines: [`Probe-specific computed value: ${computedResponse}`],
        mode: "computed",
      };
    }
    case "slot_rebinding": {
      if (hypothesis.surfaceFamily === "host_action" && hypothesis.canonicalActionTemplate) {
        const recovered = recoverCanonicalActionFromTemplate({
          query: input.query,
          template: hypothesis.canonicalActionTemplate,
        });
        if (recovered) {
          return {
            computedResponse: recovered,
            lines: [`Emit exactly: ${recovered}`],
            mode: "computed",
          };
        }
      }
      const lines = [
        hypothesis.commandName
          ? `Keep the command or tool surface as ${hypothesis.commandName}.`
          : "",
        hypothesis.stableFields.find((field) => field.startsWith("arg_order="))
          ? `Preserve ${hypothesis.stableFields
              .find((field) => field.startsWith("arg_order="))
              ?.replace("arg_order=", "argument order ")}.`
          : "",
        "Rebind only the probe-specific slot values; do not invent a different action family.",
      ].filter(Boolean);
      return {
        lines,
        mode: lines.length > 0 ? "hint" : "none",
      };
    }
    case "hard_constraint_contract":
      return {
        lines: [
          "Apply the observed hard response contract directly to the answer surface.",
          "Prefer the safe replacement or constrained path/protocol over the failed surface.",
        ],
        mode: "hint",
      };
    case "exact_format_contract":
      return {
        lines: [
          "Preserve the observed exact format, required prefix/suffix, voice, and ordering.",
        ],
        mode: "hint",
      };
    case "style_contract":
      return {
        lines: ["Keep the response inside the observed style contract for this probe."],
        mode: "hint",
      };
    case "conditional_precondition":
    case "guarded_decision":
      return {
        lines: [
          "Check the precondition implied by the prior examples before proceeding.",
          "If the precondition is not satisfied, fall back to a warning or defer instead of pretending success.",
        ],
        mode: "hint",
      };
    case "exact_surface_copy":
      if (hypothesis.surfaceFamily === "host_action" && hypothesis.canonicalActionTemplate) {
        const recovered = recoverCanonicalActionFromTemplate({
          query: input.query,
          template: hypothesis.canonicalActionTemplate,
        });
        if (recovered) {
          return {
            computedResponse: recovered,
            lines: [`Emit exactly: ${recovered}`],
            mode: "computed",
          };
        }
      }
      return {
        lines: ["Keep the same exact surface family, only adapting the probe-specific slots when necessary."],
        mode: "hint",
      };
  }
}

export function renderRawTaskHypothesisSketch(input: {
  execution: ReturnType<typeof executeRawTaskHypothesis>;
  hypothesis: RawTaskHypothesis | undefined;
}): string | undefined {
  const hypothesis = input.hypothesis;
  if (!hypothesis) {
    return undefined;
  }

  const sections: string[] = [];
  if (hypothesis.stableFields.length > 0) {
    sections.push(
      [
        "Observed stable pattern:",
        ...hypothesis.stableFields.slice(0, 4).map((field) => `- ${field}`),
      ].join("\n"),
    );
  }
  if (hypothesis.varyingFields.length > 0) {
    sections.push(
      [
        "Probe-specific varying slots:",
        ...hypothesis.varyingFields.slice(0, 4).map((field) => `- ${field}`),
      ].join("\n"),
    );
  }
  if (input.execution.lines.length > 0) {
    sections.push(
      ["Probe-conditioned execution:", ...input.execution.lines.map((line) => `- ${line}`)].join(
        "\n",
      ),
    );
  }

  return sections.length > 0 ? sections.join("\n") : undefined;
}
