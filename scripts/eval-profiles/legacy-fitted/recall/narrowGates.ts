/**
 * Registry for narrow, scenario-fitted query classifiers ("narrow gates").
 *
 * Each gate registers under a stable `<family>.<name>` id. Fitted gates are
 * disabled by default and cannot be enabled through the public configuration
 * or an environment variable. Repo-only eval/test harnesses may enable the
 * legacy profile, after which GOODMEMORY_DISABLED_NARROW_GATES can disable
 * individual gates for audit ablations.
 */

export type NarrowGateId = string;

const NARROW_GATE_ID_PATTERN = /^[a-z][a-zA-Z0-9]*\.[a-zA-Z0-9]+$/;
const registeredNarrowGateIds = new Set<NarrowGateId>();
const narrowGateQueryProbes = new Map<NarrowGateId, (query: string) => boolean>();
let disabledNarrowGateIds: Set<NarrowGateId> | undefined;
let legacyFittedNarrowGatesEnabled = false;
let narrowGateAuditActive = false;
let narrowGateAuditCaseId: string | undefined;
const narrowGateAuditHits = new Map<NarrowGateId, Set<string>>();

export interface NarrowGateHitAuditEntry {
  caseIds: string[];
  gateId: NarrowGateId;
}

function resolveDisabledNarrowGateIds(): Set<NarrowGateId> {
  if (disabledNarrowGateIds === undefined) {
    const raw = process.env.GOODMEMORY_DISABLED_NARROW_GATES ?? "";
    disabledNarrowGateIds = new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    );
  }
  return disabledNarrowGateIds;
}

export function narrowGate<A extends readonly unknown[]>(
  id: NarrowGateId,
  classify: (...args: A) => boolean,
): (...args: A) => boolean {
  if (!NARROW_GATE_ID_PATTERN.test(id)) {
    throw new Error(`narrow gate id "${id}" must match <family>.<name>`);
  }
  if (registeredNarrowGateIds.has(id)) {
    throw new Error(`narrow gate id "${id}" registered twice`);
  }
  registeredNarrowGateIds.add(id);
  if (classify.length <= 1) {
    narrowGateQueryProbes.set(id, (query) =>
      classify(...([query] as unknown as A))
    );
  }

  return (...args: A): boolean => {
    if (!legacyFittedNarrowGatesEnabled) {
      return false;
    }
    if (resolveDisabledNarrowGateIds().has(id)) {
      return false;
    }
    const result = classify(...args);
    if (result && narrowGateAuditActive && narrowGateAuditCaseId) {
      const hits = narrowGateAuditHits.get(id) ?? new Set<string>();
      hits.add(narrowGateAuditCaseId);
      narrowGateAuditHits.set(id, hits);
    }
    return result;
  };
}

export function listRegisteredNarrowGateIds(): NarrowGateId[] {
  return [...registeredNarrowGateIds].sort();
}

export function probeNarrowGatesForInternalEval(query: string): NarrowGateId[] {
  const hits: NarrowGateId[] = [];
  for (const [gateId, classify] of narrowGateQueryProbes) {
    try {
      if (classify(query)) {
        hits.push(gateId);
      }
    } catch (error) {
      throw new Error(
        `narrow gate ${gateId} failed during direct query probe: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return hits.sort();
}

export function listNarrowGateQueryProbeIdsForInternalEval(): NarrowGateId[] {
  return [...narrowGateQueryProbes.keys()].sort();
}

/** Repo-only eval seam. This symbol is intentionally not part of package exports. */
export function enableLegacyFittedNarrowGatesForInternalEval(): void {
  legacyFittedNarrowGatesEnabled = true;
}

/** Repo-only eval seam. This symbol is intentionally not part of package exports. */
export function disableLegacyFittedNarrowGatesForInternalEval(): void {
  legacyFittedNarrowGatesEnabled = false;
}

export function __enableLegacyFittedNarrowGatesForTest(): void {
  enableLegacyFittedNarrowGatesForInternalEval();
}

export function __disableLegacyFittedNarrowGatesForTest(): void {
  disableLegacyFittedNarrowGatesForInternalEval();
}

export function beginNarrowGateHitAuditForInternalEval(): void {
  narrowGateAuditActive = true;
  narrowGateAuditCaseId = undefined;
  narrowGateAuditHits.clear();
}

export function setNarrowGateAuditCaseForInternalEval(caseId: string): void {
  if (!narrowGateAuditActive) {
    throw new Error("narrow-gate hit audit must be started before setting a case");
  }
  const normalized = caseId.trim();
  if (normalized.length === 0) {
    throw new Error("narrow-gate hit audit case id must be non-empty");
  }
  narrowGateAuditCaseId = normalized;
}

export function readNarrowGateHitAuditForInternalEval(): NarrowGateHitAuditEntry[] {
  return listRegisteredNarrowGateIds().map((gateId) => ({
    caseIds: [...(narrowGateAuditHits.get(gateId) ?? [])].sort(),
    gateId,
  }));
}

export function endNarrowGateHitAuditForInternalEval(): void {
  narrowGateAuditActive = false;
  narrowGateAuditCaseId = undefined;
  narrowGateAuditHits.clear();
}

/** Clears the lazily parsed disable set so tests can vary the env variable. */
export function __resetNarrowGateDisablesForTest(): void {
  disabledNarrowGateIds = undefined;
}
