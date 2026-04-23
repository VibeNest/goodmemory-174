import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  disableHostWorkspace,
  enableHostWorkspace,
  installHost,
} from "../../src/install/hostInstall";

async function createWorkspace(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe("host install", () => {
  it("fails closed when the existing global managed config is not valid JSON", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-install-invalid-");

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await writeFile(join(homeRoot, ".goodmemory/codex.json"), "{ invalid", "utf8");

      await expect(
        installHost({
          homeRoot,
          host: "codex",
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing codex.json: file is not valid JSON.",
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("rejects enable when the global managed config is not runnable by the hook runtime", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-enable-invalid-home-");
    const workspaceRoot = await createWorkspace("goodmemory-host-enable-invalid-workspace-");

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            host: "codex",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      await expect(
        enableHostWorkspace({
          homeRoot,
          host: "codex",
          workspaceRoot,
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing codex.json: storage.provider must be memory, sqlite, or postgres.",
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("repairs invalid runtime fields when reinstalling the managed global config", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-install-repair-");
    const existingMemoryPath = resolve(homeRoot, "custom-memory.sqlite");

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            debug: true,
            host: "codex",
            maxTokens: -1,
            retrievalProfile: "coding_agent",
            storage: {
              path: existingMemoryPath,
              provider: "sqlite",
            },
            userId: "preserved-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const reinstalled = await installHost({
        homeRoot,
        host: "codex",
      });
      const config = JSON.parse(
        await readFile(join(homeRoot, ".goodmemory/codex.json"), "utf8"),
      ) as {
        debug: boolean;
        maxTokens: number;
        retrievalProfile: string;
        storage: { path: string; provider: string };
        userId: string;
      };

      expect(reinstalled.memoryPath).toBe(existingMemoryPath);
      expect(reinstalled.userId).toBe("preserved-user");
      expect(config.debug).toBe(true);
      expect(config.maxTokens).toBe(256);
      expect(config.retrievalProfile).toBe("coding_agent");
      expect(config.storage).toEqual({
        path: existingMemoryPath,
        provider: "sqlite",
      });
      expect(config.userId).toBe("preserved-user");
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("preserves existing global memory path and userId unless explicit install flags override them", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-install-merge-");
    const existingMemoryPath = resolve(homeRoot, "custom-memory.sqlite");
    const overrideMemoryPath = resolve(homeRoot, "override-memory.sqlite");

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            debug: true,
            host: "codex",
            maxTokens: 512,
            retrievalProfile: "coding_agent",
            storage: {
              path: existingMemoryPath,
              provider: "sqlite",
            },
            userId: "preserved-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const initial = await installHost({
        homeRoot,
        host: "codex",
      });
      const initialConfig = JSON.parse(
        await readFile(join(homeRoot, ".goodmemory/codex.json"), "utf8"),
      ) as {
        debug: boolean;
        maxTokens: number;
        storage: { path: string; provider: string };
        userId: string;
      };

      expect(initial.userId).toBe("preserved-user");
      expect(initial.memoryPath).toBe(existingMemoryPath);
      expect(initialConfig.userId).toBe("preserved-user");
      expect(initialConfig.storage.path).toBe(existingMemoryPath);
      expect(initialConfig.maxTokens).toBe(512);
      expect(initialConfig.debug).toBe(true);

      const overridden = await installHost({
        homeRoot,
        host: "codex",
        memoryPath: overrideMemoryPath,
        userId: "override-user",
      });
      const overriddenConfig = JSON.parse(
        await readFile(join(homeRoot, ".goodmemory/codex.json"), "utf8"),
      ) as {
        storage: { path: string; provider: string };
        userId: string;
      };

      expect(overridden.userId).toBe("override-user");
      expect(overridden.memoryPath).toBe(overrideMemoryPath);
      expect(overriddenConfig.userId).toBe("override-user");
      expect(overriddenConfig.storage.path).toBe(overrideMemoryPath);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("enables and disables repo opt-in without losing existing workspace config", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-enable-home-");
    const workspaceRoot = await createWorkspace("goodmemory-host-enable-");
    const originalInstructions = "\n# Existing Notes\n\n";

    try {
      await installHost({
        homeRoot,
        host: "codex",
        userId: "codex-user",
      });
      await mkdir(join(workspaceRoot, ".goodmemory"), { recursive: true });
      await writeFile(join(workspaceRoot, "AGENTS.md"), originalInstructions, "utf8");
      await writeFile(
        join(workspaceRoot, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            customSetting: "keep-me",
            debug: true,
            enabled: false,
            host: "codex",
            maxTokens: -1,
            retrievalProfile: "broken",
            version: 1,
            workspaceId: "preserved-workspace",
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const enabled = await enableHostWorkspace({
        homeRoot,
        host: "codex",
        workspaceRoot,
      });
      const enabledConfig = JSON.parse(
        await readFile(join(workspaceRoot, ".goodmemory/codex.json"), "utf8"),
      ) as {
        customSetting: string;
        debug: boolean;
        enabled: boolean;
        maxTokens?: number;
        retrievalProfile?: string;
        workspaceId: string;
      };
      const enabledInstructions = await readFile(join(workspaceRoot, "AGENTS.md"), "utf8");

      expect(enabled.workspaceId).toBe("preserved-workspace");
      expect(enabledConfig.debug).toBe(true);
      expect(enabledConfig.enabled).toBe(true);
      expect(enabledConfig.workspaceId).toBe("preserved-workspace");
      expect(enabledConfig.customSetting).toBe("keep-me");
      expect(enabledConfig).not.toHaveProperty("maxTokens");
      expect(enabledConfig).not.toHaveProperty("retrievalProfile");
      expect(enabledInstructions).toContain("# Existing Notes");
      expect(enabledInstructions).toContain("GOODMEMORY-INSTALL:CODEX START");

      const disabled = await disableHostWorkspace({
        host: "codex",
        workspaceRoot,
      });
      const disabledConfig = JSON.parse(
        await readFile(join(workspaceRoot, ".goodmemory/codex.json"), "utf8"),
      ) as {
        customSetting: string;
        debug: boolean;
        enabled: boolean;
        maxTokens?: number;
        retrievalProfile?: string;
        workspaceId: string;
      };
      const disabledInstructions = await readFile(join(workspaceRoot, "AGENTS.md"), "utf8");

      expect(disabled.changes[0]?.action).toBe("updated");
      expect(disabledConfig.debug).toBe(true);
      expect(disabledConfig.enabled).toBe(false);
      expect(disabledConfig.workspaceId).toBe("preserved-workspace");
      expect(disabledConfig.customSetting).toBe("keep-me");
      expect(disabledConfig).not.toHaveProperty("maxTokens");
      expect(disabledConfig).not.toHaveProperty("retrievalProfile");
      expect(disabledInstructions).toBe(originalInstructions);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("keeps repeated enable idempotent when repo debug is unset", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-enable-idempotent-home-");
    const workspaceRoot = await createWorkspace("goodmemory-host-enable-idempotent-workspace-");

    try {
      await installHost({
        homeRoot,
        host: "codex",
        userId: "codex-user",
      });

      await enableHostWorkspace({
        homeRoot,
        host: "codex",
        workspaceRoot,
      });
      const afterFirstEnable = await readFile(
        join(workspaceRoot, ".goodmemory/codex.json"),
        "utf8",
      );

      const secondEnable = await enableHostWorkspace({
        homeRoot,
        host: "codex",
        workspaceRoot,
      });
      const afterSecondEnable = await readFile(
        join(workspaceRoot, ".goodmemory/codex.json"),
        "utf8",
      );

      expect(secondEnable.changes.map(({ action, relativePath }) => ({
        action,
        relativePath,
      }))).toEqual([
        { action: "unchanged", relativePath: ".goodmemory/codex.json" },
        { action: "unchanged", relativePath: "AGENTS.md" },
      ]);
      expect(JSON.parse(afterFirstEnable)).not.toHaveProperty("debug");
      expect(afterSecondEnable).toBe(afterFirstEnable);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("treats disable on a pristine workspace as a no-op", async () => {
    const workspaceRoot = await createWorkspace("goodmemory-host-disable-pristine-");

    try {
      const disabled = await disableHostWorkspace({
        host: "codex",
        workspaceRoot,
      });

      expect(disabled.changes.map(({ action, relativePath }) => ({ action, relativePath }))).toEqual([
        { action: "unchanged", relativePath: ".goodmemory/codex.json" },
        { action: "unchanged", relativePath: "AGENTS.md" },
      ]);
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("fails closed when the managed instruction block is malformed", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-marker-home-");
    const workspaceRoot = await createWorkspace("goodmemory-host-marker-workspace-");

    try {
      await installHost({
        homeRoot,
        host: "codex",
        userId: "codex-user",
      });
      await writeFile(
        join(workspaceRoot, "AGENTS.md"),
        [
          "# Existing Notes",
          "<!-- GOODMEMORY-INSTALL:CODEX START -->",
          "broken block",
        ].join("\n"),
        "utf8",
      );

      await expect(
        enableHostWorkspace({
          homeRoot,
          host: "codex",
          workspaceRoot,
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing AGENTS.md: the managed install block is malformed.",
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("fails closed when the managed instruction block markers are reversed", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-marker-order-home-");
    const workspaceRoot = await createWorkspace("goodmemory-host-marker-order-workspace-");

    try {
      await installHost({
        homeRoot,
        host: "codex",
        userId: "codex-user",
      });
      await writeFile(
        join(workspaceRoot, "AGENTS.md"),
        [
          "# Existing Notes",
          "<!-- GOODMEMORY-INSTALL:CODEX END -->",
          "broken block",
          "<!-- GOODMEMORY-INSTALL:CODEX START -->",
        ].join("\n"),
        "utf8",
      );

      await expect(
        enableHostWorkspace({
          homeRoot,
          host: "codex",
          workspaceRoot,
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing AGENTS.md: the managed install block is malformed.",
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });
});
