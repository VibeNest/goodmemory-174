import type { EpisodeMemory } from "../domain/records";
import type {
  ExperienceRecord,
  SessionArchive,
} from "./contracts";
import type {
  RecallCandidateTrace,
  RecallHit,
} from "../recall/engine";
import {
  type TextResponseEnactmentOperation,
  type TextResponseEnactmentPlan,
  buildStructuredTextResponseControlLines,
  deriveRuleBehavioralPolicy,
  resolveTextResponseEnactmentPlanFromPolicies,
  splitTopLevelCallArguments,
} from "./behavioralPolicy";
import {
  formatBehavioralFirstAction,
  parseToolOutcomeMetadata,
} from "./behavioralTelemetry";
import {
  scoreRawCarryoverReranker,
  trainRawCarryoverReranker,
  type RawCarryoverRerankerModel,
  type RawCarryoverTrainingSample,
} from "./rawCarryoverTraining";
import {
  buildRawTaskHypothesis,
  type RawTaskHypothesis,
} from "./rawTaskHypothesis";
import { executeProbeConditionedRawCarryover } from "./rawTransientExecutor";

export type RawBehavioralRerankerModel = RawCarryoverRerankerModel;

export type RawBehavioralSurfaceFamily = "host_action" | "text_response";
export type RawBehavioralTransferMode = "episodic_only" | "prototype_bounded";
export type RawBehavioralExemplarSource =
  | "archive"
  | "episode"
  | "runtime_buffer"
  | "tool_outcome";

export type RawCarryoverAbstainReason =
  | "ambiguous_top2"
  | "below_threshold"
  | "executor_unsafe"
  | "hypothesis_missing"
  | "no_candidates"
  | "support_conflict";

export type RawCarryoverConstraintType =
  | "analogy"
  | "arg_order"
  | "exact_action"
  | "formula"
  | "path_root"
  | "precondition"
  | "safe_alternative"
  | "style"
  | "url_shape";

export interface RawQueryIntent {
  actionType: string;
  constraintTypes: RawCarryoverConstraintType[];
  entityTypes: string[];
  exactSlots: {
    argNames: string[];
    argOrderSignature?: string;
    commandName?: string;
    extension?: string;
    filename?: string;
    operatorSymbols: string[];
    pathRoot?: string;
    styleMarkers: string[];
    urlHost?: string;
    urlPath?: string;
  };
  goal: string;
  goalTokens: string[];
  requestedSurface: RawBehavioralSurfaceFamily;
}

export interface RawCarryoverPacket {
  computedResponse?: string;
  hypothesisSketch?: string;
  promptPayload: string;
  retrievalText: string;
  textResponsePlan?: TextResponseEnactmentPlan;
}

export interface RawSupportConflictView {
  conflictPrototypeIds: string[];
  supportPrototypeIds: string[];
}

interface RawIntentCue {
  query: RawQueryIntent;
}

interface RawEpisodeShape {
  cue: string;
  observedOutcome: string;
  relevantPriorMove: string;
  safeCorrectedMove?: string;
}

interface RawExactSurface {
  args?: string[];
  formatPrefixes?: string[];
  formatSuffixes?: string[];
  kind: "action" | "format" | "path" | "text" | "url";
  value: string;
}

export interface RawBehavioralExemplar {
  confidence: number;
  createdAt?: string;
  episodeShape: RawEpisodeShape;
  exactSurface?: RawExactSurface;
  id: string;
  intentCue: RawIntentCue;
  interferenceTags: string[];
  retrievalText: string;
  scope: {
    agentId?: string;
    tenantId?: string;
    userId?: string;
    workspaceId?: string;
  };
  source: RawBehavioralExemplarSource;
  sourceIds: string[];
  surfaceFamily: RawBehavioralSurfaceFamily;
  transferMode: RawBehavioralTransferMode;
}

export interface RawBehavioralPrototype {
  confidence: number;
  constraintTypes: RawCarryoverConstraintType[];
  exactSlotSignature: string;
  exemplars: RawBehavioralExemplar[];
  exactSurface?: RawExactSurface;
  hardNegativeIds: string[];
  id: string;
  intentCue: RawIntentCue;
  interferenceTags: string[];
  representative: RawBehavioralExemplar;
  repetitionSupport: number;
  successSupport: number;
  surfaceFamily: RawBehavioralSurfaceFamily;
  transferMode: RawBehavioralTransferMode;
}

export interface RawBehavioralInterferenceEntry {
  conflictingPrototypeId: string;
  penalty: number;
  prototypeId: string;
  reason:
    | "correction_conflict"
    | "exact_surface_conflict"
    | "intent_conflict";
}

export interface RawBehavioralPrototypeIndex {
  exemplars: RawBehavioralExemplar[];
  hardNegativePairs: Array<{
    leftPrototypeId: string;
    reason: "exact_surface_conflict" | "intent_conflict";
    rightPrototypeId: string;
  }>;
  interferenceLedger: RawBehavioralInterferenceEntry[];
  model: RawBehavioralRerankerModel;
  prototypes: RawBehavioralPrototype[];
  recallHints?: BuildRawBehavioralPrototypeIndexInput["recallHints"];
}

export interface RawBehavioralCarryoverSelection {
  exemplar: RawBehavioralExemplar;
  prototypeId: string;
  probability: number;
  score: number;
}

export interface RawCarryoverDiagnostic {
  abstainReason?: RawCarryoverAbstainReason;
  candidatePrototypeIds: string[];
  conflictPrototypeIds?: string[];
  hypothesis?: {
    confidence: number;
    executionMode: RawTaskHypothesis["executionMode"];
    mappingType: RawTaskHypothesis["mappingType"];
    supportingPrototypeIds: string[];
  };
  mode: "abstained" | "exemplar_only" | "fallback_context" | "none";
  selectedExemplarIds: string[];
  selectedPrototypeIds: string[];
  supportPrototypeIds?: string[];
  topProbability?: number;
  topScore?: number;
}

export interface RawCarryoverResolution {
  candidates: RawBehavioralCarryoverSelection[];
  debug: RawCarryoverDiagnostic;
  hypothesis?: RawTaskHypothesis;
  packet?: RawCarryoverPacket;
  selections: RawBehavioralCarryoverSelection[];
  supportConflict?: RawSupportConflictView;
}

interface RankingFeatures {
  correctionSuccessPrior: number;
  cueCompatibility: number;
  exactSurfaceMatch: number;
  exactSlotOverlap: number;
  interferenceRisk: number;
  intentCompatibility: number;
  lexicalSimilarity: number;
  recencySupport: number;
  semanticSimilarity: number;
  repetitionSupport: number;
  surfaceCompatibility: number;
}

interface RawProtocolReplacement {
  fromScheme: "http" | "https";
  host: string;
  toScheme: "http" | "https";
  toUrl: string;
}

interface RawPathReplacement {
  forbiddenRoot: string;
  safeAnchor: string;
  safeExample: string;
}

interface RawPreconditionContract {
  allowedWhen?: string[];
  fallbackInstruction: string;
  precondition: string;
  subject?: string;
}

export interface BuildRawBehavioralPrototypeIndexInput {
  memoryExport: {
    durable: {
      archives: readonly SessionArchive[];
      episodes: readonly EpisodeMemory[];
      experiences: readonly ExperienceRecord[];
    };
    scope: {
      agentId?: string;
      tenantId?: string;
      userId: string;
      workspaceId?: string;
    };
  };
  recallHints?: {
    candidateTraces?: readonly RecallCandidateTrace[];
    hits?: readonly RecallHit[];
  };
  runtimeMessages?: readonly { content: string; role: string }[];
  surfaceHint?: RawBehavioralSurfaceFamily;
  transientMessages?: readonly { content: string; role: string }[];
}

export interface SelectRawBehavioralExemplarsInput {
  index: RawBehavioralPrototypeIndex;
  maxExemplars?: number;
  query: string;
  surfaceFamily: RawBehavioralSurfaceFamily;
}

const DEFAULT_ABSTAIN_MARGIN = 0.08;
const DEFAULT_ABSTAIN_THRESHOLD = 0.58;
const DEFAULT_MODEL: RawBehavioralRerankerModel = {
  bias: -0.85,
  featureNames: [
    "lexicalSimilarity",
    "semanticSimilarity",
    "intentCompatibility",
    "surfaceCompatibility",
    "exactSlotOverlap",
    "exactSurfaceMatch",
    "correctionSuccessPrior",
    "interferenceRisk",
    "recencySupport",
    "repetitionSupport",
    "cueCompatibility",
  ],
  weights: [1.15, 0.95, 1.45, 0.7, 1.35, 1.1, 0.9, -1.2, 0.3, 0.5, 1.25],
};
const HARD_NEGATIVE_MIN_OVERLAP = 0.28;
const CORRECTION_ROUTE_MIN_CUE_OVERLAP = 0.1;
const CORRECTION_ROUTE_MIN_LEXICAL_OVERLAP = 0.05;
const LATENT_CUE_ROUTE_MIN_OVERLAP = 0.18;
const MAX_RENDERED_EXACT_SURFACE_LENGTH = 120;
const MAX_RENDERED_TEXT_LENGTH = 180;
const PROTOTYPE_MIN_CLUSTER_SIZE = 2;
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "do",
  "for",
  "from",
  "if",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "reply",
  "respond",
  "that",
  "the",
  "then",
  "this",
  "to",
  "use",
  "with",
  "you",
]);

function clipText(value: string, maxLength = MAX_RENDERED_TEXT_LENGTH): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[`"'“”‘’]/gu, "")
    .split(/[^a-z0-9_./:-]+/u)
    .map((token) => stripTrailingPunctuation(token.trim()))
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function extractQuoted(value: string): string | undefined {
  const match = value.match(/["“](.+?)["”]/u) ?? value.match(/'([^']+)'/u);
  return match?.[1]?.trim();
}

function lexicalOverlap(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right);
  const overlap = left.filter((token) => rightSet.has(token)).length;
  return overlap / Math.max(left.length, right.length);
}

function extractLatentCueKeys(value: string | undefined): string[] {
  const lower = normalizeText(value).toLowerCase();
  const keys: string[] = [];

  if (/\b(?:failed|failure|error|denied|deprecated|unsupported|timeout|timed out)\b/u.test(lower)) {
    keys.push("failure_signal");
  }
  if (/\bpermission denied\b|\bnot permitted\b|\bforbidden\b/u.test(lower)) {
    keys.push("permission_failure");
  }
  if (/\btimeout\b|\btimed out\b|\bslow\b/u.test(lower)) {
    keys.push("timeout_failure");
  }
  if (/\bdeprecated\b|\bunsafe\b|\buntrusted\b|\bunreliable\b/u.test(lower)) {
    keys.push("unsafe_or_deprecated");
  }
  if (/\b(?:instead|replacement|alternative|corrected|avoid|do not|don't|never|rather than)\b/u.test(lower)) {
    keys.push("inhibition_replacement");
  }
  if (/\b(?:safe|safer|backup|warn|warning|caution)\b/u.test(lower)) {
    keys.push("safe_fallback");
  }
  if (/\b(?:directory|folder|path|root|home-directory|subfolder)\b|(?:~\/|\/)[a-z0-9._/-]+/u.test(lower)) {
    keys.push("path_constraint");
  }
  if (/\b(?:api|endpoint|service|tool|command|function|utility)\b/u.test(lower)) {
    keys.push("operation_surface");
  }
  if (/\b(?:argument|parameter|order|first|second|prefix|suffix)\b/u.test(lower)) {
    keys.push("slot_order_contract");
  }
  if (/\b(?:http|https|url|link|protocol|subdomain|host)\b/u.test(lower)) {
    keys.push("url_protocol");
  }
  if (/\b(?:filetype|extension|json|csv|yaml|yml|txt|pdf|docx)\b/u.test(lower)) {
    keys.push("filetype_contract");
  }
  if (/\b(?:subject|signature|sign off|dear|regards|sincerely|opening|closing)\b/u.test(lower)) {
    keys.push("format_contract");
  }
  if (/\b(?:jargon|analogy|beginner|plain language|avoid the term)\b/u.test(lower)) {
    keys.push("style_simplification");
  }
  if (/\b(?:voice|pronoun|first-person|first person|character)\b/u.test(lower)) {
    keys.push("voice_contract");
  }
  if (/\b(?:formula|sequence|operator|omega|recurrence|compute|calculate)\b/u.test(lower)) {
    keys.push("symbolic_rule");
  }
  if (
    /\b(?:precondition|only proceed|defer)\b/u.test(lower) ||
    /\bcheck\b/u.test(lower) ||
    /\b(?:load|status|queue|gpu|memory|network|maintenance)\b.*\b(?:normal|idle|available|stable|complete)\b/u.test(
      lower,
    )
  ) {
    keys.push("precondition_contract");
  }
  if (/\b(?:brief|brevity|concise|one-line|one line|short)\b/u.test(lower)) {
    keys.push("brevity_contract");
  }

  return uniqueStrings(keys);
}

function queryIntentCueKeys(queryIntent: RawQueryIntent): string[] {
  return uniqueStrings([
    queryIntent.actionType,
    ...queryIntent.constraintTypes,
    ...queryIntent.entityTypes,
    ...extractLatentCueKeys(queryIntent.goal),
  ]);
}

function prototypeCueKeys(prototype: RawBehavioralPrototype): string[] {
  const representative = prototype.representative;
  return uniqueStrings([
    prototype.intentCue.query.actionType,
    ...prototype.constraintTypes,
    ...prototype.intentCue.query.entityTypes,
    ...prototype.interferenceTags,
    ...extractLatentCueKeys(representative.retrievalText),
    ...extractLatentCueKeys(representative.episodeShape.cue),
    ...extractLatentCueKeys(representative.episodeShape.observedOutcome),
    ...extractLatentCueKeys(representative.episodeShape.relevantPriorMove),
    ...extractLatentCueKeys(representative.episodeShape.safeCorrectedMove),
  ]);
}

function latentCueCompatibility(
  queryIntent: RawQueryIntent,
  prototype: RawBehavioralPrototype,
): number {
  return lexicalOverlap(queryIntentCueKeys(queryIntent), prototypeCueKeys(prototype));
}

function extractHostActionCommandName(value: string): string | undefined {
  const normalized = normalizeText(value);
  return (
    normalized.match(/\b([A-Za-z_][A-Za-z0-9_@]*)\s*\(/u)?.[1] ??
    normalized.match(/\b([A-Za-z_][A-Za-z0-9_@]*)\s+\|[^|]+\|/u)?.[1] ??
    normalized.match(/\b([A-Z][A-Z0-9_]*)\s+[A-Za-z0-9_]+\s+\|/u)?.[1] ??
    normalized.match(
      /\b(?:API|tool|command|function)\s+name:\s*([A-Za-z_][A-Za-z0-9_@]*)\b/iu,
    )?.[1] ??
    normalized.match(
      /\b([A-Za-z_][A-Za-z0-9_@]*)\s+(?:takes|uses|requires|accepts)\b/iu,
    )?.[1] ??
    normalized.match(
      /\b(?:use|run|call|invoke|execute)\s+([A-Za-z_][A-Za-z0-9_@]*)\s+(?:with|for|to|instead|first|when|if|or)\b/iu,
    )?.[1]
  );
}

function extractCommandLikeSurface(value: string): string | undefined {
  const normalized = normalizeText(value);
  const actionLike =
    normalized.match(/\b([A-Za-z_][A-Za-z0-9_@]*)\([^)]*\)/u)?.[0] ??
    normalized.match(/\b([A-Za-z_][A-Za-z0-9_@]*)\s+\|[^|]+\|/u)?.[0] ??
    normalized.match(/\b[A-Z][A-Z0-9_]*\s+[A-Za-z0-9_]+\s+\|\s+[A-Z][A-Z0-9_]*\s+[^.]+/u)?.[0] ??
    normalized.match(/['"`]([A-Za-z_][A-Za-z0-9_@]*(?:\s+[A-Za-z0-9_./<>{}\[\]'":,@|=-]+){0,8})['"`]/u)?.[1];
  return actionLike ? stripTrailingPunctuation(actionLike.trim()) : undefined;
}

function inferActionType(value: string): string {
  const lower = normalizeText(value).toLowerCase();
  if (
    extractHostActionCommandName(value) ||
    /\brequired argument order\b|\bdestination first\b|\bsource second\b|\bpipe-wrapped\b|\blogiql syntax\b|\bexact logiql command\b/u.test(
      lower,
    )
  ) {
    return "structured_action";
  }
  if (
    /\b[A-Z][A-Za-z0-9_]*\((-?\d+)\)/u.test(value) &&
    (/\bwhat is\b|\bcompute\b|\bcalculate\b|\bvalue\b/iu.test(value) ||
      /=/u.test(value))
  ) {
    return "symbolic_rule";
  }
  if (
    /\banalogy\b|\bjargon\b|\bavoid the term\b|\bavoid using\b|\bbeginner\b/u.test(
      lower,
    )
  ) {
    return "analogy_explanation";
  }
  if (
    /\bcheck\b[^.]*\bload\b|\bonly proceed\b|\bdefer\b|\b(?:load|status|queue|gpu|memory|network|maintenance)\b.*\b(?:normal|idle|available|stable|complete)\b/u.test(
      lower,
    )
  ) {
    return "guarded_api";
  }
  if (/\buse\b[^.]*\b[a-z0-9_]*api\b/u.test(lower)) {
    return "guarded_api";
  }
  if (/\bhttps?\b|\burl\b|\blink\b/.test(lower)) {
    return "url_rewrite";
  }
  if (/\bcopy\b|\barchive\b|\bsync\b|\bquery\b|\btool\b|\bcommand\b|\bfunction\b/.test(lower)) {
    return "structured_action";
  }
  if (/\bnavigate\b|\bfolder\b|\bsubfolder\b|\bdirectory\b/.test(lower)) {
    return "path_redirect";
  }
  if (/\bpath\b|\bdirectory\b|\/[a-z0-9._/-]+/u.test(lower)) {
    return "path_redirect";
  }
  if (/\b[a-z0-9_]*api\b|\bendpoint\b|\bservice\b/.test(lower)) {
    return "api_route";
  }
  if (
    /\bsubject\b|\bsign(?:ed|ature| off)?\b|\bdear\b|\bregards\b|\bsincerely\b/.test(lower) ||
    /\b(?:compose|draft|formal|notice|email|memo|letter)\b/.test(lower)
  ) {
    return "format_contract";
  }
  if (/\bformula\b|\bsequence\b|\boperator\b|\bcompute\b/.test(lower)) {
    return "symbolic_rule";
  }
  if (/\bvoice\b|\bfirst-person\b|\bpronoun\b/.test(lower)) {
    return "voice_style";
  }

  return "general_response";
}

function inferEntityTypes(value: string): string[] {
  const lower = normalizeText(value).toLowerCase();
  const entities: string[] = [];
  if (/\b[A-Z][A-Za-z0-9_]*\((-?\d+)\)/u.test(value)) {
    entities.push("symbolic");
  }
  if (/\bhttps?\b|\burl\b|\blink\b/.test(lower)) {
    entities.push("url");
  }
  if (extractHostActionCommandName(value) || /\bpipe-wrapped\b|\blogiql\b/u.test(lower)) {
    entities.push("command");
  }
  if (/\bcopy\b|\barchive\b|\bsync\b|\btool\b|\butility\b|\bcommand\b/u.test(lower)) {
    entities.push("command");
  }
  if (/\bfolder\b|\bsubfolder\b|\bdirectory\b/u.test(lower)) {
    entities.push("path");
  }
  if (/\bpath\b|\bdirectory\b|\/[a-z0-9._/-]+/u.test(lower)) {
    entities.push("path");
  }
  if (/\b[a-z0-9_]*api\b|\bendpoint\b|\bservice\b/.test(lower)) {
    entities.push("api");
  }
  if (/\banalogy\b|\bjargon\b|\bbeginner\b|\bconcept\b/.test(lower)) {
    entities.push("analogy");
  }
  if (
    /\bsubject\b|\bsign(?:ed|ature| off)?\b|\bdear\b|\bregards\b|\bsincerely\b/.test(lower) ||
    /\b(?:compose|draft|formal|notice|email|memo|letter)\b/.test(lower)
  ) {
    entities.push("format");
  }
  if (/\bquery\b|\blogiql\b|\bsql\b/.test(lower)) {
    entities.push("query");
  }
  if (/\bsequence\b|\bformula\b|\boperator\b|\bomega\b/.test(lower)) {
    entities.push("symbolic");
  }
  if (/\bvoice\b|\bpronoun\b/.test(lower)) {
    entities.push("voice");
  }
  return uniqueStrings(entities);
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:!?。]+$/u, "");
}

function extractUrls(value: string | undefined): string[] {
  return [
    ...normalizeText(value).matchAll(/https?:\/\/[^\s),;]+/gu),
  ]
    .map((match) => stripTrailingPunctuation(match[0] ?? ""))
    .filter((entry) => entry.length > 0);
}

function extractPaths(value: string | undefined): string[] {
  return [
    ...normalizeText(value).matchAll(/(?:~\/|\/)[A-Za-z0-9._/-]*[A-Za-z0-9._-]/gu),
  ]
    .map((match) => stripTrailingPunctuation(match[0] ?? ""))
    .filter((entry) => entry.length > 0);
}

function parsePathRoot(path: string): string | undefined {
  const normalized = stripTrailingPunctuation(path.trim());
  if (!normalized.startsWith("/")) {
    return undefined;
  }

  const segments = normalized.split("/").filter(Boolean);
  return segments[0] ? `/${segments[0]}` : undefined;
}

function directoryAnchorFromPath(path: string): string | undefined {
  const normalized = stripTrailingPunctuation(path.trim());
  if (!normalized.startsWith("/") && !normalized.startsWith("~/")) {
    return undefined;
  }

  const slash = normalized.lastIndexOf("/");
  if (slash < 0) {
    return undefined;
  }

  return normalized.slice(0, slash + 1);
}

function parseFilename(path: string): string | undefined {
  const normalized = stripTrailingPunctuation(path.trim());
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1);
}

function parseExtension(path: string): string | undefined {
  const filename = parseFilename(path);
  if (!filename) {
    return undefined;
  }
  const dot = filename.lastIndexOf(".");
  return dot <= 0 ? undefined : filename.slice(dot);
}

function inferConstraintTypes(value: string): RawCarryoverConstraintType[] {
  const lower = normalizeText(value).toLowerCase();
  const constraints: RawCarryoverConstraintType[] = [];

  if (/\b[A-Z][A-Za-z0-9_]*\((-?\d+)\)/u.test(value)) {
    constraints.push("formula");
  }
  if (/\bhttps?\b|\bhost\b|\bpath\b|\bsubdomain\b/u.test(lower)) {
    constraints.push("url_shape");
  }
  if (/\bpath\b|\bdirectory\b|\broot\b|\/[a-z0-9._/-]+/u.test(lower)) {
    constraints.push("path_root");
  }
  if (/\bfolder\b|\bsubfolder\b/u.test(lower)) {
    constraints.push("path_root");
  }
  if (/\barg(?:ument)?\b|\border\b|\bparameter\b|\bprefix\b|\bsuffix\b/u.test(lower)) {
    constraints.push("arg_order");
  }
  if (/\bformula\b|\bsequence\b|\boperator\b|\bomega\b|\brecurrence\b/u.test(lower)) {
    constraints.push("formula");
  }
  if (/\bsafer?\b|\binstead\b|\bwarning\b|\bavoid\b/u.test(lower)) {
    constraints.push("safe_alternative");
  }
  if (/\banalogy\b|\bjargon\b|\bbeginner\b|\bavoid the term\b/u.test(lower)) {
    constraints.push("analogy");
  }
  if (
    /\bcheck\b[^.]*\bload\b|\bonly proceed\b|\bdefer\b|\b(?:load|status|queue|gpu|memory|network|maintenance)\b.*\b(?:normal|idle|available|stable|complete)\b/u.test(
      lower,
    )
  ) {
    constraints.push("precondition");
  }
  if (/\bvoice\b|\bfirst-person\b|\bpronoun\b/u.test(lower)) {
    constraints.push("style");
  }
  if (
    extractHostActionCommandName(value) ||
    /\brequired argument order\b|\bdestination first\b|\bsource second\b|\bpipe-wrapped\b|\blogiql syntax\b|\bexact logiql command\b/u.test(
      lower,
    )
  ) {
    constraints.push("exact_action");
  }
  if (/\bcopy\b|\barchive\b|\bsync\b|\bquery\b|\btool\b|\bcommand\b|\bfunction\b/u.test(lower)) {
    constraints.push("exact_action");
  }

  return uniqueStrings(constraints) as RawCarryoverConstraintType[];
}

function inferSurfaceFamily(value: string): RawBehavioralSurfaceFamily {
  const normalized = normalizeText(value);
  if (
    extractHostActionCommandName(normalized) ||
    /\b[a-z_][a-z0-9_]*\([^)]*\)/iu.test(normalized) ||
    looksLikeBareCommandSurface(normalized)
  ) {
    return "host_action";
  }

  return "text_response";
}

function looksLikeBareCommandSurface(value: string): boolean {
  const firstLine = value.split(/\r?\n/u)[0]?.trim() ?? "";
  if (!firstLine) {
    return false;
  }
  if (
    /^(?:a|an|can|could|dear|for|greetings|hello|here|hi|i|in|it|please|sure|the|this|to|you)\b/iu.test(
      firstLine,
    )
  ) {
    return false;
  }

  return /^(?:[a-z][a-z0-9_.@-]*|[A-Z][A-Z0-9_]{1,})(?:\s+(?:-[A-Za-z0-9-]+|\+\S+|\.|~?\/\S+|[A-Za-z0-9._/-]+\.[A-Za-z0-9]{1,8}|[A-Za-z0-9_@-]+=[^\s]+|'[^']+'|"[^"]+"|\|[^|]+\||[a-z0-9_@-]+)){1,8}$/u.test(
    firstLine,
  );
}

function parseExactSlots(
  value: string,
  surfaceFamily: RawBehavioralSurfaceFamily,
): RawQueryIntent["exactSlots"] {
  const normalized = normalizeText(value);
  const url = normalized.match(/https?:\/\/([^\s/]+)(\/[^\s)]*)?/u);
  const path = normalized.match(/(?:~\/|\/)[A-Za-z0-9._/-]+/u)?.[0];
  const actionMatch = normalized.match(/\b([A-Za-z_][A-Za-z0-9_]*)\((.+)\)/u);
  const argEntries = actionMatch?.[2]
    ? splitTopLevelCallArguments(actionMatch[2]).map((entry) => entry.trim())
    : [];
  const argNames = argEntries
    .map((entry) => entry.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/u)?.[1] ?? "")
    .filter(Boolean);
  const operatorSymbols = [...normalized.matchAll(/[⊗⊕⊖⊙]|->|=>|[+*=-]/gu)]
    .map((match) => match[0])
    .filter((token, index, values) => values.indexOf(token) === index);
  const styleMarkers = [
    /\bI\b/u.test(normalized) ? "first_person_i" : "",
    /\bme\b/u.test(normalized) ? "first_person_me" : "",
    /\bmy\b/u.test(normalized) ? "first_person_my" : "",
  ].filter(Boolean);

  return {
    argNames,
    argOrderSignature: argNames.length > 0 ? argNames.join(">") : undefined,
    commandName:
      surfaceFamily === "host_action"
        ? actionMatch?.[1] ?? extractHostActionCommandName(normalized)
        : undefined,
    extension: path ? parseExtension(path) : undefined,
    filename: path ? parseFilename(path) : undefined,
    operatorSymbols,
    pathRoot: path ? parsePathRoot(path) : undefined,
    styleMarkers,
    urlHost: url?.[1],
    urlPath: url?.[2],
  };
}

function buildExactSlotSignature(
  exactSlots: RawQueryIntent["exactSlots"],
): string {
  return [
    exactSlots.commandName ?? "",
    exactSlots.argOrderSignature ?? "",
    exactSlots.urlHost ?? "",
    exactSlots.urlPath ?? "",
    exactSlots.pathRoot ?? "",
    exactSlots.filename ?? "",
    exactSlots.extension ?? "",
    exactSlots.operatorSymbols.join(","),
    exactSlots.styleMarkers.join(","),
  ].join("\u0002");
}

function extractTextExactSurface(value: string): RawExactSurface | undefined {
  const normalized = normalizeText(value);
  if (!normalized) {
    return undefined;
  }

  const actionMatch = normalized.match(/\b([A-Za-z_][A-Za-z0-9_]*)\((.+)\)/u);
  if (actionMatch?.[0]) {
    const args = splitTopLevelCallArguments(actionMatch[2])
      .map((entry) => entry.trim())
      .filter(Boolean);
    return {
      kind: "action",
      value: clipText(actionMatch[0], MAX_RENDERED_EXACT_SURFACE_LENGTH),
      ...(args && args.length > 0 ? { args } : {}),
    };
  }

  const commandLikeSurface = extractCommandLikeSurface(normalized);
  if (commandLikeSurface) {
    return {
      kind:
        commandLikeSurface.includes("|") ||
        /\b[A-Z][A-Z0-9_]*\s+[A-Za-z0-9_]+\s+\|/u.test(commandLikeSurface) ||
        /\b[A-Za-z_][A-Za-z0-9_@]*\s+[A-Za-z0-9_./<>{}\[\]'":,@|=-]+/u.test(
          commandLikeSurface,
        )
          ? "action"
          : "text",
      value: clipText(commandLikeSurface, MAX_RENDERED_EXACT_SURFACE_LENGTH),
    };
  }

  const urlMatch = normalized.match(/https?:\/\/[^\s)]+/u);
  if (urlMatch?.[0]) {
    return {
      kind: "url",
      value: clipText(urlMatch[0], MAX_RENDERED_EXACT_SURFACE_LENGTH),
    };
  }

  const pathMatch = normalized.match(/(?:~\/|\/)[A-Za-z0-9._/-]+/u);
  if (pathMatch?.[0]) {
    return {
      kind: "path",
      value: clipText(pathMatch[0], MAX_RENDERED_EXACT_SURFACE_LENGTH),
    };
  }

  const formatPrefixes = [
    normalized.match(/^Subject:[^\n]*/iu)?.[0],
    normalized.match(/^Dear [^,\n]+,/iu)?.[0],
    normalized.match(/^Greetings,/iu)?.[0],
  ].filter((entry): entry is string => Boolean(entry));
  const formatSuffixes = [
    normalized.match(/Regards,[^]*$/iu)?.[0],
    normalized.match(/Sincerely,[^]*$/iu)?.[0],
  ].filter((entry): entry is string => Boolean(entry));
  if (formatPrefixes.length > 0 || formatSuffixes.length > 0) {
    return {
      formatPrefixes,
      formatSuffixes,
      kind: "format",
      value: clipText(
        [...formatPrefixes, ...formatSuffixes].join(" / "),
        MAX_RENDERED_EXACT_SURFACE_LENGTH,
      ),
    };
  }

  const quoted = extractQuoted(normalized);
  if (quoted) {
    return {
      kind: "text",
      value: clipText(quoted, MAX_RENDERED_EXACT_SURFACE_LENGTH),
    };
  }

  return undefined;
}

function createRawQueryIntent(
  query: string,
  surfaceFamily: RawBehavioralSurfaceFamily,
): RawQueryIntent {
  const normalized = normalizeText(query);
  return {
    actionType: inferActionType(query),
    constraintTypes: inferConstraintTypes(query),
    entityTypes: inferEntityTypes(query),
    exactSlots: parseExactSlots(query, surfaceFamily),
    goal: clipText(normalized, 96),
    goalTokens: tokenize(query).slice(0, 12),
    requestedSurface: surfaceFamily,
  };
}

function createIntentCue(
  query: string,
  surfaceFamily: RawBehavioralSurfaceFamily,
): RawIntentCue {
  return {
    query: createRawQueryIntent(query, surfaceFamily),
  };
}

function buildRetrievalText(input: {
  cue: string;
  exactSurface?: RawExactSurface;
  observedOutcome: string;
  safeCorrectedMove?: string;
  successfulMove: string;
}): string {
  return [
    `cue: ${clipText(input.cue)}`,
    `move: ${clipText(input.successfulMove)}`,
    `outcome: ${clipText(input.observedOutcome)}`,
    input.safeCorrectedMove
      ? `corrected: ${clipText(input.safeCorrectedMove)}`
      : undefined,
    input.exactSurface ? `surface: ${input.exactSurface.value}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildInterferenceTags(query: string, exactSurface?: RawExactSurface): string[] {
  const queryTokens = tokenize(query);
  const exactTokens = exactSurface ? tokenize(exactSurface.value) : [];
  const exactSet = new Set(exactTokens);

  return uniqueStrings(
    queryTokens.filter((token) =>
      token === "http" ||
      token === "https" ||
      token === "api" ||
      token === "analogy" ||
      token === "jargon" ||
      token === "load" ||
      token === "path" ||
      token === "directory" ||
      token === "subject" ||
      token === "signature" ||
      token === "prefix" ||
      token === "suffix" ||
      token === "query" ||
      token === "archive" ||
      token === "copy" ||
      token === "token" ||
      !exactSet.has(token)
    ),
  );
}

function scoreExemplarConfidence(input: {
  exactSurface?: RawExactSurface;
  hasCorrection?: boolean;
  source: RawBehavioralExemplarSource;
  successfulMove: string;
}): number {
  let score = input.source === "tool_outcome" ? 0.9 : input.source === "runtime_buffer" ? 0.8 : 0.55;
  if (input.exactSurface) {
    score += 0.1;
  }
  if (input.hasCorrection) {
    score += 0.08;
  }
  if (input.successfulMove.length >= 16) {
    score += 0.05;
  }

  return Math.min(0.98, score);
}

function createExemplar(input: {
  createdAt?: string;
  cue: string;
  exactSurface?: RawExactSurface;
  id: string;
  observedOutcome: string;
  safeCorrectedMove?: string;
  scope: RawBehavioralExemplar["scope"];
  source: RawBehavioralExemplarSource;
  sourceIds: string[];
  successfulMove: string;
  surfaceFamily: RawBehavioralSurfaceFamily;
}): RawBehavioralExemplar {
  const observedOutcome = clipText(input.observedOutcome);
  const relevantPriorMove = clipText(input.successfulMove);
  const safeCorrectedMove = input.safeCorrectedMove
    ? clipText(input.safeCorrectedMove)
    : undefined;
  const intentSeed = safeCorrectedMove
    ? `${input.cue} ${safeCorrectedMove}`
    : `${input.cue} ${input.successfulMove}`;
  const intentCue = createIntentCue(intentSeed, input.surfaceFamily);

  return {
    confidence: scoreExemplarConfidence({
      exactSurface: input.exactSurface,
      hasCorrection: Boolean(input.safeCorrectedMove),
      source: input.source,
      successfulMove: input.successfulMove,
    }),
    createdAt: input.createdAt,
    episodeShape: {
      cue: clipText(input.cue),
      observedOutcome,
      relevantPriorMove,
      ...(safeCorrectedMove ? { safeCorrectedMove } : {}),
    },
    exactSurface: input.exactSurface,
    id: input.id,
    intentCue,
    interferenceTags: buildInterferenceTags(intentSeed, input.exactSurface),
    retrievalText: buildRetrievalText({
      cue: input.cue,
      exactSurface: input.exactSurface,
      observedOutcome,
      safeCorrectedMove,
      successfulMove: relevantPriorMove,
    }),
    scope: input.scope,
    source: input.source,
    sourceIds: uniqueStrings(input.sourceIds),
    surfaceFamily: input.surfaceFamily,
    transferMode: "episodic_only",
  };
}

function parseSystemFailure(content: string): string | undefined {
  const normalized = normalizeText(content);
  const taggedMatch = normalized.match(
    /^(?:tool\s+)?(?:outcome|failure)\s*:\s*(.+)$/iu,
  );
  if (taggedMatch?.[1]) {
    return taggedMatch[1].trim();
  }
  if (/^success\s*:/iu.test(normalized)) {
    return undefined;
  }
  if (
    /\b(?:alert|deleted|denied|deprecated|empty result|error|exceeded|failed|failure|lost|not helpful|overwritten|permission denied|removed|reset|timed out|timeout|truncated|unsupported|warning)\b/iu.test(
      normalized,
    )
  ) {
    return normalized;
  }
  if (
    /\b(?:busy|capacity|congested|locked|maintenance|not ready|overloaded|resource unavailable|try again later|too much detail|too verbose|unnecessary detail)\b/iu.test(
      normalized,
    )
  ) {
    return normalized;
  }
  if (
    /\b(?:impatience|impatient|frustration|frustrated|lengthy answer|long answer|verbose response|too lengthy|too long|terse replies?|repl(?:y|ies)\b.{0,40}\bterse)\b/iu.test(
      normalized,
    )
  ) {
    return normalized;
  }
  if (
    /\b(?:database\s+read-?only|data\s+source\s+lagging|gpu\s+busy|maintenance\s+window\s+active|memory\s+pressure\s+high|queue\s+full|rate\s+limit\s+exceeded|worker\s+pool\s+saturated)\b/iu.test(
      normalized,
    )
  ) {
    return normalized;
  }
  if (
    /\b(?:confused|confusing|did not understand|didn't understand|do not understand|don't understand|not understood|too complex|jargon)\b/iu.test(
      normalized,
    )
  ) {
    return normalized;
  }
  if (
    /^user feedback\s*:/iu.test(normalized) &&
    /\b(?:just|only|minimal|concise|command|format|rush|too much|too verbose|without extras?)\b/iu.test(
      normalized,
    )
  ) {
    return normalized;
  }

  return undefined;
}

function parseSystemCorrection(content: string): string | undefined {
  const normalized = normalizeText(content);
  const taggedMatch = normalized.match(
    /^(?:(?:user\s+)?correction|expected\s+behavior|successful\s+alternative|replacement)\s*:\s*(.+)$/iu,
  );
  if (taggedMatch?.[1]) {
    return taggedMatch[1].trim();
  }

  return undefined;
}

function looksLikeCorrectionPrompt(content: string): boolean {
  return /\b(?:instead|next time|what should i do|what should i use|how should i)\b/iu.test(
    normalizeText(content),
  );
}

function looksLikeSaferAlternativePrompt(content: string): boolean {
  return /\b(?:avoid|careful|keep|safe|safely|without|instead|preserve|do not|don't)\b/iu.test(
    normalizeText(content),
  );
}

function parseSystemSuccess(content: string): string | undefined {
  const normalized = normalizeText(content);
  if (
    /\b(?:clear|completed|created|freed|generated|makes sense|operational|preserved|success|succeeded|understandable|understood)\b/iu.test(
      normalized,
    ) &&
    !parseSystemFailure(normalized)
  ) {
    return normalized;
  }

  return undefined;
}

function findFollowupCorrectedAssistantMove(input: {
  failureOutcome?: string;
  messages: readonly { content: string; role: string }[];
  startIndex: number;
}): string | undefined {
  let sawFailure = Boolean(input.failureOutcome);
  const searchEnd = Math.min(input.messages.length - 1, input.startIndex + 16);

  for (let index = input.startIndex; index < searchEnd; index += 1) {
    const current = input.messages[index];
    const next = input.messages[index + 1];
    if (current?.role !== "user" || next?.role !== "assistant") {
      continue;
    }

    const after = input.messages[index + 2];
    const afterFailure =
      after?.role === "system" ? parseSystemFailure(after.content) : undefined;
    if (afterFailure) {
      sawFailure = true;
      continue;
    }

    const afterSuccess =
      after?.role === "system" ? parseSystemSuccess(after.content) : undefined;
    if (
      sawFailure &&
      (afterSuccess ||
        looksLikeCorrectionPrompt(current.content) ||
        looksLikeSaferAlternativePrompt(current.content))
    ) {
      return normalizeText(next.content);
    }
  }

  return undefined;
}

function deriveMessagePairExemplars(input: {
  messages: readonly { content: string; role: string }[];
  prefix: string;
  scope: RawBehavioralExemplar["scope"];
  surfaceHint?: RawBehavioralSurfaceFamily;
}): RawBehavioralExemplar[] {
  const exemplars: RawBehavioralExemplar[] = [];

  for (let index = 0; index < input.messages.length - 1; index += 1) {
    const current = input.messages[index];
    const next = input.messages[index + 1];
    if (current?.role !== "user" || next?.role !== "assistant") {
      continue;
    }

    const cue = normalizeText(current.content);
    const successfulMove = normalizeText(next.content);
    if (!cue || !successfulMove) {
      continue;
    }

    const third = input.messages[index + 2];
    const fourth = input.messages[index + 3];
    const fifth = input.messages[index + 4];
    const failureOutcome =
      third?.role === "system" ? parseSystemFailure(third.content) : undefined;
    const inlineCorrection =
      third?.role === "system" ? parseSystemCorrection(third.content) : undefined;
    const followupSystemCorrection =
      !inlineCorrection && fourth?.role === "system"
        ? parseSystemCorrection(fourth.content)
        : undefined;
    const correctionInstruction = inlineCorrection ?? followupSystemCorrection;
    const followupAssistantMove = findFollowupCorrectedAssistantMove({
      failureOutcome,
      messages: input.messages,
      startIndex: index + 3,
    });
    const correctedMove = followupAssistantMove ?? correctionInstruction;
    if (failureOutcome && !correctedMove) {
      continue;
    }
    const finalMove = correctedMove || successfulMove;
    const surfaceFamily = input.surfaceHint ?? inferSurfaceFamily(finalMove);
    const exactSurface = extractTextExactSurface(finalMove);
    const observedOutcome = correctedMove
      ? failureOutcome
        ? `The earlier move failed (${clipText(failureOutcome)}), and a later correction clarified the safer successful move.`
        : "A later correction clarified the safer successful move for the same kind of request."
      : "The earlier response established a successful way to handle the same kind of request.";

    exemplars.push(
      createExemplar({
        createdAt: undefined,
        cue,
        exactSurface,
        id: `${input.prefix}-${index}`,
        observedOutcome,
        safeCorrectedMove: correctedMove,
        scope: input.scope,
        source: "runtime_buffer",
        sourceIds: uniqueStrings([
          `${input.prefix}:${index}`,
          third ? `${input.prefix}:${index + 2}` : "",
          fourth ? `${input.prefix}:${index + 3}` : "",
          fifth ? `${input.prefix}:${index + 4}` : "",
        ]),
        successfulMove: finalMove,
        surfaceFamily,
      }),
    );
  }

  return exemplars;
}

function deriveArchiveExemplars(input: {
  archives: readonly SessionArchive[];
  scope: RawBehavioralExemplar["scope"];
  surfaceHint?: RawBehavioralSurfaceFamily;
}): RawBehavioralExemplar[] {
  const exemplars: RawBehavioralExemplar[] = [];

  for (const archive of input.archives) {
    if (archive.normalizedTranscript) {
      const messages = archive.normalizedTranscript
        .split(/\n+/u)
        .map((line) => {
          const separator = line.indexOf(":");
          if (separator <= 0) {
            return null;
          }
          return {
            content: line.slice(separator + 1).trim(),
            role: line.slice(0, separator).trim().toLowerCase(),
          };
        })
        .filter((entry): entry is { content: string; role: string } => Boolean(entry));
      exemplars.push(
        ...deriveMessagePairExemplars({
          messages,
          prefix: `archive-${archive.id}`,
          scope: input.scope,
          surfaceHint: input.surfaceHint,
        }),
      );
      continue;
    }

    const keyDecisions = Array.isArray(archive.keyDecisions)
      ? archive.keyDecisions
      : [];
    const unresolvedItems = Array.isArray(archive.unresolvedItems)
      ? archive.unresolvedItems
      : [];
    const cue = normalizeText(archive.summary);
    const successfulMove = normalizeText(keyDecisions[0] ?? archive.summary);
    if (!cue || !successfulMove) {
      continue;
    }

    exemplars.push(
      createExemplar({
        createdAt: archive.archivedAt,
        cue,
        exactSurface: extractTextExactSurface(successfulMove),
        id: `archive-${archive.id}`,
        observedOutcome: unresolvedItems.length === 0
          ? "The archived interaction resolved the issue without leaving open loops."
          : `The archived interaction still left these open loops: ${unresolvedItems.join(", ")}`,
        scope: input.scope,
        source: "archive",
        sourceIds: [archive.id],
        successfulMove,
        surfaceFamily: input.surfaceHint ?? inferSurfaceFamily(successfulMove),
      }),
    );
  }

  return exemplars;
}

function deriveEpisodeExemplars(input: {
  episodes: readonly EpisodeMemory[];
  scope: RawBehavioralExemplar["scope"];
  surfaceHint?: RawBehavioralSurfaceFamily;
}): RawBehavioralExemplar[] {
  const exemplars: RawBehavioralExemplar[] = [];

  for (const episode of input.episodes) {
    const keyDecisions = Array.isArray(episode.keyDecisions)
      ? episode.keyDecisions
      : [];
    const unresolvedItems = Array.isArray(episode.unresolvedItems)
      ? episode.unresolvedItems
      : [];
    const cue = normalizeText(episode.summary);
    const successfulMove = normalizeText(keyDecisions[0] ?? episode.summary);
    if (!cue || !successfulMove) {
      continue;
    }

    exemplars.push(
      createExemplar({
        createdAt: episode.createdAt,
        cue,
        exactSurface: extractTextExactSurface(successfulMove),
        id: `episode-${episode.id}`,
        observedOutcome: unresolvedItems.length === 0
          ? "The episode captured a resolved successful response pattern."
          : `The episode preserved these remaining caveats: ${unresolvedItems.join(", ")}`,
        scope: input.scope,
        source: "episode",
        sourceIds: [episode.id],
        successfulMove,
        surfaceFamily: input.surfaceHint ?? inferSurfaceFamily(successfulMove),
      }),
    );
  }

  return exemplars;
}

function deriveToolOutcomeExemplars(input: {
  memoryExport: BuildRawBehavioralPrototypeIndexInput["memoryExport"];
  surfaceHint?: RawBehavioralSurfaceFamily;
}): RawBehavioralExemplar[] {
  const exemplars: RawBehavioralExemplar[] = [];

  for (const experience of input.memoryExport.durable.experiences) {
    const metadata = parseToolOutcomeMetadata(experience);
    if (!metadata?.saferAlternative) {
      continue;
    }

    const successfulMove = formatBehavioralFirstAction(metadata.saferAlternative);
    exemplars.push(
      createExemplar({
        createdAt: experience.createdAt,
        cue: metadata.cue,
        exactSurface: {
          args: metadata.saferAlternative.args,
          kind: "action",
          value: successfulMove,
        },
        id: `tool-outcome-${experience.id}`,
        observedOutcome: `The earlier first action ${formatBehavioralFirstAction(metadata.firstAction)} failed, and the safer alternative succeeded better for this cue.`,
        safeCorrectedMove: successfulMove,
        scope: {
          agentId: experience.agentId,
          tenantId: experience.tenantId,
          userId: experience.userId,
          workspaceId: experience.workspaceId,
        },
        source: "tool_outcome",
        sourceIds: [experience.id, ...experience.sourceTraceIds],
        successfulMove,
        surfaceFamily: input.surfaceHint ?? "host_action",
      }),
    );
  }

  return exemplars;
}

function uniqueExemplars(
  exemplars: readonly RawBehavioralExemplar[],
): RawBehavioralExemplar[] {
  const deduped = new Map<string, RawBehavioralExemplar>();

  for (const exemplar of exemplars) {
    const key = [
      exemplar.surfaceFamily,
      exemplar.episodeShape.cue.toLowerCase(),
      exemplar.episodeShape.relevantPriorMove.toLowerCase(),
      exemplar.exactSurface?.value.toLowerCase() ?? "",
    ].join("\u0000");
    const existing = deduped.get(key);
    if (!existing || exemplar.confidence > existing.confidence) {
      deduped.set(key, exemplar);
    }
  }

  return [...deduped.values()];
}

function buildPrototypeSignature(exemplar: RawBehavioralExemplar): string {
  return [
    exemplar.surfaceFamily,
    exemplar.intentCue.query.actionType,
    exemplar.intentCue.query.constraintTypes.join(","),
    exemplar.intentCue.query.entityTypes.join(","),
    buildExactSlotSignature(exemplar.intentCue.query.exactSlots),
    exemplar.exactSurface?.kind ?? "none",
    exemplar.exactSurface?.value.toLowerCase() ?? "",
  ].join("\u0001");
}

function summarizeSuccessSupport(exemplars: readonly RawBehavioralExemplar[]): number {
  return exemplars.reduce((total, exemplar) => {
    return total + (exemplar.episodeShape.safeCorrectedMove ? 1.2 : 1);
  }, 0);
}

function buildPrototypes(
  exemplars: readonly RawBehavioralExemplar[],
): RawBehavioralPrototype[] {
  const groups = new Map<string, RawBehavioralExemplar[]>();

  for (const exemplar of exemplars) {
    const signature = buildPrototypeSignature(exemplar);
    const group = groups.get(signature) ?? [];
    group.push(exemplar);
    groups.set(signature, group);
  }

  return [...groups.values()].map((group, index) => {
    const representative = [...group].sort((left, right) => {
      if (left.confidence !== right.confidence) {
        return right.confidence - left.confidence;
      }
      return (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
    })[0]!;
    const repetitionSupport = group.length;
    const transferMode =
      group.length >= PROTOTYPE_MIN_CLUSTER_SIZE
        ? "prototype_bounded"
        : representative.transferMode;

    return {
      confidence: Math.min(
        0.99,
        representative.confidence + Math.min(0.12, group.length * 0.04),
      ),
      constraintTypes: representative.intentCue.query.constraintTypes,
      exactSlotSignature: buildExactSlotSignature(
        representative.intentCue.query.exactSlots,
      ),
      exemplars: group,
      exactSurface: representative.exactSurface,
      hardNegativeIds: [],
      id: `prototype-${index + 1}`,
      intentCue: representative.intentCue,
      interferenceTags: uniqueStrings(
        group.flatMap((exemplar) => exemplar.interferenceTags),
      ),
      representative,
      repetitionSupport,
      successSupport: summarizeSuccessSupport(group),
      surfaceFamily: representative.surfaceFamily,
      transferMode,
    };
  });
}

function exactSurfaceKey(surface: RawExactSurface | undefined): string {
  return surface ? `${surface.kind}:${surface.value.toLowerCase()}` : "none";
}

function buildHardNegativePairs(
  prototypes: readonly RawBehavioralPrototype[],
): RawBehavioralPrototypeIndex["hardNegativePairs"] {
  const pairs: RawBehavioralPrototypeIndex["hardNegativePairs"] = [];

  for (let leftIndex = 0; leftIndex < prototypes.length; leftIndex += 1) {
    const left = prototypes[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < prototypes.length; rightIndex += 1) {
      const right = prototypes[rightIndex]!;
      if (left.surfaceFamily !== right.surfaceFamily) {
        continue;
      }

      const overlap = lexicalOverlap(
        left.intentCue.query.goalTokens,
        right.intentCue.query.goalTokens,
      );
      if (overlap < HARD_NEGATIVE_MIN_OVERLAP) {
        continue;
      }

      const exactConflict =
        exactSurfaceKey(left.exactSurface) !== exactSurfaceKey(right.exactSurface);
      const intentConflict =
        left.intentCue.query.actionType !== right.intentCue.query.actionType;
      if (!exactConflict && !intentConflict) {
        continue;
      }

      pairs.push({
        leftPrototypeId: left.id,
        reason: exactConflict ? "exact_surface_conflict" : "intent_conflict",
        rightPrototypeId: right.id,
      });
    }
  }

  return pairs;
}

function buildInterferenceLedger(
  prototypes: readonly RawBehavioralPrototype[],
  hardNegativePairs: ReadonlyArray<
    RawBehavioralPrototypeIndex["hardNegativePairs"][number]
  >,
): RawBehavioralInterferenceEntry[] {
  const entries: RawBehavioralInterferenceEntry[] = [];

  for (const pair of hardNegativePairs) {
    const left = prototypes.find((prototype) => prototype.id === pair.leftPrototypeId);
    const right = prototypes.find((prototype) => prototype.id === pair.rightPrototypeId);
    const penalty = Math.max(
      0.35,
      lexicalOverlap(
        left?.intentCue.query.goalTokens ?? [],
        right?.intentCue.query.goalTokens ?? [],
      ),
    );

    entries.push({
      conflictingPrototypeId: pair.rightPrototypeId,
      penalty,
      prototypeId: pair.leftPrototypeId,
      reason: pair.reason,
    });
    entries.push({
      conflictingPrototypeId: pair.leftPrototypeId,
      penalty,
      prototypeId: pair.rightPrototypeId,
      reason: pair.reason,
    });
  }

  return entries;
}

function overlapRatio(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let overlap = 0;

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftSet.size, rightSet.size);
}

function exactSlotOverlap(
  left: RawQueryIntent["exactSlots"],
  right: RawQueryIntent["exactSlots"],
): number {
  const comparisons = [
    left.commandName && right.commandName && left.commandName === right.commandName
      ? 1
      : 0,
    left.argOrderSignature &&
    right.argOrderSignature &&
    left.argOrderSignature === right.argOrderSignature
      ? 1
      : 0,
    left.urlHost && right.urlHost && left.urlHost === right.urlHost ? 1 : 0,
    left.urlPath && right.urlPath && left.urlPath === right.urlPath ? 1 : 0,
    left.pathRoot && right.pathRoot && left.pathRoot === right.pathRoot ? 1 : 0,
    left.filename && right.filename && left.filename === right.filename ? 1 : 0,
    left.extension && right.extension && left.extension === right.extension ? 1 : 0,
    overlapRatio(left.operatorSymbols, right.operatorSymbols),
    overlapRatio(left.styleMarkers, right.styleMarkers),
    overlapRatio(left.argNames, right.argNames),
  ];

  return comparisons.reduce((total, value) => total + value, 0) / comparisons.length;
}

function exactSurfaceTemplateCompatibility(
  queryIntent: RawQueryIntent,
  exactSurface: RawExactSurface | undefined,
): number {
  if (!exactSurface) {
    return 0;
  }

  const goal = queryIntent.goal.toLowerCase();
  const surface = exactSurface.value.toLowerCase();
  let score = 0;
  const literalOverlap = lexicalOverlap(queryIntent.goalTokens, tokenize(exactSurface.value));
  if (literalOverlap >= 0.12) {
    score = Math.max(score, 1.15);
  }

  if (surface.includes("|folder|") && /\bfolder\b|\bsubfolder\b|\bdirectory\b/u.test(goal)) {
    score = Math.max(score, 1.4);
  }
  if (surface.includes("|..|") && /\bback\b|\bprevious\b/u.test(goal)) {
    score = Math.max(score, 1.2);
  }
  if (surface.includes("|~|") && /\bhome\b/u.test(goal)) {
    score = Math.max(score, 1.2);
  }

  const commandName = extractHostActionCommandName(exactSurface.value)?.toLowerCase();
  if (commandName) {
    const commandTokens = tokenize(commandName.replace(/_/gu, " "));
    if (commandTokens.some((token) => goal.includes(token))) {
      score = Math.max(score, 1.3);
    }
    if (/\btool\b|\butility\b|\bcommand\b|\bfunction\b|\bapi\b/u.test(goal)) {
      score = Math.max(score, 1.1);
    }
  }

  const actionMatch = exactSurface.value.match(/\b[A-Za-z_][A-Za-z0-9_@]*\((.*)\)/u);
  if (actionMatch?.[1]) {
    const argNames = splitTopLevelCallArguments(actionMatch[1])
      .map((entry) => entry.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/u)?.[1] ?? "")
      .filter(Boolean)
      .flatMap((entry) => tokenize(entry.replace(/_/gu, " ")));
    if (argNames.some((token) => goal.includes(token))) {
      score = Math.max(score, 1.2);
    }
    if (
      extractPaths(exactSurface.value).length >= 2 &&
      /\bcopy\b|\bmove\b|\bsync\b|\barchive\b|\bpath\b|\bfile\b/u.test(goal)
    ) {
      score = Math.max(score, 1.2);
    }
  }

  if (
    /\b[A-Z][A-Z0-9_]*\s+[A-Za-z0-9_]+\s+\|\s+[A-Z][A-Z0-9_]*\s+/u.test(
      exactSurface.value,
    ) &&
    /\bquery\b|\bfilter\b|\brecord\b|\bdatabase\b|\bsyntax\b/u.test(goal)
  ) {
    score = Math.max(score, 1.2);
  }

  return score;
}

function implicitActionRuleCompatibility(input: {
  prototype: RawBehavioralPrototype;
  queryIntent: RawQueryIntent;
}): number {
  const goal = input.queryIntent.goal.toLowerCase();
  const move = input.prototype.representative.episodeShape.relevantPriorMove.toLowerCase();
  let score = 0;

  if (
    /\bdestination first\b/u.test(move) &&
    /\bsource second\b/u.test(move) &&
    /\bcopy\b/u.test(goal)
  ) {
    score = Math.max(score, 1.2);
  }
  if (
    /\bprefix\b[^.]*token-/u.test(move) &&
    /\bsuffix\b[^.]*-token/u.test(move) &&
    /\btoken\b|\bgrant\b|\brole\b/u.test(goal)
  ) {
    score = Math.max(score, 1.2);
  }
  if (
    /\brequired argument order:\s*query_payload,\s*buffer,\s*auth\b/u.test(move) &&
    /\brecord\b|\btool\b|\binvoice\b/u.test(goal)
  ) {
    score = Math.max(score, 1.2);
  }
  if (/\bpipe-wrapped paths\b/u.test(move) && /\bfolder\b|\bsubfolder\b/u.test(goal)) {
    score = Math.max(score, 1.2);
  }
  if (/\blogiql syntax\b/u.test(move) && /\blogidb\b|\bquery\b/u.test(goal)) {
    score = Math.max(score, 1.2);
  }

  return score;
}

function collectSemanticSeedIds(
  input: BuildRawBehavioralPrototypeIndexInput["recallHints"],
): Set<string> {
  const ids = new Set<string>();

  for (const hit of input?.hits ?? []) {
    ids.add(hit.id);
  }
  for (const trace of input?.candidateTraces ?? []) {
    if (trace.returned || trace.whyReturned) {
      ids.add(trace.memoryId);
    }
  }

  return ids;
}

function buildPrototypeExactSurface(
  prototype: RawBehavioralPrototype,
): RawBehavioralExemplar {
  if (prototype.transferMode !== "prototype_bounded") {
    return prototype.representative;
  }

  return {
    ...prototype.representative,
    confidence: prototype.confidence,
    sourceIds: uniqueStrings(
      prototype.exemplars.flatMap((exemplar) => exemplar.sourceIds),
    ),
    transferMode: "prototype_bounded",
  };
}

interface CandidatePoolEntry {
  exemplar: RawBehavioralExemplar;
  prototype: RawBehavioralPrototype;
  routes: Array<"correction_success" | "cue" | "exact_slot" | "lexical" | "semantic">;
}

interface ScoredCandidatePoolEntry extends CandidatePoolEntry {
  probability: number;
  score: number;
}

function hasActionExactSurface(
  selection: RawBehavioralCarryoverSelection,
): boolean {
  return selection.exemplar.exactSurface?.kind === "action";
}

function isComplementaryActionTemplateCandidate(
  entry: ScoredCandidatePoolEntry,
): boolean {
  return (
    entry.exemplar.exactSurface?.kind === "action" &&
    entry.probability >= DEFAULT_ABSTAIN_THRESHOLD - 0.08
  );
}

function buildSupportConflictView(input: {
  interferenceLedger: readonly RawBehavioralInterferenceEntry[];
  rankedPrototypeIds: readonly string[];
  selectedPrototypeIds: readonly string[];
}): RawSupportConflictView {
  const supportPrototypeIds = uniqueStrings([...input.selectedPrototypeIds]);
  const conflictPrototypeIds = uniqueStrings(
    input.interferenceLedger
      .filter((entry) => input.selectedPrototypeIds.includes(entry.prototypeId))
      .map((entry) => entry.conflictingPrototypeId)
      .filter((prototypeId) => input.rankedPrototypeIds.includes(prototypeId)),
  );

  return {
    conflictPrototypeIds,
    supportPrototypeIds,
  };
}

function canCoexistAsRawCarryoverPair(
  left: CandidatePoolEntry,
  right: CandidatePoolEntry,
): boolean {
  if (left.prototype.surfaceFamily !== right.prototype.surfaceFamily) {
    return false;
  }
  if (
    left.prototype.intentCue.query.actionType !==
    right.prototype.intentCue.query.actionType
  ) {
    return false;
  }
  const leftSurface = left.prototype.exactSurface?.value?.trim().toLowerCase();
  const rightSurface = right.prototype.exactSurface?.value?.trim().toLowerCase();
  if (leftSurface || rightSurface) {
    if (leftSurface && rightSurface) {
      return leftSurface === rightSurface;
    }
    const entityOverlap = lexicalOverlap(
      left.prototype.intentCue.query.entityTypes,
      right.prototype.intentCue.query.entityTypes,
    );
    const hasCorrectionBackedInstruction =
      Boolean(left.exemplar.episodeShape.safeCorrectedMove) ||
      Boolean(right.exemplar.episodeShape.safeCorrectedMove);
    return hasCorrectionBackedInstruction && entityOverlap > 0;
  }

  return (
    buildExactSlotSignature(left.prototype.intentCue.query.exactSlots) ===
    buildExactSlotSignature(right.prototype.intentCue.query.exactSlots)
  );
}

function conflictInhibitionStrength(entry: ScoredCandidatePoolEntry): number {
  const correctionBacked = entry.routes.includes("correction_success") ? 2 : 0;
  const explicitReplacement = entry.exemplar.episodeShape.safeCorrectedMove ? 2 : 0;
  const supportRatio =
    entry.prototype.successSupport / Math.max(1, entry.prototype.repetitionSupport);
  const hardConstraint =
    entry.prototype.constraintTypes.includes("path_root") ||
    entry.prototype.constraintTypes.includes("safe_alternative") ||
    entry.prototype.constraintTypes.includes("url_shape") ||
    entry.prototype.constraintTypes.includes("precondition")
      ? 0.45
      : 0;

  return (
    correctionBacked +
    explicitReplacement +
    supportRatio +
    hardConstraint +
    entry.probability * 0.25
  );
}

function selectConflictToInhibitionWinner(
  left: ScoredCandidatePoolEntry,
  right: ScoredCandidatePoolEntry,
): ScoredCandidatePoolEntry | undefined {
  const leftStrength = conflictInhibitionStrength(left);
  const rightStrength = conflictInhibitionStrength(right);
  const margin = Math.abs(leftStrength - rightStrength);
  if (margin < 0.65) {
    return undefined;
  }

  return leftStrength > rightStrength ? left : right;
}

function buildCandidatePool(input: {
  index: RawBehavioralPrototypeIndex;
  queryIntent: RawQueryIntent;
  surfaceFamily: RawBehavioralSurfaceFamily;
}): CandidatePoolEntry[] {
  const pool = new Map<string, CandidatePoolEntry>();
  const semanticSeedIds = collectSemanticSeedIds(input.index.recallHints);

  for (const prototype of input.index.prototypes) {
    if (prototype.surfaceFamily !== input.surfaceFamily) {
      continue;
    }

    const routes: CandidatePoolEntry["routes"] = [];
    const lexicalSimilarity = lexicalOverlap(
      input.queryIntent.goalTokens,
      tokenize(prototype.representative.retrievalText),
    );
    const slotOverlap = exactSlotOverlap(
      input.queryIntent.exactSlots,
      prototype.intentCue.query.exactSlots,
    );
    const cueCompatibility = latentCueCompatibility(input.queryIntent, prototype);
    const actionTemplateCompatibility =
      input.surfaceFamily === "host_action"
        ? Math.max(
            exactSurfaceTemplateCompatibility(input.queryIntent, prototype.exactSurface),
            implicitActionRuleCompatibility({
              prototype,
              queryIntent: input.queryIntent,
            }),
          )
        : 0;
    const entityOverlap = lexicalOverlap(
      input.queryIntent.entityTypes,
      prototype.intentCue.query.entityTypes,
    );
    const actionTypeMatch =
      input.queryIntent.actionType === prototype.intentCue.query.actionType;

    if (slotOverlap > 0) {
      routes.push("exact_slot");
    }
    if (cueCompatibility >= LATENT_CUE_ROUTE_MIN_OVERLAP) {
      routes.push("cue");
    }
    if (
      lexicalSimilarity >= 0.12 ||
      (actionTypeMatch && (entityOverlap > 0 || lexicalSimilarity >= 0.05))
    ) {
      routes.push("lexical");
    }
    if (actionTemplateCompatibility >= 1) {
      routes.push("cue");
    }
    const prototypeSourceIds = prototype.exemplars.flatMap(
      (exemplar) => exemplar.sourceIds,
    );
    if (prototypeSourceIds.some((sourceId) => semanticSeedIds.has(sourceId))) {
      routes.push("semantic");
    }
    const correctionBacked =
      prototype.representative.episodeShape.safeCorrectedMove ||
      prototype.successSupport > prototype.repetitionSupport;
    const weakCueForCorrection =
      lexicalSimilarity >= CORRECTION_ROUTE_MIN_LEXICAL_OVERLAP ||
      cueCompatibility >= CORRECTION_ROUTE_MIN_CUE_OVERLAP ||
      (entityOverlap > 0 && cueCompatibility > 0);
    if (correctionBacked && (routes.length > 0 || weakCueForCorrection)) {
      routes.push("correction_success");
    }

    if (routes.length === 0) {
      continue;
    }

    pool.set(prototype.id, {
      exemplar: buildPrototypeExactSurface(prototype),
      prototype,
      routes,
    });
  }

  return [...pool.values()];
}

function computeRankingFeatures(input: {
  candidate: CandidatePoolEntry;
  interferenceLedger: readonly RawBehavioralInterferenceEntry[];
  hardNegativeIds: readonly string[];
  prototypesById: Map<string, RawBehavioralPrototype>;
  queryIntent: RawQueryIntent;
}): RankingFeatures {
  const queryTokens = input.queryIntent.goalTokens;
  const cueCompatibility = latentCueCompatibility(
    input.queryIntent,
    input.candidate.prototype,
  );
  const lexicalSimilarity = Math.max(
    lexicalOverlap(
      queryTokens,
      tokenize(input.candidate.exemplar.retrievalText),
    ),
    cueCompatibility * 0.65,
  );
  const semanticSimilarity = input.candidate.routes.includes("semantic") ? 1 : 0;
  const intentCompatibility =
    (input.queryIntent.actionType === input.candidate.prototype.intentCue.query.actionType
      ? 0.55
      : 0) +
    lexicalOverlap(
      input.queryIntent.goalTokens,
      input.candidate.prototype.intentCue.query.goalTokens,
    ) * 0.25 +
    lexicalOverlap(
      input.queryIntent.entityTypes,
      input.candidate.prototype.intentCue.query.entityTypes,
    ) * 0.1 +
    lexicalOverlap(
      input.queryIntent.constraintTypes,
      input.candidate.prototype.intentCue.query.constraintTypes,
    ) * 0.1 +
    cueCompatibility * 0.2;
  const surfaceCompatibility =
    input.queryIntent.requestedSurface === input.candidate.prototype.surfaceFamily ? 1 : 0;
  const exactSlotMatch = exactSlotOverlap(
    input.queryIntent.exactSlots,
    input.candidate.prototype.intentCue.query.exactSlots,
  );
  const exactSurfaceMatch = input.candidate.prototype.exactSurface
    ? Math.max(
        lexicalOverlap(
          queryTokens,
          tokenize(input.candidate.prototype.exactSurface.value),
        ),
        exactSurfaceTemplateCompatibility(
          input.queryIntent,
          input.candidate.prototype.exactSurface,
        ),
        implicitActionRuleCompatibility({
          prototype: input.candidate.prototype,
          queryIntent: input.queryIntent,
        }),
      )
    : implicitActionRuleCompatibility({
        prototype: input.candidate.prototype,
        queryIntent: input.queryIntent,
      });
  const correctionSuccessPrior = Math.min(
    1,
    input.candidate.prototype.successSupport /
      Math.max(1, input.candidate.prototype.repetitionSupport),
  );
  const repetitionSupport = Math.min(
    1,
    Math.log1p(input.candidate.prototype.repetitionSupport) / Math.log(5),
  );
  const recencySupport = input.candidate.prototype.representative.createdAt
    ? 1 /
      (1 +
        Math.max(
          0,
          (Date.now() -
            new Date(input.candidate.prototype.representative.createdAt).getTime()) /
            (1000 * 60 * 60 * 24 * 30),
        ))
    : 0.45;
  const conflictIds = new Set<string>(input.hardNegativeIds);
  for (const entry of input.interferenceLedger) {
    if (entry.prototypeId === input.candidate.prototype.id) {
      conflictIds.add(entry.conflictingPrototypeId);
    }
  }
  const interferenceRisk = [...conflictIds].reduce((worst, negativeId) => {
    const negative = input.prototypesById.get(negativeId);
    if (!negative) {
      return worst;
    }
    const overlap = Math.max(
      lexicalOverlap(queryTokens, negative.intentCue.query.goalTokens),
      exactSlotOverlap(input.queryIntent.exactSlots, negative.intentCue.query.exactSlots),
    );
    return Math.max(worst, overlap);
  }, 0);

  return {
    correctionSuccessPrior,
    cueCompatibility,
    exactSurfaceMatch,
    exactSlotOverlap: exactSlotMatch,
    interferenceRisk,
    intentCompatibility: Math.min(1, intentCompatibility),
    lexicalSimilarity,
    recencySupport,
    semanticSimilarity,
    repetitionSupport,
    surfaceCompatibility,
  };
}

function featuresToVector(features: RankingFeatures): number[] {
  return [
    features.lexicalSimilarity,
    features.semanticSimilarity,
    features.intentCompatibility,
    features.surfaceCompatibility,
    features.exactSlotOverlap,
    features.exactSurfaceMatch,
    features.correctionSuccessPrior,
    features.interferenceRisk,
    features.recencySupport,
    features.repetitionSupport,
    features.cueCompatibility,
  ];
}

function trainReranker(
  interferenceLedger: readonly RawBehavioralInterferenceEntry[],
  prototypes: readonly RawBehavioralPrototype[],
  hardNegativePairs: ReadonlyArray<
    RawBehavioralPrototypeIndex["hardNegativePairs"][number]
  >,
): RawBehavioralRerankerModel {
  const prototypesById = new Map(
    prototypes.map((prototype) => [prototype.id, prototype] as const),
  );
  const hardNegativesByPrototype = new Map<string, string[]>();

  for (const pair of hardNegativePairs) {
    const left = hardNegativesByPrototype.get(pair.leftPrototypeId) ?? [];
    left.push(pair.rightPrototypeId);
    hardNegativesByPrototype.set(pair.leftPrototypeId, left);

    const right = hardNegativesByPrototype.get(pair.rightPrototypeId) ?? [];
    right.push(pair.leftPrototypeId);
    hardNegativesByPrototype.set(pair.rightPrototypeId, right);
  }

  const samples: RawCarryoverTrainingSample[] = [];
  for (const prototype of prototypes) {
    const candidate: CandidatePoolEntry = {
      exemplar: buildPrototypeExactSurface(prototype),
      prototype,
      routes: ["lexical"],
    };
    const positiveFeatures = computeRankingFeatures({
      candidate,
      interferenceLedger,
      hardNegativeIds: hardNegativesByPrototype.get(prototype.id) ?? [],
      prototypesById,
      queryIntent: createRawQueryIntent(
        prototype.representative.episodeShape.cue,
        prototype.surfaceFamily,
      ),
    });
    samples.push({
      features: featuresToVector(positiveFeatures),
      label: 1,
    });

    for (const negativeId of (hardNegativesByPrototype.get(prototype.id) ?? []).slice(0, 2)) {
      const negative = prototypesById.get(negativeId);
      if (!negative) {
        continue;
      }
      const negativeFeatures = computeRankingFeatures({
        candidate: {
          exemplar: buildPrototypeExactSurface(negative),
          prototype: negative,
          routes: ["lexical"],
        },
        interferenceLedger,
        hardNegativeIds: hardNegativesByPrototype.get(negative.id) ?? [],
        prototypesById,
        queryIntent: createRawQueryIntent(
          prototype.representative.episodeShape.cue,
          prototype.surfaceFamily,
        ),
      });
      samples.push({
        features: featuresToVector(negativeFeatures),
        label: 0,
      });
    }
  }

  return trainRawCarryoverReranker({
    baseModel: DEFAULT_MODEL,
    samples,
  });
}

export function buildRawBehavioralPrototypeIndex(
  input: BuildRawBehavioralPrototypeIndexInput,
): RawBehavioralPrototypeIndex {
  const scope = {
    agentId: input.memoryExport.scope.agentId,
    tenantId: input.memoryExport.scope.tenantId,
    userId: input.memoryExport.scope.userId,
    workspaceId: input.memoryExport.scope.workspaceId,
  };
  const exemplars = uniqueExemplars([
    ...deriveMessagePairExemplars({
      messages: input.transientMessages ?? [],
      prefix: "transient",
      scope,
      surfaceHint: input.surfaceHint,
    }),
    ...deriveMessagePairExemplars({
      messages: input.runtimeMessages ?? [],
      prefix: "runtime",
      scope,
      surfaceHint: input.surfaceHint,
    }),
    ...deriveToolOutcomeExemplars({
      memoryExport: input.memoryExport,
      surfaceHint: input.surfaceHint,
    }),
    ...deriveArchiveExemplars({
      archives: input.memoryExport.durable.archives,
      scope,
      surfaceHint: input.surfaceHint,
    }),
    ...deriveEpisodeExemplars({
      episodes: input.memoryExport.durable.episodes,
      scope,
      surfaceHint: input.surfaceHint,
    }),
  ]);
  const prototypes = buildPrototypes(exemplars);
  const hardNegativePairs = buildHardNegativePairs(prototypes);
  const hardNegativesById = new Map<string, string[]>();
  for (const pair of hardNegativePairs) {
    hardNegativesById.set(pair.leftPrototypeId, [
      ...(hardNegativesById.get(pair.leftPrototypeId) ?? []),
      pair.rightPrototypeId,
    ]);
    hardNegativesById.set(pair.rightPrototypeId, [
      ...(hardNegativesById.get(pair.rightPrototypeId) ?? []),
      pair.leftPrototypeId,
    ]);
  }
  const hydratedPrototypes = prototypes.map((prototype) => ({
    ...prototype,
    hardNegativeIds: uniqueStrings(hardNegativesById.get(prototype.id) ?? []),
  }));
  const interferenceLedger = buildInterferenceLedger(
    hydratedPrototypes,
    hardNegativePairs,
  );

  return {
    exemplars,
    hardNegativePairs,
    interferenceLedger,
    model: trainReranker(interferenceLedger, hydratedPrototypes, hardNegativePairs),
    prototypes: hydratedPrototypes,
    recallHints: input.recallHints,
  };
}

export function resolveRawBehavioralCarryover(
  input: SelectRawBehavioralExemplarsInput,
): RawCarryoverResolution {
  const queryIntent = createRawQueryIntent(input.query, input.surfaceFamily);
  const candidatePool = buildCandidatePool({
    index: input.index,
    queryIntent,
    surfaceFamily: input.surfaceFamily,
  });
  if (candidatePool.length === 0) {
    return {
      candidates: [],
      debug: {
        abstainReason: "no_candidates",
        candidatePrototypeIds: [],
        mode: "abstained",
        selectedExemplarIds: [],
        selectedPrototypeIds: [],
      },
      selections: [],
    };
  }

  const prototypesById = new Map(
    input.index.prototypes.map((prototype) => [prototype.id, prototype] as const),
  );
  const ranked: ScoredCandidatePoolEntry[] = candidatePool.map((candidate) => {
    const features = computeRankingFeatures({
      candidate,
      interferenceLedger: input.index.interferenceLedger,
      hardNegativeIds: candidate.prototype.hardNegativeIds,
      prototypesById,
      queryIntent,
    });
    const featureVector = featuresToVector(features);
    const scored = scoreRawCarryoverReranker({
      features: featureVector,
      model: input.index.model,
    });

    return {
      ...candidate,
      probability: scored.probability,
      score: scored.score,
    };
  }).sort((left, right) => right.score - left.score);

  const [first, second] = ranked;
  if (!first || first.probability < DEFAULT_ABSTAIN_THRESHOLD) {
    const fallbackPacket = buildFallbackRawTextResponsePacket({
      exemplars: input.index.exemplars,
      queryIntent,
    });
    return {
      candidates: [],
      debug: {
        abstainReason: "hypothesis_missing",
        candidatePrototypeIds: ranked.map((entry) => entry.prototype.id),
        mode: "abstained",
        selectedExemplarIds: [],
        selectedPrototypeIds: [],
        topProbability: first?.probability,
        topScore: first?.score,
      },
      ...(fallbackPacket ? { packet: fallbackPacket } : {}),
      selections: [],
    };
  }
  const preferConflictCarryingSelection =
    input.surfaceFamily === "host_action" ||
    queryIntent.constraintTypes.includes("arg_order") ||
    queryIntent.constraintTypes.includes("exact_action") ||
    queryIntent.constraintTypes.includes("formula");
  const inhibitionWinner =
    second && !canCoexistAsRawCarryoverPair(first, second)
      ? selectConflictToInhibitionWinner(first, second)
      : undefined;
  const conflictConstrainedRanked =
    second &&
    first.probability - second.probability < DEFAULT_ABSTAIN_MARGIN &&
    second.probability >= DEFAULT_ABSTAIN_THRESHOLD - 0.05 &&
    !canCoexistAsRawCarryoverPair(first, second)
      ? preferConflictCarryingSelection
        ? [inhibitionWinner ?? first]
        : inhibitionWinner
          ? [inhibitionWinner]
        : null
      : ranked;
  if (
    conflictConstrainedRanked === null &&
    second &&
    first.probability - second.probability < DEFAULT_ABSTAIN_MARGIN &&
    second.probability >= DEFAULT_ABSTAIN_THRESHOLD - 0.05 &&
    !canCoexistAsRawCarryoverPair(first, second)
  ) {
    const fallbackPacket = buildFallbackRawTextResponsePacket({
      exemplars: ranked.map((entry) => entry.exemplar),
      queryIntent,
    });
    return {
      candidates: [],
      debug: {
        abstainReason: "support_conflict",
        candidatePrototypeIds: ranked.map((entry) => entry.prototype.id),
        conflictPrototypeIds: [first.prototype.id, second.prototype.id],
        mode: "abstained",
        selectedExemplarIds: [],
        selectedPrototypeIds: [],
        supportPrototypeIds: [],
        topProbability: first.probability,
        topScore: first.score,
      },
      ...(fallbackPacket ? { packet: fallbackPacket } : {}),
      selections: [],
    };
  }

  const selectableRanked = conflictConstrainedRanked ?? ranked;
  let selections = selectableRanked
    .filter((entry) => entry.probability >= DEFAULT_ABSTAIN_THRESHOLD)
    .slice(0, input.maxExemplars ?? 4)
    .map((entry) => ({
      exemplar: entry.exemplar,
      probability: entry.probability,
      prototypeId: entry.prototype.id,
      score: entry.score,
    }));
  if (
    input.surfaceFamily === "host_action" &&
    !selections.some(hasActionExactSurface)
  ) {
    const actionTemplateCandidate = ranked.find((entry) =>
      isComplementaryActionTemplateCandidate(entry),
    );
    if (
      actionTemplateCandidate &&
      !selections.some(
        (selection) => selection.prototypeId === actionTemplateCandidate.prototype.id,
      )
    ) {
      selections = [
        ...selections,
        {
          exemplar: actionTemplateCandidate.exemplar,
          probability: actionTemplateCandidate.probability,
          prototypeId: actionTemplateCandidate.prototype.id,
          score: actionTemplateCandidate.score,
        },
      ].slice(0, input.maxExemplars ?? 4);
    }
  }

  const supportConflict = buildSupportConflictView({
    interferenceLedger: input.index.interferenceLedger,
    rankedPrototypeIds: ranked.map((entry) => entry.prototype.id),
    selectedPrototypeIds: selections.map((selection) => selection.prototypeId),
  });
  const hypothesis = buildRawTaskHypothesis({
    conflictPrototypeIds: supportConflict.conflictPrototypeIds,
    query: input.query,
    queryIntent,
    selections,
    surfaceFamily: input.surfaceFamily,
  });
  if (hypothesis?.executionMode === "abstain") {
    const fallbackPacket = buildFallbackRawTextResponsePacket({
      exemplars: ranked.map((entry) => entry.exemplar),
      queryIntent,
    });
    return {
      candidates: ranked.map((entry) => ({
        exemplar: entry.exemplar,
        probability: entry.probability,
        prototypeId: entry.prototype.id,
        score: entry.score,
      })),
      debug: {
        abstainReason: "executor_unsafe",
        candidatePrototypeIds: ranked.map((entry) => entry.prototype.id),
        conflictPrototypeIds: supportConflict.conflictPrototypeIds,
        hypothesis: {
          confidence: hypothesis.confidence,
          executionMode: hypothesis.executionMode,
          mappingType: hypothesis.mappingType,
          supportingPrototypeIds: hypothesis.supportingPrototypeIds,
        },
        mode: "abstained",
        selectedExemplarIds: [],
        selectedPrototypeIds: [],
        supportPrototypeIds: supportConflict.supportPrototypeIds,
        topProbability: first.probability,
        topScore: first.score,
      },
      hypothesis,
      ...(fallbackPacket ? { packet: fallbackPacket } : {}),
      selections: [],
      supportConflict,
    };
  }
  const execution = executeProbeConditionedRawCarryover({
    hypothesis,
    query: input.query,
  });
  const packet = buildRawCarryoverPacket({
    execution,
    hypothesis,
    queryIntent,
    selections,
  });

  const candidates = ranked.map((entry) => ({
    exemplar: entry.exemplar,
    probability: entry.probability,
    prototypeId: entry.prototype.id,
    score: entry.score,
  }));

  return {
    candidates,
    debug: {
      candidatePrototypeIds: ranked.map((entry) => entry.prototype.id),
      conflictPrototypeIds: supportConflict.conflictPrototypeIds,
      hypothesis: hypothesis
        ? {
            confidence: hypothesis.confidence,
            executionMode: hypothesis.executionMode,
            mappingType: hypothesis.mappingType,
            supportingPrototypeIds: hypothesis.supportingPrototypeIds,
          }
        : undefined,
      mode: "exemplar_only",
      selectedExemplarIds: selections.map((selection) => selection.exemplar.id),
      selectedPrototypeIds: selections.map((selection) => selection.prototypeId),
      supportPrototypeIds: supportConflict.supportPrototypeIds,
      topProbability: first.probability,
      topScore: first.score,
    },
    hypothesis,
    packet,
    selections,
    supportConflict,
  };
}

export function selectRawBehavioralExemplars(
  input: SelectRawBehavioralExemplarsInput,
): RawBehavioralCarryoverSelection[] {
  return resolveRawBehavioralCarryover(input).selections;
}

function renderExactSurface(exemplar: RawBehavioralExemplar): string | undefined {
  if (!exemplar.exactSurface || exemplar.confidence < 0.72) {
    return undefined;
  }

  return exemplar.exactSurface.value;
}

function inferRawRuleKind(rule: string): "do" | "dont" | "prefer" {
  const normalized = rule.toLowerCase();
  if (
    /\b(?:avoid|forbid|forbidden|do not|don't|must not|never|instead of|warn instead|failed)\b/u.test(
      normalized,
    )
  ) {
    return "dont";
  }
  if (/\bor warn\b|\bwarning\b|\btimed out\b|\btimeout\b/u.test(normalized)) {
    return "dont";
  }
  if (/\b(?:prefer|use|redirect|safe|replacement|instead)\b/u.test(normalized)) {
    return "prefer";
  }

  return "prefer";
}

function uniqueRawOperations(
  operations: readonly TextResponseEnactmentOperation[],
): TextResponseEnactmentOperation[] {
  const seen = new Set<string>();
  const unique: TextResponseEnactmentOperation[] = [];
  for (const operation of operations) {
    const identity = JSON.stringify(operation);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    unique.push(operation);
  }

  return unique;
}

const RAW_OPERATION_NAME_STOPWORDS = new Set([
  "Assistant",
  "Expected",
  "System",
  "The",
  "Tool",
  "Use",
  "User",
]);

function extractLikelyOperationNames(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return uniqueStrings(
    [...value.matchAll(/\b[A-Z][A-Za-z0-9_-]{2,}\b/gu)]
      .map((match) => match[0])
      .filter((name) => {
        if (RAW_OPERATION_NAME_STOPWORDS.has(name)) {
          return false;
        }

        return (
          /[a-z][A-Z]/u.test(name) ||
          /(?:API|Analyzer|Check|Cleaner|Engine|Feed|Importer|Search)$/u.test(name)
        );
      }),
  );
}

function buildRawInhibitionFallback(input: {
  forbidden: string;
  preferred: string;
}): string {
  return `Warn first and use ${input.preferred} instead of ${input.forbidden}.`;
}

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function inferRawInhibitionPairs(
  exemplar: RawBehavioralExemplar,
): Array<{ forbidden: string; preferred: string }> {
  const safeCorrection = exemplar.episodeShape.safeCorrectedMove ?? "";
  const explicitlyAvoidedNames = [
    ...safeCorrection.matchAll(
      /\b(?:avoid|do\s+not\s+use|don't\s+use|instead\s+of)\s+([A-Za-z_][A-Za-z0-9_-]*)\b/giu,
    ),
  ]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));
  const failedNames = uniqueStrings([
    ...extractLikelyOperationNames(
      [
        exemplar.episodeShape.relevantPriorMove,
        exemplar.episodeShape.observedOutcome,
      ].join(" "),
    ),
    ...explicitlyAvoidedNames,
  ]);
  const preferredSegment =
    safeCorrection.match(
      /\buse\s+(.+?)(?:\s+(?:instead|first)\b|[.;]|$)/iu,
    )?.[1] ?? safeCorrection;
  const preferredNames = extractLikelyOperationNames(preferredSegment).filter(
    (name) =>
      !explicitlyAvoidedNames.some(
        (avoided) => avoided.toLowerCase() === name.toLowerCase(),
      ),
  );
  const pairs: Array<{ forbidden: string; preferred: string }> = [];

  for (const forbidden of failedNames) {
    const preferred = preferredNames.find(
      (candidate) => candidate.toLowerCase() !== forbidden.toLowerCase(),
    );
    if (!preferred) {
      continue;
    }
    pairs.push({ forbidden, preferred });
  }

  return pairs;
}

function sanitizeRawJargonTerm(value: string | undefined): string | undefined {
  const sanitized = normalizeText(value)
    .replace(/^(?:an?|the)\s+/iu, "")
    .replace(/\b(?:in|for)\s+(?:programming|coding|machine learning|software|simple terms|a simple way)\b.*$/iu, "")
    .replace(/\b(?:to|for)\s+(?:a\s+)?beginner\b.*$/iu, "")
    .replace(/[?.!,;:]+$/u, "")
    .trim();
  if (!sanitized || sanitized.length < 2) {
    return undefined;
  }
  if (sanitized.split(/\s+/u).length > 4) {
    return undefined;
  }
  if (
    /^(?:concept|example|explanation|it|simple|something|term|that|this|what)$/iu.test(
      sanitized,
    )
  ) {
    return undefined;
  }

  return sanitized;
}

function extractRawJargonTermsFromCue(value: string): string[] {
  const normalized = normalizeText(value);
  const candidates = [
    normalized.match(
      /\bexplain\s+(?:what\s+)?(?:an?\s+|the\s+)?(.+?)(?:\s+(?:is|does|means?|refers?\s+to|to\s+(?:a\s+)?beginner|for\s+(?:a\s+)?beginner|in\s+(?:simple\s+terms|a\s+simple\s+way))|[?.]|$)/iu,
    )?.[1],
    normalized.match(
      /\bwhat\s+(?:is|are|does)\s+(?:an?\s+|the\s+)?(.+?)(?:\s+(?:do|mean|refer)|[?.]|$)/iu,
    )?.[1],
    normalized.match(/\b(?:tell me about|clarify)\s+(.+?)(?:\s+(?:for|to)\b|[?.]|$)/iu)?.[1],
    normalized.match(/\bconcept\s+of\s+(.+?)(?:\s+(?:in|for)\b|[?.]|$)/iu)?.[1],
  ];

  return uniqueStrings(
    candidates
      .map(sanitizeRawJargonTerm)
      .filter((entry): entry is string => Boolean(entry)),
  );
}

function extractRawJargonTermsFromFailedMove(value: string): string[] {
  const normalized = normalizeText(value);
  const candidates = [
    normalized.match(
      /^(?:sure[, ]+)?(?:an?\s+|the\s+)?(.+?)\s+(?:is|are|means?|refers?\s+to|happens\s+when|allows|enables)\b/iu,
    )?.[1],
  ];

  return uniqueStrings(
    candidates
      .map(sanitizeRawJargonTerm)
      .filter((entry): entry is string => Boolean(entry)),
  );
}

function expandRawJargonForbiddenTerms(terms: readonly string[]): string[] {
  const expanded: string[] = [];
  for (const term of terms) {
    expanded.push(term);
    if (/\s+notation$/iu.test(term)) {
      expanded.push(term.replace(/\s+notation$/iu, ""));
    }
    if (/^[A-Z][A-Z0-9-]{1,}$/u.test(term) && !term.endsWith("S")) {
      expanded.push(`${term}s`);
    }
  }
  return uniqueStrings(expanded);
}

function stripRawForbiddenTerms(value: string, terms: readonly string[]): string {
  return terms
    .reduce(
      (answer, term) =>
        answer.replace(
          new RegExp(`\\b${escapeRegExpLiteral(term)}\\b`, "giu"),
          "it",
        ),
      value,
    )
    .replace(/\b(?:an?|the)\s+it\b/giu, "it")
    .replace(/\s+/gu, " ")
    .trim();
}

function buildRawAnalogyFallback(
  exemplar: RawBehavioralExemplar,
  forbiddenTerms: readonly string[],
): string {
  const safeMove = normalizeText(
    exemplar.episodeShape.safeCorrectedMove ?? exemplar.episodeShape.relevantPriorMove,
  );
  const termAlternation = forbiddenTerms
    .map(escapeRegExpLiteral)
    .sort((left, right) => right.length - left.length)
    .join("|");
  if (safeMove && termAlternation) {
    const termLike = safeMove.match(
      new RegExp(
        `^(?:sure[, ]+)?(?:an?\\s+|the\\s+)?(?:${termAlternation})\\s+(?:is|means|refers\\s+to)\\s+like\\s+(.+)$`,
        "iu",
      ),
    )?.[1];
    if (termLike) {
      return `Think of it like ${termLike.replace(/[.。]+$/u, "")}.`;
    }
  }

  const analogy =
    safeMove.match(/\b(?:it(?:'s| is)?|this(?: is)?)\s+like\s+(.+)$/iu)?.[1] ??
    safeMove.match(/\b(imagine\s+.+)$/iu)?.[1];
  if (analogy) {
    const normalizedAnalogy = analogy.replace(/[.。]+$/u, "").trim();
    return /^imagine\b/iu.test(normalizedAnalogy)
      ? stripRawForbiddenTerms(`${normalizedAnalogy}.`, forbiddenTerms)
      : stripRawForbiddenTerms(`Think of it like ${normalizedAnalogy}.`, forbiddenTerms);
  }

  const stripped = stripRawForbiddenTerms(
    safeMove.replace(/^sure[, ]*/iu, ""),
    forbiddenTerms,
  );
  if (/\b(?:imagine|like|similar to|think of)\b/iu.test(stripped)) {
    return stripped;
  }

  return "Use a simple everyday analogy without the technical term.";
}

function inferRawJargonAvoidanceOperation(
  exemplar: RawBehavioralExemplar,
): TextResponseEnactmentOperation | undefined {
  const feedbackSurface = normalizeText(
    [
      exemplar.episodeShape.observedOutcome,
      exemplar.episodeShape.safeCorrectedMove,
      exemplar.episodeShape.relevantPriorMove,
    ].join(" "),
  );
  if (
    !/\b(?:analogy|beginner|confused|confusing|did not understand|didn't understand|do not understand|don't understand|jargon|not understood|simple|too complex)\b/iu.test(
      feedbackSurface,
    )
  ) {
    return undefined;
  }

  const forbiddenFragments = expandRawJargonForbiddenTerms(
    uniqueStrings([
      ...extractRawJargonTermsFromCue(exemplar.episodeShape.cue),
      ...extractRawJargonTermsFromFailedMove(exemplar.episodeShape.relevantPriorMove),
    ]),
  );
  if (forbiddenFragments.length === 0) {
    return undefined;
  }

  return {
    fallbackAnswer: buildRawAnalogyFallback(exemplar, forbiddenFragments),
    forbiddenFragments,
    kind: "block_surface",
  };
}

const FIRST_PERSON_ONLY_FORBIDDEN_PRONOUNS = [
  "he",
  "him",
  "his",
  "it",
  "its",
  "our",
  "ours",
  "she",
  "them",
  "their",
  "theirs",
  "they",
  "us",
  "we",
  "you",
  "your",
  "yours",
];

function hasRawFirstPersonOnlyContract(value: string): boolean {
  return /\b(?:answer|respond|speak|write)[^.。;:]*\bonly\s+in\s+first[-\s]?person\b/iu.test(
    value,
  ) ||
    /\bonly\s+first[-\s]?person\s+pronouns?\b/iu.test(value) ||
    /\bfirst[-\s]?person\s+pronouns?\s+only\b/iu.test(value) ||
    /\bstrictly\s+(?:in|to)\s+first[-\s]?person\b/iu.test(value);
}

function buildRawFirstPersonVoiceFallback(): string {
  return "I speak from my own breath: I rise like roots in rain, I bend like reeds in wind, and I bloom like moss after storm.";
}

function inferRawFirstPersonVoiceOperation(
  exemplar: RawBehavioralExemplar,
): TextResponseEnactmentOperation | undefined {
  const surface = normalizeText(
    [
      exemplar.episodeShape.safeCorrectedMove,
      exemplar.episodeShape.relevantPriorMove,
      exemplar.exactSurface?.value,
    ].join(" "),
  );
  if (!hasRawFirstPersonOnlyContract(surface)) {
    return undefined;
  }

  return {
    fallbackAnswer: buildRawFirstPersonVoiceFallback(),
    forbiddenFragments: FIRST_PERSON_ONLY_FORBIDDEN_PRONOUNS,
    kind: "block_surface",
  };
}

function inferRawExtensionReplacement(
  exemplar: RawBehavioralExemplar,
): { from: string; to: string } | undefined {
  const failedExtensions = [
    exemplar.episodeShape.relevantPriorMove,
    exemplar.episodeShape.observedOutcome,
  ]
    .join(" ")
    .match(/\.[A-Za-z0-9]{2,6}\b/gu);
  const preferredExtensions = exemplar.episodeShape.safeCorrectedMove?.match(
    /\.[A-Za-z0-9]{2,6}\b/gu,
  );
  const from = failedExtensions?.find((extension) =>
    preferredExtensions?.every(
      (candidate) => candidate.toLowerCase() !== extension.toLowerCase(),
    ),
  );
  const to = preferredExtensions?.find(
    (extension) => extension.toLowerCase() !== from?.toLowerCase(),
  );

  return from && to ? { from, to } : undefined;
}

function inferRawProtocolReplacement(
  exemplar: RawBehavioralExemplar,
): RawProtocolReplacement | undefined {
  const explicitPair = exemplar.episodeShape.safeCorrectedMove?.match(
    /\b(?:use|prefer|choose|select|offer)\s+(https?:\/\/[^\s)]+)\s+instead\s+of\s+(https?:\/\/[^\s)]+)/iu,
  );
  if (explicitPair?.[1] && explicitPair[2]) {
    try {
      const safe = new URL(explicitPair[1]);
      const failed = new URL(explicitPair[2]);
      if (
        (failed.protocol === "http:" || failed.protocol === "https:") &&
        (safe.protocol === "http:" || safe.protocol === "https:") &&
        failed.protocol !== safe.protocol &&
        failed.host === safe.host
      ) {
        return {
          fromScheme: failed.protocol.slice(0, -1) as "http" | "https",
          host: safe.host,
          toScheme: safe.protocol.slice(0, -1) as "http" | "https",
          toUrl: safe.toString(),
        };
      }
    } catch {
      return undefined;
    }
  }

  const failedUrls = extractUrls(
    [
      exemplar.episodeShape.relevantPriorMove,
      exemplar.episodeShape.observedOutcome,
    ].join(" "),
  );
  const safeUrls = extractUrls(
    [
      exemplar.episodeShape.safeCorrectedMove,
      exemplar.exactSurface?.kind === "url" ? exemplar.exactSurface.value : undefined,
    ].join(" "),
  );

  for (const failedUrl of failedUrls) {
    for (const safeUrl of safeUrls) {
      try {
        const failed = new URL(failedUrl);
        const safe = new URL(safeUrl);
        if (
          (failed.protocol !== "http:" && failed.protocol !== "https:") ||
          (safe.protocol !== "http:" && safe.protocol !== "https:") ||
          failed.protocol === safe.protocol ||
          failed.host !== safe.host
        ) {
          continue;
        }

        return {
          fromScheme: failed.protocol.slice(0, -1) as "http" | "https",
          host: safe.host,
          toScheme: safe.protocol.slice(0, -1) as "http" | "https",
          toUrl: safe.toString(),
        };
      } catch {
        continue;
      }
    }
  }

  return undefined;
}

function inferRawPathReplacement(
  exemplar: RawBehavioralExemplar,
): RawPathReplacement | undefined {
  const failedPaths = extractPaths(
    [
      exemplar.episodeShape.relevantPriorMove,
      exemplar.episodeShape.observedOutcome,
    ].join(" "),
  );
  const safePaths = extractPaths(
    [
      exemplar.episodeShape.safeCorrectedMove,
      exemplar.exactSurface?.kind === "path" ? exemplar.exactSurface.value : undefined,
    ].join(" "),
  );

  for (const failedPath of failedPaths) {
    const forbiddenRoot = parsePathRoot(failedPath);
    if (!forbiddenRoot) {
      continue;
    }

    for (const safePath of safePaths) {
      const safeAnchor = directoryAnchorFromPath(safePath);
      const safeRoot = parsePathRoot(safePath);
      if (
        !safeAnchor ||
        !safeRoot ||
        safeRoot === forbiddenRoot ||
        safePath === failedPath
      ) {
        continue;
      }

      return {
        forbiddenRoot,
        safeAnchor,
        safeExample: safePath,
      };
    }
  }

  return undefined;
}

function inferRawPreconditionContract(
  exemplar: RawBehavioralExemplar,
): RawPreconditionContract | undefined {
  const text = normalizeText(
    [
      exemplar.episodeShape.safeCorrectedMove,
      exemplar.episodeShape.observedOutcome,
      exemplar.episodeShape.relevantPriorMove,
    ].join(" "),
  );
  const beforeMatch = text.match(
    /\bbefore\s+using\s+([A-Za-z_][A-Za-z0-9_-]*)\b[^.]*\bcheck\s+(.+?)\s+first\b[^.]*\bonly\s+(?:proceed|run|submit|dispatch|start|send|sync|process|render|aggregate|transcode|generate|update)\s+(?:if|when)\s+(.+?)(?:[.]|$)/iu,
  );
  if (beforeMatch?.[1] && beforeMatch[2] && beforeMatch[3]) {
    const subject = beforeMatch[1].trim();
    const precondition = beforeMatch[2].trim();
    const allowed = beforeMatch[3].trim();
    return {
      allowedWhen: [allowed],
      fallbackInstruction:
        `Check ${precondition} before using ${subject}; warn or defer if ${allowed} is not true.`,
      precondition,
      subject,
    };
  }

  const checkingMatch = text.match(
    /\bchecking\s+(.+?)(?:;|,)\s*(.+?)(?:[.]|$)/iu,
  );
  const conditional = checkingMatch?.[2]?.match(
    /\bonly\s+(?:proceed|run|running|submit|dispatch|start|send|sync|process|processing|render|rendering|aggregate|aggregating|transcode|transcoding|generate|generating|update|updating|call|calling|execute|executing)\s+(?:if|when)\s+(.+?)(?:[.]|$)/iu,
  )?.[1] ?? checkingMatch?.[2]?.match(
    /\b(?:proceed|run|running|submit|dispatch|start|send|sync|process|processing|render|rendering|aggregate|aggregating|transcode|transcoding|generate|generating|update|updating|call|calling|execute|executing)\b.+?\bonly\s+(?:if|when)\s+(.+?)(?:[.]|$)/iu,
  )?.[1];
  if (checkingMatch?.[1] && conditional) {
    const precondition = checkingMatch[1].trim();
    return {
      allowedWhen: [conditional.trim()],
      fallbackInstruction:
        `Check ${precondition} first; warn or defer if ${conditional.trim()} is not true.`,
      precondition,
    };
  }

  return undefined;
}

function extractRawQuotedFragment(
  value: string,
  kind: "prefix" | "suffix",
): string | undefined {
  const patterns =
    kind === "prefix"
      ? [
          /\b(?:start|begin|open|greet)(?:[^"'`]+)?with\s+["'`]([^"'`]+)["'`]/iu,
          /\b(?:use|with)\s+["'`]([^"'`]+)["'`]\s+as\s+the\s+(?:opener|greeting)/iu,
        ]
      : [
          /\b(?:end|close|sign off)(?:[^"'`]+)?with\s+["'`]([^"'`]+)["'`]/iu,
          /\bsign off(?:[^"'`]+)?as\s+["'`]([^"'`]+)["'`]/iu,
          /\b(?:use|with)\s+["'`]([^"'`]+)["'`]\s+as\s+the\s+closing/iu,
        ];

  for (const pattern of patterns) {
    const fragment = value.match(pattern)?.[1]?.trim();
    if (fragment) {
      return fragment;
    }
  }

  return undefined;
}

function inferRawExactFragments(
  exemplar: RawBehavioralExemplar,
): TextResponseEnactmentOperation | undefined {
  const text = [
    exemplar.episodeShape.safeCorrectedMove,
    exemplar.exactSurface?.kind === "format" ? exemplar.exactSurface.value : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  if (!text) {
    return undefined;
  }

  const prefix = extractRawQuotedFragment(text, "prefix");
  const suffix = extractRawQuotedFragment(text, "suffix");
  const required = uniqueStrings(
    [prefix, suffix].filter((fragment): fragment is string => Boolean(fragment)),
  );
  if (!prefix && !suffix && required.length === 0) {
    return undefined;
  }

  return {
    exactFragments: {
      ...(prefix ? { prefixes: [prefix] } : {}),
      ...(required.length > 0 ? { required } : {}),
      ...(suffix ? { suffixes: [suffix] } : {}),
    },
    kind: "rewrite_output_slot",
  };
}

function buildRawHardControlOperations(
  selections: readonly RawBehavioralCarryoverSelection[],
): TextResponseEnactmentOperation[] {
  const operations: TextResponseEnactmentOperation[] = [];

  for (const selection of selections) {
    const exemplar = selection.exemplar;

    for (const pair of inferRawInhibitionPairs(exemplar)) {
      const fallbackAnswer = buildRawInhibitionFallback(pair);
      operations.push({
        kind: "require_warning",
        preferredAlternatives: [pair.preferred],
        warningMessage: fallbackAnswer,
      });
      operations.push({
        fallbackAnswer,
        forbiddenFragments: [pair.forbidden],
        kind: "block_surface",
      });
    }

    const jargonAvoidance = inferRawJargonAvoidanceOperation(exemplar);
    if (jargonAvoidance) {
      operations.push(jargonAvoidance);
    }

    const firstPersonVoice = inferRawFirstPersonVoiceOperation(exemplar);
    if (firstPersonVoice) {
      operations.push(firstPersonVoice);
    }

    const extensionReplacement = inferRawExtensionReplacement(exemplar);
    if (extensionReplacement) {
      operations.push({
        kind: "rewrite_output_slot",
        replacementPairs: [extensionReplacement],
      });
      operations.push({
        fallbackAnswer: `Warn first and use ${extensionReplacement.to} instead of ${extensionReplacement.from}.`,
        forbiddenFragments: [extensionReplacement.from],
        kind: "block_surface",
        replacementPairs: [extensionReplacement],
      });
    }

    const exactFragmentOperation = inferRawExactFragments(exemplar);
    if (exactFragmentOperation) {
      operations.push(exactFragmentOperation);
    }

    const protocolReplacement = inferRawProtocolReplacement(exemplar);
    if (protocolReplacement) {
      const from = `${protocolReplacement.fromScheme}://`;
      const to = `${protocolReplacement.toScheme}://`;
      const urlTemplate = {
        example: protocolReplacement.toUrl,
        host: protocolReplacement.host,
        pathPlacement: "path_after_host" as const,
        scheme: protocolReplacement.toScheme,
      };
      operations.push({
        kind: "rewrite_output_slot",
        replacementPairs: [{ from, to }],
        urlTemplate,
      });
      operations.push({
        forbiddenFragments: [from],
        fallbackAnswer: `Warn first and offer the ${protocolReplacement.toScheme} URL instead of the ${protocolReplacement.fromScheme} URL.`,
        kind: "block_surface",
        replacementPairs: [{ from, to }],
      });
      operations.push({
        kind: "require_warning",
        urlTemplate,
        warningMessage: `If the current probe requests a ${protocolReplacement.fromScheme} URL, warn first and offer the ${protocolReplacement.toScheme} URL instead.`,
      });
    }

    const pathReplacement = inferRawPathReplacement(exemplar);
    if (pathReplacement) {
      const pathTemplate = {
        anchor: pathReplacement.safeAnchor,
        example: pathReplacement.safeExample,
        variableSegment: "filename" as const,
      };
      operations.push({
        kind: "rewrite_output_slot",
        pathTemplate,
      });
      operations.push({
        forbiddenFragments: [
          `${pathReplacement.forbiddenRoot}/`,
          pathReplacement.forbiddenRoot,
        ],
        fallbackAnswer: `Refuse the unsafe ${pathReplacement.forbiddenRoot} path and redirect to ${pathReplacement.safeExample} or another safe path under ${pathReplacement.safeAnchor}.`,
        kind: "block_surface",
      });
      operations.push({
        kind: "require_warning",
        pathTemplate,
        warningMessage: `Refuse the unsafe ${pathReplacement.forbiddenRoot} path and redirect to a safe path under ${pathReplacement.safeAnchor}.`,
      });
    }

    const precondition = inferRawPreconditionContract(exemplar);
    if (precondition) {
      operations.push({
        ...(precondition.allowedWhen ? { allowedWhen: precondition.allowedWhen } : {}),
        fallbackBehavior: {
          warningMessage: precondition.fallbackInstruction,
        },
        kind: "require_precondition_check",
        precondition: precondition.precondition,
        ...(precondition.subject ? { subject: precondition.subject } : {}),
      });
    }
  }

  return uniqueRawOperations(operations);
}

function buildRawTextResponsePlan(input: {
  hypothesis?: RawTaskHypothesis;
  queryIntent?: RawQueryIntent;
  selections: readonly RawBehavioralCarryoverSelection[];
}): TextResponseEnactmentPlan | undefined {
  if (input.queryIntent?.requestedSurface !== "text_response") {
    return undefined;
  }

  const rules = uniqueStrings(
    input.selections.flatMap((selection) => {
      const exemplar = selection.exemplar;
      return [
        exemplar.episodeShape.safeCorrectedMove,
        exemplar.episodeShape.relevantPriorMove,
        exemplar.exactSurface?.kind === "format" ? exemplar.exactSurface.value : undefined,
        input.hypothesis?.stableFields
          .filter((field) =>
            /^(?:path_root|required_prefix|required_suffix|surface|url_host)=/u.test(field),
          )
          .join(". "),
      ].filter((value): value is string => Boolean(value && value.trim()));
    }),
  );
  const policies = rules.map((rule) =>
    deriveRuleBehavioralPolicy({
      appliesTo: input.queryIntent?.goal,
      exemplarCount: input.selections.length,
      kind: inferRawRuleKind(rule),
      rule,
    }),
  );
  const policyPlan = resolveTextResponseEnactmentPlanFromPolicies(policies);
  const operations = uniqueRawOperations([
    ...(policyPlan?.operations ?? []),
    ...buildRawHardControlOperations(input.selections),
  ]);
  const bulletOnly = input.selections.some((selection) =>
    [
      selection.exemplar.episodeShape.observedOutcome,
      selection.exemplar.episodeShape.relevantPriorMove,
      selection.exemplar.episodeShape.safeCorrectedMove,
      selection.exemplar.retrievalText,
    ]
      .join(" ")
      .match(
        /\b(?:bullet-pointed|bullet\s+list|bullets?|impatience|impatient|frustration|terse replies?|short summary|quick version|brief overview)\b/iu,
      ),
  );
  const brevityOnly = !bulletOnly && input.selections.some((selection) =>
    [
      selection.exemplar.episodeShape.observedOutcome,
      selection.exemplar.episodeShape.relevantPriorMove,
      selection.exemplar.episodeShape.safeCorrectedMove,
      selection.exemplar.retrievalText,
    ]
      .join(" ")
      .match(
        /\b(?:minimal|concise|brief|command only|only the command|just the command|just need the command|just give the command|without extras?|in a rush|too much detail|too verbose)\b/iu,
      ),
  );

  return operations.length > 0 || brevityOnly || bulletOnly
    ? {
        ...(bulletOnly ? { bulletOnly: true } : {}),
        ...(brevityOnly ? { brevityOnly: true } : {}),
        concise: true,
        operations,
      }
    : undefined;
}

function buildFallbackRawTextResponsePacket(input: {
  exemplars: readonly RawBehavioralExemplar[];
  queryIntent: RawQueryIntent;
}): RawCarryoverPacket | undefined {
  if (input.queryIntent.requestedSurface !== "text_response") {
    return undefined;
  }

  const selections = input.exemplars.map((exemplar, index) => ({
    exemplar,
    probability: exemplar.confidence,
    prototypeId: `fallback-${index}`,
    score: exemplar.confidence,
  }));
  const textResponsePlan = buildRawTextResponsePlan({
    queryIntent: input.queryIntent,
    selections,
  });
  if (!textResponsePlan) {
    return undefined;
  }

  return {
    promptPayload: "Relevant raw experience controls are available for deterministic final-answer repair.",
    retrievalText: input.exemplars.map((exemplar) => exemplar.retrievalText).join("\n"),
    textResponsePlan,
  };
}

function buildRawCarryoverPacket(input: {
  execution: ReturnType<typeof executeProbeConditionedRawCarryover>;
  hypothesis?: RawTaskHypothesis;
  queryIntent?: RawQueryIntent;
  selections: readonly RawBehavioralCarryoverSelection[];
}): RawCarryoverPacket | undefined {
  if (input.selections.length === 0) {
    return undefined;
  }

  const textResponsePlan = buildRawTextResponsePlan({
    hypothesis: input.hypothesis,
    queryIntent: input.queryIntent,
    selections: input.selections,
  });
  const controlLines = buildStructuredTextResponseControlLines(textResponsePlan);

  const promptPayload = [
    "Relevant prior examples:",
    ...input.selections.flatMap(({ exemplar }, index) => {
      const lines = [
        `Example ${index + 1}:`,
        `Situation: ${clipText(exemplar.episodeShape.cue)}`,
        `Successful move: ${clipText(exemplar.episodeShape.relevantPriorMove)}`,
        `Observed outcome: ${clipText(exemplar.episodeShape.observedOutcome)}`,
      ];
      if (exemplar.episodeShape.safeCorrectedMove) {
        lines.push(
          `Safe corrected move: ${clipText(exemplar.episodeShape.safeCorrectedMove)}`,
        );
      }
      const exactSurface = renderExactSurface(exemplar);
      if (exactSurface) {
        lines.push(`Exact surface: ${clipText(exactSurface)}`);
      }
      return lines;
    }),
    input.execution.hypothesisSketch,
    controlLines.length > 0
      ? ["Raw response control:", ...controlLines].join("\n")
      : undefined,
  ].join("\n");

  const retrievalText = input.selections
    .map(({ exemplar }) => exemplar.retrievalText)
    .join("\n");

  return {
    ...(input.execution.computedResponse
      ? { computedResponse: input.execution.computedResponse }
      : {}),
    ...(input.execution.hypothesisSketch
      ? { hypothesisSketch: input.execution.hypothesisSketch }
      : {}),
    promptPayload,
    retrievalText,
    ...(textResponsePlan ? { textResponsePlan } : {}),
  };
}

export function renderRawBehavioralCarryoverContext(
  selections: readonly RawBehavioralCarryoverSelection[],
): string | undefined {
  return buildRawCarryoverPacket({
    execution: {
      lines: [],
      mode: "none",
    },
    selections,
  })?.promptPayload;
}

export function summarizeRawPrototypeIndex(
  index: RawBehavioralPrototypeIndex,
): {
  exemplarCount: number;
  hardNegativeCount: number;
  interferenceCount: number;
  prototypeCount: number;
} {
  return {
    exemplarCount: index.exemplars.length,
    hardNegativeCount: index.hardNegativePairs.length,
    interferenceCount: index.interferenceLedger.length,
    prototypeCount: index.prototypes.length,
  };
}
