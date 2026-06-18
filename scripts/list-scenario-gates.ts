// Emits the comma-separated list of every registered narrow-gate id, suitable
// for GOODMEMORY_DISABLED_NARROW_GATES. Disabling all narrow gates and re-running
// the recall diagnostic yields the "generalization recall" figure required by
// ADR-005 (the recall the library would deliver on data it was not fitted to).
//
//   GOODMEMORY_DISABLED_NARROW_GATES="$(bun run scripts/list-scenario-gates.ts)" \
//     bun run scripts/run-phase-63-beam-recall-diagnostic.ts --run-id generalization
//
// Pass --pretty to list one id per line instead (for inspection).

// Side-effect import: loads the full selection module graph so every wrapped
// narrow gate registers before the census is taken.
import "../src/recall/selection";
import { listRegisteredNarrowGateIds } from "../src/recall/narrowGates";

export function listScenarioGateIds(): string[] {
  return [...listRegisteredNarrowGateIds()].sort();
}

if (import.meta.main) {
  const ids = listScenarioGateIds();
  const pretty = Bun.argv.includes("--pretty");
  if (pretty) {
    const byFamily = new Map<string, string[]>();
    for (const id of ids) {
      const family = id.split(".")[0] ?? "misc";
      byFamily.set(family, [...(byFamily.get(family) ?? []), id]);
    }
    for (const [family, familyIds] of [...byFamily.entries()].sort()) {
      console.error(`# ${family} (${familyIds.length})`);
      for (const id of familyIds) {
        console.error(`  ${id}`);
      }
    }
    console.error(`# total: ${ids.length}`);
  }
  console.log(ids.join(","));
}
