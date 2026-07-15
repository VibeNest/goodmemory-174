import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  inspectInstalledHostHookRegistration,
  isInstalledHostHookRegistered,
  registerInstalledHostHooks,
} from "../../src/install/hostHookConfig";

describe("installed host hook registration", () => {
  it("does not report Codex healthy when the native Stop hook is missing", async () => {
    const homeRoot = await mkdtemp(join(tmpdir(), "goodmemory-hook-status-"));
    try {
      await registerInstalledHostHooks({ homeRoot, host: "codex" });
      const hooksPath = join(homeRoot, ".codex", "hooks.json");
      const hooks = JSON.parse(await readFile(hooksPath, "utf8")) as {
        hooks: Record<string, unknown>;
      };
      delete hooks.hooks.Stop;
      await writeFile(hooksPath, `${JSON.stringify(hooks, null, 2)}\n`, "utf8");

      expect(await isInstalledHostHookRegistered({ homeRoot, host: "codex" }))
        .toBe(false);
      expect(await inspectInstalledHostHookRegistration({ homeRoot, host: "codex" }))
        .toEqual({ status: "repairable" });
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });
});
