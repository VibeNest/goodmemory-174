import { createHmac } from "node:crypto";
import type {
  GoodMemory,
  RecallInput,
  RecallResult,
} from "../api/contracts";
import type { MemoryScope } from "../domain/scope";
import { scopeToKey } from "../domain/scope";

const DEFAULT_INDEX_LIMIT = 24;
const DEFAULT_DETAIL_PREVIEW_CHARS = 1_200;
const MAX_VISIBLE_RECORDS_PER_SCOPE = 100;

export type ProgressiveRecordKind =
  | "profile"
  | "preference"
  | "fact"
  | "feedback"
  | "episode"
  | "evidence"
  | "experience"
  | "reference"
  | "archive"
  | "proposal"
  | "promotion"
  | "runtime-journal"
  | "runtime-spill"
  | "writeback-event";

export type GoodMemoryRecordRef =
  `gmrec:v1:${string}:${ProgressiveRecordKind}:${string}`;

export interface ParsedGoodMemoryRecordRef {
  id: string;
  recordKind: ProgressiveRecordKind;
  scopeDigest: string;
}

export interface EncodeGoodMemoryRecordRefInput {
  id: string;
  recordKind: ProgressiveRecordKind;
  scopeDigest: string;
}

export interface ProgressiveRecallMemory {
  recall(input: RecallInput): Promise<RecallResult>;
}

export interface CreateProgressiveRecallServiceInput {
  memory: Pick<GoodMemory, "recall"> | ProgressiveRecallMemory;
  scopeDigestSecret: string;
  maxDetailPreviewChars?: number;
  now?: () => Date;
}

export interface SearchRecallIndexInput {
  scope: MemoryScope;
  query?: string;
  includeRuntime?: boolean;
  limit?: number;
  retrievalProfile?: RecallInput["retrievalProfile"];
}

export interface ProgressiveRecallIndexRecord {
  recordRef: GoodMemoryRecordRef;
  recordKind: ProgressiveRecordKind;
  title: string;
  summary: string;
  occurredAt?: string;
  score: number;
  estimatedDetailTokens: number;
  estimatedIndexTokens: number;
  source: "durable" | "runtime" | "writeback";
}

export interface ProgressiveRecallIndex {
  generatedAt: string;
  query?: string;
  records: ProgressiveRecallIndexRecord[];
  scopeDigest: string;
  totalRecordCount: number;
}

export interface BuildRecallTimelineInput extends SearchRecallIndexInput {
  recordsPerBucket?: number;
}

export interface ProgressiveRecallTimelineBucket {
  label: string;
  records: ProgressiveRecallIndexRecord[];
}

export interface ProgressiveRecallTimeline {
  buckets: ProgressiveRecallTimelineBucket[];
  scopeDigest: string;
  totalRecordCount: number;
}

export interface GetProgressiveRecordsInput {
  scope: MemoryScope;
  recordRefs: string[];
}

export interface ProgressiveRecordDetail {
  recordRef: GoodMemoryRecordRef;
  recordKind: ProgressiveRecordKind;
  title: string;
  summary: string;
  occurredAt?: string;
  detail: Record<string, unknown>;
  estimatedTokens: number;
}

export interface GetProgressiveRecordsResult {
  records: ProgressiveRecordDetail[];
  scopeDigest: string;
}

export interface RenderProgressiveContextInput {
  index: ProgressiveRecallIndex;
  query?: string;
  retrievalProfile?: RecallInput["retrievalProfile"];
  maxRecords?: number;
  maxTokens?: number;
}

export interface RenderProgressiveContextResult {
  content: string;
  estimatedTokens: number;
  omittedRecordCount: number;
}

export interface ProgressiveRecallService {
  searchRecallIndex(input: SearchRecallIndexInput): Promise<ProgressiveRecallIndex>;
  buildRecallTimeline(input: BuildRecallTimelineInput): Promise<ProgressiveRecallTimeline>;
  getProgressiveRecords(
    input: GetProgressiveRecordsInput,
  ): Promise<GetProgressiveRecordsResult>;
  renderProgressiveContext(
    input: RenderProgressiveContextInput,
  ): RenderProgressiveContextResult;
}

interface CandidateRecord {
  detail: Record<string, unknown>;
  id: string;
  occurredAt?: string;
  recordKind: ProgressiveRecordKind;
  required?: boolean;
  source: "durable" | "runtime" | "writeback";
  summary: string;
  title: string;
}

interface VisibleCandidateEntry {
  candidate: CandidateRecord;
  lastSeenAt: number;
}

const RECORD_KINDS = new Set<ProgressiveRecordKind>([
  "profile",
  "preference",
  "fact",
  "feedback",
  "episode",
  "evidence",
  "experience",
  "reference",
  "archive",
  "proposal",
  "promotion",
  "runtime-journal",
  "runtime-spill",
  "writeback-event",
]);

export function encodeGoodMemoryRecordRef(
  input: EncodeGoodMemoryRecordRefInput,
): GoodMemoryRecordRef {
  if (!RECORD_KINDS.has(input.recordKind)) {
    throw new Error(`Unsupported GoodMemory record kind: ${input.recordKind}`);
  }

  if (!input.scopeDigest || input.scopeDigest.includes(":")) {
    throw new Error("GoodMemory recordRef requires a non-empty colon-free scopeDigest.");
  }

  if (!input.id) {
    throw new Error("GoodMemory recordRef requires a non-empty id.");
  }

  return `gmrec:v1:${input.scopeDigest}:${input.recordKind}:${encodeURIComponent(
    input.id,
  )}` as GoodMemoryRecordRef;
}

export function parseGoodMemoryRecordRef(
  value: string,
): ParsedGoodMemoryRecordRef | null {
  const match = /^gmrec:v1:([^:]+):([^:]+):(.+)$/u.exec(value);
  if (!match) {
    return null;
  }

  const [, scopeDigest, recordKind, encodedId] = match;
  if (!RECORD_KINDS.has(recordKind as ProgressiveRecordKind)) {
    return null;
  }

  try {
    return {
      id: decodeURIComponent(encodedId),
      recordKind: recordKind as ProgressiveRecordKind,
      scopeDigest,
    };
  } catch {
    return null;
  }
}

export function buildProgressiveScopeDigest(input: {
  scope: MemoryScope;
  secret: string;
}): string {
  return `scope_${createHmac("sha256", input.secret)
    .update(scopeToKey(input.scope))
    .digest("hex")
    .slice(0, 32)}`;
}

export function createProgressiveRecallService(
  input: CreateProgressiveRecallServiceInput,
): ProgressiveRecallService {
  if (input.scopeDigestSecret.trim().length < 16) {
    throw new Error("ProgressiveRecallService requires a stable scopeDigestSecret.");
  }

  const maxDetailPreviewChars =
    input.maxDetailPreviewChars ?? DEFAULT_DETAIL_PREVIEW_CHARS;
  const now = input.now ?? (() => new Date());
  const visibleCandidatesByScopeDigest = new Map<
    string,
    Map<string, VisibleCandidateEntry>
  >();

  async function loadCandidates(options: {
    includeRuntime?: boolean;
    query?: string;
    retrievalProfile?: RecallInput["retrievalProfile"];
    scope: MemoryScope;
  }): Promise<{
    candidates: CandidateRecord[];
    generatedAt: string;
    scopeDigest: string;
  }> {
    const retrievalProfile =
      options.retrievalProfile ??
      (options.includeRuntime === true ? "coding_agent" : undefined);
    const recall = await input.memory.recall({
      retrievalProfile,
      query: options.query ?? "",
      scope: options.scope,
    });
    const scopeDigest = buildProgressiveScopeDigest({
      scope: options.scope,
      secret: input.scopeDigestSecret,
    });

    return {
      candidates: collectCandidates({
        includeRuntime: options.includeRuntime,
        maxDetailPreviewChars,
        recall,
        scope: options.scope,
      }),
      generatedAt: now().toISOString(),
      scopeDigest,
    };
  }

  function rememberVisibleCandidates(input: {
    includeRuntime?: boolean;
    scopeDigest: string;
    selected: Array<{
      candidate: CandidateRecord;
      record: ProgressiveRecallIndexRecord;
    }>;
  }): void {
    const current =
      visibleCandidatesByScopeDigest.get(input.scopeDigest) ??
      new Map<string, VisibleCandidateEntry>();
    if (input.includeRuntime !== true) {
      for (const [recordRef, entry] of current) {
        if (entry.candidate.source === "runtime") {
          current.delete(recordRef);
        }
      }
    }
    const lastSeenAt = now().getTime();
    for (const item of input.selected) {
      current.set(item.record.recordRef, {
        candidate: item.candidate,
        lastSeenAt,
      });
    }
    pruneVisibleCandidates(current);
    visibleCandidatesByScopeDigest.set(input.scopeDigest, current);
  }

  async function searchRecallIndex(
    options: SearchRecallIndexInput,
  ): Promise<ProgressiveRecallIndex> {
    const { candidates, generatedAt, scopeDigest } = await loadCandidates({
      includeRuntime: options.includeRuntime,
      query: options.query,
      retrievalProfile: options.retrievalProfile,
      scope: options.scope,
    });
    const ranked = candidates
      .map((candidate) => ({
        candidate,
        record: toIndexRecord({
          candidate,
          query: options.query,
          scopeDigest,
        }),
      }))
      .sort((left, right) => compareIndexRecords(left.record, right.record));
    const selected = selectIndexRecords({
      limit: options.limit ?? DEFAULT_INDEX_LIMIT,
      ranked,
    });
    rememberVisibleCandidates({
      includeRuntime: options.includeRuntime,
      scopeDigest,
      selected,
    });

    return {
      generatedAt,
      query: options.query,
      records: selected.map((item) => item.record),
      scopeDigest,
      totalRecordCount: candidates.length,
    };
  }

  async function buildRecallTimeline(
    options: BuildRecallTimelineInput,
  ): Promise<ProgressiveRecallTimeline> {
    const index = await searchRecallIndex(options);
    const recordsPerBucket = options.recordsPerBucket ?? 6;
    const groups = new Map<string, ProgressiveRecallIndexRecord[]>();

    for (const record of index.records) {
      const label = buildTimelineLabel(record.occurredAt);
      const bucket = groups.get(label) ?? [];
      if (bucket.length < recordsPerBucket) {
        bucket.push(record);
      }
      groups.set(label, bucket);
    }

    return {
      buckets: Array.from(groups, ([label, records]) => ({ label, records })),
      scopeDigest: index.scopeDigest,
      totalRecordCount: index.totalRecordCount,
    };
  }

  async function getProgressiveRecords(
    options: GetProgressiveRecordsInput,
  ): Promise<GetProgressiveRecordsResult> {
    const scopeDigest = buildProgressiveScopeDigest({
      scope: options.scope,
      secret: input.scopeDigestSecret,
    });
    const visibleCandidates =
      visibleCandidatesByScopeDigest.get(scopeDigest) ??
      new Map<string, VisibleCandidateEntry>();

    const records: ProgressiveRecordDetail[] = [];
    for (const recordRef of options.recordRefs) {
      const parsed = parseGoodMemoryRecordRef(recordRef);
      if (!parsed) {
        throw new Error(`Invalid GoodMemory recordRef: ${recordRef}`);
      }
      if (parsed.scopeDigest !== scopeDigest) {
        throw new Error(
          `GoodMemory recordRef ${recordRef} does not belong to the requested scope.`,
        );
      }

      const visible = visibleCandidates.get(recordRef);
      if (!visible) {
        throw new Error(
          `GoodMemory recordRef ${recordRef} is not available in the current progressive recall visibility set.`,
        );
      }
      const candidate = visible.candidate;

      const detail = {
        occurredAt: candidate.occurredAt,
        recordKind: candidate.recordKind,
        recordRef: recordRef as GoodMemoryRecordRef,
        title: candidate.title,
        summary: candidate.summary,
        detail: candidate.detail,
        estimatedTokens: estimateTokens(JSON.stringify(candidate.detail)),
      };
      records.push(detail);
    }

    return {
      records,
      scopeDigest,
    };
  }

  return {
    searchRecallIndex,
    buildRecallTimeline,
    getProgressiveRecords,
    renderProgressiveContext(
      options: RenderProgressiveContextInput,
    ): RenderProgressiveContextResult {
      const maxRecords = options.maxRecords ?? 10;
      const maxTokens = options.maxTokens
        ? Math.max(1, Math.floor(options.maxTokens))
        : undefined;
      const candidateRecords = options.index.records.slice(0, maxRecords);
      const header = buildProgressiveContextHeader(options, Boolean(maxTokens));
      const lines: string[] = [];

      for (const record of candidateRecords) {
        const line = findBudgetedRecordLine({
          header,
          lines,
          maxTokens,
          record,
          recordIndex: lines.length,
        });
        if (!line) {
          break;
        }
        lines.push(line);
      }

      const omittedRecordCount = Math.max(0, options.index.records.length - lines.length);
      const footer =
        omittedRecordCount > 0 && !wouldExceedTokenBudget({
          header,
          lines,
          maxTokens,
          footer: [`omitted records: ${omittedRecordCount}`],
        })
          ? [`omitted records: ${omittedRecordCount}`]
          : [];
      const content = [...header, ...lines, ...footer].join("\n");
      const budgetedContent = enforceTokenBudget(content, maxTokens);

      return {
        content: budgetedContent,
        estimatedTokens: estimateTokens(budgetedContent),
        omittedRecordCount,
      };
    },
  };
}

function collectCandidates(input: {
  includeRuntime?: boolean;
  maxDetailPreviewChars: number;
  recall: RecallResult;
  scope: MemoryScope;
}): CandidateRecord[] {
  const records: CandidateRecord[] = [];
  const add = (candidate: CandidateRecord): void => {
    records.push(redactCandidate(candidate, input.scope, input.maxDetailPreviewChars));
  };

  const profile = input.recall.profile;
  if (profile) {
    add({
      detail: {
        activeContext: profile.activeContext,
        expertise: profile.expertise,
        identity: redactScopeObject(profile.identity, input.scope),
        version: profile.version,
      },
      id: "profile",
      occurredAt: profile.updatedAt,
      recordKind: "profile",
      source: "durable",
      summary: [
        ...profile.activeContext.goals,
        ...profile.activeContext.currentProjects,
      ].join("; "),
      title: "User profile",
    });
  }

  for (const preference of input.recall.preferences) {
    add({
      detail: {
        category: preference.category,
        confidence: preference.confidence,
        lifecycle: preference.lifecycle,
        tags: preference.tags,
        value: preference.value,
      },
      id: preference.id,
      occurredAt: preference.updatedAt,
      recordKind: "preference",
      source: "durable",
      summary: stringifyValue(preference.value),
      title: `Preference: ${preference.category}`,
    });
  }

  for (const fact of input.recall.facts) {
    add({
      detail: {
        category: fact.category,
        confidence: fact.confidence,
        content: fact.content,
        factKind: fact.factKind,
        importance: fact.importance,
        lifecycle: fact.lifecycle,
        subject: fact.subject,
        tags: fact.tags,
      },
      id: fact.id,
      occurredAt: fact.updatedAt,
      recordKind: "fact",
      source: "durable",
      summary: fact.content,
      title: buildTitle("Fact", fact.subject ?? fact.category),
    });
  }

  for (const feedback of input.recall.feedback) {
    add({
      detail: {
        appliesTo: feedback.appliesTo,
        confidence: feedback.confidence,
        kind: feedback.kind,
        lifecycle: feedback.lifecycle,
        rule: feedback.rule,
        tags: feedback.tags,
        why: feedback.why,
      },
      id: feedback.id,
      occurredAt: feedback.updatedAt,
      recordKind: "feedback",
      source: "durable",
      summary: feedback.rule,
      title: `Feedback: ${feedback.kind}`,
    });
  }

  for (const reference of input.recall.references) {
    add({
      detail: {
        confidence: reference.confidence,
        description: reference.description,
        pointer: reference.pointer,
        referenceKind: reference.referenceKind,
        subject: reference.subject,
        tags: reference.tags,
        title: reference.title,
      },
      id: reference.id,
      occurredAt: reference.updatedAt,
      recordKind: "reference",
      source: "durable",
      summary: reference.description ?? reference.pointer,
      title: reference.title,
    });
  }

  for (const episode of input.recall.episodes) {
    add({
      detail: {
        confidence: episode.confidence,
        keyDecisions: episode.keyDecisions,
        summary: episode.summary,
        topics: episode.topics,
        unresolvedItems: episode.unresolvedItems,
      },
      id: episode.id,
      occurredAt: episode.archivedAt ?? episode.createdAt,
      recordKind: "episode",
      source: "durable",
      summary: episode.summary,
      title: "Episode memory",
    });
  }

  for (const archive of input.recall.archives) {
    add({
      detail: {
        keyDecisions: archive.keyDecisions,
        referencedArtifacts: archive.referencedArtifacts,
        sourceSessionCount: archive.sourceSessionIds.length,
        summary: archive.summary,
        unresolvedItems: archive.unresolvedItems,
      },
      id: archive.id,
      occurredAt: archive.archivedAt,
      recordKind: "archive",
      source: "durable",
      summary: archive.summary,
      title: archive.summary,
    });
  }

  for (const evidence of input.recall.evidence) {
    add({
      detail: {
        excerpt: evidence.excerpt,
        kind: evidence.kind,
        linkedArchiveIds: evidence.linkedArchiveIds,
        linkedMemoryIds: evidence.linkedMemoryIds,
        sourceUri: evidence.sourceUri,
      },
      id: evidence.id,
      occurredAt: evidence.createdAt,
      recordKind: "evidence",
      source: "durable",
      summary: evidence.excerpt,
      title: `Evidence: ${evidence.kind}`,
    });
  }

  if (input.includeRuntime === true && input.recall.journal) {
    const journal = input.recall.journal;
    add({
      detail: {
        currentState: journal.currentState,
        errorsAndCorrections: journal.errorsAndCorrections,
        filesAndFunctions: journal.filesAndFunctions,
        keyResults: journal.keyResults,
        learnings: journal.learnings,
        taskSpecification: journal.taskSpecification,
        title: journal.title,
        workflow: journal.workflow,
        worklog: journal.worklog,
      },
      id: "current",
      occurredAt: journal.updatedAt,
      recordKind: "runtime-journal",
      source: "runtime",
      summary: journal.currentState ?? journal.title ?? journal.worklog[0] ?? "Runtime journal",
      title: journal.title ?? "Runtime journal",
    });
  }

  if (input.includeRuntime === true && input.recall.workingMemory) {
    const workingMemory = input.recall.workingMemory;
    add({
      detail: {
        constraints: workingMemory.constraints,
        currentGoal: workingMemory.currentGoal,
        openLoops: workingMemory.openLoops,
        state: workingMemory.state,
        temporaryDecisions: workingMemory.temporaryDecisions,
        toolState: workingMemory.toolState,
      },
      id: "working-memory",
      occurredAt: workingMemory.updatedAt,
      recordKind: "runtime-journal",
      required: true,
      source: "runtime",
      summary: [
        workingMemory.currentGoal
          ? `Goal: ${workingMemory.currentGoal}`
          : undefined,
        workingMemory.openLoops.length > 0
          ? `Open loops: ${workingMemory.openLoops.join(", ")}`
          : undefined,
      ].filter(isPresent).join("; ") || "Working memory",
      title: "Working memory",
    });
  }

  return records;
}

function buildProgressiveContextHeader(
  options: RenderProgressiveContextInput,
  compact: boolean,
): string[] {
  if (compact) {
    return [
      "Progressive GoodMemory Recall",
      `scopeDigest: ${options.index.scopeDigest}`,
      "Use recordRefs with the detail tool when needed.",
    ];
  }

  return [
    "Progressive GoodMemory Recall",
    `query: ${options.query ?? options.index.query ?? "(none)"}`,
    `scopeDigest: ${options.index.scopeDigest}`,
    `retrievalProfile: ${options.retrievalProfile ?? "default"}`,
    "Use recordRef values with the detail tool only when more context is needed.",
  ];
}

function selectIndexRecords(input: {
  limit: number;
  ranked: Array<{
    candidate: CandidateRecord;
    record: ProgressiveRecallIndexRecord;
  }>;
}): Array<{
  candidate: CandidateRecord;
  record: ProgressiveRecallIndexRecord;
}> {
  const limit = Math.max(1, Math.floor(input.limit));
  const selected = new Map<string, {
    candidate: CandidateRecord;
    record: ProgressiveRecallIndexRecord;
  }>();

  for (const item of input.ranked) {
    if (item.candidate.required) {
      selected.set(item.record.recordRef, item);
    }
  }

  for (const item of input.ranked) {
    if (selected.size >= limit) {
      break;
    }
    selected.set(item.record.recordRef, item);
  }

  return Array.from(selected.values()).slice(0, limit);
}

function findBudgetedRecordLine(input: {
  header: string[];
  lines: string[];
  maxTokens?: number;
  record: ProgressiveRecallIndexRecord;
  recordIndex: number;
}): string | null {
  const summaryBudgets = input.maxTokens
    ? [160, 96, 48, 0]
    : [260];
  for (const summaryMaxChars of summaryBudgets) {
    const line = renderProgressiveRecordLine({
      record: input.record,
      recordIndex: input.recordIndex,
      summaryMaxChars,
    });
    if (
      !wouldExceedTokenBudget({
        header: input.header,
        lines: [...input.lines, line],
        maxTokens: input.maxTokens,
      })
    ) {
      return line;
    }
  }

  return null;
}

function renderProgressiveRecordLine(input: {
  record: ProgressiveRecallIndexRecord;
  recordIndex: number;
  summaryMaxChars: number;
}): string {
  const parts = [
    `${input.recordIndex + 1}. ${input.record.title}`,
    `kind: ${input.record.recordKind}`,
    `ref: ${input.record.recordRef}`,
  ];
  if (input.summaryMaxChars > 0) {
    parts.push(`summary: ${clipText(input.record.summary, input.summaryMaxChars)}`);
  }
  parts.push(`detail tokens: ${input.record.estimatedDetailTokens}`);
  return parts.join(" | ");
}

function wouldExceedTokenBudget(input: {
  footer?: string[];
  header: string[];
  lines: string[];
  maxTokens?: number;
}): boolean {
  if (!input.maxTokens) {
    return false;
  }

  return estimateTokens([
    ...input.header,
    ...input.lines,
    ...(input.footer ?? []),
  ].join("\n")) > input.maxTokens;
}

function enforceTokenBudget(content: string, maxTokens: number | undefined): string {
  if (!maxTokens || estimateTokens(content) <= maxTokens) {
    return content;
  }

  const maxChars = Math.max(1, maxTokens * 4);
  if (content.length <= maxChars) {
    return content;
  }
  if (maxChars <= 3) {
    return content.slice(0, maxChars);
  }
  return `${content.slice(0, maxChars - 3).trimEnd()}...`;
}

function toIndexRecord(input: {
  candidate: CandidateRecord;
  query?: string;
  scopeDigest: string;
}): ProgressiveRecallIndexRecord {
  const summary = clipText(input.candidate.summary, 260);
  const title = clipText(input.candidate.title, 120);
  const recordRef = encodeGoodMemoryRecordRef({
    id: input.candidate.id,
    recordKind: input.candidate.recordKind,
    scopeDigest: input.scopeDigest,
  });
  const indexText = [title, summary].join(" ");

  return {
    estimatedDetailTokens: estimateTokens(JSON.stringify(input.candidate.detail)),
    estimatedIndexTokens: estimateTokens(indexText),
    occurredAt: input.candidate.occurredAt,
    recordKind: input.candidate.recordKind,
    recordRef,
    score: scoreText(indexText, input.query),
    source: input.candidate.source,
    summary,
    title,
  };
}

function compareIndexRecords(
  left: ProgressiveRecallIndexRecord,
  right: ProgressiveRecallIndexRecord,
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  return dateValue(right.occurredAt) - dateValue(left.occurredAt);
}

function pruneVisibleCandidates(
  current: Map<string, VisibleCandidateEntry>,
): void {
  if (current.size <= MAX_VISIBLE_RECORDS_PER_SCOPE) {
    return;
  }

  const keep = new Set(
    Array.from(current)
      .sort((left, right) => right[1].lastSeenAt - left[1].lastSeenAt)
      .slice(0, MAX_VISIBLE_RECORDS_PER_SCOPE)
      .map(([recordRef]) => recordRef),
  );
  for (const recordRef of current.keys()) {
    if (!keep.has(recordRef)) {
      current.delete(recordRef);
    }
  }
}

function redactCandidate(
  candidate: CandidateRecord,
  scope: MemoryScope,
  maxDetailPreviewChars: number,
): CandidateRecord {
  return {
    ...candidate,
    detail: truncateDetail(redactScopeObject(candidate.detail, scope), maxDetailPreviewChars),
    summary: redactScopeText(candidate.summary, scope),
    title: redactScopeText(candidate.title, scope),
  };
}

function redactScopeObject(
  value: unknown,
  scope: MemoryScope,
): Record<string, unknown> {
  return sanitizeObject(value, scope) as Record<string, unknown>;
}

function sanitizeObject(value: unknown, scope: MemoryScope): unknown {
  if (typeof value === "string") {
    return redactScopeText(value, scope);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObject(item, scope));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (isRawScopeField(key) || key === "normalizedTranscript") {
        continue;
      }
      result[key] = sanitizeObject(nested, scope);
    }
    return result;
  }

  return value;
}

function truncateDetail(
  detail: Record<string, unknown>,
  maxDetailPreviewChars: number,
): Record<string, unknown> {
  const serialized = JSON.stringify(detail);
  if (serialized.length <= maxDetailPreviewChars) {
    return detail;
  }

  return {
    preview: `${serialized.slice(0, maxDetailPreviewChars)}...`,
    truncated: true,
  };
}

function isRawScopeField(key: string): boolean {
  return [
    "agentId",
    "scope",
    "scopeLineage",
    "sessionId",
    "sourceSessionIds",
    "tenantId",
    "userId",
    "workspaceId",
  ].includes(key);
}

function redactScopeText(value: string, scope: MemoryScope): string {
  const replacements: Array<[string | undefined, string]> = [
    [scope.userId, "[user]"],
    [scope.tenantId, "[tenant]"],
    [scope.workspaceId, "[workspace]"],
    [scope.agentId, "[agent]"],
    [scope.sessionId, "[session]"],
  ];
  let result = value;
  for (const [raw, replacement] of replacements) {
    if (!raw) {
      continue;
    }
    result = result.split(raw).join(replacement);
  }
  return result;
}

function buildTitle(prefix: string, value: string): string {
  return `${prefix}: ${value}`;
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function clipText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function scoreText(text: string, query: string | undefined): number {
  const queryTokens = tokenize(query ?? "");
  if (queryTokens.length === 0) {
    return 0;
  }

  const textTokens = new Set(tokenize(text));
  return queryTokens.reduce(
    (score, token) => score + (textTokens.has(token) ? 1 : 0),
    0,
  );
}

function tokenize(value: string): string[] {
  return Array.from(new Set(value.toLowerCase().match(/[a-z0-9_\-]+/gu) ?? []));
}

function dateValue(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function buildTimelineLabel(value: string | undefined): string {
  if (!value) {
    return "undated";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "undated";
  }

  return new Date(timestamp).toISOString().slice(0, 10);
}
