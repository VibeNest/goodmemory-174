import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  disableHostWorkspace,
  enableHostWorkspace,
  installHost,
  uninstallHost,
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

  it("registers the managed Codex MCP server without disturbing existing config.toml sections", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-install-codex-mcp-");

    try {
      await mkdir(join(homeRoot, ".codex"), { recursive: true });
      await writeFile(
        join(homeRoot, ".codex/config.toml"),
        [
          "[features]",
          "codex_hooks = true",
          "",
          "[mcp_servers.context7]",
          'command = "npx"',
          'args = ["-y", "@upstash/context7-mcp"]',
          "",
        ].join("\n"),
        "utf8",
      );

      const installed = await installHost({
        homeRoot,
        host: "codex",
        userId: "codex-user",
      });
      const codexConfig = await readFile(
        join(homeRoot, ".codex/config.toml"),
        "utf8",
      );

      expect(installed.changes.map(({ action, relativePath }) => ({
        action,
        relativePath,
      }))).toEqual([
        { action: "created", relativePath: "codex.json" },
        { action: "updated", relativePath: ".codex/config.toml" },
      ]);
      expect(codexConfig).toContain("[features]");
      expect(codexConfig).toContain("[mcp_servers.context7]");
      expect(codexConfig).toContain("[mcp_servers.goodmemory]");
      expect(codexConfig).toContain('command = "goodmemory-mcp"');
      expect(codexConfig).toContain('args = ["--host", "codex"]');
      expect(codexConfig).toContain(`GOODMEMORY_HOME = ${JSON.stringify(homeRoot)}`);
      expect(codexConfig).toContain('GOODMEMORY_MANAGED_BY = "goodmemory"');

      const uninstalled = await uninstallHost({
        homeRoot,
        host: "codex",
      });
      const codexConfigAfterUninstall = await readFile(
        join(homeRoot, ".codex/config.toml"),
        "utf8",
      );

      expect(uninstalled.changes.map(({ action, relativePath }) => ({
        action,
        relativePath,
      }))).toEqual([
        { action: "deleted", relativePath: "codex.json" },
        { action: "updated", relativePath: ".codex/config.toml" },
      ]);
      expect(codexConfigAfterUninstall).toContain("[mcp_servers.context7]");
      expect(codexConfigAfterUninstall).not.toContain("[mcp_servers.goodmemory]");
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("fails closed when the existing Codex MCP config uses an array table", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-install-codex-mcp-invalid-");

    try {
      await mkdir(join(homeRoot, ".codex"), { recursive: true });
      await writeFile(
        join(homeRoot, ".codex/config.toml"),
        [
          "[[mcp_servers.goodmemory]]",
          'command = "custom-mcp"',
          "",
        ].join("\n"),
        "utf8",
      );

      await expect(
        installHost({
          homeRoot,
          host: "codex",
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing .codex/config.toml: `[[mcp_servers.goodmemory]]` is unsupported for managed MCP registration.",
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("fails closed when a user-managed Codex MCP server already uses the goodmemory name", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-install-codex-mcp-owned-");

    try {
      await mkdir(join(homeRoot, ".codex"), { recursive: true });
      await writeFile(
        join(homeRoot, ".codex/config.toml"),
        [
          "[mcp_servers.goodmemory]",
          'command = "custom-mcp"',
          'args = ["serve"]',
          "[mcp_servers.goodmemory.env]",
          'CUSTOM = "1"',
          "",
        ].join("\n"),
        "utf8",
      );

      await expect(
        installHost({
          homeRoot,
          host: "codex",
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing .codex/config.toml: `[mcp_servers.goodmemory]` already exists and is not managed by GoodMemory.",
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("rolls back the main install config when MCP registration fails", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-install-rollback-");

    try {
      await mkdir(join(homeRoot, ".codex"), { recursive: true });
      await writeFile(
        join(homeRoot, ".codex/config.toml"),
        [
          "[[mcp_servers.goodmemory]]",
          'command = "custom-mcp"',
          "",
        ].join("\n"),
        "utf8",
      );

      await expect(
        installHost({
          homeRoot,
          host: "codex",
          userId: "codex-user",
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing .codex/config.toml: `[[mcp_servers.goodmemory]]` is unsupported for managed MCP registration.",
      );
      await expect(
        readFile(join(homeRoot, ".goodmemory/codex.json"), "utf8"),
      ).rejects.toThrow();
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("registers and removes the managed Claude MCP server while preserving sibling settings", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-install-claude-mcp-");

    try {
      await writeFile(
        join(homeRoot, ".claude.json"),
        JSON.stringify(
          {
            mcpServers: {
              github: {
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-github"],
              },
            },
            theme: "light",
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const installed = await installHost({
        homeRoot,
        host: "claude",
        userId: "claude-user",
      });
      const claudeConfig = JSON.parse(
        await readFile(join(homeRoot, ".claude.json"), "utf8"),
      ) as {
        mcpServers: Record<string, { args?: string[]; command: string; env?: Record<string, string> }>;
        theme: string;
      };

      expect(installed.changes.map(({ action, relativePath }) => ({
        action,
        relativePath,
      }))).toEqual([
        { action: "created", relativePath: "claude.json" },
        { action: "updated", relativePath: ".claude.json" },
      ]);
      expect(claudeConfig.theme).toBe("light");
      expect(claudeConfig.mcpServers.github.command).toBe("npx");
      expect(claudeConfig.mcpServers.goodmemory).toEqual({
        args: ["--host", "claude"],
        command: "goodmemory-mcp",
        env: {
          GOODMEMORY_HOME: homeRoot,
          GOODMEMORY_MANAGED_BY: "goodmemory",
        },
      });

      const uninstalled = await uninstallHost({
        homeRoot,
        host: "claude",
      });
      const claudeConfigAfterUninstall = JSON.parse(
        await readFile(join(homeRoot, ".claude.json"), "utf8"),
      ) as {
        mcpServers: Record<
          string,
          {
            args?: string[];
            command: string;
          }
        >;
        theme: string;
      };

      expect(uninstalled.changes.map(({ action, relativePath }) => ({
        action,
        relativePath,
      }))).toEqual([
        { action: "deleted", relativePath: "claude.json" },
        { action: "updated", relativePath: ".claude.json" },
      ]);
      expect(claudeConfigAfterUninstall.theme).toBe("light");
      expect(claudeConfigAfterUninstall.mcpServers).toEqual({
        github: {
          args: ["-y", "@modelcontextprotocol/server-github"],
          command: "npx",
        },
      });
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("fails closed when a user-managed Claude MCP server already uses the goodmemory name", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-install-claude-mcp-owned-");

    try {
      await writeFile(
        join(homeRoot, ".claude.json"),
        JSON.stringify(
          {
            mcpServers: {
              goodmemory: {
                args: ["serve"],
                command: "custom-mcp",
                env: {
                  CUSTOM: "1",
                },
              },
            },
            theme: "light",
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      await expect(
        installHost({
          homeRoot,
          host: "claude",
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing .claude.json: `mcpServers.goodmemory` already exists and is not managed by GoodMemory.",
      );
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("restores the main uninstall config when MCP cleanup fails", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-uninstall-rollback-");
    const configPath = join(homeRoot, ".goodmemory/codex.json");

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await mkdir(join(homeRoot, ".codex"), { recursive: true });
      await writeFile(
        configPath,
        JSON.stringify(
          {
            debug: false,
            host: "codex",
            maxTokens: 256,
            retrievalProfile: "coding_agent",
            storage: {
              path: join(homeRoot, ".goodmemory/memory.sqlite"),
              provider: "sqlite",
            },
            userId: "codex-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await writeFile(
        join(homeRoot, ".codex/config.toml"),
        [
          "[[mcp_servers.goodmemory]]",
          'command = "custom-mcp"',
          "",
        ].join("\n"),
        "utf8",
      );

      await expect(
        uninstallHost({
          homeRoot,
          host: "codex",
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing .codex/config.toml: `[[mcp_servers.goodmemory]]` is unsupported for managed MCP registration.",
      );
      expect(
        JSON.parse(await readFile(configPath, "utf8")),
      ).toMatchObject({
        host: "codex",
        userId: "codex-user",
      });
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("still removes the managed MCP registration when the main install config is already missing", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-uninstall-mcp-only-");

    try {
      await mkdir(join(homeRoot, ".codex"), { recursive: true });
      await writeFile(
        join(homeRoot, ".codex/config.toml"),
        [
          "[mcp_servers.goodmemory]",
          'command = "goodmemory-mcp"',
          'args = ["--host", "codex"]',
          "[mcp_servers.goodmemory.env]",
          `GOODMEMORY_HOME = ${JSON.stringify(homeRoot)}`,
          'GOODMEMORY_MANAGED_BY = "goodmemory"',
          "",
        ].join("\n"),
        "utf8",
      );

      const uninstalled = await uninstallHost({
        homeRoot,
        host: "codex",
      });

      expect(uninstalled.changes.map(({ action, relativePath }) => ({
        action,
        relativePath,
      }))).toEqual([
        { action: "unchanged", relativePath: "codex.json" },
        { action: "deleted", relativePath: ".codex/config.toml" },
      ]);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("preserves a user-managed Codex MCP server during uninstall", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-uninstall-codex-user-managed-");
    const configPath = join(homeRoot, ".goodmemory/codex.json");

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await mkdir(join(homeRoot, ".codex"), { recursive: true });
      await writeFile(
        configPath,
        JSON.stringify(
          {
            debug: false,
            host: "codex",
            maxTokens: 256,
            retrievalProfile: "coding_agent",
            storage: {
              path: join(homeRoot, ".goodmemory/memory.sqlite"),
              provider: "sqlite",
            },
            userId: "codex-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await writeFile(
        join(homeRoot, ".codex/config.toml"),
        [
          "[mcp_servers.goodmemory]",
          'command = "custom-mcp"',
          'args = ["serve"]',
          "[mcp_servers.goodmemory.env]",
          'CUSTOM = "1"',
          "",
        ].join("\n"),
        "utf8",
      );

      const uninstalled = await uninstallHost({
        homeRoot,
        host: "codex",
      });
      const codexConfig = await readFile(
        join(homeRoot, ".codex/config.toml"),
        "utf8",
      );

      expect(uninstalled.changes.map(({ action, relativePath }) => ({
        action,
        relativePath,
      }))).toEqual([
        { action: "deleted", relativePath: "codex.json" },
        { action: "unchanged", relativePath: ".codex/config.toml" },
      ]);
      expect(codexConfig).toContain('command = "custom-mcp"');
      await expect(readFile(configPath, "utf8")).rejects.toThrow();
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
    }
  });

  it("preserves a user-managed Claude MCP server during uninstall", async () => {
    const homeRoot = await createWorkspace("goodmemory-host-uninstall-claude-user-managed-");
    const configPath = join(homeRoot, ".goodmemory/claude.json");

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        configPath,
        JSON.stringify(
          {
            debug: false,
            host: "claude",
            maxTokens: 256,
            retrievalProfile: "coding_agent",
            storage: {
              path: join(homeRoot, ".goodmemory/memory.sqlite"),
              provider: "sqlite",
            },
            userId: "claude-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await writeFile(
        join(homeRoot, ".claude.json"),
        JSON.stringify(
          {
            mcpServers: {
              goodmemory: {
                args: ["serve"],
                command: "custom-mcp",
                env: {
                  CUSTOM: "1",
                },
              },
            },
            theme: "light",
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const uninstalled = await uninstallHost({
        homeRoot,
        host: "claude",
      });
      const claudeConfig = JSON.parse(
        await readFile(join(homeRoot, ".claude.json"), "utf8"),
      ) as {
        mcpServers: Record<
          string,
          {
            args?: string[];
            command: string;
            env?: Record<string, string>;
          }
        >;
        theme: string;
      };

      expect(uninstalled.changes.map(({ action, relativePath }) => ({
        action,
        relativePath,
      }))).toEqual([
        { action: "deleted", relativePath: "claude.json" },
        { action: "unchanged", relativePath: ".claude.json" },
      ]);
      expect(claudeConfig).toEqual({
        mcpServers: {
          goodmemory: {
            args: ["serve"],
            command: "custom-mcp",
            env: {
              CUSTOM: "1",
            },
          },
        },
        theme: "light",
      });
      await expect(readFile(configPath, "utf8")).rejects.toThrow();
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
