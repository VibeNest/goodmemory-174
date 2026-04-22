import type {
  HostActionAssessmentResult,
  HostActionIntent,
  HostPlannedAction,
  HostRecommendedFirstStep,
} from "./contracts";

export interface HostActionExecutionPlan {
  actionId: string;
  blocked: boolean;
  decision: HostActionAssessmentResult["decision"];
  effectiveFirstStep?: HostPlannedAction | HostRecommendedFirstStep;
  executeOriginalActionNow: boolean;
  guidance: string[];
  intercepted: boolean;
  originalAction: HostPlannedAction;
  realizedEventParentId: string;
  reason: string;
  rewritten: boolean;
}

function clonePlannedAction(action: HostPlannedAction): HostPlannedAction {
  switch (action.kind) {
    case "command":
      return {
        kind: "command",
        command: action.command,
        ...(action.summary ? { summary: action.summary } : {}),
      };
    case "tool_call":
      return {
        kind: "tool_call",
        toolName: action.toolName,
        ...(action.payload !== undefined ? { payload: action.payload } : {}),
        ...(action.raw ? { raw: action.raw } : {}),
        ...(action.summary ? { summary: action.summary } : {}),
      };
    case "file_edit":
      return {
        kind: "file_edit",
        operation: action.operation,
        relativePath: action.relativePath,
        ...(action.summary ? { summary: action.summary } : {}),
      };
  }
}

function cloneRecommendedFirstStep(
  step: HostRecommendedFirstStep,
): HostRecommendedFirstStep {
  if (step.kind === "warning") {
    return {
      kind: "warning",
      message: step.message,
    };
  }

  return clonePlannedAction(step);
}

export function resolveHostActionExecutionPlan(input: {
  assessment: HostActionAssessmentResult;
  intent: HostActionIntent;
}): HostActionExecutionPlan {
  if (input.assessment.actionId !== input.intent.actionId) {
    throw new Error(
      "host action assessment actionId must match the planned intent actionId",
    );
  }

  const originalAction = clonePlannedAction(input.intent.action);
  switch (input.assessment.decision) {
    case "allow":
    case "allow_with_guidance":
      return {
        actionId: input.intent.actionId,
        blocked: false,
        decision: input.assessment.decision,
        effectiveFirstStep: originalAction,
        executeOriginalActionNow: true,
        guidance: [...input.assessment.guidance],
        intercepted: false,
        originalAction,
        realizedEventParentId: input.intent.actionId,
        reason: input.assessment.reason,
        rewritten: false,
      };
    case "review_required": {
      if (!input.assessment.recommendedFirstStep) {
        throw new Error(
          "review_required host action assessments must provide a recommendedFirstStep",
        );
      }

      return {
        actionId: input.intent.actionId,
        blocked: false,
        decision: input.assessment.decision,
        effectiveFirstStep: cloneRecommendedFirstStep(
          input.assessment.recommendedFirstStep,
        ),
        executeOriginalActionNow: false,
        guidance: [...input.assessment.guidance],
        intercepted: true,
        originalAction,
        realizedEventParentId: input.intent.actionId,
        reason: input.assessment.reason,
        rewritten: true,
      };
    }
    case "blocked":
      return {
        actionId: input.intent.actionId,
        blocked: true,
        decision: input.assessment.decision,
        executeOriginalActionNow: false,
        guidance: [...input.assessment.guidance],
        intercepted: true,
        originalAction,
        realizedEventParentId: input.intent.actionId,
        reason: input.assessment.reason,
        rewritten: false,
      };
  }
}
