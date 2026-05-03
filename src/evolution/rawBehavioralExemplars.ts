import type { EpisodeMemory } from "../domain/records";
import type {
  ExperienceRecord,
  SessionArchive,
} from "./contracts";
import {
  formatBehavioralFirstAction,
  parseToolOutcomeMetadata,
} from "./behavioralTelemetry";

export type RawBehavioralSurfaceFamily = "host_action" | "text_response";
export type RawBehavioralTransferMode = "episodic_only" | "prototype_bounded";
export type RawBehavioralExemplarSource =
  | "archive"
  | "episode"
  | "runtime_buffer"
  | "tool_outcome";

interface RawIntentCue {
  actionType: string;
  entityTypes: string[];
  goalTokens: string[];
  requestedSurface: RawBehavioralSurfaceFamily;
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

export interface RawBehavioralRerankerModel {
  bias: number;
  featureNames: string[];
  weights: number[];
}

export interface RawBehavioralPrototypeIndex {
  exemplars: RawBehavioralExemplar[];
  hardNegativePairs: Array<{
    leftPrototypeId: string;
    reason: "exact_surface_conflict" | "intent_conflict";
    rightPrototypeId: string;
  }>;
  model: RawBehavioralRerankerModel;
  prototypes: RawBehavioralPrototype[];
}

export interface RawBehavioralCarryoverSelection {
  exemplar: RawBehavioralExemplar;
  probability: number;
  score: number;
}

interface TrainingSample {
  features: number[];
  label: 0 | 1;
}

interface RankingFeatures {
  exactSurfaceMatch: number;
  interferenceRisk: number;
  intentCompatibility: number;
  lexicalSimilarity: number;
  outcomeUtility: number;
  recencySupport: number;
  repetitionSupport: number;
  surfaceCompatibility: number;
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
    "intentCompatibility",
    "surfaceCompatibility",
    "exactSurfaceMatch",
    "outcomeUtility",
    "interferenceRisk",
    "recencySupport",
    "repetitionSupport",
  ],
  weights: [1.35, 1.45, 0.75, 1.2, 0.9, -1.1, 0.35, 0.55],
};
const HARD_NEGATIVE_MIN_OVERLAP = 0.28;
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
    .map((token) => token.trim())
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

function inferActionType(value: string): string {
  const lower = normalizeText(value).toLowerCase();
  if (/\bhttps?\b|\burl\b|\blink\b/.test(lower)) {
    return "url_rewrite";
  }
  if (/\bpath\b|\bdirectory\b|\/[a-z0-9._/-]+/u.test(lower)) {
    return "path_redirect";
  }
  if (/\bapi\b|\bendpoint\b|\bservice\b/.test(lower)) {
    return "api_route";
  }
  if (/\bsubject\b|\bsign(?:ed|ature| off)?\b|\bdear\b|\bregards\b|\bsincerely\b/.test(lower)) {
    return "format_contract";
  }
  if (/\bcopy\b|\barchive\b|\bsync\b|\bquery\b|\btool\b|\bcommand\b|\bfunction\b/.test(lower)) {
    return "structured_action";
  }
  if (/\bformula\b|\bsequence\b|\boperator\b|\bcompute\b/.test(lower)) {
    return "symbolic_rule";
  }
  if (/\bvoice\b|\bfirst-person\b|\bi\b|\bme\b|\bmy\b/.test(lower)) {
    return "voice_style";
  }

  return "general_response";
}

function inferEntityTypes(value: string): string[] {
  const lower = normalizeText(value).toLowerCase();
  const entities: string[] = [];
  if (/\bhttps?\b|\burl\b|\blink\b/.test(lower)) {
    entities.push("url");
  }
  if (/\bpath\b|\bdirectory\b|\/[a-z0-9._/-]+/u.test(lower)) {
    entities.push("path");
  }
  if (/\bapi\b|\bendpoint\b|\bservice\b/.test(lower)) {
    entities.push("api");
  }
  if (/\bsubject\b|\bsign(?:ed|ature| off)?\b|\bdear\b|\bregards\b|\bsincerely\b/.test(lower)) {
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

function inferSurfaceFamily(value: string): RawBehavioralSurfaceFamily {
  const normalized = normalizeText(value);
  if (
    /\b[a-z_][a-z0-9_]*\([^)]*\)/iu.test(normalized) ||
    /^\/?[A-Za-z0-9._/-]+\s+\/?[A-Za-z0-9._/-]+/u.test(normalized) ||
    /\b(?:copy_file|copy_with_meta|replace_file|sync_bundle|create_archive)\b/iu.test(
      normalized,
    )
  ) {
    return "host_action";
  }

  return "text_response";
}

function extractTextExactSurface(value: string): RawExactSurface | undefined {
  const normalized = normalizeText(value);
  if (!normalized) {
    return undefined;
  }

  const actionMatch = normalized.match(/\b([A-Za-z_][A-Za-z0-9_]*)\((.+)\)/u);
  if (actionMatch?.[0]) {
    const args = actionMatch[2]
      ?.split(/,(?![^\[]*\]|[^()]*\))/u)
      .map((entry) => entry.trim())
      .filter(Boolean);
    return {
      kind: "action",
      value: clipText(actionMatch[0], MAX_RENDERED_EXACT_SURFACE_LENGTH),
      ...(args && args.length > 0 ? { args } : {}),
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

function createIntentCue(
  query: string,
  surfaceFamily: RawBehavioralSurfaceFamily,
): RawIntentCue {
  return {
    actionType: inferActionType(query),
    entityTypes: inferEntityTypes(query),
    goalTokens: tokenize(query).slice(0, 12),
    requestedSurface: surfaceFamily,
  };
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
      observedOutcome: clipText(input.observedOutcome),
      relevantPriorMove: clipText(input.successfulMove),
      ...(input.safeCorrectedMove
        ? { safeCorrectedMove: clipText(input.safeCorrectedMove) }
        : {}),
    },
    exactSurface: input.exactSurface,
    id: input.id,
    intentCue: createIntentCue(input.cue, input.surfaceFamily),
    interferenceTags: buildInterferenceTags(input.cue, input.exactSurface),
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
  if (/\b(?:timed out|permission denied|failed|failure|error|denied)\b/iu.test(normalized)) {
    return normalized;
  }

  return undefined;
}

function parseSystemCorrection(content: string): string | undefined {
  const normalized = normalizeText(content);
  const taggedMatch = normalized.match(
    /^(?:user\s+)?correction\s*:\s*(.+)$/iu,
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
    const followupAssistantMove =
      fourth?.role === "user" &&
      fifth?.role === "assistant" &&
      (Boolean(failureOutcome) || looksLikeCorrectionPrompt(fourth.content))
        ? normalizeText(fifth.content)
        : undefined;
    const correctedMove = followupAssistantMove ?? correctionInstruction;
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

    const cue = normalizeText(archive.summary);
    const successfulMove = normalizeText(archive.keyDecisions[0] ?? archive.summary);
    if (!cue || !successfulMove) {
      continue;
    }

    exemplars.push(
      createExemplar({
        createdAt: archive.archivedAt,
        cue,
        exactSurface: extractTextExactSurface(successfulMove),
        id: `archive-${archive.id}`,
        observedOutcome: archive.unresolvedItems.length === 0
          ? "The archived interaction resolved the issue without leaving open loops."
          : `The archived interaction still left these open loops: ${archive.unresolvedItems.join(", ")}`,
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
    const cue = normalizeText(episode.summary);
    const successfulMove = normalizeText(
      episode.keyDecisions[0] ?? episode.summary,
    );
    if (!cue || !successfulMove) {
      continue;
    }

    exemplars.push(
      createExemplar({
        createdAt: episode.createdAt,
        cue,
        exactSurface: extractTextExactSurface(successfulMove),
        id: `episode-${episode.id}`,
        observedOutcome: episode.unresolvedItems.length === 0
          ? "The episode captured a resolved successful response pattern."
          : `The episode preserved these remaining caveats: ${episode.unresolvedItems.join(", ")}`,
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
    exemplar.intentCue.actionType,
    exemplar.intentCue.entityTypes.join(","),
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
        left.intentCue.goalTokens,
        right.intentCue.goalTokens,
      );
      if (overlap < HARD_NEGATIVE_MIN_OVERLAP) {
        continue;
      }

      const exactConflict =
        exactSurfaceKey(left.exactSurface) !== exactSurfaceKey(right.exactSurface);
      const intentConflict = left.intentCue.actionType !== right.intentCue.actionType;
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

function computeRankingFeatures(input: {
  hardNegativeIds: readonly string[];
  prototype: RawBehavioralPrototype;
  prototypesById: Map<string, RawBehavioralPrototype>;
  query: string;
  surfaceFamily: RawBehavioralSurfaceFamily;
}): RankingFeatures {
  const queryTokens = tokenize(input.query);
  const lexicalSimilarity = lexicalOverlap(
    queryTokens,
    tokenize(
      `${input.prototype.representative.episodeShape.cue} ${input.prototype.representative.episodeShape.relevantPriorMove}`,
    ),
  );
  const queryCue = createIntentCue(input.query, input.surfaceFamily);
  const intentCompatibility =
    (queryCue.actionType === input.prototype.intentCue.actionType ? 0.55 : 0) +
    lexicalOverlap(queryCue.goalTokens, input.prototype.intentCue.goalTokens) * 0.3 +
    lexicalOverlap(queryCue.entityTypes, input.prototype.intentCue.entityTypes) * 0.15;
  const surfaceCompatibility =
    queryCue.requestedSurface === input.prototype.surfaceFamily ? 1 : 0;
  const exactSurfaceMatch = input.prototype.exactSurface
    ? lexicalOverlap(
        queryTokens,
        tokenize(input.prototype.exactSurface.value),
      )
    : 0;
  const outcomeUtility = Math.min(
    1,
    input.prototype.successSupport / Math.max(1, input.prototype.repetitionSupport),
  );
  const repetitionSupport = Math.min(
    1,
    Math.log1p(input.prototype.repetitionSupport) / Math.log(5),
  );
  const recencySupport = input.prototype.representative.createdAt
    ? 1 /
      (1 +
        Math.max(
          0,
          (Date.now() - new Date(input.prototype.representative.createdAt).getTime()) /
            (1000 * 60 * 60 * 24 * 30),
        ))
    : 0.45;
  const interferenceRisk = input.hardNegativeIds.reduce((worst, negativeId) => {
    const negative = input.prototypesById.get(negativeId);
    if (!negative) {
      return worst;
    }
    const overlap = lexicalOverlap(queryTokens, negative.intentCue.goalTokens);
    return Math.max(worst, overlap);
  }, 0);

  return {
    exactSurfaceMatch,
    interferenceRisk,
    intentCompatibility: Math.min(1, intentCompatibility),
    lexicalSimilarity,
    outcomeUtility,
    recencySupport,
    repetitionSupport,
    surfaceCompatibility,
  };
}

function featuresToVector(features: RankingFeatures): number[] {
  return [
    features.lexicalSimilarity,
    features.intentCompatibility,
    features.surfaceCompatibility,
    features.exactSurfaceMatch,
    features.outcomeUtility,
    features.interferenceRisk,
    features.recencySupport,
    features.repetitionSupport,
  ];
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function trainReranker(
  prototypes: readonly RawBehavioralPrototype[],
  hardNegativePairs: readonly RawBehavioralPrototypeIndex["hardNegativePairs"][number][],
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

  const samples: TrainingSample[] = [];
  for (const prototype of prototypes) {
    const positiveFeatures = computeRankingFeatures({
      hardNegativeIds: hardNegativesByPrototype.get(prototype.id) ?? [],
      prototype,
      prototypesById,
      query: prototype.representative.episodeShape.cue,
      surfaceFamily: prototype.surfaceFamily,
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
        hardNegativeIds: hardNegativesByPrototype.get(negative.id) ?? [],
        prototype: negative,
        prototypesById,
        query: prototype.representative.episodeShape.cue,
        surfaceFamily: prototype.surfaceFamily,
      });
      samples.push({
        features: featuresToVector(negativeFeatures),
        label: 0,
      });
    }
  }

  if (samples.length < 4) {
    return DEFAULT_MODEL;
  }

  const weights = [...DEFAULT_MODEL.weights];
  let bias = DEFAULT_MODEL.bias;
  const learningRate = 0.18;
  const epochs = 60;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (const sample of samples) {
      const prediction = sigmoid(
        bias +
          sample.features.reduce(
            (total, feature, index) => total + feature * (weights[index] ?? 0),
            0,
          ),
      );
      const error = sample.label - prediction;
      bias += learningRate * error;
      for (let index = 0; index < weights.length; index += 1) {
        weights[index] = (weights[index] ?? 0) + learningRate * error * sample.features[index]!;
      }
    }
  }

  return {
    bias,
    featureNames: [...DEFAULT_MODEL.featureNames],
    weights,
  };
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

  return {
    exemplars,
    hardNegativePairs,
    model: trainReranker(hydratedPrototypes, hardNegativePairs),
    prototypes: hydratedPrototypes,
  };
}

export function selectRawBehavioralExemplars(
  input: SelectRawBehavioralExemplarsInput,
): RawBehavioralCarryoverSelection[] {
  const prototypes = input.index.prototypes.filter(
    (prototype) => prototype.surfaceFamily === input.surfaceFamily,
  );
  if (prototypes.length === 0) {
    return [];
  }

  const prototypesById = new Map(
    prototypes.map((prototype) => [prototype.id, prototype] as const),
  );
  const ranked = prototypes.map((prototype) => {
    const features = computeRankingFeatures({
      hardNegativeIds: prototype.hardNegativeIds,
      prototype,
      prototypesById,
      query: input.query,
      surfaceFamily: input.surfaceFamily,
    });
    const featureVector = featuresToVector(features);
    const score =
      input.index.model.bias +
      featureVector.reduce(
        (total, feature, index) =>
          total + feature * (input.index.model.weights[index] ?? 0),
        0,
      );
    const probability = sigmoid(score);

    return {
      exemplar: prototype.transferMode === "prototype_bounded"
        ? {
            ...prototype.representative,
            confidence: prototype.confidence,
            sourceIds: uniqueStrings(
              prototype.exemplars.flatMap((exemplar) => exemplar.sourceIds),
            ),
            transferMode: "prototype_bounded" as const,
          }
        : prototype.representative,
      probability,
      score,
    };
  }).sort((left, right) => right.score - left.score);

  const [first, second] = ranked;
  if (!first || first.probability < DEFAULT_ABSTAIN_THRESHOLD) {
    return [];
  }
  if (
    second &&
    first.probability - second.probability < DEFAULT_ABSTAIN_MARGIN &&
    second.probability >= DEFAULT_ABSTAIN_THRESHOLD - 0.05
  ) {
    return [];
  }

  return ranked
    .filter((entry) => entry.probability >= DEFAULT_ABSTAIN_THRESHOLD)
    .slice(0, input.maxExemplars ?? 4);
}

function renderExactSurface(exemplar: RawBehavioralExemplar): string | undefined {
  if (!exemplar.exactSurface || exemplar.confidence < 0.72) {
    return undefined;
  }

  return exemplar.exactSurface.value;
}

export function renderRawBehavioralCarryoverContext(
  selections: readonly RawBehavioralCarryoverSelection[],
): string | undefined {
  if (selections.length === 0) {
    return undefined;
  }

  const hasHostActionExemplar = selections.some(
    ({ exemplar }) => exemplar.surfaceFamily === "host_action",
  );

  return [
    "Behavioral carryover exemplars:",
    "Apply these exemplars implicitly. Do not mention memory, learned rules, or earlier notes unless directly asked.",
    ...(hasHostActionExemplar
      ? [
          "When a current request matches a direct action exemplar, emit the action itself on the first line with no prose preface, Markdown fence, or explanation.",
        ]
      : []),
    ...selections.flatMap(({ exemplar }, index) => {
      const lines = [
        `Exemplar ${index + 1}:`,
        `- situation: ${clipText(exemplar.episodeShape.cue)}`,
        `- successful move: ${clipText(exemplar.episodeShape.relevantPriorMove)}`,
        `- observed outcome: ${clipText(exemplar.episodeShape.observedOutcome)}`,
      ];
      if (exemplar.episodeShape.safeCorrectedMove) {
        lines.push(
          `- safe corrected move: ${clipText(exemplar.episodeShape.safeCorrectedMove)}`,
        );
      }
      const exactSurface = renderExactSurface(exemplar);
      if (exactSurface) {
        lines.push(`- exact surface: ${clipText(exactSurface)}`);
      }
      return lines;
    }),
  ].join("\n");
}

export function summarizeRawPrototypeIndex(
  index: RawBehavioralPrototypeIndex,
): {
  exemplarCount: number;
  hardNegativeCount: number;
  prototypeCount: number;
} {
  return {
    exemplarCount: index.exemplars.length,
    hardNegativeCount: index.hardNegativePairs.length,
    prototypeCount: index.prototypes.length,
  };
}
