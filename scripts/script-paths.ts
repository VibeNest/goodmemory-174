import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveRepoRootFromScriptUrl(scriptUrl: string): string {
  return dirname(fileURLToPath(new URL(".", scriptUrl)));
}
