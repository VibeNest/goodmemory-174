// Emits every gate from the repo-only historical fitted selector graph. The
// production selector does not import this graph; this census exists only for
// audit and historical reproduction.
//
// Pass --pretty to list one id per line instead (for inspection).

// Side-effect import: loads the full selection module graph so every wrapped
// narrow gate registers before the census is taken.
import "./eval-profiles/legacy-fitted/recall/selectionLegacy";
import { listRegisteredNarrowGateIds } from "./eval-profiles/legacy-fitted/recall/narrowGates";

export function listScenarioGateIds(): string[] {
  return [...listRegisteredNarrowGateIds()].sort();
}

if (import.meta.main) {
  const ids = listScenarioGateIds();
  const pretty = Bun.argv.includes("--pretty");
  if (pretty) {
    for (const id of ids) {
      console.log(id);
    }
  } else {
    console.log(ids.join(","));
  }
}
