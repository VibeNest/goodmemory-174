export const CODEX_CODING_EFFECT_EVIDENCE_CLASSES = [
  "host-canary",
  "deterministic-smoke",
  "frozen-prehistory-pilot",
  "native-longitudinal-pilot",
  "codex-coding-effect-candidate",
  "codex-coding-effect-accepted",
] as const;

export type CodexCodingEffectEvidenceClass =
  (typeof CODEX_CODING_EFFECT_EVIDENCE_CLASSES)[number];

export const CODEX_CODING_EFFECT_ARMS = [
  "no-memory",
  "goodmemory-installed",
  "flat-summary",
  "instruction-sham",
  "oracle-memory",
] as const;

export type CodexCodingEffectArm =
  (typeof CODEX_CODING_EFFECT_ARMS)[number];

export type CodexCodingEffectEvidenceKind =
  | "host-native-patch"
  | "memgym-codeqa"
  | "memory-qa"
  | "retrieval-diagnostic";

export interface CodexCodingEffectClaimInput {
  evidenceClass: CodexCodingEffectEvidenceClass;
  evidenceKind: CodexCodingEffectEvidenceKind;
  fullGateAccepted: boolean;
  host: string;
}

export interface CodexCodingEffectClaimBoundary {
  claimable: boolean;
  excludedHosts: ["claude-code"];
  failures: string[];
  host: "codex";
  primaryMetric: "hidden-test-resolve-at-1";
}

export function isCodexCodingEffectArm(
  value: string,
): value is CodexCodingEffectArm {
  return CODEX_CODING_EFFECT_ARMS.some((arm) => arm === value);
}

export function isCodexCodingEffectEvidenceClass(
  value: string,
): value is CodexCodingEffectEvidenceClass {
  return CODEX_CODING_EFFECT_EVIDENCE_CLASSES.some(
    (evidenceClass) => evidenceClass === value,
  );
}

export function evaluateCodexCodingEffectClaim(
  input: CodexCodingEffectClaimInput,
): CodexCodingEffectClaimBoundary {
  const failures: string[] = [];

  if (input.host !== "codex") {
    failures.push("the first coding-effect claim is scoped to Codex only");
  }
  if (input.evidenceKind !== "host-native-patch") {
    failures.push(
      "public coding-effect claims require executable host-native patch evidence",
    );
  }
  if (input.evidenceClass !== "codex-coding-effect-accepted") {
    failures.push(
      "public coding-effect claims require codex-coding-effect-accepted evidence",
    );
  } else if (!input.fullGateAccepted) {
    failures.push(
      "codex-coding-effect-accepted evidence requires an accepted full gate",
    );
  }

  return {
    claimable: failures.length === 0,
    excludedHosts: ["claude-code"],
    failures,
    host: "codex",
    primaryMetric: "hidden-test-resolve-at-1",
  };
}
