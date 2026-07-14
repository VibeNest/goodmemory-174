export interface MINTEvalSmokeDiagnostics {
  acceptedMemories: number;
  contextCount: number;
  executionFailures: number;
  questionCount: number;
  recalledMemories: number;
}

export interface MINTEvalSmokeResult {
  failures: string[];
  status: "failed" | "passed";
}

export function evaluateMINTEvalSmoke(
  diagnostics: MINTEvalSmokeDiagnostics,
): MINTEvalSmokeResult {
  const failures: string[] = [];
  if (diagnostics.executionFailures > 0) {
    failures.push("MINTEval smoke executionFailures must be 0");
  }
  if (diagnostics.contextCount === 0 || diagnostics.questionCount === 0) {
    failures.push("MINTEval smoke source must contain contexts and questions");
  }
  if (diagnostics.acceptedMemories === 0) {
    failures.push("MINTEval smoke must write at least one memory");
  }
  if (diagnostics.recalledMemories === 0) {
    failures.push("MINTEval smoke must recall at least one memory");
  }
  return {
    failures,
    status: failures.length === 0 ? "passed" : "failed",
  };
}
