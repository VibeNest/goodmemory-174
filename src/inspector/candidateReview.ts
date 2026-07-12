import { randomBytes } from "node:crypto";
import type { GoodMemory } from "../api/contracts";
import type { MemoryScope } from "../domain/scope";
import { scopeToKey } from "../domain/scope";
import { isRecord } from "../install/hostConfigValidation";
import { buildWritebackScopeDigest } from "../install/hostWritebackAuditLedger";
import { appendInspectorAuditEvent } from "./auditLog";
import { redactScopeText, redactViewerText } from "./redaction";
import {
  getReviewCandidate,
  isReviewCandidateApprovalStale,
  type InspectorReviewCandidate,
  type InspectorReviewCandidateStatus,
  listReviewCandidates,
  releaseReviewCandidateApproval,
  reserveReviewCandidateApproval,
  updateReviewCandidateStatus,
} from "../install/hostReviewQueue";

// Approve/reject the pending review queue. Approve promotes the bounded
// candidate statement to durable memory through the public remember() API with
// a `remember: "always"` annotation (the same force-add the selective writeback
// path uses); reject drops it. Both are audit-logged.

export interface CandidateReviewDeps {
  memory: Pick<GoodMemory, "remember">;
  homeRoot?: string;
  now?: () => Date;
  newActionId?: () => string;
}

// MessageAnnotation.kindHint excludes "episode"/"noise"; episodes fall back to
// an unhinted force-add.
const KIND_HINTS = new Set(["preference", "fact", "feedback", "reference"]);

export type InspectorCandidateSource = "review-queue" | "observed-ledger";

export interface InspectorCandidateView {
  id: string;
  source: InspectorCandidateSource;
  approvable: boolean;
  recoverable?: boolean;
  kind: string;
  contentPreview: string;
  reason: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  host: string;
  origin: string;
}

export interface ApproveCandidateResult {
  status:
    | "approved"
    | "approval_failed"
    | "not_found"
    | "not_pending"
    | "scope_mismatch"
    | "rejected_by_governance";
  memoryIds: string[];
  candidate?: InspectorReviewCandidate;
}

export interface RejectCandidateResult {
  status: "rejected" | "not_found" | "not_pending" | "scope_mismatch";
  candidate?: InspectorReviewCandidate;
}

export interface ReleaseCandidateResult {
  status: "released" | "not_approved" | "not_found" | "scope_mismatch";
  candidate?: InspectorReviewCandidate;
}

export interface RecoverCandidateApprovalResult {
  status: "released" | "not_found" | "not_stale" | "scope_mismatch";
  candidate?: InspectorReviewCandidate;
}

const STALE_APPROVAL_REVIEW_ERROR =
  "Approval was interrupted before GoodMemory could record the result. Verify whether durable memory already contains this candidate before approving again.";

export async function listReviewCandidateViews(input: {
  scopeKey?: string;
  homeRoot?: string;
  status?: InspectorReviewCandidateStatus;
}): Promise<InspectorCandidateView[]> {
  const candidates = await listReviewCandidates({
    homeRoot: input.homeRoot,
    scopeKey: input.scopeKey,
    status: input.status,
  });
  const now = new Date();
  return candidates.map((candidate) => {
    const staleApproval = isReviewCandidateApprovalStale(candidate, now);
    return {
      id: candidate.id,
      source: "review-queue",
      approvable: candidate.status === "pending",
      recoverable: staleApproval,
      kind: candidate.kind,
      contentPreview: candidate.content,
      reason: staleApproval
        ? candidate.reviewError ?? STALE_APPROVAL_REVIEW_ERROR
        : candidate.reviewError ?? candidate.reason,
      status: staleApproval ? "approval_interrupted" : candidate.status,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      host: candidate.host,
      origin: candidate.source,
    };
  });
}

export async function approveCandidate(input: {
  candidateId: string;
  scope: MemoryScope;
  reviewReason?: string;
  deps: CandidateReviewDeps;
}): Promise<ApproveCandidateResult> {
  const { deps } = input;
  const now = deps.now ?? (() => new Date());
  const reserved = await reserveReviewCandidateApproval({
    homeRoot: deps.homeRoot,
    id: input.candidateId,
    now,
    reviewReason: input.reviewReason,
    scopeKey: scopeToKey(input.scope),
  });
  if (reserved.status !== "reserved") {
    if (reserved.status === "not_found") {
      return { status: "not_found", memoryIds: [] };
    }
    if (reserved.status === "not_pending") {
      return { status: "not_pending", memoryIds: [], candidate: reserved.candidate };
    }
    return { status: "scope_mismatch", memoryIds: [], candidate: reserved.candidate };
  }
  const candidate = reserved.candidate;

  const kindHint = KIND_HINTS.has(candidate.kind)
    ? (candidate.kind as "preference" | "fact" | "feedback" | "reference")
    : undefined;
  let result: Awaited<ReturnType<GoodMemory["remember"]>>;
  try {
    result = await deps.memory.remember({
      annotations: [
        {
          messageIndex: 0,
          remember: "always",
          ...(kindHint ? { kindHint } : {}),
          ...(candidate.reason ? { reason: candidate.reason } : {}),
        },
      ],
      messages: [{ role: sourceToRole(candidate.source), content: candidate.content }],
      scope: input.scope,
    });
  } catch (error) {
    const reviewError = describeError(error);
    const released = await releaseReviewCandidateApproval({
      homeRoot: deps.homeRoot,
      id: candidate.id,
      now,
      reviewError,
    });
    await appendApprovalAudit({
      candidate,
      deps,
      errorMessage: reviewError,
      memoryIds: [],
      resultStatus: "error",
      scope: input.scope,
      reviewReason: input.reviewReason,
      now,
    });
    return {
      status: "approval_failed",
      memoryIds: [],
      candidate: released ?? candidate,
    };
  }
  const memoryIds = collectMemoryIds(result.events);
  const accepted = (result.accepted ?? 0) > 0;

  const updated = await updateReviewCandidateStatus({
    homeRoot: deps.homeRoot,
    id: candidate.id,
    status: accepted ? "approved" : "rejected",
    memoryIds,
    reviewReason: input.reviewReason,
    now,
  });
  await appendApprovalAudit({
    candidate,
    deps,
    errorMessage: accepted ? undefined : "governance rejected the approved candidate",
    memoryIds,
    resultStatus: accepted ? "ok" : "error",
    scope: input.scope,
    reviewReason: input.reviewReason,
    now,
  });

  return {
    status: accepted ? "approved" : "rejected_by_governance",
    memoryIds,
    candidate: updated ?? candidate,
  };
}

async function appendApprovalAudit(input: {
  candidate: InspectorReviewCandidate;
  deps: CandidateReviewDeps;
  memoryIds: string[];
  now: () => Date;
  resultStatus: "error" | "ok";
  scope: MemoryScope;
  errorMessage?: string;
  reviewReason?: string;
}): Promise<void> {
  await appendInspectorAuditEvent({
    homeRoot: input.deps.homeRoot,
    event: {
      actionId: nextActionId(input.deps),
      action: "approve",
      occurredAt: input.now().toISOString(),
      scopeDigest: buildWritebackScopeDigest(input.scope),
      targetId: input.candidate.id,
      resultStatus: input.resultStatus,
      resultMemoryIds: input.memoryIds,
      contentPreview: redactAuditText(input.candidate.content, input.scope),
      ...(input.reviewReason
        ? { reason: redactAuditText(input.reviewReason, input.scope) }
        : {}),
      ...(input.errorMessage
        ? { errorMessage: redactAuditText(input.errorMessage, input.scope) }
        : {}),
    },
  });
}

export async function rejectCandidate(input: {
  candidateId: string;
  scope: MemoryScope;
  reviewReason?: string;
  deps: CandidateReviewDeps;
}): Promise<RejectCandidateResult> {
  const { deps } = input;
  const now = deps.now ?? (() => new Date());
  const candidate = await getReviewCandidate({
    homeRoot: deps.homeRoot,
    id: input.candidateId,
  });
  if (!candidate) {
    return { status: "not_found" };
  }
  if (candidate.status !== "pending") {
    return { status: "not_pending", candidate };
  }
  if (candidate.scopeKey !== scopeToKey(input.scope)) {
    return { status: "scope_mismatch", candidate };
  }

  const updated = await updateReviewCandidateStatus({
    homeRoot: deps.homeRoot,
    id: candidate.id,
    status: "rejected",
    reviewReason: input.reviewReason,
    now,
  });
  await appendInspectorAuditEvent({
    homeRoot: deps.homeRoot,
    event: {
      actionId: nextActionId(deps),
      action: "reject",
      occurredAt: now().toISOString(),
      scopeDigest: buildWritebackScopeDigest(input.scope),
      targetId: candidate.id,
      resultStatus: "ok",
      contentPreview: redactAuditText(candidate.content, input.scope),
      ...(input.reviewReason
        ? { reason: redactAuditText(input.reviewReason, input.scope) }
        : {}),
    },
  });

  return { status: "rejected", candidate: updated ?? candidate };
}

export async function releaseApprovedCandidate(input: {
  candidateId: string;
  scope: MemoryScope;
  reviewReason?: string;
  deps: CandidateReviewDeps;
}): Promise<ReleaseCandidateResult> {
  const { deps } = input;
  const now = deps.now ?? (() => new Date());
  const candidate = await getReviewCandidate({
    homeRoot: deps.homeRoot,
    id: input.candidateId,
  });
  if (!candidate) {
    return { status: "not_found" };
  }
  if (candidate.scopeKey !== scopeToKey(input.scope)) {
    return { status: "scope_mismatch", candidate };
  }
  if (candidate.status !== "approved") {
    return { status: "not_approved", candidate };
  }
  const updated = await updateReviewCandidateStatus({
    homeRoot: deps.homeRoot,
    id: candidate.id,
    now,
    reviewReason: input.reviewReason,
    status: "released",
  });
  await appendInspectorAuditEvent({
    homeRoot: deps.homeRoot,
    event: {
      action: "release",
      actionId: nextActionId(deps),
      contentPreview: redactAuditText(candidate.content, input.scope),
      occurredAt: now().toISOString(),
      resultStatus: "ok",
      scopeDigest: buildWritebackScopeDigest(input.scope),
      targetId: candidate.id,
      ...(input.reviewReason
        ? { reason: redactAuditText(input.reviewReason, input.scope) }
        : {}),
    },
  });
  return { status: "released", candidate: updated ?? candidate };
}

export async function recoverCandidateApproval(input: {
  candidateId: string;
  scope: MemoryScope;
  reviewReason?: string;
  deps: CandidateReviewDeps;
}): Promise<RecoverCandidateApprovalResult> {
  const { deps } = input;
  const now = deps.now ?? (() => new Date());
  const candidate = await getReviewCandidate({
    homeRoot: deps.homeRoot,
    id: input.candidateId,
  });
  if (!candidate) {
    return { status: "not_found" };
  }
  if (candidate.scopeKey !== scopeToKey(input.scope)) {
    return { status: "scope_mismatch", candidate };
  }
  if (!isReviewCandidateApprovalStale(candidate, now())) {
    return { status: "not_stale", candidate };
  }

  const updated = await releaseReviewCandidateApproval({
    homeRoot: deps.homeRoot,
    id: candidate.id,
    now,
    reviewError: STALE_APPROVAL_REVIEW_ERROR,
  });
  await appendInspectorAuditEvent({
    homeRoot: deps.homeRoot,
    event: {
      actionId: nextActionId(deps),
      action: "reset-approval",
      occurredAt: now().toISOString(),
      scopeDigest: buildWritebackScopeDigest(input.scope),
      targetId: candidate.id,
      resultStatus: updated?.status === "pending" ? "ok" : "error",
      contentPreview: redactAuditText(candidate.content, input.scope),
      reason: redactAuditText(
        input.reviewReason ?? STALE_APPROVAL_REVIEW_ERROR,
        input.scope,
      ),
    },
  });

  return {
    status: "released",
    candidate: updated ?? candidate,
  };
}

function sourceToRole(source: InspectorReviewCandidate["source"]): string {
  return source === "assistant" ? "assistant" : "user";
}

function redactAuditText(value: string, scope: MemoryScope): string {
  return redactScopeText(redactViewerText(value), scope);
}

function collectMemoryIds(events: readonly unknown[]): string[] {
  const ids: string[] = [];
  for (const event of events) {
    if (isRecord(event) && typeof event.memoryId === "string") {
      ids.push(event.memoryId);
    }
  }
  return ids;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nextActionId(deps: CandidateReviewDeps): string {
  return (deps.newActionId ?? defaultActionId)();
}

function defaultActionId(): string {
  return `insp_${randomBytes(9).toString("hex")}`;
}
