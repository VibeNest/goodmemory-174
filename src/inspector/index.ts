export type {
  ScopeIndexCoverage,
  ScopeIndexResult,
  ScopeSummary,
} from "./contracts";
export { listScopes } from "./scopeIndex";
export {
  appendInspectorAuditEvent,
  type InspectorAuditAction,
  type InspectorAuditEvent,
  readInspectorAuditLedger,
} from "./auditLog";
export {
  approveCandidate,
  type ApproveCandidateResult,
  type InspectorCandidateView,
  listReviewCandidateViews,
  rejectCandidate,
  type RejectCandidateResult,
} from "./candidateReview";
export {
  buildDescriptor,
  createInspectorApp,
  createInspectorToken,
  type CreateInspectorAppInput,
  type InspectorApp,
  type InspectorServerDescriptor,
  type InspectorServerHandle,
  renderInspectorShell,
  serveInspector,
} from "./public";
