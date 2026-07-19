import type { CodexCodingEffectArm } from "./contracts";

export type CodexCodingEffectEventName =
  | "run_preflight_started"
  | "run_preflight_completed"
  | "dataset_validated"
  | "leakage_audit_completed"
  | "pair_started"
  | "pair_completed"
  | "workspace_prepared"
  | "goodmemory_setup_started"
  | "goodmemory_setup_completed"
  | "hook_registration_verified"
  | "codex_process_started"
  | "codex_process_exited"
  | "codex_process_failure"
  | "codex_event_parse_failed"
  | "injection_audited"
  | "stop_writeback_audited"
  | "patch_captured"
  | "patch_applied_for_evaluation"
  | "hidden_tests_started"
  | "hidden_tests_completed"
  | "stage_finalized"
  | "attempt_failed"
  | "resume_row_loaded"
  | "resume_row_rejected"
  | "run_aggregated"
  | "gate_evaluated";

export interface CodexCodingEffectLogContext {
  arm: CodexCodingEffectArm;
  attemptId: string;
  episodeId: string;
  repetition: number;
  runId: string;
  seed: number;
  stageId: string;
  traceId: string;
}

export interface CodexCodingEffectLogEvent
  extends CodexCodingEffectLogContext {
  details: Record<string, unknown>;
  event: CodexCodingEffectEventName;
  timestamp: string;
}

export type CodexCodingEffectLogger = (
  event: CodexCodingEffectEventName,
  details?: Record<string, unknown>,
) => void;

export function createCodexCodingEffectLogger(
  context: CodexCodingEffectLogContext,
  sink: (event: CodexCodingEffectLogEvent) => void,
  now: () => string = () => new Date().toISOString(),
): CodexCodingEffectLogger {
  return (event, details = {}) => {
    sink({
      ...context,
      details,
      event,
      timestamp: now(),
    });
  };
}
