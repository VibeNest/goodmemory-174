import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapHostWorkspace } from "../../src/bootstrap/hostBootstrap";

async function createWorkspace(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe("host bootstrap", () => {
  it("fails closed when .codex/hooks.json is not valid JSON", async () => {
    const workspaceRoot = await createWorkspace("goodmemory-host-bootstrap-invalid-json-");

    try {
      await mkdir(join(workspaceRoot, ".codex"), { recursive: true });
      await writeFile(join(workspaceRoot, ".codex/hooks.json"), "{ invalid", "utf8");

      await expect(
        bootstrapHostWorkspace({
          host: "codex",
          userId: "codex-user",
          workspaceRoot,
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing .codex/hooks.json: file is not valid JSON.",
      );
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("fails closed when .codex/hooks.json uses incompatible root or hook shapes", async () => {
    const workspaceRoot = await createWorkspace("goodmemory-host-bootstrap-invalid-shapes-");

    try {
      await mkdir(join(workspaceRoot, ".codex"), { recursive: true });

      await writeFile(join(workspaceRoot, ".codex/hooks.json"), "[]\n", "utf8");
      await expect(
        bootstrapHostWorkspace({
          host: "codex",
          userId: "codex-user",
          workspaceRoot,
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing .codex/hooks.json: root value must be a JSON object.",
      );

      await writeFile(
        join(workspaceRoot, ".codex/hooks.json"),
        JSON.stringify(
          {
            hooks: [],
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await expect(
        bootstrapHostWorkspace({
          host: "codex",
          userId: "codex-user",
          workspaceRoot,
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing .codex/hooks.json: `hooks` must stay a JSON object.",
      );

      await writeFile(
        join(workspaceRoot, ".codex/hooks.json"),
        JSON.stringify(
          {
            hooks: {
              PreToolUse: {},
            },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await expect(
        bootstrapHostWorkspace({
          host: "codex",
          userId: "codex-user",
          workspaceRoot,
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing .codex/hooks.json: `hooks.PreToolUse` must stay an array.",
      );

      await writeFile(
        join(workspaceRoot, ".codex/hooks.json"),
        JSON.stringify(
          {
            hooks: {
              PreToolUse: [
                {
                  matcher: "Bash",
                  hooks: {},
                },
              ],
            },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await expect(
        bootstrapHostWorkspace({
          host: "codex",
          userId: "codex-user",
          workspaceRoot,
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing .codex/hooks.json: `hooks.PreToolUse[*].hooks` must stay an array for the Bash matcher.",
      );
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("adds the managed Bash hook when the existing hooks config has no Bash matcher", async () => {
    const workspaceRoot = await createWorkspace("goodmemory-host-bootstrap-bash-matcher-");

    try {
      await mkdir(join(workspaceRoot, ".codex"), { recursive: true });
      await writeFile(
        join(workspaceRoot, ".codex/hooks.json"),
        JSON.stringify(
          {
            hooks: {
              PostToolUse: [
                {
                  matcher: "Write",
                  hooks: [
                    {
                      command: "echo after-write",
                      type: "command",
                    },
                  ],
                },
              ],
            },
            repo: {
              preserve: true,
            },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      await bootstrapHostWorkspace({
        host: "codex",
        userId: "codex-user",
        workspaceRoot,
      });

      const hooksConfig = JSON.parse(
        await readFile(join(workspaceRoot, ".codex/hooks.json"), "utf8"),
      ) as {
        hooks: Record<
          string,
          Array<{
            hooks?: Array<{ command?: string; statusMessage?: string; type?: string }>;
            matcher?: string;
          }>
        >;
        repo?: { preserve?: boolean };
      };

      expect(hooksConfig.repo?.preserve).toBe(true);
      expect(hooksConfig.hooks.PostToolUse).toHaveLength(1);
      expect(
        hooksConfig.hooks.PreToolUse?.find((entry) => entry.matcher === "Bash")?.hooks,
      ).toEqual([
        expect.objectContaining({
          command: expect.stringContaining("codex-action.mjs"),
          statusMessage: "Checking GoodMemory pre-action policy",
          type: "command",
        }),
      ]);
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("fails closed when the managed bootstrap instruction markers are reversed", async () => {
    const workspaceRoot = await createWorkspace("goodmemory-host-bootstrap-marker-order-");

    try {
      await writeFile(
        join(workspaceRoot, "AGENTS.md"),
        [
          "# Existing Notes",
          "<!-- GOODMEMORY-BOOTSTRAP:CODEX END -->",
          "broken bootstrap block",
          "<!-- GOODMEMORY-BOOTSTRAP:CODEX START -->",
        ].join("\n"),
        "utf8",
      );

      await expect(
        bootstrapHostWorkspace({
          host: "codex",
          userId: "codex-user",
          workspaceRoot,
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing AGENTS.md: the managed install block is malformed.",
      );
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("fails closed when .codex/config.toml uses [[features]]", async () => {
    const workspaceRoot = await createWorkspace("goodmemory-host-bootstrap-invalid-toml-");

    try {
      await mkdir(join(workspaceRoot, ".codex"), { recursive: true });
      await writeFile(
        join(workspaceRoot, ".codex/config.toml"),
        "[[features]]\nname = \"invalid\"\n",
        "utf8",
      );

      await expect(
        bootstrapHostWorkspace({
          host: "codex",
          userId: "codex-user",
          workspaceRoot,
        }),
      ).rejects.toThrow(
        "Refusing to overwrite existing .codex/config.toml: `[[features]]` is unsupported for Codex feature flags.",
      );
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("adds a [features] section when .codex/config.toml has none", async () => {
    const workspaceRoot = await createWorkspace("goodmemory-host-bootstrap-add-features-");

    try {
      await mkdir(join(workspaceRoot, ".codex"), { recursive: true });
      await writeFile(
        join(workspaceRoot, ".codex/config.toml"),
        "[profiles.default]\nsandbox = \"workspace-write\"\n",
        "utf8",
      );

      await bootstrapHostWorkspace({
        host: "codex",
        userId: "codex-user",
        workspaceRoot,
      });

      const hooksToml = await readFile(join(workspaceRoot, ".codex/config.toml"), "utf8");
      expect(hooksToml).toContain("[profiles.default]");
      expect(hooksToml).toContain('sandbox = "workspace-write"');
      expect(hooksToml).toContain("[features]");
      expect(hooksToml).toContain("codex_hooks = true");
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("inserts codex_hooks after leading comments inside an existing [features] section", async () => {
    const workspaceRoot = await createWorkspace("goodmemory-host-bootstrap-commented-features-");

    try {
      await mkdir(join(workspaceRoot, ".codex"), { recursive: true });
      await writeFile(
        join(workspaceRoot, ".codex/config.toml"),
        [
          "[features]",
          "# keep this comment",
          "",
          "experimental_feature = true",
          "",
          "[profiles.default]",
          'sandbox = "workspace-write"',
          "",
        ].join("\n"),
        "utf8",
      );

      await bootstrapHostWorkspace({
        host: "codex",
        userId: "codex-user",
        workspaceRoot,
      });

      const hooksToml = await readFile(join(workspaceRoot, ".codex/config.toml"), "utf8");
      expect(hooksToml).toContain("[features]");
      expect(hooksToml).toContain("# keep this comment");
      expect(hooksToml).toContain("codex_hooks = true");
      expect(hooksToml.indexOf("codex_hooks = true")).toBeGreaterThan(
        hooksToml.indexOf("# keep this comment"),
      );
      expect(hooksToml.indexOf("codex_hooks = true")).toBeLessThan(
        hooksToml.indexOf("experimental_feature = true"),
      );
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });
});
