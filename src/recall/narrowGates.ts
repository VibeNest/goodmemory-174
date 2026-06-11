/**
 * Registry for narrow, scenario-fitted query classifiers ("narrow gates").
 *
 * Each gate registers under a stable `<family>.<name>` id. When the
 * GOODMEMORY_DISABLED_NARROW_GATES environment variable contains an id (comma
 * separated), the wrapped classifier returns false, which lets the narrow-gate
 * audit measure each gate's real effect on the recall diagnostics without
 * code changes. With the variable unset the wrapper is a pass-through; the
 * production code never sets it.
 */

export type NarrowGateId = string;

const NARROW_GATE_ID_PATTERN = /^[a-z][a-zA-Z0-9]*\.[a-zA-Z0-9]+$/;
const registeredNarrowGateIds = new Set<NarrowGateId>();
let disabledNarrowGateIds: Set<NarrowGateId> | undefined;

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

  return (...args: A): boolean => {
    if (resolveDisabledNarrowGateIds().has(id)) {
      return false;
    }
    return classify(...args);
  };
}

export function listRegisteredNarrowGateIds(): NarrowGateId[] {
  return [...registeredNarrowGateIds].sort();
}

/** Clears the lazily parsed disable set so tests can vary the env variable. */
export function __resetNarrowGateDisablesForTest(): void {
  disabledNarrowGateIds = undefined;
}
